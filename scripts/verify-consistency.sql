-- Script de verificación de consistencia de inventario para Rodamientos Hugo.
-- Compara el stock vigente en 'products' con la suma matemática de sus movimientos en 'stock_movements'.

SELECT
  p.id AS producto_id,
  p.sku,
  p.name AS producto,
  p.stock AS stock_en_tabla_productos,
  COALESCE(SUM(sm.quantity), 0) AS suma_movimientos,
  (p.stock - COALESCE(SUM(sm.quantity), 0)) AS diferencia
FROM products p
LEFT JOIN stock_movements sm ON sm.product_id = p.id
GROUP BY p.id
HAVING diferencia <> 0;

-- Si la consulta anterior devuelve 0 filas, el inventario es 100% consistente.
