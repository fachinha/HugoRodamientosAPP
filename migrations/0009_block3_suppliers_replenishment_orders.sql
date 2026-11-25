-- Migración 0009: Bloque 3 (Pedido de Hugo Fernández 19/11 + Solución Comparador Multi-Proveedor)
-- 1. Directorio de Proveedores (alta de proveedores nuevos, flete %, demora en días a Bariloche, WhatsApp)
-- 2. Opciones y precios por proveedor para un mismo producto (comparador de precios, flete y alerta de demora ‼️)
-- 3. Bandeja de Reposición Inteligente: junta Vendido del Día + Faltantes de Stock + Señas de Clientes,
--    excluyendo lo que YA FUE PEDIDO ("y no se haya hecho").
-- 4. Órdenes de Pedido a Proveedores con ingreso automático a stock al recibir la mercadería.

-- ---------------------------------------------------------------------------
-- 1. Tabla de Proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 120),
  cuit                  TEXT    CHECK (cuit IS NULL OR length(cuit) <= 25),
  phone                 TEXT    CHECK (phone IS NULL OR length(phone) <= 40),
  email                 TEXT    CHECK (email IS NULL OR length(email) <= 150),
  contact_person        TEXT    CHECK (contact_person IS NULL OR length(contact_person) <= 100),
  city                  TEXT    DEFAULT 'Buenos Aires',
  lead_time_days        INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 1 AND lead_time_days <= 90),
  lead_time_alert_days  INTEGER NOT NULL DEFAULT 5 CHECK (lead_time_alert_days >= 1 AND lead_time_alert_days <= 90),
  freight_pct           REAL    NOT NULL DEFAULT 5.5 CHECK (freight_pct >= 0 AND freight_pct <= 200),
  payment_terms         TEXT    DEFAULT 'Cuenta corriente 30 días',
  brands_supplied       TEXT    CHECK (brands_supplied IS NULL OR length(brands_supplied) <= 300),
  notes                 TEXT    CHECK (notes IS NULL OR length(notes) <= 1000),
  active                INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO suppliers (name, cuit, phone, email, contact_person, city, lead_time_days, lead_time_alert_days, freight_pct, payment_terms, brands_supplied, notes)
VALUES
  ('Alfa Rodamientos', '30-58912345-9', '1148559000', 'pedidos@alfarodamientos.com.ar', 'Mesa de Pedidos Interior', 'Buenos Aires', 3, 5, 6.0, 'Cuenta Corriente 30/60 días', 'PESARO, HH, TARANTO, TOLEDO, ODEMCO, SKF', 'Despacho diario por expreso a Bariloche (llega en 72hs)'),
  ('Distribuidora Patagónica SKF / FAG', '30-64123987-1', '2994421100', 'ventas@patagonicarodamientos.com.ar', 'Roberto Gómez', 'Neuquén Capital', 2, 4, 3.5, 'Transferencia 15 días', 'SKF, FAG, INA, TIMKEN', 'Entrega rápida en 24/48hs desde Neuquén por comisionista'),
  ('Importadora Buenos Aires Sur', '30-70998877-4', '1152334455', 'mayorista@importadorasur.com.ar', 'Diego (Mayorista)', 'Buenos Aires', 8, 5, 7.5, 'Cuenta Corriente 30/60/90 días (-8% bonif.)', 'IRB, SAV, DBH, ETM, Alternativos', 'Más económico en lista pero demora 8 días hábiles en despachar a Bariloche');

