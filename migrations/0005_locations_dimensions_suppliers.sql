-- Migración 0005: Ubicaciones en estanterías, medidas técnicas, proveedores y mejoras en POS
-- Hugo Repuestos

-- 1. Ampliación de la tabla de productos (Ubicaciones, Medidas y Proveedor habitual)
ALTER TABLE products ADD COLUMN shelf_number TEXT CHECK (shelf_number IS NULL OR length(shelf_number) <= 20);
ALTER TABLE products ADD COLUMN shelf_level TEXT CHECK (shelf_level IS NULL OR length(shelf_level) <= 10);
ALTER TABLE products ADD COLUMN compartment TEXT CHECK (compartment IS NULL OR length(compartment) <= 20);
ALTER TABLE products ADD COLUMN location TEXT CHECK (location IS NULL OR length(location) <= 60);

ALTER TABLE products ADD COLUMN inner_diameter_mm REAL CHECK (inner_diameter_mm IS NULL OR inner_diameter_mm >= 0);
ALTER TABLE products ADD COLUMN outer_diameter_mm REAL CHECK (outer_diameter_mm IS NULL OR outer_diameter_mm >= 0);
ALTER TABLE products ADD COLUMN width_mm REAL CHECK (width_mm IS NULL OR width_mm >= 0);
ALTER TABLE products ADD COLUMN dimensions TEXT CHECK (dimensions IS NULL OR length(dimensions) <= 80);

ALTER TABLE products ADD COLUMN supplier_name TEXT CHECK (supplier_name IS NULL OR length(supplier_name) <= 120);
ALTER TABLE products ADD COLUMN supplier_code TEXT CHECK (supplier_code IS NULL OR length(supplier_code) <= 80);

-- Índices para búsqueda ágil
CREATE INDEX IF NOT EXISTS idx_products_location ON products(location COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_dimensions ON products(dimensions COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_supplier_name ON products(supplier_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_supplier_code ON products(supplier_code COLLATE NOCASE);

-- 2. Ampliación de la tabla de ventas (Intereses por tarjeta, cuotas y tipo de cambio USD)
ALTER TABLE sales ADD COLUMN surcharge_cents INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_cents >= 0);
ALTER TABLE sales ADD COLUMN installments INTEGER NOT NULL DEFAULT 1 CHECK (installments >= 1 AND installments <= 48);
ALTER TABLE sales ADD COLUMN exchange_rate_usd REAL CHECK (exchange_rate_usd IS NULL OR exchange_rate_usd > 0);

-- 3. Medios de pago adicionales (Mercado Pago y Dólares en efectivo)
INSERT OR IGNORE INTO payment_methods (name, active, sort_order) VALUES ('Mercado Pago', 1, 4);
INSERT OR IGNORE INTO payment_methods (name, active, sort_order) VALUES ('Dólares Efectivo', 1, 5);

-- 4. Tabla de Catálogos Técnicos de Proveedores (Alfa Rodamientos: Pesaro, HH, Taranto, etc.)
CREATE TABLE IF NOT EXISTS supplier_catalog_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name       TEXT    NOT NULL,                            -- Ej: 'Alfa Rodamientos'
  brand               TEXT    NOT NULL,                            -- Ej: 'PESARO', 'HH', 'TARANTO', 'TOLEDO', 'ODEMCO'
  category            TEXT    NOT NULL,                            -- Ej: 'Rodamientos por Medida', 'Crucetas y Tricetas', 'Homocinéticas'
  code                TEXT    NOT NULL COLLATE NOCASE,             -- Código de proveedor / catálogo
  name                TEXT    NOT NULL,                            -- Descripción técnica
  inner_diameter_mm   REAL,                                        -- Diámetro interior d
  outer_diameter_mm   REAL,                                        -- Diámetro exterior D
  width_mm            REAL,                                        -- Espesor / Altura / Ancho B o T
  dimensions          TEXT,                                        -- Medida legible ej: 25x52x15
  application         TEXT,                                        -- Vehículos / cajas / usos compatibles
  original_code       TEXT,                                        -- Código original OEM o equivalencias (SKF, FAG, INA, etc.)
  price_cents         INTEGER DEFAULT 0,                           -- Precio de lista de referencia si existe
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_supplier_brand ON supplier_catalog_items(supplier_name, brand);
CREATE INDEX IF NOT EXISTS idx_catalog_category ON supplier_catalog_items(category);
CREATE INDEX IF NOT EXISTS idx_catalog_code ON supplier_catalog_items(code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_catalog_dimensions ON supplier_catalog_items(dimensions COLLATE NOCASE);
