-- Migración 0007: Bloque 1
-- 1. Roles de negocio detallados (Supervisor General, Administrativo, Supervisor de Ventas, Encargado de Salón, Vendedor con tope 5%)
-- 2. Control de Cuentas Oficiales y Mails para Hugo
-- 3. Productos: Fecha última compra, Fecha última venta, Porcentaje de Flete y Códigos de barras/SKUs relevados en mostrador
-- 4. POS: Carga manual de productos fuera de catálogo con motivo obligatorio
-- 5. Presupuestos: Número de vendedor, Número de seguimiento, Estado de acreditación/viabilidad y motivos de pérdida

-- ---------------------------------------------------------------------------
-- 1. Ampliación de Usuarios y Tope de 5% para Vendedores
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN job_role TEXT NOT NULL DEFAULT 'vendedor'
  CHECK (job_role IN ('supervisor_general', 'administrativo', 'supervisor_ventas', 'encargado_salon', 'vendedor'));
ALTER TABLE users ADD COLUMN seller_number TEXT CHECK (seller_number IS NULL OR length(seller_number) <= 20);
ALTER TABLE users ADD COLUMN max_discount_pct REAL NOT NULL DEFAULT 5 CHECK (max_discount_pct >= 0 AND max_discount_pct <= 100);

UPDATE users SET job_role = 'supervisor_general', max_discount_pct = 100, seller_number = 'SUP-01' WHERE role = 'admin';
UPDATE settings SET value = '5' WHERE key = 'max_seller_discount_pct' AND value = '0';

-- ---------------------------------------------------------------------------
-- 2. Control de Cuentas Oficiales y Mails para Hugo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS official_accounts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type        TEXT    NOT NULL DEFAULT 'email'
                        CHECK (account_type IN ('email', 'whatsapp', 'mercadolibre', 'banco_payway', 'proveedor_portal')),
  account_identifier  TEXT    NOT NULL CHECK (length(account_identifier) BETWEEN 1 AND 150),
  assigned_user_name  TEXT    NOT NULL CHECK (length(assigned_user_name) BETWEEN 1 AND 100),
  assigned_role       TEXT    NOT NULL DEFAULT 'vendedor',
  contacts_scope      TEXT    NOT NULL CHECK (length(contacts_scope) BETWEEN 1 AND 500),
  restrictions_notes  TEXT    CHECK (restrictions_notes IS NULL OR length(restrictions_notes) <= 500),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO official_accounts (account_type, account_identifier, assigned_user_name, assigned_role, contacts_scope, restrictions_notes)
SELECT 'email', 'administracion@rodamientoshugo.com.ar', 'Hugo Fernández / Administrativo', 'administrativo', 'Facturación de proveedores (Alfa Rodamientos, SKF, DBH), AFIP y bancos', 'Prohibido compartir clave fuera de administración. Solo recepción de facturas y pagos.'
WHERE NOT EXISTS (SELECT 1 FROM official_accounts);

INSERT INTO official_accounts (account_type, account_identifier, assigned_user_name, assigned_role, contacts_scope, restrictions_notes)
SELECT 'email', 'ventas@rodamientoshugo.com.ar', 'Encargado de Salón / Mostrador', 'encargado_salon', 'Presupuestos a empresas, flotas de Bariloche y talleres mecánicos', 'Copia obligatoria a supervisión en presupuestos mayores a $500.000.'
WHERE (SELECT COUNT(*) FROM official_accounts) = 1;

INSERT INTO official_accounts (account_type, account_identifier, assigned_user_name, assigned_role, contacts_scope, restrictions_notes)
SELECT 'whatsapp', '+54 9 294 462-9707 (WhatsApp Mostrador)', 'Equipo de Ventas y Supervisor de Ventas', 'supervisor_ventas', 'Consultas diarias de clientes, envío de presupuestos COT y seguimiento', 'Todo contacto nuevo debe agendarse en el CRM con Nombre + Taller/Vehículo.'
WHERE (SELECT COUNT(*) FROM official_accounts) = 2;

INSERT INTO official_accounts (account_type, account_identifier, assigned_user_name, assigned_role, contacts_scope, restrictions_notes)
SELECT 'mercadolibre', 'Cuenta Oficial MercadoLibre / MercadoPago', 'Hugo Fernández (Supervisor General)', 'supervisor_general', 'Compras puntuales de repuestos fuera de catálogo (ej. retenes especiales) y cobros QR', 'Si un vendedor compra o vende un ítem de ML, debe cargarlo manual en POS indicando motivo.'
WHERE (SELECT COUNT(*) FROM official_accounts) = 3;

