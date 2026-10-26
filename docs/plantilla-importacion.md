# Plantilla y Reglas de Importación de Productos — Rodamientos Hugo

La aplicación permite cargar o actualizar masivamente el catálogo de rulemanes y repuestos utilizando archivos en formato **CSV (delimitado por comas)** o planillas de **Microsoft Excel (.xlsx)**.

---

## 1. Columnas de la plantilla

El archivo debe incluir en su primera fila (encabezado) los siguientes nombres de columna exactos:

| Nombre de columna | Obligatorio | Tipo de dato | Descripción y formato |
|---|---|---|---|
| `sku` | **Sí** | Texto (1 a 64 car.) | Código interno o número de pieza (Ej: `6205-2RS`, `RET-355008`). No puede repetirse en el catálogo. |
| `codigo_barras` | No | Texto | Código de barras impreso en la caja o etiqueta. Puede tener ceros iniciales. Un código activo no puede pertenecer a dos productos diferentes. |
| `nombre` | **Sí** | Texto (1 a 200 car.) | Descripción comercial visible en el mostrador y en el ticket (Ej: `Rulemán 6205 2RS blindado goma`). |
| `descripcion` | No | Texto (hasta 2000 car.) | Detalles técnicos, medidas, aplicaciones automotrices o industriales. |
| `marca` | No | Texto (hasta 80 car.) | Marca o fabricante (Ej: `SKF`, `FAG`, `Timken`, `Corteco`, `Gates`). |
| `categoria` | No | Texto (hasta 80 car.) | Rubro o familia (Ej: `Rulemanes rígidos`, `Retenes`, `Correas`). Si la categoría no existe, se crea automáticamente. |
| `unidad` | No | Texto (por defecto `unidad`) | Unidad de medida (`unidad`, `juego`, `par`). |
| `precio_venta` | **Sí** | Número / Moneda | Precio final de venta en pesos argentinos. Acepta formatos como `18500`, `18500.00` o `18.500,00`. |
| `costo` | No | Número / Moneda | Costo de adquisición. Visible únicamente para usuarios administradores. |
| `stock_inicial` | No | Entero (>= 0) | Cantidad física inicial disponible al cargar el producto. Si es mayor a 0, genera automáticamente un movimiento auditable de tipo `initial`. |
| `stock_minimo` | No | Entero (>= 0) | Umbral para disparar la alerta de stock bajo. Si se deja vacío, el sistema señalará que falta configurar el mínimo. |
| `stock_objetivo` | No | Entero (>= 0) | Stock deseado para calcular la sugerencia de reposición de compras. |

---

## 2. Archivo de ejemplo descargable

En la carpeta del proyecto podés encontrar el archivo de referencia listo para usar:
`templates/plantilla-importacion-productos.csv`

Contenido de ejemplo:
```csv
sku,codigo_barras,nombre,descripcion,marca,categoria,unidad,precio_venta,costo,stock_inicial,stock_minimo,stock_objetivo
6205-2RS,7316576620527,Rulemán 6205 2RS blindado goma,Rodamiento rígido 25x52x15 mm,SKF,Rulemanes rígidos,unidad,18500.00,9500.00,20,8,30
6004-ZZ,4012801160045,Rulemán 6004 ZZ blindaje metálico,Rodamiento rígido 20x42x12 mm,FAG,Rulemanes rígidos,unidad,14200.00,7200.00,15,6,25
30206-J2,0538933020621,Rulemán cónico 30206 masa de rueda,Rodamiento cónico 30x62x17.25 mm,Timken,Rulemanes cónicos,unidad,29800.00,16000.00,8,4,16
```

---

## 3. Proceso de validación previa (Dry-Run)

El sistema nunca inserta datos a ciegas en la base de datos:

1. Al seleccionar el archivo en **Configuración → Importar y Exportar**, el servidor analiza fila por fila.
2. Identifica filas con errores sintácticos (precios inválidos, SKUs vacíos, caracteres no permitidos).
3. Detecta duplicados internos dentro del mismo archivo.
4. Detecta productos que ya existen en la base de datos.
5. Muestra una **vista previa detallada** indicando cuántas filas son válidas, cuántas tienen observaciones y cuántas ya existen.
6. Permite marcar dos opciones antes de confirmar:
   - **Omitir filas inválidas**: Para importar las filas correctas y descartar solo las defectuosas.
   - **Actualizar productos existentes**: Si se activa, actualiza precios, marcas, categorías y umbrales de los productos existentes, **sin alterar silenciosamente el stock actual** de mercadería que ya fue ingresado o vendido.
7. Una vez confirmado por el usuario administrador, los registros se insertan atómicamente en la base de datos.
