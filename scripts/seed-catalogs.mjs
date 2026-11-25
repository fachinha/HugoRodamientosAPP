import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import XLSX from 'xlsx';
import { extractText } from 'unpdf';

const DOWNLOADS_DIR = 'C:\\Users\\lucas\\Downloads';
const SUPPLIER_NAME = 'Alfa Rodamientos';

function parseNumber(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''").trim()}'`;
}

async function parsePesaro() {
  const filePath = path.join(DOWNLOADS_DIR, 'PESARO_SOLO_POR_MEDIDAS.pdf');
  if (!fs.existsSync(filePath)) {
    console.log('Pesaro PDF not found:', filePath);
    return [];
  }
  const buf = fs.readFileSync(filePath);
  const pdfRes = await extractText(new Uint8Array(buf));
  const fullText = Array.isArray(pdfRes.text) ? pdfRes.text.join('\n') : String(pdfRes.text);
  const lines = fullText.split('\n');

  const items = [];
  const dimRegex = /^([A-Z]{1,4})\s+([\d,\.]+)\s*[Xx]\s*([\d,\.]+)\s*[Xx]\s*([\d,\.]+)(.*)$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(dimRegex);
    if (match) {
      const type = match[1].toUpperCase();
      const d = parseNumber(match[2]);
      const D = parseNumber(match[3]);
      const B = parseNumber(match[4]);
      const rest = match[5]?.trim() || '';

      if (d && D && B) {
        const dimStr = `${d}x${D}x${B} mm`;
        const code = `${type} ${match[2].replace(',', '.')}X${match[3].replace(',', '.')}X${match[4].replace(',', '.')}`;
        items.push({
          supplierName: SUPPLIER_NAME,
          brand: 'Pesaro',
          category: 'Rodamientos Medidas',
          code: code,
          name: `Rodamiento / Jaula ${type} ${dimStr}`,
          innerDiameterMm: d,
          outerDiameterMm: D,
          widthMm: B,
          dimensions: dimStr,
          application: rest ? `Cruzamientos: ${rest}` : null,
          originalCode: rest.split(' ')[0] || null,
          priceCents: 0,
        });
      }
    }
  }
  console.log(`Pesaro parsed: ${items.length} items`);
  return items;
}

async function parseHh() {
  const filePath = path.join(DOWNLOADS_DIR, 'HH.pdf');
  if (!fs.existsSync(filePath)) {
    console.log('HH PDF not found:', filePath);
    return [];
  }
  const buf = fs.readFileSync(filePath);
  const pdfRes = await extractText(new Uint8Array(buf));
  const fullText = Array.isArray(pdfRes.text) ? pdfRes.text.join('\n') : String(pdfRes.text);
  const lines = fullText.split('\n');

  const items = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const parts = line.split(/\s+/);
    if (parts.length >= 4 && /^\d+[A-Z]?$/i.test(parts[0])) {
      const code = `HH-${parts[0]}`;
      const lastNums = [];
      for (let i = parts.length - 1; i >= 1; i--) {
        const cleaned = parts[i].replace(/\(S\.I\.\)/i, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (!isNaN(num) && num > 5) {
          lastNums.unshift(num);
        }
      }

      const dado = lastNums.length >= 2 ? lastNums[0] : null;
      const largo = lastNums.length >= 2 ? lastNums[1] : null;

      const spicerIdx = parts.findIndex((p) => /^U-\d+|5-\d+|K5-/i.test(p));
      const spicerCode = spicerIdx !== -1 ? parts[spicerIdx] : null;

      items.push({
        supplierName: SUPPLIER_NAME,
        brand: 'HH Spicer',
        category: 'Crucetas y Cardan',
        code: code,
        name: `Cruceta ${parts[0]} ${dado ? `Dado ${dado}mm` : ''} ${largo ? `Largo ${largo}mm` : ''}`.trim(),
        innerDiameterMm: dado,
        outerDiameterMm: null,
        widthMm: largo,
        dimensions: dado && largo ? `Ø${dado} x ${largo} mm` : null,
        application: line.slice(parts[0].length).trim(),
        originalCode: spicerCode,
        priceCents: 0,
      });
    }
  }
  console.log(`HH parsed: ${items.length} items`);
  return items;
}

