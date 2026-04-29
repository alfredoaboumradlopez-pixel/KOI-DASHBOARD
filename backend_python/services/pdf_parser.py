"""
KOI Dashboard — PDF Invoice & Payment Parser
Soporta: CFDI estándar, KUME Importaciones, comprobantes bancarios, PDFs escaneados (vision).
"""
import base64
import glob
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import pdfplumber

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")


# ─────────────────────────────────────────────────────────────────────────────
# Main parser class
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceParser:

    def parse(self, pdf_path: str) -> dict:
        """Entry point — detecta tipo de documento y despacha al parser correcto."""
        text = self._extract_text(pdf_path)

        if self._is_payment_receipt(text):
            if self._is_garbled(text):
                raw = self._parse_with_vision(pdf_path, mode="comprobante")
            else:
                raw = self._parse_payment_receipt(text, pdf_path)
            return self._normalize(raw, tipo="comprobante_pago")

        if self._is_garbled(text):
            raw = self._parse_with_vision(pdf_path)
            return self._normalize(raw, tipo="vision")

        if self._is_kume(text):
            raw = self._parse_kume(text)
            return self._normalize(raw, tipo="kume")

        raw = self._parse_cfdi(text)
        return self._normalize(raw, tipo="cfdi")

    # ── Text extraction ───────────────────────────────────────────────────────

    def _extract_text(self, pdf_path: str) -> str:
        try:
            with pdfplumber.open(pdf_path) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception:
            return ""

    def _is_garbled(self, text: str) -> bool:
        if not text or len(text) < 50:
            return True
        valid = sum(1 for c in text if c.isalnum() or c in " .,/$%\n-:")
        return (valid / len(text)) < 0.75

    def _is_payment_receipt(self, text: str) -> bool:
        keywords = [
            "transferencia", "comprobante de operación", "cuenta cargo",
            "cuenta abono", "spei", "ejecutado", "importe", "divisa",
            "folio rastreo", "clabe",
        ]
        t = text.lower()
        return sum(1 for k in keywords if k in t) >= 3

    def _is_kume(self, text: str) -> bool:
        return "kume importaciones" in text.lower() or "pedido -" in text.lower()

    # ── KUME parser ───────────────────────────────────────────────────────────

    def _parse_kume(self, text: str) -> dict:
        lines = text.split("\n")

        pedido   = re.search(r"Pedido\s*-\s*(\d+)", text)
        fecha    = re.search(r"Fecha:\s*(\d{2}/\d{2}/\d{4})", text)
        subtotal = re.search(r"SUBTOTAL\s+\$?([\d,]+\.?\d*)", text)
        iva      = re.search(r"IVA\s+[\d.]+%\s+\$?([\d,]+\.?\d*)", text)
        total    = re.search(r"TOTAL\s+\$?([\d,]+\.?\d*)", text)
        desc     = re.search(r"DESCUENTO\s+\$?([\d,]+\.?\d*)", text)

        items = []
        item_pat = re.compile(
            r"^(\d+)\s+([A-Z]{2,6}\d+[A-Z0-9]*)\s*-\s*(.+?)\s+\$?([\d,]+\.?\d+)\s+\$?([\d,]+\.?\d+)\s*$"
        )
        for line in lines:
            m = item_pat.match(line.strip())
            if m:
                items.append({
                    "cantidad": float(m.group(1)),
                    "sku": m.group(2),
                    "descripcion": m.group(3).strip(),
                    "unidad": "PZA",
                    "precio_unitario": float(m.group(4).replace(",", "")),
                    "importe": float(m.group(5).replace(",", "")),
                })

        return {
            "proveedor": "KUME IMPORTACIONES S.A. DE C.V.",
            "rfc_emisor": None,
            "folio": pedido.group(1) if pedido else None,
            "fecha": _fmt_fecha(fecha.group(1)) if fecha else None,
            "items": items,
            "subtotal": float(subtotal.group(1).replace(",", "")) if subtotal else 0,
            "descuento": float(desc.group(1).replace(",", "")) if desc else 0,
            "iva": float(iva.group(1).replace(",", "")) if iva else 0,
            "total": float(total.group(1).replace(",", "")) if total else 0,
            "metodo_pago": "PUE",
            "raw_text": text,
        }

    # ── CFDI estándar ─────────────────────────────────────────────────────────

    def _parse_cfdi(self, text: str) -> dict:
        def dedup(t: str) -> str:
            result, i = [], 0
            while i < len(t):
                if i + 1 < len(t) and t[i] == t[i + 1] and t[i].isalpha():
                    result.append(t[i]); i += 2
                else:
                    result.append(t[i]); i += 1
            return "".join(result)

        clean = dedup(text)

        uuid     = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", clean, re.I)
        rfc      = re.search(r"\b([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\b", clean)
        emisor   = re.search(r"Emisor[:\s]+(.+?)(?:\n|RFC)", clean)
        fecha    = re.search(r"(\d{1,2}/\d{1,2}/\d{4})\s*[-–]\s*\d{2}:\d{2}", clean)
        if not fecha:
            fecha = re.search(r"Fecha[:\s]+(\d{4}-\d{2}-\d{2})", clean)
        folio    = re.search(r"FOLIO[:\s]+([A-Z0-9\-]+)", clean, re.I)
        subtotal = re.search(r"Subtotal[:\s]+\$?([\d,]+\.?\d*)", clean, re.I)
        total    = re.search(r"Total[:\s]+\$?([\d,]+\.?\d*)", clean, re.I)
        iva_m    = re.search(r"IVA\s+\d+%[:\s]+\$?([\d,]+\.?\d*)", clean, re.I)
        iva_t    = re.search(r"IVA\s+(\d+)%", clean, re.I)

        items = []
        item_pat = re.compile(
            r"([\d.]+)\s+(?:KGM|PZA|KG|LT|LTS|PZ|UN)\s*[-–]?\s*(?:Kg|kg|Lt|Pza)?\s+(.+?)\s+\$?([\d,]+\.?\d+)\s+\$?([\d,]+\.?\d+)"
        )
        for m in item_pat.finditer(clean):
            items.append({
                "cantidad": float(m.group(1)),
                "sku": None,
                "descripcion": m.group(2).strip(),
                "unidad": "KG",
                "precio_unitario": float(m.group(3).replace(",", "")),
                "importe": float(m.group(4).replace(",", "")),
            })

        return {
            "proveedor": emisor.group(1).strip() if emisor else None,
            "rfc_emisor": rfc.group(1) if rfc else None,
            "folio": (folio.group(1) if folio else None) or (uuid.group(1) if uuid else None),
            "folio_fiscal": uuid.group(1) if uuid else None,
            "fecha": _fmt_fecha(fecha.group(1)) if fecha else None,
            "items": items,
            "subtotal": float(subtotal.group(1).replace(",", "")) if subtotal else 0,
            "descuento": 0,
            "iva": float(iva_m.group(1).replace(",", "")) if iva_m else 0,
            "iva_tasa": int(iva_t.group(1)) if iva_t else 16,
            "total": float(total.group(1).replace(",", "")) if total else 0,
            "metodo_pago": None,
            "raw_text": text,
        }

    # ── Comprobante bancario ──────────────────────────────────────────────────

    def _parse_payment_receipt(self, text: str, pdf_path: str) -> dict:
        if self._is_garbled(text):
            return self._parse_with_vision(pdf_path, mode="comprobante")

        banco = (
            "SANTANDER" if "santander" in text.lower() else
            "BBVA"      if "bbva"      in text.lower() else
            "BANAMEX"   if "banamex"   in text.lower() else
            "HSBC"      if "hsbc"      in text.lower() else
            "BANORTE"   if "banorte"   in text.lower() else
            "DESCONOCIDO"
        )

        importe     = re.search(r"\$\s*([\d,]+\.?\d*)\s*MXN", text, re.I)
        concepto    = re.search(r"Concepto[:\s]+(.+?)(?:\n|Fecha)", text, re.I)
        fecha       = re.search(r"Fecha\s+aplicaci[oó]n[:\s]+(\d{2}/\d{2}/\d{4})", text, re.I)
        if not fecha:
            fecha   = re.search(r"Fecha[:\s]+(\d{2}/\d{2}/\d{4})", text, re.I)
        referencia  = re.search(r"Referencias del\s+Movimiento[:\s]+(\S+)", text, re.I)
        if not referencia:
            referencia = re.search(r"Referencia[:\s]+(\S+)", text, re.I)
        if not referencia:
            referencia = re.search(r"Folio Rastreo[:\s]+(\S+)", text, re.I)
        cuenta_ori  = re.search(r"Cuenta Cargo[:\s]+([\d*]+)", text, re.I)
        cuenta_dest = re.search(r"Cuenta Abono[:\s]+([\d*]+)", text, re.I)
        beneficiario = re.search(r"Cuenta Abono[:\s]+[\d*]+\s*[-–]\s*(.+?)(?:\n|$)", text, re.I)

        return {
            "banco": banco,
            "monto": float(importe.group(1).replace(",", "")) if importe else 0,
            "concepto": concepto.group(1).strip() if concepto else None,
            "fecha": _fmt_fecha(fecha.group(1)) if fecha else None,
            "referencia": referencia.group(1) if referencia else None,
            "cuenta_origen": cuenta_ori.group(1) if cuenta_ori else None,
            "cuenta_destino": cuenta_dest.group(1) if cuenta_dest else None,
            "beneficiario": beneficiario.group(1).strip() if beneficiario else None,
        }

    # ── Vision fallback (Claude) ──────────────────────────────────────────────

    def _parse_with_vision(self, pdf_path: str, mode: str = "factura") -> dict:
        if not ANTHROPIC_API_KEY:
            return {"error": "ANTHROPIC_API_KEY no configurada"}

        with tempfile.TemporaryDirectory() as tmpdir:
            out_prefix = f"{tmpdir}/page"
            try:
                subprocess.run(
                    ["pdftoppm", "-jpeg", "-r", "150", "-f", "1", "-l", "1", pdf_path, out_prefix],
                    check=True, capture_output=True, timeout=30
                )
            except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                return {"error": "pdftoppm no disponible o falló la conversión"}

            imgs = sorted(glob.glob(f"{out_prefix}*.jpg"))
            if not imgs:
                return {"error": "No se pudo convertir el PDF a imagen"}

            with open(imgs[0], "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode()

        if mode == "comprobante":
            prompt = (
                'Extrae los datos de este comprobante de pago bancario y responde SOLO con JSON válido, sin markdown:\n'
                '{"banco":"","monto":0.00,"concepto":"","fecha":"YYYY-MM-DD",'
                '"referencia":"","cuenta_origen":"","cuenta_destino":"","beneficiario":""}'
            )
        else:
            prompt = (
                'Extrae los datos de esta factura/nota de compra y responde SOLO con JSON válido, sin markdown:\n'
                '{"proveedor":"","rfc_emisor":null,"folio":"","folio_fiscal":null,"fecha":"YYYY-MM-DD",'
                '"items":[{"descripcion":"","cantidad":0.0,"unidad":"PZA","precio_unitario":0.00,"importe":0.00}],'
                '"subtotal":0.00,"descuento":0.00,"iva":0.00,"iva_tasa":16,"total":0.00,"metodo_pago":null}'
            )

        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-opus-4-5",
                    "max_tokens": 2000,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img_b64}},
                            {"type": "text", "text": prompt},
                        ],
                    }],
                },
                timeout=45,
            )
            raw_text = resp.json()["content"][0]["text"]
            clean = re.sub(r"```json|```", "", raw_text).strip()
            return json.loads(clean)
        except Exception as e:
            return {"error": f"Vision parse falló: {e}"}

    # ── Normalize ─────────────────────────────────────────────────────────────

    def _normalize(self, raw: dict, tipo: str) -> dict:
        if tipo == "comprobante_pago":
            return {"tipo_parser": "comprobante_pago", **raw}

        all_desc = " ".join(
            (i.get("descripcion") or "") for i in raw.get("items", [])
        ).lower()
        categoria = _suggest_category(all_desc or (raw.get("proveedor") or "").lower())

        return {
            "tipo_parser": tipo,
            "proveedor": raw.get("proveedor"),
            "rfc_emisor": raw.get("rfc_emisor"),
            "folio": raw.get("folio"),
            "folio_fiscal": raw.get("folio_fiscal"),
            "fecha": raw.get("fecha"),
            "items": raw.get("items", []),
            "subtotal": raw.get("subtotal", 0),
            "descuento": raw.get("descuento", 0),
            "iva": raw.get("iva", 0),
            "iva_tasa": raw.get("iva_tasa", 16),
            "total": raw.get("total", 0),
            "metodo_pago": raw.get("metodo_pago"),
            "categoria_sugerida": categoria,
            "raw_text": raw.get("raw_text"),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Match payment ↔ invoice
# ─────────────────────────────────────────────────────────────────────────────

def match_payment_to_invoice(
    comprobante: dict,
    facturas: list,
    tolerance_pesos: float = 1.0,
) -> dict | None:
    """
    Intenta hacer match entre un comprobante de pago y facturas existentes.
    Estrategia:
    1. Monto ±1 peso + folio en concepto  → confidence alta
    2. Monto ±1 peso + proveedor en beneficiario → confidence media
    3. Monto ±1 peso solo                 → confidence baja
    """
    monto_comp   = comprobante.get("monto", 0)
    concepto     = (comprobante.get("concepto") or "").upper()
    beneficiario = (comprobante.get("beneficiario") or "").upper()
    fecha_str    = comprobante.get("fecha")
    fecha_comp   = None
    if fecha_str:
        try:
            fecha_comp = datetime.strptime(fecha_str, "%Y-%m-%d")
        except ValueError:
            pass

    candidates = []
    for factura in facturas:
        total_fac = float(factura.get("monto") or factura.get("total") or 0)
        if abs(total_fac - monto_comp) > tolerance_pesos:
            continue

        score = 0
        folio = str(factura.get("folio") or "")
        if folio and folio in concepto:
            score += 100

        proveedor = (factura.get("proveedor") or "").upper()
        if beneficiario and any(
            word in beneficiario for word in proveedor.split() if len(word) > 3
        ):
            score += 50

        fecha_fac_str = factura.get("fecha_factura") or factura.get("fecha")
        if fecha_comp and fecha_fac_str:
            try:
                fecha_fac = datetime.strptime(str(fecha_fac_str), "%Y-%m-%d")
                diff = abs((fecha_comp - fecha_fac).days)
                score += 30 if diff <= 1 else 15 if diff <= 7 else 5 if diff <= 30 else 0
            except ValueError:
                pass

        candidates.append({"factura": factura, "score": score})

    if not candidates:
        return None

    candidates.sort(key=lambda x: x["score"], reverse=True)
    best = candidates[0]
    return {
        "factura": best["factura"],
        "score": best["score"],
        "confidence": "alta" if best["score"] >= 100 else "media" if best["score"] >= 50 else "baja",
        "match_reason": (
            "folio en concepto + monto" if best["score"] >= 100 else
            "proveedor + monto"         if best["score"] >= 50  else
            "solo monto"
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_fecha(s: str) -> str | None:
    if not s:
        return None
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    if re.match(r"\d{4}-\d{2}-\d{2}", s):
        return s
    return s


def _suggest_category(desc: str) -> str:
    rules = [
        (["soya", "mirin", "nori", "yuzu", "edamame", "wakame", "ramune",
          "sapporo", "sake", "miso", "dashi", "wasabi", "shirakiku",
          "kikkoman", "mizkan", "tempurako", "chuka", "kume"], "PRODUCTOS ASIATICOS"),
        (["salmon", "atun", "kanikama", "new york", "ribeye", "carne", "pollo",
          "res", "cerdo", "proteina", "pesca", "camaron", "pulpo", "mariscos",
          "filete"], "PROTEINA"),
        (["vegetale", "fruta", "verdura", "jitomate", "cebolla", "lechuga",
          "aguacate", "limon", "naranja", "cilantro", "pepino", "zanahoria"], "VEGETALES FRUTAS"),
        (["arroz", "harina", "sal", "vinagre", "aceite", "azucar",
          "pasta", "frijol", "abarrotes"], "ABARROTES"),
        (["cerveza", "vino", "bebida", "refresco", "agua", "jugo",
          "licor", "mezcal", "tequila", "whisky", "bebidas"], "BEBIDAS"),
        (["limpieza", "detergente", "desinfectante", "jabon", "cloro",
          "quimico", "mantenimiento", "mop", "escoba"], "LIMPIEZA MANTTO"),
        (["desechable", "palillo", "empaque", "caja", "bolsa", "servilleta",
          "plastico", "aluminio", "contenedor"], "DESECHABLES EMPAQUES"),
        (["gas", "luz", "electricidad", "agua potable", "internet",
          "telefono", "renta", "servicio"], "SERVICIOS"),
        (["papeleria", "papel", "pluma", "toner", "impresion"], "PAPELERIA"),
        (["nomina", "sueldo", "salario", "empleado"], "NOMINA"),
        (["impuesto", "sat", "isr", "iva declaracion"], "IMPUESTOS"),
    ]
    for keywords, cat in rules:
        if any(k in desc for k in keywords):
            return cat
    return "OTROS"
