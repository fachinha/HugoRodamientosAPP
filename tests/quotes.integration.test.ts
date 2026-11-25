import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:workers';
import worker from '../src/worker';
import { buildMailtoQuoteUrl, buildGmailComposeQuoteUrl, type QuoteCreateInput } from '../src/shared/quotes';

const baseUrl = 'http://localhost';

describe('Quotes & Presupuestos Integration Tests', () => {
  let sellerCookie = '';
  let paymentMethodId = 1;
  let testProductId = 0;

  beforeAll(async () => {
    // 1. Setup admin
    const setupReq = new Request(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'cambiar-por-un-valor-aleatorio-largo',
        username: 'admin_quotes',
        displayName: 'Administrador Cotizador',
        password: 'PasswordSuperSegura123',
      }),
    });
    const setupRes = await worker.fetch(setupReq, env);
    expect([201, 400]).toContain(setupRes.status);

    // 2. Login as admin
    const loginReq = new Request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin_quotes',
        password: 'PasswordSuperSegura123',
      }),
    });
    const loginRes = await worker.fetch(loginReq, env);
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie');
    const adminCookie = setCookie ? setCookie.split(';')[0] : '';

    // 3. Create seller
    const createSellerReq = new Request(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        username: 'vendedor_manuel',
        displayName: 'Manuel Sayago',
        role: 'seller',
        password: 'PasswordVendedor456',
      }),
    });
    const createSellerRes = await worker.fetch(createSellerReq, env);
    expect([201, 400]).toContain(createSellerRes.status);

    // 4. Login as seller
    const sellerLoginReq = new Request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'vendedor_manuel',
        password: 'PasswordVendedor456',
      }),
    });
    const sellerLoginRes = await worker.fetch(sellerLoginReq, env);
    expect(sellerLoginRes.status).toBe(200);
    const sellerSetCookie = sellerLoginRes.headers.get('set-cookie');
    sellerCookie = sellerSetCookie ? sellerSetCookie.split(';')[0] : '';

    // 5. Create a test product
    const prodReq = new Request(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        sku: '6205-2RS-SKF',
        name: 'Rulemán SKF 6205 2RS',
        brand: 'SKF',
        unit: 'unidad',
        priceCents: 1500000, // $15.000,00
        costCents: 750000,
        initialStock: 10,
        minStock: 2,
      }),
    });
    const prodRes = await worker.fetch(prodReq, env);
    if (prodRes.status === 201) {
      const prodData = (await prodRes.json()) as any;
      testProductId = prodData.id;
    } else {
      const existingProd = await env.DB.prepare('SELECT id FROM products WHERE sku = ?')
        .bind('6205-2RS-SKF')
        .first<{ id: number }>();
      testProductId = existingProd?.id || 1;
    }

    // 6. Get payment methods
    const pmReq = new Request(`${baseUrl}/api/payment-methods`, {
      headers: { Cookie: adminCookie },
    });
    const pmRes = await worker.fetch(pmReq, env);
    const pms = (await pmRes.json()) as any[];
    if (pms.length > 0) {
      paymentMethodId = pms[0].id;
    }
  });

  it('creates a new quote with vehicle and client info, generating sequential COT- number', async () => {
    const quotePayload: QuoteCreateInput = {
      customerName: 'Aerolíneas Argentinas',
      customerPhone: '0294-15-4629707',
      customerCuit: '30-64140555-4',
      customerType: 'empresa',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Hilux 2.8',
      vehicleYear: 2021,
      vehicleEngine: '2.8 TDI',
      vehiclePlate: 'AF123BC',
      validDays: 5,
      includesTax: true,
      paymentTerms: 'Efectivo/Transferencia (dto.) - Tarjetas débito/crédito',
      notes: 'Baterías no entran en estado de cuenta corriente',
      items: [
        {
          productId: testProductId,
          sku: '6205-2RS-SKF',
          description: 'Rulemán SKF 6205 2RS',
          brand: 'SKF',
          unitPriceCents: 1500000, // $15.000
          quantity: 2,
          discountPct: 0,
          availability: 'in_stock',
        },
        {
          description: 'Batería Bosch S4 12x75',
          brand: 'Bosch',
          unitPriceCents: 22000000, // $220.000
          quantity: 1,
          discountPct: 0,
          availability: 'to_order',
        },
      ],
    };

    const req = new Request(`${baseUrl}/api/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify(quotePayload),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);

    const quote = (await res.json()) as any;
    expect(quote.id).toBeGreaterThan(0);
    expect(quote.quoteNumber).toMatch(/^COT-\d{5}$/);
    expect(quote.customerName).toBe('Aerolíneas Argentinas');
    expect(quote.vehiclePlate).toBe('AF123BC');
    expect(quote.userName).toBe('Manuel Sayago'); // Creado por el vendedor
    expect(quote.items.length).toBe(2);
    // Subtotal: 2 * 15.000 + 1 * 220.000 = 250.000 pesos = 25000000 centavos
    expect(quote.subtotalCents).toBe(25000000);
    expect(quote.totalCents).toBe(25000000);
    expect(quote.isExpired).toBe(false);
  });

  it('searches quotes by vehicle plate, customer name and quote number', async () => {
    // 1. Search by plate
    const reqPlate = new Request(`${baseUrl}/api/quotes?q=AF123BC`, {
      headers: { Cookie: sellerCookie },
    });
    const resPlate = await worker.fetch(reqPlate, env);
    expect(resPlate.status).toBe(200);
    const dataPlate = (await resPlate.json()) as any;
    expect(dataPlate.items.length).toBeGreaterThan(0);
    expect(dataPlate.items[0].vehiclePlate).toBe('AF123BC');

    // 2. Search by customer name
    const reqName = new Request(`${baseUrl}/api/quotes?q=Argentinas`, {
      headers: { Cookie: sellerCookie },
    });
    const resName = await worker.fetch(reqName, env);
    expect(resName.status).toBe(200);
    const dataName = (await resName.json()) as any;
    expect(dataName.items.length).toBeGreaterThan(0);
    expect(dataName.items[0].customerName).toContain('Aerolíneas');

    // 3. Search by quote number
    const reqNum = new Request(`${baseUrl}/api/quotes?q=COT-`, {
      headers: { Cookie: sellerCookie },
    });
    const resNum = await worker.fetch(reqNum, env);
    expect(resNum.status).toBe(200);
    const dataNum = (await resNum.json()) as any;
    expect(dataNum.items.length).toBeGreaterThan(0);
  });

  it('generates WhatsApp message and direct click-to-chat URL with normalized phone', async () => {
    // Obtenemos la última cotización
    const listReq = new Request(`${baseUrl}/api/quotes?pageSize=1`, {
      headers: { Cookie: sellerCookie },
    });
    const listRes = await worker.fetch(listReq, env);
    const listData = (await listRes.json()) as any;
    const quoteId = listData.items[0].id;

    const waReq = new Request(`${baseUrl}/api/quotes/${quoteId}/whatsapp`, {
      headers: { Cookie: sellerCookie },
    });
    const waRes = await worker.fetch(waReq, env);
    expect(waRes.status).toBe(200);

    const waData = (await waRes.json()) as any;
    // Verifica que el teléfono '0294-15-4629707' fue normalizado a '5492944629707'
    expect(waData.formattedPhone).toBe('5492944629707');
    expect(waData.whatsappUrl).toContain('https://wa.me/5492944629707?text=');
    expect(waData.message).toContain('Aerolíneas Argentinas');
    expect(waData.message).toContain('Toyota Hilux 2.8');
    expect(waData.message).toContain('AF123BC');
    expect(waData.message).toContain('250.000,00');
  });

  it('updates an existing quote and recalculates totals', async () => {
    const listReq = new Request(`${baseUrl}/api/quotes?pageSize=1`, {
      headers: { Cookie: sellerCookie },
    });
    const listRes = await worker.fetch(listReq, env);
    const listData = (await listRes.json()) as any;
    const quote = listData.items[0];

    const updatePayload = {
      ...quote,
      customerName: 'Aerolíneas Argentinas S.A.',
      validDays: 10,
      items: [
        ...quote.items,
        {
          description: 'Correa Poli V Michelin 6PK1820',
          brand: 'Michelin',
          unitPriceCents: 3300000, // $33.000
          quantity: 1,
          discountPct: 10, // 10% dto
          availability: 'in_stock',
        },
      ],
    };

    const updateReq = new Request(`${baseUrl}/api/quotes/${quote.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify(updatePayload),
    });

    const updateRes = await worker.fetch(updateReq, env);
    expect(updateRes.status).toBe(200);

    const updated = (await updateRes.json()) as any;
    expect(updated.customerName).toBe('Aerolíneas Argentinas S.A.');
    expect(updated.items.length).toBe(3);
    expect(updated.validDays).toBe(10);
  });

  it('converts quote to a completed sale in counter POS and blocks future edits', async () => {
    const listReq = new Request(`${baseUrl}/api/quotes?pageSize=1`, {
      headers: { Cookie: sellerCookie },
    });
    const listRes = await worker.fetch(listReq, env);
    const listData = (await listRes.json()) as any;
    const quoteId = listData.items[0].id;

    // Convertir a venta
    const convReq = new Request(`${baseUrl}/api/quotes/${quoteId}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({ paymentMethodId }),
    });

    const convRes = await worker.fetch(convReq, env);
    expect(convRes.status).toBe(200);

    const convData = (await convRes.json()) as any;
    expect(convData.saleId).toBeGreaterThan(0);
    expect(convData.quote.status).toBe('converted');
    expect(convData.quote.convertedSaleId).toBe(convData.saleId);

    // Intentar editar la cotización ya convertida debe ser rechazado
    const editReq = new Request(`${baseUrl}/api/quotes/${quoteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        ...convData.quote,
        customerName: 'Intento de modificar vendida',
      }),
    });
    const editRes = await worker.fetch(editReq, env);
    expect(editRes.status).toBe(400);
  });

  it('links customer profile 360 (account, quotes, deposits), builds email internal voucher, and flags overdue uncollected quotes', async () => {
    // 1. Dar de alta un nuevo cliente en Clientes
    const custRes = await worker.fetch(
      new Request(`${baseUrl}/api/crm/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sellerCookie },
        body: JSON.stringify({
          name: 'Taller Mecánico Nahuel Huapi',
          customerType: 'empresa',
          phone: '2944558899',
          cuit: '30-71223344-5',
          email: 'taller.nahuel@gmail.com',
          vehicles: [{ brand: 'Chevrolet', model: 'Corsa 1.6', year: 2012, plate: 'LKM456' }],
        }),
      }),
      env,
    );
    expect(custRes.status).toBe(201);
    const createdCustomer = (await custRes.json()) as any;
    expect(createdCustomer.id).toBeGreaterThan(0);

    // 2. Emitir un presupuesto vinculado a ese cliente y comprobar Comprobante Interno por Mail
    const qRes = await worker.fetch(
      new Request(`${baseUrl}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sellerCookie },
        body: JSON.stringify({
          customerId: createdCustomer.id,
          customerName: createdCustomer.name,
          customerPhone: createdCustomer.phone,
          customerCuit: createdCustomer.cuit,
          customerEmail: createdCustomer.email,
          customerType: 'empresa',
          vehicleBrand: 'Chevrolet',
          vehicleModel: 'Corsa 1.6',
          vehiclePlate: 'LKM456',
          validDays: 5,
          includesTax: true,
          paymentTerms: 'Cuenta corriente',
          items: [
            {
              productId: testProductId,
              sku: '6205-2RS-SKF',
              description: 'Rulemán SKF 6205 2RS',
              brand: 'SKF',
              unitPriceCents: 1500000,
              quantity: 2,
              discountPct: 0,
              availability: 'in_stock',
            },
          ],
        }),
      }),
      env,
    );
    expect(qRes.status).toBe(201);
    const savedQuote = (await qRes.json()) as any;
    expect(savedQuote.customerId).toBe(createdCustomer.id);

    const mailtoUrl = buildMailtoQuoteUrl(savedQuote);
    const gmailUrl = buildGmailComposeQuoteUrl(savedQuote);
    expect(mailtoUrl).toContain('mailto:taller.nahuel%40gmail.com?subject=');
    expect(gmailUrl).toContain('https://mail.google.com/mail/?view=cm');

    // 3. Registrar un retiro en cuenta corriente y una seña para ese cliente
    await worker.fetch(
      new Request(`${baseUrl}/api/current-accounts/commitments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sellerCookie },
        body: JSON.stringify({
          customerId: createdCustomer.id,
          customerName: createdCustomer.name,
          itemsSummary: '2x Rulemán SKF 6205',
          amountCents: 3000000,
        }),
      }),
      env,
    );

    await worker.fetch(
      new Request(`${baseUrl}/api/deposits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sellerCookie },
        body: JSON.stringify({
          customerId: createdCustomer.id,
          customerName: createdCustomer.name,
          productDescription: 'Bomba de agua Chivilcoy CH0119',
          quantity: 1,
          estimatedUnitPriceCents: 6000000,
          depositAmountCents: 2500000,
          paymentFormat: 'transferencia',
        }),
      }),
      env,
    );

    // 4. Simular que el presupuesto se emitió hace 8 días y aún no confirmó retiro
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('UPDATE quotes SET created_at = ? WHERE id = ?')
      .bind(eightDaysAgo, savedQuote.id)
      .run();

    // 5. Consultar Directorio de Clientes y Ficha 360° verificando alerta de seguimiento atrasado
    const dirRes = await worker.fetch(
      new Request(`${baseUrl}/api/clients/directory?filter=overdue`, {
        headers: { Cookie: sellerCookie },
      }),
      env,
    );
    expect(dirRes.status).toBe(200);
    const dirData = (await dirRes.json()) as any;
    expect(dirData.clients.some((c: any) => c.id === createdCustomer.id && c.hasOverdueFollowUp === true)).toBe(true);
    expect(dirData.overdueFollowUps.some((o: any) => o.referenceId === savedQuote.id && o.kind === 'quote_uncollected')).toBe(true);

    const profRes = await worker.fetch(
      new Request(`${baseUrl}/api/clients/${createdCustomer.id}/profile`, {
        headers: { Cookie: sellerCookie },
      }),
      env,
    );
    expect(profRes.status).toBe(200);
    const profData = (await profRes.json()) as any;
    expect(profData.hasOverdueFollowUp).toBe(true);
    expect(profData.accountBalanceCents).toBe(3000000);
    expect(profData.quotes.length).toBe(1);
    expect(profData.quotes[0].isOverdueFollowUp).toBe(true);
    expect(profData.deposits.length).toBe(1);
  });
});