-- ---------------------------------------------------------------------------
-- 2. Opciones Multi-Proveedor por Producto (Comparador de Precios, Flete y Demora)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_supplier_options (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id       INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name     TEXT    NOT NULL,
  supplier_code     TEXT    CHECK (supplier_code IS NULL OR length(supplier_code) <= 80),
  brand_offered     TEXT    CHECK (brand_offered IS NULL OR length(brand_offered) <= 80),
  unit_cost_cents   INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  freight_pct       REAL    NOT NULL DEFAULT 5.5 CHECK (freight_pct >= 0 AND freight_pct <= 200),
  lead_time_days    INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 1 AND lead_time_days <= 90),
  is_preferred      INTEGER NOT NULL DEFAULT 0 CHECK (is_preferred IN (0, 1)),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_prod_supplier_opt ON product_supplier_options(product_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_pso_product ON product_supplier_options(product_id);

-- Poblar opciones multi-proveedor automáticas para los productos del catálogo
-- Opción 1: Alfa Rodamientos (Entrega 3 días, flete 6%)
INSERT OR IGNORE INTO product_supplier_options (product_id, supplier_id, supplier_name, supplier_code, brand_offered, unit_cost_cents, freight_pct, lead_time_days, is_preferred)
SELECT
  p.id,
  s.id,
  s.name,
  COALESCE(p.supplier_code, p.sku),
  COALESCE(p.brand, 'PESARO / SKF'),
  COALESCE(p.cost_cents, CAST(p.price_cents * 0.58 AS INTEGER)),
  6.0,
  3,
  1
FROM products p
JOIN suppliers s ON s.name = 'Alfa Rodamientos'
WHERE p.active = 1;

-- Opción 2: Distribuidora Patagónica SKF / FAG (Entrega rápida 2 días, flete bajo 3.5%, costo +6% más alto)
INSERT OR IGNORE INTO product_supplier_options (product_id, supplier_id, supplier_name, supplier_code, brand_offered, unit_cost_cents, freight_pct, lead_time_days, is_preferred)
SELECT
  p.id,
  s.id,
  s.name,
  p.sku || '-PAT',
  COALESCE(p.brand, 'SKF / FAG'),
  CAST(COALESCE(p.cost_cents, p.price_cents * 0.58) * 1.06 AS INTEGER),
  3.5,
  2,
  0
FROM products p
JOIN suppliers s ON s.name = 'Distribuidora Patagónica SKF / FAG'
WHERE p.active = 1;

-- Opción 3: Importadora Buenos Aires Sur (Más barato -10%, pero DEMORA 8 DÍAS ‼️ Alerta de demora)
INSERT OR IGNORE INTO product_supplier_options (product_id, supplier_id, supplier_name, supplier_code, brand_offered, unit_cost_cents, freight_pct, lead_time_days, is_preferred)
SELECT
  p.id,
  s.id,
  s.name,
  'IMP-' || p.sku,
  COALESCE(p.brand, 'Alternativo'),
  CAST(COALESCE(p.cost_cents, p.price_cents * 0.58) * 0.90 AS INTEGER),
  7.5,
  8,
  0
FROM products p
JOIN suppliers s ON s.name = 'Importadora Buenos Aires Sur'
WHERE p.active = 1;

-- ---------------------------------------------------------------------------
-- 3. Órdenes de Pedido a Proveedores (para controlar qué ya fue pedido y qué falta pedir)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_purchase_orders (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number            TEXT    NOT NULL UNIQUE, -- PED-00001
  supplier_id             INTEGER REFERENCES suppliers(id),
  supplier_name           TEXT    NOT NULL,
  supplier_phone          TEXT,
  status                  TEXT    NOT NULL DEFAULT 'ordered'
                            CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  lead_time_days          INTEGER NOT NULL DEFAULT 3,
  expected_arrival_date   TEXT,   -- YYYY-MM-DD
  subtotal_cents          INTEGER NOT NULL DEFAULT 0,
  freight_pct             REAL    NOT NULL DEFAULT 0,
  freight_cents           INTEGER NOT NULL DEFAULT 0,
  total_cents             INTEGER NOT NULL DEFAULT 0,
  items_count             INTEGER NOT NULL DEFAULT 0,
  notes                   TEXT,
  user_id                 INTEGER NOT NULL REFERENCES users(id),
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_spo_status ON supplier_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_spo_supplier ON supplier_purchase_orders(supplier_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS supplier_purchase_order_items (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id                INTEGER NOT NULL REFERENCES supplier_purchase_orders(id) ON DELETE CASCADE,
  product_id              INTEGER REFERENCES products(id),
  deposit_id              INTEGER REFERENCES customer_deposits(id),
  sku                     TEXT    NOT NULL,
  name                    TEXT    NOT NULL,
  brand                   TEXT,
  supplier_code           TEXT,
  origin_reason           TEXT    NOT NULL DEFAULT 'low_stock'
                            CHECK (origin_reason IN ('sold_today', 'low_stock', 'customer_deposit', 'manual')),
  quantity                INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents         INTEGER NOT NULL DEFAULT 0,
  freight_pct             REAL    NOT NULL DEFAULT 0,
  landed_unit_cost_cents  INTEGER NOT NULL DEFAULT 0,
  line_total_cents        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_spoi_order ON supplier_purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_spoi_product ON supplier_purchase_order_items(product_id);
