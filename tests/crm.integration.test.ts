import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:workers';
import worker from '../src/worker';

const baseUrl = 'http://localhost';

describe('CRM & Analytics Integration Tests', () => {
  let adminCookie = '';
  let sellerCookie = '';
  let customerId = 0;
  let testProductId = 0;

  beforeAll(async () => {
    // 1. Setup admin
    const setupReq = new Request(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'cambiar-por-un-valor-aleatorio-largo',
        username: 'admin_crm',
        displayName: 'Administrador CRM',
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
        username: 'admin_crm',
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
        username: 'vendedor_crm',
        displayName: 'Vendedor CRM',
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
        username: 'vendedor_crm',
        password: 'PasswordVendedor123',
      }),
    });
    const sellerLoginRes = await worker.fetch(sellerLoginReq, env);
    expect(sellerLoginRes.status).toBe(200);
    const sellerSetCookie = sellerLoginRes.headers.get('set-cookie');
    sellerCookie = sellerSetCookie ? sellerSetCookie.split(';')[0] : '';

    // 5. Create a test product with known price and cost for profitability tests
    const prodSku = `CRM-TEST-${Date.now()}`;
    const createProdReq = new Request(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        sku: prodSku,
        name: 'Rodamiento Rueda Delantera SKF 6204-2RS',
        brand: 'SKF',
        unit: 'unidad',
        priceCents: 500000, // $5.000,00 venta
        costCents: 300000,  // $3.000,00 costo -> margen $2.000 (40%)
        initialStock: 50,
      }),
    });
    const createProdRes = await worker.fetch(createProdReq, env);
    expect(createProdRes.status).toBe(201);
    const prodData: any = await createProdRes.json();
    testProductId = prodData.id;
  });

  it('debe crear un nuevo cliente con vehículo asociado', async () => {
    const payload = {
      name: 'Transporte Al Sur S.R.L.',
      customerType: 'empresa',
      phone: '2944123456',
      cuit: '30-71122334-9',
      email: 'logistica@alsur.com.ar',
      city: 'San Carlos de Bariloche',
      notes: 'Cliente con flota de 5 camiones Scania y Ford Cargo',
      vehicles: [
        {
          brand: 'Scania',
          model: 'R450',
          year: 2021,
          plate: 'AE123XY',
          engine: '13L 450hp',
        },
      ],
    };

    const req = new Request(`${baseUrl}/api/crm/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify(payload),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);
    const data: any = await res.json();
    expect(data.id).toBeGreaterThan(0);
    expect(data.name).toBe('Transporte Al Sur S.R.L.');
    expect(data.customerType).toBe('empresa');
    expect(data.vehicles).toHaveLength(1);
    expect(data.vehicles[0].plate).toBe('AE123XY');
    customerId = data.id;
  });

  it('debe listar clientes y buscar por nombre o patente', async () => {
    // Búsqueda por patente de vehículo
    const req = new Request(`${baseUrl}/api/crm/customers?q=AE123XY`, {
      method: 'GET',
      headers: { Cookie: sellerCookie },
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(data.items.some((c: any) => c.name === 'Transporte Al Sur S.R.L.')).toBe(true);
  });

  it('debe agregar otro vehículo a la flota del cliente', async () => {
    const req = new Request(`${baseUrl}/api/crm/customers/${customerId}/vehicles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        brand: 'Ford',
        model: 'Cargo 1722',
        year: 2019,
        plate: 'AD999ZZ',
      }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);
    const data: any = await res.json();
    expect(data.plate).toBe('AD999ZZ');

    // Verificar en la ficha del cliente
    const getReq = new Request(`${baseUrl}/api/crm/customers/${customerId}`, {
      method: 'GET',
      headers: { Cookie: sellerCookie },
    });
    const getRes = await worker.fetch(getReq, env);
    expect(getRes.status).toBe(200);
    const profile: any = await getRes.json();
    expect(profile.vehicles).toHaveLength(2);
  });

  it('debe generar una venta asociada al cliente y calcular métricas de rentabilidad', async () => {
    // 1. Obtener medios de pago
    const pmReq = new Request(`${baseUrl}/api/payment-methods`, {
      headers: { Cookie: adminCookie },
    });
    const pmRes = await worker.fetch(pmReq, env);
    const pms: any = await pmRes.json();
    const pmId = pms[0].id;

    // 2. Realizar venta vinculada a customerId
    const saleReq = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        idempotencyKey: `crm_sale_test_${Date.now()}`,
        paymentMethodId: pmId,
        customerId,
        discountCents: 0,
        notes: 'Venta de mantenimiento de flota Transporte Al Sur',
        items: [
          {
            productId: testProductId,
            quantity: 2,
            expectedUnitPriceCents: 500000,
          },
        ],
      }),
    });

    const saleRes = await worker.fetch(saleReq, env);
    expect(saleRes.status).toBe(201);
    const saleData: any = await saleRes.json();
    expect(saleData.customerId).toBe(customerId);
    expect(saleData.items[0].unitCostCents).toBe(300000); // Costo histórico congelado en $3.000

    // 3. Consultar métricas del local (solo admin)
    const analyticsReq = new Request(`${baseUrl}/api/analytics/store?period=this_month`, {
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const analyticsRes = await worker.fetch(analyticsReq, env);
    expect(analyticsRes.status).toBe(200);
    const storeMetrics: any = await analyticsRes.json();
    expect(storeMetrics.revenueCents).toBeGreaterThanOrEqual(1000000); // $10.000
    expect(storeMetrics.costCents).toBeGreaterThanOrEqual(600000);     // $6.000
    expect(storeMetrics.grossProfitCents).toBeGreaterThanOrEqual(400000); // $4.000
    expect(storeMetrics.grossMarginPct).toBeGreaterThan(0);

    // 4. Verificar que un vendedor no pueda acceder a la rentabilidad financiera (403)
    const forbiddenReq = new Request(`${baseUrl}/api/analytics/store?period=this_month`, {
      method: 'GET',
      headers: { Cookie: sellerCookie },
    });
    const forbiddenRes = await worker.fetch(forbiddenReq, env);
    expect(forbiddenRes.status).toBe(403);
  });

  it('debe generar el enlace y mensaje de fidelización por WhatsApp para el cliente', async () => {
    const req = new Request(`${baseUrl}/api/crm/customers/${customerId}/whatsapp-message?intent=reactivation`, {
      method: 'GET',
      headers: { Cookie: sellerCookie },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.formattedPhone).toBe('5492944123456');
    expect(data.message).toContain('Transporte Al Sur S.R.L.');
    expect(data.whatsappUrl).toContain('https://wa.me/5492944123456?text=');
  });
});
