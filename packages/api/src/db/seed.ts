import { hashSecret } from '../lib/hash';
import { now } from '../lib/time';
import { getDb } from './connection';
import { SEED_GRAPES } from './seedData';

/** Semillas idempotentes: uvas siempre; en dev, además usuarios y vinos demo. */
async function seed(): Promise<void> {
  const db = getDb();
  const ts = now();

  const insertGrape = db.prepare('INSERT OR IGNORE INTO grapes (name, created_at) VALUES (?, ?)');
  const seedGrapes = db.transaction(() => {
    for (const name of SEED_GRAPES) insertGrape.run(name, ts);
  });
  seedGrapes();
  console.log(`✅ ${SEED_GRAPES.length} uvas sembradas.`);

  if (process.env.NODE_ENV === 'production') {
    console.log('Producción: no se cargan datos demo.');
    return;
  }

  const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (userCount > 0) {
    console.log('Ya hay usuarios: se omiten los datos demo.');
    return;
  }

  await seedDemo(db, ts);
  console.log('✅ Datos demo cargados (usuarios braian / sofi, contraseña: vino-tinto-malbec).');
}

async function seedDemo(db: ReturnType<typeof getDb>, ts: number): Promise<void> {
  const passwordHash = await hashSecret('vino-tinto-malbec');
  const answerHash = await hashSecret('firulais');

  const insertUser = db.prepare(
    `INSERT INTO users (alias, password_hash, security_question_id, security_answer_hash, is_admin, created_at)
     VALUES (?, ?, 3, ?, ?, ?) RETURNING id`,
  );
  const braian = (insertUser.get('braian', passwordHash, answerHash, 1, ts) as { id: number }).id;
  const sofi = (insertUser.get('sofi', passwordHash, answerHash, 0, ts) as { id: number }).id;

  const winery = db.prepare(
    'INSERT INTO wineries (name, created_by, created_at) VALUES (?, ?, ?) RETURNING id',
  );
  const catena = (winery.get('Catena Zapata', braian, ts) as { id: number }).id;
  const norton = (winery.get('Norton', braian, ts) as { id: number }).id;

  const grapeId = (name: string): number =>
    (db.prepare('SELECT id FROM grapes WHERE name = ?').get(name) as { id: number }).id;

  const insertWine = db.prepare(
    `INSERT INTO wines (name, type, vintage, winery_id, country, region, created_by, created_at, updated_at)
     VALUES (@name, @type, @vintage, @wineryId, 'Argentina', 'Mendoza', @createdBy, @ts, @ts) RETURNING id`,
  );
  const linkGrape = db.prepare('INSERT INTO wine_grapes (wine_id, grape_id) VALUES (?, ?)');
  const insertReview = db.prepare(
    `INSERT INTO reviews (wine_id, user_id, overall, taste, aroma, body, value_for_money, notes, created_at, updated_at)
     VALUES (@wineId, @userId, @overall, @taste, @aroma, @body, @value, @notes, @ts, @ts)`,
  );

  const nicasia = (
    insertWine.get({
      name: 'Nicasia Red Blend',
      type: 'tinto',
      vintage: 2019,
      wineryId: catena,
      createdBy: braian,
      ts,
    }) as { id: number }
  ).id;
  linkGrape.run(nicasia, grapeId('Malbec'));
  linkGrape.run(nicasia, grapeId('Cabernet Franc'));
  insertReview.run({
    wineId: nicasia,
    userId: braian,
    overall: 5,
    taste: 5,
    aroma: 4,
    body: 4,
    value: 4,
    notes: 'El de nuestro aniversario.',
    ts,
  });
  insertReview.run({
    wineId: nicasia,
    userId: sofi,
    overall: 4,
    taste: 4,
    aroma: null,
    body: 3,
    value: null,
    notes: 'Rico pero algo caro.',
    ts,
  });

  const lote = (
    insertWine.get({
      name: 'Norton Lote Chardonnay',
      type: 'blanco',
      vintage: 2021,
      wineryId: norton,
      createdBy: sofi,
      ts,
    }) as { id: number }
  ).id;
  linkGrape.run(lote, grapeId('Chardonnay'));
  insertReview.run({
    wineId: lote,
    userId: sofi,
    overall: 3,
    taste: 3,
    aroma: 4,
    body: null,
    value: 5,
    notes: 'Fresco, para el verano.',
    ts,
  });
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed falló:', err);
    process.exit(1);
  });
