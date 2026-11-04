import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError, ZodType } from 'zod';

/** Error de aplicación con código estable para el cliente y mensaje en español. */
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Tenés que iniciar sesión para continuar.'),
  forbidden: (msg = 'No tenés permisos para realizar esta operación.') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (what = 'El recurso') => new AppError(404, 'NOT_FOUND', `${what} no existe.`),
  validation: (details: unknown, msg = 'Hay datos inválidos. Revisá los campos marcados.') =>
    new AppError(400, 'VALIDATION_ERROR', msg, details),
  conflict: (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details),
  badRequest: (msg: string, code = 'BAD_REQUEST') => new AppError(400, code, msg),
  internal: (msg = 'Error interno en el servidor.') => new AppError(500, 'INTERNAL_ERROR', msg),
};


export interface FieldIssue {
  path: string;
  message: string;
}

export function zodIssues(err: ZodError): FieldIssue[] {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** Valida datos con un esquema y lanza un 400 con el detalle de los campos si falla. */
export function parseOrThrow<T extends ZodType>(schema: T, data: unknown): import('zod').output<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw Errors.validation(zodIssues(r.error));
  return r.data;
}

function errorText(e: unknown): string {
  if (!e) return '';
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(' | ');
}

/** Detecta violaciones de restricción devueltas por D1/SQLite. */
export function isConstraintError(e: unknown, kind: 'UNIQUE' | 'CHECK' | 'FOREIGN KEY', hint?: string): boolean {
  const t = errorText(e);
  if (!t.includes(`${kind} constraint failed`)) return false;
  return hint ? t.includes(hint) : true;
}
