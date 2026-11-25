"""
Sincroniza el catálogo completo de Alfa Rodamientos (incluyendo Bombas Chivilcoy, Dolz, VMG, SKF, retenes y rodamientos)
y enriquece masivamente las descripciones técnicas, aplicaciones vehiculares y códigos equivalentes cruzados
en `products`, `product_supplier_options` y `supplier_catalog_items`.
"""
import os
import re
import glob
import json
import sqlite3
import openpyxl

DOWNLOADS_DIR = r"C:\Users\lucas\Downloads"
ALFA_XLSX = os.path.join(DOWNLOADS_DIR, "Lista de Precios_11-11-2026 06-14-14.xlsx")
PROJECT_DIR = r"c:\Users\lucas\OneDrive\Escritorio\CHANGAS\HugoRodamientosAPP"
MANIFEST_PATH = os.path.join(PROJECT_DIR, "public", "catalogs", "catalogs-manifest.json")
DB_GLOB = os.path.join(PROJECT_DIR, r".wrangler\state\v3\d1\miniflare-D1DatabaseObject\*.sqlite")
NOW_ISO = "2026-11-25T13:35:00.000Z"


def norm_code(raw) -> str:
    if raw is None:
        return ""
    s = re.sub(r"[^A-Z0-9]", "", str(raw).upper())
    return s


def round_retail_cents(ars_val: float) -> int:
    if ars_val <= 0:
        return 0
    rounded = round(ars_val / 100.0) * 100.0
    if rounded < 100:
        rounded = round(ars_val, 2)
    return int(round(rounded * 100))


BRAND_FIX = {
    "CHIVILCOI": "CHIVILCOY",
    "CHIVILCOY": "CHIVILCOY",
    "CONTITECH": "CONTINENTAL",
    "BOCSH": "BOSCH",
    "LUCA": "LUCAS",
    "NAC - VEN": "NACIONAL",
}


def clean_brand(b) -> str | None:
    if not b:
        return None
    s = str(b).strip().upper()
    if not s or s in ("VARIOS", "S/M", "SIN MARCA", "NONE", "NULL"):
        return None
    return BRAND_FIX.get(s, s)


def map_alfa_category(rubro: str, desc: str) -> str:
    txt = f"{rubro} {desc}".upper()
    if "BOMBA" in txt and ("AGUA" in txt or "ANTECUERPO" in txt):
        return "Distribución y Bombas de Agua"
    if "DISTRIB" in txt or "TENSOR" in txt or "VKMA" in txt or "VKMC" in txt:
        return "Distribución y Bombas de Agua"
    if "RETEN" in txt:
        return "Retenes"
    if "RODAM" in txt or "RULEM" in txt or "TORRINGTON" in txt or "CRAPODINA" in txt or "MAZA" in txt:
        return "Rodamientos y Accesorios"
    if "CRUCETA" in txt or "TRICETA" in txt or "HOMOCINET" in txt:
        return "Crucetas y Transmisión"
    if "CORREA" in txt or "PK" in txt:
        return "Correas"
    if "FRENO" in txt or "PASTILLA" in txt or "DISCO" in txt:
        return "Frenos y Suspensión"
    if "AMORTIG" in txt or "ROTULA" in txt or "EXTREMO" in txt or "PARRILLA" in txt or "BUJE" in txt:
        return "Frenos y Suspensión"
    if "JUNTA" in txt or "TORNILLO" in txt or "BULON" in txt:
        return "Motor y Juntas"
    return rubro.title() if rubro else "Autopartes General"


