-- Migración 0010: Bloque 4
-- 1. Cash Flow Día a Día tipo Excel (Movimientos proyectados y reales de caja/bancos día por día)
-- 2. Conciliación Payway y Sábana Bancaria (Regla días Pares = Banco A / Impares = Banco B, cuotas por tarjeta y alerta de Compra Desconocida / Contracargo)
-- 3. Padrón del Parque Automotor y Estadística de Marcas, Modelos y Empresas Activas

-- ---------------------------------------------------------------------------
-- 1. Movimientos adicionales de Cash Flow (Egresos programados, pagos a proveedores, impuestos, fletes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cashflow_entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date      TEXT    NOT NULL, -- YYYY-MM-DD
  direction       TEXT    NOT NULL CHECK (direction IN ('in', 'out')),
  category        TEXT    NOT NULL DEFAULT 'operativo'
                    CHECK (category IN ('venta_mostrador', 'acreditacion_payway', 'cobro_cta_cte', 'pago_proveedor', 'flete_expreso', 'impuestos_afip', 'alquiler_servicios', 'otro')),
  description     TEXT    NOT NULL CHECK (length(description) BETWEEN 1 AND 250),
  bank_or_box     TEXT    NOT NULL DEFAULT 'Caja Efectivo',
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  status          TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('projected', 'confirmed')),
  user_id         INTEGER REFERENCES users(id),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cf_date ON cashflow_entries(entry_date);

-- Precargar movimientos de ejemplo en el Cash Flow para visualizar la planilla día a día tipo Excel
INSERT INTO cashflow_entries (entry_date, direction, category, description, bank_or_box, amount_cents, status)
SELECT strftime('%Y-%m-%d', 'now', '-1 day'), 'out', 'flete_expreso', 'Pago Expreso Oro Negro (Flete bultos Alfa Rodamientos)', 'Caja Efectivo', 2450000, 'confirmed'
WHERE NOT EXISTS (SELECT 1 FROM cashflow_entries);

INSERT INTO cashflow_entries (entry_date, direction, category, description, bank_or_box, amount_cents, status)
SELECT strftime('%Y-%m-%d', 'now'), 'out', 'pago_proveedor', 'Transferencia parcial Alfa Rodamientos', 'Banco Patagonia (Días Pares)', 8500000, 'confirmed'
WHERE (SELECT COUNT(*) FROM cashflow_entries) = 1;

INSERT INTO cashflow_entries (entry_date, direction, category, description, bank_or_box, amount_cents, status)
SELECT strftime('%Y-%m-%d', 'now', '+2 days'), 'out', 'impuestos_afip', 'Vencimiento IVA / Ingresos Brutos Río Negro', 'Banco Nación (Días Impares)', 4200000, 'projected'
WHERE (SELECT COUNT(*) FROM cashflow_entries) = 2;

