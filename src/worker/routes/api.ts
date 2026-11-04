import { Hono } from 'hono';
import type { AppEnv, ServiceContext } from '../env';
import { requireAuth, requireAdmin, getClientIp } from '../middleware/auth';
import { ProductsService } from '../services/products.service';
import { StockService } from '../services/stock.service';
import { SalesService } from '../services/sales.service';
import { AlertsService } from '../services/alerts.service';
import { DashboardService } from '../services/dashboard.service';
import { SettingsService } from '../services/settings.service';
import { ImportExportService } from '../services/import-export.service';
import { InvoicesService } from '../services/invoices.service';
import { Errors, parseOrThrow } from '../lib/errors';
import {
  productCreateSchema,
  productUpdateSchema,
  productListQuerySchema,
  stockEntrySchema,
  stockAdjustmentSchema,
  movementListQuerySchema,
  saleCreateSchema,
  saleVoidSchema,
  saleReturnSchema,
  saleListQuerySchema,
  alertsQuerySchema,
  settingsSchema,
  paymentMethodSchema,
  userCreateSchema,
  userUpdateSchema,
  importRequestSchema,
  invoiceConfirmRequestSchema,
} from '../../shared/schemas';

export const apiRoutes = new Hono<AppEnv>();

// Todas las rutas bajo /api requieren autenticación (excepto /auth que está separada)
apiRoutes.use('*', requireAuth);

function createCtx(c: any): ServiceContext {
  return {
    db: c.env.DB,
    user: c.get('user'),
    ip: getClientIp(c),
    geminiApiKey: c.env.GEMINI_API_KEY,
    geminiModel: c.env.GEMINI_MODEL,
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
apiRoutes.get('/dashboard', async (c) => {
  const service = new DashboardService(createCtx(c));
  const data = await service.getDashboardData();
  return c.json(data);
});

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
apiRoutes.get('/alerts/summary', async (c) => {
  const service = new AlertsService(createCtx(c));
  const summary = await service.getSummary();
  return c.json(summary);
});

apiRoutes.get('/alerts', async (c) => {
  const query = parseOrThrow(alertsQuerySchema, c.req.query());
  const service = new AlertsService(createCtx(c));
  const data = await service.listAlerts(query);
  return c.json(data);
});

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
apiRoutes.get('/products', async (c) => {
  const query = parseOrThrow(productListQuerySchema, c.req.query());
  const service = new ProductsService(createCtx(c));
  const data = await service.list(query);
  return c.json(data);
});

apiRoutes.get('/products/by-code/:code', async (c) => {
  const code = c.req.param('code');
  const service = new ProductsService(createCtx(c));
  const product = await service.getByCode(code);
  if (!product) {
    return c.json({ found: false, product: null });
  }
  return c.json({ found: true, product });
});

apiRoutes.get('/products/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new ProductsService(createCtx(c));
  const product = await service.getById(id);
  return c.json(product);
});

apiRoutes.post('/products', requireAdmin, async (c) => {
  const body = parseOrThrow(productCreateSchema, await c.req.json());
  const service = new ProductsService(createCtx(c));
  const created = await service.create(body);
  return c.json(created, 201);
});

apiRoutes.put('/products/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(productUpdateSchema, await c.req.json());
  const service = new ProductsService(createCtx(c));
  const updated = await service.update(id, body);
  return c.json(updated);
});

apiRoutes.post('/products/:id/activate', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const service = new ProductsService(createCtx(c));
  const updated = await service.setActive(id, true);
  return c.json(updated);
});

apiRoutes.post('/products/:id/deactivate', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const service = new ProductsService(createCtx(c));
  const updated = await service.setActive(id, false);
  return c.json(updated);
});

// ---------------------------------------------------------------------------
// Movimientos de stock
// ---------------------------------------------------------------------------
apiRoutes.get('/movements', async (c) => {
  const query = parseOrThrow(movementListQuerySchema, c.req.query());
  const service = new StockService(createCtx(c));
  const data = await service.list(query);
  return c.json(data);
});

apiRoutes.get('/products/:id/movements', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new StockService(createCtx(c));
  const data = await service.list({ productId: id, pageSize: 50 });
  return c.json(data);
});

apiRoutes.post('/stock/entries', requireAdmin, async (c) => {
  const body = parseOrThrow(stockEntrySchema, await c.req.json());
  const service = new StockService(createCtx(c));
  const result = await service.registerEntry(body);
  return c.json(result, 201);
});

apiRoutes.post('/stock/adjustments', requireAdmin, async (c) => {
  const body = parseOrThrow(stockAdjustmentSchema, await c.req.json());
  const service = new StockService(createCtx(c));
  const result = await service.registerAdjustment(body);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// POS & Ventas
// ---------------------------------------------------------------------------
apiRoutes.post('/sales', async (c) => {
  const body = parseOrThrow(saleCreateSchema, await c.req.json());
  const service = new SalesService(createCtx(c));
  const sale = await service.createSale(body);
  return c.json(sale, 201);
});

apiRoutes.get('/sales', async (c) => {
  const query = parseOrThrow(saleListQuerySchema, c.req.query());
  const service = new SalesService(createCtx(c));
  const data = await service.listSales(query);
  return c.json(data);
});

apiRoutes.get('/sales/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new SalesService(createCtx(c));
  const sale = await service.getSaleById(id);
  if (!sale) return c.json({ error: { code: 'NOT_FOUND', message: 'Venta no encontrada.' } }, 404);
  return c.json(sale);
});

apiRoutes.post('/sales/:id/void', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(saleVoidSchema, await c.req.json());
  const service = new SalesService(createCtx(c));
  const sale = await service.voidSale(id, body.idempotencyKey, body.reason);
  return c.json(sale);
});

