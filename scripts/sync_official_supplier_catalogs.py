"""
Sincronización integral de Catálogos Oficiales de Proveedores (24/11/2026):
- ITURRIA (Precios-20261124.xlsx)
- ARCORE S.A. (listado_completo_20261124154118.csv)
- ICEPAR (articulos_20261124_152415.xls)
- MAGNUM / Papierttei (DKTPRE.ZIP: DKTPRE.TXT + DKTPRE_CON_OF.TXT)
- BRAMCO (19 catálogos técnicos oficiales PDF: INA, LuK, Sachs, Cofap, TRW, Raybestos, FTE, Corteco, ContiTech, Nakata, RM)
- Alfa Rodamientos (Lista de Precios_11-11-2026 para completar faltantes de precio $0)
- Verificación de directorio de proveedores: Cedisa, Icepar, Magnum, Alusa, Arcore, Iturria, Bramco, Top Auto, Altri.
"""
import os
import re
import csv
import glob
import json
import shutil
import zipfile
import sqlite3
import subprocess
import openpyxl
import pymupdf

DOWNLOADS_DIR = r"C:\Users\lucas\Downloads"
PROJECT_DIR = r"c:\Users\lucas\OneDrive\Escritorio\CHANGAS\HugoRodamientosAPP"
PUBLIC_CATALOGS_DIR = os.path.join(PROJECT_DIR, "public", "catalogs")
MANIFEST_PATH = os.path.join(PUBLIC_CATALOGS_DIR, "catalogs-manifest.json")
DB_GLOB = os.path.join(PROJECT_DIR, r".wrangler\state\v3\d1\miniflare-D1DatabaseObject\*.sqlite")
NOW_ISO = "2026-11-24T22:45:00.000Z"

# Mapeo completo de prefijos de línea/marca de ARCORE S.A.
ARCORE_PREFIX_BRAND = {
    "MF": "MAHLE", "MH": "MAHLE", "M0": "MAHLE", "KM": "MAHLE", "CM": "MAHLE",
    "PK": "MAHLE", "E2": "MAHLE", "E3": "MAHLE", "E4": "MAHLE", "E5": "MAHLE",
    "JI": "ILLINOIS", "JB": "ILLINOIS", "MJ": "ILLINOIS", "AI": "ILLINOIS", "EB": "ILLINOIS", "RM": "ILLINOIS",
    "JT": "TARANTO", "T1": "TARANTO", "T2": "TARANTO", "T3": "TARANTO", "T4": "TARANTO",
    "T5": "TARANTO", "T6": "TARANTO", "T7": "TARANTO", "T9": "TARANTO", "TR": "TARANTO",
    "TT": "TARANTO", "CV": "TARANTO",
    "SM": "SINTERMETAL", "SP": "SINTERMETAL", "SK": "SINTERMETAL", "KG": "SINTERMETAL", "SN": "SINTERMETAL",
    "VA": "3B", "3Y": "3B", "4Y": "3B", "EA": "3B", "EG": "3B", "RY": "3B",
    "D1": "DAYCO", "D2": "DAYCO", "D3": "DAYCO", "D4": "DAYCO", "D5": "DAYCO", "D7": "DAYCO", "D8": "DAYCO",
    "FM": "FEDERAL MOGUL", "FD": "FEDERAL MOGUL", "PC": "PERFECT CIRCLE", "1C": "CHAMPION", "3C": "CHAMPION",
    "AS": "SACHS",
    "CO": "COFAP",
    "W1": "TRW", "W2": "TRW", "W3": "TRW", "W5": "TRW", "W8": "TRW", "W9": "TRW",
    "1T": "TEXTAR", "2T": "TEXTAR",
    "LK": "LUK",
    "SR": "SAV",
    "S7": "SABO", "S8": "SABO", "SD": "SABO",
    "PB": "RAYBESTOS",
    "TK": "TIMKEN", "RF": "SKF", "RR": "SKF", "RI": "SKF", "RC": "SKF",
    "FR": "FAG",
    "V2": "VMG",
    "TW": "MASTER POWER",
    "BF": "FALLONE",
    "BS": "SCHADEK", "SA": "SCHADEK",
    "BD": "DUNCAN",
    "JV": "VICTOR REINZ", "V1": "VICTOR REINZ", "VR": "VICTOR REINZ",
    "CE": "CENTRINEL",
    "TS": "RENO", "NF": "RENO",
    "MU": "ETMA", "UM": "ETMA",
    "LX": "LOCX",
    "KV": "INA", "KI": "INA", "I1": "INA", "I2": "INA", "I3": "INA", "I4": "INA", "I5": "INA", "IB": "INA", "TI": "INA",
    "U0": "AKURO", "U1": "AKURO", "U2": "AKURO", "U3": "AKURO", "U4": "AKURO", "U5": "AKURO", "U6": "AKURO", "U7": "AKURO",
    "4E": "MAGNETI MARELLI", "3E": "MAGNETI MARELLI", "5E": "MAGNETI MARELLI",
    "2E": "FERRAZZI",
    "1H": "MLH", "2H": "MLH", "3H": "MLH", "4H": "MLH", "5H": "MLH", "6H": "MLH", "7H": "MLH", "MT": "THOMSON",
    "AA": "BH", "LB": "BH", "AL": "BH", "M8": "BH",
    "CH": "WOBRON",
    "L2": "WABCO", "L3": "WABCO",
    "1R": "WEGA", "FK": "WEGA",
    "3Z": "VTH",
    "FH": "RIOSULENSE", "BV": "RIOSULENSE", "FB": "RIOSULENSE", "FV": "RIOSULENSE", "BM": "RIOSULENSE",
    "PR": "PERSAN", "PP": "PERSAN", "P4": "PERSAN",
    "TH": "THOMPSON RAMCO",
    "E1": "ELCA", "E9": "ELCA", "EL": "ELCA",
}

ARCORE_LOW_DISCOUNT_PREFIXES = {"JV", "T2", "JI", "BF", "L2", "L3", "TW", "U0"}

BRAND_CANON_MAP = {
    "BOCSH": "BOSCH",
    "BOSCH AUTOPARTES": "BOSCH",
    "BOSCH ACCESORIOS": "BOSCH",
    "BOSCH ACCESORIOS LÍNEA EXPERT": "BOSCH",
    "BOSCH EQUIPAMIENTO": "BOSCH",
    "BOSCH HERRAMIENTAS": "BOSCH",
    "BOSCH HERRAMIENTAS MANUALES": "BOSCH",
    "BOSCH LÍQUIDOS REFRIGERANTES Y LAVAPARABRISAS": "BOSCH",
    "BOSCH MEDICIÓN": "BOSCH",
    "LÁMPARAS BOSCH AUTOMOTIVE": "BOSCH",
    "BOSCH ARGENTINA S.A.": "BOSCH",
    "BOSCH DIESEL": "BOSCH",
    "BOSCH PERIFERICOS": "BOSCH",
    "SACHS AMORTIGUADORES": "SACHS",
    "SACHS EMBRAGUES": "SACHS",
    "INA FAG": "INA",
    "INA SCHAEFFLER ARGENTINA": "INA",
    "FAG SCHAEFFLER": "FAG",
    "LUK SCHAEFFLER ARGENTINA": "LUK",
    "MAHLE FILTROS": "MAHLE",
    "MAHLE TURBOS": "MAHLE",
    "MAHLE ARGENTINA S.A": "MAHLE",
    "LUCAS LAMPARAS": "LUCAS",
    "LUCAS AUTOPARTES": "LUCAS",
    "PHC VALEO": "VALEO",
    "VICEM EMBRAGUES": "VICEM",
    "CONTITECH": "CONTINENTAL",
    "VMG + GATES": "VMG",
    "VMG + INA": "VMG",
    "BAHCO ARGENTINA S.A.": "BAHCO",
    "DOLZ ARGENTINA": "DOLZ",
    "FRASLE NAKATA": "NAKATA",
    "FRASLE RAYBESTOS DISCO DE FRENO": "RAYBESTOS",
    "FRASLE RAYBESTOS-PLASBESTOS PAST.FRENO": "RAYBESTOS",
    "FRASLE FARLOC TENSA": "FRASLE",
    "FRASLE POWER ENGINE": "FRASLE",
    "DANA SPICER": "SPICER",
    "DANA SPICER IMP": "SPICER",
    "DANA THOMPSON": "THOMPSON",
    "GATES KITS": "GATES",
    "SAINT GOBAIN NORTON": "NORTON",
    "SAINT GOBAIN TEK BOND": "TEK BOND",
    "TEK BOND": "TEKBOND",
    "OSRAM ARGENTINA S.A.C.I.": "OSRAM",
    "LÁMPARAS PHILIPS AUTOMOTIVE": "PHILIPS",
    "GULF OIL ARGENTINA S.A.": "GULF",
    "MLH VERNET (CALORSTAT)": "CALORSTAT",
    "LITTON - FRICTIONLAB": "LITTON",
    "BLACK + DECKER": "BLACK+DECKER",
    "BLACK + DECKER MANGUERAS": "BLACK+DECKER",
    "ESCALERAS BLACK + DECKER": "BLACK+DECKER",
    "ESCALERAS STANLEY": "STANLEY",
    "DEWALT ACCESORIOS": "DEWALT",
    "EINHELL ACCESORIOS": "EINHELL",
    "SKF ARGENTINA": "SKF",
    "SKF AUTOMOTOR": "SKF",
    "SKF INDUSTRIAL": "SKF",
}

