import pdfplumber
import re
from datetime import date

PROVEEDOR_MAP = {
    "BUENA TIERRA": {"nombre": "LA BUENA TIERRA", "categoria": "VEGETALES_FRUTAS", "metodo": "EFECTIVO"},
    "CESAR HUMBERTO CARRANZA": {"nombre": "LA BUENA TIERRA", "categoria": "VEGETALES_FRUTAS", "metodo": "EFECTIVO"},
    "COMERCIAL TOYO": {"nombre": "TOYO", "categoria": "PRODUCTOS_ASIATICOS", "metodo": "TRANSFERENCIA"},
    "TOYO": {"nombre": "TOYO", "categoria": "PRODUCTOS_ASIATICOS", "metodo": "TRANSFERENCIA"},
    "EL NAVEGANTE": {"nombre": "EL NAVEGANTE", "categoria": "PROTEINA", "metodo": "TRANSFERENCIA"},
    "MARIA ISABEL HERNANDEZ": {"nombre": "EL NAVEGANTE", "categoria": "PROTEINA", "metodo": "TRANSFERENCIA"},
    "VACA NEGRA": {"nombre": "VACA NEGRA", "categoria": "PROTEINA", "metodo": "TRANSFERENCIA"},
    "ALIMENTOS Y CARNES VACA NEGRA": {"nombre": "VACA NEGRA", "categoria": "PROTEINA", "metodo": "TRANSFERENCIA"},
    "KUME": {"nombre": "KUME", "categoria": "PRODUCTOS_ASIATICOS", "metodo": "TRANSFERENCIA"},
    "KUME IMPORTACIONES": {"nombre": "KUME", "categoria": "PRODUCTOS_ASIATICOS", "metodo": "TRANSFERENCIA"},
}

def detect_proveedor(text):
    text_upper = text.upper()
    for key, info in PROVEEDOR_MAP.items():
        if key.upper() in text_upper:
            return info
    return None

def extract_total(text):
    """Busca el total en el texto de la factura"""
    patterns = [
        r"TOTAL[:\s]*\$?\s*([\d,]+\.\d{2})",
        r"Total[:\s]*\$?\s*([\d,]+\.\d{2})",
        r"TOTAL\s+\$([\d,]+\.\d{2})",
        r"Total:\s*([\d,]+\.\d{2})\s*MXN",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            val = m.group(1).replace(",", "")
            return float(val)
    return None

def extract_fecha(text):
    """Busca la fecha en varios formatos"""
    patterns = [
        r"(\d{4}-\d{2}-\d{2})",
        r"(\d{1,2}/\d{1,2}/\d{4})",
        r"Fecha[:\s]*([\d]{1,2}/[\d]{1,2}/[\d]{4})",
        r"Fecha[:\s]*(\d{4}-\d{2}-\d{2})",
        r"(\d{2}/\d{2}/\d{4})",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            d = m.group(1)
            if "-" in d:
                return d
            parts = d.split("/")
            if len(parts) == 3:
                if len(parts[2]) == 4:
                    return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
    return None

def extract_items(text):
    """Extrae items/conceptos de la factura"""
    lines = text.split("\n")
    items = []
    for line in lines:
        # Buscar lineas que tengan cantidad + descripcion + monto
        m = re.match(r"\s*[\d.]+\s+(?:KGM?|KG|H87|Pieza|PZA|L|\w+)\s+(.+?)\s+\$?([\d,]+\.\d{2})\s*$", line)
        if m:
            items.append({"desc": m.group(1).strip(), "monto": m.group(2)})
    return items

def parse_factura_pdf(file_bytes):
    """Parsea un PDF de factura y extrae datos"""
    result = {
        "proveedor": None,
        "categoria": None,
        "metodo_pago": "TRANSFERENCIA",
        "fecha": None,
        "total": None,
        "descripcion": None,
        "items": [],
        "comprobante": "FACTURA",
        "confianza": 0.0,
    }
    
    try:
        import io
        pdf = pdfplumber.open(io.BytesIO(file_bytes))
        full_text = ""
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                full_text += t + "\n"
            # Tambien extraer tablas
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row:
                        full_text += " ".join([str(c) for c in row if c]) + "\n"
        pdf.close()
        
        if not full_text.strip():
            return result
        
        # Detectar proveedor
        prov_info = detect_proveedor(full_text)
        if prov_info:
            result["proveedor"] = prov_info["nombre"]
            result["categoria"] = prov_info["categoria"]
            result["metodo_pago"] = prov_info["metodo"]
            result["confianza"] = 0.9
        
        # Extraer fecha
        fecha = extract_fecha(full_text)
        if fecha:
            result["fecha"] = fecha
        
        # Extraer total
        total = extract_total(full_text)
        if total:
            result["total"] = total
        
        # Extraer descripcion de items
        items = extract_items(full_text)
        if items:
            result["items"] = items
            result["descripcion"] = ", ".join([i["desc"] for i in items[:5]])
        elif prov_info:
            # Buscar descripcion generica en el texto
            lines = [l.strip() for l in full_text.split("\n") if len(l.strip()) > 10]
            desc_candidates = [l for l in lines if any(kw in l.upper() for kw in ["SALMON","CARNE","NEW YORK","ATUN","CAMARON","SAKE","MIRIN","NARANJA","AGUACATE","LIMON","PEPINO"])]
            if desc_candidates:
                result["descripcion"] = "; ".join(desc_candidates[:3])
        
        return result
        
    except Exception as e:
        result["error"] = str(e)
        return result
