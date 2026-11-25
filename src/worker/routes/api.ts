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
  quoteCreateSchema,
  quoteUpdateSchema,
  quoteListQuerySchema,
  buildWhatsAppQuoteMessage,
  formatWhatsAppPhone,
} from '../../shared/schemas';
import { QuotesService } from '../services/quotes.service';
import { AnalyticsService } from '../services/analytics.service';
import { CrmService } from '../services/crm.service';
import { CopilotService } from '../services/copilot.service';
import { CatalogsService } from '../services/catalogs.service';
import { CurrentAccountsService } from '../services/current-accounts.service';
import { ReplenishmentService } from '../services/replenishment.service';
import { FinanceAndPadronService } from '../services/finance-and-padron.service';
import {
  customerCreateSchema,
  customerUpdateSchema,
  customerListQuerySchema,
  customerVehicleSchema,
  analyticsPeriodQuerySchema,
  buildCustomerWhatsAppMessage,
  copilotChatRequestSchema,
  supplierCatalogQuerySchema,
  exchangeRateUpdateSchema,
  officialAccountSchema,
  quoteFollowUpUpdateSchema,
  accountCommitmentCreateSchema,
  accountReceiptCreateSchema,
  depositCreateSchema,
  depositStatusUpdateSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
  productSupplierOptionSchema,
  purchaseOrderCreateSchema,
  purchaseOrderStatusUpdateSchema,
  cashflowEntryCreateSchema,
  paywayBankRuleSchema,
  paywayStatusUpdateSchema,
  automotivePadronCreateSchema,
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

apiRoutes.get('/alerts/data-quality', async (c) => {
  const service = new AlertsService(createCtx(c));
  const report = await service.getDataQualityReport();
  return c.json(report);
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

apiRoutes.post('/products/ai-describe', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as any;
  const service = new ProductsService(createCtx(c));
  const result = await service.generateAiDescription(body);
  return c.json(result);
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

apiRoutes.get('/settings/exchange-rate', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1';
  const service = new SettingsService(createCtx(c));
  const info = await service.getExchangeRateInfo(forceRefresh);
  return c.json(info);
});

apiRoutes.post('/settings/exchange-rate', requireAdmin, async (c) => {
  const body = parseOrThrow(exchangeRateUpdateSchema, await c.req.json());
  const service = new SettingsService(createCtx(c));
  const info = await service.setExchangeRate(body.rate, body.mode);
  return c.json(info);
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

apiRoutes.get('/official-accounts', requireAdmin, async (c) => {
  const service = new SettingsService(createCtx(c));
  const accounts = await service.listOfficialAccounts();
  return c.json(accounts);
});

apiRoutes.post('/official-accounts', requireAdmin, async (c) => {
  const body = parseOrThrow(officialAccountSchema, await c.req.json());
  const service = new SettingsService(createCtx(c));
  const id = await service.createOfficialAccount(body);
  return c.json({ id, ...body }, 201);
});

apiRoutes.delete('/official-accounts/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const service = new SettingsService(createCtx(c));
  await service.deleteOfficialAccount(id);
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

// ---------------------------------------------------------------------------
// Cotizaciones y Presupuestos de Repuestos
// ---------------------------------------------------------------------------
apiRoutes.post('/quotes', async (c) => {
  const body = parseOrThrow(quoteCreateSchema, await c.req.json());
  const service = new QuotesService(createCtx(c));
  const quote = await service.createQuote(body);
  return c.json(quote, 201);
});

apiRoutes.get('/quotes', async (c) => {
  const q = c.req.query('q');
  const status = (c.req.query('status') as any) || 'all';
  const followUpStatus = (c.req.query('followUpStatus') as any) || 'all';
  const from = c.req.query('from');
  const to = c.req.query('to');
  const page = c.req.query('page') ? Number(c.req.query('page')) : 1;
  const pageSize = c.req.query('pageSize') ? Number(c.req.query('pageSize')) : 20;

  const service = new QuotesService(createCtx(c));
  const data = await service.listQuotes({ q, status, followUpStatus, from, to, page, pageSize });
  return c.json(data);
});

apiRoutes.get('/quotes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new QuotesService(createCtx(c));
  const quote = await service.getQuoteById(id);
  if (!quote) throw Errors.notFound(`La cotización #${id}`);
  return c.json(quote);
});

apiRoutes.put('/quotes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(quoteUpdateSchema, await c.req.json());
  const service = new QuotesService(createCtx(c));
  const quote = await service.updateQuote(id, body);
  return c.json(quote);
});

apiRoutes.patch('/quotes/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const { status } = await c.req.json();
  if (!status) throw Errors.badRequest('Estado requerido.');
  const service = new QuotesService(createCtx(c));
  const quote = await service.updateStatus(id, status);
  return c.json(quote);
});

apiRoutes.patch('/quotes/:id/follow-up', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(quoteFollowUpUpdateSchema, await c.req.json());
  const service = new QuotesService(createCtx(c));
  const quote = await service.updateFollowUp(id, body);
  return c.json(quote);
});

apiRoutes.post('/quotes/:id/convert', async (c) => {
  const id = Number(c.req.param('id'));
  const { paymentMethodId } = await c.req.json();
  if (!paymentMethodId) throw Errors.badRequest('Debes seleccionar un medio de pago para convertir la cotización a venta.');
  const service = new QuotesService(createCtx(c));
  const result = await service.convertToSale(id, Number(paymentMethodId));
  return c.json(result);
});

apiRoutes.get('/quotes/:id/whatsapp', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new QuotesService(createCtx(c));
  const quote = await service.getQuoteById(id);
  if (!quote) throw Errors.notFound(`La cotización #${id}`);

  const message = buildWhatsAppQuoteMessage(quote);
  const rawPhone = quote.customerPhone;
  const formattedPhone = formatWhatsAppPhone(rawPhone);
  const waUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    : null;

  return c.json({
    phone: rawPhone,
    formattedPhone,
    message,
    whatsappUrl: waUrl,
  });
});

// ---------------------------------------------------------------------------
// Analítica de Rentabilidad y Rendimiento (Solo Admin)
// ---------------------------------------------------------------------------
apiRoutes.get('/analytics/store', requireAdmin, async (c) => {
  const query = parseOrThrow(analyticsPeriodQuerySchema, c.req.query());
  const service = new AnalyticsService(createCtx(c));
  const data = await service.getStorePerformance(query);
  return c.json(data);
});

apiRoutes.get('/analytics/products', requireAdmin, async (c) => {
  const query = parseOrThrow(analyticsPeriodQuerySchema, c.req.query());
  const page = Number(c.req.query('page')) || 1;
  const pageSize = Number(c.req.query('pageSize')) || 25;
  const sort = (c.req.query('sort') as any) || 'profit';
  const dir = (c.req.query('dir') as any) || 'desc';

  const service = new AnalyticsService(createCtx(c));
  const data = await service.getProductProfitability(query, { page, pageSize, sort, dir });
  return c.json(data);
});

apiRoutes.get('/analytics/export', requireAdmin, async (c) => {
  const query = parseOrThrow(analyticsPeriodQuerySchema, c.req.query());
  const service = new AnalyticsService(createCtx(c));
  const csv = await service.exportCsv(query);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rentabilidad_productos_${query.period}.csv"`,
    },
  });
});

