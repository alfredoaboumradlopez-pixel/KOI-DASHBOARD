"""
auto_categorizar_gastos.py
==========================
Categoriza automáticamente todos los gastos históricos de un restaurante
asignando catalogo_cuenta_id basado en el texto de la columna `categoria`.

Uso:
  DATABASE_URL="postgresql://..." python3 scripts/auto_categorizar_gastos.py [restaurante_id]

Predeterminado: restaurante_id = 6 (KOI)

Idempotente: solo actualiza registros donde catalogo_cuenta_id IS NULL.
Nunca borra datos. Usa transacción — si algo falla, rollback completo.
"""

import os
import sys
import unicodedata

import psycopg2
from psycopg2.extras import execute_values

# ── Configuración ─────────────────────────────────────────────────────────────

RESTAURANTE_ID = int(sys.argv[1]) if len(sys.argv) > 1 else 6

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: Falta variable de entorno DATABASE_URL")
    sys.exit(1)

# Mapeo texto → codigo de cuenta (códigos del catálogo de KOI)
# Se aplica substring match (no exact): si el KEY está CONTENIDO en la categoría → match
# Orden importa: más específicos primero para evitar falsos positivos
MAPEO_CATEGORIAS: dict[str, str] = {
    # Costo alimentos (5001)
    "materia prima":    "5001",
    "insumos":          "5001",
    "alimentos":        "5001",
    "ingredientes":     "5001",
    "cocina":           "5001",
    "mercado":          "5001",
    "carnes":           "5001",
    "verduras":         "5001",
    "frutas":           "5001",
    "mariscos":         "5001",
    "pescado":          "5001",
    "lacteos":          "5001",
    "panaderia":        "5001",
    "tortillas":        "5001",
    "abarrotes":        "5001",
    "proteina":         "5001",
    "salmon":           "5001",
    "atun":             "5001",
    "vegetales":        "5001",
    "productos asiaticos": "5001",
    "productos_asiaticos": "5001",
    "vegetales_frutas": "5001",
    "comida":           "5001",

    # Costo bebidas (5002)
    "bebidas":          "5002",
    "licores":          "5002",
    "vinos":            "5002",
    "cervezas":         "5002",
    "refrescos":        "5002",
    "aguas":            "5002",

    # Nómina (6001)
    "nomina":           "6001",
    "nomina":           "6001",
    "salarios":         "6001",
    "sueldos":          "6001",
    "personal":         "6001",
    "empleados":        "6001",

    # Renta (6002)
    "arrendamiento":    "6002",
    "renta":            "6002",

    # Servicios (6003)
    "electricidad":     "6003",
    "telmex":           "6003",
    "internet":         "6003",
    "telefono":         "6003",
    "servicios":        "6003",
    "cfe":              "6003",
    "luz":              "6003",
    "gas":              "6003",
    "agua":             "6003",

    # Mantenimiento (6004)
    "reparacion":       "6004",
    "reparacion":       "6004",
    "plomero":          "6004",
    "electricista":     "6004",
    "herramientas":     "6004",
    "mantenimiento":    "6004",

    # Limpieza (6005)
    "limpieza_mantto":  "6005",
    "detergente":       "6005",
    "desinfectante":    "6005",
    "escobas":          "6005",
    "trapeadores":      "6005",
    "limpieza":         "6005",

    # Comida personal (6006)
    "comida personal":  "6006",
    "personal food":    "6006",

    # Marketing (6007)
    "publicidad":       "6007",
    "redes sociales":   "6007",
    "fotografia":       "6007",
    "marketing":        "6007",

    # Otros gastos — default (6008)
    "desechables_empaques": "6008",
    "desechables empaques": "6008",
    "desechables":      "6008",
    "empaques":         "6008",
    "propinas":         "6008",
    "papeleria":        "6008",
    "papeleria":        "6008",
    "software":         "6008",
    "comisiones bancarias": "6008",
    "utensilios":       "6008",
    "equipo":           "6008",
    "miscelaneos":      "6008",
    "miscelaneos":      "6008",
    "varios":           "6008",
    "otros":            "6008",
}


