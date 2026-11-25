-- Migración 0004: CRM, Gestión de Clientes, Flotas y Métricas de Rentabilidad
-- Permite fidelizar clientes (particulares y empresas), asociar vehículos y analizar
-- márgenes financieros y costos históricos de mercadería vendida.

CREATE TABLE customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  customer_type   TEXT    NOT NULL DEFAULT 'particular' CHECK (customer_type IN ('particular', 'empresa')),
  phone           TEXT    CHECK (phone IS NULL OR length(phone) <= 40),
  cuit            TEXT    CHECK (cuit IS NULL OR length(cuit) <= 25),
  email           TEXT    CHECK (email IS NULL OR length(email) <= 150),
  address         TEXT    CHECK (address IS NULL OR length(address) <= 250),
  city            TEXT    DEFAULT 'San Carlos de Bariloche',
  notes           TEXT    CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_cuit ON customers(cuit);
CREATE INDEX idx_customers_type ON customers(customer_type);
CREATE INDEX idx_customers_created ON customers(created_at);

CREATE TABLE customer_vehicles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  brand           TEXT    CHECK (brand IS NULL OR length(brand) <= 60),
  model           TEXT    CHECK (model IS NULL OR length(model) <= 60),
  year            INTEGER CHECK (year IS NULL OR year BETWEEN 1950 AND 2050),
  engine          TEXT    CHECK (engine IS NULL OR length(engine) <= 40),
  plate           TEXT    CHECK (plate IS NULL OR length(plate) <= 20),
  notes           TEXT    CHECK (notes IS NULL OR length(notes) <= 500),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_cust_vehicles_customer ON customer_vehicles(customer_id);
CREATE INDEX idx_cust_vehicles_plate ON customer_vehicles(plate COLLATE NOCASE);

-- Alteración de tablas existentes
ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id);
ALTER TABLE quotes ADD COLUMN customer_id INTEGER REFERENCES customers(id);
ALTER TABLE sale_items ADD COLUMN unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0);

CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_quotes_customer_fk ON quotes(customer_id);

-- Poblar clientes iniciales a partir de cotizaciones ya existentes
INSERT INTO customers (name, customer_type, phone, cuit, email, notes, created_at, updated_at)
SELECT
  customer_name,
  customer_type,
  MAX(customer_phone),
  MAX(customer_cuit),
  MAX(customer_email),
  'Creado automáticamente desde cotizaciones',
  MIN(created_at),
  MAX(updated_at)
FROM quotes
WHERE customer_name IS NOT NULL AND trim(customer_name) <> ''
GROUP BY lower(trim(customer_name));

-- Vincular quotes a los clientes creados
UPDATE quotes
SET customer_id = (
  SELECT c.id FROM customers c WHERE lower(trim(c.name)) = lower(trim(quotes.customer_name)) LIMIT 1
)
WHERE customer_name IS NOT NULL AND trim(customer_name) <> '';

-- Poblar vehículos iniciales asociados a los clientes migrados
INSERT INTO customer_vehicles (customer_id, brand, model, year, engine, plate, notes, created_at)
SELECT DISTINCT
  q.customer_id,
  q.vehicle_brand,
  q.vehicle_model,
  q.vehicle_year,
  q.vehicle_engine,
  upper(trim(q.vehicle_plate)),
  'Migrado automáticamente desde cotización',
  q.created_at
FROM quotes q
WHERE q.customer_id IS NOT NULL
  AND ((q.vehicle_plate IS NOT NULL AND trim(q.vehicle_plate) <> '')
       OR (q.vehicle_brand IS NOT NULL AND trim(q.vehicle_brand) <> '')
       OR (q.vehicle_model IS NOT NULL AND trim(q.vehicle_model) <> ''));
