import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:workers';
import worker from '../src/worker';
import type { InvoiceParsedHeader } from '../src/shared/schemas';

const baseUrl = 'http://localhost';

describe('Supplier Invoices & AI Intake Integration Tests', () => {
  let adminCookie = '';
  let sellerCookie = '';
  let testProductId = 0;

  beforeAll(async () => {
    // 1. Setup admin
    const setupReq = new Request(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'cambiar-por-un-valor-aleatorio-largo',
        username: 'admin_invoices',
        displayName: 'Administrador Facturas',
        password: 'PasswordSuperSegura123',
      }),
    });
    const setupRes = await worker.fetch(setupReq, env);
    if (setupRes.status !== 201 && setupRes.status !== 400) {
      throw new Error(`Setup failed: ${await setupRes.text()}`);
    }

    // 2. Login as admin
    const loginReq = new Request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin_invoices',
        password: 'PasswordSuperSegura123',
      }),
    });
    const loginRes = await worker.fetch(loginReq, env);
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie');
    adminCookie = setCookie ? setCookie.split(';')[0] : '';
    expect(adminCookie).toContain('rh_session=');

    // 3. Create seller
    const createSellerReq = new Request(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        username: 'vendedor_facturas',
        displayName: 'Vendedor Test',
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
        username: 'vendedor_facturas',
        password: 'PasswordVendedor456',
      }),
    });
    const sellerLoginRes = await worker.fetch(sellerLoginReq, env);
    expect(sellerLoginRes.status).toBe(200);
    const sellerSetCookie = sellerLoginRes.headers.get('set-cookie');
    sellerCookie = sellerSetCookie ? sellerSetCookie.split(';')[0] : '';

    // 5. Create a test product to match against
    const prodReq = new Request(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        sku: '6204-2RS-SKF',
        name: 'Rulemán SKF 6204-2RS Doble Sello',
        brand: 'SKF',
        unit: 'unidad',
        priceCents: 1200000, // $12.000,00
        costCents: 600000,   // $6.000,00
        initialStock: 5,
        minStock: 2,
      }),
    });
    const prodRes = await worker.fetch(prodReq, env);
    expect(prodRes.status).toBe(201);
    const prodData = (await prodRes.json()) as any;
    testProductId = prodData.id;
  });

  it('rejects unauthenticated and non-admin requests to invoice endpoints', async () => {
    // Unauthenticated
    const parseAnonReq = new Request(`${baseUrl}/api/invoices/parse`, { method: 'POST' });
    const parseAnonRes = await worker.fetch(parseAnonReq, env);
    expect(parseAnonRes.status).toBe(401);

    // Seller trying to parse
    const parseSellerReq = new Request(`${baseUrl}/api/invoices/parse`, {
      method: 'POST',
      headers: { Cookie: sellerCookie },
    });
    const parseSellerRes = await worker.fetch(parseSellerReq, env);
    expect(parseSellerRes.status).toBe(403);

    // Seller trying to confirm
    const confirmSellerReq = new Request(`${baseUrl}/api/invoices/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        idempotencyKey: 'test-seller',
        supplierName: 'Test',
        invoiceNumber: '0001-00000001',
        invoiceDate: '2026-11-03',
        subtotalCents: 1000,
        taxCents: 210,
        totalCents: 1210,
        items: [],
      }),
    });
    const confirmSellerRes = await worker.fetch(confirmSellerReq, env);
    expect(confirmSellerRes.status).toBe(403);
  });

  it('parses invoice PDF and matches items against catalog using injected test header', async () => {
    const mockInvoiceData: InvoiceParsedHeader = {
      supplierName: 'MOVIMIENTO MECANICO S.R.L.',
      supplierCuit: '30-70891234-9',
      invoiceType: 'A',
      invoiceNumber: '0008-00271167',
      invoiceDate: '2026-10-15',
      subtotalNetCents: 1500000,
      taxCents: 315000,
      totalCents: 1815000,
      items: [
        {
          supplierCode: '6204-2RS-SKF',
          description: 'RODAMIENTO RIGIDO A BOLAS 6204 2RS SKF',
          quantity: 10,
          listPriceCents: 800000,
          discountPercent: 15,
          netUnitCostCents: 680000, // $6.800,00 (subió desde $6.000)
          totalNetCents: 6800000,
          lineType: 'product',
        },
        {
          supplierCode: 'NU-205-ECP',
          description: 'RODAMIENTO DE RODILLOS CILINDRICOS NU 205',
          quantity: 4,
          listPriceCents: 1500000,
          discountPercent: 10,
          netUnitCostCents: 1350000,
          totalNetCents: 5400000,
          lineType: 'product',
        },
        {
          supplierCode: 'FLETE',
          description: 'FLETE Y SEGURO BARILOCHE',
          quantity: 1,
          listPriceCents: 500000,
          discountPercent: 0,
          netUnitCostCents: 500000,
          totalNetCents: 500000,
          lineType: 'charge',
        },
      ],
    };

    // Crear un body FormData simulado con un PDF ficticio
    const formData = new FormData();
    formData.append('file', new Blob(['%PDF-1.4 dummy content'], { type: 'application/pdf' }), 'factura.pdf');

    const parseReq = new Request(`${baseUrl}/api/invoices/parse`, {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'x-test-invoice-data': JSON.stringify(mockInvoiceData),
      },
      body: formData,
    });

    const parseRes = await worker.fetch(parseReq, env);
    expect(parseRes.status).toBe(200);

    const parseData = (await parseRes.json()) as any;
    expect(parseData.invoice.supplierName).toBe('MOVIMIENTO MECANICO S.R.L.');
    expect(parseData.items.length).toBe(3);

    // Ítem 1: Coincidencia con SKU existente
    const item1 = parseData.items[0];
    expect(item1.matchType).toBe('exact_sku');
    expect(item1.matchedProductId).toBe(testProductId);
    expect(item1.currentStock).toBe(5);
    expect(item1.action).toBe('update_stock');
    expect(item1.costDiffPercent).toBeGreaterThan(0); // El costo subió de 6.000 a 6.800 (+13.3%)
    expect(item1.suggestedPriceCents).toBeGreaterThan(item1.currentPriceCents);

    // Ítem 2: Producto nuevo
    const item2 = parseData.items[1];
    expect(item2.matchType).toBe('new_item');
    expect(item2.action).toBe('create_and_stock');
    expect(item2.matchedProductId).toBeNull();
    expect(item2.newSku).toBe('NU-205-ECP');
    expect(item2.newName).toBe('RODAMIENTO DE RODILLOS CILINDRICOS NU 205');

    // Ítem 3: Cargo de flete (omitido de stock)
    const item3 = parseData.items[2];
    expect(item3.matchType).toBe('charge');
    expect(item3.action).toBe('skip');
  });

  it('confirms invoice intake atomically: updates stock, inserts movements and aliases', async () => {
    const idempotencyKey = `inv_test_${Date.now()}`;

    const confirmPayload = {
      idempotencyKey,
      supplierName: 'MOVIMIENTO MECANICO S.R.L.',
      supplierCuit: '30-70891234-9',
      invoiceNumber: '0008-00271167',
      invoiceDate: '2026-10-15',
      subtotalCents: 1500000,
      taxCents: 315000,
      totalCents: 1815000,
      notes: 'Ingreso de prueba automatizado',
      items: [
        {
          supplierCode: '6204-2RS-SKF',
          action: 'update_stock',
          productId: testProductId,
          quantity: 10,
          netUnitCostCents: 680000,
          updatePrice: true,
          newPriceCents: 1360000, // Actualizamos precio de venta
          saveAlias: true,
        },
        {
          supplierCode: 'NU-205-ECP',
          action: 'create_and_stock',
          quantity: 4,
          netUnitCostCents: 1350000,
          updatePrice: true,
          newPriceCents: 2700000,
          saveAlias: true,
          newProduct: {
            sku: 'NU-205-ECP',
            name: 'Rodamiento NU 205 ECP',
            brand: 'SKF',
            priceCents: 2700000,
            costCents: 1350000,
            minStock: 2,
          },
        },
        {
          supplierCode: 'FLETE',
          action: 'skip',
          quantity: 1,
          netUnitCostCents: 500000,
          updatePrice: false,
          saveAlias: false,
        },
      ],
    };

    const confirmReq = new Request(`${baseUrl}/api/invoices/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify(confirmPayload),
    });

    const confirmRes = await worker.fetch(confirmReq, env);
    expect(confirmRes.status).toBe(201);

    const result = (await confirmRes.json()) as any;
    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    expect(result.createdCount).toBe(1);
    expect(result.totalUnitsAdded).toBe(14); // 10 + 4

    // 1. Verificar stock y precios del producto existente
    const prodRes = await worker.fetch(
      new Request(`${baseUrl}/api/products/${testProductId}`, { headers: { Cookie: adminCookie } }),
      env,
    );
    expect(prodRes.status).toBe(200);
    const prod = (await prodRes.json()) as any;
    expect(prod.stock).toBe(15); // 5 previos + 10 nuevos
    expect(prod.costCents).toBe(680000);
    expect(prod.priceCents).toBe(1360000);

    // 2. Verificar que se creó el nuevo producto
    const newProdRes = await worker.fetch(
      new Request(`${baseUrl}/api/products/by-code/NU-205-ECP`, { headers: { Cookie: adminCookie } }),
      env,
    );
    expect(newProdRes.status).toBe(200);
    const newProdData = (await newProdRes.json()) as any;
    expect(newProdData.found).toBe(true);
    expect(newProdData.product.stock).toBe(4);
    expect(newProdData.product.costCents).toBe(1350000);
    expect(newProdData.product.priceCents).toBe(2700000);

    // 3. Verificar idempotencia: enviar la misma clave no debe sumar stock nuevamente
    const duplicateConfirmReq = new Request(`${baseUrl}/api/invoices/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify(confirmPayload),
    });
    const duplicateConfirmRes = await worker.fetch(duplicateConfirmReq, env);
    expect([200, 201]).toContain(duplicateConfirmRes.status);
    const dupResult = (await duplicateConfirmRes.json()) as any;
    expect(dupResult.success).toBe(true);

    const checkStockAgain = await worker.fetch(
      new Request(`${baseUrl}/api/products/${testProductId}`, { headers: { Cookie: adminCookie } }),
      env,
    );
    const prodAgain = (await checkStockAgain.json()) as any;
    expect(prodAgain.stock).toBe(15); // Debe seguir siendo 15, no 25
  });

  it('lists recorded invoices and retrieves invoice detail with movements', async () => {
    // Listar facturas
    const listReq = new Request(`${baseUrl}/api/invoices`, {
      headers: { Cookie: adminCookie },
    });
    const listRes = await worker.fetch(listReq, env);
    expect(listRes.status).toBe(200);

    const listData = (await listRes.json()) as any;
    expect(listData.items.length).toBeGreaterThan(0);
    const lastInvoice = listData.items[0];
    expect(lastInvoice.supplier_name).toBe('MOVIMIENTO MECANICO S.R.L.');
    expect(lastInvoice.invoice_number).toBe('0008-00271167');

    // Obtener detalle por ID
    const detailReq = new Request(`${baseUrl}/api/invoices/${lastInvoice.id}`, {
      headers: { Cookie: adminCookie },
    });
    const detailRes = await worker.fetch(detailReq, env);
    expect(detailRes.status).toBe(200);

    const detailData = (await detailRes.json()) as any;
    expect(detailData.invoice.id).toBe(lastInvoice.id);
    expect(detailData.movements.length).toBe(2); // Los 2 ítems no omitidos
    expect(detailData.movements[0].ref_type).toBe('import');
    expect(detailData.movements[0].ref_id).toBe(lastInvoice.id);
  });

  it('warns about duplicate invoice and matches by alias in subsequent parses', async () => {
    const mockInvoiceData: InvoiceParsedHeader = {
      supplierName: 'MOVIMIENTO MECANICO S.R.L.',
      supplierCuit: '30-70891234-9',
      invoiceType: 'A',
      invoiceNumber: '0008-00271167', // Mismo número
      invoiceDate: '2026-10-15',
      subtotalNetCents: 1500000,
      taxCents: 315000,
      totalCents: 1815000,
      items: [
        {
          supplierCode: 'NU-205-ECP', // Fue guardado como alias en la prueba anterior
          description: 'RODAMIENTO NU 205',
          quantity: 2,
          listPriceCents: 1500000,
          discountPercent: 10,
          netUnitCostCents: 1350000,
          totalNetCents: 2700000,
          lineType: 'product',
        },
      ],
    };

    const formData = new FormData();
    formData.append('file', new Blob(['%PDF-1.4 dummy'], { type: 'application/pdf' }), 'factura.pdf');

    const parseReq = new Request(`${baseUrl}/api/invoices/parse`, {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'x-test-invoice-data': JSON.stringify(mockInvoiceData),
      },
      body: formData,
    });

    const parseRes = await worker.fetch(parseReq, env);
    expect(parseRes.status).toBe(200);

    const parseData = (await parseRes.json()) as any;
    // Advertencia de duplicado presente
    expect(parseData.existingInvoiceWarning).toBeTruthy();
    expect(parseData.existingInvoiceWarning).toContain('0008-00271167');

    // Debe coincidir mediante alias previo o SKU exacto
    expect(['alias', 'exact_sku']).toContain(parseData.items[0].matchType);
    expect(parseData.items[0].currentStock).toBe(4);
  });
});