def normalizar(texto: str) -> str:
    """Lowercase, sin acentos, quita guiones → underscores."""
    if not texto:
        return ""
    # Quitar acentos
    nfkd = unicodedata.normalize("NFKD", texto)
    sin_acentos = "".join(c for c in nfkd if not unicodedata.combining(c))
    return sin_acentos.lower().strip().replace("-", "_")


def buscar_codigo(categoria: str | None) -> tuple[str, bool]:
    """
    Retorna (codigo, es_match_exacto).
    Si no hay match → ("6008", False) = Otros gastos.
    """
    if not categoria:
        return ("6008", False)

    texto = normalizar(categoria)

    # Primero buscar match exacto
    if texto in MAPEO_CATEGORIAS:
        return (MAPEO_CATEGORIAS[texto], True)

    # Luego substring: ¿el key está CONTENIDO en el texto?
    for key, codigo in MAPEO_CATEGORIAS.items():
        if key in texto:
            return (codigo, True)

    # Sin match → Otros gastos
    return ("6008", False)


def run():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 1. Resolver catalogo_cuenta_id por codigo para este restaurante
        cur.execute(
            "SELECT codigo, id FROM catalogo_cuentas WHERE restaurante_id = %s",
            (RESTAURANTE_ID,)
        )
        codigo_a_id: dict[str, int] = {row[0]: row[1] for row in cur.fetchall()}

        if not codigo_a_id:
            print(f"ERROR: No hay catálogo de cuentas para restaurante_id={RESTAURANTE_ID}")
            conn.rollback()
            return

        print(f"Catálogo cargado: {len(codigo_a_id)} cuentas para restaurante_id={RESTAURANTE_ID}")
        for cod, cid in sorted(codigo_a_id.items()):
            print(f"  {cod} → id={cid}")

        id_otros = codigo_a_id.get("6008")
        if not id_otros:
            print("WARNING: No se encontró cuenta 6008 (Otros gastos). Usando None para no-match.")

        # ── Tabla: gastos ──────────────────────────────────────────────────
        cur.execute(
            "SELECT id, categoria, monto FROM gastos WHERE restaurante_id = %s AND catalogo_cuenta_id IS NULL",
            (RESTAURANTE_ID,)
        )
        gastos_rows = cur.fetchall()

        gastos_updates: list[tuple[int, int]] = []  # (catalogo_cuenta_id, gasto_id)
        gastos_otros = 0
        gastos_match = 0
        gastos_por_codigo: dict[str, list[float]] = {}

        for gasto_id, categoria, monto in gastos_rows:
            codigo, es_match = buscar_codigo(categoria)
            cat_id = codigo_a_id.get(codigo, id_otros)
            if cat_id:
                gastos_updates.append((cat_id, gasto_id))
                if es_match and codigo != "6008":
                    gastos_match += 1
                else:
                    gastos_otros += 1
                gastos_por_codigo.setdefault(codigo, []).append(float(monto or 0))

        if gastos_updates:
            execute_values(
                cur,
                "UPDATE gastos SET catalogo_cuenta_id = data.cat_id FROM (VALUES %s) AS data(cat_id, id) WHERE gastos.id = data.id",
                gastos_updates
            )

        # ── Tabla: gastos_diarios ──────────────────────────────────────────
        # Buscar gastos_diarios ligados a cierres de este restaurante
        cur.execute(
            """
            SELECT gd.id, gd.categoria, gd.monto
            FROM gastos_diarios gd
            JOIN cierres_turno ct ON ct.id = gd.cierre_id
            WHERE ct.restaurante_id = %s AND gd.catalogo_cuenta_id IS NULL
            """,
            (RESTAURANTE_ID,)
        )
        gd_rows = cur.fetchall()

        gd_updates: list[tuple[int, int]] = []
        gd_otros = 0
        gd_match = 0
        gd_por_codigo: dict[str, list[float]] = {}

        for gd_id, categoria, monto in gd_rows:
            codigo, es_match = buscar_codigo(categoria)
            cat_id = codigo_a_id.get(codigo, id_otros)
            if cat_id:
                gd_updates.append((cat_id, gd_id))
                if es_match and codigo != "6008":
                    gd_match += 1
                else:
                    gd_otros += 1
                gd_por_codigo.setdefault(codigo, []).append(float(monto or 0))

        if gd_updates:
            execute_values(
                cur,
                "UPDATE gastos_diarios SET catalogo_cuenta_id = data.cat_id FROM (VALUES %s) AS data(cat_id, id) WHERE gastos_diarios.id = data.id",
                gd_updates
            )

        conn.commit()

        # ── Reporte ────────────────────────────────────────────────────────
        print()
        print("=" * 50)
        print("=== AUTO-CATEGORIZACIÓN COMPLETADA ===")
        print("=" * 50)
        print(f"gastos tabla:        {len(gastos_updates):>4} procesados  "
              f"({gastos_match} con match, {gastos_otros} asignados a 'otros')")
        print(f"gastos_diarios tabla:{len(gd_updates):>4} procesados  "
              f"({gd_match} con match, {gd_otros} asignados a 'otros')")
        total = len(gastos_updates) + len(gd_updates)
        total_match = gastos_match + gd_match
        total_otros = gastos_otros + gd_otros
        print(f"Total: {total_match}/{total} categorizados con match")
        print(f"       {total_otros}/{total} asignados a 'otros' (requieren revisión manual)")

        # Mapa nombre de cuenta para reporte legible
        cur.execute(
            "SELECT codigo, nombre FROM catalogo_cuentas WHERE restaurante_id = %s",
            (RESTAURANTE_ID,)
        )
        nombre_por_codigo = {row[0]: row[1] for row in cur.fetchall()}

        # Combinar ambas tablas por código
        combined: dict[str, tuple[int, float]] = {}
        for tabla_dict in [gastos_por_codigo, gd_por_codigo]:
            for codigo, montos in tabla_dict.items():
                prev_count, prev_sum = combined.get(codigo, (0, 0.0))
                combined[codigo] = (prev_count + len(montos), prev_sum + sum(montos))

        print()
        print("Por categoría:")
        for codigo in sorted(combined.keys()):
            count, total_monto = combined[codigo]
            nombre = nombre_por_codigo.get(codigo, codigo)
            print(f"  {codigo} {nombre:<22}: {count:>4} registros  ${total_monto:>12,.2f}")

        # Verificar que quedaron 0 sin categorizar
        cur.execute(
            "SELECT COUNT(*) FROM gastos WHERE restaurante_id=%s AND catalogo_cuenta_id IS NULL",
            (RESTAURANTE_ID,)
        )
        restantes_g = cur.fetchone()[0]
        cur.execute(
            """
            SELECT COUNT(*) FROM gastos_diarios gd
            JOIN cierres_turno ct ON ct.id = gd.cierre_id
            WHERE ct.restaurante_id=%s AND gd.catalogo_cuenta_id IS NULL
            """,
            (RESTAURANTE_ID,)
        )
        restantes_gd = cur.fetchone()[0]
        print()
        print(f"Verificación post-update:")
        print(f"  gastos sin catalogo_cuenta_id:         {restantes_g}")
        print(f"  gastos_diarios sin catalogo_cuenta_id: {restantes_gd}")

        # ── Detectar categorías que fueron a 'otros' para revisión ────────
        cur.execute(
            """
            SELECT g.categoria, COUNT(*) as cnt, SUM(g.monto) as total
            FROM gastos g
            JOIN catalogo_cuentas cc ON cc.id = g.catalogo_cuenta_id
            WHERE g.restaurante_id = %s AND cc.codigo = '6008'
            GROUP BY g.categoria
            ORDER BY SUM(g.monto) DESC
            """,
            (RESTAURANTE_ID,)
        )
        en_otros = cur.fetchall()
        if en_otros:
            print()
            print("⚠️  Categorías asignadas a 'Otros gastos' (revisar si necesitan cuenta propia):")
            for cat, cnt, tot in en_otros:
                print(f"  {cat:<25}: {cnt:>3} registros  ${float(tot):>10,.2f}")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR — rollback completo: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    run()
