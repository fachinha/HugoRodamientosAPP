import type { ServiceContext } from '../env';
import type { Settings } from '../../shared/schemas';
import { Errors } from '../lib/errors';
import { auditStmt, nowIso, bool } from '../lib/db';
import { hashPassword } from '../lib/crypto';

export class SettingsService {
  constructor(private ctx: ServiceContext) {}

  async getSettings(): Promise<Settings> {
    const rows = await this.ctx.db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
    const map = new Map(rows.results.map((r) => [r.key, JSON.parse(r.value)]));

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

  // Gestión de usuarios
  async listUsers(): Promise<{
    id: number;
    username: string;
    displayName: string;
    role: string;
    active: boolean;
    createdAt: string;
  }[]> {
    const rows = await this.ctx.db
      .prepare('SELECT id, username, display_name, role, active, created_at FROM users ORDER BY id ASC')
      .all<any>();

    return rows.results.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      active: bool(r.active),
      createdAt: r.created_at,
    }));
  }

  async createUser(data: { username: string; displayName: string; role: 'admin' | 'seller'; password: string }): Promise<number> {
    const existing = await this.ctx.db
      .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
      .bind(data.username)
      .first<{ id: number }>();

    if (existing) {
      throw Errors.conflict('USERNAME_ALREADY_EXISTS', `El usuario "${data.username}" ya existe.`);
    }

    const hash = await hashPassword(data.password);
    const now = nowIso();

    const res = await this.ctx.db
      .prepare(
        `INSERT INTO users (username, display_name, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(data.username, data.displayName, hash, data.role, now, now)
      .run();

    const newId = res.meta.last_row_id;
    await auditStmt(this.ctx, 'user.create', 'users', newId, {
      username: data.username,
      role: data.role,
    }).run();

    return newId;
  }

  async updateUser(
    id: number,
    data: { displayName?: string; role?: 'admin' | 'seller'; active?: boolean; password?: string },
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
        active: data.active,
        passwordChanged: !!data.password,
      }).run();
    }
  }
}