def infer_technical_prefix_label(code_and_name: str, brand: str | None, dimensions: str | None) -> str:
    u = code_and_name.upper()
    b = (brand or "").upper()

    if re.search(r"\bVKMC\s*\d", u) or re.search(r"\b(KD|GV|IV)\s*\d{3}\b", u):
        return "Kit de Distribución con Bomba de Agua"
    if re.search(r"\bVKMA\s*\d", u) or re.search(r"\bCT\s*\d{3,4}\s*K", u) or re.search(r"\b530\s*0\d{5}\b", u):
        return "Kit de Distribución Automotor (Correa y Tensor)"
    if (
        re.search(r"\bVKPC\s*\d", u)
        or re.search(r"\bBA[-\s]?\d{2,4}\b", u)
        or re.search(r"\bLWPN\s*\d{2,4}\b", u)
        or (b == "CHIVILCOY" and re.search(r"\bCH\s*\d", u))
        or (b == "DOLZ" and re.search(r"\b[ACDFMNOPRSTV]\s*\d{3}\b", u))
        or (b == "VMG" and "BA" in u)
    ):
        return "Bomba de Agua Automotor"
    if re.search(r"\bVKBA\s*\d", u):
        return "Kit de Rodamiento de Rueda / Maza"
    if re.search(r"\bVKM\s*\d", u) or re.search(r"\b53[12]\s*0\d{5}\b", u):
        return "Tensor / Polea de Correa"

    m_pk = re.search(r"\b(\d{1,2})PK(\d{3,4})\b", u)
    if m_pk:
        return f"Correa Poly-V / Multicanal ({m_pk.group(1)} canales, largo {m_pk.group(2)} mm)"

    if re.search(r"\b(AVX|10A|13A|17A)\s*\d{3,4}\b", u):
        return "Correa Trapezoidal en V"

    if re.search(r"\b(60|62|63|64)\d{2}\b", u):
        seal = ""
        if "2RS" in u or "DDU" in u or "LLU" in u:
            seal = " blindado en goma (2RS)"
        elif "ZZ" in u or "2Z" in u:
            seal = " blindado metálico (ZZ)"
        dim_txt = f" · Medida {dimensions} mm" if dimensions else ""
        return f"Rulemán / Rodamiento rígido de bolas{seal}{dim_txt}"

    if re.search(r"\b(302|303|320|322|323|330|331|332)\d{2}\b", u) or re.search(r"\bL?M\d{5,6}\b", u):
        dim_txt = f" · Medida {dimensions} mm" if dimensions else ""
        return f"Rulemán / Rodamiento de rodillos cónicos{dim_txt}"

    if b in ("SAV", "DBH", "CORTECO", "TENUP", "SABO") and (dimensions or re.search(r"\d+X\d+X\d+", u)):
        dim_txt = f" ({dimensions} mm)" if dimensions else ""
        return f"Retén / Sello Mecánico{dim_txt}"

    return ""