// ---------------------------------------------------------------------------
// CRM y Gestión de Clientes
// ---------------------------------------------------------------------------
apiRoutes.get('/crm/customers', async (c) => {
  const query = parseOrThrow(customerListQuerySchema, c.req.query());
  const service = new CrmService(createCtx(c));
  const data = await service.listCustomers(query);
  return c.json(data);
});

apiRoutes.get('/crm/customers/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new CrmService(createCtx(c));
  const customer = await service.getCustomerById(id);
  if (!customer) throw Errors.notFound(`El cliente #${id}`);
  return c.json(customer);
});

apiRoutes.post('/crm/customers', async (c) => {
  const body = parseOrThrow(customerCreateSchema, await c.req.json());
  const service = new CrmService(createCtx(c));
  const customer = await service.createCustomer(body);
  return c.json(customer, 201);
});

apiRoutes.put('/crm/customers/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(customerUpdateSchema, await c.req.json());
  const service = new CrmService(createCtx(c));
  const customer = await service.updateCustomer(id, body);
  return c.json(customer);
});

apiRoutes.post('/crm/customers/:id/vehicles', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(customerVehicleSchema, await c.req.json());
  const service = new CrmService(createCtx(c));
  const vehicle = await service.addVehicle(id, body);
  return c.json(vehicle, 201);
});

apiRoutes.delete('/crm/vehicles/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new CrmService(createCtx(c));
  await service.deleteVehicle(id);
  return c.json({ ok: true });
});