-- ---------------------------------------------------------------------------
-- 2. Conciliación Payway / Sábana Bancaria y Casos de Compra Desconocida
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payway_reconciliations (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id                 INTEGER REFERENCES sales(id),
  sale_date               TEXT    NOT NULL, -- YYYY-MM-DD
  day_parity              TEXT    NOT NULL CHECK (day_parity IN ('par', 'impar')),
  assigned_bank           TEXT    NOT NULL, -- Banco asignado automáticamente según día par o impar
  card_type               TEXT    NOT NULL DEFAULT 'credito' CHECK (card_type IN ('debito', 'credito')),
  card_brand              TEXT    NOT NULL DEFAULT 'Visa',
  installments            INTEGER NOT NULL DEFAULT 1,
  gross_amount_cents      INTEGER NOT NULL CHECK (gross_amount_cents > 0),
  payway_fee_cents        INTEGER NOT NULL DEFAULT 0,
  expected_net_cents      INTEGER NOT NULL DEFAULT 0,
  expected_payout_date    TEXT    NOT NULL, -- YYYY-MM-DD
  coupon_number           TEXT,
  reconciliation_status   TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (reconciliation_status IN ('accredited', 'pending', 'missing_in_payway', 'unknown_purchase_dispute')),
  dispute_reason          TEXT,   -- Explicación cuando el cliente desconoce la compra o no figura en la sábana de Payway
  notes                   TEXT,
  updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_payway_sale_date ON payway_reconciliations(sale_date);
CREATE INDEX IF NOT EXISTS idx_payway_status ON payway_reconciliations(reconciliation_status);

-- Configuración por defecto de Bancos para Días Pares e Impares
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('bank_even_days', '"Banco Patagonia (Cta. Cte. Días Pares)"'),
  ('bank_odd_days', '"Banco Nación (Cta. Cte. Días Impares)"');

-- Precargar registros de conciliación Payway (incluyendo un caso real de Compra Desconocida / No figura en Payway)
INSERT INTO payway_reconciliations (
  sale_id, sale_date, day_parity, assigned_bank, card_type, card_brand, installments,
  gross_amount_cents, payway_fee_cents, expected_net_cents, expected_payout_date,
  coupon_number, reconciliation_status, dispute_reason, notes
)
SELECT
  NULL,
  strftime('%Y-%m-%d', 'now', '-2 days'),
  'par',
  'Banco Patagonia (Cta. Cte. Días Pares)',
  'credito',
  'Visa',
  3,
  6850000,
  411000,
  6439000,
  strftime('%Y-%m-%d', 'now'),
  'CUP-8841',
  'accredited',
  NULL,
  'Liquidación Payway Lote #412 acreditada en sábana Banco Patagonia'
WHERE NOT EXISTS (SELECT 1 FROM payway_reconciliations);

INSERT INTO payway_reconciliations (
  sale_id, sale_date, day_parity, assigned_bank, card_type, card_brand, installments,
  gross_amount_cents, payway_fee_cents, expected_net_cents, expected_payout_date,
  coupon_number, reconciliation_status, dispute_reason, notes
)
SELECT
  NULL,
  strftime('%Y-%m-%d', 'now', '-1 day'),
  'impar',
  'Banco Nación (Cta. Cte. Días Impares)',
  'credito',
  'Mastercard',
  6,
  9400000,
  752000,
  8648000,
  strftime('%Y-%m-%d', 'now', '+1 day'),
  'CUP-9104',
  'unknown_purchase_dispute',
  'Contracargo Payway Cód. 83: El titular de la tarjeta desconoció la compra en su resumen bancario. Payway retuvo la liquidación hasta presentar cupón firmado / factura.',
  'Presentar foto del cupón firmado y remito en portal Payway antes del viernes'
WHERE (SELECT COUNT(*) FROM payway_reconciliations) = 1;

INSERT INTO payway_reconciliations (
  sale_id, sale_date, day_parity, assigned_bank, card_type, card_brand, installments,
  gross_amount_cents, payway_fee_cents, expected_net_cents, expected_payout_date,
  coupon_number, reconciliation_status, dispute_reason, notes
)
SELECT
  NULL,
  strftime('%Y-%m-%d', 'now'),
  'par',
  'Banco Patagonia (Cta. Cte. Días Pares)',
  'debito',
  'Visa',
  1,
  4690000,
  75040,
  4614960,
  strftime('%Y-%m-%d', 'now', '+1 day'),
  'CUP-9255',
  'missing_in_payway',
  'No figura en la sábana de Payway del cierre de lote (posible terminal sin cierre de lote o venta por otra terminal).',
  'Verificar cierre de lote en Posnet mostrador'
WHERE (SELECT COUNT(*) FROM payway_reconciliations) = 2;

-- ---------------------------------------------------------------------------
-- 3. Padrón del Parque Automotor Argentino (Estadísticas Marca, Modelo y Aplicaciones)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automotive_padron (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_brand       TEXT    NOT NULL,
  vehicle_model       TEXT    NOT NULL,
  vehicle_category    TEXT    NOT NULL DEFAULT 'Pick-up / Utilitario',
  years_range         TEXT    NOT NULL DEFAULT '2012-2026',
  common_bearings     TEXT    NOT NULL, -- Rodamientos y retenes más vendidos para ese vehículo
  active_units_est    INTEGER NOT NULL DEFAULT 50,
  queries_count       INTEGER NOT NULL DEFAULT 1,
  sales_count         INTEGER NOT NULL DEFAULT 1,
  notes               TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO automotive_padron (vehicle_brand, vehicle_model, vehicle_category, years_range, common_bearings, active_units_est, queries_count, sales_count, notes)
SELECT 'Toyota', 'Hilux 2.8 / 3.0 4x4', 'Pick-up / Flota', '2005-2026', 'VKBA-3530, DBH1359 (Retén palier), Crucetas cardan, Crapodina CR1032', 420, 48, 34, 'Vehículo #1 en consultas de talleres y empresas de turismo/viales en Bariloche'
WHERE NOT EXISTS (SELECT 1 FROM automotive_padron);

INSERT INTO automotive_padron (vehicle_brand, vehicle_model, vehicle_category, years_range, common_bearings, active_units_est, queries_count, sales_count, notes)
SELECT 'Volkswagen', 'Amarok 2.0 TDI', 'Pick-up / Flota', '2010-2026', 'Maza delantera SKF, Rodamiento diferencial 32208, Tensor correa IRB-081399', 360, 39, 27, 'Alta rotación en mazas de rueda y tensores de distribución'
WHERE (SELECT COUNT(*) FROM automotive_padron) = 1;

INSERT INTO automotive_padron (vehicle_brand, vehicle_model, vehicle_category, years_range, common_bearings, active_units_est, queries_count, sales_count, notes)
SELECT 'Ford', 'Ranger 2.2 / 3.2 Puma', 'Pick-up / Flota', '2012-2026', 'TIM-510308, Retén bancada DBH1197P, Centro de cardan', 310, 35, 22, 'Frecuente en flotas de mantenimiento y servicios'
WHERE (SELECT COUNT(*) FROM automotive_padron) = 2;

INSERT INTO automotive_padron (vehicle_brand, vehicle_model, vehicle_category, years_range, common_bearings, active_units_est, queries_count, sales_count, notes)
SELECT 'Renault', 'Kangoo / Master', 'Utilitario / Reparto', '2008-2026', '6204-2RSH-SKF, Rodamiento rueda trasera, Retén distribución 5527.0', 480, 44, 31, 'Principal utilitario de reparto comercial en Bariloche'
WHERE (SELECT COUNT(*) FROM automotive_padron) = 3;

INSERT INTO automotive_padron (vehicle_brand, vehicle_model, vehicle_category, years_range, common_bearings, active_units_est, queries_count, sales_count, notes)
SELECT 'Mercedes-Benz', 'Sprinter 415 / 515 (Turismo)', 'Transporte / Turismo', '2012-2026', '803640, Crucetas reforzadas, Rodamientos diferencial y puente cardan', 290, 32, 25, 'Flotas activas de agencias de turismo y traslados en Bariloche'
WHERE (SELECT COUNT(*) FROM automotive_padron) = 4;

INSERT INTO automotive_padron (vehicle_brand, vehicle_model, vehicle_category, years_range, common_bearings, active_units_est, queries_count, sales_count, notes)
SELECT 'Volkswagen / Fiat', 'Gol Trend / Cronos', 'Automóvil Particular', '2010-2026', 'Kit rueda SKF, Crapodina embrague CR1032, Retenes árbol de levas', 650, 52, 41, 'Mayor volumen en mostrador para mecánicos particulares'
WHERE (SELECT COUNT(*) FROM automotive_padron) = 5;