def extract_all_codes_from_row(sku: str, name: str, sup_code: str | None, brand: str | None) -> list[str]:
    codes: list[str] = []

    def add_c(val: str):
        nc = norm_code(val)
        if 4 <= len(nc) <= 18 and any(ch.isdigit() for ch in nc):
            # Evitar códigos internos puramente numéricos cortos (ej. SKU "434" o "3000" de GestionFE)
            if nc.isdigit() and len(nc) <= 5 and not nc.startswith("05"):
                return
            if nc not in codes:
                codes.append(nc)
            # Si es VKMA05012A -> también agregar base VKMA05012 y 05012 si empieza con VKMA/VKMC/VKPC/VKBA
            m_vk = re.match(r"^(VKMA|VKMC|VKPC|VKBA)(\d{5})[A-Z0-9]*$", nc)
            if m_vk:
                base_vk = m_vk.group(1) + m_vk.group(2)
                if base_vk not in codes:
                    codes.append(base_vk)
                if m_vk.group(1) in ("VKMA", "VKMC") and m_vk.group(2) not in codes:
                    codes.append(m_vk.group(2))

    if sup_code:
        # Quitar sufijo "-MARCA" en códigos Alfa tipo "CH0119-CHIVILCOY" o "O106-DOLZ"
        sc_clean = str(sup_code).strip()
        if "-" in sc_clean:
            parts = sc_clean.rsplit("-", 1)
            if parts[1].isalpha() and len(parts[1]) >= 3:
                add_c(parts[0])
        add_c(sc_clean)

    if sku and not sku.isdigit():
        sc_sku = sku
        if "-" in sc_sku:
            p0, p1 = sc_sku.split("-", 1)
            if p0.isalpha() and any(ch.isdigit() for ch in p1):
                add_c(p1)
            elif p1.isalpha() and any(ch.isdigit() for ch in p0):
                add_c(p0)
        add_c(sc_sku)

    # Extraer primer código antes de " - " o "("
    head = re.split(r"\s+-\s+|\(", name or "")[0].strip()
    if head and len(head) <= 22:
        add_c(head)

    # Extraer códigos entre paréntesis ej: "(O106 / BA-193)" o "(VKMA05012)"
    for grp in re.findall(r"\(([^)]{3,40})\)", name or ""):
        for sub in re.split(r"[/,\s-]+", grp):
            if len(sub) >= 3 and any(ch.isdigit() for ch in sub) and "MM" not in sub.upper() and "X" not in sub.upper():
                # Si venía "BA-193" partido, recomponer antes
                pass
        for token in re.split(r"[/,]+|\s+-\s+|\s+", grp):
            t_clean = token.strip()
            if len(t_clean) >= 3 and any(ch.isdigit() for ch in t_clean) and not re.match(r"^\d+[.,]?\d*x\d+", t_clean, re.I):
                add_c(t_clean)

    return codes


