/**
 * Script de copias de seguridad para Rodamientos Hugo.
 * Ejecuta la exportación de la base de datos D1 a un archivo SQL con timestamp
 * y documenta la recuperación vía Time Travel.
 *
 * Uso:
 *   node ./scripts/backup.mjs local
 *   node ./scripts/backup.mjs production
 *   node ./scripts/backup.mjs demo
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const envName = process.argv[2] || 'production';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(process.cwd(), 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const outputFile = path.join(backupDir, `backup-d1-${envName}-${timestamp}.sql`);

console.log(`[BACKUP] Iniciando copia de seguridad para entorno: ${envName}`);
console.log(`[BACKUP] Destino: ${outputFile}`);

const envFlag = envName === 'local' ? '--local' : `--remote --env ${envName}`;
const cmd = `npx wrangler d1 export DB ${envFlag} --output="${outputFile}"`;

try {
  console.log(`[BACKUP] Ejecutando: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\n✅ Copia de seguridad finalizada con éxito.`);
  console.log(`   Archivo guardado en: ${outputFile}`);
  console.log(`\nℹ️ Para restaurar este archivo en una base limpia:`);
  console.log(`   npx wrangler d1 execute DB ${envFlag} --file="${outputFile}"`);
  console.log(`\nℹ️ Para restaurar a un minuto exacto vía Time Travel de Cloudflare D1:`);
  console.log(`   npx wrangler d1 time-travel restore DB --timestamp="2026-10-26T14:30:00Z" ${envFlag}`);
} catch (err) {
  console.error(`\n❌ Error al generar la copia de seguridad:`, err.message);
  process.exit(1);
}
