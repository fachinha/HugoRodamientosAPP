-- Migración 0002: Facturas de compra de proveedores y alias de productos
-- Convenciones:
--   * Importes en centavos (INTEGER)
--   * Timestamps en UTC ISO-8601
--   * Código de proveedor y CUIT normalizados

CREATE TABLE supplier_invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name   TEXT    NOT NULL CHECK (length(supplier_name) BETWEEN 1 AND 120),
  supplier_cuit   TEXT    CHECK (supplier_cuit IS NULL OR length(supplier_cuit) BETWEEN 10 AND 20),
  invoice_number  TEXT    NOT NULL CHECK (length(invoice_number) BETWEEN 3 AND 50),
  invoice_date    TEXT    NOT NULL, -- YYYY-MM-DD
  subtotal_cents  INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents       INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents     INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  items_count     INTEGER NOT NULL DEFAULT 0 CHECK (items_count >= 0),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  raw_data        TEXT,   -- JSON estructurado devuelto por la IA
  notes           TEXT    CHECK (notes IS NULL OR length(notes) <= 500),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_supplier_invoices_cuit ON supplier_invoices(supplier_cuit);
CREATE INDEX idx_supplier_invoices_number ON supplier_invoices(invoice_number);
CREATE INDEX idx_supplier_invoices_created ON supplier_invoices(created_at);

-- Memoria de equivalencias: asocia un código de proveedor específico a un producto del catálogo de Hugo
CREATE TABLE supplier_product_aliases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_cuit  TEXT    NOT NULL CHECK (length(supplier_cuit) BETWEEN 10 AND 20),
  supplier_code  TEXT    NOT NULL COLLATE NOCASE CHECK (length(supplier_code) BETWEEN 1 AND 64),
  product_id     INTEGER NOT NULL REFERENCES products(id),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_supplier_alias ON supplier_product_aliases(supplier_cuit, supplier_code);
CREATE INDEX idx_supplier_alias_product ON supplier_product_aliases(product_id);
