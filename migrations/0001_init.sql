-- Migración 0001: esquema inicial de Rodamientos Hugo
-- Convenciones:
--   * Importes en centavos (INTEGER) para evitar errores de punto flotante.
--   * Timestamps en UTC, formato ISO-8601 con milisegundos (ej. 2026-10-26T15:30:00.000Z).
--   * Códigos de barras y SKU siempre TEXT (preserva ceros iniciales).
--   * El stock nunca puede ser negativo (CHECK). Toda variación queda en stock_movements.

-- ---------------------------------------------------------------------------
-- Usuarios y sesiones
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(username) BETWEEN 3 AND 40),
  display_name     TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  password_hash    TEXT    NOT NULL,
  role             TEXT    NOT NULL CHECK (role IN ('admin', 'seller')),
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  failed_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until     TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id            TEXT    PRIMARY KEY,               -- SHA-256 (hex) del token; el token en claro nunca se guarda
  user_id       INTEGER NOT NULL REFERENCES users(id),
  expires_at    TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_agent    TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sku               TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(sku) BETWEEN 1 AND 64),
  name              TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description       TEXT    CHECK (description IS NULL OR length(description) <= 2000),
  brand             TEXT    CHECK (brand IS NULL OR length(brand) <= 80),
  category_id       INTEGER REFERENCES categories(id),
  unit              TEXT    NOT NULL DEFAULT 'unidad' CHECK (length(unit) BETWEEN 1 AND 20),
  price_cents       INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents        INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0),
  stock             INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock         INTEGER CHECK (min_stock IS NULL OR min_stock >= 0),     -- NULL = mínimo sin definir
  target_stock      INTEGER CHECK (target_stock IS NULL OR target_stock >= 0),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_movement_at  TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_products_name ON products(name COLLATE NOCASE);
CREATE INDEX idx_products_brand ON products(brand COLLATE NOCASE);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active_stock ON products(active, stock);

CREATE TABLE product_barcodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  code        TEXT    NOT NULL CHECK (length(code) BETWEEN 1 AND 64),
  is_primary  INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Un mismo código activo nunca puede pertenecer a dos productos (ni repetirse en el mismo).
CREATE UNIQUE INDEX ux_barcodes_active_code ON product_barcodes(code) WHERE active = 1;
-- Como máximo un código principal activo por producto.
CREATE UNIQUE INDEX ux_barcodes_primary ON product_barcodes(product_id) WHERE is_primary = 1 AND active = 1;
CREATE INDEX idx_barcodes_product ON product_barcodes(product_id);

-- ---------------------------------------------------------------------------
-- Medios de pago y ventas
-- ---------------------------------------------------------------------------
CREATE TABLE payment_methods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sales (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key    TEXT    NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 64),
  request_hash       TEXT    NOT NULL,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  payment_method_id  INTEGER NOT NULL REFERENCES payment_methods(id),
  subtotal_cents     INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents     INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0 AND discount_cents <= subtotal_cents),
  total_cents        INTEGER NOT NULL CHECK (total_cents = subtotal_cents - discount_cents),
  refunded_cents     INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= total_cents),
  status             TEXT    NOT NULL DEFAULT 'completed'
                       CHECK (status IN ('completed', 'partially_returned', 'returned', 'voided')),
  notes              TEXT    CHECK (notes IS NULL OR length(notes) <= 500),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sales_created ON sales(created_at);
CREATE INDEX idx_sales_user ON sales(user_id);

CREATE TABLE sale_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id           INTEGER NOT NULL REFERENCES sales(id),
  product_id        INTEGER NOT NULL REFERENCES products(id),
  -- Instantánea histórica: cambios futuros del producto no alteran la venta.
  sku               TEXT    NOT NULL,
  name              TEXT    NOT NULL,
  unit_price_cents  INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents  INTEGER NOT NULL CHECK (line_total_cents = unit_price_cents * quantity),
  returned_qty      INTEGER NOT NULL DEFAULT 0 CHECK (returned_qty >= 0 AND returned_qty <= quantity)
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

CREATE TABLE returns (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key  TEXT    NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 64),
  sale_id          INTEGER NOT NULL REFERENCES sales(id),
  user_id          INTEGER NOT NULL REFERENCES users(id),
  kind             TEXT    NOT NULL CHECK (kind IN ('return', 'void')),
  reason           TEXT    NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  refund_cents     INTEGER NOT NULL CHECK (refund_cents >= 0),
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_returns_sale ON returns(sale_id);

CREATE TABLE return_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id     INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id  INTEGER NOT NULL REFERENCES sale_items(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  restock       INTEGER NOT NULL DEFAULT 1 CHECK (restock IN (0, 1))
);
CREATE INDEX idx_return_items_return ON return_items(return_id);

-- ---------------------------------------------------------------------------
-- Movimientos de inventario (solo inserción)
-- ---------------------------------------------------------------------------
CREATE TABLE stock_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  type          TEXT    NOT NULL CHECK (type IN ('initial', 'purchase', 'sale', 'return', 'adjust_in', 'adjust_out', 'reversal')),
  quantity      INTEGER NOT NULL CHECK (quantity <> 0),
  stock_before  INTEGER NOT NULL CHECK (stock_before >= 0),
  stock_after   INTEGER NOT NULL CHECK (stock_after >= 0 AND stock_after = stock_before + quantity),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  reason        TEXT    CHECK (reason IS NULL OR length(reason) <= 500),
  ref_type      TEXT    CHECK (ref_type IS NULL OR ref_type IN ('sale', 'return', 'import', 'manual')),
  ref_id        INTEGER,
  op_key        TEXT    UNIQUE CHECK (op_key IS NULL OR length(op_key) BETWEEN 8 AND 64), -- idempotencia de operaciones manuales
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_movements_product_created ON stock_movements(product_id, created_at);
CREATE INDEX idx_movements_created ON stock_movements(created_at);
CREATE INDEX idx_movements_ref ON stock_movements(ref_type, ref_id);

CREATE TRIGGER trg_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements es de solo inserción'); END;
CREATE TRIGGER trg_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements es de solo inserción'); END;

-- ---------------------------------------------------------------------------
-- Configuración, auditoría y salida de notificaciones (futuro)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,   -- JSON
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  INTEGER REFERENCES users(id)
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT    NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  details     TEXT,            -- JSON
  ip          TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log es de solo inserción'); END;
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log es de solo inserción'); END;

-- Preparada para futuros avisos (correo, WhatsApp, SMS). No se usa en v1.
CREATE TABLE notification_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT    NOT NULL,
  payload     TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at     TEXT
);

-- ---------------------------------------------------------------------------
-- Datos de referencia mínimos (no son datos comerciales inventados)
-- ---------------------------------------------------------------------------
INSERT INTO payment_methods (name, sort_order) VALUES
  ('Efectivo', 1), ('Transferencia', 2), ('Tarjeta', 3), ('Otro', 4);

INSERT INTO settings (key, value) VALUES
  ('business_name', '"Rodamientos Hugo"'),
  ('max_seller_discount_pct', '0'),
  ('replenishment_fallback_factor', '2'),
  ('receipt_footer', '"Comprobante interno sin validez fiscal"');
