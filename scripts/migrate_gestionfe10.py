"""
Migración integral directa desde Gestión Comercial FE10 (carpeta Downloads)
hacia la base de datos Cloudflare D1 (SQLite) de Hugo Repuestos, más actualización
del archivo Excel homologado articulos_migrados_gestionfe.xlsx.
"""
import os
import re
import csv
import glob
import json
import struct
import sqlite3
import datetime
import pymupdf
import openpyxl
from openpyxl import Workbook

LEGACY_DIR = r"C:\Users\lucas\Downloads\GestionFE10 - copia\GestionFE10 - copia"
PROJECT_DIR = r"c:\Users\lucas\OneDrive\Escritorio\CHANGAS\HugoRodamientosAPP"
DB_GLOB = os.path.join(PROJECT_DIR, r".wrangler\state\v3\d1\miniflare-D1DatabaseObject\*.sqlite")
OUT_XLSX = os.path.join(PROJECT_DIR, "articulos_migrados_gestionfe.xlsx")

KNOWN_BRANDS = [
    "SKF", "NSK", "NTN", "TIMKEN", "KOYO", "FAG", "INA", "SNR", "NACHI", "ZKL",
    "SAV", "DBH", "CORTECO", "TENUP", "SABO", "BAZTARRICA",
    "TARANTO", "ILLINOIS", "CICARELLI", "AJUSA",
    "GATES", "DAYCO", "MICHELIN", "HUTCHINSON", "DEXCO", "CONTINENTAL", "CONTITECH", "GOODYEAR", "OPTIBELT", "DUNLOP",
    "PESARO", "SPICER", "ALBARUS", "ETMA", "THOMPSON", "NAKATA", "VTH", "CORVEN", "FRIC-ROT", "SACHS", "LUK", "VALEO",
    "DOLZ", "VMG", " VMG ", "WURTH", "STANLEY", "VALVOLINE", "WOLVER", "LOCTITE", "LOCX", "SILOC",
    "MKW", "IRB", "TOLEDO", "ODEMCO", "BOWER", "ROLLWAY", "TORRINGTON", "IKO", "FYH", "ASAHI", "DODGE",
]

FREIGHT_CARRIERS = {"TRANSPORTE PS", "VIA CARGO"}


def clean_num(val):
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(" ", "").replace(",", "")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_dmy_to_iso(date_str, time_str="12:00"):
    if not date_str:
        return None
    s = str(date_str).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$", s)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    hh, mm = 12, 0
    tm = re.match(r"^(\d{1,2}):(\d{1,2})", str(time_str or "").strip())
    if tm:
        hh, mm = int(tm.group(1)), int(tm.group(2))
    try:
        dt = datetime.datetime(y, mo, d, hh, mm, 0)
        return dt.strftime("%Y-%m-%dT%H:%M:00.000Z")
    except ValueError:
        return None


def excel_serial_to_ymd(serial):
    if not serial or not isinstance(serial, (int, float)) or serial < 20000:
        return "2025-05-01"
    base_date = datetime.date(1899, 12, 30)
    try:
        return (base_date + datetime.timedelta(days=int(serial))).strftime("%Y-%m-%d")
    except Exception:
        return "2025-05-01"


def parse_biff_xls(path):
    with open(path, "rb") as f:
        data = f.read()
    pos = 0
    cells = {}
    max_r = 0
    max_c = 0
    while pos + 4 <= len(data):
        opcode, length = struct.unpack_from("<HH", data, pos)
        pos += 4
        payload = data[pos : pos + length]
        pos += length
        if opcode == 0x0004 and len(payload) >= 8:
            r, c = struct.unpack_from("<HH", payload, 0)
            slen = payload[7]
            cells[(r, c)] = payload[8 : 8 + slen].decode("latin1", errors="replace").strip()
            max_r = max(max_r, r); max_c = max(max_c, c)
        elif opcode == 0x0204 and len(payload) >= 8:
            r, c, xf, slen = struct.unpack_from("<HHHH", payload, 0)
            cells[(r, c)] = payload[8 : 8 + slen].decode("latin1", errors="replace").strip()
            max_r = max(max_r, r); max_c = max(max_c, c)
        elif opcode == 0x0003 and len(payload) >= 15:
            r, c = struct.unpack_from("<HH", payload, 0)
            cells[(r, c)] = struct.unpack_from("<d", payload, 7)[0]
            max_r = max(max_r, r); max_c = max(max_c, c)
        elif opcode == 0x0203 and len(payload) >= 14:
            r, c, xf, val = struct.unpack_from("<HHHd", payload, 0)
            cells[(r, c)] = val
            max_r = max(max_r, r); max_c = max(max_c, c)
        elif opcode == 0x0002 and len(payload) >= 9:
            r, c = struct.unpack_from("<HH", payload, 0)
            cells[(r, c)] = struct.unpack_from("<H", payload, 7)[0]
            max_r = max(max_r, r); max_c = max(max_c, c)
    rows = []
    for r in range(max_r + 1):
        row = [cells.get((r, c), None) for c in range(max_c + 1)]
        if any(x is not None and x != "" for x in row):
            rows.append(row)
    return rows


def detect_brand(desc):
    if not desc:
        return None
    up = desc.upper()
    for b in KNOWN_BRANDS:
        bt = b.strip()
        if re.search(r"(?:^|[\s\-\(/])" + re.escape(bt) + r"(?:$|[\s\-\)/])", up):
            return bt
    if up.startswith("DBH"):
        return "DBH"
    if up.startswith("VKBA") or up.startswith("VKMA") or up.startswith("VKM") or up.startswith("VKPC") or up.startswith("BAH-"):
        return None
    return None