-- ---------------------------------------------------------------------------
-- 3. Productos: Fecha última compra, Fecha última venta y Flete (%)
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN freight_pct REAL NOT NULL DEFAULT 0 CHECK (freight_pct >= 0 AND freight_pct <= 200);
ALTER TABLE products ADD COLUMN last_purchase_at TEXT;
ALTER TABLE products ADD COLUMN last_sale_at TEXT;

-- Backfill fechas de última compra y venta desde movimientos históricos
UPDATE products
SET last_sale_at = (
  SELECT MAX(sm.created_at)
  FROM stock_movements sm
  WHERE sm.product_id = products.id AND sm.type = 'sale'
)
WHERE last_sale_at IS NULL;

UPDATE products
SET last_purchase_at = (
  SELECT MAX(sm.created_at)
  FROM stock_movements sm
  WHERE sm.product_id = products.id AND sm.type IN ('purchase', 'initial')
)
WHERE last_purchase_at IS NULL;

-- Precarga de los códigos de barras y códigos técnicos relevados en las notas:
-- 803640, 7316577741530, 8430632081399, 84737510308, 7316577303004, CR1032, DBH1359, DBH1197P, 5527.0
INSERT OR IGNORE INTO categories (name, active) VALUES ('Rodamientos Automotor', 1);
INSERT OR IGNORE INTO categories (name, active) VALUES ('Retenes y Sellos', 1);
INSERT OR IGNORE INTO categories (name, active) VALUES ('Crapodinas y Embrague', 1);

