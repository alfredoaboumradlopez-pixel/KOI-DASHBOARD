"""
Módulo Costeo + Ingeniería de Menú
Endpoints para catálogo de insumos, platillos y análisis de menú.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import List, Optional
from datetime import datetime

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/costeo", tags=["costeo"])

# ── Seed data ────────────────────────────────────────────────────────────────

_INSUMOS_SEED = [
    # (numero, categoria, nombre, unidad, precio_unitario, precio_por_g_ml, porcentaje_merma, costo_real)
    (1,  "PROTEÍNA",           "ATUN ALETA AMARILLA LOMO",  "KG",  580.0,    0.58,     0.30, 0.754),
    (2,  "PROTEÍNA",           "SALMON LOMO CON PIEL",       "KG",  440.0,    0.44,     0.30, 0.572),
    (3,  "PROTEÍNA",           "KAMPACHI ENTERO",             "KG",  390.0,    0.39,     0.50, 0.585),
    (4,  "PROTEÍNA",           "CAMARON",                     "KG",  300.0,    0.30,     0.30, 0.390),
    (6,  "PROTEÍNA",           "KANIKAMA OSAKI",              "KG",  450.0,    0.45,     0.30, 0.585),
    (7,  "PROTEÍNA",           "NEW YORK CHOICE SIN HUESO",  "KG",  600.0,    0.60,     0.30, 0.780),
    (8,  "PROTEÍNA",           "HUEVO",                       "PZ",  3.20,     0.0,      0.0,  3.20),
    (9,  "VEGETALES Y FRUTAS", "AGUACATE",                    "KG",  70.0,     0.07,     0.30, 0.091),
    (10, "VEGETALES Y FRUTAS", "PEPINO EUROPEO",              "KG",  45.0,     0.045,    0.30, 0.0585),
    (11, "VEGETALES Y FRUTAS", "LIMON SIN SEMILLA",           "KG",  28.0,     0.028,    0.30, 0.0364),
    (12, "VEGETALES Y FRUTAS", "CEBOLLA BLANCA",              "KG",  32.0,     0.032,    0.30, 0.0416),
    (13, "VEGETALES Y FRUTAS", "AJO MACHO",                   "KG",  450.0,    0.45,     0.30, 0.585),
    (14, "VEGETALES Y FRUTAS", "CEBOLLÍN",                    "KG",  290.0,    0.29,     0.30, 0.377),
    (15, "VEGETALES Y FRUTAS", "ZANAHORIA",                   "KG",  22.0,     0.022,    0.30, 0.0286),
    (20, "VEGETALES Y FRUTAS", "MANZANA VERDE",               "KG",  95.0,     0.095,    0.30, 0.1235),
    (21, "VEGETALES Y FRUTAS", "CHILE SERRANO",               "KG",  48.0,     0.048,    0.30, 0.0624),
    (22, "VEGETALES Y FRUTAS", "LECHUGA",                     "KG",  38.0,     0.038,    0.30, 0.0494),
    (24, "PRODUCTOS ASIÁTICOS","ARROZ TSURUMAI",              "KG",  37.73,    0.03773,  0.30, 0.04905),
    (25, "PRODUCTOS ASIÁTICOS","EDAMAME SIN VAINA",           "KG",  127.5,    0.1275,   0.30, 0.16575),
    (26, "PRODUCTOS ASIÁTICOS","EDAMAME CON VAINA",           "KG",  105.0,    0.105,    0.30, 0.1365),
    (28, "PRODUCTOS ASIÁTICOS","BUBU ARARE",                  "KG",  1380.0,   1.38,     0.0,  1.38),
    (29, "PRODUCTOS ASIÁTICOS","CHILI GARLIC",                "KG",  383.15,   0.38315,  0.0,  0.38315),
    (30, "PRODUCTOS ASIÁTICOS","GARY BLANCO",                 "KG",  134.66,   0.13466,  0.0,  0.13466),
    (31, "PRODUCTOS ASIÁTICOS","CHUKA SARADA WAKAME",         "KG",  217.0,    0.217,    0.0,  0.217),
    (32, "PRODUCTOS ASIÁTICOS","SRIRACHA",                    "KG",  116.53,   0.11653,  0.0,  0.11653),
    (33, "PRODUCTOS ASIÁTICOS","SICHIMI TOGARASHI",           "KG",  608.0,    0.608,    0.0,  0.608),
    (34, "PRODUCTOS ASIÁTICOS","WASABI",                      "KG",  563.70,   0.5637,   0.0,  0.5637),
    (35, "PRODUCTOS ASIÁTICOS","YUZU KOSHO",                  "KG",  1421.0,   1.421,    0.0,  1.421),
    (36, "PRODUCTOS ASIÁTICOS","PANKO KOKUSAN",               "KG",  62.22,    0.06222,  0.0,  0.06222),
    (37, "PRODUCTOS ASIÁTICOS","TEMPURAKO",                   "KG",  83.40,    0.0834,   0.0,  0.0834),
    (38, "PRODUCTOS ASIÁTICOS","TOBIKO",                      "KG",  900.0,    0.90,     0.0,  0.90),
    (40, "PRODUCTOS ASIÁTICOS","MASAGO",                      "KG",  415.0,    0.415,    0.0,  0.415),
    (41, "PRODUCTOS ASIÁTICOS","NORI DIAMOND KOASA",          "PZ",  4.45,     0.0,      0.0,  4.45),
    (42, "PRODUCTOS ASIÁTICOS","MAMENORI",                    "PZ",  18.54,    0.0,      0.0,  18.54),
    (43, "PRODUCTOS ASIÁTICOS","PONZU MIZKAN CITRUS",         "LT",  162.60,   0.1626,   0.0,  0.1626),
    (44, "PRODUCTOS ASIÁTICOS","MIRIN KOKUSAN",               "LT",  83.0,     0.083,    0.0,  0.083),
    (46, "PRODUCTOS ASIÁTICOS","YUZU",                        "LT",  1086.11,  1.08611,  0.0,  1.08611),
    (47, "PRODUCTOS ASIÁTICOS","SOYA KIKKOMAN",               "LT",  58.20,    0.0582,   0.0,  0.0582),
    (49, "ABARROTES",          "SAL MALDON",                  "KG",  1296.0,   1.296,    0.0,  1.296),
    (50, "ABARROTES",          "AZUCAR GOLDEN HILLS",         "KG",  39.90,    0.0399,   0.0,  0.0399),
    (51, "ABARROTES",          "MANTEQUILLA",                 "KG",  137.15,   0.13715,  0.0,  0.13715),
    (52, "ABARROTES",          "CHIPOTLE",                    "KG",  135.59,   0.13559,  0.0,  0.13559),
    (53, "ABARROTES",          "MAYONESA",                    "KG",  85.20,    0.0852,   0.0,  0.0852),
    (54, "ABARROTES",          "SALSA A-1",                   "KG",  342.76,   0.34276,  0.0,  0.34276),
    (55, "ABARROTES",          "SAL FINA",                    "KG",  28.0,     0.028,    0.0,  0.028),
    (56, "ABARROTES",          "HARINA",                      "KG",  71.24,    0.07124,  0.0,  0.07124),
    (57, "ABARROTES",          "AJONJOLÍ",                    "KG",  140.90,   0.1409,   0.0,  0.1409),
    (58, "ABARROTES",          "QUESO PHILADELPHIA",          "KG",  267.50,   0.2675,   0.0,  0.2675),
    (59, "ABARROTES",          "ACEITE DE TRUFA",             "LT",  250.0,    0.25,     0.0,  0.25),
    (61, "ABARROTES",          "CATSUP",                      "LT",  108.64,   0.10864,  0.0,  0.10864),
    (62, "ABARROTES",          "ACEITE VEGETAL",              "LT",  30.84,    0.03084,  0.0,  0.03084),
    (63, "ABARROTES",          "QUESO MOZARELLA",             "LT",  327.0,    0.327,    0.0,  0.327),
    (64, "ABARROTES",          "MOSTAZA HEINZ",               "KG",  154.89,   0.15489,  0.0,  0.15489),
    (65, "BEBIDAS",            "SAKE PARA COCINAR",           "LT",  216.11,   0.21611,  0.0,  0.21611),
    (66, "BEBIDAS",            "LECHE",                       "LT",  23.0,     0.023,    0.0,  0.023),
]

_PLATILLOS_SEED = [
    # (numero, nombre, categoria, costo_receta, markup, precio_venta, precio_venta_con_iva, margen_pesos, margen_pct)
    (1,  "SASHIMI SALMÓN",           "SASHIMIS",       32.75, 3.0, 135.0, 156.60, 86.54, 0.641),
    (2,  "SASHIMI ATÚN",             "SASHIMIS",       41.85, 3.0, 135.0, 156.60, 73.07, 0.541),
    (3,  "SASHIMI KAMPACHI",         "SASHIMIS",       33.62, 3.0, 240.0, 278.40, 190.25, 0.793),
    (4,  "SASHIMI MIXTO",            "SASHIMIS",       42.59, 3.0, 270.0, 313.20, 206.97, 0.767),
    (5,  "TIRADITO DE SALMÓN",       "TIRADITOS",      37.19, 3.0, 155.0, 179.80, 99.96,  0.645),
    (6,  "TIRADITO DE ATÚN",         "TIRADITOS",      49.55, 3.0, 175.0, 203.00, 101.67, 0.581),
    (7,  "TIRADITO DE KAMPACHI",     "TIRADITOS",      41.10, 3.0, 240.0, 278.40, 179.17, 0.747),
    (8,  "NIGIRIS DE SALMÓN 2PZ",    "NIGIRIS",        15.69, 3.0, 95.0,  110.20, 71.77,  0.756),
    (9,  "NIGIRIS DE ATÚN 2PZ",      "NIGIRIS",        21.78, 3.0, 110.0, 127.60, 77.76,  0.707),
    (10, "NIGIRIS DE KAMPACHI 2PZ",  "NIGIRIS",        21.86, 3.0, 110.0, 127.60, 77.76,  0.707),
    (11, "NIGIRIS DE RIBEYE 2PZ",    "NIGIRIS",        27.01, 3.0, 130.0, 150.80, 97.65,  0.751),
    (12, "PLATO 3PZ NIGIRIS MIXTO",  "NIGIRIS",        29.67, 3.0, 190.0, 220.40, 146.09, 0.769),
    (13, "PLATO 6PZ NIGIRIS MIXTO",  "NIGIRIS",        59.34, 3.0, 350.0, 406.00, 262.18, 0.749),
    (14, "PLATO 9PZ NIGIRIS MIXTO",  "NIGIRIS",        89.01, 3.0, 495.0, 574.20, 363.27, 0.734),
    (15, "SEAWEED SALAD",            "OTRAS ENTRADAS", 28.66, 3.0, 90.0,  104.40, 56.90,  0.554),
    (16, "EDAMAMES AL VAPOR",        "OTRAS ENTRADAS", 17.68, 3.0, 70.0,  81.20,  43.84,  0.626),
    (17, "KUSHIAGUES DE QUESO",      "OTRAS ENTRADAS", 22.36, 3.0, 90.0,  104.40, 56.90,  0.632),
    (18, "CAMARONES ROCA",           "OTRAS ENTRADAS", 66.48, 3.0, 250.0, 290.00, 151.61, 0.606),
    (19, "CRISPY RICE ATÚN",         "CRISPY RICE",    39.24, 3.0, 195.0, 226.20, 136.92, 0.702),
    (20, "CRISPY RICE SALMON",       "CRISPY RICE",    31.96, 3.0, 170.0, 197.20, 122.70, 0.765),
    (21, "CRISPY RICE DE RIBEYE",    "CRISPY RICE",    48.30, 3.0, 270.0, 313.20, 198.52, 0.735),
    (22, "TEMAKI KANIKAMA",          "TEMAKIS",        26.52, 3.0, 120.0, 139.20, 80.75,  0.673),
    (23, "TEMAKI SPICY SALMON",      "TEMAKIS",        30.09, 3.0, 100.0, 116.00, 55.47,  0.555),
    (24, "TEMAKI SPICY TUNA",        "TEMAKIS",        37.37, 3.0, 115.0, 133.40, 59.70,  0.519),
    (25, "TEMAKI RIB EYE",           "TEMAKIS",        29.56, 3.0, 150.0, 174.00, 106.25, 0.708),
    (26, "TEMAKI CAMARÓN TEMPURA",   "TEMAKIS",        15.01, 3.0, 95.0,  110.20, 72.79,  0.766),
    (27, "TEMAKI KAMPACHI",          "TEMAKIS",        29.40, 3.0, 130.0, 150.80, 86.49,  0.665),
    (28, "TEMAKI SALMÓN",            "TEMAKIS",        23.07, 3.0, 90.0,  104.40, 55.86,  0.621),
    (29, "TEMAKI ATÚN",              "TEMAKIS",        37.37, 3.0, 115.0, 133.40, 59.70,  0.519),
]


# ── Ventas Parrot — Datos reales abril 2026 ──────────────────────────────────

_VENTAS_PARROT_SEED = [
    # (nombre_parrot, cantidad, precio_promedio, venta_total)
    ("temaki kanikama",        362, 124.10, 44924),
    ("kusiagues de queso",     299,  94.93, 28385),
    ("poke salmón",            311, 309.14, 96144),
    ("hosomaki crunch spicy",  272, 146.18, 39760),
    ("butter rice con ribeye", 180, 325.17, 58530),
    ("poke atún",              163, 310.79, 50658),
    ("nigiri de salmón",       219, 102.12, 22365),
    ("baby roll",              135, 111.81, 15095),
    ("temaki spicy salmon",    126, 109.05, 13740),
    ("temaki salmon",          125,  94.48, 11810),
    ("edamames",               145,  71.66, 10390),
    ("hosomaki especial",      119, 194.71, 23170),
    ("Spicy Yuzu Tostada",     152, 150.00, 22800),
    ("hosomaki spicy roll",    147, 149.63, 21995),
    ("Ribeye Crunch",          115, 180.00, 20700),
    ("plato nigiris 6pz",       54, 369.44, 19950),
    ("camarones roca",          76, 257.96, 19605),
    ("temaki spicy tuna",      153, 121.47, 18585),
    ("tuna crispy rice",        89, 206.80, 18405),
    ("salmon crispy rice",      94, 179.57, 16880),
    ("kanikama roll",          109, 153.67, 16750),
    ("Crispy Rice de Rib Eye",  58, 285.17, 16540),
    ("Tiradito de kampachi",    67, 240.36, 16104),
    ("Plato de Nigris 9pz",     29, 515.69, 14955),
    ("temaki especial",         88, 148.92, 13105),
    ("temaki ribeye",           85, 150.82, 12820),
    ("poke kanikama",           33, 302.55,  9984),
    ("poke camarón",            31, 303.03,  9394),
    ("nigiri ribeye",           53, 170.94,  9060),
    ("nigiri de atún",          76, 116.84,  8880),
    ("seaweed salad",           56, 128.29,  7184),
    ("sashimi salmon",          47, 137.45,  6460),
    ("temaki camarón",          62,  98.55,  6110),
    ("nigiri de kampachi",      42, 138.93,  5835),
    ("plato nigiris 3pz",       30, 190.00,  5700),
    ("Tiradito de atún",        27, 177.04,  4780),
    ("hosomaki camaron tempura",43, 110.81,  4765),
    ("temaki kampachi",         35, 133.43,  4670),
    ("Tiradito de salmón",      27, 165.37,  4465),
    ("sashimi de atun",         27, 139.26,  3760),
    ("temaki atún",             33, 110.61,  3650),
    ("sashimi mixto",            7, 287.14,  2010),
    ("sashimi de kampachi",      6, 240.00,  1440),
]

# Parrot name (lowercase) → DB platillo nombre exacto
_PARROT_NOMBRE_MAP: dict = {
    "kusiagues de queso":       "KUSHIAGUES DE QUESO",
    "nigiri de salmón":         "NIGIRIS DE SALMÓN 2PZ",
    "nigiri de atún":           "NIGIRIS DE ATÚN 2PZ",
    "nigiri de kampachi":       "NIGIRIS DE KAMPACHI 2PZ",
    "nigiri ribeye":            "NIGIRIS DE RIBEYE 2PZ",
    "plato nigiris 6pz":        "PLATO 6PZ NIGIRIS MIXTO",
    "plato de nigris 9pz":      "PLATO 9PZ NIGIRIS MIXTO",
    "plato nigiris 3pz":        "PLATO 3PZ NIGIRIS MIXTO",
    "tuna crispy rice":         "CRISPY RICE ATÚN",
    "salmon crispy rice":       "CRISPY RICE SALMON",
    "crispy rice de rib eye":   "CRISPY RICE DE RIBEYE",
    "tiradito de kampachi":     "TIRADITO DE KAMPACHI",
    "tiradito de atún":         "TIRADITO DE ATÚN",
    "tiradito de salmón":       "TIRADITO DE SALMÓN",
    "sashimi salmon":           "SASHIMI SALMÓN",
    "sashimi de atun":          "SASHIMI ATÚN",
    "sashimi de kampachi":      "SASHIMI KAMPACHI",
    "temaki camarón":           "TEMAKI CAMARÓN TEMPURA",
    "temaki ribeye":            "TEMAKI RIB EYE",
    "edamames":                 "EDAMAMES AL VAPOR",
    "seaweed salad":            "SEAWEED SALAD",
    "camarones roca":           "CAMARONES ROCA",
    "temaki salmon":            "TEMAKI SALMÓN",
    "temaki atún":              "TEMAKI ATÚN",
    "temaki kampachi":          "TEMAKI KAMPACHI",
    "temaki spicy salmon":      "TEMAKI SPICY SALMON",
    "temaki spicy tuna":        "TEMAKI SPICY TUNA",
    "temaki kanikama":          "TEMAKI KANIKAMA",
}


def seed_ventas_parrot(db: Session, restaurante_id: int, mes: int = 4, anio: int = 2026) -> None:
    """Seed datos Parrot abril 2026 — idempotente (update si ya existe)."""
    platillos = db.query(models.Platillo).filter(
        models.Platillo.restaurante_id == restaurante_id
    ).all()
    nombre_to_id = {p.nombre.upper(): p.id for p in platillos}

    for nombre_parrot, cantidad, precio_promedio, venta_total in _VENTAS_PARROT_SEED:
        mapped = _PARROT_NOMBRE_MAP.get(nombre_parrot.lower())
        platillo_id = nombre_to_id.get((mapped or nombre_parrot).upper())

        existing = db.query(models.VentaPorPlatillo).filter(
            models.VentaPorPlatillo.restaurante_id == restaurante_id,
            models.VentaPorPlatillo.mes == mes,
            models.VentaPorPlatillo.anio == anio,
            models.VentaPorPlatillo.nombre_parrot == nombre_parrot,
        ).first()

        if existing:
            existing.cantidad_vendida = cantidad
            existing.precio_promedio = precio_promedio
            existing.venta_total = venta_total
            existing.venta_neta = venta_total
            existing.platillo_id = platillo_id
        else:
            db.add(models.VentaPorPlatillo(
                restaurante_id=restaurante_id,
                mes=mes,
                anio=anio,
                nombre_parrot=nombre_parrot,
                platillo_id=platillo_id,
                cantidad_vendida=cantidad,
                precio_promedio=precio_promedio,
                venta_total=venta_total,
                venta_neta=venta_total,
            ))

    db.commit()


def seed_costeo(db: Session, restaurante_id: int = 6) -> None:
    """Idempotent seed — solo inserta si las tablas están vacías para este restaurante."""
    count = db.query(models.InsumoCosteo).filter(
        models.InsumoCosteo.restaurante_id == restaurante_id
    ).count()
    if count > 0:
        return

    for row in _INSUMOS_SEED:
        numero, categoria, nombre, unidad, precio_unitario, precio_por_g_ml, pct_merma, costo_real = row
        db.add(models.InsumoCosteo(
            restaurante_id=restaurante_id,
            numero=numero,
            categoria=categoria,
            nombre=nombre,
            unidad=unidad,
            precio_unitario=precio_unitario,
            precio_por_g_ml=precio_por_g_ml,
            porcentaje_merma=pct_merma,
            costo_real=costo_real,
        ))

    for row in _PLATILLOS_SEED:
        numero, nombre, categoria, costo_receta, markup, precio_venta, precio_con_iva, margen_pesos, margen_pct = row
        db.add(models.Platillo(
            restaurante_id=restaurante_id,
            numero=numero,
            nombre=nombre,
            categoria=categoria,
            costo_receta=costo_receta,
            markup=markup,
            precio_venta=precio_venta,
            precio_venta_con_iva=precio_con_iva,
            margen_contribucion_pesos=margen_pesos,
            margen_contribucion_pct=margen_pct,
        ))

    db.commit()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _clasificar(margen_pesos: float, margen_pct: float, avg_pesos: float, avg_pct: float) -> str:
    alto_pesos = margen_pesos >= avg_pesos
    alto_pct = margen_pct >= avg_pct
    if alto_pesos and alto_pct:
        return "ESTRELLA"
    if alto_pesos and not alto_pct:
        return "CABALLO"
    if not alto_pesos and alto_pct:
        return "ROMPECABEZAS"
    return "PERRO"


def _platillos_con_clasificacion(db: Session, restaurante_id: int):
    platillos = db.query(models.Platillo).filter(
        models.Platillo.restaurante_id == restaurante_id,
        models.Platillo.activo == True,
    ).order_by(models.Platillo.numero).all()

    if not platillos:
        return []

    avg_pesos = sum(p.margen_contribucion_pesos for p in platillos) / len(platillos)
    avg_pct = sum(p.margen_contribucion_pct for p in platillos) / len(platillos)

    result = []
    for p in platillos:
        food_cost_pct = round(p.costo_receta / p.precio_venta * 100, 1) if p.precio_venta else 0
        result.append({
            "id": p.id,
            "numero": p.numero,
            "nombre": p.nombre,
            "categoria": p.categoria,
            "costo_receta": round(p.costo_receta, 2),
            "markup": p.markup,
            "precio_venta": round(p.precio_venta, 2),
            "precio_venta_con_iva": round(p.precio_venta_con_iva, 2),
            "margen_contribucion_pesos": round(p.margen_contribucion_pesos, 2),
            "margen_contribucion_pct": round(p.margen_contribucion_pct * 100, 1),
            "food_cost_pct": food_cost_pct,
            "clasificacion": _clasificar(
                p.margen_contribucion_pesos, p.margen_contribucion_pct,
                avg_pesos, avg_pct
            ),
        })
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{restaurante_id}/insumos")
def listar_insumos(restaurante_id: int, db: Session = Depends(get_db)):
    insumos = db.query(models.InsumoCosteo).filter(
        models.InsumoCosteo.restaurante_id == restaurante_id,
        models.InsumoCosteo.activo == True,
    ).order_by(models.InsumoCosteo.categoria, models.InsumoCosteo.numero).all()

    return [
        {
            "id": i.id,
            "numero": i.numero,
            "categoria": i.categoria,
            "nombre": i.nombre,
            "unidad": i.unidad,
            "precio_unitario": round(i.precio_unitario, 4),
            "precio_por_g_ml": round(i.precio_por_g_ml, 5),
            "porcentaje_merma": round(i.porcentaje_merma * 100, 0),
            "costo_real": round(i.costo_real, 5),
            "updated_at": i.updated_at.isoformat() if i.updated_at else None,
        }
        for i in insumos
    ]


@router.get("/{restaurante_id}/platillos")
def listar_platillos(restaurante_id: int, db: Session = Depends(get_db)):
    return _platillos_con_clasificacion(db, restaurante_id)


@router.get("/{restaurante_id}/platillo/{platillo_id}")
def detalle_platillo(restaurante_id: int, platillo_id: int, db: Session = Depends(get_db)):
    p = db.query(models.Platillo).filter(
        models.Platillo.id == platillo_id,
        models.Platillo.restaurante_id == restaurante_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Platillo no encontrado")

    platillos = db.query(models.Platillo).filter(
        models.Platillo.restaurante_id == restaurante_id,
        models.Platillo.activo == True,
    ).all()
    avg_pesos = sum(x.margen_contribucion_pesos for x in platillos) / len(platillos) if platillos else 0
    avg_pct = sum(x.margen_contribucion_pct for x in platillos) / len(platillos) if platillos else 0

    clasificacion = _clasificar(p.margen_contribucion_pesos, p.margen_contribucion_pct, avg_pesos, avg_pct)
    food_cost_pct = round(p.costo_receta / p.precio_venta * 100, 1) if p.precio_venta else 0

    _RECOMENDACIONES = {
        "ESTRELLA": "Alto margen y alta rentabilidad. Mantener en carta, destacar en menú y entrenar al equipo para sugerirlo.",
        "CABALLO": "Genera buen margen en pesos pero el porcentaje de contribución es bajo. Revisar precio de venta o reducir costo de receta.",
        "ROMPECABEZAS": "Buen porcentaje de margen pero contribución en pesos menor al promedio. Promover más activamente o ajustar precio al alza.",
        "PERRO": "Margen bajo en pesos y porcentaje. Evaluar si se mantiene por razones estratégicas o se elimina de carta.",
    }

    ingredientes = db.query(models.PlatilloIngrediente).filter(
        models.PlatilloIngrediente.platillo_id == platillo_id
    ).all()

    return {
        "id": p.id,
        "numero": p.numero,
        "nombre": p.nombre,
        "categoria": p.categoria,
        "activo": p.activo,
        "costo_receta": round(p.costo_receta, 2),
        "markup": p.markup,
        "precio_venta": round(p.precio_venta, 2),
        "precio_venta_con_iva": round(p.precio_venta_con_iva, 2),
        "margen_contribucion_pesos": round(p.margen_contribucion_pesos, 2),
        "margen_contribucion_pct": round(p.margen_contribucion_pct * 100, 1),
        "food_cost_pct": food_cost_pct,
        "clasificacion": clasificacion,
        "recomendacion": _RECOMENDACIONES.get(clasificacion, ""),
        "ingredientes": [
            {
                "insumo_id": ing.insumo_id,
                "nombre_ingrediente": ing.nombre_ingrediente or "",
                "unidad": ing.unidad or "",
                "cantidad": ing.cantidad or 0,
                "costo_unitario": round(ing.costo_unitario or 0, 6),
                "costo_total": round(ing.costo_total or 0, 4),
            }
            for ing in ingredientes
        ],
    }


@router.get("/{restaurante_id}/ingenieria-menu")
def ingenieria_menu(restaurante_id: int, db: Session = Depends(get_db)):
    platillos_orm = db.query(models.Platillo).filter(
        models.Platillo.restaurante_id == restaurante_id,
        models.Platillo.activo == True,
    ).order_by(models.Platillo.numero).all()

    if not platillos_orm:
        return {"platillos": [], "resumen": {}, "por_categoria": {},
                "tiene_datos_ventas": False, "mes_ventas": 0, "anio_ventas": 0}

    # ── Buscar ventas más recientes ──────────────────────────────────────────
    anio_v = db.query(func.max(models.VentaPorPlatillo.anio)).filter(
        models.VentaPorPlatillo.restaurante_id == restaurante_id,
        models.VentaPorPlatillo.platillo_id.isnot(None),
    ).scalar()

    ventas_map: dict = {}
    mes_v = 0
    tiene_ventas = False

    if anio_v:
        mes_v = db.query(func.max(models.VentaPorPlatillo.mes)).filter(
            models.VentaPorPlatillo.restaurante_id == restaurante_id,
            models.VentaPorPlatillo.anio == anio_v,
            models.VentaPorPlatillo.platillo_id.isnot(None),
        ).scalar() or 0

        if mes_v:
            for v in db.query(models.VentaPorPlatillo).filter(
                models.VentaPorPlatillo.restaurante_id == restaurante_id,
                models.VentaPorPlatillo.mes == mes_v,
                models.VentaPorPlatillo.anio == anio_v,
                models.VentaPorPlatillo.platillo_id.isnot(None),
            ).all():
                ventas_map[v.platillo_id] = v.cantidad_vendida
            tiene_ventas = bool(ventas_map)

    # ── Construir lista base ─────────────────────────────────────────────────
    platillos_data = []
    for p in platillos_orm:
        food_cost_pct = round(p.costo_receta / p.precio_venta * 100, 1) if p.precio_venta else 0
        platillos_data.append({
            "id": p.id,
            "numero": p.numero,
            "nombre": p.nombre,
            "categoria": p.categoria,
            "costo_receta": round(p.costo_receta, 2),
            "markup": p.markup,
            "precio_venta": round(p.precio_venta, 2),
            "precio_venta_con_iva": round(p.precio_venta_con_iva, 2),
            "margen_contribucion_pesos": round(p.margen_contribucion_pesos, 2),
            "margen_contribucion_pct": round(p.margen_contribucion_pct * 100, 1),
            "food_cost_pct": food_cost_pct,
            "cantidad_vendida": ventas_map.get(p.id, 0) if tiene_ventas else 0,
        })

    # ── Clasificación Kasavana-Smith (con ventas) o fallback (solo margen) ───
    if tiene_ventas:
        total_vendidos = sum(p["cantidad_vendida"] for p in platillos_data)
        n = len(platillos_data)
        umbral_pop = round((1 / n) * 0.70 * 100, 2) if n > 0 else 0

        if total_vendidos > 0:
            margen_ponderado = round(
                sum(p["margen_contribucion_pesos"] * p["cantidad_vendida"] for p in platillos_data)
                / total_vendidos, 2
            )
        else:
            margen_ponderado = round(
                sum(p["margen_contribucion_pesos"] for p in platillos_data) / n, 2
            )

        for p in platillos_data:
            pct_pop = round((p["cantidad_vendida"] / total_vendidos) * 100, 2) if total_vendidos > 0 else 0
            es_popular = pct_pop >= umbral_pop
            es_rentable = p["margen_contribucion_pesos"] >= margen_ponderado

            if es_popular and es_rentable:
                clasif = "ESTRELLA"
            elif es_popular and not es_rentable:
                clasif = "CABALLO"
            elif not es_popular and es_rentable:
                clasif = "ROMPECABEZAS"
            else:
                clasif = "PERRO"

            gap = round(margen_ponderado - p["margen_contribucion_pesos"], 0)
            if clasif == "CABALLO":
                rec = f"Alta demanda pero bajo margen. Considera subir el precio ${gap:,.0f} para alcanzar el margen promedio del menú."
            elif clasif == "ESTRELLA":
                rec = "Mantener y promover. Destacar en el menú."
            elif clasif == "ROMPECABEZAS":
                rec = "Buen margen pero poca visibilidad. Reposicionar en el menú o incluir en recomendaciones del equipo."
            else:
                rec = "Evaluar eliminación o rediseño completo del platillo."

            p.update({
                "clasificacion": clasif,
                "pct_popularidad": pct_pop,
                "umbral_popularidad": umbral_pop,
                "margen_promedio_menu": margen_ponderado,
                "margen_vs_promedio": round(p["margen_contribucion_pesos"] - margen_ponderado, 2),
                "recomendacion": rec,
            })
    else:
        # Fallback: clasificación solo por margen (método anterior)
        avg_pesos = sum(p["margen_contribucion_pesos"] for p in platillos_data) / len(platillos_data)
        avg_pct = sum(p["margen_contribucion_pct"] for p in platillos_data) / len(platillos_data)
        umbral_pop = round(100 / len(platillos_data) * 0.70, 2)

        _RECS = {
            "ESTRELLA":     "Alto margen y alta rentabilidad. Mantener en carta, destacar en menú.",
            "CABALLO":      "Genera buen margen en pesos pero el porcentaje de contribución es bajo. Revisar precio de venta o reducir costo de receta.",
            "ROMPECABEZAS": "Buen porcentaje de margen pero contribución en pesos menor al promedio. Promover más activamente.",
            "PERRO":        "Margen bajo en pesos y porcentaje. Evaluar si se mantiene por razones estratégicas o se elimina de carta.",
        }

        for p in platillos_data:
            clasif = _clasificar(
                p["margen_contribucion_pesos"], p["margen_contribucion_pct"] / 100, avg_pesos, avg_pct
            )
            p.update({
                "clasificacion": clasif,
                "pct_popularidad": None,
                "umbral_popularidad": umbral_pop,
                "margen_promedio_menu": round(avg_pesos, 2),
                "margen_vs_promedio": round(p["margen_contribucion_pesos"] - avg_pesos, 2),
                "recomendacion": _RECS.get(clasif, ""),
            })

    # ── Resumen ──────────────────────────────────────────────────────────────
    conteo = {"ESTRELLA": 0, "CABALLO": 0, "ROMPECABEZAS": 0, "PERRO": 0}
    for p in platillos_data:
        conteo[p["clasificacion"]] = conteo.get(p["clasificacion"], 0) + 1

    avg_food_cost = round(sum(p["food_cost_pct"] for p in platillos_data) / len(platillos_data), 1)
    mejor = max(platillos_data, key=lambda p: p["margen_contribucion_pesos"])
    peor = min(platillos_data, key=lambda p: p["margen_contribucion_pct"])
    umbral_res = platillos_data[0]["umbral_popularidad"] if platillos_data else 0
    margen_res = platillos_data[0]["margen_promedio_menu"] if platillos_data else 0

    categorias: dict = {}
    for p in platillos_data:
        categorias.setdefault(p["categoria"], []).append(p)

    return {
        "platillos": platillos_data,
        "tiene_datos_ventas": tiene_ventas,
        "mes_ventas": mes_v,
        "anio_ventas": anio_v or 0,
        "resumen": {
            "total_platillos": len(platillos_data),
            "food_cost_promedio": avg_food_cost,
            "markup_promedio": 3.0,
            "mejor_margen_pesos": {"nombre": mejor["nombre"], "margen": mejor["margen_contribucion_pesos"]},
            "peor_margen_pct": {"nombre": peor["nombre"], "margen_pct": peor["margen_contribucion_pct"]},
            "clasificacion_conteo": conteo,
            "umbral_popularidad": umbral_res,
            "margen_promedio_ponderado": margen_res,
            "tiene_datos_ventas": tiene_ventas,
        },
        "por_categoria": {
            cat: {"platillos": items, "count": len(items)}
            for cat, items in categorias.items()
        },
    }


def _recalc_platillo(p: models.Platillo, ingredientes_body: list | None, db: Session) -> None:
    """Reemplaza ingredientes y recalcula márgenes del platillo."""
    if ingredientes_body is not None:
        db.query(models.PlatilloIngrediente).filter(
            models.PlatilloIngrediente.platillo_id == p.id
        ).delete()
        costo_total = 0.0
        for ing in ingredientes_body:
            ct = round(float(ing.get("costo_total", 0)), 4)
            costo_total += ct
            db.add(models.PlatilloIngrediente(
                platillo_id=p.id,
                insumo_id=ing.get("insumo_id"),
                nombre_ingrediente=ing.get("nombre_ingrediente", ""),
                unidad=ing.get("unidad", ""),
                cantidad=float(ing.get("cantidad", 0)),
                costo_unitario=float(ing.get("costo_unitario", 0)),
                costo_total=ct,
            ))
        p.costo_receta = round(costo_total, 2)

    p.precio_venta_con_iva = round(p.precio_venta * 1.16, 2)
    if p.precio_venta > 0:
        p.margen_contribucion_pesos = round(p.precio_venta - p.costo_receta, 2)
        p.margen_contribucion_pct = round(p.margen_contribucion_pesos / p.precio_venta, 6)


@router.put("/{restaurante_id}/platillo/{platillo_id}")
def actualizar_platillo(
    restaurante_id: int,
    platillo_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    p = db.query(models.Platillo).filter(
        models.Platillo.id == platillo_id,
        models.Platillo.restaurante_id == restaurante_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Platillo no encontrado")

    if "nombre" in body:
        p.nombre = str(body["nombre"])
    if "categoria" in body:
        p.categoria = str(body["categoria"])
    if "precio_venta" in body:
        p.precio_venta = round(float(body["precio_venta"]), 2)
    if "markup" in body:
        p.markup = round(float(body["markup"]), 2)
    if "activo" in body:
        p.activo = bool(body["activo"])

    _recalc_platillo(p, body.get("ingredientes"), db)
    db.commit()
    db.refresh(p)
    return {"ok": True, "id": p.id, "costo_receta": p.costo_receta,
            "margen_pesos": p.margen_contribucion_pesos,
            "margen_pct": round(p.margen_contribucion_pct * 100, 1)}


@router.post("/{restaurante_id}/platillos")
def crear_platillo(
    restaurante_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    precio_venta = round(float(body.get("precio_venta", 0)), 2)
    markup = round(float(body.get("markup", 3.0)), 2)
    ingredientes_body = body.get("ingredientes", [])
    costo_receta = round(sum(float(i.get("costo_total", 0)) for i in ingredientes_body), 2)
    margen_pesos = round(precio_venta - costo_receta, 2)
    margen_pct = round(margen_pesos / precio_venta, 6) if precio_venta > 0 else 0.0

    max_num = db.query(func.max(models.Platillo.numero)).filter(
        models.Platillo.restaurante_id == restaurante_id
    ).scalar() or 0

    p = models.Platillo(
        restaurante_id=restaurante_id,
        numero=max_num + 1,
        nombre=str(body.get("nombre", "Nuevo platillo")),
        categoria=str(body.get("categoria", "OTRAS ENTRADAS")),
        costo_receta=costo_receta,
        markup=markup,
        precio_venta=precio_venta,
        precio_venta_con_iva=round(precio_venta * 1.16, 2),
        margen_contribucion_pesos=margen_pesos,
        margen_contribucion_pct=margen_pct,
        activo=bool(body.get("activo", True)),
    )
    db.add(p)
    db.flush()

    for ing in ingredientes_body:
        ct = round(float(ing.get("costo_total", 0)), 4)
        db.add(models.PlatilloIngrediente(
            platillo_id=p.id,
            insumo_id=ing.get("insumo_id"),
            nombre_ingrediente=ing.get("nombre_ingrediente", ""),
            unidad=ing.get("unidad", ""),
            cantidad=float(ing.get("cantidad", 0)),
            costo_unitario=float(ing.get("costo_unitario", 0)),
            costo_total=ct,
        ))

    db.commit()
    return {"ok": True, "id": p.id}


@router.put("/{restaurante_id}/insumo/{insumo_id}")
def actualizar_precio_insumo(
    restaurante_id: int,
    insumo_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    insumo = db.query(models.InsumoCosteo).filter(
        models.InsumoCosteo.id == insumo_id,
        models.InsumoCosteo.restaurante_id == restaurante_id,
    ).first()
    if not insumo:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    nuevo_precio = float(body.get("precio_unitario", insumo.precio_unitario))
    insumo.precio_unitario = nuevo_precio
    # Recalcular precio_por_g_ml y costo_real
    if insumo.unidad in ("KG", "LT"):
        insumo.precio_por_g_ml = round(nuevo_precio / 1000, 6)
        insumo.costo_real = round(insumo.precio_por_g_ml * (1 + insumo.porcentaje_merma), 6)
    insumo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(insumo)

    return {
        "id": insumo.id,
        "nombre": insumo.nombre,
        "precio_unitario": round(insumo.precio_unitario, 4),
        "precio_por_g_ml": round(insumo.precio_por_g_ml, 5),
        "costo_real": round(insumo.costo_real, 5),
    }