def classify_category(desc, raw_rubro=None):
    if raw_rubro and raw_rubro.strip():
        r = raw_rubro.strip().upper()
        if "RETEN" in r:
            return "Retenes y sellos"
        if "FRENO" in r:
            return "Frenos y Suspensión"
        if "HERRAM" in r:
            return "Herramientas e Insumos"
        return raw_rubro.strip().title()

    up = (desc or "").upper().strip()
    if any(k in up for k in ["RETEN", "DBH", "SAV", "ORING", "O-RING", "O'RING", "CRAPODINA SELL"]):
        return "Retenes y sellos"
    if re.match(r"^\d?PK\d{3,5}", up) or any(k in up for k in ["CORREA", "CANAL A", "CANAL B", "CANAL C", "STP8M", "HTD"]):
        return "Correas en V y poli-V"
    if any(k in up for k in ["VKBA", "BAH-", "BAF-", "BAF0", "DAC", "MAZA ", "RUEDA"]):
        return "Mazas y Kits de Rueda"
    if any(k in up for k in ["VKMA", "VKM ", "VKM-", "VKPC", "BOMBA AGUA", "KIT DIST", "BA-", "TENSOR"]):
        return "Distribución y Bombas de Agua"
    if any(k in up for k in ["CRUCETA", "TRICETA", "CARDAN", "SPICER", "PUENTE CARDAN"]) or re.match(r"^5-\d{3}X", up):
        return "Crucetas y Cardanes"
    if any(k in up for k in ["CRAPODINA", "VKC", "EMBRAGUE"]) or re.match(r"^CR\d{3,4}", up):
        return "Crapodinas y Embrague"
    if re.match(r"^(302|303|320|322|323|330|331|332|315|LM|HM|L44|L68|JL6|M86|M88|SET-?\d)", up):
        return "Rulemanes cónicos"
    if re.match(r"^(60\d|62\d|63\d|64\d|68\d|69\d|160\d|60/|62/|63/)", up) or "2RS" in up or "2Z" in up or " ZZ" in up:
        return "Rulemanes rígidos de bolas"
    if re.match(r"^(UC|UCP|UCF|UCFL|UCT|YAR|SY|SN|TSN|H-\d|222\d|223\d|213\d|NU\d|NJ\d)", up) or "SOPORTE" in up or "MANGUITO" in up:
        return "Rodamientos Industriales y Soportes"
    if any(k in up for k in ["GRASA", "ACEITE", "LUBRIC", "SELLADOR", "SILICONA", "TRABA", "LIMPIA"]):
        return "Grasas y lubricantes"
    if any(k in up for k in ["JUNTA", "TORNILLO", "BULON"]):
        return "Juntas y Bulonería Motor"
    if any(k in up for k in ["PASTILLA", "FRENO", "ROTULA", "EXTREMO", "BIELETA", "PARRILLA", "AMORTIG"]):
        return "Frenos y Suspensión"
    return "Rodamientos Automotor"


def extract_dimensions(desc):
    if not desc:
        return None, None, None, None
    # Match d x D x B (e.g. 60x110x23.75, 25*62*17, 34.925x76.2x29.37)
    m3 = re.search(
        r"(?<!\d)(\d{1,3}(?:[.,]\d{1,3})?)\s*[xX*]\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*[xX*]\s*(\d{1,3}(?:[.,]\d{1,3})?)(?!\d)",
        desc,
    )
    if m3:
        try:
            d = float(m3.group(1).replace(",", "."))
            D = float(m3.group(2).replace(",", "."))
            B = float(m3.group(3).replace(",", "."))
            if 1 <= d <= 500 and 3 <= D <= 1000 and 0.5 <= B <= 400 and D >= d:
                fmt = lambda v: str(int(v)) if v == int(v) else f"{v:.3f}".rstrip("0").rstrip(".")
                return d, D, B, f"{fmt(d)}x{fmt(D)}x{fmt(B)} mm"
        except ValueError:
            pass
    return None, None, None, None


def net_price_to_final_ars(net_price):
    """En Gestión FE10, Articulos.log almacena Precio Neto sin 21% IVA. Lista1 = Precio * 1.21."""
    if not net_price or net_price <= 0:
        return 0.0
    gross = net_price * 1.21
    nearest_int = round(gross)
    if abs(gross - nearest_int) <= 0.08:
        return float(nearest_int)
    return round(gross, 2)


