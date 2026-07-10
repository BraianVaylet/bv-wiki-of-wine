import type { WineListItem } from '@bv/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogRepo } from '../src/repositories/catalogRepo';
import { TestClient, registerAndLogin, testApp } from './helpers';

const SEED_GRAPES = ['Malbec', 'Cabernet Franc', 'Chardonnay'];

interface WinesResponse {
  items: WineListItem[];
  nextCursor: string | null;
}

function seedGrapes(db: import('../src/db/connection').DB): void {
  for (const name of SEED_GRAPES) catalogRepo.findOrCreateGrape(db, name, 1);
}

const nicasia = {
  name: 'Nicasia Red Blend',
  type: 'tinto' as const,
  vintage: 2019,
  wineryName: 'Catena Zapata',
  grapeNames: ['Malbec', 'Cabernet Franc'],
};

describe('crear vino', () => {
  it('crea el vino con su bodega y uvas (find-or-create)', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');

    const res = await client.post('/api/wines', nicasia);
    const wine = (await res.json()) as WineListItem;

    expect(res.status).toBe(201);
    expect(wine.name).toBe('Nicasia Red Blend');
    expect(wine.winery?.name).toBe('Catena Zapata');
    expect(wine.grapes).toEqual(['Cabernet Franc', 'Malbec']);
    expect(wine.avgOverall).toBeNull();
    expect(wine.reviewCount).toBe(0);
  });

  it('rechaza el duplicado (nombre, bodega, cosecha) con 409 y el id existente', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const first = (await (await client.post('/api/wines', nicasia)).json()) as WineListItem;

    const res = await client.post('/api/wines', nicasia);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(first.id).toBeGreaterThan(0);
  });

  it('permite recrear un vino que fue borrado', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wine = (await (await client.post('/api/wines', nicasia)).json()) as WineListItem;

    await client.del(`/api/wines/${wine.id}`);
    const res = await client.post('/api/wines', nicasia);

    expect(res.status).toBe(201);
  });

  it('rechaza más de 5 uvas', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');

    const res = await client.post('/api/wines', {
      ...nicasia,
      grapeNames: ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'],
    });

    expect(res.status).toBe(400);
  });

  it('crea una uva nueva que no estaba en el catálogo', async () => {
    const { app, db } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');

    await client.post('/api/wines', { ...nicasia, grapeNames: ['Ancellotta rara'] });
    const grapes = catalogRepo.listGrapes(db);

    expect(grapes.some((g) => g.name === 'Ancellotta rara')).toBe(true);
  });

  it('si falla el insert de una uva, no queda el vino a medias (transacción)', async () => {
    const { app, db } = testApp();
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    // Rompemos wine_grapes para forzar un fallo después de insertar el vino.
    db.exec('DROP TABLE wine_grapes');

    const res = await client.post('/api/wines', nicasia);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM wines').get() as { n: number }).n;

    expect(res.status).toBe(500);
    expect(count).toBe(0);
  });
});

describe('listar vinos', () => {
  it('el borrado sale del listado pero conserva sus reseñas en la DB', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    const wine = (await (await client.post('/api/wines', nicasia)).json()) as WineListItem;
    await client.put(`/api/wines/${wine.id}/review`, { overall: 5 });

    await client.del(`/api/wines/${wine.id}`);
    const list = (await (await client.get('/api/wines')).json()) as WinesResponse;
    const reviewCount = (
      db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE wine_id = ?').get(wine.id) as {
        n: number;
      }
    ).n;

    expect(list.items).toHaveLength(0);
    expect(reviewCount).toBe(1);
  });

  it('filtra por tipo', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    await client.post('/api/wines', nicasia);
    await client.post('/api/wines', {
      name: 'Un Blanco',
      type: 'blanco',
      grapeNames: ['Chardonnay'],
    });

    const list = (await (await client.get('/api/wines?type=blanco')).json()) as WinesResponse;

    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.type).toBe('blanco');
  });

  it('marca reviewedByMe según quién pregunta', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const braian = new TestClient(app);
    await registerAndLogin(braian, 'braian');
    const wine = (await (await braian.post('/api/wines', nicasia)).json()) as WineListItem;
    await braian.put(`/api/wines/${wine.id}/review`, { overall: 4 });

    const sofi = new TestClient(app);
    await registerAndLogin(sofi, 'sofi');

    const mine = (await (await braian.get('/api/wines')).json()) as WinesResponse;
    const theirs = (await (await sofi.get('/api/wines')).json()) as WinesResponse;

    expect(mine.items[0]?.reviewedByMe).toBe(true);
    expect(theirs.items[0]?.reviewedByMe).toBe(false);
  });
});

describe('autorización de vinos', () => {
  let braianWineId = 0;

  async function setup() {
    const ctx = testApp();
    seedGrapes(ctx.db);
    const braian = new TestClient(ctx.app);
    await registerAndLogin(braian, 'braian');
    const wine = (await (await braian.post('/api/wines', nicasia)).json()) as WineListItem;
    braianWineId = wine.id;
    return ctx;
  }

  it('un usuario no puede editar un vino que no creó (403)', async () => {
    const { app } = await setup();
    const sofi = new TestClient(app);
    await registerAndLogin(sofi, 'sofi');

    const res = await sofi.patch(`/api/wines/${braianWineId}`, { name: 'Hackeado' });

    expect(res.status).toBe(403);
  });

  it('un usuario no puede borrar un vino ajeno (403)', async () => {
    const { app } = await setup();
    const sofi = new TestClient(app);
    await registerAndLogin(sofi, 'sofi');

    const res = await sofi.del(`/api/wines/${braianWineId}`);

    expect(res.status).toBe(403);
  });

  it('un admin sí puede editar un vino ajeno (200)', async () => {
    const ctx = testApp({ authConfig: { adminAlias: 'jefa' } });
    seedGrapes(ctx.db);
    const braian = new TestClient(ctx.app);
    await registerAndLogin(braian, 'braian');
    const wine = (await (await braian.post('/api/wines', nicasia)).json()) as WineListItem;

    const admin = new TestClient(ctx.app);
    await registerAndLogin(admin, 'jefa');
    const res = await admin.patch(`/api/wines/${wine.id}`, { name: 'Corregido' });

    expect(res.status).toBe(200);
  });

  it('una request sin sesión a /api/wines responde 401', async () => {
    const { app } = testApp();

    const res = await new TestClient(app).get('/api/wines');

    expect(res.status).toBe(401);
  });

  it('una mutación sin CSRF responde 403', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');

    const res = await client.post('/api/wines', nicasia, false);

    expect(res.status).toBe(403);
  });
});

describe('catálogo auxiliar', () => {
  beforeEach(() => {});

  it('sugiere bodegas por prefijo', async () => {
    const { app, db } = testApp();
    seedGrapes(db);
    const client = new TestClient(app);
    await registerAndLogin(client, 'braian');
    await client.post('/api/wines', nicasia);

    const res = await client.get('/api/wineries?query=cat');
    const wineries = (await res.json()) as { name: string }[];

    expect(wineries.some((w) => w.name === 'Catena Zapata')).toBe(true);
  });
});