INSERT OR IGNORE INTO products (
  sku, name, description, brand, category_id, unit, price_cents, cost_cents, stock, min_stock, target_stock,
  active, shelf_number, shelf_level, compartment, location, inner_diameter_mm, outer_diameter_mm, width_mm, dimensions,
  supplier_name, supplier_code, freight_pct, last_purchase_at
) VALUES
  ('803640', 'Rodamiento Especial 803640 Embrague / Transmisión', 'Rodamiento técnico código 803640', 'FAG', (SELECT id FROM categories WHERE name = 'Rodamientos Automotor' LIMIT 1), 'unidad', 2850000, 1650000, 6, 2, 8, 1, 'E01', 'A', '1', 'E01-A-1', 25, 52, 15, '25x52x15 mm', 'Alfa Rodamientos', '803640', 6.5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('VKBA-3530', 'Kit Rodamiento de Rueda SKF (EAN 7316577741530)', 'Rodamiento de maza/rueda original SKF código EAN 7316577741530', 'SKF', (SELECT id FROM categories WHERE name = 'Rodamientos Automotor' LIMIT 1), 'unidad', 4690000, 2750000, 4, 2, 6, 1, 'E01', 'B', '2', 'E01-B-2', 39, 72, 37, '39x72x37 mm', 'Alfa Rodamientos', '7316577741530', 6.5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('6204-2RSH-SKF', 'Rodamiento Rígido de Bolas SKF (EAN 7316577303004)', 'Rodamiento blindado goma ambos lados SKF EAN 7316577303004', 'SKF', (SELECT id FROM categories WHERE name = 'Rodamientos Automotor' LIMIT 1), 'unidad', 1420000, 820000, 12, 4, 15, 1, 'E01', 'A', '3', 'E01-A-3', 20, 47, 14, '20x47x14 mm', 'Alfa Rodamientos', '7316577303004', 5.0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('IRB-081399', 'Rodamiento / Tensor Automotor (EAN 8430632081399)', 'Pieza técnica código de barras 8430632081399', 'IRB', (SELECT id FROM categories WHERE name = 'Rodamientos Automotor' LIMIT 1), 'unidad', 3150000, 1890000, 5, 2, 6, 1, 'E02', 'A', '1', 'E02-A-1', 30, 62, 16, '30x62x16 mm', 'Alfa Rodamientos', '8430632081399', 6.0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('TIM-510308', 'Rodamiento Cónico / Maza (UPC 84737510308)', 'Rodamiento código de barras 84737510308', 'TIMKEN', (SELECT id FROM categories WHERE name = 'Rodamientos Automotor' LIMIT 1), 'unidad', 5200000, 3100000, 3, 1, 4, 1, 'E02', 'B', '1', 'E02-B-1', 40, 80, 23, '40x80x23 mm', 'Alfa Rodamientos', '84737510308', 7.0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('CR1032', 'Crapodina / Rodamiento de Embrague CR1032', 'Rodamiento de empuje embrague código CR1032', 'PESARO', (SELECT id FROM categories WHERE name = 'Crapodinas y Embrague' LIMIT 1), 'unidad', 3480000, 2050000, 5, 2, 6, 1, 'E03', 'A', '2', 'E03-A-2', 32, 65, 22, '32x65x22 mm', 'Alfa Rodamientos', 'CR1032', 6.0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('DBH1359', 'Retén de Distribución / Palier DBH 1359', 'Retén técnico alta temperatura código DBH1359', 'DBH', (SELECT id FROM categories WHERE name = 'Retenes y Sellos' LIMIT 1), 'unidad', 890000, 480000, 8, 3, 12, 1, 'E04', 'A', '1', 'E04-A-1', 35, 52, 8, '35x52x8 mm', 'Alfa Rodamientos', 'DBH1359', 4.5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('DBH1197P', 'Retén de Bancada / Rueda DBH 1197 P (Poliacrílico)', 'Retén compuesto especial P código DBH1197P', 'DBH', (SELECT id FROM categories WHERE name = 'Retenes y Sellos' LIMIT 1), 'unidad', 1150000, 620000, 7, 3, 10, 1, 'E04', 'A', '2', 'E04-A-2', 42, 62, 10, '42x62x10 mm', 'Alfa Rodamientos', 'DBH1197P', 4.5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('5527.0', 'Retén / Sello Técnico Código 5527.0', 'Retén línea automotriz e industrial código 5527.0', 'SAV', (SELECT id FROM categories WHERE name = 'Retenes y Sellos' LIMIT 1), 'unidad', 950000, 510000, 10, 3, 12, 1, 'E04', 'B', '1', 'E04-B-1', 38, 58, 9, '38x58x9 mm', 'Alfa Rodamientos', '5527.0', 4.5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Asociar los códigos de barra EAN/UPC en product_barcodes para lectura con pistola lectora
INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, '803640', 1, 1 FROM products WHERE sku = '803640';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, '7316577741530', 1, 1 FROM products WHERE sku = 'VKBA-3530';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, '7316577303004', 1, 1 FROM products WHERE sku = '6204-2RSH-SKF';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, '8430632081399', 1, 1 FROM products WHERE sku = 'IRB-081399';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, '84737510308', 1, 1 FROM products WHERE sku = 'TIM-510308';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, 'CR1032', 1, 1 FROM products WHERE sku = 'CR1032';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, 'DBH1359', 1, 1 FROM products WHERE sku = 'DBH1359';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, 'DBH1197P', 1, 1 FROM products WHERE sku = 'DBH1197P';

INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active)
SELECT id, '5527.0', 1, 1 FROM products WHERE sku = '5527.0';

-- ---------------------------------------------------------------------------
-- 4. POS: Carga Manual de Productos fuera de catálogo con motivo obligatorio
-- ---------------------------------------------------------------------------
ALTER TABLE sale_items ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0 CHECK (is_manual IN (0, 1));
ALTER TABLE sale_items ADD COLUMN manual_reason TEXT CHECK (manual_reason IS NULL OR length(manual_reason) <= 300);

-- ---------------------------------------------------------------------------
-- 5. Presupuestos: Seguimiento comercial, Nº Vendedor, Nº Seguimiento y Motivos
-- ---------------------------------------------------------------------------
ALTER TABLE quotes ADD COLUMN seller_number TEXT CHECK (seller_number IS NULL OR length(seller_number) <= 30);
ALTER TABLE quotes ADD COLUMN tracking_number TEXT CHECK (tracking_number IS NULL OR length(tracking_number) <= 40);
ALTER TABLE quotes ADD COLUMN follow_up_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (follow_up_status IN ('pending', 'following', 'accredited', 'not_viable'));
ALTER TABLE quotes ADD COLUMN loss_reason TEXT CHECK (loss_reason IS NULL OR length(loss_reason) <= 200);
ALTER TABLE quotes ADD COLUMN follow_up_notes TEXT CHECK (follow_up_notes IS NULL OR length(follow_up_notes) <= 1000);

-- Backfill tracking_number y follow_up_status en presupuestos existentes
UPDATE quotes
SET tracking_number = 'SEG-' || printf('%05d', id),
    seller_number = COALESCE(seller_number, 'V-0' || user_id),
    follow_up_status = CASE
      WHEN status IN ('converted', 'accepted') THEN 'accredited'
      WHEN status = 'rejected' THEN 'not_viable'
      WHEN status = 'sent' THEN 'following'
      ELSE 'pending'
    END
WHERE tracking_number IS NULL;
