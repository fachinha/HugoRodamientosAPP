import type { Role } from '../shared/schemas';

/** Bindings del Worker (D1, variables y secretos). */
export interface Bindings {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_ENV: string;
  SESSION_TTL_HOURS: string;
  /** Secreto opcional para crear el primer administrador. */
  SETUP_TOKEN?: string;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    user: SessionUser;
    sessionId: string;
  };
}

/** Contexto mínimo que necesitan los servicios (desacoplado de Hono). */
export interface ServiceContext {
  db: D1Database;
  user: SessionUser;
  ip: string | null;
}