function parseRodamientosXls() {
  const filePath = path.join(DOWNLOADS_DIR, 'RODAMIENTOS.xls');
  if (!fs.existsSync(filePath)) {
    console.log('RODAMIENTOS.xls not found:', filePath);
    return [];
  }
  const wb = XLSX.readFile(filePath);
  const items = [];

  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let currentVehicle = sheet;

    for (const r of rows) {
      if (!r || r.length === 0) continue;
      if (r.length >= 2 && (r[1] === null || r[1] === undefined || r[1] === 'RODAMIENTO' || r[2] === 'RODAMIENTO')) {
        if (r[0] && typeof r[0] === 'string' && !r[0].includes('CATALOGO')) {
          currentVehicle = `${sheet} ${r[0]}`.trim();
        }
        continue;
      }

      const partName = r[0] ? String(r[0]).trim() : '';
      const partDetail = r[1] ? String(r[1]).trim() : '';
      const codeOrDim = r[2] ? String(r[2]).trim() : '';

      if (!codeOrDim || codeOrDim === 'RODAMIENTO' || codeOrDim.includes('CATALOGO')) continue;

      let d = null;
      let D = null;
      let B = null;
      let dimStr = null;

      const dimMatch = codeOrDim.match(/^([\d,\.]+)\s*[Xx]\s*([\d,\.]+)\s*[Xx]\s*([\d,\.]+)$/);
      if (dimMatch) {
        d = parseNumber(dimMatch[1]);
        D = parseNumber(dimMatch[2]);
        B = parseNumber(dimMatch[3]);
        dimStr = `${d}x${D}x${B} mm`;
      }

      items.push({
        supplierName: SUPPLIER_NAME,
        brand: sheet,
        category: 'Rodamientos Automotor',
        code: `${sheet}-${codeOrDim.replace(/\s+/g, '-')}`,
        name: `Rodamiento ${currentVehicle} ${partName} ${partDetail}`.trim(),
        innerDiameterMm: d,
        outerDiameterMm: D,
        widthMm: B,
        dimensions: dimStr,
        application: `${currentVehicle} - ${partName} (${partDetail})`,
        originalCode: codeOrDim,
        priceCents: 0,
      });
    }
  }
  console.log(`RODAMIENTOS.xls parsed: ${items.length} items`);
  return items;
}

function parseHomocineticasXls() {
  const filePath = path.join(DOWNLOADS_DIR, 'HOMOCINETICAS.xls');
  if (!fs.existsSync(filePath)) {
    console.log('HOMOCINETICAS.xls not found:', filePath);
    return [];
  }
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const items = [];

  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const code = String(r[0]).trim();
    const brand = r[1] ? String(r[1]).trim() : 'Genérico';
    const app = r[2] ? String(r[2]).trim() : '';
    const copa = parseNumber(r[5]);
    const estExt = r[6] ? String(r[6]).trim() : '';
    const estNuc = r[7] ? String(r[7]).trim() : '';
    const abs = r[8] ? String(r[8]).trim() : '';

    items.push({
      supplierName: SUPPLIER_NAME,
      brand: brand,
      category: 'Juntas Homocinéticas',
      code: `HC-${code}`,
      name: `Junta Homocinética ${brand} ${app}`.trim(),
      innerDiameterMm: null,
      outerDiameterMm: copa,
      widthMm: null,
      dimensions: copa ? `Ø Copa ${copa}mm` : null,
      application: `${app} | Est. Ext: ${estExt} | Est. Núcleo: ${estNuc} ${abs ? `| ABS: ${abs}` : ''}`.trim(),
      originalCode: code,
      priceCents: 0,
    });
  }
  console.log(`HOMOCINETICAS.xls parsed: ${items.length} items`);
  return items;
}

