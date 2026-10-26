# Manual de Usuario y Operación Diaria — Rodamientos Hugo

Bienvenido al manual operativo de la aplicación de **Rodamientos Hugo**. Este documento describe cómo utilizar cada una de las funcionalidades del sistema en el día a día del mostrador y en la administración del negocio en San Carlos de Bariloche.

---

## 1. Roles y Permisos de Acceso

El sistema cuenta con dos perfiles de usuario diferenciados para proteger la información sensible del negocio:

| Funcionalidad / Módulo | Vendedor | Administrador |
| :--- | :---: | :---: |
| Panel de Control (Dashboard y KPIs) | Sí | Sí |
| Punto de Venta (Cobro en mostrador) | Sí | Sí |
| Consulta del Catálogo de Productos | Sí | Sí |
| Alta y Edición de Productos | No | Sí |
| Ingreso de Mercadería (Compras) | Sí | Sí |
| Ajuste Manual de Inventario | No | Sí |
| Consulta de Alertas de Reposición | Sí | Sí |
| Historial de Movimientos (Kardex) | Solo lectura | Sí (con exportación CSV) |
| Devoluciones y Anulación de Ventas | No | Sí |
| Importación y Exportación Masiva | No | Sí |
| Configuración del Negocio y Usuarios | No | Sí |

---

## 2. Pantalla Principal: Panel de Control (Dashboard)

Al iniciar sesión, el sistema muestra el estado operativo en tiempo real mediante tarjetas e indicadores diseñados para responder instantáneamente a las 7 preguntas críticas del negocio:

1. **¿Qué productos están agotados urgentemente?** Tarjeta roja con acceso directo al listado filtrado.
2. **¿Qué productos están por debajo del stock mínimo?** Tarjeta amarilla con la cantidad de artículos en riesgo.
3. **¿Cuántas ventas se realizaron hoy y cuál es el monto facturado?** Tarjeta con el total en pesos argentinos ($ ARS) acumulado en el día (horario local Bariloche UTC-3).
4. **¿Cuántos productos activos componen el catálogo?** Conteo total de ítems habilitados para la venta.
5. **¿Cuáles fueron los últimos movimientos de stock?** Tabla con las últimas transacciones de ingresos, ventas y ajustes.
6. **¿Cuáles son los productos más vendidos del mes?** Listado de rulemanes y repuestos de mayor rotación.
7. **¿Hay conexión con el servidor en la nube?** Indicador en el encabezado (Verde: En línea / Rojo: Sin conexión).

---

## 3. Punto de Venta (POS / Mostrador)

La pantalla del **Punto de Venta** (`/pos`) está optimizada para despachar clientes rápidamente en el mostrador físico.

### 3.1. Agregar productos con el Lector de Código de Barras (Pistola USB/Bluetooth)
1. Asegurate de que el cursor esté posicionado en el campo de búsqueda (el sistema le da foco automático al cargar la pantalla o al presionar `F2`).
2. Apuntá el lector al código de barras del producto (caja original o etiqueta de la estantería) y dispará.
3. El lector tipea el código y presiona `Enter` automáticamente:
   - Si el producto ya está en el carrito, se suma 1 a la cantidad.
   - Si no estaba en el carrito, se agrega de inmediato con cantidad 1.
   - El sistema emite un aviso sonoro/visual y limpia el campo para recibir el siguiente disparo.

### 3.2. Búsqueda manual de productos
Si el repuesto no tiene código de barras o está desgastado:
1. Escribí en el campo de búsqueda el **código interno** (ej: `6204-2RS`), el **nombre** (ej: `Rodamiento rígido de bolas`), la **marca** (ej: `SKF`, `NTN`) o la **medida** (ej: `20x47x14`).
2. La lista desplegable mostrará los productos coincidentes con su stock actual y precio.
3. Hacé clic en el producto o presiona la tecla `Flecha Abajo` + `Enter` para incorporarlo al carrito.

### 3.3. Control estricto de existencias en el mostrador
- **Imposibilidad de vender sin stock:** El sistema no permite agregar al carrito productos con stock en 0 ni incrementar la cantidad por encima del stock físico disponible en el local.
- Si intentás sumar más unidades de las disponibles, la interfaz te alertará indicando el tope máximo de existencias.

