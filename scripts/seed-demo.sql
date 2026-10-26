-- Datos de demostración aislados para Rodamientos Hugo.
-- TODOS los códigos y SKUs llevan el prefijo 'DEMO-' para identificarlos claramente.
-- NUNCA ejecutar en la base de producción.

-- Categorías de muestra
INSERT OR IGNORE INTO categories (name, active) VALUES
  ('Rulemanes rígidos de bolas', 1),
  ('Rulemanes cónicos', 1),
  ('Retenes y sellos', 1),
  ('Correas en V y poli-V', 1),
  ('Grasas y lubricantes', 1);

-- Productos de demostración con diferentes situaciones de stock:
-- 1. DEMO-6205: Stock normal
-- 2. DEMO-6004: Stock bajo (alerta de reposición)
-- 3. DEMO-30206: Stock agotado (alerta urgente)
-- 4. DEMO-RET-3550: Sin mínimo definido (alerta para configurar)

-- Producto 1: Normal
INSERT OR IGNORE INTO products (
  sku, name, description, brand, category_id, unit,
  price_cents, cost_cents, stock, min_stock, target_stock, active
) VALUES (
  'DEMO-6205-2RS',
  'DEMO - Rulemán 6205 2RS blindado',
  'Rulemán rígido de una hilera de bolas con sellos de goma en ambos lados (25x52x15 mm).',
  'SKF',
  1,
  'unidad',
  1850000,
  950000,
  25,
  8,
  30,
  1
);
INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, 'DEMO-7316576620527', 1, 1 FROM products WHERE sku = 'DEMO-6205-2RS';

-- Producto 2: Stock bajo (3 unidades, mínimo 6 -> requiere reposición)
INSERT OR IGNORE INTO products (
  sku, name, description, brand, category_id, unit,
  price_cents, cost_cents, stock, min_stock, target_stock, active
) VALUES (
  'DEMO-6004-ZZ',
  'DEMO - Rulemán 6004 ZZ tapas metálicas',
  'Rulemán rígido de bolas con blindaje metálico en ambos lados (20x42x12 mm).',
  'FAG',
  1,
  'unidad',
  1420000,
  720000,
  3,
  6,
  15,
  1
);
INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, 'DEMO-4012801160045', 1, 1 FROM products WHERE sku = 'DEMO-6004-ZZ';

-- Producto 3: Agotado (0 unidades, mínimo 4 -> urgente)
INSERT OR IGNORE INTO products (
  sku, name, description, brand, category_id, unit,
  price_cents, cost_cents, stock, min_stock, target_stock, active
) VALUES (
  'DEMO-30206-J2',
  'DEMO - Rulemán cónico 30206 masa de rueda',
  'Rodamiento de rodillos cónicos para cubo de rueda delantera (30x62x17.25 mm).',
  'Timken',
  2,
  'unidad',
  2980000,
  1600000,
  0,
  4,
  12,
  1
);
INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, 'DEMO-0538933020621', 1, 1 FROM products WHERE sku = 'DEMO-30206-J2';

-- Producto 4: Sin stock mínimo definido (alerta de configuración)
INSERT OR IGNORE INTO products (
  sku, name, description, brand, category_id, unit,
  price_cents, cost_cents, stock, min_stock, target_stock, active
) VALUES (
  'DEMO-RET-355008',
  'DEMO - Retén de bancada 35x50x8 NBR',
  'Retén con labio simple y resorte para eje de 35 mm.',
  'Corteco',
  3,
  'unidad',
  890000,
  380000,
  12,
  NULL,
  NULL,
  1
);
INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, 'DEMO-7798035500801', 1, 1 FROM products WHERE sku = 'DEMO-RET-355008';
