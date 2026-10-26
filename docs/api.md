# Especificación de la API REST — Rodamientos Hugo

Todas las rutas públicas o protegidas se encuentran bajo el prefijo `/api`.

Los errores devuelven un código HTTP acorde y un cuerpo JSON estándar:
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stock insuficiente para confirmar la venta.",
    "details": { "productId": 12, "available": 2, "requested": 5 }
  }
}
```

---

## 1. Autenticación y configuración inicial (`/api/auth`)

### `GET /api/auth/status`
- **Público**: Indica si el sistema tiene al menos un usuario registrado.
- **Respuesta `200`**: `{ "initialized": true | false }`

### `POST /api/auth/setup`
- **Público**: Crea el primer usuario Administrador.
- **Seguridad**: Solo responde mientras no exista ningún usuario y exige el `SETUP_TOKEN` configurado en el servidor.
- **Cuerpo**:
  ```json
  {
    "token": "secreto-configurado",
    "username": "admin",
    "displayName": "Hugo Administrador",
    "password": "PasswordSegura123"
  }
  ```
- **Respuesta `201`**: `{ "success": true, "message": "Administrador inicial creado correctamente." }`

### `POST /api/auth/login`
- **Público**: Inicia sesión. Setea cookie HttpOnly `rh_session` y devuelve el token y el perfil.
- **Cuerpo**: `{ "username": "admin", "password": "..." }`
- **Respuesta `200`**:
  ```json
  {
    "user": { "id": 1, "username": "admin", "displayName": "Hugo Administrador", "role": "admin" },
    "token": "cadena-de-sesion"
  }
  ```

### `POST /api/auth/logout`
- **Requiere sesión**: Elimina la sesión activa de la base de datos y limpia la cookie `rh_session`.
- **Respuesta `200`**: `{ "success": true }`

### `GET /api/auth/me`
- **Respuesta `200`**: `{ "user": { ... } | null }`

---

## 2. Productos y Catálogo (`/api/products`)

### `GET /api/products`
- **Rol**: Vendedor o Administrador.
- **Parámetros**: `?q=...&categoryId=...&brand=...&status=all|out|low|ok|no_min|alert&active=1|0|all&sort=name|sku|stock|price|updated&dir=asc|desc&page=1&pageSize=25`
- **Respuesta `200`**: `{ "items": [...], "total": 120, "page": 1, "pageSize": 25, "totalPages": 5 }`
- **Nota**: El campo `costCents` solo se incluye para usuarios con rol `admin`. Para `seller` siempre devuelve `null`.

### `GET /api/products/by-code/:code`
- **Rol**: Vendedor o Administrador.
- **Uso**: Búsqueda inmediata para pistola de código de barras o ingreso de SKU.
- **Respuesta `200`**: `{ "found": true, "product": { ... } }` o `{ "found": false, "product": null }`

### `GET /api/products/:id`
- **Rol**: Vendedor o Administrador.
- **Respuesta `200`**: Detalle completo del producto y sus códigos de barra asociados.

### `POST /api/products`
- **Rol**: Administrador.
- **Cuerpo**:
  ```json
  {
    "sku": "6205-2RS",
    "name": "Rulemán 6205 2RS blindado",
    "description": "25x52x15 mm",
    "brand": "SKF",
    "categoryName": "Rulemanes rígidos",
    "unit": "unidad",
    "priceCents": 1850000,
    "costCents": 950000,
    "initialStock": 10,
    "minStock": 5,
    "targetStock": 20,
    "barcodes": ["7316576620527"]
  }
  ```
- **Respuesta `201`**: Producto creado con su movimiento inicial de inventario generado atómicamente.

### `PUT /api/products/:id`
- **Rol**: Administrador.
- **Importante**: El esquema rechaza estrictamente el campo `stock`. Las existencias nunca se modifican silenciosamente.
- **Respuesta `200`**: Producto actualizado.

### `POST /api/products/:id/activate` y `POST /api/products/:id/deactivate`
- **Rol**: Administrador.
- **Respuesta `200`**: Alterna el estado activo sin borrar movimientos ni historial.

---

## 3. Movimientos e Inventario (`/api/movements` y `/api/stock`)

### `GET /api/movements`
- **Rol**: Vendedor o Administrador.
- **Parámetros**: `?productId=...&type=purchase|sale|return|adjust_in|adjust_out|reversal|initial&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=50`
- **Respuesta `200`**: `{ "items": [...], "total": N, ... }`

### `POST /api/stock/entries`
- **Rol**: Administrador.
- **Cuerpo**:
  ```json
  {
    "idempotencyKey": "entry_20261026_001",
    "productId": 5,
    "quantity": 10,
    "kind": "purchase",
    "reason": "Remito N° 45802 de Distribuidora Mayorista"
  }
  ```
- **Respuesta `201`**: `{ "movement": { ... }, "currentStock": 25 }`

### `POST /api/stock/adjustments`
- **Rol**: Administrador.
- **Cuerpo**:
  ```json
  {
    "idempotencyKey": "adj_20261026_002",
    "productId": 5,
    "direction": "in" | "out",
    "quantity": 2,
    "reason": "Recuento físico de mostrador - rotura de empaque"
  }
  ```
- **Respuesta `201`**: `{ "movement": { ... }, "currentStock": 23 }`

---

## 4. Punto de Venta (POS) y Ventas (`/api/sales`)

### `POST /api/sales`
- **Rol**: Vendedor o Administrador.
- **Cuerpo**:
  ```json
  {
    "idempotencyKey": "sale_uuid_12345",
    "paymentMethodId": 1,
    "discountCents": 0,
    "notes": "Retira por mostrador",
    "items": [
      {
        "productId": 5,
        "quantity": 2,
        "expectedUnitPriceCents": 1850000
      }
    ]
  }
  ```
- **Respuesta `201` (o `200` si ya fue procesada por idempotencia)**: Detalle de venta confirmada con snapshot histórico de precios y descuento inmediato de stock.

### `GET /api/sales/:id`
- **Rol**: Vendedor o Administrador.
- **Respuesta `200`**: Comprobante interno completo listo para imprimir.

### `POST /api/sales/:id/returns`
- **Rol**: Administrador.
- **Cuerpo**:
  ```json
  {
    "idempotencyKey": "ret_uuid_12345",
    "reason": "Error en muestra de medida del cliente",
    "items": [
      { "saleItemId": 12, "quantity": 1, "restock": true }
    ]
  }
  ```
- **Respuesta `200`**: Venta actualizada a estado `partially_returned` o `returned`, reintegrando stock y registrando el movimiento de devolución.

### `POST /api/sales/:id/void`
- **Rol**: Administrador.
- **Cuerpo**: `{ "idempotencyKey": "void_uuid_12345", "reason": "Venta cargada por error" }`
- **Respuesta `200`**: Venta marcada como `voided` y reposición de todos los artículos no devueltos.

---

## 5. Alertas de Reposición y Dashboard

### `GET /api/alerts/summary`
- **Respuesta `200`**:
  ```json
  {
    "outOfStock": 3,
    "lowStock": 7,
    "undefinedMin": 2,
    "totalRequiringAttention": 10
  }
  ```

### `GET /api/alerts`
- **Parámetros**: `?status=all|out|low|no_min&categoryId=...&brand=...&page=1&pageSize=50`
- **Respuesta `200`**: Lista priorizada con cantidad sugerida de reposición y explicación de la regla aplicada.

### `GET /api/dashboard`
- **Respuesta `200`**: Métricas calculadas en tiempo real a partir de operaciones reales (ventas del día según hora de Bariloche, importes, alertas y últimos movimientos).

---

## 6. Configuración, Usuarios e Importación

- `GET /api/settings` y `PUT /api/settings` (admin)
- `GET /api/payment-methods`, `POST /api/payment-methods` (admin), `PUT /api/payment-methods/:id` (admin)
- `GET /api/users` (admin), `POST /api/users` (admin), `PUT /api/users/:id` (admin)
- `POST /api/imports/products/preview` (admin) — Valida filas y detecta duplicados sin tocar la base.
- `POST /api/imports/products/commit` (admin) — Aplica la importación por lotes atómicos.
- `GET /api/exports/products.csv` (admin) — Descarga CSV del catálogo.
- `GET /api/exports/movements.csv` (admin) — Descarga CSV de movimientos.
