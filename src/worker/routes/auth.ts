import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from '../env';
import { loginSchema, setupSchema } from '../../shared/schemas';
import { parseOrThrow, Errors } from '../lib/errors';
import { hashPassword, verifyPassword, randomToken, sha256Hex, DUMMY_PASSWORD_HASH, safeEqualStrings } from '../lib/crypto';
import { auditStmt, nowIso } from '../lib/db';
import { getClientIp, SESSION_COOKIE_NAME, requireAuth } from '../middleware/auth';

export const authRoutes = new Hono<AppEnv>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

authRoutes.get('/status', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>();
  const initialized = (row?.total ?? 0) > 0;
  return c.json({ initialized });
});

authRoutes.post('/setup', async (c) => {
  const body = parseOrThrow(setupSchema, await c.req.json());

  // Verificar que el sistema no esté ya inicializado
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>();
  if ((countRow?.total ?? 0) > 0) {
    throw Errors.badRequest('El sistema ya fue inicializado. No es posible ejecutar la configuración inicial.', 'ALREADY_INITIALIZED');
  }

  // Verificar token de setup provisto en env o secreto
  const configuredToken = c.env.SETUP_TOKEN;
  if (!configuredToken || !safeEqualStrings(configuredToken, body.token)) {
    throw Errors.forbidden('El token de configuración provisto es incorrecto o no está configurado en el servidor.');
  }

  const passwordHash = await hashPassword(body.password);
  const now = nowIso();
  const ip = getClientIp(c);

  const insertUser = c.env.DB.prepare(
    `INSERT INTO users (username, display_name, password_hash, role, active, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', 1, ?, ?)`,
  ).bind(body.username, body.displayName, passwordHash, now, now);

  const res = await insertUser.run();
  const userId = res.meta.last_row_id;

  await auditStmt({ db: c.env.DB, user: { id: userId }, ip }, 'user.setup_initial_admin', 'users', userId, {
    username: body.username,
  }).run();

  return c.json({ success: true, message: 'Administrador inicial creado correctamente.' }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = parseOrThrow(loginSchema, await c.req.json());
  const now = nowIso();
  const ip = getClientIp(c);

  const user = await c.env.DB.prepare(
    `SELECT id, username, display_name, password_hash, role, active, failed_attempts, locked_until
     FROM users
     WHERE username = ?`,
  )
    .bind(body.username)
    .first<{
      id: number;
      username: string;
      display_name: string;
      password_hash: string;
      role: 'admin' | 'seller';
      active: number;
      failed_attempts: number;
      locked_until: string | null;
    }>();

  if (!user) {
    // Para mitigar ataques de temporización, ejecutamos una verificación con hash ficticio
    await verifyPassword(body.password, DUMMY_PASSWORD_HASH);
    throw Errors.unauthorized();
  }

  if (user.active !== 1) {
    throw Errors.forbidden('Tu cuenta está desactivada. Consultá con el administrador.');
  }

  // Verificar bloqueo por intentos fallidos
  if (user.locked_until && user.locked_until > now) {
    throw Errors.forbidden('Demasiados intentos fallidos. Cuenta temporalmente bloqueada. Intentá más tarde.');
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    const attempts = user.failed_attempts + 1;
    let lockUntil: string | null = null;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockDate = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      lockUntil = lockDate.toISOString();
    }
    await c.env.DB.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
      .bind(attempts, lockUntil, user.id)
      .run();

    throw Errors.unauthorized();
  }

  // Si fue exitoso, resetear intentos fallidos
  if (user.failed_attempts > 0 || user.locked_until) {
    await c.env.DB.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?')
      .bind(user.id)
      .run();
  }

  // Crear sesión
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const ttlHours = Number(c.env.SESSION_TTL_HOURS) || 12;
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  const userAgent = c.req.header('user-agent')?.substring(0, 200) || null;

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(tokenHash, user.id, expiresAt, now, now, userAgent)
    .run();

  // Setear cookie HttpOnly SameSite=Strict
  setCookie(c, SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: c.req.url.startsWith('https://'),
    sameSite: 'Strict',
    maxAge: ttlHours * 3600,
  });

  await auditStmt({ db: c.env.DB, user: { id: user.id }, ip }, 'auth.login', 'users', user.id).run();

  return c.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    },
    token, // También se entrega en JSON por si el cliente necesita enviarlo como Bearer
  });
});

authRoutes.post('/logout', async (c) => {
  const sessionId = c.get('sessionId');
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ success: true });
});

authRoutes.get('/me', (c) => {
  const user = c.get('user') || null;
  return c.json({ user });
});
