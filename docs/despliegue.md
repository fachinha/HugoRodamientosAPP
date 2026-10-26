# Guía de Publicación y Despliegue en Cloudflare — Rodamientos Hugo

La aplicación está diseñada bajo la arquitectura moderna de **Cloudflare Workers con Static Assets**, donde tanto la SPA de React como la API Hono y la base de datos D1 se publican bajo el mismo dominio de Cloudflare.

---

## 1. Requisitos previos

1. Una cuenta activa en [Cloudflare](https://dash.cloudflare.com/).
2. Iniciar sesión en la CLI de Wrangler desde la terminal de tu máquina:
   ```powershell
   npx wrangler login
   ```
   (Se abrirá el navegador para autorizar la conexión con tu cuenta).

---

## 2. Creación de las bases de datos D1 en Cloudflare

Para mantener separados los datos de prueba de los datos reales del negocio, se crean dos bases independientes:

### Base de Demostración (Staging)
```powershell
npx wrangler d1 create rodamientos-hugo-demo
```
La terminal mostrará un identificador único (`database_id`), por ejemplo `b1a2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

### Base de Producción
```powershell
npx wrangler d1 create rodamientos-hugo-prod
```
Anotá también el `database_id` obtenido.

---

## 3. Configuración de `wrangler.jsonc`

Abrí el archivo `wrangler.jsonc` en la raíz del proyecto y reemplazá los marcadores con los IDs reales obtenidos:

```jsonc
"env": {
  "demo": {
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "rodamientos-hugo-demo",
        "database_id": "TU-ID-DE-D1-DEMO",
        "migrations_dir": "migrations"
      }
    ]
  },
  "production": {
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "rodamientos-hugo-prod",
        "database_id": "TU-ID-DE-D1-PRODUCCION",
        "migrations_dir": "migrations"
      }
    ]
  }
}
```

---

## 4. Configurar secretos en el entorno remoto

Definí el token de configuración inicial para crear el primer administrador en producción:

```powershell
npx wrangler secret put SETUP_TOKEN --env production
```
(Ingresá un token largo y seguro cuando lo solicite la terminal).

---

## 5. Aplicar migraciones en Cloudflare

Aplicá el esquema versionado a la base remota:

```powershell
# Para entorno de pruebas/demo:
npm.cmd run db:migrate:demo

# Para entorno de producción:
npm.cmd run db:migrate:prod
```

> **Aviso de seguridad:** NUNCA ejecutes el script `seed-demo.sql` sobre la base de producción. En producción el inventario debe cargarse mediante la plantilla de importación o el alta manual.

---

## 6. Compilación y Despliegue

Ejecutá el comando de publicación:

```powershell
# Despliegue en demo:
npm.cmd run deploy:demo

# Despliegue en producción:
npm.cmd run deploy:prod
```

Wrangler compilará los módulos de TypeScript, generará los assets estáticos de React y publicará el Worker. Al finalizar, la terminal te indicará la URL pública asignada:
```
https://rodamientos-hugo.<tu-subdominio>.workers.dev
```

---

## 7. Procedimiento de Rollback (Reversión si un despliegue falla)

Si un despliegue reciente presenta problemas imprevistos en el local, podés volver inmediatamente a la versión anterior sin pérdida de datos:

1. Listar versiones desplegadas:
   ```powershell
   npx wrangler deployments list --env production
   ```
2. Revertir a la versión estable previa:
   ```powershell
   npx wrangler rollback <DEPLOYMENT_ID> --env production
   ```
   La reversión en Cloudflare es casi instantánea (menos de 5 segundos a nivel global).