apiRoutes.get('/crm/customers/:id/whatsapp-message', async (c) => {
  const id = Number(c.req.param('id'));
  const intent = (c.req.query('intent') as any) || 'direct';
  const extraContext = c.req.query('context');

  const service = new CrmService(createCtx(c));
  const customer = await service.getCustomerById(id);
  if (!customer) throw Errors.notFound(`El cliente #${id}`);

  const message = buildCustomerWhatsAppMessage(customer, intent, extraContext);
  const formattedPhone = formatWhatsAppPhone(customer.phone);
  const waUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    : null;

  return c.json({
    phone: customer.phone,
    formattedPhone,
    message,
    whatsappUrl: waUrl,
  });
});

// ---------------------------------------------------------------------------
// Copiloto Interno con Inteligencia Artificial
// ---------------------------------------------------------------------------
apiRoutes.post('/copilot/chat', async (c) => {
  const body = parseOrThrow(copilotChatRequestSchema, await c.req.json());
  const service = new CopilotService(createCtx(c));
  const response = await service.chat(body);
  return c.json(response);
});

// ---------------------------------------------------------------------------
// Catálogos Técnicos de Proveedores (Alfa Rodamientos)
// ---------------------------------------------------------------------------
apiRoutes.get('/catalogs/items', async (c) => {
  const query = parseOrThrow(supplierCatalogQuerySchema, c.req.query());
  const service = new CatalogsService(createCtx(c));
  const data = await service.list(query);
  return c.json(data);
});

apiRoutes.get('/catalogs/metadata', async (c) => {
  const service = new CatalogsService(createCtx(c));
  const data = await service.getMetadata();
  return c.json(data);
});

apiRoutes.post('/catalogs/ai-search', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { query?: string };
  const service = new CatalogsService(createCtx(c));
  const data = await service.aiSmartSearch(body.query || '');
  return c.json(data);
});

// ---------------------------------------------------------------------------
// Bloque 2: Clientes (Ficha 360°, Cuentas Corrientes, Señas y Seguimientos Atrasados)
// ---------------------------------------------------------------------------
apiRoutes.get('/clients/directory', async (c) => {
  const q = c.req.query('q');
  const filter = c.req.query('filter');
  const service = new CurrentAccountsService(createCtx(c));
  const data = await service.getClientsDirectory({ q, filter });
  return c.json(data);
});

apiRoutes.get('/clients/:id/profile', async (c) => {
  const id = Number(c.req.param('id'));
  const service = new CurrentAccountsService(createCtx(c));
  const data = await service.getClient360Profile(id);
  return c.json(data);
});

apiRoutes.get('/current-accounts', async (c) => {
  const q = c.req.query('q');
  const customerName = c.req.query('customerName');
  const movementType = c.req.query('movementType');
  const service = new CurrentAccountsService(createCtx(c));
  const data = await service.getAccountsOverview({ q, customerName, movementType });
  return c.json(data);
});

apiRoutes.post('/current-accounts/commitments', async (c) => {
  const body = parseOrThrow(accountCommitmentCreateSchema, await c.req.json());
  const service = new CurrentAccountsService(createCtx(c));
  const created = await service.createCommitment(body);
  return c.json(created, 201);
});

apiRoutes.post('/current-accounts/receipts', async (c) => {
  const body = parseOrThrow(accountReceiptCreateSchema, await c.req.json());
  const service = new CurrentAccountsService(createCtx(c));
  const created = await service.createReceipt(body);
  return c.json(created, 201);
});

apiRoutes.get('/deposits', async (c) => {
  const q = c.req.query('q');
  const status = c.req.query('status');
  const service = new CurrentAccountsService(createCtx(c));
  const data = await service.listDeposits({ q, status });
  return c.json(data);
});

apiRoutes.post('/deposits', async (c) => {
  const body = parseOrThrow(depositCreateSchema, await c.req.json());
  const service = new CurrentAccountsService(createCtx(c));
  const created = await service.createDeposit(body);
  return c.json(created, 201);
});

apiRoutes.patch('/deposits/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(depositStatusUpdateSchema, await c.req.json());
  const service = new CurrentAccountsService(createCtx(c));
  const updated = await service.updateDepositStatus(id, body);
  return c.json(updated);
});

