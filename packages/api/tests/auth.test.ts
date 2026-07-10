import { describe, expect, it } from 'vitest';
import { TestClient, VALID_PASSWORD, registerPayload, testApp } from './helpers';

const LOGIN_MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

describe('registro', () => {
  it('crea la cuenta y devuelve el usuario sin datos sensibles', async () => {
    const { app } = testApp();
    const client = new TestClient(app);

    const res = await client.post('/api/auth/register', registerPayload('sofi'));
    const body = (await res.json()) as { user: Record<string, unknown> };

    expect(res.status).toBe(201);
    expect(body.user).toMatchObject({ alias: 'sofi', isAdmin: false });
    expect(JSON.stringify(body)).not.toContain('$argon2');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.user).not.toHaveProperty('securityAnswerHash');
  });

  it('rechaza un alias ya tomado aunque cambie el case', async () => {
    const { app } = testApp();
    await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    const res = await new TestClient(app).post('/api/auth/register', registerPayload('SOFI'));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('rechaza el registro cuando se alcanzó MAX_USERS', async () => {
    const { app } = testApp({ authConfig: { maxUsers: 1 } });
    await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    const res = await new TestClient(app).post('/api/auth/register', registerPayload('braian'));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('rechaza el registro cuando REGISTER_ENABLED está apagado', async () => {
    const { app } = testApp({ authConfig: { registerEnabled: false } });

    const res = await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    expect(res.status).toBe(403);
  });

  it('marca como admin al alias configurado en ADMIN_ALIAS', async () => {
    const { app } = testApp({ authConfig: { adminAlias: 'braian' } });

    const admin = await new TestClient(app).post('/api/auth/register', registerPayload('braian'));
    const plain = await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    expect(((await admin.json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(true);
    expect(((await plain.json()) as { user: { isAdmin: boolean } }).user.isAdmin).toBe(false);
  });

  it('rechaza una contraseña más corta que el mínimo', async () => {
    const { app } = testApp();

    const res = await new TestClient(app).post(
      '/api/auth/register',
      registerPayload('sofi', { password: 'corta' }),
    );
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('login', () => {
  it('devuelve el mismo mensaje ante alias inexistente y contraseña incorrecta', async () => {
    const { app } = testApp();
    await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    const unknownAlias = await new TestClient(app).post('/api/auth/login', {
      alias: 'nadie',
      password: VALID_PASSWORD,
    });
    const badPassword = await new TestClient(app).post('/api/auth/login', {
      alias: 'sofi',
      password: 'otra-contrasena-larga',
    });

    const a = (await unknownAlias.json()) as { error: { message: string } };
    const b = (await badPassword.json()) as { error: { message: string } };

    expect(unknownAlias.status).toBe(401);
    expect(badPassword.status).toBe(401);
    expect(a.error.message).toBe(b.error.message);
  });

  it('bloquea la cuenta tras LOGIN_MAX_ATTEMPTS fallos, incluso con la contraseña correcta', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
      await client.post('/api/auth/login', { alias: 'sofi', password: 'incorrecta-y-larga' });
    }

    const res = await client.post('/api/auth/login', { alias: 'sofi', password: VALID_PASSWORD });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('deja entrar de nuevo cuando venció el bloqueo', async () => {
    let clock = 1_000_000;
    const { app } = testApp({ now: () => clock });
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
      await client.post('/api/auth/login', { alias: 'sofi', password: 'incorrecta-y-larga' });
    }
    clock += (LOCK_MINUTES + 1) * 60 * 1000;

    const res = await client.post('/api/auth/login', { alias: 'sofi', password: VALID_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('un login exitoso limpia el contador de intentos fallidos', async () => {
    const { app, db } = testApp();
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    await client.post('/api/auth/login', { alias: 'sofi', password: 'incorrecta-y-larga' });
    await client.post('/api/auth/login', { alias: 'sofi', password: VALID_PASSWORD });

    const row = db.prepare('SELECT failed_attempts FROM users WHERE alias = ?').get('sofi') as {
      failed_attempts: number;
    };
    expect(row.failed_attempts).toBe(0);
  });
});

describe('sesión', () => {
  it('/api/auth/me sin cookie de sesión responde 401', async () => {
    const { app } = testApp();

    const res = await new TestClient(app).get('/api/auth/me');
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('/api/auth/me con la sesión del registro devuelve el usuario', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    const res = await client.get('/api/auth/me');
    const body = (await res.json()) as { user: { alias: string } };

    expect(res.status).toBe(200);
    expect(body.user.alias).toBe('sofi');
  });

  it('una mutación sin header CSRF responde 403', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    const res = await client.post('/api/auth/logout', undefined, false);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('CSRF_INVALID');
  });

  it('logout invalida la sesión del lado del servidor', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    const logout = await client.post('/api/auth/logout');
    const after = await client.get('/api/auth/me');

    expect(logout.status).toBe(204);
    expect(after.status).toBe(401);
  });

  it('una sesión vencida deja de ser válida', async () => {
    let clock = 1_000_000;
    const { app } = testApp({ now: () => clock, authConfig: { sessionTtlDays: 1 } });
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    clock += 2 * 24 * 60 * 60 * 1000;
    const res = await client.get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});

describe('rate limit', () => {
  it('corta los intentos de login pasado el tope por minuto', async () => {
    const attemptsAllowed = 3;
    const { app } = testApp({ rateLimits: { auth: attemptsAllowed } });
    const client = new TestClient(app);

    const attempts = [];
    for (let i = 0; i <= attemptsAllowed; i++) {
      attempts.push(
        await client.post('/api/auth/login', { alias: 'sofi', password: 'x'.repeat(12) }),
      );
    }
    const last = attempts.at(-1);

    expect(last?.status).toBe(429);
    expect(last?.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('recuperación de contraseña', () => {
  it('devuelve la pregunta de seguridad del alias', async () => {
    const { app } = testApp();
    await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    const res = await new TestClient(app).get('/api/auth/recovery/sofi');
    const body = (await res.json()) as { question: string };

    expect(res.status).toBe(200);
    expect(body.question).toContain('mascota');
  });

  it('responde 404 neutro para un alias inexistente', async () => {
    const { app } = testApp();

    const res = await new TestClient(app).get('/api/auth/recovery/nadie');

    expect(res.status).toBe(404);
  });

  it('resetea la contraseña con la respuesta correcta, ignorando case y espacios', async () => {
    const { app } = testApp();
    await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    const reset = await new TestClient(app).post('/api/auth/recovery', {
      alias: 'sofi',
      answer: '  firulais  ',
      newPassword: 'contrasena-nueva-larga',
    });
    const login = await new TestClient(app).post('/api/auth/login', {
      alias: 'sofi',
      password: 'contrasena-nueva-larga',
    });

    expect(reset.status).toBe(200);
    expect(login.status).toBe(200);
  });

  it('rechaza una respuesta de seguridad incorrecta', async () => {
    const { app } = testApp();
    await new TestClient(app).post('/api/auth/register', registerPayload('sofi'));

    const res = await new TestClient(app).post('/api/auth/recovery', {
      alias: 'sofi',
      answer: 'Otro perro',
      newPassword: 'contrasena-nueva-larga',
    });

    expect(res.status).toBe(401);
  });

  it('resetear la contraseña cierra todas las sesiones abiertas', async () => {
    const { app } = testApp();
    const client = new TestClient(app);
    await client.post('/api/auth/register', registerPayload('sofi'));

    await new TestClient(app).post('/api/auth/recovery', {
      alias: 'sofi',
      answer: 'Firulais',
      newPassword: 'contrasena-nueva-larga',
    });
    const res = await client.get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});