def main():
    db_files = glob.glob(DB_GLOB)
    if not db_files:
        raise RuntimeError(f"No se encontró archivo SQLite D1 en {DB_GLOB}")
    db_path = db_files[0]
    print(f"Conectando a base D1: {db_path}")

    # -------------------------------------------------------------------------
    # 1. EXTRAER PROVEEDORES REALES
    # -------------------------------------------------------------------------
    suppliers_by_legacy_id = {}

    # 1a. Proveedores.log
    with open(os.path.join(LEGACY_DIR, "Proveedores.log"), "r", encoding="latin1", errors="replace") as f:
        for line in f:
            if not line.strip().startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 8 or parts[4] == "Proveedor":
                continue
            sid = parts[4].replace(",", "")
            name = parts[5].strip()
            razon = parts[6].strip()
            addr = parts[7].strip()
            city = "Bahía Blanca" if "bahia" in addr.lower() else ("CABA" if "caba" in addr.lower() else "Argentina")
            if "189" == sid:
                city = "Neuquén Capital"
            suppliers_by_legacy_id[sid] = {
                "legacy_id": sid,
                "name": name,
                "razon": razon,
                "address": addr,
                "city": city,
                "brands": set(),
            }

    # 1b. retenes.xlsx
    wb_ret = openpyxl.load_workbook(os.path.join(LEGACY_DIR, "Listados", "retenes.xlsx"), data_only=True)
    ws_ret = wb_ret["Archivo"]
    ret_rows = list(ws_ret.iter_rows(min_row=3, values_only=True))
    for r in ret_rows:
        if not r or not r[0] or str(r[0]).strip().lower() in ("codigo", "articulos"):
            continue
        if r[13] and r[14]:
            sid = str(int(r[13])) if isinstance(r[13], (int, float)) else str(r[13]).strip()
            sname = str(r[14]).strip()
            if sname.lower() == "proveedor":
                continue
            if sid not in suppliers_by_legacy_id:
                suppliers_by_legacy_id[sid] = {
                    "legacy_id": sid, "name": sname, "razon": sname, "address": "", "city": "Buenos Aires", "brands": set()
                }
            if r[12]:
                suppliers_by_legacy_id[sid]["brands"].add(str(r[12]).strip())

    # 1c. iva.xls ("Facturas Impagas a Proveedores")
    iva_rows = parse_biff_xls(os.path.join(LEGACY_DIR, "Listados", "iva.xls"))
    supplier_invoices_to_load = []
    for row in iva_rows[2:]:
        if len(row) >= 12 and isinstance(row[0], (int, float)) and row[1]:
            sid = str(int(row[0]))
            sname = str(row[1]).strip()
            if sid not in suppliers_by_legacy_id:
                city = "Neuquén Capital" if "NEUQUEN" in sname.upper() else ("Santa Fe" if "SANTA FE" in sname.upper() else "Buenos Aires")
                suppliers_by_legacy_id[sid] = {
                    "legacy_id": sid, "name": sname, "razon": sname, "address": "", "city": city, "brands": set()
                }
            doc_type = str(row[3] or "FAC").strip()
            letter = str(row[4] or "A").strip()
            inv_num = str(row[5] or "").strip()
            importe = clean_num(row[6])
            f_fac = excel_serial_to_ymd(row[7])
            f_vto = excel_serial_to_ymd(row[2])
            saldo = clean_num(row[11])
            if inv_num and importe > 0 and doc_type == "FAC":
                neto = round(importe / 1.21, 2)
                iva = round(importe - neto, 2)
                supplier_invoices_to_load.append({
                    "supplier_name": sname,
                    "invoice_number": f"{letter} {inv_num}" if letter else inv_num,
                    "raw_inv_num": inv_num,
                    "invoice_date": f_fac,
                    "subtotal_cents": int(round(neto * 100)),
                    "tax_cents": int(round(iva * 100)),
                    "total_cents": int(round(importe * 100)),
                    "notes": f"Migrada de Gestión FE10 · Vto: {f_vto} · Saldo impago registrado: ${saldo:,.2f}",
                })

    # 1d. Facturas de Compra.PDF
    doc_fc = pymupdf.open(os.path.join(LEGACY_DIR, "Listados", "Facturas de Compra.PDF"))
    fc_lines = []
    for page in doc_fc:
        fc_lines.extend([l.strip() for l in page.get_text().splitlines() if l.strip()])

    seen_inv_nums = {x["raw_inv_num"] for x in supplier_invoices_to_load}
    for i, ln in enumerate(fc_lines):
        if re.match(r"^\d{4}-\d{8}$", ln) and i + 7 < len(fc_lines):
            inv_num = ln
            sname = fc_lines[i + 1]
            if re.match(r"^\d{4}-\d{8}$", sname):
                continue
            doc_kind = None
            neto_val = 0.0
            total_val = 0.0
            f_fac_iso = None
            sid = None
            for j in range(i + 2, min(i + 12, len(fc_lines) - 1)):
                if fc_lines[j] in ("FAC A", "FAC B", "FAC C", "NCR A"):
                    doc_kind = fc_lines[j]
                    if j + 2 < len(fc_lines):
                        neto_val = clean_num(fc_lines[j + 1])
                        total_val = clean_num(fc_lines[j + 2])
                if re.match(r"^\d{2}/\d{2}/\d{4}$", fc_lines[j]) and re.match(r"^\d+$", fc_lines[j + 1]):
                    d_parts = fc_lines[j].split("/")
                    f_fac_iso = f"{d_parts[2]}-{d_parts[1]}-{d_parts[0]}"
                    sid = fc_lines[j + 1]
                    break
            if sid and sid not in suppliers_by_legacy_id:
                city = "Bahía Blanca" if "BAHIA" in sname.upper() else "Buenos Aires"
                suppliers_by_legacy_id[sid] = {
                    "legacy_id": sid, "name": sname, "razon": sname, "address": "", "city": city, "brands": set()
                }
            if doc_kind and doc_kind.startswith("FAC") and total_val > 0 and inv_num not in seen_inv_nums and f_fac_iso:
                seen_inv_nums.add(inv_num)
                iva_val = max(0.0, total_val - neto_val)
                supplier_invoices_to_load.append({
                    "supplier_name": sname,
                    "invoice_number": f"A {inv_num}",
                    "raw_inv_num": inv_num,
                    "invoice_date": f_fac_iso,
                    "subtotal_cents": int(round(neto_val * 100)),
                    "tax_cents": int(round(iva_val * 100)),
                    "total_cents": int(round(total_val * 100)),
                    "notes": "Migrada de Listado de Facturas de Compra (Gestión FE10)",
                })

    # -------------------------------------------------------------------------
    # 2. HISTORIAL DE COMPRAS Y VENTAS POR PRODUCTO (Compras.log, Compreng.log, Factreng.log)
    # -------------------------------------------------------------------------
    inv_to_sup = {}
    inv_item_counts = {}
    with open(os.path.join(LEGACY_DIR, "Compras.log"), "r", encoding="latin1", errors="replace") as f:
        for line in f:
            if not line.strip().startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 10 or parts[5] == "Factura":
                continue
            if "Delete" in parts[3]:
                continue
            inv_num = parts[5]
            inv_date = parts[7]
            sup_id = parts[8].replace(",", "")
            inv_to_sup[inv_num] = (sup_id, parse_dmy_to_iso(inv_date) or parse_dmy_to_iso(parts[1], parts[2]))

    prod_last_purchase = {}
    prod_suppliers_seen = {}  # code -> list of supplier_names (ordered latest last)
    with open(os.path.join(LEGACY_DIR, "Compreng.log"), "r", encoding="latin1", errors="replace") as f:
        for line in f:
            if not line.strip().startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 9 or parts[5] == "Factura":
                continue
            if "Delete" in parts[3]:
                continue
            inv_num = parts[5]
            inv_item_counts[inv_num] = inv_item_counts.get(inv_num, 0) + 1
            code = parts[7].replace(",", "")
            if not code or code in ("1", "2", "13", "14"):
                continue
            sup_id, dt_iso = inv_to_sup.get(inv_num, (None, parse_dmy_to_iso(parts[1], parts[2])))
            if dt_iso:
                if code not in prod_last_purchase or dt_iso > prod_last_purchase[code]:
                    prod_last_purchase[code] = dt_iso
            if sup_id and sup_id in suppliers_by_legacy_id:
                sname = suppliers_by_legacy_id[sup_id]["name"]
                if sname.upper() not in FREIGHT_CARRIERS:
                    lst = prod_suppliers_seen.setdefault(code, [])
                    if sname not in lst:
                        lst.append(sname)

    prod_last_sale = {}
    with open(os.path.join(LEGACY_DIR, "Factreng.log"), "r", encoding="latin1", errors="replace") as f:
        for line in f:
            if not line.strip().startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 8 or parts[6] == "Articulo":
                continue
            if "Delete" in parts[3]:
                continue
            code = parts[6].replace(",", "")
            dt_iso = parse_dmy_to_iso(parts[1], parts[2])
            if code and code not in ("1", "2") and dt_iso:
                if code not in prod_last_sale or dt_iso > prod_last_sale[code]:
                    prod_last_sale[code] = dt_iso

    # -------------------------------------------------------------------------
    # 3. CONSOLIDAR LOS 7.017 PRODUCTOS REALES (Articulos.log + retenes.xlsx +Hoja1)
    # -------------------------------------------------------------------------
    products = {}

    with open(os.path.join(LEGACY_DIR, "Articulos.log"), "r", encoding="latin1", errors="replace") as f:
        for line in f:
            if not line.strip().startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 9:
                continue
            code = parts[4].replace(",", "").strip()
            desc = parts[5].strip()
            if not code or code.lower() == "codigo" or not desc or desc.lower() == "descripcion":
                continue
            if "Delete" in parts[3]:
                continue

            dt_iso = parse_dmy_to_iso(parts[1], parts[2]) or "2025-04-08T12:00:00.000Z"
            costo_bruto = clean_num(parts[6])
            margen = clean_num(parts[7])
            precio_neto = clean_num(parts[8])

            precio_final = net_price_to_final_ars(precio_neto)
            # Calcular costo neto real: si hay margen y precio_neto, Precio_Neto = Costo_Final * (1 + Margen/100)
            costo_neto = 0.0
            if precio_neto > 0 and margen > 0:
                derived = round(precio_neto / (1.0 + margen / 100.0), 2)
                if costo_bruto > 0 and costo_bruto <= precio_neto * 1.05:
                    costo_neto = costo_bruto
                else:
                    costo_neto = derived
            elif costo_bruto > 0:
                costo_neto = costo_bruto

            prev = products.get(code)
            if prev:
                prev["updated_at"] = dt_iso
                if desc:
                    prev["name"] = desc
                if precio_final > 0:
                    prev["price_ars"] = precio_final
                if costo_neto > 0:
                    prev["cost_ars"] = costo_neto
                if margen > 0:
                    prev["margen"] = margen
            else:
                products[code] = {
                    "sku": code,
                    "name": desc,
                    "raw_rubro": None,
                    "brand": None,
                    "price_ars": precio_final,
                    "cost_ars": costo_neto,
                    "margen": margen,
                    "stock": 0,
                    "has_stock_source": False,
                    "supplier_name": None,
                    "supplier_code": None,
                    "barcode": None,
                    "freight_pct": 0.0,
                    "updated_at": dt_iso,
                }

    # Enrich / add from retenes.xlsx (Archivo)
    for r in ret_rows:
        if not r or not r[0] or str(r[0]).strip().lower() in ("codigo", "articulos"):
            continue
        code = str(r[0]).strip().replace(",", "")
        desc = str(r[1]).strip() if r[1] else ""
        if not code or not desc:
            continue
        rubro = str(r[3]).strip() if len(r) > 3 and r[3] else "RETENES"
        lista1 = clean_num(r[4]) if len(r) > 4 else 0.0
        fecha_val = r[5] if len(r) > 5 else None
        ret_iso = (
            fecha_val.strftime("%Y-%m-%dT12:00:00.000Z")
            if isinstance(fecha_val, (datetime.datetime, datetime.date))
            else "2026-02-27T12:00:00.000Z"
        )
        stock_actual = max(0, int(round(clean_num(r[10])))) if len(r) > 10 else 0
        marca = str(r[12]).strip() if len(r) > 12 and r[12] else None
        proveedor = str(r[14]).strip() if len(r) > 14 and r[14] and str(r[14]).strip().lower() != "proveedor" else None
        cod_prov = str(r[15]).strip() if len(r) > 15 and r[15] and str(r[15]).strip() != "0" else None
        barcode_raw = str(r[16]).strip() if len(r) > 16 and r[16] else ""
        barcode = barcode_raw if barcode_raw and barcode_raw not in ("0", "0.0", "None") and len(barcode_raw) >= 5 else None
        costo_bruto = clean_num(r[18]) if len(r) > 18 else 0.0
        flete_pct = clean_num(r[23]) if len(r) > 23 else 0.0
        costo_final = clean_num(r[24]) if len(r) > 24 else 0.0
        eff_cost = costo_final if costo_final > 0 else costo_bruto

        if code in products:
            p = products[code]
            p["raw_rubro"] = rubro
            if marca:
                p["brand"] = marca
            if proveedor:
                p["supplier_name"] = proveedor
            if cod_prov:
                p["supplier_code"] = cod_prov
            if barcode:
                p["barcode"] = barcode
            if flete_pct > 0:
                p["freight_pct"] = flete_pct
            p["stock"] = stock_actual
            p["has_stock_source"] = True
            # Use newer price between Articulos.log and retenes.xlsx
            if p["price_ars"] <= 0 or ret_iso > p["updated_at"]:
                if lista1 > 0:
                    p["price_ars"] = lista1
            if eff_cost > 0 and (p["cost_ars"] <= 0 or ret_iso >= p["updated_at"]):
                p["cost_ars"] = round(eff_cost, 2)
        else:
            products[code] = {
                "sku": code,
                "name": desc,
                "raw_rubro": rubro,
                "brand": marca,
                "price_ars": lista1,
                "cost_ars": round(eff_cost, 2),
                "margen": clean_num(r[28]) if len(r) > 28 else 0.0,
                "stock": stock_actual,
                "has_stock_source": True,
                "supplier_name": proveedor,
                "supplier_code": cod_prov,
                "barcode": barcode,
                "freight_pct": flete_pct,
                "updated_at": ret_iso,
            }

    # Filtrar entradas genéricas del sistema viejo ("Varios", "Descuento", "Fletes", "Alquileres")
    SKIP_NAMES = {"varios", "decuento", "descuento", "fletes", "alquileres", "redondeo"}
    valid_products = []
    for code, p in products.items():
        nm_low = p["name"].strip().lower()
        if nm_low in SKIP_NAMES or code in ("1", "2", "13", "14") or len(nm_low) < 2:
            continue

        if not p["brand"]:
            p["brand"] = detect_brand(p["name"])

        p["category_name"] = classify_category(p["name"], p["raw_rubro"])
        d, D, B, dims = extract_dimensions(p["name"])
        p["inner_mm"] = d
        p["outer_mm"] = D
        p["width_mm"] = B
        p["dimensions"] = dims

        # Supplier linkage from Compreng.log if not already set
        hist_sups = prod_suppliers_seen.get(code, [])
        if not p["supplier_name"] and hist_sups:
            p["supplier_name"] = hist_sups[-1]  # latest supplier
        p["all_suppliers"] = list(dict.fromkeys(([p["supplier_name"]] if p["supplier_name"] else []) + hist_sups))

        # Track brand per supplier
        if p["brand"] and p["supplier_name"]:
            for sinfo in suppliers_by_legacy_id.values():
                if sinfo["name"].lower() == p["supplier_name"].lower():
                    sinfo["brands"].add(p["brand"])

        p["last_purchase_at"] = prod_last_purchase.get(code)
        p["last_sale_at"] = prod_last_sale.get(code)

        valid_products.append(p)

    print(f"Total productos reales depurados a cargar: {len(valid_products)}")

    # -------------------------------------------------------------------------
    # 4. EXTRAER CLIENTES Y CUENTAS CORRIENTES (cuentas corrientes.xls + Clientes.log + Pdf/*.PDF + Facturas Impagas PDF)
    # -------------------------------------------------------------------------
    cc_rows = parse_biff_xls(os.path.join(LEGACY_DIR, "Listados", "cuentas corrientes 31122026.xls"))
    customers_map = {}  # key: upper(name) or cuit

    CORP_KEYWORDS = [
        "SRL", "S.R.L", "SA", "S.A", "SAC", "SAU", "SH", "COOP", "TALLER", "MOTORS", "SERVICE",
        "HOSP", "FUNDACION", "POLICIA", "PARQUES", "CONSEJO", "TRANSPORTE", "MADERAS", "TAMBO",
        "INVAP", "CATEDRAL", "ADMINISTRACION", "JEFATURA", "CLUB", "HOTEL", "EMPRESA", "DISTRIB",
    ]

    for row in cc_rows[2:]:
        if len(row) < 16 or not isinstance(row[0], (int, float)) or not row[1]:
            continue
        legacy_cid = int(row[0])
        name = str(row[1]).strip()
        if legacy_cid == 1 or name.lower() == "consumidor final":
            continue

        saldo = clean_num(row[2])
        addr = str(row[7]).strip() if row[7] else None
        localidad = str(row[9]).strip().title() if row[9] else "San Carlos de Bariloche"
        if "bariloche" in localidad.lower():
            localidad = "San Carlos de Bariloche"
        raw_tel = str(row[11]).strip() if row[11] else ""
        raw_fax = str(row[12]).strip() if row[12] else ""
        raw_mail = str(row[13]).strip() if row[13] else ""
        razon = str(row[14]).strip() if row[14] else ""
        raw_cuit = str(row[15]).strip() if row[15] else ""
        cant_impagas = int(clean_num(row[16])) if len(row) > 16 else 0
        atraso_dias = int(clean_num(row[17])) if len(row) > 17 else 0

        # Extract emails hidden in tel/fax/mail, ignoring Hugo's own placeholder email
        emails_found = []
        for field in (raw_mail, raw_tel, raw_fax):
            for em in re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", field):
                if "rodamientoshugo" not in em.lower():
                    emails_found.append(em.lower())
        email = emails_found[0] if emails_found else None

        # Clean phone (if raw_tel was only an email, clear it)
        phone = None
        if raw_tel and "@" not in raw_tel:
            phone = raw_tel[:40]
        elif raw_fax and "@" not in raw_fax:
            phone = raw_fax[:40]

        cuit = raw_cuit if (raw_cuit and not raw_cuit.startswith("00-0000") and len(raw_cuit) >= 11) else None
        is_empresa = bool(
            (cuit and cuit[:2] in ("30", "33", "34"))
            or any(re.search(r"\b" + kw + r"\b", name.upper()) for kw in CORP_KEYWORDS)
        )
        ctype = "empresa" if is_empresa else "particular"

        notes_parts = [f"Cliente #{legacy_cid} migrado de Gestión FE10."]
        if razon and razon.lower() != name.lower():
            notes_parts.append(f"Razón Social: {razon}.")
        if len(emails_found) > 1:
            notes_parts.append(f"Emails adicionales: {', '.join(emails_found[1:])}.")

        customers_map[name.upper()] = {
            "legacy_id": legacy_cid,
            "name": name,
            "customer_type": ctype,
            "phone": phone,
            "cuit": cuit,
            "email": email,
            "address": addr,
            "city": localidad,
            "notes": " ".join(notes_parts),
            "saldo": saldo,
            "cant_impagas": cant_impagas,
            "atraso_dias": atraso_dias,
        }

    # Also add clients from Clientes.log if not already present
    with open(os.path.join(LEGACY_DIR, "Clientes.log"), "r", encoding="latin1", errors="replace") as f:
        for line in f:
            if not line.strip().startswith("|"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 6 or parts[4] == "Cliente":
                continue
            cid_str = parts[4].replace(",", "")
            cname = parts[5].strip()
            if cname and cname.upper() not in customers_map and cname.upper() != "INVAP SE":
                customers_map[cname.upper()] = {
                    "legacy_id": cid_str,
                    "name": cname,
                    "customer_type": "particular",
                    "phone": None,
                    "cuit": None,
                    "email": None,
                    "address": None,
                    "city": "San Carlos de Bariloche",
                    "notes": f"Cliente #{cid_str} migrado de Clientes.log (Gestión FE10).",
                    "saldo": 0.0,
                    "cant_impagas": 0,
                    "atraso_dias": 0,
                }

    print(f"Total clientes reales depurados: {len(customers_map)}")

    # -------------------------------------------------------------------------
    # 5. TRANSACCIÓN ATÓMICA EN CLOUDFLARE D1 (SQLITE)
    # -------------------------------------------------------------------------
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    try:
        cur.execute("BEGIN IMMEDIATE")

        # 5.1 Actualizar datos comerciales oficiales de Hugo en settings
        cur.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            ("business_name", json.dumps("Hugo Repuestos - Industrial y Automotriz")),
        )
        cur.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            (
                "receipt_footer",
                json.dumps("Hugo Repuestos · Fagnano 1065, San Carlos de Bariloche · CUIT 20-29045532-5 · Comprobante interno"),
            ),
        )

        # 5.2 Desactivar productos y proveedores DEMO ficticios (preservando integridad de FK y Kardex)
        cur.execute("UPDATE products SET active = 0 WHERE sku LIKE 'DEMO-%'")
        cur.execute(
            "UPDATE suppliers SET active = 0 WHERE name IN ('Distribuidora Patagónica SKF / FAG', 'Importadora Buenos Aires Sur')"
        )
        cur.execute(
            "DELETE FROM product_supplier_options WHERE supplier_id IN (SELECT id FROM suppliers WHERE active = 0)"
        )

        # 5.3 Asegurar categorías reales
        cat_cache = {}
        cur.execute("SELECT id, name FROM categories")
        for cid, cname in cur.fetchall():
            cat_cache[cname.lower()] = cid

        for p in valid_products:
            cn = p["category_name"]
            if cn.lower() not in cat_cache:
                cur.execute("INSERT OR IGNORE INTO categories (name, active) VALUES (?, 1)", (cn,))
                cur.execute("SELECT id FROM categories WHERE name = ? COLLATE NOCASE", (cn,))
                cat_cache[cn.lower()] = cur.fetchone()[0]

        # 5.4 Insertar / actualizar los proveedores reales
        sup_name_to_id = {}
        cur.execute("SELECT id, name FROM suppliers")
        for sid, sname in cur.fetchall():
            sup_name_to_id[sname.lower()] = sid

        for leg_id, s in suppliers_by_legacy_id.items():
            sname = s["name"].strip()
            if not sname or sname.lower() == "proveedor":
                continue
            is_carrier = sname.upper() in FREIGHT_CARRIERS
            brands_str = (
                "TRANSPORTE / EXPRESO DE CARGAS"
                if is_carrier
                else (", ".join(sorted(s["brands"]))[:290] if s["brands"] else None)
            )
            notes_parts = [f"Proveedor #{leg_id} migrado de Gestión FE10."]
            if s["razon"] and s["razon"].lower() != sname.lower():
                notes_parts.append(f"Razón Social: {s['razon']}.")
            if s["address"]:
                notes_parts.append(f"Dirección: {s['address']}.")
            if is_carrier:
                notes_parts.append("Empresa de transporte/flete de mercadería a Bariloche.")

            lead_days = 2 if "neuqu" in s["city"].lower() else (3 if "bah" in s["city"].lower() else 4)
            freight = 0.0 if is_carrier else (3.5 if "neuqu" in s["city"].lower() else 6.0)

            if sname.lower() in sup_name_to_id:
                db_sid = sup_name_to_id[sname.lower()]
                cur.execute(
                    "UPDATE suppliers SET active = 1, brands_supplied = COALESCE(brands_supplied, ?) WHERE id = ?",
                    (brands_str, db_sid),
                )
            else:
                cur.execute(
                    """INSERT INTO suppliers (
                         name, cuit, phone, email, contact_person, city,
                         lead_time_days, lead_time_alert_days, freight_pct,
                         payment_terms, brands_supplied, notes, active
                       ) VALUES (?, NULL, NULL, NULL, NULL, ?, ?, 5, ?, 'Cuenta corriente 30 días', ?, ?, 1)""",
                    (sname[:120], s["city"], lead_days, freight, brands_str, " ".join(notes_parts)[:1000]),
                )
                sup_name_to_id[sname.lower()] = cur.lastrowid

        print(f"Proveedores activos en DB: {len(sup_name_to_id)}")

        # 5.5 Insertar / actualizar los 7.017 productos manteniendo 100% consistencia con stock_movements
        existing_skus = {}
        cur.execute("SELECT sku, id, stock FROM products")
        for sku_val, pid_val, st_val in cur.fetchall():
            existing_skus[sku_val.lower()] = (pid_val, st_val)

        used_barcodes = set()
        cur.execute("SELECT code FROM product_barcodes WHERE active = 1")
        for (bcode,) in cur.fetchall():
            used_barcodes.add(bcode)

        inserted_products = 0
        updated_products = 0
        initial_movements = 0
        supplier_opts_added = 0

        for p in valid_products:
            sku = p["sku"][:64]
            name = p["name"][:200]
            cat_id = cat_cache[p["category_name"].lower()]
            price_cents = max(0, int(round(p["price_ars"] * 100)))
            cost_cents = int(round(p["cost_ars"] * 100)) if p["cost_ars"] > 0 else None
            # Si viene de retenes.xlsx con stock > 0, definimos min_stock=1, target_stock=max(3, stock+1);
            # si el stock no venía en Articulos.log (0), dejamos min_stock=NULL para no contaminar alertas urgentes hasta recuento físico.
            stock_val = p["stock"]
            min_stock = 1 if (p["has_stock_source"] and stock_val > 0) else None
            target_stock = max(3, stock_val + 2) if min_stock is not None else None

            sup_name = p["supplier_name"][:120] if p["supplier_name"] else None
            sup_code = p["supplier_code"][:80] if p["supplier_code"] else None
            freight_pct = p["freight_pct"] if p["freight_pct"] > 0 else (6.0 if sup_name else 0.0)

            desc_parts = [p["name"]]
            if p["dimensions"]:
                desc_parts.append(f"Medidas: {p['dimensions']}")
            desc_text = " · ".join(desc_parts)[:2000]

            if sku.lower() in existing_skus:
                pid, current_stock = existing_skus[sku.lower()]
                cur.execute(
                    """UPDATE products SET
                         name = CASE WHEN name LIKE 'DEMO -%' THEN name ELSE ? END,
                         description = COALESCE(description, ?),
                         brand = COALESCE(brand, ?),
                         category_id = COALESCE(category_id, ?),
                         price_cents = CASE WHEN price_cents = 0 AND ? > 0 THEN ? ELSE price_cents END,
                         cost_cents = COALESCE(cost_cents, ?),
                         inner_diameter_mm = COALESCE(inner_diameter_mm, ?),
                         outer_diameter_mm = COALESCE(outer_diameter_mm, ?),
                         width_mm = COALESCE(width_mm, ?),
                         dimensions = COALESCE(dimensions, ?),
                         supplier_name = COALESCE(supplier_name, ?),
                         supplier_code = COALESCE(supplier_code, ?),
                         last_purchase_at = COALESCE(last_purchase_at, ?),
                         last_sale_at = COALESCE(last_sale_at, ?)
                       WHERE id = ?""",
                    (
                        name, desc_text, p["brand"], cat_id,
                        price_cents, price_cents, cost_cents,
                        p["inner_mm"], p["outer_mm"], p["width_mm"], p["dimensions"],
                        sup_name, sup_code, p["last_purchase_at"], p["last_sale_at"],
                        pid,
                    ),
                )
                updated_products += 1
            else:
                cur.execute(
                    """INSERT INTO products (
                         sku, name, description, brand, category_id, unit,
                         price_cents, cost_cents, stock, min_stock, target_stock, active,
                         last_movement_at, inner_diameter_mm, outer_diameter_mm, width_mm, dimensions,
                         supplier_name, supplier_code, freight_pct, last_purchase_at, last_sale_at,
                         created_at, updated_at
                       ) VALUES (?, ?, ?, ?, ?, 'unidad', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        sku, name, desc_text, p["brand"], cat_id,
                        price_cents, cost_cents, stock_val, min_stock, target_stock,
                        p["updated_at"] if stock_val > 0 else None,
                        p["inner_mm"], p["outer_mm"], p["width_mm"], p["dimensions"],
                        sup_name, sup_code, freight_pct, p["last_purchase_at"], p["last_sale_at"],
                        p["updated_at"], p["updated_at"],
                    ),
                )
                pid = cur.lastrowid
                existing_skus[sku.lower()] = (pid, stock_val)
                inserted_products += 1

                # Si stock_val > 0, registrar movimiento inicial en stock_movements (invariante Kardex)
                if stock_val > 0:
                    cur.execute(
                        """INSERT INTO stock_movements (
                             product_id, type, quantity, stock_before, stock_after,
                             user_id, reason, ref_type, op_key, created_at
                           ) VALUES (?, 'initial', ?, 0, ?, 1, 'Stock inicial migrado desde Gestión FE10 (retenes.xlsx)', 'import', ?, ?)""",
                        (pid, stock_val, stock_val, f"mig-fe10-init-{pid}", p["updated_at"]),
                    )
                    initial_movements += 1

            # Código de barras real si venía en retenes.xlsx
            if p["barcode"] and p["barcode"] not in used_barcodes:
                cur.execute("SELECT 1 FROM product_barcodes WHERE product_id = ? AND is_primary = 1 AND active = 1", (pid,))
                has_prim = cur.fetchone() is not None
                cur.execute(
                    "INSERT OR IGNORE INTO product_barcodes (product_id, code, is_primary, active) VALUES (?, ?, ?, 1)",
                    (pid, p["barcode"][:64], 0 if has_prim else 1),
                )
                used_barcodes.add(p["barcode"])

            # Opciones reales de proveedor por producto (incluyendo múltiples proveedores históricos!)
            for idx_s, s_nm in enumerate(p["all_suppliers"]):
                db_sid = sup_name_to_id.get(s_nm.lower())
                if db_sid:
                    ucost = cost_cents if cost_cents and cost_cents > 0 else max(0, int(round(price_cents * 0.58)))
                    cur.execute(
                        """INSERT OR IGNORE INTO product_supplier_options (
                             product_id, supplier_id, supplier_name, supplier_code,
                             brand_offered, unit_cost_cents, freight_pct, lead_time_days, is_preferred
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, 3, ?)""",
                        (
                            pid, db_sid, s_nm, sup_code or sku,
                            p["brand"], ucost, 6.0, 1 if idx_s == 0 else 0,
                        ),
                    )
                    supplier_opts_added += 1

        print(f"Productos nuevos insertados: {inserted_products}, actualizados: {updated_products}")
        print(f"Movimientos iniciales de stock creados: {initial_movements}")
        print(f"Vínculos producto-proveedor reales creados: {supplier_opts_added}")

        # 5.6 Insertar Clientes reales y Saldos de Cuenta Corriente
        existing_custs = {}
        cur.execute("SELECT lower(trim(name)), id FROM customers")
        for nm_low, cid_val in cur.fetchall():
            existing_custs[nm_low] = cid_val

        cur.execute("SELECT MAX(id) FROM customer_account_movements")
        next_mov_seq = (cur.fetchone()[0] or 0) + 1

        existing_mov_customers = set()
        cur.execute("SELECT lower(trim(customer_name)) FROM customer_account_movements WHERE notes LIKE '%Gestión FE10%'")
        for (cnm,) in cur.fetchall():
            existing_mov_customers.add(cnm)

        inserted_customers = 0
        inserted_commitments = 0
        inserted_receipts = 0

        for c in customers_map.values():
            key_low = c["name"].strip().lower()
            if key_low in existing_custs:
                db_cid = existing_custs[key_low]
            else:
                cur.execute(
                    """INSERT INTO customers (
                         name, customer_type, phone, cuit, email, address, city, notes
                       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        c["name"][:150], c["customer_type"], c["phone"], c["cuit"],
                        c["email"], c["address"][:250] if c["address"] else None,
                        c["city"], c["notes"][:1000],
                    ),
                )
                db_cid = cur.lastrowid
                existing_custs[key_low] = db_cid
                inserted_customers += 1

            saldo_cents = int(round(abs(c["saldo"]) * 100))
            if saldo_cents >= 100 and key_low not in existing_mov_customers:
                if c["saldo"] > 0:
                    mov_num = f"CMP-{next_mov_seq:05d}"
                    next_mov_seq += 1
                    imp_txt = f"{c['cant_impagas']} factura(s) impaga(s)" if c["cant_impagas"] > 0 else "Saldo acumulado"
                    atr_txt = f" · Atraso prom.: {c['atraso_dias']} días" if c["atraso_dias"] > 0 else ""
                    cur.execute(
                        """INSERT INTO customer_account_movements (
                             movement_number, customer_id, customer_name, customer_phone, customer_cuit,
                             movement_type, items_summary, amount_cents, notes, user_id
                           ) VALUES (?, ?, ?, ?, ?, 'commitment', ?, ?, ?, 1)""",
                        (
                            mov_num, db_cid, c["name"][:150], c["phone"], c["cuit"],
                            f"Saldo de cuenta corriente migrado ({imp_txt})",
                            saldo_cents,
                            f"Migrado desde Gestión FE10 (Listado Cuentas Corrientes){atr_txt}",
                        ),
                    )
                    inserted_commitments += 1
                elif c["saldo"] < 0:
                    mov_num = f"REC-{next_mov_seq:05d}"
                    next_mov_seq += 1
                    cur.execute(
                        """INSERT INTO customer_account_movements (
                             movement_number, customer_id, customer_name, customer_phone, customer_cuit,
                             movement_type, payment_format, amount_cents, notes, user_id
                           ) VALUES (?, ?, ?, ?, ?, 'receipt', 'transferencia', ?, ?, 1)""",
                        (
                            mov_num, db_cid, c["name"][:150], c["phone"], c["cuit"],
                            saldo_cents,
                            "Saldo a favor / anticipo en cuenta corriente migrado desde Gestión FE10",
                        ),
                    )
                    inserted_receipts += 1
                existing_mov_customers.add(key_low)

        print(f"Clientes insertados: {inserted_customers}")
        print(f"Saldos Cta. Cte. cargados -> Deudas (CMP): {inserted_commitments}, Saldos a favor (REC): {inserted_receipts}")

        # 5.7 Insertar Facturas de Compra de Proveedores reales (supplier_invoices)
        existing_sup_invs = set()
        cur.execute("SELECT invoice_number FROM supplier_invoices")
        for (inum,) in cur.fetchall():
            existing_sup_invs.add(inum.strip().upper())

        inserted_sup_invs = 0
        for sinv in supplier_invoices_to_load:
            inum_key = sinv["invoice_number"].strip().upper()
            if inum_key in existing_sup_invs:
                continue
            icount = inv_item_counts.get(sinv["raw_inv_num"], 1)
            cur.execute(
                """INSERT INTO supplier_invoices (
                     supplier_name, supplier_cuit, invoice_number, invoice_date,
                     subtotal_cents, tax_cents, total_cents, items_count, user_id, notes
                   ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1, ?)""",
                (
                    sinv["supplier_name"][:120],
                    sinv["invoice_number"][:50],
                    sinv["invoice_date"],
                    sinv["subtotal_cents"],
                    sinv["tax_cents"],
                    sinv["total_cents"],
                    icount,
                    sinv["notes"][:500],
                ),
            )
            existing_sup_invs.add(inum_key)
            inserted_sup_invs += 1

        print(f"Facturas históricas de compra de proveedores insertadas: {inserted_sup_invs}")

        # 5.8 Registrar auditoría oficial de la migración
        cur.execute(
            """INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip)
               VALUES (1, 'system.legacy_migration_fe10', 'database', 'gestionfe10', ?, '127.0.0.1')""",
            (
                json.dumps({
                    "productsInserted": inserted_products,
                    "productsUpdated": updated_products,
                    "suppliersActive": len(sup_name_to_id),
                    "customersInserted": inserted_customers,
                    "accountCommitments": inserted_commitments,
                    "accountReceipts": inserted_receipts,
                    "supplierInvoices": inserted_sup_invs,
                }),
            ),
        )

        # 5.8b Regularizar movimientos iniciales faltantes en productos preexistentes de migraciones previas
        cur.execute("""
            SELECT p.id, p.stock, COALESCE(SUM(sm.quantity), 0) AS sm_sum
            FROM products p
            LEFT JOIN stock_movements sm ON sm.product_id = p.id
            GROUP BY p.id
            HAVING p.stock > sm_sum
        """)
        for pid_fix, st_fix, sm_fix in cur.fetchall():
            diff_fix = st_fix - sm_fix
            cur.execute(
                """INSERT INTO stock_movements (
                     product_id, type, quantity, stock_before, stock_after,
                     user_id, reason, ref_type, op_key
                   ) VALUES (?, 'initial', ?, ?, ?, 1, 'Regularización de stock inicial preexistente', 'import', ?)""",
                (pid_fix, diff_fix, sm_fix, st_fix, f"mig-preexist-init-{pid_fix}"),
            )

        # 5.9 Verificar consistencia matemática de Kardex antes de hacer COMMIT!
        cur.execute("""
            SELECT COUNT(*) FROM (
              SELECT p.id, (p.stock - COALESCE(SUM(sm.quantity), 0)) AS dif
              FROM products p
              LEFT JOIN stock_movements sm ON sm.product_id = p.id
              GROUP BY p.id
              HAVING dif <> 0
            )
        """)
        inconsistent_count = cur.fetchone()[0]
        if inconsistent_count != 0:
            raise RuntimeError(f"ALERTA: {inconsistent_count} productos con inconsistencia de Kardex. Abortando.")

        con.commit()
        print("COMMIT EXITOSO. Verificación de consistencia Kardex: 0 diferencias (100% consistente).")

    except Exception as exc:
        con.rollback()
        raise exc
    finally:
        con.close()

    # -------------------------------------------------------------------------
    # 6. ACTUALIZAR TAMBIÉN articulos_migrados_gestionfe.xlsx CON PRECIOS FINALES C/IVA
    # -------------------------------------------------------------------------
    wb_out = Workbook()
    ws_out = wb_out.active
    ws_out.title = "Catalogo_HugoRepuestos"
    headers = [
        "sku", "codigo_barras", "nombre", "descripcion", "marca",
        "categoria", "unidad", "precio_venta", "costo",
        "stock_inicial", "stock_minimo", "stock_objetivo",
        "proveedor", "medidas",
    ]
    ws_out.append(headers)
    for p in valid_products:
        ws_out.append([
            p["sku"],
            p["barcode"] or "",
            p["name"],
            p["name"] + (f" · Medidas: {p['dimensions']}" if p["dimensions"] else ""),
            p["brand"] or "",
            p["category_name"],
            "unidad",
            round(p["price_ars"], 2),
            round(p["cost_ars"], 2),
            p["stock"],
            1 if p["stock"] > 0 else "",
            max(3, p["stock"] + 2) if p["stock"] > 0 else "",
            p["supplier_name"] or "",
            p["dimensions"] or "",
        ])
    wb_out.save(OUT_XLSX)
    print(f"Excel actualizado con precios finales IVA incluido: {OUT_XLSX}")


if __name__ == "__main__":
    main()
