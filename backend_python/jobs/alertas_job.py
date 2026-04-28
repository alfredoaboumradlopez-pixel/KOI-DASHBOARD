"""
Motor de alertas — evalúa reglas de negocio y crea alertas_log.
Se dispara automáticamente al registrar un cierre de turno,
o manualmente desde POST /api/alertas/{restaurante_id}/evaluar.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta
from typing import Optional, List

from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models
from ..services.pl_service import pl_service


class AlertasJob:

    def evaluar_restaurante(self, db: Session, restaurante_id: int) -> List[models.AlertaLog]:
        """
        Evalúa todas las reglas de alertas activas para un restaurante.
        Devuelve lista de alertas nuevas creadas (sin duplicados en 24h).
        """
        try:
            configs = db.query(models.AlertaConfig).filter(
                models.AlertaConfig.restaurante_id == restaurante_id,
                models.AlertaConfig.activo == True,
            ).all()

            hoy = date.today()
            pl_semana = pl_service.calcular_pl_semana(db, restaurante_id, hoy)
            pl_mes = pl_service.calcular_pl_mes(db, restaurante_id, hoy.month, hoy.year)

            alertas_creadas: List[models.AlertaLog] = []
            for config in configs:
                alerta = self._evaluar_regla(db, restaurante_id, config, pl_semana, pl_mes, hoy)
                if alerta:
                    alertas_creadas.append(alerta)

            # Alertas D-3: pagos próximos a vencer (sin depender de alertas_config)
            alertas_creadas.extend(self._evaluar_pagos_proximos(db, restaurante_id, hoy))

            if alertas_creadas:
                db.commit()

            return alertas_creadas
        except Exception as e:
            print(f"AlertasJob.evaluar_restaurante error (restaurante_id={restaurante_id}): {e}")
            return []

    # ------------------------------------------------------------------ #
    # Helpers internos                                                     #
    # ------------------------------------------------------------------ #

    def _anti_duplicado(self, db: Session, restaurante_id: int, tipo: str) -> bool:
        """True si ya existe una alerta no revisada del mismo tipo en las últimas 24h."""
        hace_24h = datetime.utcnow() - timedelta(hours=24)
        existe = db.query(models.AlertaLog).filter(
            models.AlertaLog.restaurante_id == restaurante_id,
            models.AlertaLog.tipo == tipo,
            models.AlertaLog.revisada == False,
            models.AlertaLog.created_at >= hace_24h,
        ).first()
        return existe is not None

    def _crear_alerta(
        self,
        db: Session,
        restaurante_id: int,
        tipo: str,
        mensaje: str,
        valor_detectado: float,
        umbral_config: float,
        severidad: str = "WARNING",
    ) -> Optional[models.AlertaLog]:
        """Crea la alerta solo si no hay duplicado en 24h."""
        if self._anti_duplicado(db, restaurante_id, tipo):
            return None
        alerta = models.AlertaLog(
            restaurante_id=restaurante_id,
            tipo=tipo,
            mensaje=mensaje,
            valor_detectado=round(valor_detectado, 2),
            umbral_config=round(umbral_config, 2),
            revisada=False,
            severidad=severidad,
        )
        db.add(alerta)
        return alerta

    def _evaluar_regla(
        self,
        db: Session,
        restaurante_id: int,
        config: models.AlertaConfig,
        pl_semana,
        pl_mes,
        hoy: date,
    ) -> Optional[models.AlertaLog]:
        tipo = config.tipo
        umbral = config.umbral

        # ── FOOD_COST_ALTO ───────────────────────────────────────────────
        if tipo == "FOOD_COST_ALTO":
            val = pl_semana.food_cost_pct
            if val > umbral:
                sev = "CRITICAL" if val >= 38.0 else "WARNING"
                return self._crear_alerta(
                    db, restaurante_id, tipo,
                    f"Food cost esta semana: {val:.1f}% (límite {umbral:.1f}%)",
                    val, umbral, sev,
                )

        # ── NOMINA_ALTA ──────────────────────────────────────────────────
        elif tipo == "NOMINA_ALTA":
            val = pl_semana.nomina_pct
            if val > umbral:
                return self._crear_alerta(
                    db, restaurante_id, tipo,
                    f"Nómina esta semana: {val:.1f}% de ventas (límite {umbral:.1f}%)",
                    val, umbral, "WARNING",
                )

        # ── MARGEN_BAJO ──────────────────────────────────────────────────
        elif tipo == "MARGEN_BAJO":
            # Sin ventas reales esta semana el margen es 0% por ausencia de datos,
            # no por bajo rendimiento — omitir para evitar falsos positivos.
            if pl_semana.ventas_netas <= 0:
                return None
            val = pl_semana.margen_neto_pct
            if val < umbral:
                sev = "CRITICAL" if val <= 5.0 else "WARNING"
                return self._crear_alerta(
                    db, restaurante_id, tipo,
                    f"Margen neto esta semana: {val:.1f}% (mínimo {umbral:.1f}%)",
                    val, umbral, sev,
                )

        # ── VENTAS_BAJAS ─────────────────────────────────────────────────
        elif tipo == "VENTAS_BAJAS":
            cierre_hoy = db.query(models.CierreTurno).filter(
                models.CierreTurno.restaurante_id == restaurante_id,
                models.CierreTurno.fecha == hoy,
            ).first()
            if cierre_hoy and cierre_hoy.total_venta:
                ventas_hoy = cierre_hoy.total_venta
                dias_semana = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
                dia_nombre = dias_semana[hoy.weekday()]
                historico: list[float] = []
                for i in range(1, 5):
                    fecha_ref = hoy - timedelta(weeks=i)
                    c = db.query(models.CierreTurno).filter(
                        models.CierreTurno.restaurante_id == restaurante_id,
                        models.CierreTurno.fecha == fecha_ref,
                    ).first()
                    if c and c.total_venta:
                        historico.append(c.total_venta)
                if historico:
                    promedio = sum(historico) / len(historico)
                    pct_umbral = umbral / 100.0  # e.g. 80 → 0.80
                    if promedio > 0 and ventas_hoy < promedio * pct_umbral:
                        pct_caida = abs(((ventas_hoy - promedio) / promedio) * 100)
                        return self._crear_alerta(
                            db, restaurante_id, tipo,
                            f"Ventas de hoy ${ventas_hoy:,.0f} están {pct_caida:.0f}% "
                            f"por debajo del promedio del {dia_nombre}",
                            ventas_hoy, promedio, "WARNING",
                        )

        # ── CAPTURA_INCOMPLETA ───────────────────────────────────────────
        elif tipo == "CAPTURA_INCOMPLETA":
            ultimo_cierre = db.query(models.CierreTurno).filter(
                models.CierreTurno.restaurante_id == restaurante_id,
            ).order_by(models.CierreTurno.fecha.desc()).first()

            if not ultimo_cierre:
                return self._crear_alerta(
                    db, restaurante_id, tipo,
                    "No hay cierres registrados en este restaurante",
                    0.0, float(umbral), "CRITICAL",
                )

            dias_sin_cierre = (hoy - ultimo_cierre.fecha).days
            if dias_sin_cierre >= 1:
                sev = "CRITICAL" if dias_sin_cierre >= 2 else "WARNING"
                return self._crear_alerta(
                    db, restaurante_id, tipo,
                    f"Faltan {dias_sin_cierre} días sin cierre registrado "
                    f"(último cierre: {ultimo_cierre.fecha})",
                    float(dias_sin_cierre), float(umbral), sev,
                )

        # ── GASTO_SIN_CATEGORIA ──────────────────────────────────────────
        elif tipo == "GASTO_SIN_CATEGORIA":
            hace_7d = hoy - timedelta(days=7)

            count_g = db.query(func.count(models.Gasto.id)).filter(
                models.Gasto.restaurante_id == restaurante_id,
                models.Gasto.catalogo_cuenta_id == None,
                models.Gasto.fecha >= hace_7d,
            ).scalar() or 0

            cierres_7d_ids = db.query(models.CierreTurno.id).filter(
                models.CierreTurno.restaurante_id == restaurante_id,
                models.CierreTurno.fecha >= hace_7d,
            ).subquery()
            count_gd = db.query(func.count(models.GastoDiario.id)).filter(
                models.GastoDiario.cierre_id.in_(cierres_7d_ids),
                models.GastoDiario.catalogo_cuenta_id == None,
            ).scalar() or 0

            total_sin_cat = count_g + count_gd
            if total_sin_cat > 0:
                monto_g = db.query(func.sum(models.Gasto.monto)).filter(
                    models.Gasto.restaurante_id == restaurante_id,
                    models.Gasto.catalogo_cuenta_id == None,
                    models.Gasto.fecha >= hace_7d,
                ).scalar() or 0.0
                monto_gd = db.query(func.sum(models.GastoDiario.monto)).filter(
                    models.GastoDiario.cierre_id.in_(cierres_7d_ids),
                    models.GastoDiario.catalogo_cuenta_id == None,
                ).scalar() or 0.0
                monto_total = float(monto_g) + float(monto_gd)
                return self._crear_alerta(
                    db, restaurante_id, tipo,
                    f"{total_sin_cat} gastos sin categorizar por ${monto_total:,.0f} "
                    f"en los últimos 7 días",
                    float(total_sin_cat), 0.0, "INFO",
                )

        return None

    def _evaluar_pagos_proximos(
        self, db: Session, restaurante_id: int, hoy: date
    ) -> List[models.AlertaLog]:
        """Crea alertas PAGO_PROXIMO para pagos que vencen en los próximos 3 días."""
        import calendar as _cal
        dias_umbral = 3
        creadas: List[models.AlertaLog] = []

        pagos = db.query(models.PagoRecurrente).filter(
            models.PagoRecurrente.restaurante_id == restaurante_id,
            models.PagoRecurrente.activo == True,
            models.PagoRecurrente.dia_limite != None,
            models.PagoRecurrente.monto_estimado > 0,
        ).all()

        for pago in pagos:
            # Saltar si ya está marcado como pagado este mes
            if pago.pagado_mes == hoy.month and pago.pagado_anio == hoy.year:
                continue

            dia = pago.dia_limite
            mes_actual, anio_actual = hoy.month, hoy.year
            last_day = _cal.monthrange(anio_actual, mes_actual)[1]
            try:
                fecha_venc = hoy.replace(day=min(dia, last_day))
            except ValueError:
                continue

            if fecha_venc < hoy:
                continue  # Ya venció este mes

            dias_restantes = (fecha_venc - hoy).days
            if 0 <= dias_restantes <= dias_umbral:
                sev = "CRITICAL" if dias_restantes <= 1 else "WARNING"
                tipo_key = f"PAGO_PROXIMO_{pago.id}"
                alerta = self._crear_alerta(
                    db, restaurante_id, "PAGO_PROXIMO",
                    f"{pago.concepto} vence {'hoy' if dias_restantes == 0 else f'en {dias_restantes} día(s)'} — ${pago.monto_estimado:,.0f}",
                    float(dias_restantes), float(dias_umbral), sev,
                )
                # Anti-duplicado por concepto: verificar si ya existe en 24h
                if alerta is None:
                    # Puede haberse bloqueado por anti-duplicado de tipo "PAGO_PROXIMO"
                    # genérico. Verificar específicamente.
                    hace_24h = datetime.utcnow() - timedelta(hours=24)
                    existe = db.query(models.AlertaLog).filter(
                        models.AlertaLog.restaurante_id == restaurante_id,
                        models.AlertaLog.tipo == "PAGO_PROXIMO",
                        models.AlertaLog.mensaje.contains(pago.concepto),
                        models.AlertaLog.revisada == False,
                        models.AlertaLog.created_at >= hace_24h,
                    ).first()
                    if existe:
                        continue
                    # No existe duplicado específico — crear sin anti-duplicado genérico
                    alerta = models.AlertaLog(
                        restaurante_id=restaurante_id,
                        tipo="PAGO_PROXIMO",
                        mensaje=f"{pago.concepto} vence {'hoy' if dias_restantes == 0 else f'en {dias_restantes} día(s)'} — ${pago.monto_estimado:,.0f}",
                        valor_detectado=float(dias_restantes),
                        umbral_config=float(dias_umbral),
                        revisada=False,
                        severidad=sev,
                    )
                    db.add(alerta)
                if alerta:
                    creadas.append(alerta)

        return creadas


alertas_job = AlertasJob()
