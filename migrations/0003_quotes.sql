-- Migración 0003: Cotizador de Repuestos y Presupuestos para Hugo Repuestos
-- Soporta cotización para vehículos de clientes y empresas, desglose de IVA,
-- validez temporal, condiciones comerciales y trazabilidad con WhatsApp y ventas.

CREATE TABLE quotes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number       TEXT    NOT NULL UNIQUE, -- ej: COT-00001
  user_id            INTEGER NOT NULL REFERENCES users(id),
  customer_name      TEXT    NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 120),
  customer_phone     TEXT    CHECK (customer_phone IS NULL OR length(customer_phone) <= 30),
  customer_cuit      TEXT    CHECK (customer_cuit IS NULL OR length(customer_cuit) <= 20),
  customer_email     TEXT    CHECK (customer_email IS NULL OR length(customer_email) <= 120),
  customer_type      TEXT    NOT NULL DEFAULT 'particular' CHECK (customer_type IN ('particular', 'empresa')),
  
  -- Datos del vehículo cotizado
  vehicle_brand      TEXT    CHECK (vehicle_brand IS NULL OR length(vehicle_brand) <= 60),
  vehicle_model      TEXT    CHECK (vehicle_model IS NULL OR length(vehicle_model) <= 60),
  vehicle_year       INTEGER CHECK (vehicle_year IS NULL OR vehicle_year BETWEEN 1950 AND 2050),
  vehicle_engine     TEXT    CHECK (vehicle_engine IS NULL OR length(vehicle_engine) <= 40),
  vehicle_plate      TEXT    CHECK (vehicle_plate IS NULL OR length(vehicle_plate) <= 20),

  -- Importes y cálculos financieros en centavos
  subtotal_cents     INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents     INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  tax_cents          INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents        INTEGER NOT NULL CHECK (total_cents >= 0),
  includes_tax       INTEGER NOT NULL DEFAULT 1 CHECK (includes_tax IN (0, 1)), -- 1 = Precios con IVA incl., 0 = Discriminado

  -- Condiciones comerciales
  valid_days         INTEGER NOT NULL DEFAULT 5 CHECK (valid_days >= 1),
  valid_until        TEXT    NOT NULL, -- YYYY-MM-DD
  payment_terms      TEXT    NOT NULL DEFAULT 'Efectivo/Transferencia (dto.) - Tarjetas débito/crédito',
  notes              TEXT    CHECK (notes IS NULL OR length(notes) <= 1000),

  -- Estado del presupuesto
  status             TEXT    NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  converted_sale_id  INTEGER REFERENCES sales(id),

  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_quotes_number ON quotes(quote_number);
CREATE INDEX idx_quotes_customer ON quotes(customer_name COLLATE NOCASE);
CREATE INDEX idx_quotes_plate ON quotes(vehicle_plate COLLATE NOCASE);
CREATE INDEX idx_quotes_user ON quotes(user_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created ON quotes(created_at);

CREATE TABLE quote_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id          INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id        INTEGER REFERENCES products(id), -- Opcional: si proviene de catálogo
  sku               TEXT    CHECK (sku IS NULL OR length(sku) <= 64),
  description       TEXT    NOT NULL CHECK (length(description) BETWEEN 1 AND 250),
  brand             TEXT    CHECK (brand IS NULL OR length(brand) <= 80),
  unit_price_cents  INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  discount_pct      REAL    NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  line_total_cents  INTEGER NOT NULL CHECK (line_total_cents >= 0),
  availability      TEXT    NOT NULL DEFAULT 'in_stock'
                      CHECK (availability IN ('in_stock', 'to_order', 'confirm_lead_time')),
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX idx_quote_items_product ON quote_items(product_id);
