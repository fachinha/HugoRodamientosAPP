# Rodamientos Hugo — Sistema de Gestión de Inventario y Punto de Venta (POS)

Sistema profesional, rápido y seguro de gestión de inventario, control de existencias y punto de venta para **Rodamientos Hugo** (San Carlos de Bariloche, Río Negro, Argentina), comercio especializado en la venta de rodamientos, rulemanes, retenes y repuestos automotores e industriales.

Desarrollado para resolver de forma definitiva el principal problema del comercio: **la pérdida de oportunidades de venta por quiebre de stock no detectado a tiempo**.

---

## 🚀 Características Principales

- **Punto de Venta Rápido (POS) para Mostrador:**
  - Búsqueda instantánea por SKU interno, denominación comercial, medidas técnicas (ej. `20x47x14`) y marcas.
  - Integración nativa con **pistolas lectoras de código de barras USB / Bluetooth (HID)** con debounce anti-doble lectura y soporte para múltiples códigos asociados a una misma pieza.
  - Bloqueo preventivo de ventas sin existencias y descuentos porcentuales controlados por ítem (tope preventivo del 50%).
  - Emisión e impresión de **comprobante interno de entrega no fiscal** optimizado para impresoras térmicas de 80mm y 58mm.
- **Control Estricto de Stock y Prevención de Errores:**
  - Descuentos de stock atómicos con restricción de motor de base de datos `CHECK(stock >= 0)`. Imposibilidad técnica de saldos negativos aún ante ventas concurrentes en el mostrador.
  - **Prohibición de modificaciones silenciosas:** El stock no puede editarse a mano en la ficha de producto; solo muta mediante ingresos con remito, ventas o ajustes con motivo justificado obligatorio.
  - Historial de movimientos (**Kardex**) estrictamente inmutable protegido por disparadores SQL (*append-only triggers*).
- **Sistema Inteligente de Alertas y Reposición:**
  - Semáforo de prioridades: 🔴 Agotado Urgente (Stock = 0), 🟡 Stock Bajo (Stock <= Mínimo), 🔵 Sin Mínimo Configurado.
  - Cálculo automático de reposición sugerida para optimizar compras a distribuidores mayoristas.
  - Botón de reposición rápida en un clic desde la misma fila de alerta.
- **Panel de Control con Respuestas en Tiempo Real (Dashboard):**
  - Responde de un vistazo a las 7 preguntas críticas del negocio: faltantes urgentes, artículos en riesgo, ventas y monto facturado del día en pesos argentinos ($ ARS, horario local Bariloche UTC-3), catálogo activo y productos más vendidos.
- **Importación y Exportación Masiva:**
  - Importador masivo de productos vía CSV o Excel con validación previa **Dry-Run** (audita duplicados y errores sin tocar la base de datos).
  - Exportación de catálogos y movimientos históricos a planillas CSV compatibles con Excel.
- **Seguridad y Resiliencia Empresarial:**
  - Segregación de roles (Vendedor vs Administrador).
  - Autenticación criptográfica con PBKDF2 WebCrypto, protección contra fuerza bruta con retardo constante y tokens CSRF.
  - Copias de seguridad continuas con **Cloudflare D1 Time Travel** (restauración a cualquier minuto de los últimos 30 días) y volcados SQL exportables.
  - Detección visual de estado de conectividad en el mostrador.

---

## 🛠️ Stack Tecnológico

