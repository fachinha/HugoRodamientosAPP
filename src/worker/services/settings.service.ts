import type { ServiceContext } from '../env';
import type { Settings } from '../../shared/schemas';
import { Errors } from '../lib/errors';
import { auditStmt, nowIso, bool } from '../lib/db';
import { hashPassword } from '../lib/crypto';

export class SettingsService {
  constructor(private ctx: ServiceContext) {}

  async getSettings(): Promise<Settings> {
    const rows = await this.ctx.db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
    const map = new Map<string, any>();
    for (const r of rows.results) {
      try {
        map.set(r.key, JSON.parse(r.value));
      } catch {
        map.set(r.key, r.value);
      }
    }

    return {
      businessName: map.get('business_name') ?? 'Rodamientos Hugo',
      maxSellerDiscountPct: map.get('max_seller_discount_pct') ?? 0,
      replenishmentFallbackFactor: map.get('replenishment_fallback_factor') ?? 2,
      receiptFooter: map.get('receipt_footer') ?? 'Comprobante interno sin validez fiscal',
    };
  }

  async updateSettings(data: Settings): Promise<Settings> {
    const now = nowIso();
    const batch = [
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('business_name', JSON.stringify(data.businessName), now, this.ctx.user.id),
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('max_seller_discount_pct', JSON.stringify(data.maxSellerDiscountPct), now, this.ctx.user.id),
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('replenishment_fallback_factor', JSON.stringify(data.replenishmentFallbackFactor), now, this.ctx.user.id),
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('receipt_footer', JSON.stringify(data.receiptFooter), now, this.ctx.user.id),
      auditStmt(this.ctx, 'settings.update', 'settings', null, data),
    ];

    await this.ctx.db.batch(batch);
    return this.getSettings();
  }

