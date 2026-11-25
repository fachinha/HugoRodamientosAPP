-- Migración 0011: Trazabilidad completa de Pedidos a Proveedores
-- Registra quién solicita el pedido (ordered_by_name) y quién confirma su recepción en el local (received_by_name, received_by_user_id, received_at, reception_notes).

ALTER TABLE supplier_purchase_orders ADD COLUMN ordered_by_name TEXT;
ALTER TABLE supplier_purchase_orders ADD COLUMN received_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE supplier_purchase_orders ADD COLUMN received_by_name TEXT;
ALTER TABLE supplier_purchase_orders ADD COLUMN received_at TEXT;
ALTER TABLE supplier_purchase_orders ADD COLUMN reception_notes TEXT;