### 3.4. Aplicación de descuentos
- Podés aplicar un descuento porcentual a un ítem individual (por ejemplo, 5%, 10% o el porcentaje acordado con el cliente).
- El sistema cuenta con un límite preventivo de hasta 50% de descuento por ítem para evitar errores de tipeo involuntarios en el mostrador.

### 3.5. Finalización y Cobro de la Venta
1. Verificá los ítems, cantidades y el total a pagar en pesos argentinos.
2. Seleccioná el **Medio de Pago**:
   - **Efectivo**
   - **Tarjeta de Débito**
   - **Transferencia Bancaria**
   - **Tarjeta de Crédito**
3. Hacé clic en el botón verde **Confirmar Venta y Cobrar** (o presioná `F9`).
4. El sistema ejecuta una transacción atómica que:
   - Descuenta inmediatamente las unidades del stock en la base de datos central.
   - Congela el precio unitario y costo al momento exacto de la venta.
   - Genera el número correlativo de comprobante interno (ej: `VTA-000142`).
   - Abre la ventana de **Comprobante Interno** para su impresión.

### 3.6. Emisión del Comprobante Interno (Ticket de Mostrador)
- Se presenta el ticket con el encabezado de Rodamientos Hugo, fecha, hora de Bariloche, detalle de rulemanes, medio de pago y la leyenda: *"DOCUMENTO NO FISCAL — COMPROBANTE INTERNO DE ENTREGA"*.
- Podés imprimirlo directamente en la impresora térmica de 80mm o 58mm haciendo clic en **Imprimir Ticket** (o cerrarlo para atender al siguiente cliente).

---

## 4. Gestión del Catálogo de Productos

Desde la pantalla de **Productos** (`/products`), los administradores gestionan los artículos comerciales.

### 4.1. Alta de un nuevo producto
1. Hacé clic en el botón **+ Nuevo Producto**.
2. Completá los campos obligatorios:
   - **Código interno / SKU:** Identificador único del repuesto (ej: `6006-ZZ`, `RET-35-52-7`).
   - **Nombre descriptivo:** Denominación clara para el vendedor (ej: `Rodamiento rígido de bolas 6006 ZZ`).
   - **Categoría:** Ej: *Rodamientos Rígidos*, *Retenes*, *Crucetas*, *Correas*, etc.
   - **Medidas / Especificación técnica:** Diámetro interior, exterior y ancho (ej: `30 x 55 x 13 mm`).
   - **Ubicación en el local:** Estantería, pasillo o gaveta donde se guarda físicamente (ej: `Estante A-3, Gaveta 12`).
   - **Precio de Venta ($ ARS):** Precio final al público.
   - **Costo de Reposición ($ ARS):** Valor de compra al distribuidor (opcional, para cálculo de márgenes).
   - **Stock Mínimo deseado:** Umbral para disparar la alerta amarilla preventiva (ej: 4 unidades).
   - **Stock Inicial:** Cantidad física existente al momento de darlo de alta.
3. Hacé clic en **Guardar Producto**. El stock inicial quedará asentado automáticamente con un movimiento de auditoría de apertura.

### 4.2. Múltiples Códigos de Barras por Producto
Un mismo rulemán puede ingresar en cajas con códigos EAN-13 distintos según el fabricante o lote.
- En la ficha del producto podés asociar múltiples códigos de barras secundarios (ej: el código del blister unitario, el código de la caja por 10 o el código alternativo de otra marca equivalente).
- Al escanear cualquiera de ellos en el mostrador, el sistema reconocerá el mismo producto.

### 4.3. Regla de Oro: Prohibición de Modificación Silenciosa de Stock
Por diseño de seguridad e integridad contable:
> **IMPORTANTE:** La pantalla de edición del producto **NO permite cambiar el número de stock directamente**. El stock solo puede aumentar mediante un **Ingreso de Mercadería** o disminuir mediante una **Venta** o un **Ajuste con Motivo Justificado**. De este modo, nunca se pierde la trazabilidad de qué pasó con cada pieza.

---

## 5. Gestión de Stock e Inventario