BRAMCO_PDF_MANIFEST = [
    ("seLQQf1mZyLG.pdf", "BRAMCO_INA_KITS_DISTRIBUCION.pdf", "bramco-ina-kits", "INA - Kits de Distribución (Bramco)", "INA", "Distribución y Bombas de Agua"),
    ("tuZDaOsxSbPf.pdf", "BRAMCO_LUK_EMBRAGUES.pdf", "bramco-luk-embragues", "LuK - Embragues Liviana, Utilitarios y Pesada (Bramco)", "LUK", "Crapodinas y Embrague"),
    ("2HC2Fm3kuYbh.pdf", "BRAMCO_SACHS_EMBRAGUES.pdf", "bramco-sachs-embragues", "Sachs - Embragues y Componentes (Bramco)", "SACHS", "Crapodinas y Embrague"),
    ("sMOzSNOU5Ayt.pdf", "BRAMCO_COFAP_AMORTIGUADORES_LIVIANA.pdf", "bramco-cofap-liviana", "Cofap - Amortiguadores Línea Liviana (Bramco)", "COFAP", "Frenos y Suspensión"),
    ("SJkxfSf5i8mX.pdf", "BRAMCO_COFAP_AMORTIGUADORES_PESADA.pdf", "bramco-cofap-pesada", "Cofap - Amortiguadores Línea Pesada y Cabina (Bramco)", "COFAP", "Frenos y Suspensión"),
    ("D10YQ5L4mLDmK26.pdf", "BRAMCO_TRW_DISCOS_CAMPANAS_2025.pdf", "bramco-trw-discos-2025", "TRW - Discos y Campanas de Freno 2025 (Bramco)", "TRW", "Frenos y Suspensión"),
    ("zOe7bbRvzS2c.pdf", "BRAMCO_RAYBESTOS_PASTILLAS_FRENO.pdf", "bramco-raybestos-pastillas", "Raybestos / Plasbestos - Pastillas de Freno (Bramco)", "RAYBESTOS", "Frenos y Suspensión"),
    ("jZvlF1OCbA70.pdf", "BRAMCO_FTE_HIDRAULICOS_EMBRAGUE.pdf", "bramco-fte-embrague", "FTE - Accionamiento Hidráulico de Embrague (Bramco)", "FTE", "Crapodinas y Embrague"),
    ("XNuG7KHfyzoW.pdf", "BRAMCO_CORTECO_RETENES_LIVIANA.pdf", "bramco-corteco-liviana", "Corteco - Retenes Línea Liviana por Medida (Bramco)", "CORTECO", "Retenes y sellos"),
    ("R4BdGZ1JNuY9.pdf", "BRAMCO_CORTECO_RETENES_PESADA.pdf", "bramco-corteco-pesada", "Corteco - Retenes Línea Pesada por Medida (Bramco)", "CORTECO", "Retenes y sellos"),
    ("OBnJVtOsRduN.pdf", "BRAMCO_CORTECO_GUIA_RETENES_MOTOR.pdf", "bramco-corteco-motor", "Corteco - Guía Rápida Retenes de Motor (Bramco)", "CORTECO", "Retenes y sellos"),
    ("EKR5hrv2yrqh.pdf", "BRAMCO_CONTITECH_KITS_DISTRIBUCION.pdf", "bramco-contitech-kits", "ContiTech - Kits de Distribución y Equivalencias (Bramco)", "CONTINENTAL", "Distribución y Bombas de Agua"),
    ("Q6qaLU5Ta5IY.pdf", "BRAMCO_CONTITECH_CORREAS.pdf", "bramco-contitech-correas", "ContiTech - Correas V, Multi-V y Sincrónicas (Bramco)", "CONTINENTAL", "Correas en V y poli-V"),
    ("NgMoYRZ2f6xL.pdf", "BRAMCO_NAKATA_HOMOCINETICAS.pdf", "bramco-nakata-homocineticas", "Nakata - Juntas Homocinéticas (Bramco)", "NAKATA", "Crucetas y Cardanes"),
    ("rL3s22XdRGNc.pdf", "BRAMCO_NAKATA_SUSPENSION.pdf", "bramco-nakata-suspension", "Nakata - Bieletas, Brazos y Parrillas (Bramco)", "NAKATA", "Frenos y Suspensión"),
    ("EjG.pdf", "BRAMCO_NAKATA_AMORTIGUADORES.pdf", "bramco-nakata-amortiguadores", "Nakata - Amortiguadores y Equivalencias (Bramco)", "NAKATA", "Frenos y Suspensión"),
    ("A5Hklno0uH50.pdf", "BRAMCO_NAKATA_RESORTES_NEUMATICOS.pdf", "bramco-nakata-resortes", "Nakata - Resortes Neumáticos (Bramco)", "NAKATA", "Frenos y Suspensión"),
    ("Xwsx7ElsfLCY.pdf", "BRAMCO_NAKATA_GUIA_VISUAL.pdf", "bramco-nakata-guia", "Nakata - Folleto Técnico Suspensión (Bramco)", "NAKATA", "Frenos y Suspensión"),
    ("trx862PeCxW1.pdf", "BRAMCO_RM_BOMBAS_VACIO.pdf", "bramco-rm-depresores", "RM - Bombas de Vacío / Depresores (Bramco)", "RM", "Distribución y Bombas de Agua"),
]


def canon_brand(raw):
    if not raw:
        return None
    s = re.sub(r"\s+", " ", str(raw).strip()).upper()
    if not s or s in ("NO POSEE", "VARIOS", "N/A", "SIN MARCA", "OEM"):
        return None
    if s in BRAND_CANON_MAP:
        return BRAND_CANON_MAP[s]
    for prefix, mapped in [
        ("SKF ", "SKF"), ("NTN ", "NTN"), ("NSK ", "NSK"), ("KOYO ", "KOYO"),
        ("TIMKEN ", "TIMKEN"), ("BOSCH ", "BOSCH"), ("STANLEY ", "STANLEY"),
        ("LOCTITE ", "LOCTITE"), ("WURTH ", "WURTH"), ("3M ", "3M"),
    ]:
        if s.startswith(prefix):
            return mapped
    return s[:40]


def norm_code(s):
    if not s:
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def round_retail_cents(ars_val):
    if not ars_val or ars_val <= 0:
        return 0
    if ars_val >= 2000:
        return int(round(ars_val / 100.0) * 100) * 100
    if ars_val >= 300:
        return int(round(ars_val / 10.0) * 10) * 100
    return int(round(ars_val, 2) * 100)


def map_category(desc, raw_rubro=None):
    r = (raw_rubro or "").upper()
    u = (desc or "").upper()
    comb = f"{r} {u}"
    if any(k in comb for k in ["RETEN", "DBH", "SAV", "CORTECO", "ORING", "O-RING"]):
        return "Retenes y sellos"
    if any(k in r for k in ["CORREA", "POLY-V", "TRAPEZOIDAL"]) or re.match(r"^\d{1,2}PK\d{3,5}", u):
        return "Correas en V y poli-V"
    if any(k in comb for k in ["DISTRIB", "BOMBA AGUA", "BOMBA DE AGUA", "VKMA", "VKMC", "VKPC", "TENSOR", "DEPRESOR", "VACIO"]):
        return "Distribución y Bombas de Agua"
    if any(k in comb for k in ["EMBRAGUE", "CRAPODINA", "ACTUADOR HID", "CILINDRO MAESTRO", "CILINDRO AUX", "CIL.AUX", "VKC", "VOLANTE"]):
        return "Crapodinas y Embrague"
    if any(k in comb for k in ["FRENO", "PASTILLA", "DISCO", "CAMPANA", "AMORTIG", "SUSPEN", "ROTULA", "EXTREMO", "BIELETA", "PARRILLA", "CAZOLETA", "DIRECCION", "RESORTE NEUM"]):
        return "Frenos y Suspensión"
    if any(k in comb for k in ["CRUCETA", "TRICETA", "CARDAN", "HOMOCINET", "SEMIEJE", "SPICER"]):
        return "Crucetas y Cardanes"
    if any(k in comb for k in ["JUNTA", "BULON", "TORNILLO TAPA", "ARBOL", "VALVULA", "COJINETE", "PISTON", "ARO", "CAMISA", "SUB-CONJ", "SUBCONJ", "BOTADOR", "BALANCIN", "BOMBA ACEITE", "CIGUENAL", "TAPA CIL", "BLOCK", "MOTOR", "TACITA"]):
        return "Juntas y Bulonería Motor"
    if any(k in comb for k in ["FILTRO", "HABITACULO", "AIRE", "ACEITE FILT"]):
        return "Filtros y Mantenimiento"
    if any(k in comb for k in ["BATERIA", "BUJIA", "BOBINA", "CABLE", "ENCENDIDO", "INYECCION", "ALTERNADOR", "ARRANQUE", "SENSOR", "LAMPARA", "BULBO", "ELECTR"]):
        return "Electricidad e Inyección"
    if any(k in comb for k in ["LUBRIC", "GRASA", "SELLADOR", "ADHESIVO", "SILICONA", "LOCTITE", "LIMPIA", "AEROSOL", "REFRIGERANTE", "FLUIDO"]):
        return "Grasas y lubricantes"
    if any(k in comb for k in ["HERRAMIENTA", "PINZA", "LLAVE", "MECHA", "DISCO ABRAS", "FERRETER", "CINTA", "CANDADO", "ESCALERA", "TALADRO", "AMOLADORA"]):
        return "Herramientas e Insumos"
    if any(k in comb for k in ["MAZA", "VKBA", "RUEDA"]):
        return "Mazas y Kits de Rueda"
    if any(k in comb for k in ["RODAMIENTO", "RULEMAN"]):
        return "Rodamientos Automotor"
    return "Autopartes General"