def main():
    db_files = glob.glob(DB_GLOB)
    if not db_files:
        raise RuntimeError("No se encontró base D1 local.")
    db_path = db_files[0]
    print(f"Conectando a D1: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    c = conn.cursor()

    # 1. Obtener ID de proveedor "Alfa Rodamientos"
    sup_row = c.execute("SELECT id, freight_pct, lead_time_days FROM suppliers WHERE upper(name) = 'ALFA RODAMIENTOS'").fetchone()
    if not sup_row:
        c.execute(
            """INSERT INTO suppliers (name, city, lead_time_days, lead_time_alert_days, freight_pct, payment_terms, brands_supplied, notes, active, created_at, updated_at)
               VALUES ('Alfa Rodamientos', 'Buenos Aires', 3, 5, 5.5, 'Cuenta corriente (-25% -20%)', 'CHIVILCOY, PESARO, SAV, TARANTO, TENUP, TOLEDO, TORRINGTON, VMG, DOLZ, SKF', 'Lista oficial sincronizada', 1, ?, ?)""",
            (NOW_ISO, NOW_ISO),
        )
        alfa_sup_id, alfa_freight, alfa_lead = c.lastrowid, 5.5, 3
    else:
        alfa_sup_id, alfa_freight, alfa_lead = sup_row[0], sup_row[1] or 5.5, sup_row[2] or 3
        c.execute(
            "UPDATE suppliers SET brands_supplied = 'CHIVILCOY, PESARO, SAV, TARANTO, TENUP, TOLEDO, TORRINGTON, VMG, DOLZ, SKF, CORTECO, ILLINOIS' WHERE id = ?",
            (alfa_sup_id,),
        )

    # Asegurar categorías en `categories`
    cat_map: dict[str, int] = {}
    for cid, cname in c.execute("SELECT id, name FROM categories"):
        cat_map[cname.upper()] = cid

    def get_cat_id(cname: str) -> int:
        k = cname.upper()
        if k in cat_map:
            return cat_map[k]
        c.execute("INSERT INTO categories (name, active) VALUES (?, 1)", (cname,))
        cat_map[k] = c.lastrowid
        return cat_map[k]

    # 2. Indexar productos actuales en D1
    print("Indexando productos actuales en D1...")
    existing_products = c.execute(
        "SELECT id, sku, name, description, brand, category_id, price_cents, cost_cents, dimensions, supplier_name, supplier_code FROM products WHERE active = 1"
    ).fetchall()

    sku_set = {str(r[1]).upper() for r in existing_products}
    code_to_prod_ids: dict[str, list[int]] = {}
    prod_by_id: dict[int, list] = {}

    for r in existing_products:
        pid, sku, name, desc, brand, cat_id, price_c, cost_c, dims, sname, scode = r
        prod_by_id[pid] = [pid, sku, name, desc, brand, cat_id, price_c, cost_c, dims, sname, scode]
        for cd in extract_all_codes_from_row(sku, name, scode, brand):
            code_to_prod_ids.setdefault(cd, []).append(pid)

    # 3. Leer manifiesto PDF para extraer aplicaciones vehiculares por código (ej. 05012 -> Chevrolet Corsa...)
    pdf_code_apps: dict[str, str] = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        for cat in manifest:
            if cat.get("id") == "kits":
                for p in cat.get("pages", []):
                    txt = p.get("text", "")
                    for m in re.finditer(r"\b(0\d{4})\s+((?:CHEVROLET|FIAT|FORD|RENAULT|PEUGEOT|CITROEN|VW|VOLKSWAGEN|TOYOTA|HONDA|SUZUKI)[A-Z0-9\s/.-]{8,65})", txt):
                        kcode = m.group(1)
                        veh = re.sub(r"\s+", " ", m.group(2)).strip()
                        prev = pdf_code_apps.get(kcode, "")
                        if veh not in prev and len(prev) < 180:
                            pdf_code_apps[kcode] = f"{prev} / {veh}".strip(" /") if prev else veh

    # 4. Procesar Lista Oficial de Alfa Rodamientos (55.641 filas)
    alfa_updated = 0
    alfa_options_upserted = 0
    alfa_inserted_products = 0
    alfa_catalog_inserted = 0

    # Mapa de equivalencias cruzadas detectadas en Alfa (ej: CH0119 <-> O106 <-> BA193)
    cross_equiv_groups: dict[str, set[str]] = {}
    code_rich_app: dict[str, str] = {}

    def register_app(cd: str, app_text: str):
        if not cd or not app_text:
            return
        cur = code_rich_app.get(cd, "")
        if len(app_text) > len(cur):
            code_rich_app[cd] = app_text

    # Pre-cargar aplicaciones ricas desde productos existentes (Iturria, Arcore, Icepar, Magnum)
    for pid, pdata in prod_by_id.items():
        _, sku, name, desc, brand, _, _, _, dims, sname, scode = pdata
        codes = extract_all_codes_from_row(sku, name, scode, brand)
        if len(codes) >= 2:
            for c1 in codes:
                s = cross_equiv_groups.setdefault(c1, set())
                for c2 in codes:
                    if c2 != c1:
                        s.add(c2)
        # Si tiene descripción con texto vehicular real
        candidate_txt = desc or name or ""
        if len(candidate_txt) > 22 and any(w in candidate_txt.upper() for w in ("CHEVROLET", "CORSA", "FORD", "FIAT", "VW", "VOLKSWAGEN", "RENAULT", "PEUGEOT", "TOYOTA", "HILUX", "PALIO", "GOL", "BOMBA", "KIT", "CORREA", "TENSOR", "EMBRAGUE", "FRENO", "AMORTIGUADOR")):
            for cd in codes[:2]:
                register_app(cd, candidate_txt)

    for kcode, veh in pdf_code_apps.items():
        register_app(kcode, f"Kit de Distribución · Aplicaciones: {veh}")
        register_app("VKMA" + kcode, f"Kit de Distribución · Aplicaciones: {veh}")

    if os.path.exists(ALFA_XLSX):
        print("Sincronizando Lista Oficial de Alfa Rodamientos (55.641 ítems)...")
        wb = openpyxl.load_workbook(ALFA_XLSX, read_only=True, data_only=True)
        ws = wb[wb.sheetnames[0]]

        # Evitar duplicar supplier_catalog_items de Alfa Excel en re-ejecuciones
        c.execute("DELETE FROM supplier_catalog_items WHERE supplier_name = 'Alfa Rodamientos' AND category NOT IN ('Rodamientos', 'Crucetas y Transmisión', 'Retenes', 'Rodamientos Especiales')")

        new_prod_rows = []
        new_opt_rows = []
        new_cat_rows = []

        for idx, r in enumerate(ws.iter_rows(values_only=True)):
            if idx == 0 or not r or not r[0]:
                continue
            code_raw = str(r[0]).strip()
            desc_raw = re.sub(r"\s+", " ", str(r[1] or "").strip())
            rubro_raw = re.sub(r"\s+", " ", str(r[2] or "").strip())
            brand = clean_brand(r[3])
            try:
                lista_ars = float(r[4] or 0)
            except (TypeError, ValueError):
                lista_ars = 0.0

            cost_cents = int(round(lista_ars * 0.65 * 100)) if lista_ars > 0 else 0
            price_cents = round_retail_cents(lista_ars * 0.65 * 1.50 * 1.21) if lista_ars > 0 else 0
            cat_name = map_alfa_category(rubro_raw, desc_raw)

            # Extraer código limpio sin "-MARCA" final (ej: "CH0119-CHIVILCOY" -> "CH0119", "O106-DOLZ" -> "O106")
            base_code_str = code_raw
            if "-" in code_raw:
                p_left, p_right = code_raw.rsplit("-", 1)
                if p_right.replace(" ", "").isalpha() and len(p_right) >= 3:
                    base_code_str = p_left.strip()

            nc_full = norm_code(code_raw)
            nc_base = norm_code(base_code_str)

            # Detectar equivalencia cruzada en descripción de Alfa (ej: "CH0119 DOLZ O106 CORSA..." o "CH0119 VMG BA193...")
            m_ch_equiv = re.match(r"^(CH\d{3,6}(?:/\d)?)\s+(?:DOLZ|VMG|SKF)\s+([A-Z]{1,4}\s*\d{2,5})\b", desc_raw.upper())
            if m_ch_equiv:
                c_ch = norm_code(m_ch_equiv.group(1))
                c_eq = norm_code(m_ch_equiv.group(2))
                if c_ch and c_eq:
                    cross_equiv_groups.setdefault(c_ch, set()).add(c_eq)
                    cross_equiv_groups.setdefault(c_eq, set()).add(c_ch)

            rich_alfa_desc = f"{rubro_raw} · {desc_raw}" if rubro_raw and rubro_raw.upper() not in desc_raw.upper() else desc_raw
            if nc_base and len(nc_base) >= 4:
                register_app(nc_base, rich_alfa_desc)
            if nc_full and len(nc_full) >= 4:
                register_app(nc_full, rich_alfa_desc)

            # Buscar si ya existe el producto en D1
            matched_pids = []
            for cand_c in (nc_full, nc_base):
                if cand_c and cand_c in code_to_prod_ids:
                    for pid in code_to_prod_ids[cand_c]:
                        if pid not in matched_pids:
                            matched_pids.append(pid)

            if matched_pids:
                for pid in matched_pids[:2]:
                    pdata = prod_by_id[pid]
                    cur_desc = pdata[3] or ""
                    cur_brand = pdata[4]
                    cur_price = pdata[6] or 0
                    cur_cost = pdata[7] or 0
                    cur_sname = pdata[9]
                    cur_scode = pdata[10]

                    need_desc = (not cur_desc) or (cur_desc.strip() == pdata[2].strip()) or (len(cur_desc) < len(rich_alfa_desc))
                    next_desc = rich_alfa_desc if need_desc else cur_desc
                    next_brand = cur_brand or brand
                    next_sname = cur_sname or "Alfa Rodamientos"
                    next_scode = cur_scode or code_raw
                    next_price = cur_price if cur_price > 0 else price_cents
                    next_cost = cur_cost if cur_cost > 0 else cost_cents

                    if (next_desc != cur_desc) or (next_brand != cur_brand) or (next_sname != cur_sname) or (next_price != cur_price):
                        c.execute(
                            """UPDATE products
                               SET description = ?, brand = ?, supplier_name = ?, supplier_code = ?, price_cents = ?, cost_cents = ?, updated_at = ?
                               WHERE id = ?""",
                            (next_desc[:1900], next_brand, next_sname, next_scode, next_price, next_cost, NOW_ISO, pid),
                        )
                        pdata[3] = next_desc[:1900]
                        pdata[4] = next_brand
                        pdata[6] = next_price
                        pdata[7] = next_cost
                        pdata[9] = next_sname
                        pdata[10] = next_scode
                        alfa_updated += 1

                    if cost_cents > 0:
                        new_opt_rows.append((
                            pid,
                            alfa_sup_id,
                            "Alfa Rodamientos",
                            code_raw[:80],
                            brand,
                            cost_cents,
                            alfa_freight,
                            alfa_lead,
                            1 if (pdata[9] or "").upper() == "ALFA RODAMIENTOS" else 0,
                            NOW_ISO,
                        ))
            else:
                # Insertar en products los artículos nuevos relevantes de Alfa (especialmente CHIVILCOY, Bombas, Kits, Rodamientos, Retenes, Crucetas, Mazas, Correas con precio)
                is_priority_line = (
                    brand == "CHIVILCOY"
                    or "BOMBA" in rubro_raw.upper()
                    or "DISTRIB" in rubro_raw.upper()
                    or "RODAM" in rubro_raw.upper()
                    or "RETEN" in rubro_raw.upper()
                    or "CRUCETA" in rubro_raw.upper()
                    or "MAZA" in rubro_raw.upper()
                    or "CORREA" in rubro_raw.upper()
                )
                if is_priority_line and (price_cents > 0 or brand in ("CHIVILCOY", "VMG", "DOLZ", "SKF")):
                    cand_sku = re.sub(r"[^A-Z0-9._/-]", "", base_code_str.upper())[:60] or f"ALFA-{idx}"
                    if cand_sku in sku_set:
                        cand_sku = re.sub(r"[^A-Z0-9._/-]", "", code_raw.upper())[:60]
                    if cand_sku in sku_set:
                        cand_sku = f"ALF-{cand_sku}"[:60]
                    if cand_sku not in sku_set:
                        sku_set.add(cand_sku)
                        display_name = f"{base_code_str} - {desc_raw}"[:195] if base_code_str.upper() not in desc_raw.upper()[:20] else desc_raw[:195]
                        if rubro_raw and "BOMBA" in rubro_raw.upper() and "BOMBA" not in display_name.upper():
                            display_name = f"{base_code_str} - Bomba de Agua {desc_raw}"[:195]
                        cat_id = get_cat_id(cat_name)
                        new_prod_rows.append((
                            cand_sku,
                            display_name,
                            rich_alfa_desc[:1900],
                            brand,
                            cat_id,
                            price_cents,
                            cost_cents,
                            "Alfa Rodamientos",
                            code_raw[:80],
                            alfa_freight,
                            NOW_ISO,
                            NOW_ISO,
                            nc_base,
                        ))

            # Agregar también al buscador de Catálogos Técnicos (supplier_catalog_items) las líneas técnicas de Alfa
            if brand in ("CHIVILCOY", "DOLZ", "VMG", "SKF", "TARANTO", "SAV", "TENUP", "TOLEDO", "CORTECO", "PESARO", "TORRINGTON") or "BOMBA" in rubro_raw.upper() or "DISTRIB" in rubro_raw.upper():
                new_cat_rows.append((
                    "Alfa Rodamientos",
                    brand or "ESTÁNDAR",
                    cat_name[:80],
                    code_raw[:80],
                    (f"{rubro_raw} · {desc_raw}" if rubro_raw and rubro_raw.upper() not in desc_raw.upper() else desc_raw)[:220],
                    rich_alfa_desc[:450],
                    base_code_str[:80],
                    price_cents,
                    NOW_ISO,
                ))

        wb.close()

        # Ejecutar inserts de nuevos productos de Alfa
        for row_p in new_prod_rows:
            cand_sku, display_name, rdesc, brand, cat_id, price_c, cost_c, sname, scode, fpct, c_at, u_at, nc_b = row_p
            c.execute(
                """INSERT INTO products (
                     sku, name, description, brand, category_id, unit,
                     price_cents, cost_cents, stock, active,
                     supplier_name, supplier_code, freight_pct, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, 'unidad', ?, ?, 0, 1, ?, ?, ?, ?, ?)""",
                (cand_sku, display_name, rdesc, brand, cat_id, price_c, cost_c, sname, scode, fpct, c_at, u_at),
            )
            new_pid = c.lastrowid
            prod_by_id[new_pid] = [new_pid, cand_sku, display_name, rdesc, brand, cat_id, price_c, cost_c, None, sname, scode]
            if nc_b:
                code_to_prod_ids.setdefault(nc_b, []).append(new_pid)
            alfa_inserted_products += 1
            if cost_c > 0:
                new_opt_rows.append((
                    new_pid,
                    alfa_sup_id,
                    "Alfa Rodamientos",
                    scode,
                    brand,
                    cost_c,
                    fpct,
                    alfa_lead,
                    1,
                    NOW_ISO,
                ))

        # Upsert de opciones Alfa en product_supplier_options
        c.executemany(
            """INSERT INTO product_supplier_options (
                 product_id, supplier_id, supplier_name, supplier_code, brand_offered,
                 unit_cost_cents, freight_pct, lead_time_days, is_preferred, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(product_id, supplier_id) DO UPDATE SET
                 supplier_code = excluded.supplier_code,
                 brand_offered = COALESCE(excluded.brand_offered, product_supplier_options.brand_offered),
                 unit_cost_cents = excluded.unit_cost_cents,
                 updated_at = excluded.updated_at""",
            new_opt_rows,
        )
        alfa_options_upserted = len(new_opt_rows)

        c.executemany(
            """INSERT INTO supplier_catalog_items (
                 supplier_name, brand, category, code, name, application, original_code, price_cents, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            new_cat_rows,
        )
        alfa_catalog_inserted = len(new_cat_rows)

    print(f"Alfa Rodamientos -> actualizados: {alfa_updated} | nuevos productos: {alfa_inserted_products} | opciones comparador: {alfa_options_upserted} | catálogo técnico: {alfa_catalog_inserted}")

    # 5. Clausura transitiva de códigos equivalentes (ej: CH0119 <-> O106 <-> BA193 <-> VKPC85206A)
    print("Propagando equivalencias cruzadas y enriqueciendo descripciones de productos...")
    for cd, neighbors in list(cross_equiv_groups.items()):
        expanded = set(neighbors)
        for nb in list(neighbors):
            for nb2 in cross_equiv_groups.get(nb, ()):
                if nb2 != cd:
                    expanded.add(nb2)
        cross_equiv_groups[cd] = expanded

    enriched_count = 0
    batch_desc_updates = []

    for pid, pdata in prod_by_id.items():
        _, sku, name, cur_desc, brand, _, _, _, dims, sname, scode = pdata
        cur_desc_str = (cur_desc or "").strip()

        codes = extract_all_codes_from_row(sku, name, scode, brand)
        all_equivs: list[str] = []
        for cd in codes:
            if cd not in all_equivs:
                all_equivs.append(cd)
            for eq in sorted(cross_equiv_groups.get(cd, ())):
                if eq not in all_equivs:
                    all_equivs.append(eq)

        # Buscar mejor aplicación vehicular conocida entre el propio código o sus equivalentes
        best_app = ""
        for cd in all_equivs:
            cand_app = code_rich_app.get(cd, "")
            if len(cand_app) > len(best_app):
                best_app = cand_app

        prefix_label = infer_technical_prefix_label(f"{sku} {name} {scode or ''} {' '.join(all_equivs[:4])}", brand, dims)

        parts_out: list[str] = []
        if prefix_label and prefix_label.upper() not in cur_desc_str.upper():
            parts_out.append(prefix_label)

        if cur_desc_str and cur_desc_str != name.strip():
            parts_out.append(cur_desc_str)
        elif best_app and best_app.strip() != name.strip():
            parts_out.append(best_app)
        else:
            parts_out.append(name.strip())

        if best_app and best_app[:30].upper() not in " ".join(parts_out).upper():
            parts_out.append(f"Aplicación: {best_app}")

        equiv_other = [e for e in all_equivs if e.upper() not in name.upper().replace("-", "").replace(" ", "")][:6]
        if equiv_other:
            eq_txt = f"Equivalencias: {', '.join(equiv_other)}"
            if "EQUIVALENCIA" not in " ".join(parts_out).upper():
                parts_out.append(eq_txt)

        if dims and dims not in " ".join(parts_out):
            parts_out.append(f"Medidas: {dims} mm")

        if brand and brand.upper() not in " ".join(parts_out).upper():
            parts_out.append(f"Marca: {brand}")

        if sname and sname.upper() not in " ".join(parts_out).upper():
            parts_out.append(f"Proveedor: {sname}")

        final_desc = " · ".join(dict.fromkeys(p.strip(" ·") for p in parts_out if p.strip()))[:1900]

        if final_desc and final_desc != cur_desc_str:
            batch_desc_updates.append((final_desc, pid))
            enriched_count += 1

    c.executemany("UPDATE products SET description = ? WHERE id = ?", batch_desc_updates)

    # También vincular en `product_supplier_options` opciones equivalentes cuando comparten código cruzado (ej: O106 <-> BA193 <-> VKPC85206 <-> CH0119)
    conn.commit()

    total_prods = c.execute("SELECT COUNT(*) FROM products WHERE active = 1").fetchone()[0]
    same_after = c.execute("SELECT COUNT(*) FROM products WHERE active = 1 AND (description IS NULL OR trim(description) = '' OR trim(description) = trim(name))").fetchone()[0]
    chiv_count = c.execute("SELECT COUNT(*) FROM products WHERE active = 1 AND (brand = 'CHIVILCOY' OR name LIKE '%CHIVILCOY%' OR description LIKE '%CHIVILCOY%')").fetchone()[0]

    print(f"\n=== RESUMEN FINAL ===")
    print(f"Total productos activos en D1: {total_prods}")
    print(f"Descripciones técnicas enriquecidas: {enriched_count}")
    print(f"Productos sin descripción extra (description == name): {same_after}")
    print(f"Productos CHIVILCOY activos en sistema: {chiv_count}")

    print("\n--- Muestra de bombas de agua Corsa (DOLZ / VMG / SKF / CHIVILCOY) ---")
    for r in c.execute(
        """SELECT sku, name, brand, supplier_name, substr(description, 1, 130)
           FROM products
           WHERE active = 1
             AND (description LIKE '%CORSA%' OR name LIKE '%CORSA%')
             AND (description LIKE '%Bomba de Agua%' OR description LIKE '%BOMBAS DE AGUA%')
             AND brand IN ('DOLZ', 'VMG', 'SKF', 'CHIVILCOY')
           ORDER BY brand ASC LIMIT 12"""
    ):
        print(" ", r)

    conn.close()


if __name__ == "__main__":
    main()
