import { Hono } from 'hono';
import type { AppEnv } from './env';
import { AppError } from './lib/errors';
import { csrfProtection, sessionMiddleware } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { apiRoutes } from './routes/api';

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Manejo centralizado de errores
// ---------------------------------------------------------------------------
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details ?? null,
        },
      },
      err.status,
    );
  }

  // Detección específica de límite diario del plan gratuito de Cloudflare D1
  const errMsg = err instanceof Error ? err.message : String(err);
  if (errMsg.includes("exceeded D1's free tier daily")) {
    console.error('[D1_QUOTA_EXCEEDED]', errMsg);
    return c.json(
      {
        error: {
          code: 'D1_QUOTA_EXCEEDED',
          message:
            'Se alcanzó el límite diario gratuito de lecturas de Cloudflare D1 (5M filas/día tras la carga masiva de hoy). Se restablece automáticamente a las 21:00 hs (00:00 UTC) o al pasar a Cloudflare Workers Paid (USD 5/mes).',
        },
      },
      503,
    );
  }

  // Error inesperado
  console.error('[UNHANDLED_ERROR]', err);
  const isDev = c.env?.APP_ENV !== 'production';
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev && err instanceof Error ? `${err.name}: ${err.message}` : 'Ocurrió un error inesperado en el servidor. Por favor, reintentá.',
        stack: isDev && err instanceof Error ? err.stack : undefined,
      },
    },
    500,
  );
});

// Middleware transversal
app.use('*', csrfProtection);
app.use('*', sessionMiddleware);

// Rutas de API
app.route('/api/auth', authRoutes);
app.route('/api', apiRoutes);

// Manejo de frontend SPA: si la petición no comienza con /api, se atiende con static assets
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Rodamientos Hugo — API activa. Frontend no encontrado.', 404);
});

export default app;