def extract_dims(text):
    if not text:
        return None, None, None, None
    m = re.search(
        r"(?<!\d)(\d{1,3}(?:[.,]\d{1,3})?)\s*[xX*]\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*[xX*]\s*(\d{1,3}(?:[.,]\d{1,3})?)(?!\d)",
        text,
    )
    if m:
        try:
            d = float(m.group(1).replace(",", "."))
            D = float(m.group(2).replace(",", "."))
            B = float(m.group(3).replace(",", "."))
            if 1 <= d <= 500 and 3 <= D <= 1000 and 0.5 <= B <= 400 and D >= d:
                fmt = lambda v: str(int(v)) if v == int(v) else f"{v:.2f}".rstrip("0").rstrip(".")
                return d, D, B, f"{fmt(d)}x{fmt(D)}x{fmt(B)} mm"
        except ValueError:
            pass
    return None, None, None, None


def extract_product_codes(name, sup_code):
    """Extrae los códigos técnicos reales de un artículo existente en la base de Hugo (nunca el ID secuencial interno)."""
    codes = []
    if sup_code and len(norm_code(sup_code)) >= 3 and not str(sup_code).strip().isdigit():
        codes.append(norm_code(sup_code))
    if not name:
        return codes
    s = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", name).strip()
    # Extraer primer código antes de espacio, guion o paréntesis
    # Manejo especial para códigos con espacio interno tipo "0986 BB0 270" o "JD 343-15" o "FM02 0310"
    m_bosch = re.match(r"^((?:0\s*986|0\s*092|0\s*445|F\s*000|F\s*026)\s+[A-Z0-9]{3}\s+[A-Z0-9]{3})\b", s, re.I)
    if m_bosch:
        codes.append(norm_code(m_bosch.group(1)))
    m_jd = re.match(r"^([A-Z]{2}\s+\d{2,4}(?:[-/]\d{1,3})?)\b", s, re.I)
    if m_jd:
        codes.append(norm_code(m_jd.group(1)))

    lead = re.split(r"\s+-\s+|\s+\(|\s+\[|\s+", s)[0].strip()
    nc = norm_code(lead)
    SKIP_WORDS = {
        "KIT", "CORREA", "RETEN", "RULEMAN", "RODAMIENTO", "JUNTA", "BOMBA", "PASTILLA",
        "PASTILLAS", "DISCO", "DISCOS", "AMORT", "AMORTIGUADOR", "FILTRO", "CABLE", "CABLES",
        "BUJIA", "BATERIA", "CRAPODINA", "CRUCETA", "MAZA", "TENSOR", "COJINETE", "BULONES",
        "GUANTE", "AGUA", "PRECINTOS", "PRECINTO", "GRASA", "ACEITE", "SET", "ROD",
    }
    if len(nc) >= 4 and lead.upper() not in SKIP_WORDS and any(ch.isdigit() for ch in nc):
        codes.append(nc)

    # Códigos equivalentes entre paréntesis: ej "(530063010)" o "(VKMA05012)" o "(CT874/K3)"
    for grp in re.findall(r"\(([^)]{3,35})\)", s):
        for sub in re.split(r"[/,\s]+", grp):
            sub_nc = norm_code(sub)
            if len(sub_nc) >= 5 and any(ch.isdigit() for ch in sub_nc) and sub.upper() not in SKIP_WORDS:
                codes.append(sub_nc)

    # Si empieza con LOCTITE 243 / LOCTITE 5699
    m_loc = re.match(r"^LOCTITE\s+(\d{3,4})\b", s, re.I)
    if m_loc:
        codes.append("LOCTITE" + m_loc.group(1))

    # Deduplicate preserving order
    seen = set()
    out = []
    for c in codes:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def sync_bramco_pdfs_and_extract_items():
    """Copia los 19 PDFs de Bramco a public/catalogs (<24MB c/u), actualiza catalogs-manifest.json y extrae ítems técnicos."""
    os.makedirs(PUBLIC_CATALOGS_DIR, exist_ok=True)

    existing_manifest = []
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            existing_manifest = json.load(f)

    # Conservar catálogos de Alfa Rodamientos y etiquetar supplier
    kept_manifest = []
    bramco_ids = {x[2] for x in BRAMCO_PDF_MANIFEST}
    for entry in existing_manifest:
        if entry.get("id") not in bramco_ids:
            entry["supplier"] = entry.get("supplier") or "Alfa Rodamientos"
            kept_manifest.append(entry)

    extracted_items = []  # dicts for supplier_catalog_items & cross-enrichment

    for src_fn, dst_fn, cat_id, title, brand, category in BRAMCO_PDF_MANIFEST:
        src_path = os.path.join(DOWNLOADS_DIR, src_fn)
        if not os.path.exists(src_path):
            print(f"  [WARN] PDF no encontrado: {src_path}")
            continue

        dst_path = os.path.join(PUBLIC_CATALOGS_DIR, dst_fn)
        src_size = os.path.getsize(src_path)

        doc = pymupdf.open(src_path)
        pages_data = []
        for idx in range(len(doc)):
            raw_txt = doc[idx].get_text("text") or ""
            clean_txt = re.sub(r"\s+", " ", raw_txt).strip()
            pages_data.append({"pageNumber": idx + 1, "text": clean_txt})

            # Extraer ítems estructurados según el catálogo
            lines = [ln.strip() for ln in raw_txt.splitlines() if ln.strip()]
            if cat_id in ("bramco-corteco-liviana", "bramco-corteco-pesada"):
                # Patrón en Corteco: APLICACION -> CODIGO -> MAT (V/N/S/T/P/A/F) -> EJE -> EXT -> ALTURA
                for li in range(len(lines) - 4):
                    mat = lines[li + 1]
                    if mat in ("V", "N", "S", "T", "P", "A", "F", "B", "MV"):
                        code_cand = lines[li].replace(" ", "")
                        n1 = lines[li + 2].replace(",", ".")
                        n2 = lines[li + 3].replace(",", ".")
                        n3 = lines[li + 4].replace(",", ".")
                        try:
                            d, D, B = float(n1), float(n2), float(n3)
                            if 3 <= d <= 350 and d < D <= 500 and 1 <= B <= 120 and re.match(r"^[0-9]{2,8}[A-Z]{0,3}$", code_cand):
                                app_ctx = lines[li - 1] if li > 0 else "Retén"
                                fmt = lambda v: str(int(v)) if v == int(v) else f"{v:.2f}".rstrip("0").rstrip(".")
                                dim_str = f"{fmt(d)}x{fmt(D)}x{fmt(B)} mm"
                                extracted_items.append({
                                    "supplier_name": "BRAMCO",
                                    "brand": "CORTECO",
                                    "category": "Retenes y sellos",
                                    "code": code_cand,
                                    "name": f"Retén Corteco {code_cand} ({dim_str}) {app_ctx[:50]}",
                                    "d": d, "D": D, "B": B, "dimensions": dim_str,
                                    "application": f"{app_ctx} (Mat: {mat})",
                                    "original_code": None,
                                })
                        except ValueError:
                            pass

            elif cat_id == "bramco-ina-kits":
                for m in re.finditer(r"\b(53[0-6]\s?\d{4}\s?\d{2})\b", raw_txt):
                    raw_c = re.sub(r"\s+", "", m.group(1))
                    extracted_items.append({
                        "supplier_name": "BRAMCO",
                        "brand": "INA",
                        "category": "Distribución y Bombas de Agua",
                        "code": raw_c,
                        "name": f"Kit / Tensor Distribución INA {raw_c}",
                        "d": None, "D": None, "B": None, "dimensions": None,
                        "application": clean_txt[:160],
                        "original_code": None,
                    })

            elif cat_id == "bramco-contitech-kits":
                for m in re.finditer(r"\b(CT\d{3,4}K\d(?:WP\d?)?)\b", raw_txt):
                    raw_c = m.group(1)
                    extracted_items.append({
                        "supplier_name": "BRAMCO",
                        "brand": "CONTINENTAL",
                        "category": "Distribución y Bombas de Agua",
                        "code": raw_c,
                        "name": f"Kit Distribución ContiTech {raw_c}",
                        "d": None, "D": None, "B": None, "dimensions": None,
                        "application": clean_txt[:160],
                        "original_code": None,
                    })

            elif cat_id in ("bramco-nakata-homocineticas", "bramco-nakata-suspension", "bramco-nakata-amortiguadores"):
                for m in re.finditer(r"\b(NJH\d{2,4}-\d{2,4}[A-Z]?|NB\d{4,5}|AC\d{5}|HG\d{5})\b", raw_txt):
                    raw_c = m.group(1)
                    sub_desc = "Junta Homocinética" if raw_c.startswith("NJH") else ("Bieleta / Suspensión" if raw_c.startswith("NB") else "Amortiguador")
                    extracted_items.append({
                        "supplier_name": "BRAMCO",
                        "brand": "NAKATA",
                        "category": category,
                        "code": raw_c,
                        "name": f"{sub_desc} Nakata {raw_c}",
                        "d": None, "D": None, "B": None, "dimensions": None,
                        "application": clean_txt[:160],
                        "original_code": None,
                    })

            elif cat_id == "bramco-trw-discos-2025":
                for li, ln in enumerate(lines):
                    if re.match(r"^R[CP]D[IB]\d{4,5}$", ln):
                        modelo = lines[li - 3] if li >= 3 else ""
                        d_ext = None
                        esp = None
                        if li + 4 < len(lines):
                            try:
                                d_ext = float(lines[li + 3].replace(",", "."))
                                esp = float(lines[li + 4].replace(",", "."))
                            except ValueError:
                                pass
                        dim_s = f"Ø{int(d_ext)}x{esp} mm" if (d_ext and esp) else None
                        extracted_items.append({
                            "supplier_name": "BRAMCO",
                            "brand": "TRW",
                            "category": "Frenos y Suspensión",
                            "code": ln,
                            "name": f"Disco/Campana Freno TRW {ln} {modelo}".strip(),
                            "d": None, "D": d_ext, "B": esp, "dimensions": dim_s,
                            "application": modelo,
                            "original_code": None,
                        })

            elif cat_id in ("bramco-cofap-liviana", "bramco-cofap-pesada"):
                for m in re.finditer(r"\b((?:GP|GB|GL|L|B)\d{4,5}GY[A-Z]?)\b", raw_txt):
                    raw_c = m.group(1)
                    extracted_items.append({
                        "supplier_name": "BRAMCO",
                        "brand": "COFAP",
                        "category": "Frenos y Suspensión",
                        "code": raw_c,
                        "name": f"Amortiguador Cofap {raw_c}",
                        "d": None, "D": None, "B": None, "dimensions": None,
                        "application": clean_txt[:160],
                        "original_code": None,
                    })

            elif cat_id == "bramco-fte-embrague":
                for m in re.finditer(r"\b(KN\d{5}[A-Z0-9.]*|D\d{6}|ZA\d{5}[A-Z0-9.]*)\b", raw_txt):
                    raw_c = m.group(1)
                    extracted_items.append({
                        "supplier_name": "BRAMCO",
                        "brand": "FTE",
                        "category": "Crapodinas y Embrague",
                        "code": raw_c,
                        "name": f"Cilindro / Actuador Embrague FTE {raw_c}",
                        "d": None, "D": None, "B": None, "dimensions": None,
                        "application": clean_txt[:160],
                        "original_code": None,
                    })

            elif cat_id == "bramco-luk-embragues":
                for m in re.finditer(r"\b([56]\d{2}\s\d{4}\s\d{2})\b", raw_txt):
                    raw_c = re.sub(r"\s+", "", m.group(1))
                    extracted_items.append({
                        "supplier_name": "BRAMCO",
                        "brand": "LUK",
                        "category": "Crapodinas y Embrague",
                        "code": raw_c,
                        "name": f"Kit / Crapodina Embrague LuK {raw_c}",
                        "d": None, "D": None, "B": None, "dimensions": None,
                        "application": clean_txt[:160],
                        "original_code": None,
                    })

            elif cat_id == "bramco-sachs-embragues":
                for m in re.finditer(r"\b(3000\s\d{3}\s\d{3}|3182\s\d{3}\s\d{3})\b", raw_txt):
                    raw_c = re.sub(r"\s+", "", m.group(1))
                    extracted_items.append({
                        "supplier_name": "BRAMCO",
                        "brand": "SACHS",
                        "category": "Crapodinas y Embrague",
                        "code": raw_c,
                        "name": f"Kit / Actuador Embrague Sachs {raw_c}",
                        "d": None, "D": None, "B": None, "dimensions": None,
                        "application": clean_txt[:160],
                        "original_code": None,
                    })

        # Copiar / optimizar PDF si supera 24 MiB (límite de assets estáticos en Cloudflare Workers)
        if src_size > 24 * 1024 * 1024:
            print(f"  Optimizando PDF grande {src_fn} ({src_size // (1024*1024)} MB) para límite Cloudflare <25MB...")
            try:
                doc.rewrite_images(dpi_threshold=130, dpi_target=96, quality=65, lossy=True)
            except Exception as e:
                print("    rewrite_images aviso:", e)
            doc.save(dst_path, garbage=4, deflate=True, clean=True)
            print(f"    -> Guardado {dst_fn}: {os.path.getsize(dst_path) // (1024*1024)} MB")
        else:
            if not os.path.exists(dst_path) or os.path.getsize(dst_path) != src_size:
                shutil.copy2(src_path, dst_path)

        kept_manifest.append({
            "id": cat_id,
            "supplier": "Bramco",
            "file": dst_fn,
            "title": title,
            "brand": brand,
            "category": category,
            "totalPages": len(doc),
            "pages": pages_data,
        })
        doc.close()

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(kept_manifest, f, ensure_ascii=False)

    # Deduplicar ítems extraídos de PDFs de Bramco por (brand, code)
    dedup_bramco = {}
    for it in extracted_items:
        key = (it["brand"], norm_code(it["code"]))
        if key[1] and key not in dedup_bramco:
            dedup_bramco[key] = it
        elif key in dedup_bramco and it.get("dimensions") and not dedup_bramco[key].get("dimensions"):
            dedup_bramco[key] = it

    print(f"PDFs en manifiesto total: {len(kept_manifest)} | Ítems técnicos únicos extraídos de Bramco PDFs: {len(dedup_bramco)}")
    return list(dedup_bramco.values())


