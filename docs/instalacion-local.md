# Guía de Instalación y Ejecución Local — Rodamientos Hugo

Esta guía explica cómo ejecutar la aplicación completa en tu computadora de desarrollo utilizando **Node.js**, **Vite** y el emulador local de **Cloudflare D1 (Miniflare)**.

---

## 1. Requisitos previos

- **Node.js**: Versión 20 o superior (verificado con Node v24).
- **npm**: Versión 10 o superior (en Windows PowerShell, utilizar `npm.cmd` si la ejecución de scripts `.ps1` está restringida en el sistema).
- **Git**: Para el control de versiones.

---

## 2. Instalación de dependencias

Abrí una terminal en la raíz del proyecto y ejecutá:

```powershell
npm.cmd install
```

---

## 3. Configuración de variables de entorno

Copiá el archivo de variables de ejemplo para crear tu archivo `.dev.vars` local:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

El archivo `.dev.vars` contendrá el secreto `SETUP_TOKEN` utilizado para la inicialización del primer administrador:

```ini
SETUP_TOKEN=tu-clave-secreta-local-1234
```

> **Aviso de seguridad:** `.dev.vars` está incluido en `.gitignore` y **nunca** debe comitearse al repositorio.

---

## 4. Base de datos local y migraciones

Aplicá las migraciones versionadas sobre la base D1 local (almacenada automáticamente en `.wrangler/state/v3/d1`):

```powershell
npm.cmd run db:migrate:local
```

### Cargar datos de demostración (Opcional para pruebas)

Para sembrar productos de muestra claramente identificados con el prefijo `DEMO-` (con situaciones de stock normal, bajo y agotado):

```powershell
npm.cmd run db:seed-demo:local
```

---

## 5. Ejecutar la aplicación en modo desarrollo

Iniciá el servidor de desarrollo de Vite (que ejecuta en el mismo puerto tanto la SPA como el Worker de Cloudflare integrado):

```powershell
npm.cmd run dev
```

La consola te mostrará una URL como:
```
http://localhost:5173/
```

Abrila en tu navegador web.

---

## 6. Primer inicio (Paso a paso)

1. Al abrir la app por primera vez, el sistema detecta que no hay usuarios y te redirige automáticamente a la pantalla de **Configuración Inicial** (`/setup`).
2. Ingresá el **Token de instalación** configurado en `.dev.vars` (por ejemplo: `tu-clave-secreta-local-1234`).
3. Definí el usuario administrador (ej: `admin`), tu nombre y una contraseña de al menos 10 caracteres.
4. Hacé clic en **Crear administrador inicial**.
5. Iniciá sesión con tus credenciales y accedé al panel de control de Rodamientos Hugo.

---

## 7. Ejecución de pruebas automatizadas

Para verificar el correcto funcionamiento de toda la lógica de negocio y las 19 pruebas de integración:

```powershell
npm.cmd test
```

Para verificar tipos de TypeScript y compilar la versión de producción:

```powershell
npm.cmd run build
```
