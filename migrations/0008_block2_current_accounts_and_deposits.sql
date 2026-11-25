-- Migración 0008: Bloque 2 (Pedido de Hugo Fernández)
-- 1. Cuentas Corrientes de Clientes: Compromisos de Pago por mercadería retirada (con N° Factura / N° Remito)
--    y Recibos de dinero a cuenta en cualquier formato (Mercado Libre, Efectivo, Cheques, Transferencia, Mixto).
-- 2. Registro de Señas a cuenta de productos que deben pedirse a proveedores.

INSERT OR IGNORE INTO payment_methods (name, active, sort_order) VALUES ('Cuenta Corriente', 1, 6);

-- ---------------------------------------------------------------------------
-- 1. Movimientos de Cuenta Corriente (Compromisos de Pago y Recibos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_account_movements (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_number         TEXT    NOT NULL UNIQUE, -- CMP-00001 (Compromiso) o REC-00001 (Recibo)
  customer_id             INTEGER REFERENCES customers(id),
  customer_name           TEXT    NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 150),
  customer_phone          TEXT    CHECK (customer_phone IS NULL OR length(customer_phone) <= 40),
  customer_cuit           TEXT    CHECK (customer_cuit IS NULL OR length(customer_cuit) <= 25),
  movement_type           TEXT    NOT NULL CHECK (movement_type IN ('commitment', 'receipt')),
  invoice_number          TEXT    CHECK (invoice_number IS NULL OR length(invoice_number) <= 60),
  remito_number           TEXT    CHECK (remito_number IS NULL OR length(remito_number) <= 60),
  sale_id                 INTEGER REFERENCES sales(id),
  promised_payment_date   TEXT,   -- YYYY-MM-DD (fecha comprometida de pago cuando retira mercadería)
  withdrawn_by_name       TEXT    CHECK (withdrawn_by_name IS NULL OR length(withdrawn_by_name) <= 100),
  items_summary           TEXT    CHECK (items_summary IS NULL OR length(items_summary) <= 1000),
  payment_format          TEXT    CHECK (payment_format IS NULL OR payment_format IN ('efectivo', 'transferencia', 'cheque', 'mercado_libre', 'tarjeta', 'mixto')),
  payment_breakdown_json  TEXT,   -- JSON con desglose de formatos cuando entrega efectivo + cheque + mercado libre, etc.
  cheque_number           TEXT    CHECK (cheque_number IS NULL OR length(cheque_number) <= 60),
  cheque_bank             TEXT    CHECK (cheque_bank IS NULL OR length(cheque_bank) <= 80),
  cheque_due_date         TEXT,   -- YYYY-MM-DD (fecha de cobro del cheque)
  amount_cents            INTEGER NOT NULL CHECK (amount_cents > 0),
  notes                   TEXT    CHECK (notes IS NULL OR length(notes) <= 1000),
  user_id                 INTEGER NOT NULL REFERENCES users(id),
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cam_customer_name ON customer_account_movements(customer_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cam_customer_id ON customer_account_movements(customer_id);
CREATE INDEX IF NOT EXISTS idx_cam_type ON customer_account_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_cam_created ON customer_account_movements(created_at);

-- ---------------------------------------------------------------------------
-- 2. Registro de Señas por Productos que Deben Pedirse a Proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_deposits (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_number              TEXT    NOT NULL UNIQUE, -- SEN-00001
  customer_id                 INTEGER REFERENCES customers(id),
  customer_name               TEXT    NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 150),
  customer_phone              TEXT    CHECK (customer_phone IS NULL OR length(customer_phone) <= 40),
  product_id                  INTEGER REFERENCES products(id),
  product_sku                 TEXT    CHECK (product_sku IS NULL OR length(product_sku) <= 64),
  product_description         TEXT    NOT NULL CHECK (length(product_description) BETWEEN 1 AND 250),
  brand                       TEXT    CHECK (brand IS NULL OR length(brand) <= 80),
  supplier_name               TEXT    CHECK (supplier_name IS NULL OR length(supplier_name) <= 120),
  quantity                    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  estimated_unit_price_cents  INTEGER NOT NULL CHECK (estimated_unit_price_cents >= 0),
  estimated_total_cents       INTEGER NOT NULL CHECK (estimated_total_cents >= 0),
  deposit_amount_cents        INTEGER NOT NULL CHECK (deposit_amount_cents > 0),
  remaining_balance_cents     INTEGER NOT NULL CHECK (remaining_balance_cents >= 0),
  payment_format              TEXT    NOT NULL DEFAULT 'efectivo'
                                CHECK (payment_format IN ('efectivo', 'transferencia', 'cheque', 'mercado_libre', 'tarjeta')),
  payment_reference           TEXT    CHECK (payment_reference IS NULL OR length(payment_reference) <= 120),
  estimated_arrival_date      TEXT,   -- YYYY-MM-DD
  status                      TEXT    NOT NULL DEFAULT 'pending_order'
                                CHECK (status IN ('pending_order', 'ordered_to_supplier', 'arrived_in_store', 'delivered_and_settled', 'cancelled')),
  notes                       TEXT    CHECK (notes IS NULL OR length(notes) <= 1000),
  user_id                     INTEGER NOT NULL REFERENCES users(id),
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_deposits_status ON customer_deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_customer ON customer_deposits(customer_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_deposits_created ON customer_deposits(created_at);