def load_all_price_catalogs():
    """Carga y normaliza las 4 listas oficiales descargadas el 24/11/2026 + Alfa 11/11/2026."""
    offers_list = []  # Cada entrada: dict uniforme

    # 1. ICEPAR (articulos_20261124_152415.xls)
    ice_xls = os.path.join(DOWNLOADS_DIR, "articulos_20261124_152415.xls")
    ice_json_tmp = os.path.join(PROJECT_DIR, ".icepar_tmp.json")
    subprocess.run(
        [
            "node", "-e",
            f"const fs=require('fs'),XLSX=require('xlsx');"
            f"const wb=XLSX.readFile({json.dumps(ice_xls)});"
            f"fs.writeFileSync({json.dumps(ice_json_tmp)},JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])));"
        ],
        check=True,
    )
    with open(ice_json_tmp, "r", encoding="utf-8") as f:
        ice_rows = json.load(f)
    os.remove(ice_json_tmp)

    ice_cnt = 0
    for r in ice_rows:
        code_raw = str(r.get("Articulo", "")).strip()
        name_raw = str(r.get("Nombre", "")).strip()
        if not code_raw or not name_raw:
            continue
        lista = float(r.get("Precio de Lista") or 0)
        if lista <= 0:
            continue
        brand = canon_brand(r.get("PROVEEDOR"))
        rubro = str(r.get("RUBRO", "")).strip()
        is_offer = str(r.get("Precio de Oferta", "NO")).strip().upper() == "SI"
        # Descuento general Icepar 18.7% + flete/imp (~8.9%) -> 0.886 lista; mostrador ~1.28 lista
        cost_ars = round(lista * (0.83 if is_offer else 0.886), 2)
        price_cents = round_retail_cents(lista * (1.20 if is_offer else 1.28))
        offers_list.append({
            "supplier_name": "ICEPAR",
            "supplier_code": code_raw,
            "match_codes": [norm_code(code_raw)],
            "name": name_raw,
            "brand": brand,
            "category": map_category(name_raw, rubro),
            "cost_cents": int(round(cost_ars * 100)),
            "price_cents": price_cents,
            "freight_pct": 6.0,
            "lead_time_days": 4,
            "is_offer": is_offer,
        })
        ice_cnt += 1
    print(f"Cargados ICEPAR: {ice_cnt} artículos con precio.")

    # 2. ITURRIA (Precios-20261124.xlsx)
    wb_it = openpyxl.load_workbook(os.path.join(DOWNLOADS_DIR, "Precios-20261124.xlsx"), read_only=True, data_only=True)
    it_seen = set()
    it_cnt = 0
    for sh in wb_it.sheetnames:
        for idx, r in enumerate(wb_it[sh].iter_rows(values_only=True)):
            if idx < 2 or not r or not r[0]:
                continue
            code_raw = str(r[0]).strip()
            if code_raw in it_seen:
                continue
            it_seen.add(code_raw)
            desc = str(r[1] or "").strip()
            raw_brand = str(r[2] or "").strip()
            brand = canon_brand(raw_brand)
            linea = str(r[3] or "").strip()
            iva_str = str(r[6] or "21%").strip()
            iva_rate = 0.105 if "10.5" in iva_str or "10,5" in iva_str else 0.21
            neto_reg = float(r[8] or 0)
            neto_of = float(r[9] or 0)
            neto = neto_of if neto_of > 0 else neto_reg
            if neto <= 0:
                continue
            # En Iturria el código a veces termina con la marca ("07913 3M" -> clean "07913")
            clean_c = code_raw
            if raw_brand and code_raw.upper().endswith(" " + raw_brand.upper()):
                clean_c = code_raw[: -len(raw_brand)].strip()
            elif " " in code_raw and brand and code_raw.upper().endswith(" " + brand):
                clean_c = code_raw[: -len(brand)].strip()

            m_codes = [norm_code(clean_c)]
            if norm_code(code_raw) not in m_codes:
                m_codes.append(norm_code(code_raw))
            if brand == "LOCTITE":
                m_loc = re.search(r"\bLOCTITE\s+(\d{3,4})\b", desc, re.I)
                if m_loc:
                    m_codes.append("LOCTITE" + m_loc.group(1))

            cost_ars = round(neto * 1.14, 2)
            price_cents = round_retail_cents(cost_ars * 1.206 * (1.0 + iva_rate))
            offers_list.append({
                "supplier_name": "ITURRIA",
                "supplier_code": code_raw,
                "match_codes": [c for c in m_codes if c],
                "name": desc or code_raw,
                "brand": brand,
                "category": map_category(desc, linea),
                "cost_cents": int(round(cost_ars * 100)),
                "price_cents": price_cents,
                "freight_pct": 6.0,
                "lead_time_days": 4,
                "is_offer": neto_of > 0,
            })
            it_cnt += 1
    wb_it.close()
    print(f"Cargados ITURRIA: {it_cnt} artículos únicos con precio.")

    # 3. ARCORE S.A. (listado_completo_20261124154118.csv)
    arc_cnt = 0
    with open(os.path.join(DOWNLOADS_DIR, "listado_completo_20261124154118.csv"), "r", encoding="latin-1", errors="replace") as f:
        for r in csv.reader(f, delimiter=";"):
            if len(r) < 8:
                continue
            pref = r[0].strip().upper()
            c1 = r[1].strip()
            med = r[2].strip()
            desc = r[3].strip()
            raw_val = r[4].strip()
            c_alt = r[5].strip()
            rubro = r[7].strip()
            if not c1 or not raw_val.isdigit():
                continue
            lista_ars = int(raw_val) / 100.0
            if lista_ars <= 0:
                continue
            brand = ARCORE_PREFIX_BRAND.get(pref) or canon_brand(desc)
            full_code = f"{c1} {med}".strip() if med and med not in c1 else c1
            full_desc = f"{desc} ({med})".strip() if med else desc

            if pref in ARCORE_LOW_DISCOUNT_PREFIXES:
                cost_ars = round(lista_ars * 0.92, 2)
                price_cents = round_retail_cents(lista_ars * 1.32)
            else:
                cost_ars = round(lista_ars * 0.582, 2)
                price_cents = round_retail_cents(lista_ars * 1.125)

            m_codes = []
            for cand in (full_code, c_alt, c1 if not med else None):
                nc = norm_code(cand)
                if nc and nc not in m_codes:
                    m_codes.append(nc)

            offers_list.append({
                "supplier_name": "ARCORE S.A.",
                "supplier_code": full_code,
                "match_codes": m_codes,
                "name": full_desc,
                "brand": brand,
                "category": map_category(full_desc, rubro),
                "cost_cents": int(round(cost_ars * 100)),
                "price_cents": price_cents,
                "freight_pct": 6.0,
                "lead_time_days": 4,
                "is_offer": False,
            })
            arc_cnt += 1
    print(f"Cargados ARCORE S.A.: {arc_cnt} artículos con precio.")

    # 4. MAGNUM / Papierttei (DKTPRE.ZIP)
    with zipfile.ZipFile(os.path.join(DOWNLOADS_DIR, "DKTPRE.ZIP"), "r") as z:
        txt_sec = z.read("DKTPRE.TXT").decode("latin-1", errors="replace")
        txt_of = z.read("DKTPRE_CON_OF.TXT").decode("latin-1", errors="replace")

    mag_meta = {}
    lines_sec = txt_sec.splitlines()
    cur_maker = None
    cur_line = None
    i = 0
    while i < len(lines_sec):
        s_ln = lines_sec[i].strip()
        if s_ln.startswith("----") and i + 2 < len(lines_sec) and lines_sec[i + 2].strip().startswith("----"):
            cur_maker = lines_sec[i + 1].strip().lstrip("#-").strip()
            i += 3
            continue
        if s_ln.startswith("*") and s_ln.endswith("*") and len(s_ln) > 2:
            cur_line = s_ln.strip("*").strip()
            i += 1
            continue
        if s_ln and cur_maker:
            c_part = lines_sec[i][:20].strip()
            if c_part:
                mag_meta[norm_code(c_part)] = (cur_maker, cur_line)
        i += 1

    mag_cnt = 0
    for ln in txt_of.splitlines()[1:]:
        parts = ln.split("|")
        if len(parts) < 4:
            continue
        code_raw = parts[0].strip()
        desc_raw = parts[1].strip()
        pr_str = parts[2].strip().replace(",", ".")
        is_of = parts[3].strip().upper() == "SI"
        try:
            pr_val = float(pr_str)
        except ValueError:
            continue
        if not code_raw or pr_val <= 0:
            continue

        nc = norm_code(code_raw)
        maker, subline = mag_meta.get(nc, (None, None))
        brand = canon_brand(maker) or canon_brand(subline) or canon_brand(desc_raw)
        cost_ars = round(pr_val * (0.90 if brand == "BOSCH" else 1.0), 2)
        price_cents = round_retail_cents(cost_ars * 1.815)

        offers_list.append({
            "supplier_name": "MAGNUM (Papierttei)",
            "supplier_code": code_raw,
            "match_codes": [nc] if nc else [],
            "name": desc_raw,
            "brand": brand,
            "category": map_category(desc_raw, subline),
            "cost_cents": int(round(cost_ars * 100)),
            "price_cents": price_cents,
            "freight_pct": 6.0,
            "lead_time_days": 4,
            "is_offer": is_of,
        })
        mag_cnt += 1
    print(f"Cargados MAGNUM (Papierttei): {mag_cnt} artículos con precio.")

    # 5. Alfa Rodamientos (Lista de Precios_11-11-2026) para respaldo de precios en $0
    alfa_prices = {}
    alfa_path = os.path.join(DOWNLOADS_DIR, "Lista de Precios_11-11-2026 06-14-14.xlsx")
    if os.path.exists(alfa_path):
        wb_al = openpyxl.load_workbook(alfa_path, read_only=True, data_only=True)
        ws_al = wb_al[wb_al.sheetnames[0]]
        for idx, r in enumerate(ws_al.iter_rows(values_only=True)):
            if idx == 0 or not r or not r[0]:
                continue
            c_al = norm_code(r[0])
            pr_al = float(r[4] or 0)
            if c_al and pr_al > 0:
                # Alfa: -25% compra y -20% pago -> 0.60 lista + flete -> ~0.65 lista; venta +50% + IVA
                alfa_prices[c_al] = (
                    str(r[0]).strip(),
                    str(r[1] or "").strip(),
                    canon_brand(r[3]),
                    int(round(pr_al * 0.65 * 100)),
                    round_retail_cents(pr_al * 0.65 * 1.50 * 1.21),
                )
        wb_al.close()
        print(f"Cargados respaldo Alfa Rodamientos: {len(alfa_prices)} precios.")

    return offers_list, alfa_prices


