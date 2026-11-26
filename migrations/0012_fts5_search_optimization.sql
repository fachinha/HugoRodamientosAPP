-- Migración 0012: Optimización drástica de lecturas en Cloudflare D1 (FTS5 + Índices compuestos)
-- Reduce de ~250.000 filas leídas por búsqueda a ~20 filas leídas usando índices invertidos FTS5.

-- 1. Índices compuestos para paginación rápida sin escaneo completo
CREATE INDEX IF NOT EXISTS idx_products_active_name ON products(active, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_active_sku ON products(active, sku COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_active_price ON products(active, price_cents);
CREATE INDEX IF NOT EXISTS idx_products_active_updated ON products(active, updated_at);
CREATE INDEX IF NOT EXISTS idx_catalog_brand_only ON supplier_catalog_items(brand COLLATE NOCASE);

-- 2. Índice FTS5 para productos (búsqueda instantánea sin importar el orden de las palabras)
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  search_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO products_fts(rowid, search_text)
SELECT
  id,
  COALESCE(sku, '') || ' ' ||
  COALESCE(name, '') || ' ' ||
  COALESCE(brand, '') || ' ' ||
  COALESCE(description, '') || ' ' ||
  COALESCE(supplier_code, '') || ' ' ||
  COALESCE(supplier_name, '') || ' ' ||
  COALESCE(dimensions, '') || ' ' ||
  COALESCE(location, '') || ' ' ||
  REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(sku, '') || ' ' || COALESCE(supplier_code, ''), '-', ''), '.', ''), '/', ''), ' ', '')
FROM products;

CREATE TRIGGER IF NOT EXISTS trg_products_fts_ai AFTER INSERT ON products
BEGIN
  INSERT INTO products_fts(rowid, search_text)
  VALUES (
    NEW.id,
    COALESCE(NEW.sku, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.brand, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.supplier_code, '') || ' ' ||
    COALESCE(NEW.supplier_name, '') || ' ' ||
    COALESCE(NEW.dimensions, '') || ' ' ||
    COALESCE(NEW.location, '') || ' ' ||
    REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.sku, '') || ' ' || COALESCE(NEW.supplier_code, ''), '-', ''), '.', ''), '/', ''), ' ', '')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_products_fts_ad AFTER DELETE ON products
BEGIN
  DELETE FROM products_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_products_fts_bu
BEFORE UPDATE OF sku, name, brand, description, supplier_code, supplier_name, dimensions, location ON products
BEGIN
  DELETE FROM products_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_products_fts_au
AFTER UPDATE OF sku, name, brand, description, supplier_code, supplier_name, dimensions, location ON products
BEGIN
  INSERT INTO products_fts(rowid, search_text)
  VALUES (
    NEW.id,
    COALESCE(NEW.sku, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.brand, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.supplier_code, '') || ' ' ||
    COALESCE(NEW.supplier_name, '') || ' ' ||
    COALESCE(NEW.dimensions, '') || ' ' ||
    COALESCE(NEW.location, '') || ' ' ||
    REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.sku, '') || ' ' || COALESCE(NEW.supplier_code, ''), '-', ''), '.', ''), '/', ''), ' ', '')
  );
END;

-- 3. Índice FTS5 para catálogos técnicos de proveedores
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_items_fts USING fts5(
  search_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO catalog_items_fts(rowid, search_text)
SELECT
  id,
  COALESCE(code, '') || ' ' ||
  COALESCE(name, '') || ' ' ||
  COALESCE(brand, '') || ' ' ||
  COALESCE(supplier_name, '') || ' ' ||
  COALESCE(application, '') || ' ' ||
  COALESCE(original_code, '') || ' ' ||
  COALESCE(dimensions, '') || ' ' ||
  REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(code, '') || ' ' || COALESCE(original_code, ''), '-', ''), '.', ''), '/', ''), ' ', '')
FROM supplier_catalog_items;

CREATE TRIGGER IF NOT EXISTS trg_catalog_fts_ai AFTER INSERT ON supplier_catalog_items
BEGIN
  INSERT INTO catalog_items_fts(rowid, search_text)
  VALUES (
    NEW.id,
    COALESCE(NEW.code, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.brand, '') || ' ' ||
    COALESCE(NEW.supplier_name, '') || ' ' ||
    COALESCE(NEW.application, '') || ' ' ||
    COALESCE(NEW.original_code, '') || ' ' ||
    COALESCE(NEW.dimensions, '') || ' ' ||
    REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.code, '') || ' ' || COALESCE(NEW.original_code, ''), '-', ''), '.', ''), '/', ''), ' ', '')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_fts_ad AFTER DELETE ON supplier_catalog_items
BEGIN
  DELETE FROM catalog_items_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_fts_bu
BEFORE UPDATE OF code, name, brand, supplier_name, application, original_code, dimensions ON supplier_catalog_items
BEGIN
  DELETE FROM catalog_items_fts WHERE rowid = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_fts_au
AFTER UPDATE OF code, name, brand, supplier_name, application, original_code, dimensions ON supplier_catalog_items
BEGIN
  INSERT INTO catalog_items_fts(rowid, search_text)
  VALUES (
    NEW.id,
    COALESCE(NEW.code, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.brand, '') || ' ' ||
    COALESCE(NEW.supplier_name, '') || ' ' ||
    COALESCE(NEW.application, '') || ' ' ||
    COALESCE(NEW.original_code, '') || ' ' ||
    COALESCE(NEW.dimensions, '') || ' ' ||
    REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NEW.code, '') || ' ' || COALESCE(NEW.original_code, ''), '-', ''), '.', ''), '/', ''), ' ', '')
  );
END;