### 5.1. Ingreso de Mercadería (Recepción de Compras a Proveedores)
Cuando llega una encomienda o pedido de distribuidores:
1. Dirigite a **Inventario** (`/inventory`) y seleccioná la pestaña **Ingreso de Mercadería**.
2. Buscá o escaneá el producto que estás recibiendo.
3. Ingresá la **Cantidad recibida** (número entero positivo).
4. Indicá opcionalmente el **Número de Remito o Factura del Proveedor** (ej: `Factura A 0004-00029182 de Distribuidora Cuyo`) y el costo unitario actualizado si varió.
5. Confirmá el ingreso. El stock aumentará de forma inmediata y quedará registrado bajo el tipo `IN_PURCHASE` asociado a tu usuario.

### 5.2. Ajustes Manuales de Inventario (Mermas, Roturas o Corrección por Conteo)
Si al realizar un conteo físico en la estantería la cantidad no coincide con el sistema:
1. Ingresá a la pestaña **Ajuste de Stock** (solo administradores).
2. Seleccioná el producto.
3. Ingresá el **Nuevo Stock Real** contado en el estante.
4. Escribí obligatoriamente el **Motivo justificado** (mínimo 5 caracteres), por ejemplo:
   - *"Conteo físico trimestral de gaveta A-3"*
   - *"Pieza caída y dañada en depósito"*
   - *"Devolución de muestra a taller"*
5. El sistema calcula la diferencia automáticamente (+ o -) y registra el movimiento `ADJUSTMENT` inalterable en el kardex.

---

## 6. Sistema de Alertas y Reposición Automática

El módulo de **Alertas** (`/alerts`) es el núcleo para evitar que el negocio pierda ventas por quiebre de stock.

### 6.1. Niveles de Prioridad
- 🔴 **Prioridad 1 — AGOTADO URGENTE (Stock = 0):** Artículos sin existencias. Cualquier cliente que ingrese a pedir este rulemán no podrá ser atendido. Requiere pedido inmediato al distribuidor.
- 🟡 **Prioridad 2 — STOCK BAJO (Stock <= Mínimo):** El inventario está en zona de advertencia. Aún quedan piezas pero se agotarán en los próximos despachos.
- 🔵 **Prioridad 3 — SIN MÍNIMO DEFINIDO:** Productos creados que no tienen configurado un umbral de stock mínimo.

### 6.2. Cantidad Sugerida a Reponer
Para cada artículo en alerta, el sistema calcula automáticamente cuántas unidades encargar según la fórmula de reposición comercial:
- Si el producto tiene configurado stock máximo: `Sugerido = Stock Máximo - Stock Actual`.
- Si no tiene máximo pero sí mínimo: `Sugerido = (2 * Stock Mínimo) - Stock Actual`.
- Podés presionar el botón **Reabastecer** en la misma fila para registrar la llegada del pedido apenas arribe al local.

---

## 7. Devoluciones y Anulación de Comprobantes

En caso de errores de cobro o devoluciones de clientes en el mostrador:
1. Accedé al menú de **Movimientos / Ventas**.
2. Localizá la venta por número de comprobante o fecha.
3. Seleccioná la acción requerida (solo administradores):
   - **Anulación total:** Si el cliente canceló la compra antes de retirar la mercadería o hubo un error total de facturación. Todo el stock de los ítems de esa venta se repone automáticamente al inventario (`IN_VOID`).
   - **Devolución parcial:** Si el cliente compró dos rodamientos y devuelve uno porque no correspondía a su modelo. El sistema reintegra la unidad devuelta al stock (`IN_RETURN`) y calcula la nota de crédito/reintegro correspondiente.

---

## 8. Cierre y Buenas Prácticas al Final del Día

Al terminar la jornada laboral en Bariloche:
1. **Revisar el Dashboard:** Constatar el total de ventas del día y el desglose por medio de pago (Efectivo en caja vs Transferencias y Tarjetas).
2. **Exportar Movimientos a CSV:** Desde la pantalla de Movimientos, podés descargar el reporte del día para control contable.
3. **Revisar la pestaña de Alertas:** Generar la lista de pedidos para enviar por correo o WhatsApp a los viajantes y distribuidores mayoristas.
4. **Cerrar sesión** de los puestos de mostrador si se comparte la computadora.
