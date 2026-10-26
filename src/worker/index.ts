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

  // Error inesperado
  console.error('[UNHANDLED_ERROR]', err);
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado en el servidor. Por favor, reintentá.',
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