  // Cotización Dólar Blue (Automática en tiempo real vía DolarAPI + opción manual)
  async getExchangeRateInfo(forceRefresh = false): Promise<{
    rate: number;
    buyRate: number;
    sellRate: number;
    mode: 'auto' | 'manual';
    source: string;
    updatedAt: string;
  }> {
    const rows = await this.ctx.db
      .prepare("SELECT key, value FROM settings WHERE key IN ('exchange_rate_usd', 'exchange_rate_mode', 'exchange_rate_blue_cache')")
      .all<{ key: string; value: string }>();

    const map = new Map<string, any>();
    for (const r of rows.results) {
      try {
        map.set(r.key, JSON.parse(r.value));
      } catch {}
    }

    const mode: 'auto' | 'manual' = map.get('exchange_rate_mode') === 'manual' ? 'manual' : 'auto';
    const cache = map.get('exchange_rate_blue_cache') as
      | { buyRate: number; sellRate: number; updatedAt: string; fetchedAtMs: number }
      | undefined;

    const nowMs = Date.now();
    const cacheTTL = 5 * 60 * 1000; // 5 minutos

    if (mode === 'manual') {
      const manualRate = Number(map.get('exchange_rate_usd')) || cache?.sellRate || 1575;
      return {
        rate: manualRate,
        buyRate: cache?.buyRate || manualRate,
        sellRate: cache?.sellRate || manualRate,
        mode: 'manual',
        source: 'Fijado manualmente',
        updatedAt: cache?.updatedAt || nowIso(),
      };
    }

    // Modo automático: usar caché si es reciente (< 5 min) y no se pidió forceRefresh
    if (!forceRefresh && cache && cache.sellRate > 0 && nowMs - (cache.fetchedAtMs || 0) < cacheTTL) {
      return {
        rate: cache.sellRate,
        buyRate: cache.buyRate,
        sellRate: cache.sellRate,
        mode: 'auto',
        source: 'Dólar Blue (Automático)',
        updatedAt: cache.updatedAt,
      };
    }

    // Consultar cotización del Dólar Blue en vivo desde DolarAPI
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/blue', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data = (await res.json()) as { compra?: number; venta?: number; fechaActualizacion?: string };
        const sellRate = Number(data.venta) || 1575;
        const buyRate = Number(data.compra) || 1555;
        const updatedAt = data.fechaActualizacion || nowIso();
        const newCache = { buyRate, sellRate, updatedAt, fetchedAtMs: nowMs };
        const now = nowIso();

        await this.ctx.db.batch([
          this.ctx.db
            .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
            .bind('exchange_rate_blue_cache', JSON.stringify(newCache), now),
          this.ctx.db
            .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
            .bind('exchange_rate_usd', JSON.stringify(sellRate), now),
        ]);

        return {
          rate: sellRate,
          buyRate,
          sellRate,
          mode: 'auto',
          source: 'Dólar Blue (En vivo)',
          updatedAt,
        };
      }
    } catch {
      // Si no hay internet o el entorno de test está aislado, usar último caché o valor actual de referencia
    }

    const fallbackSell = cache?.sellRate || Number(map.get('exchange_rate_usd')) || 1575;
    const fallbackBuy = cache?.buyRate || Math.max(1, fallbackSell - 20);
    return {
      rate: fallbackSell,
      buyRate: fallbackBuy,
      sellRate: fallbackSell,
      mode: 'auto',
      source: 'Dólar Blue',
      updatedAt: cache?.updatedAt || nowIso(),
    };
  }

  async getExchangeRate(): Promise<number> {
    const info = await this.getExchangeRateInfo(false);
    return info.rate;
  }

  async setExchangeRate(rate?: number, mode?: 'auto' | 'manual'): Promise<{
    rate: number;
    buyRate: number;
    sellRate: number;
    mode: 'auto' | 'manual';
    source: string;
    updatedAt: string;
  }> {
    const now = nowIso();

    if (mode === 'auto' && rate === undefined) {
      await this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('exchange_rate_mode', JSON.stringify('auto'), now, this.ctx.user.id)
        .run();
      return this.getExchangeRateInfo(true);
    }

    const finalRate = rate ?? 1575;
    const finalMode = mode ?? 'manual';

    const batch = [
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('exchange_rate_usd', JSON.stringify(finalRate), now, this.ctx.user.id),
      this.ctx.db
        .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
        .bind('exchange_rate_mode', JSON.stringify(finalMode), now, this.ctx.user.id),
      auditStmt(this.ctx, 'settings.exchange_rate_update', 'settings', null, { rate: finalRate, mode: finalMode }),
    ];
    await this.ctx.db.batch(batch);
    return this.getExchangeRateInfo(false);
  }

  // Medios de pago
  async listPaymentMethods(): Promise<{ id: number; name: string; active: boolean; sortOrder: number }[]> {
    const rows = await this.ctx.db
      .prepare('SELECT id, name, active, sort_order FROM payment_methods ORDER BY sort_order ASC, id ASC')
      .all<any>();

    return rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      active: bool(r.active),
      sortOrder: r.sort_order,
    }));
  }

  async createPaymentMethod(name: string, sortOrder = 0): Promise<{ id: number; name: string; active: boolean }> {
    const res = await this.ctx.db
      .prepare('INSERT INTO payment_methods (name, active, sort_order) VALUES (?, 1, ?)')
      .bind(name.trim(), sortOrder)
      .run();

    const id = res.meta.last_row_id;
    await auditStmt(this.ctx, 'payment_method.create', 'payment_methods', id, { name }).run();

    return { id, name, active: true };
  }

  async updatePaymentMethod(
    id: number,
    data: { name?: string; active?: boolean; sortOrder?: number },
  ): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      params.push(data.name.trim());
    }
    if (data.active !== undefined) {
      fields.push('active = ?');
      params.push(data.active ? 1 : 0);
    }
    if (data.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      params.push(data.sortOrder);
    }

    if (fields.length > 0) {
      params.push(id);
      await this.ctx.db.prepare(`UPDATE payment_methods SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
      await auditStmt(this.ctx, 'payment_method.update', 'payment_methods', id, data).run();
    }
  }

  // Gestión de usuarios y roles detallados (Supervisor General, Administrativo, Supervisor Ventas, Encargado Salón, Vendedor)
  async listUsers(): Promise<{
    id: number;
    username: string;
    displayName: string;
    role: string;
    jobRole: string;
    sellerNumber: string | null;
    maxDiscountPct: number;
    active: boolean;
    createdAt: string;
  }[]> {
    const rows = await this.ctx.db
      .prepare('SELECT id, username, display_name, role, job_role, seller_number, max_discount_pct, active, created_at FROM users ORDER BY id ASC')
      .all<any>();

    return rows.results.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      jobRole: r.job_role || (r.role === 'admin' ? 'supervisor_general' : 'vendedor'),
      sellerNumber: r.seller_number || `V-0${r.id}`,
      maxDiscountPct: r.max_discount_pct ?? (r.role === 'admin' ? 100 : 5),
      active: bool(r.active),
      createdAt: r.created_at,
    }));
  }

  async createUser(data: {
    username: string;
    displayName: string;
    role: 'admin' | 'seller';
    jobRole?: string;
    sellerNumber?: string | null;
    maxDiscountPct?: number;
    password: string;
  }): Promise<number> {
    const existing = await this.ctx.db
      .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
      .bind(data.username)
      .first<{ id: number }>();

    if (existing) {
      throw Errors.conflict('USERNAME_ALREADY_EXISTS', `El usuario "${data.username}" ya existe.`);
    }

    const hash = await hashPassword(data.password);
    const now = nowIso();
    const jobRole = data.jobRole || (data.role === 'admin' ? 'supervisor_general' : 'vendedor');
    const maxDiscountPct =
      data.maxDiscountPct !== undefined
        ? data.maxDiscountPct
        : jobRole === 'vendedor'
          ? 5
          : 100;

    const res = await this.ctx.db
      .prepare(
        `INSERT INTO users (username, display_name, password_hash, role, job_role, seller_number, max_discount_pct, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(data.username, data.displayName, hash, data.role, jobRole, data.sellerNumber || null, maxDiscountPct, now, now)
      .run();

    const newId = res.meta.last_row_id;
    if (!data.sellerNumber) {
      await this.ctx.db
        .prepare('UPDATE users SET seller_number = ? WHERE id = ?')
        .bind(`V-0${newId}`, newId)
        .run();
    }

    await auditStmt(this.ctx, 'user.create', 'users', newId, {
      username: data.username,
      role: data.role,
      jobRole,
      maxDiscountPct,
    }).run();

    return newId;
  }

  async updateUser(
    id: number,
    data: {
      displayName?: string;
      role?: 'admin' | 'seller';
      jobRole?: string;
      sellerNumber?: string | null;
      maxDiscountPct?: number;
      active?: boolean;
      password?: string;
    },
  ): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [];
    const now = nowIso();

    if (data.displayName !== undefined) {
      fields.push('display_name = ?');
      params.push(data.displayName);
    }
    if (data.role !== undefined) {
      fields.push('role = ?');
      params.push(data.role);
    }
    if (data.jobRole !== undefined) {
      fields.push('job_role = ?');
      params.push(data.jobRole);
    }
    if (data.sellerNumber !== undefined) {
      fields.push('seller_number = ?');
      params.push(data.sellerNumber);
    }
    if (data.maxDiscountPct !== undefined) {
      fields.push('max_discount_pct = ?');
      params.push(data.maxDiscountPct);
    }
    if (data.active !== undefined) {
      fields.push('active = ?');
      params.push(data.active ? 1 : 0);
    }
    if (data.password !== undefined && data.password.trim()) {
      const hash = await hashPassword(data.password);
      fields.push('password_hash = ?');
      params.push(hash);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      params.push(now);
      params.push(id);

      await this.ctx.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
      await auditStmt(this.ctx, 'user.update', 'users', id, {
        displayName: data.displayName,
        role: data.role,
        jobRole: data.jobRole,
        maxDiscountPct: data.maxDiscountPct,
        active: data.active,
        passwordChanged: !!data.password,
      }).run();
    }
  }

  // Control de Cuentas Oficiales y Mails para Hugo
  async listOfficialAccounts(): Promise<{
    id: number;
    accountType: string;
    accountIdentifier: string;
    assignedUserName: string;
    assignedRole: string;
    contactsScope: string;
    restrictionsNotes: string | null;
    active: boolean;
    updatedAt: string;
  }[]> {
    const rows = await this.ctx.db
      .prepare('SELECT * FROM official_accounts ORDER BY id ASC')
      .all<any>();

    return (rows.results || []).map((r) => ({
      id: r.id,
      accountType: r.account_type,
      accountIdentifier: r.account_identifier,
      assignedUserName: r.assigned_user_name,
      assignedRole: r.assigned_role,
      contactsScope: r.contacts_scope,
      restrictionsNotes: r.restrictions_notes ?? null,
      active: bool(r.active),
      updatedAt: r.updated_at,
    }));
  }

  async createOfficialAccount(data: {
    accountType: string;
    accountIdentifier: string;
    assignedUserName: string;
    assignedRole: string;
    contactsScope: string;
    restrictionsNotes?: string | null;
  }): Promise<number> {
    const now = nowIso();
    const res = await this.ctx.db
      .prepare(
        `INSERT INTO official_accounts (
          account_type, account_identifier, assigned_user_name, assigned_role,
          contacts_scope, restrictions_notes, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        data.accountType,
        data.accountIdentifier.trim(),
        data.assignedUserName.trim(),
        data.assignedRole,
        data.contactsScope.trim(),
        data.restrictionsNotes?.trim() || null,
        now,
        now,
      )
      .run();

    const id = res.meta.last_row_id;
    await auditStmt(this.ctx, 'official_account.create', 'official_accounts', id, data).run();
    return id;
  }

  async deleteOfficialAccount(id: number): Promise<void> {
    await this.ctx.db.prepare('DELETE FROM official_accounts WHERE id = ?').bind(id).run();
    await auditStmt(this.ctx, 'official_account.delete', 'official_accounts', id, null).run();
  }
}
