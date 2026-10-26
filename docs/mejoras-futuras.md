# Hoja de Ruta y Recomendaciones de Mejoras Futuras (Roadmap v2 / v3)

Este documento presenta las oportunidades de evolución y mejoras tecnológicas sugeridas para potenciar la operación de **Rodamientos Hugo** una vez consolidado el uso de la versión 1.

---

## 1. Facturación Electrónica Oficial (AFIP / ARCA)

- **Objetivo:** Emitir Facturas Electrónicas "A", "B" y "C" directamente desde la pantalla de cobro sin necesidad de ingresar manualmente a la página de AFIP con Clave Fiscal.
- **Implementación técnica:**
  - Integración mediante **Web Services de Factura Electrónica (WSFE v1)** de AFIP/ARCA utilizando certificados digitales (`.crt` y `.key`).
  - Obtención automática del Código de Autorización Electrónico (**CAE**) y vencimiento en milisegundos durante la confirmación de la venta.
  - Generación del código QR fiscal homologado en el ticket térmico para cumplimiento de la RG 5003/2021.

---

## 2. Impresión Térmica Directa ESC/POS (WebUSB / WebSerial)

- **Objetivo:** Agilizar aún más el despacho en el mostrador eliminando el cuadro de diálogo de impresión que abre el navegador (`window.print()`).
- **Implementación técnica:**
  - Conexión directa mediante las APIs modernas **WebUSB** o **WebSerial** del navegador a impresoras térmicas de 80mm o 58mm (ej: Hasar, Epson, Xprinter, 3nStar).
  - Envío de comandos binarios ESC/POS nativos para corte de papel automático y apertura automática de gaveta portamonedas.

---

## 3. Generación e Impresión de Etiquetas con Códigos de Barra

- **Objetivo:** Etiquetar gavetas, estanterías y repuestos que llegan de fábrica sin código de barras legible o en cajas genéricas.
- **Implementación técnica:**
  - Módulo de diseño de etiquetas adhesivas (tamaños estándar ej: 50x25mm o 40x30mm) con código de barras Code-128 / EAN-13, SKU, nombre, medidas y ubicación.
  - Compatibilidad con impresoras de etiquetas térmicas tipo Zebra o Brother.

---

## 4. Alertas Automáticas de Reposición por WhatsApp / Email

- **Objetivo:** Notificar inmediatamente a Hugo o enviar una orden de compra tentativa al distribuidor cuando un producto crítico llega a stock cero.
- **Implementación técnica:**
  - Integración con la API oficial de WhatsApp Cloud o Twilio para despachar avisos automáticos al celular del encargado:
    > *"Aviso Rodamientos Hugo: El rodamiento 6204-2RS SKF acaba de agotarse en el mostrador. Reposición sugerida: 10 unidades."*
  - Generación automática de archivo PDF o Excel con el pedido sugerido adjunto para enviar al distribuidor.

---

## 5. Módulo de Cuentas Corrientes para Talleres Mecánicos

- **Objetivo:** Atender a clientes de confianza (talleres automotores o industrias locales de Bariloche) que retiran repuestos en la semana y abonan quincenal o mensualmente.
- **Implementación técnica:**
  - Registro de cuenta corriente por cliente con límite de crédito configurable.
  - Emisión de vales de entrega con firma de retiro.
  - Registro de pagos a cuenta y emisión de recibos con saldo pendiente actualizado.

---

## 6. Inventario Móvil con Escáner por Cámara de Teléfono

- **Objetivo:** Facilitar la realización de conteos físicos y auditorías periódicas de inventario recorriendo las estanterías del depósito sin necesidad de cables ni computadoras fijas.
- **Implementación técnica:**
  - Incorporación de la biblioteca `html5-qrcode` o `BarcodeDetector` para leer códigos de barras utilizando la cámara trasera del teléfono celular o tablet del operador.
  - Conteo rápido y actualización directa de existencias en el local.

---

## 7. Análisis Predictivo de Demanda y Estacionalidad en Bariloche

- **Objetivo:** Prever con anticipación picos de demanda estacionales característicos de la zona cordillerana.
- **Implementación técnica:**
  - Análisis estadístico de ventas históricas para anticipar la compra de repuestos de alta rotación previa al invierno (rodamientos para vehículos con cadenas, maquinaria vial, quitanieves) versus maquinaria industrial y automotor en verano.
