import type { Review, WineDetail, WineListItem } from '@bv/shared';
import { describe, expect, it } from 'vitest';
import type { DB } from '../src/db/connection';
import { catalogRepo } from '../src/repositories/catalogRepo';
import { TestClient, registerAndLogin, testApp } from './helpers';

function seedGrapes(db: DB): void {
  for (const name of ['Malbec', 'Cabernet Franc']) catalogRepo.findOrCreateGrape(db, name, 1);
}

const wineInput = {
  name: 'Nicasia Red Blend',
  type: 'tinto' as const,
  vintage: 2019,
  wineryName: 'Catena Zapata',
  grapeNames: ['Malbec'],
};

async function setupWine() {
  const { app, db } = testApp();
  seedGrapes(db);
  const braian = new TestClient(app);
  await registerAndLogin(braian, 'braian');
  const wine = (await (await braian.post('/api/wines', wineInput)).json()) as WineListItem;
  return { app, db, braian, wineId: wine.id };
}

describe('upsert de reseña', () => {
  it('crea la reseña con solo el puntaje global obligatorio', async () => {
    const { braian, wineId } = await setupWine();

    const res = await braian.put(`/api/wines/${wineId}/review`, { overall: 4 });
    const review = (await res.json()) as Review;

    expect(res.status).toBe(200);
    expect(review.overall).toBe(4);
    expect(review.taste).toBeNull();
  });

  it('el segundo PUT del mismo usuario actualiza, no duplica', async () => {
    const { braian, db, wineId } = await setupWine();

    await braian.put(`/api/wines/${wineId}/review`, { overall: 3 });
    await braian.put(`/api/wines/${wineId}/review`, { overall: 5, notes: 'mejor de lo que creí' });

    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE wine_id = ?').get(wineId) as { n: number }
    ).n;
    const detail = (await (await braian.get(`/api/wines/${wineId}`)).json()) as WineDetail;

    expect(count).toBe(1);
    expect(detail.reviews[0]?.overall).toBe(5);
  });

  it('rechaza overall = 0', async () => {
    const { braian, wineId } = await setupWine();
    const res = await braian.put(`/api/wines/${wineId}/review`, { overall: 0 });
    expect(res.status).toBe(400);
  });

  it('rechaza overall = 6', async () => {
    const { braian, wineId } = await setupWine();
    const res = await braian.put(`/api/wines/${wineId}/review`, { overall: 6 });
    expect(res.status).toBe(400);
  });

  it('persiste un eje omitido como NULL, no como 0', async () => {
    const { braian, db, wineId } = await setupWine();

    await braian.put(`/api/wines/${wineId}/review`, { overall: 4, taste: 5 });

    const row = db.prepare('SELECT taste, aroma FROM reviews WHERE wine_id = ?').get(wineId) as {
      taste: number | null;
      aroma: number | null;
    };
    expect(row.taste).toBe(5);
    expect(row.aroma).toBeNull();
  });

  it('rechaza una nota de más de 500 caracteres', async () => {
    const { braian, wineId } = await setupWine();
    const res = await braian.put(`/api/wines/${wineId}/review`, {
      overall: 3,
      notes: 'x'.repeat(501),
    });
    expect(res.status).toBe(400);
  });

  it('reseñar un vino borrado responde 404', async () => {
    const { braian, wineId } = await setupWine();
    await braian.del(`/api/wines/${wineId}`);

    const res = await braian.put(`/api/wines/${wineId}/review`, { overall: 4 });

    expect(res.status).toBe(404);
  });

  it('el user_id del body se ignora: la reseña se crea a nombre de la sesión', async () => {
    const { app, braian, wineId } = await setupWine();
    const sofi = new TestClient(app);
    const sofiId = await registerAndLogin(sofi, 'sofi');

    // sofi intenta reseñar haciéndose pasar por braian metiendo userId en el body.
    await sofi.put(`/api/wines/${wineId}/review`, { overall: 1, userId: 1, user_id: 1 });

    const detail = (await (await braian.get(`/api/wines/${wineId}`)).json()) as WineDetail;
    const theReview = detail.reviews.find((r) => r.overall === 1);
    expect(theReview?.author.id).toBe(sofiId);
  });
});

describe('agregados por eje', () => {
  it('el promedio de un eje ignora las reseñas que no lo puntuaron', async () => {
    const { app, braian, wineId } = await setupWine();
    const sofi = new TestClient(app);
    await registerAndLogin(sofi, 'sofi');

    // braian puntúa aroma 5; sofi no lo puntúa. El promedio debe ser 5, no 2.5.
    await braian.put(`/api/wines/${wineId}/review`, { overall: 5, aroma: 5 });
    await sofi.put(`/api/wines/${wineId}/review`, { overall: 4 });

    const detail = (await (await braian.get(`/api/wines/${wineId}`)).json()) as WineDetail;

    expect(detail.aggregates.avgAroma).toBe(5);
    expect(detail.aggregates.reviewCount).toBe(2);
  });

  it('un vino sin reseñas tiene avgOverall null, no 0', async () => {
    const { braian, wineId } = await setupWine();

    const detail = (await (await braian.get(`/api/wines/${wineId}`)).json()) as WineDetail;

    expect(detail.aggregates.avgOverall).toBeNull();
    expect(detail.aggregates.avgTaste).toBeNull();
  });
});

describe('autorización de reseñas', () => {
  it('un usuario no puede borrar la reseña de otro', async () => {
    const { app, braian, wineId } = await setupWine();
    await braian.put(`/api/wines/${wineId}/review`, { overall: 5 });

    const sofi = new TestClient(app);
    await registerAndLogin(sofi, 'sofi');
    // sofi no tiene reseña en ese vino → borrar da 404, nunca toca la de braian.
    const res = await sofi.del(`/api/wines/${wineId}/review`);

    const detail = (await (await braian.get(`/api/wines/${wineId}`)).json()) as WineDetail;
    expect(res.status).toBe(404);
    expect(detail.reviews).toHaveLength(1);
  });

  it('cada quien edita solo su propia reseña (upsert por usuario)', async () => {
    const { app, braian, wineId } = await setupWine();
    await braian.put(`/api/wines/${wineId}/review`, { overall: 5 });

    const sofi = new TestClient(app);
    await registerAndLogin(sofi, 'sofi');
    await sofi.put(`/api/wines/${wineId}/review`, { overall: 2 });

    const detail = (await (await braian.get(`/api/wines/${wineId}`)).json()) as WineDetail;
    const braianReview = detail.reviews.find((r) => r.author.alias === 'braian');
    const sofiReview = detail.reviews.find((r) => r.author.alias === 'sofi');

    expect(braianReview?.overall).toBe(5);
    expect(sofiReview?.overall).toBe(2);
  });
});

describe('mis reseñas', () => {
  it('lista los vinos que reseñé con el vino embebido', async () => {
    const { braian, wineId } = await setupWine();
    await braian.put(`/api/wines/${wineId}/review`, { overall: 4, notes: 'buenísimo' });

    const res = await braian.get('/api/me/reviews');
    const body = (await res.json()) as { items: { wine: { id: number }; notes: string }[] };

    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.wine.id).toBe(wineId);
    expect(body.items[0]?.notes).toBe('buenísimo');
  });
});
