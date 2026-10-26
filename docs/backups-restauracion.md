# Estrategia de Copias de Seguridad y Recuperación ante Desastres (Disaster Recovery)

Este documento detalla los mecanismos de resguardo, periodicidad de copias y el procedimiento paso a paso para recuperar el sistema de **Rodamientos Hugo** ante fallas humanas, corrupción de datos o contingencias de infraestructura.

---

## 1. Arquitectura de Respaldo

El sistema utiliza **Cloudflare D1**, una base de datos distribuida basada en SQLite que ofrece dos niveles complementarios de protección de datos:

1. **Protección Continua (Cloudflare D1 Time Travel):**
   - Registra de forma inmutable todas las transacciones y mutaciones de la base de datos.
   - Permite retroceder el estado de la base a **cualquier segundo específico dentro de una ventana móvil de 30 días**.
   - No requiere configurar tareas cron ni scripts externos para la retención continua.

2. **Copias de Seguridad Lógicas (Exportaciones SQL Completas):**
   - Volcados completos del esquema DDL y todos los registros en archivos `.sql` estándar.
   - Permite conservar archivos históricos fuera de Cloudflare (ej. en almacenamiento seguro local o Google Drive institucional).
   - Generables mediante la CLI oficial `wrangler d1 export` o el script incluido `scripts/backup.mjs`.

3. **Exportaciones de Negocio en CSV:**
   - Descarga directa de catálogos y movimientos históricos desde la interfaz web (`/settings` y `/movements`).

---

## 2. Política de Frecuencia y Retención

| Tipo de Respaldo | Frecuencia | Retención | Responsable | Ubicación |
| :--- | :---: | :---: | :---: | :---: |
| **D1 Time Travel** | Continuo (por transacción) | 30 días continuos | Automático (Cloudflare) | Red perimetral de Cloudflare |
| **Exportación SQL Completa** | Semanal (automatizable) | 12 meses | Administrador / DevOps | Carpeta local segura / Cloud externo |
| **Exportación CSV de Ventas** | Diario / Semanal | Indefinido | Personal administrativo | Disco del local / Correo |

---

## 3. Generación de Copias de Seguridad Manuales

### 3.1. Usando el script del proyecto (`scripts/backup.mjs`)

El repositorio incluye un script utilitario en Node.js que genera el volcado con fecha y hora:

```powershell
# Para entorno de producción
node scripts/backup.mjs export --env production

# Para entorno local / demo
node scripts/backup.mjs export --env demo
```

El archivo generado se guardará en la carpeta `backups/` con el formato:
`backups/rodamientos-hugo-backup-[ENTORNO]-[YYYYMMDD-HHMMSS].sql`

### 3.2. Usando la CLI directa de Cloudflare Wrangler

También podés ejecutar directamente el comando nativo de Cloudflare:

```powershell
npx.cmd wrangler d1 export rodamientos-hugo-prod --remote --output="./backups/backup-manual.sql"
```

---

## 4. Procedimientos de Recuperación (Disaster Recovery)

### Escenario A: Error humano o inconsistencia reciente (Recuperación con Time Travel)

Si un operador cometió un error grave (ejemplo: borró datos indebidos o realizó ajustes masivos incorrectos hace 20 minutos):

1. **Identificar la fecha y hora exacta** inmediatamente anterior al incidente (en formato UTC o ISO 8601).
   - Ejemplo: Si el error ocurrió a las 15:30 hora de Bariloche (UTC-3), el punto de corte será `15:25` local, es decir `18:25 UTC`.
2. **Restaurar la base de datos al instante elegido:**

```powershell
# Inspeccionar marcadores temporales disponibles
npx.cmd wrangler d1 time-travel info rodamientos-hugo-prod --remote

# Restaurar al punto deseado
npx.cmd wrangler d1 time-travel restore rodamientos-hugo-prod --remote --timestamp="2026-10-26T18:25:00Z"
```

3. Confirmar la operación cuando la consola solicite confirmación.
4. En pocos segundos, la base de datos vuelve exactamente al estado que tenía en ese minuto, preservando toda la información previa.

---

### Escenario B: Reconstrucción desde archivo de volcado SQL

Si se desea crear una nueva instancia de base de datos desde un archivo de respaldo:

1. **Crear una nueva base de datos D1 en Cloudflare (si fuera necesario):**
```powershell
npx.cmd wrangler d1 create rodamientos-hugo-restored
```

2. **Cargar el archivo de volcado `.sql`:**
```powershell
npx.cmd wrangler d1 execute rodamientos-hugo-restored --remote --file="./backups/rodamientos-hugo-backup-production-20261026-120000.sql"
```

3. **Actualizar el ID en `wrangler.jsonc`** si se reemplaza la base principal y re-desplegar con `npm.cmd run deploy`.

---

### Escenario C: Verificación de Consistencia e Integridad Post-Restauración

Luego de cualquier proceso de restauración, se debe ejecutar el script de auditoría de consistencia para verificar que el stock numérico en la tabla `products` coincida con la sumatoria estricta del historial de movimientos `stock_movements`:

```powershell
# Ejecución del script de verificación
npx.cmd wrangler d1 execute rodamientos-hugo-prod --remote --file="./scripts/verify-consistency.sql"
```

El script devolverá:
- Una lista de productos donde `stock != SUM(movements)` (si la base está sana, este listado debe retornar **0 filas**).
- El total de ventas registradas y la suma total de cobros para verificación de caja.

---

## 5. Simulacro Periódico de Recuperación

Se recomienda llevar adelante un simulacro semestral de recuperación:
1. Exportar la base de producción a un archivo SQL.
2. Restaurarla sobre la base de pruebas `rodamientos-hugo-demo`.
3. Iniciar sesión en el entorno demo y constatar que los últimos productos cargados y ventas figuren íntegramente.
4. Ejecutar `scripts/verify-consistency.sql` para validar que no existan inconsistencias contables.
