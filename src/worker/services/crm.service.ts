import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import { nowIso } from '../lib/db';
import type {
  CustomerCreateInput,
  CustomerUpdateInput,
  CustomerListQuery,
  CustomerVehicleInput,
  CustomerListItem,
  CustomerProfileDetail,
  CustomerVehicleDetail,
} from '../../shared/crm';

export class CrmService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Lista clientes con búsqueda predictiva por nombre, CUIT, teléfono o patente,
   * con métricas de compras (LTV), cantidad de ventas y cotizaciones.
   */
  async listCustomers(query: CustomerListQuery): Promise<{
    items: CustomerListItem[];
    total: number;
    page: number;
    pageSize: number;
    metrics: {
      totalCustomers: number;
      businessCustomers: number;
      activeCustomers: number;
      inactiveCustomers: number;
    };
  }> {
    const { q, customerType = 'all', status = 'all', missing = 'all', page = 1, pageSize = 25 } = query;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (customerType !== 'all') {
      conditions.push('c.customer_type = ?');
      params.push(customerType);
    }

    if (missing === 'phone') {
      conditions.push("(c.phone IS NULL OR trim(c.phone) = '')");
    } else if (missing === 'email') {
      conditions.push("(c.email IS NULL OR trim(c.email) = '')");
    } else if (missing === 'cuit') {
      conditions.push("(c.cuit IS NULL OR trim(c.cuit) = '' OR c.cuit = '00-00000000-0')");
    }

    if (q && q.trim()) {
      const searchPattern = `%${q.trim()}%`;
      conditions.push(
        `(c.name LIKE ? OR c.phone LIKE ? OR c.cuit LIKE ? OR c.email LIKE ? OR EXISTS (
            SELECT 1 FROM customer_vehicles cv WHERE cv.customer_id = c.id AND cv.plate LIKE ?
         ))`,
      );
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.join(' AND ');

    // Consulta para traer los datos agregados
    const sql = `
      SELECT
        c.id, c.name, c.customer_type, c.phone, c.cuit, c.email, c.city, c.created_at,
        COALESCE((SELECT SUM(s.total_cents - s.refunded_cents) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'voided'), 0) AS total_spent_cents,
        COALESCE((SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'voided'), 0) AS sales_count,
        COALESCE((SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id), 0) AS quotes_count,
        COALESCE((SELECT COUNT(*) FROM customer_vehicles cv WHERE cv.customer_id = c.id), 0) AS vehicles_count,
        (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'voided') AS last_purchase_at
      FROM customers c
      WHERE ${whereClause}
      ORDER BY total_spent_cents DESC, c.id DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM customers c
      WHERE ${whereClause}
    `;

    const [rows, countRow] = await Promise.all([
      this.ctx.db.prepare(sql).bind(...params, pageSize, offset).all<any>(),
      this.ctx.db.prepare(countSql).bind(...params).first<{ total: number }>(),
    ]);

    const total = countRow?.total || 0;
    const now = new Date();

    const items: CustomerListItem[] = (rows.results || []).map((r) => {
      let daysSinceLastPurchase: number | null = null;
      let isInactive = false;

      if (r.last_purchase_at) {
        const lastDate = new Date(r.last_purchase_at);
        const diffMs = now.getTime() - lastDate.getTime();
        daysSinceLastPurchase = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isInactive = daysSinceLastPurchase > 60;
      } else {
        const createdDate = new Date(r.created_at);
        const diffMs = now.getTime() - createdDate.getTime();
        const daysSinceCreated = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isInactive = daysSinceCreated > 60;
      }

      return {
        id: r.id,
        name: r.name,
        customerType: r.customer_type,
        phone: r.phone,
        cuit: r.cuit,
        email: r.email,
        city: r.city,
        totalSpentCents: r.total_spent_cents,
        salesCount: r.sales_count,
        quotesCount: r.quotes_count,
        vehiclesCount: r.vehicles_count,
        lastPurchaseAt: r.last_purchase_at,
        daysSinceLastPurchase,
        isInactive,
        createdAt: r.created_at,
      };
    });

    // Filtro por estado en memoria si fue solicitado
    let filteredItems = items;
    if (status === 'active') {
      filteredItems = items.filter((it) => !it.isInactive);
    } else if (status === 'inactive') {
      filteredItems = items.filter((it) => it.isInactive);
    }

    // Métricas globales
    const metricsRow = await this.ctx.db
      .prepare(
        `SELECT
           COUNT(*) AS total_customers,
           SUM(CASE WHEN customer_type = 'empresa' THEN 1 ELSE 0 END) AS business_customers
         FROM customers`,
      )
      .first<{ total_customers: number; business_customers: number }>();

    const totalCust = metricsRow?.total_customers || 0;
    const businessCust = metricsRow?.business_customers || 0;

    return {
      items: filteredItems,
      total,
      page,
      pageSize,
      metrics: {
        totalCustomers: totalCust,
        businessCustomers: businessCust,
        activeCustomers: Math.max(0, totalCust - items.filter((i) => i.isInactive).length),
        inactiveCustomers: items.filter((i) => i.isInactive).length,
      },
    };
  }

  /**
   * Obtiene la ficha 360° del cliente con vehículos e historial de comprobantes.
   */
  async getCustomerById(id: number): Promise<CustomerProfileDetail | null> {
    const cust = await this.ctx.db
      .prepare(
        `SELECT
           c.id, c.name, c.customer_type, c.phone, c.cuit, c.email, c.address, c.city, c.notes,
           c.created_at, c.updated_at,
           COALESCE((SELECT SUM(s.total_cents - s.refunded_cents) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'voided'), 0) AS total_spent_cents,
           COALESCE((SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'voided'), 0) AS sales_count,
           COALESCE((SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id), 0) AS quotes_count,
           COALESCE((SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id AND q.status IN ('accepted', 'converted')), 0) AS quotes_accepted_count,
           (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'voided') AS last_purchase_at
         FROM customers c
         WHERE c.id = ?`,
      )
      .bind(id)
      .first<any>();

    if (!cust) return null;

    // Obtener vehículos
    const vehiclesRes = await this.ctx.db
      .prepare(
        `SELECT id, customer_id, brand, model, year, engine, plate, notes, created_at
         FROM customer_vehicles
         WHERE customer_id = ?
         ORDER BY id DESC`,
      )
      .bind(id)
      .all<any>();

    const vehicles: CustomerVehicleDetail[] = (vehiclesRes.results || []).map((v) => ({
      id: v.id,
      customerId: v.customer_id,
      brand: v.brand,
      model: v.model,
      year: v.year,
      engine: v.engine,
      plate: v.plate,
      notes: v.notes,
      createdAt: v.created_at,
    }));

    // Obtener últimas 10 ventas
    const salesRes = await this.ctx.db
      .prepare(
        `SELECT s.id, s.total_cents, s.status, s.created_at, pm.name AS payment_method_name,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
         FROM sales s
         JOIN payment_methods pm ON pm.id = s.payment_method_id
         WHERE s.customer_id = ?
         ORDER BY s.id DESC
         LIMIT 10`,
      )
      .bind(id)
      .all<any>();

    const recentSales = (salesRes.results || []).map((s) => ({
      id: s.id,
      saleNumber: `VTA-${String(s.id).padStart(5, '0')}`,
      totalCents: s.total_cents,
      paymentMethodName: s.payment_method_name,
      status: s.status,
      createdAt: s.created_at,
      itemsCount: s.items_count,
    }));

    // Obtener últimas 10 cotizaciones
    const quotesRes = await this.ctx.db
      .prepare(
        `SELECT q.id, q.quote_number, q.total_cents, q.status, q.valid_until, q.created_at,
                q.vehicle_brand, q.vehicle_model, q.vehicle_plate
         FROM quotes q
         WHERE q.customer_id = ?
         ORDER BY q.id DESC
         LIMIT 10`,
      )
      .bind(id)
      .all<any>();

    const todayStr = new Date().toISOString().slice(0, 10);
    const recentQuotes = (quotesRes.results || []).map((q) => {
      const vParts = [q.vehicle_brand, q.vehicle_model, q.vehicle_plate].filter(Boolean);
      return {
        id: q.id,
        quoteNumber: q.quote_number,
        totalCents: q.total_cents,
        status: q.status,
        validUntil: q.valid_until,
        isExpired: q.valid_until < todayStr && q.status !== 'converted',
        createdAt: q.created_at,
        vehicleSummary: vParts.length > 0 ? vParts.join(' · ') : null,
      };
    });

    const now = new Date();
    let daysSinceLastPurchase: number | null = null;
    let isInactive = false;
    if (cust.last_purchase_at) {
      const lastDate = new Date(cust.last_purchase_at);
      daysSinceLastPurchase = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      isInactive = daysSinceLastPurchase > 60;
    } else {
      const createdDate = new Date(cust.created_at);
      const daysSinceCreated = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      isInactive = daysSinceCreated > 60;
    }

    const salesCount = cust.sales_count || 0;
    const quotesCount = cust.quotes_count || 0;
    const quotesAcceptedCount = cust.quotes_accepted_count || 0;
    const totalSpentCents = cust.total_spent_cents || 0;

    return {
      id: cust.id,
      name: cust.name,
      customerType: cust.customer_type,
      phone: cust.phone,
      cuit: cust.cuit,
      email: cust.email,
      address: cust.address,
      city: cust.city,
      notes: cust.notes,
      totalSpentCents,
      salesCount,
      quotesCount,
      quotesAcceptedCount,
      quoteConversionRatePct: quotesCount > 0 ? Math.round((quotesAcceptedCount / quotesCount) * 100) : 0,
      averageTicketCents: salesCount > 0 ? Math.round(totalSpentCents / salesCount) : 0,
      lastPurchaseAt: cust.last_purchase_at,
      daysSinceLastPurchase,
      isInactive,
      createdAt: cust.created_at,
      updatedAt: cust.updated_at,
      vehicles,
      recentSales,
      recentQuotes,
    };
  }

  /**
   * Da de alta un nuevo cliente y opcionalmente sus vehículos iniciales.
   */
  async createCustomer(input: CustomerCreateInput): Promise<CustomerProfileDetail> {
    const now = nowIso();
    const { name, customerType = 'particular', phone, cuit, email, address, city = 'San Carlos de Bariloche', notes, vehicles = [] } = input;

    const res = await this.ctx.db
      .prepare(
        `INSERT INTO customers (
           name, customer_type, phone, cuit, email, address, city, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name.trim(),
        customerType,
        phone?.trim() || null,
        cuit?.trim() || null,
        email?.trim() || null,
        address?.trim() || null,
        city?.trim() || 'San Carlos de Bariloche',
        notes?.trim() || null,
        now,
        now,
      )
      .run();

    const customerId = res.meta.last_row_id;

    // Agregar vehículos iniciales si se pasaron
    if (vehicles.length > 0) {
      for (const v of vehicles) {
        if (v.plate || v.brand || v.model) {
          await this.addVehicle(customerId, v);
        }
      }
    }

    return (await this.getCustomerById(customerId))!;
  }

  /**
   * Actualiza los datos de un cliente existente.
   */
  async updateCustomer(id: number, input: CustomerUpdateInput): Promise<CustomerProfileDetail> {
    const existing = await this.getCustomerById(id);
    if (!existing) {
      throw Errors.notFound(`El cliente id ${id}`);
    }

    const now = nowIso();
    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const customerType = input.customerType !== undefined ? input.customerType : existing.customerType;
    const phone = input.phone !== undefined ? (input.phone?.trim() || null) : existing.phone;
    const cuit = input.cuit !== undefined ? (input.cuit?.trim() || null) : existing.cuit;
    const email = input.email !== undefined ? (input.email?.trim() || null) : existing.email;
    const address = input.address !== undefined ? (input.address?.trim() || null) : existing.address;
    const city = input.city !== undefined ? (input.city?.trim() || 'San Carlos de Bariloche') : existing.city;
    const notes = input.notes !== undefined ? (input.notes?.trim() || null) : existing.notes;

    await this.ctx.db
      .prepare(
        `UPDATE customers
         SET name = ?, customer_type = ?, phone = ?, cuit = ?, email = ?, address = ?, city = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(name, customerType, phone, cuit, email, address, city, notes, now, id)
      .run();

    return (await this.getCustomerById(id))!;
  }

  /**
   * Agrega un vehículo a la flota de un cliente.
   */
  async addVehicle(customerId: number, input: CustomerVehicleInput): Promise<CustomerVehicleDetail> {
    const now = nowIso();
    const res = await this.ctx.db
      .prepare(
        `INSERT INTO customer_vehicles (
           customer_id, brand, model, year, engine, plate, notes, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customerId,
        input.brand?.trim() || null,
        input.model?.trim() || null,
        input.year || null,
        input.engine?.trim() || null,
        input.plate?.trim() ? input.plate.trim().toUpperCase() : null,
        input.notes?.trim() || null,
        now,
      )
      .run();

    return {
      id: res.meta.last_row_id,
      customerId,
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      year: input.year || null,
      engine: input.engine?.trim() || null,
      plate: input.plate?.trim() ? input.plate.trim().toUpperCase() : null,
      notes: input.notes?.trim() || null,
      createdAt: now,
    };
  }

  /**
   * Elimina un vehículo registrado.
   */
  async deleteVehicle(id: number): Promise<void> {
    await this.ctx.db.prepare('DELETE FROM customer_vehicles WHERE id = ?').bind(id).run();
  }
}