def main():
    db_files = glob.glob(DB_GLOB)
    if not db_files:
        raise RuntimeError(f"No se encontró base D1 local en {DB_GLOB}")
    db_path = db_files[0]
    print(f"Conectando a D1 SQLite: {db_path}")

    # Paso 1: Sincronizar PDFs de Bramco y extraer ítems técnicos
    bramco_tech_items = sync_bramco_pdfs_and_extract_items()

    # Paso 2: Cargar las 4 listas oficiales de precios + respaldo Alfa
    offers_list, alfa_prices = load_all_price_catalogs()

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    c = conn.cursor()

    # Paso 3: Verificar, normalizar y completar los 9 proveedores solicitados en `suppliers`
    print("\n--- Normalizando Directorio de Proveedores ---")
    # Normalizar PAPIERTTEI -> MAGNUM (Papierttei) y ALFA RODAMIENTOS -> Alfa Rodamientos
    c.execute("UPDATE suppliers SET name = 'MAGNUM (Papierttei)', updated_at = ? WHERE upper(name) = 'PAPIERTTEI'", (NOW_ISO,))
    c.execute("UPDATE products SET supplier_name = 'MAGNUM (Papierttei)' WHERE upper(supplier_name) = 'PAPIERTTEI'")
    c.execute("UPDATE product_supplier_options SET supplier_name = 'MAGNUM (Papierttei)' WHERE upper(supplier_name) = 'PAPIERTTEI'")
    c.execute("UPDATE products SET supplier_name = 'Alfa Rodamientos' WHERE upper(supplier_name) = 'ALFA RODAMIENTOS'")
    c.execute("UPDATE product_supplier_options SET supplier_name = 'Alfa Rodamientos' WHERE upper(supplier_name) = 'ALFA RODAMIENTOS'")

    # Limpiar opciones sintéticas de demostración (-PAT / IMP-) para dejar comparador 100% real
    c.execute("DELETE FROM product_supplier_options WHERE supplier_name IN ('Distribuidora Patagónica SKF / FAG', 'Importadora Buenos Aires Sur')")
    c.execute("UPDATE suppliers SET active = 0 WHERE name IN ('Distribuidora Patagónica SKF / FAG', 'Importadora Buenos Aires Sur') AND id NOT IN (SELECT DISTINCT supplier_id FROM supplier_purchase_orders WHERE supplier_id IS NOT NULL)")

    suppliers_spec = [
        ("Cedisa Srl", "Neuquén Capital", 2, 4, 3.5, "Cuenta corriente", "HUTCHINSON, NAKATA, SKF, VALVOLINE, VTH, WOLVER, HIPERFREIOS, LITTON", "Inspector Gatica 152 (Neuquén) · Portal cedisa.pw.plus (pendiente descarga archivo de lista)"),
        ("ICEPAR", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente (-18.7% bonif. gral.)", "GATES, INA, FAG, LUK, SACHS, VALEO, SABO, MAHLE, LPR, TRW, FTE, SPICER, VMG, LUCAS", "Portal icepar.com.ar · Lista oficial sincronizada 24/11/2026 (23.490 artículos)"),
        ("MAGNUM (Papierttei)", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente", "BOSCH, SKF, INA, FAG, LUK, NAKATA, DOLZ, GATES, MAHLE, BAHCO, LOCTITE, DELPHI, SPICER, FRASLE, RAYBESTOS", "Portal magnum.papierttei.com · Lista completa DKTPRE sincronizada 24/11/2026 (35.328 artículos)"),
        ("ALUSA", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente", "AUTOPARTES Y RODAMIENTOS", "Proveedor verificado en sistema · Pendiente descarga de archivo de lista oficial"),
        ("ARCORE S.A.", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente", "TARANTO, MAHLE, RENO, ILLINOIS, SABO, SAV, VICTOR REINZ, SACHS, COFAP, TRW, LUK, DAYCO, VMG, FALLONE, AKURO, SINTERMETAL", "Portal clientes.arcore.com · Listado completo sincronizado 24/11/2026 (27.728 artículos)"),
        ("ITURRIA", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente (-6% -20%)", "BOSCH, LOCTITE, 3M, SKF, DOLZ, BAHCO, STANLEY, DEWALT, FRASLE, FREMAX, PHILIPS, CALORSTAT", "Portal catalogodigital.iturria.com.ar · Lista Autopartes y Ferretería sincronizada 24/11/2026 (20.104 artículos)"),
        ("BRAMCO", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente", "INA, LUK, SACHS, COFAP, TRW, RAYBESTOS, FTE, CORTECO, CONTINENTAL, NAKATA, RM, DAYCO, DOLZ, FAG, TIMKEN", "Portal bramco.com.ar · 19 catálogos técnicos oficiales sincronizados 24/11/2026"),
        ("TOP AUTO", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente", "DBH, EUROMIX, ACCESORIOS AUTOMOTOR", "Proveedor activo en sistema · Pendiente descarga de archivo de lista oficial"),
        ("ALTRI", "Buenos Aires", 4, 6, 6.0, "Cuenta corriente", "AUTOPARTES Y REPUESTOS", "Proveedor verificado en sistema · Pendiente descarga de archivo de lista oficial"),
    ]

    for sname, city, lt, lta, fpct, pterms, brands_sup, notes in suppliers_spec:
        row = c.execute("SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE", (sname,)).fetchone()
        if row:
            c.execute(
                """UPDATE suppliers
                   SET city = COALESCE(city, ?),
                       lead_time_days = ?,
                       lead_time_alert_days = ?,
                       freight_pct = ?,
                       payment_terms = ?,
                       brands_supplied = ?,
                       notes = ?,
                       active = 1,
                       updated_at = ?
                   WHERE id = ?""",
                (city, lt, lta, fpct, pterms, brands_sup[:300], notes[:1000], NOW_ISO, row[0]),
            )
        else:
            c.execute(
                """INSERT INTO suppliers (name, city, lead_time_days, lead_time_alert_days, freight_pct, payment_terms, brands_supplied, notes, active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
                (sname, city, lt, lta, fpct, pterms, brands_sup[:300], notes[:1000], NOW_ISO, NOW_ISO),
            )

    supplier_id_map = {
        r[1].upper(): (r[0], r[1], r[2], r[3])
        for r in c.execute("SELECT id, name, freight_pct, lead_time_days FROM suppliers WHERE active = 1").fetchall()
    }

    # Categorías en DB
    cat_id_map = {
        r[1].upper(): r[0]
        for r in c.execute("SELECT id, name FROM categories").fetchall()
    }

    def get_cat_id(cat_name):
        if not cat_name:
            cat_name = "Autopartes General"
        k = cat_name.upper()
        if k in cat_id_map:
            return cat_id_map[k]
        cur = c.execute("INSERT INTO categories (name, active) VALUES (?, 1)", (cat_name,))
        cid = cur.lastrowid
        cat_id_map[k] = cid
        return cid

    # Indexar ofertas por match_code
    code_to_offers = {}
    for off in offers_list:
        for mc in off["match_codes"]:
            if len(mc) >= 4:
                code_to_offers.setdefault(mc, []).append(off)

    bramco_by_code = {}
    for bit in bramco_tech_items:
        nc = norm_code(bit["code"])
        if len(nc) >= 3:
            bramco_by_code.setdefault(nc, []).append(bit)

    # Paso 4: Auditar, corregir y actualizar los productos existentes en D1
    print("\n--- Auditando y actualizando productos existentes en D1 ---")
    existing_rows = c.execute(
        """SELECT id, sku, name, description, brand, category_id, price_cents, cost_cents,
                  stock, supplier_name, supplier_code, dimensions, inner_diameter_mm, outer_diameter_mm, width_mm
           FROM products WHERE active = 1"""
    ).fetchall()

    existing_skus_upper = {str(r[1]).upper() for r in existing_rows}
    matched_offer_keys = set()  # (supplier_name, supplier_code) ya vinculados a un producto existente
    matched_bramco_keys = set()

    stats = {
        "existing_total": len(existing_rows),
        "typos_cleaned": 0,
        "matched_products": 0,
        "prices_updated": 0,
        "zero_prices_fixed": 0,
        "brands_filled": 0,
        "suppliers_filled": 0,
        "descriptions_enriched": 0,
        "dimensions_filled": 0,
        "supplier_options_upserted": 0,
        "new_products_inserted": 0,
    }

    pso_upserts = []

    for row in existing_rows:
        (pid, sku, name, desc, brand, cat_id, price_c, cost_c,
         stock, sup_name, sup_code, dims, d_in, d_out, w_mm) = row

        orig_vals = (name, desc, brand, price_c, cost_c, sup_name, sup_code, dims)
        clean_name = re.sub(r"[\x00-\x1f\x7f-\x9f]+", "", name or "").strip()
        clean_name = re.sub(r"\bBOCSH\b", "BOSCH", clean_name, flags=re.I)
        new_brand = canon_brand(brand)
        if clean_name != name or (brand and new_brand != brand):
            stats["typos_cleaned"] += 1

        new_desc = desc or clean_name
        new_price_c = price_c or 0
        new_cost_c = cost_c or 0
        new_sup_name = sup_name
        new_sup_code = sup_code
        new_dims = dims
        new_din, new_dout, new_w = d_in, d_out, w_mm

        p_codes = extract_product_codes(clean_name, sup_code)

        # Buscar coincidencias en las 4 listas nuevas
        candidate_offers = []
        seen_off_ids = set()
        for pc in p_codes:
            for off in code_to_offers.get(pc, []):
                if id(off) in seen_off_ids:
                    continue
                # Validar compatibilidad de marca si el producto ya tiene marca definida
                if new_brand and off["brand"] and new_brand != off["brand"]:
                    # Permitir equivalencias del mismo grupo (INA/FAG/LUK, CONTINENTAL/CONTITECH, SPICER/ETMA)
                    same_group = (
                        {new_brand, off["brand"]} <= {"INA", "FAG", "LUK"}
                        or {new_brand, off["brand"]} <= {"SACHS", "COFAP"}
                        or {new_brand, off["brand"]} <= {"RAYBESTOS", "FRASLE"}
                    )
                    if not same_group:
                        continue
                # Evitar falsos positivos de códigos numéricos cortos (4 dígitos) si no coincide marca ni proveedor
                if len(pc) <= 4 and pc.isdigit() and not (
                    (new_brand and off["brand"] == new_brand)
                    or (new_sup_name and new_sup_name.upper() == off["supplier_name"].upper())
                ):
                    continue
                seen_off_ids.add(id(off))
                candidate_offers.append(off)

        # Buscar enriquecimiento técnico en Bramco PDFs
        candidate_bramco = []
        for pc in p_codes:
            for bit in bramco_by_code.get(pc, []):
                if new_brand and bit["brand"] != new_brand:
                    continue
                candidate_bramco.append(bit)
                matched_bramco_keys.add((bit["brand"], norm_code(bit["code"])))

        if candidate_offers or candidate_bramco:
            stats["matched_products"] += 1

        if candidate_offers:
            for off in candidate_offers:
                matched_offer_keys.add((off["supplier_name"], off["supplier_code"]))
                sup_info = supplier_id_map.get(off["supplier_name"].upper())
                if sup_info:
                    pso_upserts.append((
                        pid, sup_info[0], sup_info[1], off["supplier_code"][:80],
                        (off["brand"] or new_brand or " Estándar")[:80].strip(),
                        off["cost_cents"], sup_info[2], sup_info[3],
                        1 if (new_sup_name and new_sup_name.upper() == sup_info[1].upper()) else 0,
                        NOW_ISO,
                    ))

            # Elegir oferta principal: priorizar el proveedor actual del producto si está entre las ofertas; si no, el menor costo
            preferred_off = None
            if new_sup_name:
                same_sup = [o for o in candidate_offers if o["supplier_name"].upper() == new_sup_name.upper()]
                if same_sup:
                    preferred_off = min(same_sup, key=lambda x: x["cost_cents"])
            if not preferred_off:
                preferred_off = min(candidate_offers, key=lambda x: x["cost_cents"])

            if not new_brand and preferred_off["brand"]:
                new_brand = preferred_off["brand"]
                stats["brands_filled"] += 1

            if not new_sup_name:
                new_sup_name = preferred_off["supplier_name"]
                new_sup_code = preferred_off["supplier_code"]
                stats["suppliers_filled"] += 1
            elif not new_sup_code and preferred_off["supplier_name"].upper() == new_sup_name.upper():
                new_sup_code = preferred_off["supplier_code"]

            # Enriquecer descripción con aplicación vehicular del catálogo oficial
            off_desc = preferred_off["name"]
            if off_desc and off_desc.upper() not in (new_desc or "").upper():
                combined_desc = f"{clean_name} — {off_desc}"
                if len(combined_desc) > len(new_desc or ""):
                    new_desc = combined_desc[:500]
                    stats["descriptions_enriched"] += 1

            # Comparar y actualizar costo y precio si están en $0, mal cargados o desactualizados (>2% variación)
            was_zero = (new_price_c == 0)
            same_supplier_match = (new_sup_name and preferred_off["supplier_name"].upper() == new_sup_name.upper())
            underpriced_error = (new_price_c > 0 and new_price_c < int(preferred_off["cost_cents"] * 1.22))
            cost_diff_pct = abs(new_cost_c - preferred_off["cost_cents"]) / max(1, preferred_off["cost_cents"])
            price_diff_pct = abs(new_price_c - preferred_off["price_cents"]) / max(1, preferred_off["price_cents"])

            if was_zero or new_cost_c == 0 or underpriced_error or (same_supplier_match and (cost_diff_pct > 0.02 or price_diff_pct > 0.02)) or (not sup_name and price_diff_pct > 0.05):
                new_cost_c = preferred_off["cost_cents"]
                new_price_c = preferred_off["price_cents"]
                if was_zero:
                    stats["zero_prices_fixed"] += 1
                else:
                    stats["prices_updated"] += 1

        # Si sigue en $0 y está en respaldo de Alfa Rodamientos, repararlo
        if new_price_c == 0:
            for pc in p_codes:
                if pc in alfa_prices:
                    al_code, al_desc, al_brand, al_cost_c, al_price_c = alfa_prices[pc]
                    new_cost_c = al_cost_c
                    new_price_c = al_price_c
                    if not new_brand and al_brand:
                        new_brand = al_brand
                        stats["brands_filled"] += 1
                    if not new_sup_name:
                        new_sup_name = "Alfa Rodamientos"
                        new_sup_code = al_code
                        stats["suppliers_filled"] += 1
                    stats["zero_prices_fixed"] += 1
                    break

        # Enriquecer con Bramco PDF (medidas Corteco/TRW, aplicaciones y opción de proveedor BRAMCO)
        if candidate_bramco:
            b0 = candidate_bramco[0]
            if not new_brand and b0["brand"]:
                new_brand = b0["brand"]
                stats["brands_filled"] += 1
            if not new_sup_name:
                new_sup_name = "BRAMCO"
                new_sup_code = b0["code"]
                stats["suppliers_filled"] += 1
            if not new_dims and b0.get("dimensions"):
                new_din, new_dout, new_w, new_dims = b0["d"], b0["D"], b0["B"], b0["dimensions"]
                stats["dimensions_filled"] += 1
            if b0.get("application") and b0["application"][:40].upper() not in (new_desc or "").upper():
                new_desc = f"{new_desc} | {b0['application'][:180]}"[:500]
                stats["descriptions_enriched"] += 1
            if new_cost_c > 0 and "BRAMCO" in supplier_id_map:
                bsup = supplier_id_map["BRAMCO"]
                pso_upserts.append((
                    pid, bsup[0], bsup[1], b0["code"][:80], b0["brand"][:80],
                    new_cost_c, bsup[2], bsup[3],
                    1 if (new_sup_name and new_sup_name.upper() == "BRAMCO") else 0,
                    NOW_ISO,
                ))

        if not new_dims:
            ed_in, ed_out, ed_w, ed_str = extract_dims(new_desc)
            if ed_str:
                new_din, new_dout, new_w, new_dims = ed_in, ed_out, ed_w, ed_str
                stats["dimensions_filled"] += 1

        new_vals = (clean_name, new_desc, new_brand, new_price_c, new_cost_c, new_sup_name, new_sup_code, new_dims)
        if new_vals != orig_vals:
            c.execute(
                """UPDATE products
                   SET name = ?, description = ?, brand = ?, price_cents = ?, cost_cents = ?,
                       supplier_name = ?, supplier_code = ?,
                       inner_diameter_mm = ?, outer_diameter_mm = ?, width_mm = ?, dimensions = ?,
                       updated_at = ?
                   WHERE id = ?""",
                (
                    clean_name[:180], (new_desc or clean_name)[:500], new_brand,
                    new_price_c, new_cost_c, new_sup_name, new_sup_code,
                    new_din, new_dout, new_w, new_dims, NOW_ISO, pid,
                ),
            )

    # Paso 5: Agrupar e insertar todos los productos faltantes de los catálogos oficiales
    print("\n--- Consolidando productos nuevos de ICEPAR, ITURRIA, ARCORE, MAGNUM y BRAMCO ---")
    grouped_new = {}  # (brand_or_sup, primary_norm_code) -> list of offers
    for off in offers_list:
        if (off["supplier_name"], off["supplier_code"]) in matched_offer_keys:
            continue
        primary_nc = off["match_codes"][0] if off["match_codes"] else norm_code(off["supplier_code"])
        if not primary_nc:
            continue
        b_key = off["brand"] or off["supplier_name"]
        grouped_new.setdefault((b_key, primary_nc), []).append(off)

    SUP_ABBR = {
        "ICEPAR": "ICE",
        "ITURRIA": "ITU",
        "ARCORE S.A.": "ARC",
        "MAGNUM (Papierttei)": "MAG",
        "BRAMCO": "BRA",
    }

    def make_unique_sku(raw_code, brand_val, sup_val):
        base = re.sub(r"[^A-Z0-9./-]", "", str(raw_code).upper().strip())[:36]
        if not base or base.isdigit():
            pref = re.sub(r"[^A-Z0-9]", "", (brand_val or SUP_ABBR.get(sup_val, "CAT")).upper())[:6]
            base = f"{pref}-{base or 'ITEM'}"
        cand = base
        if cand.upper() not in existing_skus_upper:
            existing_skus_upper.add(cand.upper())
            return cand
        b_tag = re.sub(r"[^A-Z0-9]", "", (brand_val or SUP_ABBR.get(sup_val, "CAT")).upper())[:6]
        cand2 = f"{base}-{b_tag}"[:48]
        if cand2.upper() not in existing_skus_upper:
            existing_skus_upper.add(cand2.upper())
            return cand2
        idx = 2
        while True:
            cand_n = f"{cand2[:43]}-{idx}"
            if cand_n.upper() not in existing_skus_upper:
                existing_skus_upper.add(cand_n.upper())
                return cand_n
            idx += 1

    for (b_key, primary_nc), offs in grouped_new.items():
        # Elegir mejor oferta (menor costo con descripción más completa)
        best = min(offs, key=lambda x: x["cost_cents"])
        richest_desc = max((o["name"] for o in offs if o["name"]), key=len, default=best["name"])
        brand_val = best["brand"]
        sup_val = best["supplier_name"]
        sup_code_val = best["supplier_code"]
        sku_val = make_unique_sku(sup_code_val, brand_val, sup_val)

        # Cruzar con Bramco PDF si el mismo código está en Bramco
        b_hits = [b for b in bramco_by_code.get(primary_nc, []) if not brand_val or b["brand"] == brand_val]
        din, dout, wmm, dim_str = extract_dims(richest_desc)
        if not dim_str and b_hits and b_hits[0].get("dimensions"):
            din, dout, wmm, dim_str = b_hits[0]["d"], b_hits[0]["D"], b_hits[0]["B"], b_hits[0]["dimensions"]
        for bh in b_hits:
            matched_bramco_keys.add((bh["brand"], norm_code(bh["code"])))

        disp_code = sup_code_val.strip()
        if disp_code.upper() in richest_desc.upper()[: len(disp_code) + 4]:
            prod_name = richest_desc[:160]
        else:
            prod_name = f"{disp_code} - {richest_desc}"[:160]
        if brand_val and brand_val.upper() not in prod_name.upper():
            prod_name = f"{prod_name[:140]} - {brand_val}"

        cat_id = get_cat_id(best["category"])
        cur = c.execute(
            """INSERT INTO products (
                 sku, name, description, brand, category_id, unit,
                 price_cents, cost_cents, stock, min_stock, target_stock, active,
                 inner_diameter_mm, outer_diameter_mm, width_mm, dimensions,
                 supplier_name, supplier_code, freight_pct, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, 'unidad', ?, ?, 0, NULL, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                sku_val, prod_name, richest_desc[:500], brand_val, cat_id,
                best["price_cents"], best["cost_cents"],
                din, dout, wmm, dim_str,
                sup_val, sup_code_val[:80], best["freight_pct"], NOW_ISO, NOW_ISO,
            ),
        )
        new_pid = cur.lastrowid
        stats["new_products_inserted"] += 1

        # Registrar TODAS las opciones de proveedor para este producto
        seen_sups_for_prod = set()
        for o in sorted(offs, key=lambda x: x["cost_cents"]):
            s_info = supplier_id_map.get(o["supplier_name"].upper())
            if s_info and s_info[0] not in seen_sups_for_prod:
                seen_sups_for_prod.add(s_info[0])
                pso_upserts.append((
                    new_pid, s_info[0], s_info[1], o["supplier_code"][:80],
                    (o["brand"] or brand_val or "Estándar")[:80],
                    o["cost_cents"], s_info[2], s_info[3],
                    1 if o is best else 0, NOW_ISO,
                ))
        if b_hits and "BRAMCO" in supplier_id_map:
            bsup = supplier_id_map["BRAMCO"]
            if bsup[0] not in seen_sups_for_prod:
                pso_upserts.append((
                    new_pid, bsup[0], bsup[1], b_hits[0]["code"][:80],
                    b_hits[0]["brand"][:80], best["cost_cents"], bsup[2], bsup[3], 0, NOW_ISO,
                ))

    # También agregar a `products` los ítems técnicos exclusivos de BRAMCO que no estaban en listas con precio
    bramco_only_added = 0
    for bit in bramco_tech_items:
        bkey = (bit["brand"], norm_code(bit["code"]))
        if bkey in matched_bramco_keys:
            continue
        sku_val = make_unique_sku(bit["code"], bit["brand"], "BRAMCO")
        cat_id = get_cat_id(bit["category"])
        c.execute(
            """INSERT INTO products (
                 sku, name, description, brand, category_id, unit,
                 price_cents, cost_cents, stock, min_stock, target_stock, active,
                 inner_diameter_mm, outer_diameter_mm, width_mm, dimensions,
                 supplier_name, supplier_code, freight_pct, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, 'unidad', 0, 0, 0, NULL, NULL, 1, ?, ?, ?, ?, 'BRAMCO', ?, 6.0, ?, ?)""",
            (
                sku_val, bit["name"][:160], (bit.get("application") or bit["name"])[:500],
                bit["brand"], cat_id,
                bit["d"], bit["D"], bit["B"], bit["dimensions"],
                bit["code"][:80], NOW_ISO, NOW_ISO,
            ),
        )
        bramco_only_added += 1
        stats["new_products_inserted"] += 1

    print(f"Ítems exclusivos de catálogos técnicos BRAMCO agregados a products: {bramco_only_added}")

    # Paso 6: Guardar todas las opciones multi-proveedor reales en `product_supplier_options`
    print(f"Actualizando {len(pso_upserts)} opciones multi-proveedor reales en product_supplier_options...")
    c.executemany(
        """INSERT INTO product_supplier_options (
             product_id, supplier_id, supplier_name, supplier_code, brand_offered,
             unit_cost_cents, freight_pct, lead_time_days, is_preferred, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(product_id, supplier_id) DO UPDATE SET
             supplier_name = excluded.supplier_name,
             supplier_code = excluded.supplier_code,
             brand_offered = excluded.brand_offered,
             unit_cost_cents = excluded.unit_cost_cents,
             freight_pct = excluded.freight_pct,
             lead_time_days = excluded.lead_time_days,
             updated_at = excluded.updated_at""",
        pso_upserts,
    )
    stats["supplier_options_upserted"] = len(pso_upserts)

    # Paso 7: Actualizar `supplier_catalog_items` (Alfa Rodamientos + Bramco + ítems con calibre/catálogo de Icepar, Iturria, Arcore, Magnum)
    print("Actualizando tabla supplier_catalog_items para buscador técnico y calibre...")
    c.execute("DELETE FROM supplier_catalog_items WHERE supplier_name <> 'Alfa Rodamientos'")

    # Completar precios de Alfa Rodamientos en supplier_catalog_items cuando coincida código
    alfa_cat_rows = c.execute("SELECT id, code FROM supplier_catalog_items WHERE supplier_name = 'Alfa Rodamientos' AND price_cents = 0").fetchall()
    alfa_cat_updates = []
    for acid, acode in alfa_cat_rows:
        anc = norm_code(acode)
        if anc in alfa_prices:
            alfa_cat_updates.append((alfa_prices[anc][4], acid))
    if alfa_cat_updates:
        c.executemany("UPDATE supplier_catalog_items SET price_cents = ? WHERE id = ?", alfa_cat_updates)

    sci_inserts = []
    for bit in bramco_tech_items:
        # Buscar si algún proveedor tiene precio de referencia para ese código
        ref_price = 0
        nc = norm_code(bit["code"])
        if nc in code_to_offers:
            ref_price = min(o["price_cents"] for o in code_to_offers[nc])
        sci_inserts.append((
            "BRAMCO", bit["brand"] or "BRAMCO", bit["category"], bit["code"][:80],
            bit["name"][:200], bit["d"], bit["D"], bit["B"], bit["dimensions"],
            (bit.get("application") or "")[:300] or None, bit.get("original_code"),
            ref_price, NOW_ISO,
        ))

    for off in offers_list:
        din, dout, wmm, dim_str = extract_dims(off["name"])
        sci_inserts.append((
            off["supplier_name"], off["brand"] or off["supplier_name"], off["category"],
            off["supplier_code"][:80], off["name"][:200],
            din, dout, wmm, dim_str,
            off["name"][:300], None, off["price_cents"], NOW_ISO,
        ))

    c.executemany(
        """INSERT INTO supplier_catalog_items (
             supplier_name, brand, category, code, name,
             inner_diameter_mm, outer_diameter_mm, width_mm, dimensions,
             application, original_code, price_cents, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        sci_inserts,
    )

    # Paso 8: Crear índices adicionales de alta velocidad y ejecutar ANALYZE
    c.execute("CREATE INDEX IF NOT EXISTS idx_products_supplier_name ON products(supplier_name COLLATE NOCASE);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_products_supplier_code ON products(supplier_code COLLATE NOCASE);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand COLLATE NOCASE);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_sci_supplier_name ON supplier_catalog_items(supplier_name COLLATE NOCASE);")
    c.execute("ANALYZE;")

    conn.commit()

    print("\n================ RESUMEN FINAL DE SINCRONIZACIÓN ================")
    for k, v in stats.items():
        print(f"  {k}: {v:,}")
    tot_prods = c.execute("SELECT COUNT(*) FROM products WHERE active = 1").fetchone()[0]
    tot_pso = c.execute("SELECT COUNT(*) FROM product_supplier_options").fetchone()[0]
    tot_sci = c.execute("SELECT COUNT(*) FROM supplier_catalog_items").fetchone()[0]
    print(f"  Total productos activos en D1 ahora: {tot_prods:,}")
    print(f"  Total opciones multi-proveedor en D1: {tot_pso:,}")
    print(f"  Total ítems en supplier_catalog_items: {tot_sci:,}")
    print("  Desglose de productos por proveedor principal:")
    for r in c.execute("SELECT COALESCE(supplier_name, '(Sin asignar)'), COUNT(*) FROM products WHERE active=1 GROUP BY supplier_name ORDER BY COUNT(*) DESC").fetchall():
        print(f"    - {r[0]}: {r[1]:,}")
    conn.close()


if __name__ == "__main__":
    main()
