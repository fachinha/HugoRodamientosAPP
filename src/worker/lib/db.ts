import type { ServiceContext } from '../env';

export function nowIso(): string {
  return new Date().toISOString();
}

/** Sentencia de auditoría para incluir dentro de un batch atómico. */
export function auditStmt(
  ctx: Pick<ServiceContext, 'db' | 'ip'> & { user: { id: number } | null },
  action: string,
  entity: string | null,
  entityId: string | number | null,
  details?: unknown,
): D1PreparedStatement {
  return ctx.db
    .prepare(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      ctx.user?.id ?? null,
      action,
      entity,
      entityId === null ? null : String(entityId),
      details === undefined ? null : JSON.stringify(details),
      ctx.ip,
      nowIso(),
    );
}

/** Convierte 0/1 de SQLite a boolean. */
export const bool = (v: unknown): boolean => v === 1 || v === true;