- **Plataforma de Ejecución:** [Cloudflare Workers](https://workers.cloudflare.com/) (Edge computing de latencia ultra-baja en Argentina).
- **Base de Datos Distribuida:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (Motor SQLite serverless transaccional).
- **Backend API:** [Hono v4](https://hono.dev/) con TypeScript estricto y validaciones con [Zod v4](https://zod.dev/).
- **Frontend SPA:** [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/) + [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/).
- **Framework de Pruebas:** [Vitest 5](https://vitest.dev/) con `@cloudflare/vitest-plugin` ejecutando en el runtime real de `workerd`.

---

## 📁 Estructura del Proyecto

```text
├── docs/                             # Manuales y documentación completa de ingeniería
│   ├── api.md                        # Referencia de endpoints HTTP REST
│   ├── backups-restauracion.md       # Estrategia de Disaster Recovery y D1 Time Travel
│   ├── despliegue.md                 # Guía de aprovisionamiento y despliegue a Cloudflare
│   ├── guia-uso.md                   # Manual de usuario para vendedores y administradores
│   ├── informe-pruebas.md            # Informe de QA con los 20 escenarios obligatorios
│   ├── instalacion-local.md          # Guía de ejecución local con Miniflare
│   ├── lector-codigos.md             # Manual de configuración del lector de código de barras
│   ├── mejoras-futuras.md            # Hoja de ruta v2/v3 (AFIP, ESC/POS, WhatsApp, etc.)
│   ├── plantilla-importacion.md      # Guía para la carga masiva de productos
│   └── supuestos-pendientes.md       # Puntos de negocio a validar con el cliente
├── migrations/                       # Migraciones SQL versionadas para Cloudflare D1
│   └── 0001_init.sql                 # Esquema DDL completo, índices, triggers y constraints
├── scripts/                          # Scripts utilitarios y de mantenimiento
│   ├── backup.mjs                    # Exportador de volcados SQL con fecha y hora
│   ├── seed-demo.sql                 # Datos de prueba identificados con DEMO-
│   └── verify-consistency.sql        # Auditoría de consistencia: stock = SUM(movimientos)
├── src/
│   ├── shared/                       # Módulos puros compartidos entre Worker y Frontend
│   │   ├── barcode.ts                # Normalización de códigos y preservación de ceros
│   │   ├── money.ts                  # Manejo estricto de centavos enteros y formato $ ARS
│   │   ├── sales.ts                  # Cálculos de subtotales, descuentos y reintegros
│   │   ├── schemas.ts                # Validaciones Zod de contratos y entradas
│   │   ├── stock.ts                  # Lógica de semáforos y cálculo de reposición sugerida
│   │   └── time.ts                   # Manejo de zona horaria Bariloche (UTC-3)
│   ├── web/                          # Aplicación SPA cliente (React 19 + Tailwind v4)
│   │   ├── api/                      # Cliente HTTP tipado con manejo de tokens y errores
│   │   ├── components/               # Componentes UI (Lector HID, Layout, Modales, Tickets)
│   │   ├── context/                  # Estado de sesión y autenticación
│   │   ├── hooks/                    # Hooks de estado de red y atajos de teclado
│   │   ├── pages/                    # Pantallas (Dashboard, POS, Productos, Alertas, etc.)
│   │   └── index.css                 # Estilos Tailwind y reglas de medios de impresión
│   └── worker/                       # Backend Cloudflare Worker (Hono REST API)
│       ├── lib/                      # Criptografía PBKDF2, manejo de base D1 y errores
│       ├── middleware/               # Autenticación de sesiones y protección CSRF
│       ├── routes/                   # Controladores HTTP y orquestación de rutas
│       └── services/                 # Lógica de negocio (Ventas atómicas, stock, alertas, etc.)
├── templates/                        # Plantillas oficiales listas para usar
│   └── plantilla-importacion-productos.csv # Archivo de ejemplo para importación masiva
├── tests/                            # Batería de pruebas automatizadas en runtime workerd
│   ├── api.integration.test.ts       # 15 tests de integración (concurrencia, límites, etc.)
│   ├── setup.ts                      # Aplicación de esquema D1 en memoria
│   └── shared.test.ts                # 4 tests unitarios de módulos de dominio
├── wrangler.jsonc                    # Configuración de entornos Cloudflare (local, demo, prod)
└── package.json                      # Scripts de compilación, ejecución y dependencias
```

---

## ⚡ Guía Rápida de Inicio Local

### 1. Clonar e instalar dependencias
```powershell
npm.cmd install
```

### 2. Configurar variables locales
```powershell
Copy-Item .dev.vars.example .dev.vars
```

### 3. Aplicar migraciones sobre la base local D1
```powershell
npm.cmd run db:migrate:local
```

*(Opcional: Cargar productos de prueba con `npm.cmd run db:seed-demo:local`)*

### 4. Iniciar el entorno de desarrollo
```powershell
npm.cmd run dev
```
Abrí tu navegador en `http://localhost:5173/` y completá el asistente de configuración inicial del primer administrador en `/setup`.

Para más detalles, consultá la [Guía de Instalación Local](docs/instalacion-local.md).

---

## 🧪 Pruebas y Aseguramiento de Calidad

El proyecto cuenta con una suite integral de pruebas que valida los 20 escenarios críticos del negocio (concurrencia de ventas, bloqueo de stock negativo, idempotencia, preservación de ceros en códigos de barra, etc.):

```powershell
# Ejecutar todas las pruebas unitarias y de integración
npm.cmd test

# Verificar tipos de TypeScript en todo el proyecto
npm.cmd run typecheck

# Compilar los bundles de producción para el Worker y el Cliente
npm.cmd run build
```

El detalle pormenorizado de los resultados se encuentra en el [Informe de Pruebas](docs/informe-pruebas.md).

---

## 🌐 Despliegue en Cloudflare

El sistema se publica en minutos utilizando la CLI oficial de Cloudflare:

```powershell
# 1. Crear la base de datos D1 en producción
npx.cmd wrangler d1 create rodamientos-hugo-prod

# 2. Aplicar las migraciones remotas
npm.cmd run db:migrate:prod

# 3. Configurar el secreto de instalación inicial
npx.cmd wrangler secret put SETUP_TOKEN

# 4. Desplegar aplicación completa (Worker + SPA estática)
npm.cmd run deploy
```

Para ver la guía paso a paso con configuración de dominio propio y entorno demo, consultá la [Guía de Despliegue](docs/despliegue.md).

---

## 📚 Índice de Documentación

| Documento | Descripción |
| :--- | :--- |
| 📖 [Manual de Usuario y Operación](docs/guia-uso.md) | Instrucciones para vendedores y administradores en el local. |
| 🔍 [Manual del Lector de Códigos](docs/lector-codigos.md) | Configuración de la pistola de códigos USB/Bluetooth HID. |
| 📋 [Plantilla e Instructivo de Importación](docs/plantilla-importacion.md) | Cómo preparar y validar archivos CSV/Excel de productos. |
| 🛡️ [Estrategia de Backups y Restauración](docs/backups-restauracion.md) | Recuperación ante desastres con D1 Time Travel y volcados SQL. |
| 🔬 [Informe Integral de Pruebas (QA)](docs/informe-pruebas.md) | Cobertura y resultados de los 20 escenarios de negocio evaluados. |
| ❓ [Supuestos y Puntos a Validar](docs/supuestos-pendientes.md) | Cuestiones operativas para acordar en la reunión con el cliente. |
| 🚀 [Hoja de Ruta y Mejoras Futuras](docs/mejoras-futuras.md) | Planes para AFIP, impresión directa ESC/POS, WhatsApp, etc. |
| 💻 [Guía de Instalación Local](docs/instalacion-local.md) | Paso a paso para desarrolladores en entorno Miniflare. |
| ☁️ [Guía de Despliegue en Cloudflare](docs/despliegue.md) | Procedimiento de publicación en producción y demo. |
| 🔌 [Referencia de API REST](docs/api.md) | Documentación técnica de contratos y endpoints HTTP. |

---

## 📄 Licencia y Garantía de Consistencia

Desarrollado a medida para **Rodamientos Hugo** (San Carlos de Bariloche, Argentina). Todos los derechos reservados.
Garantía de consistencia de inventario basada en transacciones ACID sobre Cloudflare D1 y trazabilidad inmutable de movimientos.
