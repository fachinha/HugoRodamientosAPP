import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:workers';
import worker from '../src/worker';

const baseUrl = 'http://localhost';

describe('Backend API & Inventory Integration Tests', () => {
  let adminCookie = '';
  let sellerCookie = '';
  let sellerUserId = 0;

  beforeAll(async () => {
    // 1. Setup initial admin
    const setupReq = new Request(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'cambiar-por-un-valor-aleatorio-largo',
        username: 'admin',
        displayName: 'Administrador Hugo',
        password: 'PasswordSuperSegura123',
      }),
    });
    const setupRes = await worker.fetch(setupReq, env);
    expect(setupRes.status).toBe(201);

    // 2. Login as admin
    const loginReq = new Request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'PasswordSuperSegura123',
      }),
    });
    const loginRes = await worker.fetch(loginReq, env);
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie');
    adminCookie = setCookie ? setCookie.split(';')[0] : '';
    expect(adminCookie).toContain('rh_session=');

    // 3. Create a seller user using admin
    const createSellerReq = new Request(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        username: 'vendedor1',
        displayName: 'Empleado Mostrador',
        role: 'seller',
        password: 'PasswordVendedor456',
      }),
    });
    const createSellerRes = await worker.fetch(createSellerReq, env);
    expect(createSellerRes.status).toBe(201);
    const sellerData = (await createSellerRes.json()) as any;
    sellerUserId = sellerData.id;

    // 4. Login as seller
    const sellerLoginReq = new Request(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'vendedor1',
        password: 'PasswordVendedor456',
      }),
    });
    const sellerLoginRes = await worker.fetch(sellerLoginReq, env);
    expect(sellerLoginRes.status).toBe(200);
    const sellerSetCookie = sellerLoginRes.headers.get('set-cookie');
    sellerCookie = sellerSetCookie ? sellerSetCookie.split(';')[0] : '';
  });

  // Caso 20: Acceso sin autorización
  it('rejects unauthorized access with 401', async () => {
    const req = new Request(`${baseUrl}/api/products`);
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // Caso 16: Intentar realizar un ajuste de stock sin permisos (rol seller)
  it('rejects stock adjustment when user is seller with 403', async () => {
    const req = new Request(`${baseUrl}/api/stock/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        idempotencyKey: 'adj-unauth-001',
        productId: 1,
        direction: 'in',
        quantity: 5,
        reason: 'Ajuste de prueba no autorizado',
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('FORBIDDEN');
  });

  // Caso 1: Crear un producto con código de barras
  let productId6204 = 0;
  it('creates a product with barcode and retrieves it', async () => {
    const req = new Request(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        sku: '6204-2RS',
        name: 'Rulemán 6204 2RS blindado',
        brand: 'SKF',
        categoryName: 'Rulemanes rígidos',
        unit: 'unidad',
        priceCents: 1500000, // $ 15.000,00
        costCents: 800000,   // $ 8.000,00
        initialStock: 10,
        minStock: 5,
        targetStock: 20,
        barcodes: ['7316576620428'],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);
    const prod = (await res.json()) as any;
    expect(prod.id).toBeGreaterThan(0);
    expect(prod.stock).toBe(10);
    expect(prod.barcodes).toContain('7316576620428');
    productId6204 = prod.id;

    // Verificar que se haya registrado el movimiento inicial
    const movReq = new Request(`${baseUrl}/api/products/${productId6204}/movements`, {
      headers: { Cookie: adminCookie },
    });
    const movRes = await worker.fetch(movReq, env);
    expect(movRes.status).toBe(200);
    const movs = (await movRes.json()) as any;
    expect(movs.items.length).toBe(1);
    expect(movs.items[0].type).toBe('initial');
    expect(movs.items[0].quantity).toBe(10);
  });

  // Caso 2: Intentar registrar dos productos con el mismo código
  it('rejects registering a second product with the same barcode', async () => {
    const req = new Request(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        sku: '6204-ZZ',
        name: 'Rulemán 6204 ZZ',
        priceCents: 1400000,
        barcodes: ['7316576620428'], // Repetido
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('BARCODE_ALREADY_EXISTS');
  });

  // Caso 4: Escanear un código desconocido
  it('returns found: false when scanning an unknown barcode', async () => {
    const req = new Request(`${baseUrl}/api/products/by-code/9999999999999`, {
      headers: { Cookie: sellerCookie },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.found).toBe(false);
    expect(body.product).toBeNull();
  });

  // Búsqueda por código de barras existente
  it('finds product by barcode scan', async () => {
    const req = new Request(`${baseUrl}/api/products/by-code/7316576620428`, {
      headers: { Cookie: sellerCookie },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.found).toBe(true);
    expect(body.product.sku).toBe('6204-2RS');
  });

  // Caso 6: Registrar una entrada de cinco unidades
  it('registers an incoming stock entry of 5 units and updates stock to 15', async () => {
    const req = new Request(`${baseUrl}/api/stock/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        idempotencyKey: 'entry-test-001',
        productId: productId6204,
        quantity: 5,
        kind: 'purchase',
        reason: 'Factura proveedor 1024',
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.currentStock).toBe(15);
    expect(body.movement.type).toBe('purchase');
    expect(body.movement.stockAfter).toBe(15);
  });

  // Caso 7: Vender dos unidades y comprobar el nuevo stock (de 15 a 13)
  let saleId = 0;
  it('sells 2 units in POS and verifies stock is decreased atomically to 13', async () => {
    const req = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        idempotencyKey: 'sale-test-001',
        paymentMethodId: 1, // Efectivo
        discountCents: 0,
        items: [
          {
            productId: productId6204,
            quantity: 2,
            expectedUnitPriceCents: 1500000,
          },
        ],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);
    const sale = (await res.json()) as any;
    expect(sale.totalCents).toBe(3000000);
    saleId = sale.id;

    // Verificar stock del producto
    const pReq = new Request(`${baseUrl}/api/products/${productId6204}`, {
      headers: { Cookie: sellerCookie },
    });
    const pRes = await worker.fetch(pReq, env);
    const prod = (await pRes.json()) as any;
    expect(prod.stock).toBe(13);
  });

  // Caso 8: Intentar vender más unidades de las disponibles
  it('rejects sale when requested quantity exceeds available stock', async () => {
    const req = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        idempotencyKey: 'sale-oversell-001',
        paymentMethodId: 1,
        items: [
          {
            productId: productId6204,
            quantity: 50, // Solo hay 13
            expectedUnitPriceCents: 1500000,
          },
        ],
      }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  // Caso 11: Confirmar una venta dos veces con la misma idempotencyKey
  it('returns the existing sale without creating a duplicate when confirming twice', async () => {
    const req = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sellerCookie,
      },
      body: JSON.stringify({
        idempotencyKey: 'sale-test-001', // Ya usada en el caso 7
        paymentMethodId: 1,
        items: [
          {
            productId: productId6204,
            quantity: 2,
            expectedUnitPriceCents: 1500000,
          },
        ],
      }),
    });
    const res = await worker.fetch(req, env);
    expect([200, 201]).toContain(res.status);
    const sale = (await res.json()) as any;
    expect(sale.id).toBe(saleId);

    // Comprobar que el stock NO volvió a descontarse (sigue en 13)
    const pReq = new Request(`${baseUrl}/api/products/${productId6204}`, {
      headers: { Cookie: sellerCookie },
    });
    const prod = (await (await worker.fetch(pReq, env)).json()) as any;
    expect(prod.stock).toBe(13);
  });

  // Caso 14: Modificar el precio y verificar que la venta anterior conserva su snapshot histórico
  it('preserves unit price snapshot in past sales when product price changes', async () => {
    // 1. Modificar precio del producto a $ 20.000,00
    const updateReq = new Request(`${baseUrl}/api/products/${productId6204}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        sku: '6204-2RS',
        name: 'Rulemán 6204 2RS blindado',
        priceCents: 2000000, // $ 20.000
        minStock: 5,
        targetStock: 20,
        barcodes: ['7316576620428'],
      }),
    });
    const updateRes = await worker.fetch(updateReq, env);
    expect(updateRes.status).toBe(200);

    // 2. Consultar la venta anterior y comprobar que su item sigue con $ 15.000
    const saleReq = new Request(`${baseUrl}/api/sales/${saleId}`, {
      headers: { Cookie: sellerCookie },
    });
    const saleRes = await worker.fetch(saleReq, env);
    const pastSale = (await saleRes.json()) as any;
    expect(pastSale.items[0].unitPriceCents).toBe(1500000);
    expect(pastSale.totalCents).toBe(3000000);
  });

  // Caso 15: Devolución parcial y reposición de stock
  it('processes a return, restocks items, and creates return stock movement', async () => {
    // Venta tenía 2 unidades. Devolvemos 1 unidad.
    const retReq = new Request(`${baseUrl}/api/sales/${saleId}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        idempotencyKey: 'return-test-001',
        reason: 'Cliente se equivocó de medida',
        items: [
          {
            saleItemId: 1, // ID del item de la venta
            quantity: 1,
            restock: true,
          },
        ],
      }),
    });
    const retRes = await worker.fetch(retReq, env);
    expect(retRes.status).toBe(200);
    const updatedSale = (await retRes.json()) as any;
    expect(updatedSale.status).toBe('partially_returned');
    expect(updatedSale.refundedCents).toBe(1500000);

    // Stock sube de 13 a 14
    const pReq = new Request(`${baseUrl}/api/products/${productId6204}`, {
      headers: { Cookie: sellerCookie },
    });
    const prod = (await (await worker.fetch(pReq, env)).json()) as any;
    expect(prod.stock).toBe(14);
  });

  // Caso 12 y 13: Stock mínimo y producto agotado (Alertas)
  it('triggers low stock alert at min_stock and out of stock alert at 0', async () => {
    // Ajustar stock a 5 (minStock es 5)
    await worker.fetch(
      new Request(`${baseUrl}/api/stock/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          idempotencyKey: 'adj-to-min',
          productId: productId6204,
          direction: 'out',
          quantity: 9, // 14 - 9 = 5
          reason: 'Ajuste de inventario para prueba de alertas',
        }),
      }),
      env,
    );

    // Consultar alertas
    const alertRes = await worker.fetch(new Request(`${baseUrl}/api/alerts?status=low`, { headers: { Cookie: sellerCookie } }), env);
    const alertData = (await alertRes.json()) as any;
    expect(alertData.items.some((it: any) => it.productId === productId6204 && it.status === 'low')).toBe(true);

    // Ajustar a 0 (agotado)
    await worker.fetch(
      new Request(`${baseUrl}/api/stock/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          idempotencyKey: 'adj-to-zero',
          productId: productId6204,
          direction: 'out',
          quantity: 5, // 5 - 5 = 0
          reason: 'Ajuste a cero para prueba de agotado',
        }),
      }),
      env,
    );

    const outRes = await worker.fetch(new Request(`${baseUrl}/api/alerts?status=out`, { headers: { Cookie: sellerCookie } }), env);
    const outData = (await outRes.json()) as any;
    expect(outData.items.some((it: any) => it.productId === productId6204 && it.status === 'out')).toBe(true);
  });

  // Caso 9: Concurrencia sobre las últimas unidades
  it('safely handles concurrent sales on remaining units without negative stock', async () => {
    // 1. Crear producto con exactamente 1 unidad
    const createProd = await worker.fetch(
      new Request(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          sku: 'CORREA-CONC-01',
          name: 'Correa dentada de prueba concurrencia',
          priceCents: 500000,
          initialStock: 1,
        }),
      }),
      env,
    );
    const newProd = (await createProd.json()) as any;

    // 2. Disparar dos ventas simultáneas de 1 unidad cada una con Promise.all
    const saleReq1 = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sellerCookie },
      body: JSON.stringify({
        idempotencyKey: 'conc-sale-A',
        paymentMethodId: 1,
        items: [{ productId: newProd.id, quantity: 1, expectedUnitPriceCents: 500000 }],
      }),
    });
    const saleReq2 = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sellerCookie },
      body: JSON.stringify({
        idempotencyKey: 'conc-sale-B',
        paymentMethodId: 1,
        items: [{ productId: newProd.id, quantity: 1, expectedUnitPriceCents: 500000 }],
      }),
    });

    const [res1, res2] = await Promise.all([worker.fetch(saleReq1, env), worker.fetch(saleReq2, env)]);

    const statuses = [res1.status, res2.status].sort();
    // Uno debe ser 201 (ganó) y el otro 409 (rechazado por falta de stock)
    expect(statuses).toEqual([201, 409]);

    // Comprobar que el stock final es exactamente 0 (nunca negativo)
    const checkProd = await worker.fetch(
      new Request(`${baseUrl}/api/products/${newProd.id}`, { headers: { Cookie: sellerCookie } }),
      env,
    );
    const prodFinal = (await checkProd.json()) as any;
    expect(prodFinal.stock).toBe(0);
  });

  // Caso 5: Importar productos válidos y detectar filas incorrectas
  it('previews and commits product imports with validation and dry-run preview', async () => {
    const importRows = [
      {
        sku: 'IMP-6000',
        nombre: 'Rulemán 6000 2RS',
        codigo_barras: '7790000006000',
        precio_venta: '2.500,00',
        costo: '1.200,00',
        stock_inicial: 20,
        stock_minimo: 5,
        categoria: 'Rulemanes chicos',
      },
      {
        sku: '', // Inválido
        nombre: 'Producto sin SKU',
        precio_venta: '100',
      },
    ];

    // 1. Preview
    const prevReq = new Request(`${baseUrl}/api/imports/products/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ rows: importRows }),
    });
    const prevRes = await worker.fetch(prevReq, env);
    expect(prevRes.status).toBe(200);
    const prevData = (await prevRes.json()) as any;
    expect(prevData.totalRows).toBe(2);
    expect(prevData.validRowsCount).toBe(1);
    expect(prevData.invalidRowsCount).toBe(1);

    // 2. Commit con skipInvalid: true
    const commitReq = new Request(`${baseUrl}/api/imports/products/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        rows: importRows,
        skipInvalid: true,
        updateExisting: false,
      }),
    });
    const commitRes = await worker.fetch(commitReq, env);
    expect(commitRes.status).toBe(200);
    const commitData = (await commitRes.json()) as any;
    expect(commitData.imported).toBe(1);
    expect(commitData.skipped).toBe(1);

    // 3. Comprobar que el producto importado existe con su stock y código
    const impProd = await worker.fetch(
      new Request(`${baseUrl}/api/products/by-code/7790000006000`, { headers: { Cookie: sellerCookie } }),
      env,
    );
    const impProdData = (await impProd.json()) as any;
    expect(impProdData.found).toBe(true);
    expect(impProdData.product.stock).toBe(20);
  });

  // Caso 21: Flujo completo de Pedidos a Proveedores (búsqueda POS por código/barra, comparador multi-proveedor, quién pide y quién confirma llegada + suma a stock)
  it('completes supplier order flow: barcode/code lookup, multi-supplier comparison, orderedByName, arrival confirmation with receivedByName and automatic stock increment', async () => {
    // 1. Registrar 2 proveedores reales
    const sup1Res = await worker.fetch(
      new Request(`${baseUrl}/api/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'ITURRIA',
          phone: '01145551111',
          leadTimeDays: 4,
          freightPct: 5,
          brandsSupplied: 'SKF, INA',
        }),
      }),
      env,
    );
    expect(sup1Res.status).toBe(201);
    const supIturria = (await sup1Res.json()) as any;

    const sup2Res = await worker.fetch(
      new Request(`${baseUrl}/api/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'ARCORE S.A.',
          phone: '01145552222',
          leadTimeDays: 3,
          freightPct: 4,
          brandsSupplied: 'SKF, DAYCO',
        }),
      }),
      env,
    );
    expect(sup2Res.status).toBe(201);
    const supArcore = (await sup2Res.json()) as any;

    // 2. Crear producto asociado a ITURRIA con código de barras y código técnico
    const createKitRes = await worker.fetch(
      new Request(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          sku: 'VKMA05012-TEST',
          name: 'VKMA05012 KIT DISTRIBUCION CHEVROLET CORSA 1.6 8V',
          brand: 'SKF',
          priceCents: 6800000,
          costCents: 4200000,
          initialStock: 2,
          minStock: 4,
          targetStock: 8,
          supplierName: 'ITURRIA',
          supplierCode: 'VKMA05012',
          freightPct: 5,
          barcodes: ['7316575050122'],
        }),
      }),
      env,
    );
    expect(createKitRes.status).toBe(201);
    const kitProd = (await createKitRes.json()) as any;

    // 3. Vincular opción alternativa más económica en ARCORE S.A.
    const optRes = await worker.fetch(
      new Request(`${baseUrl}/api/suppliers/product-option`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          productId: kitProd.id,
          supplierId: supArcore.id,
          supplierCode: 'VKMA05012',
          brandOffered: 'SKF',
          unitCostCents: 3800000,
          freightPct: 4,
          leadTimeDays: 3,
          isPreferred: false,
        }),
      }),
      env,
    );
    expect(optRes.status).toBe(200);

    // 4. Buscar estilo Punto de Venta por código de barras y verificar proveedor habitual + comparador
    const lookupRes = await worker.fetch(
      new Request(`${baseUrl}/api/replenishment/lookup?q=7316575050122`, {
        headers: { Cookie: sellerCookie },
      }),
      env,
    );
    expect(lookupRes.status).toBe(200);
    const lookupData = (await lookupRes.json()) as any;
    expect(lookupData.exactMatch).toBe(true);
    expect(lookupData.items.length).toBe(1);
    const foundCandidate = lookupData.items[0];
    expect(foundCandidate.defaultSupplierName).toBe('ITURRIA');
    expect(foundCandidate.supplierOptions.length).toBe(2);

    const arcoreOpt = foundCandidate.supplierOptions.find((o: any) => o.supplierName === 'ARCORE S.A.');
    const iturriaOpt = foundCandidate.supplierOptions.find((o: any) => o.supplierName === 'ITURRIA');
    expect(arcoreOpt).toBeTruthy();
    expect(iturriaOpt).toBeTruthy();
    expect(arcoreOpt.isCheapest).toBe(true);
    expect(iturriaOpt.isPreferred).toBe(true);

    // 5. Generar pedido indicando quién pide (orderedByName)
    const poCreateRes = await worker.fetch(
      new Request(`${baseUrl}/api/purchase-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sellerCookie },
        body: JSON.stringify({
          supplierId: supArcore.id,
          supplierName: 'ARCORE S.A.',
          supplierPhone: '01145552222',
          leadTimeDays: 3,
          freightPct: 4,
          orderedByName: 'Empleado Mostrador',
          notes: 'Pedido urgente mostrador',
          items: [
            {
              productId: kitProd.id,
              sku: kitProd.sku,
              name: kitProd.name,
              brand: 'SKF',
              supplierCode: 'VKMA05012',
              originReason: 'manual',
              quantity: 6,
              unitCostCents: 3800000,
              freightPct: 4,
            },
          ],
        }),
      }),
      env,
    );
    expect(poCreateRes.status).toBe(201);
    const createdOrder = (await poCreateRes.json()) as any;
    expect(createdOrder.status).toBe('ordered');
    expect(createdOrder.orderedByName).toBe('Empleado Mostrador');
    expect(createdOrder.receivedByName).toBeNull();

    // 6. Verificar en listado de pedidos que figura pendiente de llegada
    const listOrdersRes = await worker.fetch(
      new Request(`${baseUrl}/api/purchase-orders`, { headers: { Cookie: sellerCookie } }),
      env,
    );
    expect(listOrdersRes.status).toBe(200);
    const ordersList = (await listOrdersRes.json()) as any[];
    expect(ordersList.some((o) => o.id === createdOrder.id && o.status === 'ordered')).toBe(true);

    // 7. Confirmar llegada indicando quién confirma (receivedByName) y comprobar suma automática al stock (2 + 6 = 8)
    const receiveRes = await worker.fetch(
      new Request(`${baseUrl}/api/purchase-orders/${createdOrder.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          status: 'received',
          receivedByName: 'Administrador Hugo',
          receptionNotes: 'Llegaron 6 kits sellados OK',
        }),
      }),
      env,
    );
    expect(receiveRes.status).toBe(200);
    const receivedOrder = (await receiveRes.json()) as any;
    expect(receivedOrder.status).toBe('received');
    expect(receivedOrder.receivedByName).toBe('Administrador Hugo');
    expect(receivedOrder.receivedAt).toBeTruthy();
    expect(receivedOrder.receptionNotes).toBe('Llegaron 6 kits sellados OK');

    // Comprobar stock actualizado a 8 y movimiento Kardex acreditando quién confirmó
    const verifyProdRes = await worker.fetch(
      new Request(`${baseUrl}/api/products/${kitProd.id}`, { headers: { Cookie: sellerCookie } }),
      env,
    );
    const verifyProd = (await verifyProdRes.json()) as any;
    expect(verifyProd.stock).toBe(8);

    const verifyMovsRes = await worker.fetch(
      new Request(`${baseUrl}/api/products/${kitProd.id}/movements`, { headers: { Cookie: adminCookie } }),
      env,
    );
    const verifyMovs = (await verifyMovsRes.json()) as any;
    expect(
      verifyMovs.items.some(
        (m: any) => m.type === 'purchase' && m.quantity === 6 && String(m.reason).includes('Confirmó: Administrador Hugo'),
      ),
    ).toBe(true);
  });
});
