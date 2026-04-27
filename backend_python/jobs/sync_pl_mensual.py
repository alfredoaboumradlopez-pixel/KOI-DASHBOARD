"""
Job de sincronización: calcula P&L y lo guarda en tabla pl_mensual.
Corre el día 1 de cada mes a las 2am (disparado externamente o por startup).
"""
from datetime import datetime, date
from sqlalchemy.orm import Session
from .. import models
from ..services.pl_service import pl_service


def sync_mes(db: Session, restaurante_id: int, mes: int, anio: int) -> dict:
    """Calcula el P&L del mes y lo persiste en pl_mensual."""
    result = pl_service.calcular_pl_mes(db, restaurante_id, mes, anio)

    existing = db.query(models.PLMensual).filter(
        models.PLMensual.restaurante_id == restaurante_id,
        models.PLMensual.mes == mes,
        models.PLMensual.anio == anio,
    ).first()

    data = {
        "mes": mes,
        "anio": anio,
        "restaurante_id": restaurante_id,
        "ventas_totales": result.ventas_netas,
        "costo_insumos": result.total_costo_ventas,
        "gastos_servicios": result.gastos_servicios,
        "gastos_renta": result.gastos_renta,
        "gastos_mantenimiento": result.gastos_mantenimiento,
        "gastos_limpieza": result.gastos_limpieza,
        "gastos_comida_personal": result.gastos_otros,
        "gastos_otros": result.gastos_admin,
        "gastos_nomina": result.gastos_nomina,
        "impuestos": result.impuestos_estimados,
        "utilidad_bruta": result.utilidad_bruta,
        "utilidad_operativa": result.ebitda,
        "utilidad_neta": result.utilidad_neta,
        "calculado_automaticamente": True,
        "fecha_calculo": datetime.utcnow(),
    }

    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        pl = existing
    else:
        pl = models.PLMensual(**data)
        db.add(pl)

    db.commit()
    db.refresh(pl)
    return {"pl_mensual_id": pl.id, "mes": mes, "anio": anio, "ventas_netas": result.ventas_netas}


def sync_todos_los_restaurantes(db: Session, mes: int, anio: int):
    """Sincroniza el P&L de todos los restaurantes activos para el mes dado."""
    restaurantes = db.query(models.Restaurante).filter(models.Restaurante.activo == True).all()
    resultados = []
    for r in restaurantes:
        try:
            res = sync_mes(db, r.id, mes, anio)
            resultados.append({"restaurante": r.slug, "status": "ok", **res})
        except Exception as e:
            resultados.append({"restaurante": r.slug, "status": "error", "error": str(e)})
    return resultados