// ---------------------------------------------------------------------------
// Bloque 3: Reposición y Pedidos a Proveedores (Habilitado para Hugo y Encargado de Salón)
// ---------------------------------------------------------------------------
apiRoutes.get('/replenishment/board', async (c) => {
  const date = c.req.query('date');
  const includeAlreadyCovered = c.req.query('includeAlreadyCovered') === '1';
  const service = new ReplenishmentService(createCtx(c));
  const data = await service.getReplenishmentBoard({ date, includeAlreadyCovered });
  return c.json(data);
});

apiRoutes.get('/replenishment/lookup', async (c) => {
  const q = c.req.query('q') || '';
  const service = new ReplenishmentService(createCtx(c));
  const data = await service.lookupProductsForOrder(q);
  return c.json(data);
});

apiRoutes.get('/suppliers', async (c) => {
  const service = new ReplenishmentService(createCtx(c));
  const list = await service.listSuppliers();
  return c.json(list);
});

apiRoutes.post('/suppliers', async (c) => {
  const body = parseOrThrow(supplierCreateSchema, await c.req.json());
  const service = new ReplenishmentService(createCtx(c));
  const created = await service.createSupplier(body);
  return c.json(created, 201);
});

apiRoutes.put('/suppliers/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(supplierUpdateSchema, await c.req.json());
  const service = new ReplenishmentService(createCtx(c));
  const updated = await service.updateSupplier(id, body);
  return c.json(updated);
});

apiRoutes.post('/suppliers/product-option', async (c) => {
  const body = parseOrThrow(productSupplierOptionSchema, await c.req.json());
  const service = new ReplenishmentService(createCtx(c));
  await service.upsertProductSupplierOption(body);
  return c.json({ ok: true });
});

apiRoutes.get('/purchase-orders', async (c) => {
  const service = new ReplenishmentService(createCtx(c));
  const orders = await service.listPurchaseOrders();
  return c.json(orders);
});

apiRoutes.post('/purchase-orders', async (c) => {
  const body = parseOrThrow(purchaseOrderCreateSchema, await c.req.json());
  const service = new ReplenishmentService(createCtx(c));
  const order = await service.createPurchaseOrder(body);
  return c.json(order, 201);
});

apiRoutes.patch('/purchase-orders/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(purchaseOrderStatusUpdateSchema, await c.req.json());
  const service = new ReplenishmentService(createCtx(c));
  const order = await service.updatePurchaseOrderStatus(id, body);
  return c.json(order);
});

// ---------------------------------------------------------------------------
// Bloque 4: Cash Flow tipo Excel, Conciliación Payway (Días Pares/Impares), Agenda WhatsApp y Padrón Automotor
// ---------------------------------------------------------------------------
apiRoutes.get('/finance/cashflow', async (c) => {
  const service = new FinanceAndPadronService(createCtx(c));
  const data = await service.getCashflowGrid();
  return c.json(data);
});

apiRoutes.post('/finance/cashflow', async (c) => {
  const body = parseOrThrow(cashflowEntryCreateSchema, await c.req.json());
  const service = new FinanceAndPadronService(createCtx(c));
  await service.createCashflowEntry(body);
  return c.json({ ok: true }, 201);
});

apiRoutes.get('/finance/payway', async (c) => {
  const service = new FinanceAndPadronService(createCtx(c));
  const data = await service.getPaywayOverview();
  return c.json(data);
});

apiRoutes.put('/finance/payway/bank-rules', async (c) => {
  const body = parseOrThrow(paywayBankRuleSchema, await c.req.json());
  const service = new FinanceAndPadronService(createCtx(c));
  const rules = await service.updateBankRules(body);
  return c.json(rules);
});

apiRoutes.patch('/finance/payway/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = parseOrThrow(paywayStatusUpdateSchema, await c.req.json());
  const service = new FinanceAndPadronService(createCtx(c));
  await service.updatePaywayStatus(id, body);
  return c.json({ ok: true });
});

apiRoutes.get('/whatsapp-agenda', async (c) => {
  const service = new FinanceAndPadronService(createCtx(c));
  const list = await service.getWhatsAppAgenda();
  return c.json(list);
});

apiRoutes.get('/automotive-padron', async (c) => {
  const service = new FinanceAndPadronService(createCtx(c));
  const data = await service.getAutomotivePadronAndCompanies();
  return c.json(data);
});

apiRoutes.post('/automotive-padron', async (c) => {
  const body = parseOrThrow(automotivePadronCreateSchema, await c.req.json());
  const service = new FinanceAndPadronService(createCtx(c));
  const created = await service.createAutomotivePadronEntry(body);
  return c.json(created, 201);
});

