import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:workers';
import worker from '../src/worker';

const baseUrl = 'http://localhost';

describe('Locations, Technical Catalogs & POS Integration Tests', () => {
  let adminCookie = '';
  let testProductId = 0;

  beforeAll(async () => {
    // 1. Setup admin
    const setupReq = new Request(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'cambiar-por-un-valor-aleatorio-largo',
        username: 'admin_loc',
        displayName: 'Administrador Loc',
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
        username: 'admin_loc',
        password: 'PasswordSuperSegura123',
      }),
    });
    const adminLoginRes = await worker.fetch(adminLoginReq, env);
    expect(adminLoginRes.status).toBe(200);
    const setCookie = adminLoginRes.headers.get('set-cookie');
    adminCookie = setCookie ? setCookie.split(';')[0] : '';
  });

  it('debe registrar un producto con ubicación física E01-A-1, medidas técnicas y proveedor', async () => {
    const sku = `LOC-${Date.now()}`;
    const req = new Request(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        sku,
        name: 'Rulemán 6205 Blindado Especial',
        brand: 'SKF',
        categoryName: 'Rodamientos Rígidos',
        priceCents: 850000,
        costCents: 450000,
        initialStock: 20,
        minStock: 4,
        targetStock: 15,
        shelfNumber: 'E01',
        shelfLevel: 'A',
        compartment: '1',
        innerDiameterMm: 25,
        outerDiameterMm: 52,
        widthMm: 15,
        supplierName: 'Alfa Rodamientos',
        supplierCode: 'ALFA-6205-C3',
      }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(201);
    const data: any = await res.json();
    testProductId = data.id;

    expect(data.location).toBe('E01-A-1');
    expect(data.dimensions).toBe('25x52x15 mm');
    expect(data.shelfNumber).toBe('E01');
    expect(data.shelfLevel).toBe('A');
    expect(data.compartment).toBe('1');
    expect(data.innerDiameterMm).toBe(25);
    expect(data.outerDiameterMm).toBe(52);
    expect(data.widthMm).toBe(15);
    expect(data.supplierName).toBe('Alfa Rodamientos');
    expect(data.supplierCode).toBe('ALFA-6205-C3');
  });

  it('debe filtrar productos por estantería física shelfNumber=E01', async () => {
    const req = new Request(`${baseUrl}/api/products?shelfNumber=E01`, {
      headers: { Cookie: adminCookie },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.some((p: any) => p.id === testProductId)).toBe(true);
    expect(data.items.find((p: any) => p.id === testProductId).location).toBe('E01-A-1');
  });

  it('debe encontrar el producto buscando por medidas en la barra de búsqueda general', async () => {
    const req = new Request(`${baseUrl}/api/products?q=25x52x15`, {
      headers: { Cookie: adminCookie },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.items.some((p: any) => p.id === testProductId)).toBe(true);
  });

  it('debe consultar la tasa de cambio USD y permitir actualizarla', async () => {
    // 1. Obtener tasa actual
    const getReq = new Request(`${baseUrl}/api/settings/exchange-rate`, {
      headers: { Cookie: adminCookie },
    });
    const getRes = await worker.fetch(getReq, env);
    expect(getRes.status).toBe(200);
    const getData: any = await getRes.json();
    expect(typeof getData.rate).toBe('number');

    // 2. Modificar tasa a 1300
    const postReq = new Request(`${baseUrl}/api/settings/exchange-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ rate: 1300 }),
    });
    const postRes = await worker.fetch(postReq, env);
    expect(postRes.status).toBe(200);
    const postData: any = await postRes.json();
    expect(postData.rate).toBe(1300);
  });

  it('debe registrar una venta POS con recargo por tarjeta, cuotas y tipo de cambio', async () => {
    const paymentMethodsReq = new Request(`${baseUrl}/api/payment-methods`, {
      headers: { Cookie: adminCookie },
    });
    const pmRes = await worker.fetch(paymentMethodsReq, env);
    const pms: any = await pmRes.json();
    const pmCard = pms.find((p: any) => p.name.toLowerCase().includes('tarjeta')) || pms[0];

    const idempotencyKey = `sale_pos_test_${Date.now()}`;
    const saleReq = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        idempotencyKey,
        paymentMethodId: pmCard.id,
        discountCents: 0,
        surchargeCents: 127500, // +15% de recargo tarjeta en 3 cuotas
        installments: 3,
        cardType: 'credito',
        cardBrand: 'Visa',
        exchangeRateUsd: 1300,
        notes: 'Venta con tarjeta 3 cuotas',
        items: [
          {
            productId: testProductId,
            quantity: 1,
            expectedUnitPriceCents: 850000,
          },
        ],
      }),
    });

    const saleRes = await worker.fetch(saleReq, env);
    expect(saleRes.status).toBe(201);
    const saleData: any = await saleRes.json();

    expect(saleData.subtotalCents).toBe(850000);
    expect(saleData.surchargeCents).toBe(127500);
    expect(saleData.totalCents).toBe(850000 + 127500);
    expect(saleData.installments).toBe(3);
    expect(saleData.cardType).toBe('credito');
    expect(saleData.cardBrand).toBe('Visa');
    expect(saleData.exchangeRateUsd).toBe(1300);
  });

  it('debe consultar metadatos y listado del catálogo técnico de proveedores', async () => {
    const metaReq = new Request(`${baseUrl}/api/catalogs/metadata`, {
      headers: { Cookie: adminCookie },
    });
    const metaRes = await worker.fetch(metaReq, env);
    expect(metaRes.status).toBe(200);
    const metaData: any = await metaRes.json();
    expect(metaData.totalItems).toBeGreaterThanOrEqual(0);

    const itemsReq = new Request(`${baseUrl}/api/catalogs/items?page=1&pageSize=10`, {
      headers: { Cookie: adminCookie },
    });
    const itemsRes = await worker.fetch(itemsReq, env);
    expect(itemsRes.status).toBe(200);
    const itemsData: any = await itemsRes.json();
    expect(Array.isArray(itemsData.items)).toBe(true);
  });

  it('Bloque 1: debe encontrar los códigos relevados (7316577741530, DBH1359, CR1032) y registrar venta con ítem manual y motivo', async () => {
    // 1. Verificar código de barras SKF 7316577741530
    const codeReq = new Request(`${baseUrl}/api/products/by-code/7316577741530`, {
      headers: { Cookie: adminCookie },
    });
    const codeRes = await worker.fetch(codeReq, env);
    expect(codeRes.status).toBe(200);
    const codeData: any = await codeRes.json();
    expect(codeData.found).toBe(true);
    expect(codeData.product.brand).toBe('SKF');
    expect(codeData.product.freightPct).toBeGreaterThan(0);

    // 2. Registrar una venta con un ítem cargado manualmente y su motivo obligatorio
    const saleReq = new Request(`${baseUrl}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        idempotencyKey: `sale_manual_${Date.now()}`,
        paymentMethodId: 1,
        discountCents: 0,
        items: [
          {
            isManual: true,
            manualDescription: 'Retén de palier trasero Hilux',
            manualBrand: 'DBH',
            manualReason: 'Solo lo tiene MercadoLibre',
            quantity: 2,
            expectedUnitPriceCents: 1250000,
          },
        ],
      }),
    });
    const saleRes = await worker.fetch(saleReq, env);
    expect(saleRes.status).toBe(201);
    const saleData: any = await saleRes.json();
    expect(saleData.totalCents).toBe(2500000);
    expect(saleData.items[0].isManual).toBe(true);
    expect(saleData.items[0].manualReason).toBe('Solo lo tiene MercadoLibre');
  });

  it('Bloque 1: debe registrar seguimiento comercial de presupuesto (N° seguimiento, N° vendedor y motivo de pérdida) y cuentas oficiales', async () => {
    // 1. Crear presupuesto
    const quoteReq = new Request(`${baseUrl}/api/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        customerName: 'Taller Mecánico Bariloche Sur',
        customerPhone: '2944556677',
        customerType: 'empresa',
        vehicleBrand: 'Toyota',
        vehicleModel: 'Hilux',
        validDays: 5,
        includesTax: true,
        paymentTerms: 'Efectivo',
        sellerNumber: 'V-03',
        items: [
          {
            description: 'Rodamiento de rueda delantera SKF',
            brand: 'SKF',
            unitPriceCents: 4690000,
            quantity: 1,
            discountPct: 0,
            availability: 'in_stock',
          },
        ],
      }),
    });
    const quoteRes = await worker.fetch(quoteReq, env);
    expect(quoteRes.status).toBe(201);
    const quoteData: any = await quoteRes.json();
    expect(quoteData.sellerNumber).toBe('V-03');
    expect(quoteData.trackingNumber).toContain('SEG-');

    // 2. Actualizar seguimiento comercial indicando por qué no salió
    const fuReq = new Request(`${baseUrl}/api/quotes/${quoteData.id}/follow-up`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        trackingNumber: 'SEG-9001',
        sellerNumber: 'V-03',
        followUpStatus: 'not_viable',
        lossReason: 'Precio / Más barato en otro comercio',
        followUpNotes: 'El cliente comentó que consiguió un alternativo más económico',
      }),
    });
    const fuRes = await worker.fetch(fuReq, env);
    expect(fuRes.status).toBe(200);
    const fuData: any = await fuRes.json();
    expect(fuData.trackingNumber).toBe('SEG-9001');
    expect(fuData.followUpStatus).toBe('not_viable');
    expect(fuData.lossReason).toBe('Precio / Más barato en otro comercio');

    // 3. Consultar listado de cuentas oficiales de Hugo
    const accReq = new Request(`${baseUrl}/api/official-accounts`, {
      headers: { Cookie: adminCookie },
    });
    const accRes = await worker.fetch(accReq, env);
    expect(accRes.status).toBe(200);
    const accList: any = await accRes.json();
    expect(accList.length).toBeGreaterThan(0);
  });

  it('Bloque 2: debe registrar Compromisos de Pago (con Factura/Remito), Recibos multimedio (Efectivo, Cheque, Mercado Libre) y Señas de productos a pedir', async () => {
    // 1. Registrar Compromiso de Pago por mercadería retirada
    const cmpReq = new Request(`${baseUrl}/api/current-accounts/commitments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        customerName: 'Transportes Bariloche S.R.L.',
        customerPhone: '2944889900',
        customerCuit: '30-71122334-9',
        invoiceNumber: 'FC A 0001-00014280',
        remitoNumber: 'REM 0001-00008512',
        promisedPaymentDate: '2026-11-30',
        withdrawnByName: 'Carlos (Jefe de Taller)',
        itemsSummary: '2x Kit Rodamiento Rueda SKF VKBA-3530, 2x Retén DBH1359',
        amountCents: 11160000, // $111.600
      }),
    });
    const cmpRes = await worker.fetch(cmpReq, env);
    expect(cmpRes.status).toBe(201);
    const cmpData: any = await cmpRes.json();
    expect(cmpData.movementNumber).toContain('CMP-');
    expect(cmpData.invoiceNumber).toBe('FC A 0001-00014280');
    expect(cmpData.remitoNumber).toBe('REM 0001-00008512');

    // 2. Emitir Recibo de dinero a cuenta combinando Efectivo + Cheque + Mercado Libre
    const recReq = new Request(`${baseUrl}/api/current-accounts/receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        customerName: 'Transportes Bariloche S.R.L.',
        customerPhone: '2944889900',
        invoiceNumber: 'FC A 0001-00014280',
        paymentFormat: 'mixto',
        amountCents: 7160000,
        breakdown: [
          { format: 'efectivo', amountCents: 2000000 },
          {
            format: 'cheque',
            amountCents: 4000000,
            chequeNumber: '48291022',
            chequeBank: 'Banco Patagonia',
            chequeDueDate: '2026-12-15',
          },
          {
            format: 'mercado_libre',
            amountCents: 1160000,
            reference: 'MP-998877',
          },
        ],
      }),
    });
    const recRes = await worker.fetch(recReq, env);
    expect(recRes.status).toBe(201);
    const recData: any = await recRes.json();
    expect(recData.movementNumber).toContain('REC-');
    expect(recData.paymentFormat).toBe('mixto');
    expect(recData.chequeNumber).toBe('48291022');

    // 3. Verificar saldo actual en Cuenta Corriente ($111.600 - $71.600 = $40.000)
    const ovReq = new Request(`${baseUrl}/api/current-accounts`, {
      headers: { Cookie: adminCookie },
    });
    const ovRes = await worker.fetch(ovReq, env);
    expect(ovRes.status).toBe(200);
    const ovData: any = await ovRes.json();
    const custBalance = ovData.customerBalances.find(
      (b: any) => b.customerName === 'Transportes Bariloche S.R.L.',
    );
    expect(custBalance).toBeDefined();
    expect(custBalance.balanceCents).toBe(4000000);

    // 4. Registrar Seña a cuenta de un producto que debe pedirse
    const depReq = new Request(`${baseUrl}/api/deposits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        customerName: 'Mecánica Integral Nahuel',
        customerPhone: '2944112233',
        productSku: '32208-FAG',
        productDescription: 'Rodamiento Cónico Diferencial 32208',
        brand: 'FAG',
        supplierName: 'Alfa Rodamientos',
        quantity: 2,
        estimatedUnitPriceCents: 3800000, // Total est: $76.000
        depositAmountCents: 3000000,      // Seña: $30.000 -> Restan $46.000
        paymentFormat: 'transferencia',
      }),
    });
    const depRes = await worker.fetch(depReq, env);
    expect(depRes.status).toBe(201);
    const depData: any = await depRes.json();
    expect(depData.depositNumber).toContain('SEN-');
    expect(depData.status).toBe('pending_order');
    expect(depData.remainingBalanceCents).toBe(4600000);
  });

  it('Bloque 3: debe armar bandeja de reposición (vendido del día + faltantes + señas), comparar proveedores con flete/demora, excluir lo ya pedido y sumar stock al recibir', async () => {
    // 1. Dar de alta un proveedor nuevo con alerta de demora (9 días) y flete (8%)
    const supName = `Mayorista Rodamientos Cuyo ${Date.now()}`;
    const supReq = new Request(`${baseUrl}/api/suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: supName,
        cuit: '30-71554433-1',
        phone: '2614556677',
        city: 'Mendoza',
        leadTimeDays: 9,
        leadTimeAlertDays: 5,
        freightPct: 8.0,
        paymentTerms: 'Cuenta corriente 45 días',
        brandsSupplied: 'SKF, FAG, NTN',
      }),
    });
    const supRes = await worker.fetch(supReq, env);
    expect(supRes.status).toBe(201);
    const supData: any = await supRes.json();
    expect(supData.hasDelayAlert).toBe(true);
    expect(supData.freightPct).toBe(8.0);

    // 1b. Vincular oferta real de este proveedor para el producto a comparar
    const optRes = await worker.fetch(
      new Request(`${baseUrl}/api/suppliers/product-option`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          productId: testProductId,
          supplierId: supData.id,
          supplierCode: '6308-2RS-MZA',
          brandOffered: 'SKF',
          unitCostCents: 1150000,
          freightPct: 8.0,
          leadTimeDays: 9,
          isPreferred: false,
        }),
      }),
      env,
    );
    expect(optRes.status).toBe(200);

    // 2. Consultar Bandeja de Reposición del día
    const boardReq = new Request(`${baseUrl}/api/replenishment/board`, {
      headers: { Cookie: adminCookie },
    });
    const boardRes = await worker.fetch(boardReq, env);
    expect(boardRes.status).toBe(200);
    const boardData: any = await boardRes.json();
    expect(boardData.candidates.length).toBeGreaterThan(0);

    // Verificar que esté el producto vendido hoy y que tenga opciones multi-proveedor con precios, flete y alerta de demora
    const soldCandidate = boardData.candidates.find((c: any) => c.productId === testProductId);
    expect(soldCandidate).toBeDefined();
    expect(soldCandidate.soldTodayQty).toBeGreaterThanOrEqual(1);
    expect(soldCandidate.supplierOptions.length).toBeGreaterThanOrEqual(2);
    expect(soldCandidate.supplierOptions.some((o: any) => o.hasDelayAlert)).toBe(true);

    // 3. Emitir Orden de Pedido a Proveedor por ese artículo ("y que después no se vuelva a pedir")
    const chosenOpt = soldCandidate.supplierOptions[0];
    const poReq = new Request(`${baseUrl}/api/purchase-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        supplierId: chosenOpt.supplierId > 0 ? chosenOpt.supplierId : null,
        supplierName: chosenOpt.supplierName,
        leadTimeDays: chosenOpt.leadTimeDays,
        freightPct: chosenOpt.freightPct,
        items: [
          {
            productId: testProductId,
            sku: soldCandidate.sku,
            name: soldCandidate.name,
            brand: soldCandidate.brand,
            originReason: 'sold_today',
            quantity: soldCandidate.suggestedOrderQty,
            unitCostCents: chosenOpt.unitCostCents,
            freightPct: chosenOpt.freightPct,
          },
        ],
      }),
    });
    const poRes = await worker.fetch(poReq, env);
    expect(poRes.status).toBe(201);
    const poData: any = await poRes.json();
    expect(poData.orderNumber).toContain('PED-');
    expect(poData.status).toBe('ordered');

    // 4. Consultar nuevamente la bandeja sin includeAlreadyCovered: el ítem ya pedido no debe aparecer pendiente
    const boardAfterReq = new Request(`${baseUrl}/api/replenishment/board`, {
      headers: { Cookie: adminCookie },
    });
    const boardAfterRes = await worker.fetch(boardAfterReq, env);
    const boardAfterData: any = await boardAfterRes.json();
    expect(boardAfterData.candidates.some((c: any) => c.productId === testProductId)).toBe(false);
    expect(boardAfterData.summary.alreadyOrderedCount).toBeGreaterThanOrEqual(1);

    // 5. Recibir el pedido en el local y verificar que sume el stock automáticamente
    const recOrderReq = new Request(`${baseUrl}/api/purchase-orders/${poData.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ status: 'received' }),
    });
    const recOrderRes = await worker.fetch(recOrderReq, env);
    expect(recOrderRes.status).toBe(200);
    const recOrderData: any = await recOrderRes.json();
    expect(recOrderData.status).toBe('received');
  });

  it('Bloque 4: debe generar planilla Cash Flow día a día, conciliar Payway por días pares/impares y compras desconocidas, agenda WhatsApp y padrón automotor', async () => {
    // 1. Consultar Planilla Cash Flow día por día
    const cfReq = new Request(`${baseUrl}/api/finance/cashflow`, {
      headers: { Cookie: adminCookie },
    });
    const cfRes = await worker.fetch(cfReq, env);
    expect(cfRes.status).toBe(200);
    const cfData: any = await cfRes.json();
    expect(cfData.rows.length).toBeGreaterThanOrEqual(10);
    expect(cfData.rows[0]).toHaveProperty('openingBalanceCents');
    expect(cfData.rows[0]).toHaveProperty('closingProjectedBalanceCents');
    expect(['par', 'impar']).toContain(cfData.rows[0].dayParity);

    // 2. Consultar Conciliación Payway (sincroniza venta POS con tarjeta Visa 3 cuotas y verifica compras desconocidas)
    const pwReq = new Request(`${baseUrl}/api/finance/payway`, {
      headers: { Cookie: adminCookie },
    });
    const pwRes = await worker.fetch(pwReq, env);
    expect(pwRes.status).toBe(200);
    const pwData: any = await pwRes.json();
    expect(pwData.items.length).toBeGreaterThan(0);
    expect(pwData.byCardBrandAndInstallments.length).toBeGreaterThan(0);
    expect(
      pwData.items.some((i: any) => i.reconciliationStatus === 'unknown_purchase_dispute'),
    ).toBe(true);

    // 3. Consultar Agenda Oficial de WhatsApp (Clientes + Proveedores bien agendados)
    const waReq = new Request(`${baseUrl}/api/whatsapp-agenda`, {
      headers: { Cookie: adminCookie },
    });
    const waRes = await worker.fetch(waReq, env);
    expect(waRes.status).toBe(200);
    const waData: any = await waRes.json();
    expect(waData.length).toBeGreaterThan(0);
    expect(waData.some((a: any) => a.formattedPhoneBookName.startsWith('PROV -'))).toBe(true);

    // 4. Consultar Padrón del Parque Automotor y Empresas Activas
    const padReq = new Request(`${baseUrl}/api/automotive-padron`, {
      headers: { Cookie: adminCookie },
    });
    const padRes = await worker.fetch(padReq, env);
    expect(padRes.status).toBe(200);
    const padData: any = await padRes.json();
    expect(padData.padron.length).toBeGreaterThan(0);
    expect(padData.activeCompanies.length).toBeGreaterThan(0);
  });
});
