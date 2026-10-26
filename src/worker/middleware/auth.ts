import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv, SessionUser } from '../env';
import { sha256Hex } from '../lib/crypto';
import { Errors } from '../lib/errors';
import { nowIso } from '../lib/db';

export const SESSION_COOKIE_NAME = 'rh_session';

export function getClientIp(c: Context<AppEnv>): string | null {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

/**
 * Middleware CSRF: en mutaciones comprueba que el header Origin coincida con el host de la petición.
 */
export const csrfProtection: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const origin = c.req.header('origin');
    if (origin) {
      const url = new URL(c.req.url);
      const originUrl = new URL(origin);
      if (originUrl.host !== url.host) {
        throw Errors.forbidden('Petición rechazada por validación de origen (CSRF).');
      }
    }
  }
  await next();
};

/**
 * Middleware de sesión: resuelve el usuario a partir de la cookie HttpOnly o del header Authorization.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
  const authHeader = c.req.header('authorization');
  let token = cookieToken;

  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (token) {
    const tokenHash = await sha256Hex(token);
    const now = nowIso();

    const row = await c.env.DB.prepare(
      `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
              u.id AS user_id, u.username, u.display_name, u.role, u.active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
      .bind(tokenHash)
      .first<{
        session_id: string;
        expires_at: string;
        last_seen_at: string;
        user_id: number;
        username: string;
        display_name: string;
        role: 'admin' | 'seller';
        active: number;
      }>();

    if (row) {
      if (row.expires_at < now || row.active !== 1) {
        // Sesión expirada o usuario inactivo -> borrar sesión
        await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(tokenHash).run();
      } else {
        const user: SessionUser = {
          id: row.user_id,
          username: row.username,
          displayName: row.display_name,
          role: row.role,
        };
        c.set('user', user);
        c.set('sessionId', row.session_id);

        // Deslizar last_seen_at si pasó más de 5 minutos
        const lastSeen = new Date(row.last_seen_at).getTime();
        if (Date.now() - lastSeen > 5 * 60 * 1000) {
          c.executionCtx?.waitUntil?.(
            c.env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
              .bind(now, tokenHash)
              .run(),
          );
        }
      }
    }
  }

  await next();
};

/** Exige usuario autenticado */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    throw Errors.unauthorized();
  }
  await next();
};

/** Exige rol administrador */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    throw Errors.unauthorized();
  }
  if (user.role !== 'admin') {
    throw Errors.forbidden('Esta acción requiere permisos de Administrador.');
  }
  await next();
};