apiRoutes.post('/sales/:id/returns', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(saleReturnSchema, await c.req.json());
  const service = new SalesService(createCtx(c));
  const sale = await service.returnItems(id, body.idempotencyKey, body.reason, body.items);
  return c.json(sale);
});

// ---------------------------------------------------------------------------
// Configuración y medios de pago
// ---------------------------------------------------------------------------
apiRoutes.get('/settings', async (c) => {
  const service = new SettingsService(createCtx(c));
  const settings = await service.getSettings();
  return c.json(settings);
});

apiRoutes.put('/settings', requireAdmin, async (c) => {
  const body = parseOrThrow(settingsSchema, await c.req.json());
  const service = new SettingsService(createCtx(c));
  const settings = await service.updateSettings(body);
  return c.json(settings);
});

apiRoutes.get('/payment-methods', async (c) => {
  const service = new SettingsService(createCtx(c));
  const methods = await service.listPaymentMethods();
  return c.json(methods);
});

apiRoutes.post('/payment-methods', requireAdmin, async (c) => {
  const body = parseOrThrow(paymentMethodSchema, await c.req.json());
  const service = new SettingsService(createCtx(c));
  const created = await service.createPaymentMethod(body.name, body.sortOrder);
  return c.json(created, 201);
});

apiRoutes.put('/payment-methods/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(paymentMethodSchema.partial(), await c.req.json());
  const service = new SettingsService(createCtx(c));
  await service.updatePaymentMethod(id, body);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------
apiRoutes.get('/users', requireAdmin, async (c) => {
  const service = new SettingsService(createCtx(c));
  const users = await service.listUsers();
  return c.json(users);
});

apiRoutes.post('/users', requireAdmin, async (c) => {
  const body = parseOrThrow(userCreateSchema, await c.req.json());
  const service = new SettingsService(createCtx(c));
  const newId = await service.createUser(body);
  return c.json({ id: newId, username: body.username, displayName: body.displayName, role: body.role }, 201);
});

apiRoutes.put('/users/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(userUpdateSchema, await c.req.json());
  const service = new SettingsService(createCtx(c));
  await service.updateUser(id, body);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Importación y Exportación
// ---------------------------------------------------------------------------
apiRoutes.post('/imports/products/preview', requireAdmin, async (c) => {
  const body = parseOrThrow(importRequestSchema, await c.req.json());
  const service = new ImportExportService(createCtx(c));
  const preview = await service.previewImport(body.rows);
  return c.json(preview);
});

apiRoutes.post('/imports/products/commit', requireAdmin, async (c) => {
  const body = parseOrThrow(importRequestSchema, await c.req.json());
  const service = new ImportExportService(createCtx(c));
  const result = await service.commitImport({
    rows: body.rows,
    updateExisting: body.updateExisting,
    skipInvalid: body.skipInvalid,
  });
  return c.json(result);
});

apiRoutes.get('/exports/products.csv', requireAdmin, async (c) => {
  const service = new ImportExportService(createCtx(c));
  const csv = await service.exportProductsCsv();
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="productos-rodamientos-hugo.csv"',
    },
  });
});

apiRoutes.get('/exports/movements.csv', requireAdmin, async (c) => {
  const productId = c.req.query('productId') ? Number(c.req.query('productId')) : undefined;
  const service = new ImportExportService(createCtx(c));
  const csv = await service.exportMovementsCsv(productId);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="movimientos-stock-rodamientos-hugo.csv"',
    },
  });
});

// ---------------------------------------------------------------------------
// Facturas de proveedores (Ingreso inteligente con IA)
// ---------------------------------------------------------------------------
apiRoutes.post('/invoices/parse', requireAdmin, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    throw Errors.badRequest('Debes subir un archivo PDF de factura (campo "file").');
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw Errors.badRequest('El archivo debe ser un documento PDF (.pdf).');
  }

  const bytes = await file.arrayBuffer();

  // Soporte de mock inyectado para tests automatizados rápidos
  let mockHeader: any = undefined;
  const testHeaderRaw = c.req.header('x-test-invoice-data');
  if (testHeaderRaw) {
    try {
      mockHeader = JSON.parse(testHeaderRaw);
    } catch {
      // Ignorar si no es JSON válido
    }
  }

  const service = new InvoicesService(createCtx(c));
  const result = await service.parseAndMatch(bytes, mockHeader);
  return c.json(result);
});

apiRoutes.post('/invoices/confirm', requireAdmin, async (c) => {
  const body = parseOrThrow(invoiceConfirmRequestSchema, await c.req.json());
  const service = new InvoicesService(createCtx(c));
  const result = await service.confirmIntake(body);
  return c.json(result, 201);
});

apiRoutes.get('/invoices', requireAdmin, async (c) => {
  const page = c.req.query('page') ? Number(c.req.query('page')) : 1;
  const pageSize = c.req.query('pageSize') ? Number(c.req.query('pageSize')) : 20;
  const service = new InvoicesService(createCtx(c));
  const data = await service.listInvoices({ page, pageSize });
  return c.json(data);
});

apiRoutes.get('/invoices/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const service = new InvoicesService(createCtx(c));
  const data = await service.getInvoiceById(id);
  return c.json(data);
});