function parsePernosXls() {
  const filePath = path.join(DOWNLOADS_DIR, 'ODEMCO_PERNOS_PUNTA_DE_EJE.xls');
  if (!fs.existsSync(filePath)) {
    console.log('ODEMCO_PERNOS_PUNTA_DE_EJE.xls not found:', filePath);
    return [];
  }
  const wb = XLSX.readFile(filePath);
  const items = [];

  const ws = wb.Sheets['GUIA USUARIO'];
  if (ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    for (const r of rows) {
      if (!r || !r[0] || !String(r[0]).startsWith('P-')) continue;
      const code = String(r[0]).trim();
      const vehicle = r[1] ? String(r[1]).trim() : '';
      const diam = parseNumber(r[3]);
      const largo = parseNumber(r[5]);

      items.push({
        supplierName: SUPPLIER_NAME,
        brand: 'Odemco',
        category: 'Pernos Punta de Eje',
        code: code,
        name: `Perno Punta de Eje ${code} (${vehicle})`.trim(),
        innerDiameterMm: diam,
        outerDiameterMm: null,
        widthMm: largo,
        dimensions: diam && largo ? `Ø${diam} x ${largo} mm` : null,
        application: vehicle,
        originalCode: code,
        priceCents: 0,
      });
    }
  }
  console.log(`ODEMCO_PERNOS_PUNTA_DE_EJE.xls parsed: ${items.length} items`);
  return items;
}

async function run() {
  console.log('Iniciando extracción de catálogos de proveedores...');
  const pesaro = await parsePesaro();
  const hh = await parseHh();
  const rodamientos = parseRodamientosXls();
  const homocineticas = parseHomocineticasXls();
  const pernos = parsePernosXls();

  const allItems = [...pesaro, ...hh, ...rodamientos, ...homocineticas, ...pernos];
  console.log(`Total ítems extraídos para el catálogo de Alfa Rodamientos: ${allItems.length}`);

  if (allItems.length === 0) {
    console.log('No se encontraron ítems para sembrar.');
    return;
  }

  // Generar archivo SQL
  const sqlFile = path.join(process.cwd(), 'scripts', 'seed-catalogs.sql');
  const lines = ['-- Sembrado de catálogos técnicos de proveedores (Alfa Rodamientos)'];
  lines.push('DELETE FROM supplier_catalog_items WHERE supplier_name = "Alfa Rodamientos";');

  // Insertar en lotes de 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const chunk = allItems.slice(i, i + BATCH_SIZE);
    const valueTuples = chunk.map((item) => {
      return `(${escapeSql(item.supplierName)}, ${escapeSql(item.brand)}, ${escapeSql(item.category)}, ${escapeSql(item.code)}, ${escapeSql(item.name)}, ${item.innerDiameterMm ?? 'NULL'}, ${item.outerDiameterMm ?? 'NULL'}, ${item.widthMm ?? 'NULL'}, ${escapeSql(item.dimensions)}, ${escapeSql(item.application)}, ${escapeSql(item.originalCode)}, ${item.priceCents || 0})`;
    });

    lines.push(
      `INSERT INTO supplier_catalog_items (supplier_name, brand, category, code, name, inner_diameter_mm, outer_diameter_mm, width_mm, dimensions, application, original_code, price_cents) VALUES ${valueTuples.join(',\n')};`
    );
  }

  fs.writeFileSync(sqlFile, lines.join('\n\n'), 'utf-8');
  console.log(`Archivo SQL generado en ${sqlFile} (${lines.length} sentencias). Ejecutando en Cloudflare D1 local...`);

  try {
    execSync('npx.cmd wrangler d1 execute DB --local --file=./scripts/seed-catalogs.sql', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log('✅ Catálogos técnicos de Alfa Rodamientos sembrados exitosamente en D1 local.');
  } catch (err) {
    console.error('Error al ejecutar migración SQL en D1:', err);
  }
}

run();
