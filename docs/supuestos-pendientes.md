# Supuestos de Negocio y Preguntas Pendientes de Validación con el Cliente

Este documento recopila las decisiones de diseño adoptadas en la versión 1 (MVP) de la plataforma de **Rodamientos Hugo** y los puntos operativos a validar directamente con Hugo o el equipo de mostrador antes de la puesta en marcha definitiva.

---

## 1. Unidades de Medida y Fraccionamiento de Productos

- **Decisión adoptada en v1:** El inventario opera con cantidades **enteras (`INTEGER`)** para todas las transacciones. Esto aplica a rodamientos, rulemanes, retenes, crucetas, soportes y correas.
- **Punto a validar:**
  - ¿Comercializan algún producto fraccionado por peso o longitud? (Por ejemplo: grasa para rodamientos a granel vendida por gramo/kilo, o mangueras de lubricación por metro).
  - *Impacto:* Si se requiere fraccionar, en la fase 2 se puede migrar la columna de cantidad a decimales con 2 o 3 decimales (`DECIMAL(10,3)`).

---

## 2. Política de Descuentos en Mostrador

- **Decisión adoptada en v1:** Se habilitó un campo de descuento porcentual por ítem en el carrito con un **tope máximo preventivo del 50%**.
- **Punto a validar:**
  - ¿Es adecuado el 50% como límite operativo para el vendedor de mostrador?
  - ¿Desean un límite menor para vendedores estándar (ej. 10% o 15%) y que cualquier descuento mayor requiera autorización expresa de un administrador?

---

## 3. Ventana Temporal para Devoluciones y Anulaciones

- **Decisión adoptada en v1:** Por seguridad, únicamente los usuarios con rol **Administrador** pueden anular ventas o registrar devoluciones con restitución de mercadería al stock.
- **Punto a validar:**
  - ¿Cuál es el plazo máximo habitual que otorgan a los clientes para devolver un repuesto equivocado? (Ejemplo: 7 días, 30 días o sin límite con comprobante).
  - ¿Requieren que los vendedores puedan hacer devoluciones básicas si el cliente trae el ticket el mismo día?

---

## 4. Identificación del Cliente en el Comprobante Interno

- **Decisión adoptada en v1:** Las ventas se emiten a **"Consumidor Final"** en mostrador de forma rápida, sin obligar al vendedor a cargar datos personales que demoren la atención física.
- **Punto a validar:**
  - ¿Desean incorporar campos opcionales (Nombre, Teléfono, Vehículo / Patente) para ventas a talleres mecánicos o clientes frecuentes que encargan repuestos especiales?

---

## 5. Contingencia ante Cortes de Conectividad en Bariloche

- **Decisión adoptada en v1:** Para evitar que dos puestos vendan la misma pieza sin saberlo y generen inconsistencias graves de stock, el sistema exige conexión activa con el servidor en la nube para procesar el cobro. Si se interrumpe internet en el local:
  - El sistema muestra de inmediato un banner rojo visible: **"Sin conexión a internet"**.
  - Se recomienda a los vendedores utilizar un talonario manual de papel de contingencia durante el corte.
  - Al regresar el servicio, las ventas se cargan en bloque en el sistema o se regularizan mediante un ajuste con motivo *"Ventas de contingencia durante corte de luz/fibra"*.
- **Punto a validar:**
  - ¿La frecuencia habitual de cortes de internet o luz en el local justifica evaluar una terminal local híbrida sincronizable en la fase 2?

---

## 6. Proveedores y Actualizaciones Masivas de Precios

- **Decisión adoptada en v1:** El administrador puede actualizar precios de venta y costos mediante la carga de un archivo CSV o Excel usando el importador masivo con Dry-Run.
- **Punto a validar:**
  - ¿Qué distribuidores mayoristas les envían listas de precios periódicas (ej: SKF, NTN, Cuyo Rodamientos, etc.)?
  - ¿En qué formato entregan esas listas (Excel, PDF, CSV) para evaluar configuraciones de conversión directa?

---

## 7. Facturación Electrónica Fiscal (AFIP / ARCA)

- **Decisión adoptada en v1:** El sistema se enfoca 100% en el control de stock, kardex inmutable, alertas de reposición y emisión de comprobantes internos de entrega no fiscales.
- **Punto a validar:**
  - ¿Utilizan actualmente un controlador fiscal físico homologado de AFIP (Hasar / Epson) en el mostrador o facturan a través de la web con Clave Fiscal?
  - ¿En qué fecha calendario estiman oportuno iniciar la integración con los Web Services oficiales de AFIP/ARCA (Factura A, B y C)?
