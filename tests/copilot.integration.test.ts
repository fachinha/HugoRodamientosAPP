import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:workers';
import worker from '../src/worker';
import { CopilotService } from '../src/worker/services/copilot.service';

const baseUrl = 'http://localhost';

describe('Copiloto Interno con IA Integration Tests', () => {
  let adminCookie = '';
  let sellerCookie = '';
  let sampleProductId = 0;

  beforeAll(async () => {
    // 1. Setup admin
    const setupReq = new Request(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'cambiar-por-un-valor-aleatorio-largo',
        username: 'admin_copilot',
        displayName: 'Administrador Copiloto',
        password: 'PasswordSuperSegura123',
      }),
    });
    const setupRes = await worker.fetch(setupReq, env);
    expect([201, 400]).toContain(setupRes.status);

    // 2. Login admin
    const adminLoginReq = new Request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin_copilot',
        password: 'PasswordSuperSegura123',
      }),
    });
    const adminLoginRes = await worker.fetch(adminLoginReq, env);
    expect(adminLoginRes.status).toBe(200);
    const setCookie = adminLoginRes.headers.get('set-cookie');
    adminCookie = setCookie ? setCookie.split(';')[0] : '';

    // 3. Create seller
    const createSellerReq = new Request(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        username: 'vendedor_copilot',
        displayName: 'Vendedor Copiloto',
        role: 'seller',
        password: 'PasswordVendedor123',
      }),
    });
    const createSellerRes = await worker.fetch(createSellerReq, env);
    expect([201, 400]).toContain(createSellerRes.status);

    // 4. Login seller
    const sellerLoginReq = new Request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'vendedor_copilot',
        password: 'PasswordVendedor123',
      }),
    });
    const sellerLoginRes = await worker.fetch(sellerLoginReq, env);
    expect(sellerLoginRes.status).toBe(200);
    const sellerSetCookie = sellerLoginRes.headers.get('set-cookie');
    sellerCookie = sellerSetCookie ? sellerSetCookie.split(';')[0] : '';

    // 5. Create a sample product for testing catalog queries
    const prodRes = await worker.fetch(
      new Request(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          sku: `COP6204-${Date.now()}`,
          name: 'Rulemán Rígido 6204 2RS ETM',
          brand: 'ETM',
          categoryName: 'Rulemanes',
          unit: 'unidad',
          costCents: 450000,
          priceCents: 900000,
          initialStock: 15,
          minStock: 4,
          barcodes: [],
        }),
      }),
      env,
    );
    expect([201, 400]).toContain(prodRes.status);
    if (prodRes.status === 201) {
      const data = (await prodRes.json()) as any;
      sampleProductId = data.id;
    }
  });

  it('POST /api/copilot/chat responde guía de facturas con acción de navegación', { timeout: 15000 }, async () => {
    const res = await worker.fetch(
      new Request(`${baseUrl}/api/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sellerCookie,
        },
        body: JSON.stringify({
          message: '¿Cómo hago para cargar una factura de proveedor?',
          currentRoute: '/pos',
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.reply).toBeDefined();
    expect(data.reply).toContain('factura');
    expect(Array.isArray(data.actions)).toBe(true);
    expect(data.actions.some((a: any) => a.type === 'NAVIGATE')).toBe(true);
    expect(Array.isArray(data.suggestedChips)).toBe(true);
  });

  it('POST /api/copilot/chat responde guía de presupuestos', { timeout: 15000 }, async () => {
    const res = await worker.fetch(
      new Request(`${baseUrl}/api/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sellerCookie,
        },
        body: JSON.stringify({
          message: '¿Cómo armo un presupuesto para enviar por WhatsApp?',
          currentRoute: '/quotes',
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.reply).toBeDefined();
    expect(data.reply.toLowerCase()).toContain('presupuesto');
  });

  it('POST /api/copilot/chat busca repuestos y propone acción de carrito de venta', { timeout: 15000 }, async () => {
    const res = await worker.fetch(
      new Request(`${baseUrl}/api/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sellerCookie,
        },
        body: JSON.stringify({
          message: '¿Hay stock de ruleman 6204 2RS?',
          currentRoute: '/pos',
        }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.reply).toBeDefined();
    expect(Array.isArray(data.actions)).toBe(true);
    // Should have ADD_TO_CART action or search results
    const addAction = data.actions.find((a: any) => a.type === 'ADD_TO_CART');
    if (addAction) {
      expect(addAction.payload.sku).toBeDefined();
      expect(addAction.payload.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it('CopilotService executeToolCall: search_catalog encuentra repuestos', async () => {
    const service = new CopilotService({
      db: env.DB,
      ip: '127.0.0.1',
      user: { id: 1, username: 'admin_copilot', displayName: 'Admin', role: 'admin' },
    });

    const clientActions: any[] = [];
    const result = await service.executeServerTool(
      'search_catalog',
      { query: '6204' },
      clientActions,
    );

    expect(result.foundCount).toBeGreaterThanOrEqual(1);
    expect(result.products.length).toBeGreaterThan(0);
    expect(clientActions.length).toBeGreaterThan(0);
    expect(clientActions[0].type).toBe('SEARCH_PRODUCT');
  });

  it('CopilotService executeToolCall: get_store_metrics bloquea a vendedores', async () => {
    const service = new CopilotService({
      db: env.DB,
      ip: '127.0.0.1',
      user: { id: 2, username: 'vendedor_copilot', displayName: 'Vendedor', role: 'seller' },
    });

    const clientActions: any[] = [];
    const result = await service.executeServerTool(
      'get_store_metrics',
      { period: 'month' },
      clientActions,
    );

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Administradores');
  });

  it('CopilotService executeToolCall: get_store_metrics permite a administradores', async () => {
    const service = new CopilotService({
      db: env.DB,
      ip: '127.0.0.1',
      user: { id: 1, username: 'admin_copilot', displayName: 'Admin', role: 'admin' },
    });

    const clientActions: any[] = [];
    const result = await service.executeServerTool(
      'get_store_metrics',
      { period: 'month' },
      clientActions,
    );

    expect(result.error).toBeUndefined();
    expect(result.revenueFormatted).toBeDefined();
    expect(result.salesCount).toBeDefined();
    expect(result.grossProfitFormatted).toBeDefined();
  });

  it('CopilotService executeToolCall: get_knowledge_guide devuelve guía de cómo armar presupuestos', async () => {
    const service = new CopilotService({
      db: env.DB,
      ip: '127.0.0.1',
      user: { id: 2, username: 'vendedor_copilot', displayName: 'Vendedor', role: 'seller' },
    });

    const clientActions: any[] = [];
    const result = await service.executeServerTool(
      'get_knowledge_guide',
      { topic: 'presupuestos' },
      clientActions,
    );

    expect(result.guide).toBeDefined();
    expect(result.guide).toContain('WhatsApp');
  });
});
