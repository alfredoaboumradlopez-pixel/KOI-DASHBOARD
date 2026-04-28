import React, { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { Loader2, Trash2, Pencil, ChevronDown, ChevronUp } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface ArqueoCajaProps {
  onEditCierre?: (cierre: any) => void;
  onRegistrarFecha?: (fecha: string) => void;
}

const arqueoColor = (estado: string | null | undefined) => {
  if (estado === "CUADRADA") return "#059669";
  if (estado === "SOBRANTE") return "#D97706";
  if (estado === "FALTANTE") return "#DC2626";
  return "#D1D5DB";
};

const arqueoLabel = (estado: string | null | undefined, diferencia: number | null | undefined) => {
  if (estado === "CUADRADA") return "✓ Cuadra";
  if (estado === "SOBRANTE") return `+${fmt(diferencia || 0)} sobrante`;
  if (estado === "FALTANTE") return `${fmt(diferencia || 0)} faltante`;
  return "Sin arqueo";
};

const parseFechaLabel = (fecha: string) => {
  const d = new Date(fecha + "T12:00:00");
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]} ${d.getFullYear()}`;
};

const canalResumen = (c: any) =>
  [
    { l: "Efectivo", v: c.ventas_efectivo },
    { l: "Parrot", v: c.ventas_parrot },
    { l: "Terminal", v: c.ventas_terminales },
    { l: "Uber", v: c.ventas_uber },
    { l: "Rappi", v: c.ventas_rappi },
    { l: "Cortesías", v: c.cortesias },
    { l: "Otros", v: c.otros_ingresos },
  ]
    .filter(x => (x.v || 0) > 0)
    .map(x => `${x.l} ${fmt(x.v || 0)}`)
    .join(" · ");

export const ArqueoCaja: React.FC<ArqueoCajaProps> = ({ onEditCierre, onRegistrarFecha }) => {
  const [cierres, setCierres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<number | null>(null);

  const hoy = new Date();
  const [filtroMes, setFiltroMes] = useState(hoy.getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());

  // ── Últimos 6 meses como tabs ──
  const mesesTabs = useMemo(() => {
    const tabs = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      tabs.push({
        mes: d.getMonth() + 1,
        anio: d.getFullYear(),
        label: `${MESES_CORTO[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      });
    }
    return tabs;
  }, []);

  const fetchCierres = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/cierre-turno?mes=${filtroMes}&anio=${filtroAnio}&limit=50`);
      setCierres(Array.isArray(data) ? data : []);
    } catch { setCierres([]); }
    setLoading(false);
  };

  useEffect(() => { fetchCierres(); }, [filtroMes, filtroAnio]);

  const toggle = (id: number) => setExpandido(expandido === id ? null : id);

  const eliminarCierre = async (id: number) => {
    if (!confirm("¿Eliminar este cierre? Esta acción no se puede deshacer.")) return;
    try {
      await api.del("/api/cierre-turno/" + id);
      setCierres(prev => prev.filter(ci => ci.id !== id));
    } catch { alert("Error al eliminar cierre"); }
  };

  // ── Resumen del mes ──
  const resumen = useMemo(() => {
    if (!cierres.length) return null;
    const diasEnMes = new Date(filtroAnio, filtroMes, 0).getDate();
    const totalVentas = cierres.reduce((s, c) => s + (c.total_venta || 0), 0);
    const mejorDia = cierres.reduce(
      (best, c) => (c.total_venta || 0) > (best.total_venta || 0) ? c : best,
      cierres[0],
    );
    const promedioDiario = cierres.length > 0 ? totalVentas / cierres.length : 0;
    return { totalVentas, diasRegistrados: cierres.length, diasEnMes, mejorDia, promedioDiario };
  }, [cierres, filtroMes, filtroAnio]);

  // ── Días sin cierre ──
  const diasSinCierre = useMemo(() => {
    const diasEnMes = new Date(filtroAnio, filtroMes, 0).getDate();
    const fechasRegistradas = new Set(cierres.map(c => c.fecha));
    const hoyStr = hoy.toISOString().split("T")[0];
    const faltantes: string[] = [];
    for (let d = 1; d <= diasEnMes; d++) {
      const fechaStr = `${filtroAnio}-${String(filtroMes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      // Solo incluir días que ya pasaron (o hoy)
      if (fechaStr <= hoyStr && !fechasRegistradas.has(fechaStr)) {
        faltantes.push(fechaStr);
      }
    }
    return faltantes;
  }, [cierres, filtroMes, filtroAnio]);

  const isActiveTab = (mes: number, anio: number) => mes === filtroMes && anio === filtroAnio;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>

      {/* ── Tabs de meses ── */}
      <div style={{ display: "flex", gap: "4px", background: "#FFF", borderRadius: "12px", padding: "4px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
        {mesesTabs.map(({ mes, anio, label }) => {
          const active = isActiveTab(mes, anio);
          return (
            <button
              key={`${mes}-${anio}`}
              onClick={() => { setFiltroMes(mes); setFiltroAnio(anio); setExpandido(null); }}
              style={{ flex: 1, padding: "8px 4px", borderRadius: "8px", border: "none", cursor: "pointer", background: active ? "#3D1C1E" : "transparent", color: active ? "#C8FF00" : "#6B7280", fontSize: "12px", fontWeight: active ? "700" : "500", transition: "all 0.15s", whiteSpace: "nowrap" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Resumen del mes ── */}
      {resumen && !loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "16px" }}>
          {[
            {
              label: "Días registrados",
              value: `${resumen.diasRegistrados} / ${resumen.diasEnMes}`,
              sub: `${resumen.diasEnMes - resumen.diasRegistrados} sin cierre`,
              color: resumen.diasRegistrados === resumen.diasEnMes ? "#059669" : "#D97706",
            },
            {
              label: "Total ventas del mes",
              value: fmt(resumen.totalVentas),
              sub: MESES_LARGO[filtroMes - 1] + " " + filtroAnio,
              color: "#111827",
            },
            {
              label: "Mejor día",
              value: fmt(resumen.mejorDia?.total_venta || 0),
              sub: resumen.mejorDia ? `${new Date(resumen.mejorDia.fecha + "T12:00:00").getDate()} de ${MESES_LARGO[filtroMes - 1]}` : "—",
              color: "#059669",
            },
            {
              label: "Promedio diario",
              value: fmt(resumen.promedioDiario),
              sub: `sobre ${resumen.diasRegistrados} días`,
              color: "#111827",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: "#FFF", borderRadius: "12px", padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{label}</div>
              <div style={{ fontSize: "18px", fontWeight: "800", color, lineHeight: 1.1 }}>{value}</div>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: "48px", textAlign: "center" }}>
          <Loader2 style={{ width: "28px", height: "28px", color: "#9CA3AF", margin: "0 auto", animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && cierres.length === 0 && (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "48px", textAlign: "center", border: "1px solid #F3F4F6" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📋</div>
          <p style={{ fontSize: "14px", fontWeight: "600", color: "#374151", margin: 0 }}>Sin cierres para {MESES_LARGO[filtroMes - 1]} {filtroAnio}</p>
          <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "4px 0 0" }}>Registra el primer cierre del mes</p>
        </div>
      )}

      {/* ── Lista de cierres ── */}
      {!loading && cierres.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {cierres.map((c: any) => {
            const isOpen = expandido === c.id;
            const dotColor = arqueoColor(c.estado);
            const totalPropinas = (c.propinas_efectivo || 0) + (c.propinas_parrot || 0) + (c.propinas_terminales || 0);
            const tv = c.total_venta || 0;
            const pct = tv > 0 ? (totalPropinas / tv * 100) : 0;
            const resumenCanales = canalResumen(c);

            return (
              <div
                key={c.id}
                style={{ background: "#FFF", borderRadius: "12px", border: `1px solid ${isOpen ? "#E5E7EB" : "#F3F4F6"}`, boxShadow: isOpen ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 2px rgba(0,0,0,0.03)", overflow: "hidden", transition: "box-shadow 0.15s" }}
              >
                {/* ── Collapsed row ── */}
                <button
                  onClick={() => toggle(c.id)}
                  style={{ width: "100%", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "flex-start", gap: "12px" }}
                >
                  {/* Arqueo dot */}
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: dotColor, flexShrink: 0, marginTop: "4px" }} />

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>
                        {parseFechaLabel(c.fecha)}
                      </span>
                      <span style={{ fontSize: "16px", fontWeight: "800", color: "#111827", whiteSpace: "nowrap" }}>
                        {fmt(c.total_venta || 0)}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                      Elaboró: {c.elaborado_por || c.responsable}
                      {c.semana_numero ? ` · Semana ${c.semana_numero}` : ""}
                      {c.estado && (
                        <span style={{ color: dotColor, fontWeight: "600", marginLeft: "8px" }}>
                          · {arqueoLabel(c.estado, c.diferencia)}
                        </span>
                      )}
                    </div>
                    {resumenCanales && (
                      <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {resumenCanales}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                    <button
                      onClick={e => { e.stopPropagation(); eliminarCierre(c.id); }}
                      title="Eliminar"
                      style={{ border: "none", background: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", display: "flex", alignItems: "center" }}
                    >
                      <Trash2 style={{ width: "13px", height: "13px", color: "#DC2626" }} />
                    </button>
                    {isOpen
                      ? <ChevronUp style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />
                      : <ChevronDown style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />
                    }
                  </div>
                </button>

                {/* ── Expanded detail ── */}
                {isOpen && (
                  <div style={{ padding: "0 18px 18px", borderTop: "1px solid #F3F4F6" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "14px" }}>

                      {/* Ventas por canal */}
                      <div style={{ background: "#F9FFF9", borderRadius: "10px", padding: "12px 14px", border: "1px solid #D1FAE5" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#059669", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Ventas por canal</div>
                        {[
                          { l: "Efectivo", v: c.ventas_efectivo },
                          { l: "Parrot Pay", v: c.ventas_parrot },
                          { l: "Terminales", v: c.ventas_terminales },
                          { l: "Uber Eats", v: c.ventas_uber },
                          { l: "Rappi", v: c.ventas_rappi },
                          { l: "Cortesías", v: c.cortesias },
                          { l: "Otros", v: c.otros_ingresos },
                        ].filter(x => (x.v || 0) > 0).map((x, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                            <span style={{ fontSize: "12px", color: "#374151" }}>{x.l}</span>
                            <span style={{ fontSize: "12px", fontWeight: "700", color: "#111827" }}>{fmt(x.v || 0)}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #86EFAC", paddingTop: "6px", marginTop: "6px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "800", color: "#059669" }}>Total</span>
                          <span style={{ fontSize: "13px", fontWeight: "800", color: "#059669" }}>{fmt(c.total_venta || 0)}</span>
                        </div>
                      </div>

                      {/* Propinas + Arqueo */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {/* Propinas */}
                        <div style={{ background: "#FAF5FF", borderRadius: "10px", padding: "12px 14px", border: "1px solid #E9D5FF" }}>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Propinas</div>
                          {[
                            { l: "Efectivo", v: c.propinas_efectivo },
                            { l: "Parrot Pay", v: c.propinas_parrot },
                            { l: "Terminales", v: c.propinas_terminales },
                          ].filter(x => (x.v || 0) > 0).map((x, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                              <span style={{ fontSize: "12px", color: "#374151" }}>{x.l}</span>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: "#111827" }}>{fmt(x.v || 0)}</span>
                            </div>
                          ))}
                          {totalPropinas === 0 && (
                            <span style={{ fontSize: "12px", color: "#9CA3AF", fontStyle: "italic" }}>Sin propinas</span>
                          )}
                          {totalPropinas > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #C4B5FD", paddingTop: "5px", marginTop: "5px" }}>
                              <span style={{ fontSize: "12px", fontWeight: "800", color: "#7C3AED" }}>Total</span>
                              <span style={{ fontSize: "13px", fontWeight: "800", color: "#7C3AED" }}>{fmt(totalPropinas)}</span>
                            </div>
                          )}
                        </div>

                        {/* Arqueo de caja */}
                        <div style={{ background: c.estado === "CUADRADA" ? "#F9FFF9" : c.estado === "SOBRANTE" ? "#FFFBEB" : c.estado === "FALTANTE" ? "#FFF5F5" : "#FAFBFC", borderRadius: "10px", padding: "12px 14px", border: `1px solid ${arqueoColor(c.estado)}33` }}>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Arqueo de caja</div>
                          {[
                            { l: "Saldo inicial", v: c.saldo_inicial },
                            { l: "Efectivo real", v: c.efectivo_fisico },
                          ].map((x, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                              <span style={{ fontSize: "12px", color: "#374151" }}>{x.l}</span>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: "#111827" }}>{x.v != null ? fmt(x.v) : "—"}</span>
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${arqueoColor(c.estado)}55`, paddingTop: "5px", marginTop: "5px" }}>
                            <span style={{ fontSize: "12px", fontWeight: "700", color: arqueoColor(c.estado) }}>Diferencia</span>
                            <span style={{ fontSize: "12px", fontWeight: "800", color: arqueoColor(c.estado) }}>
                              {arqueoLabel(c.estado, c.diferencia)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Propinas % alerta */}
                    {tv > 0 && (pct < 10 || pct > 15) && (
                      <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "8px", background: pct < 10 ? "#FEF2F2" : "#FEF3C7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: pct < 10 ? "#DC2626" : "#D97706" }}>
                          {pct < 10 ? "⚠ Propinas bajas" : "⚠ Propinas altas"}: {pct.toFixed(1)}% (esperado 10%–15%)
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: pct < 10 ? "#DC2626" : "#D97706" }}>
                          {fmt(totalPropinas)} / {fmt(tv)}
                        </span>
                      </div>
                    )}

                    {/* Gastos del día */}
                    {c.gastos && c.gastos.length > 0 && (
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Gastos del día</div>
                        <div style={{ background: "#FAFBFC", borderRadius: "8px", overflow: "hidden", border: "1px solid #F3F4F6" }}>
                          {c.gastos.map((g: any, i: number) => (
                            <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderBottom: i < c.gastos.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                              <div>
                                <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>{g.proveedor}</span>
                                <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "6px" }}>{(g.categoria || "").replace(/_/g, " ")}</span>
                                {g.descripcion && <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "4px" }}>· {g.descripcion}</span>}
                              </div>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: "#DC2626" }}>{fmt(g.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notas */}
                    {c.notas && (
                      <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "8px", background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                        <span style={{ fontSize: "10px", fontWeight: "700", color: "#D97706", textTransform: "uppercase", marginRight: "6px" }}>Notas:</span>
                        <span style={{ fontSize: "12px", color: "#92400E" }}>{c.notas}</span>
                      </div>
                    )}

                    {/* Footer actions */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #F3F4F6" }}>
                      <button
                        onClick={() => eliminarCierre(c.id)}
                        style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid #FCA5A5", background: "#FFF", fontSize: "12px", fontWeight: "600", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                      >
                        <Trash2 style={{ width: "13px", height: "13px" }} /> Eliminar
                      </button>
                      {onEditCierre && (
                        <button
                          onClick={() => onEditCierre(c)}
                          style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "#3D1C1E", fontSize: "12px", fontWeight: "700", color: "#C8FF00", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                        >
                          <Pencil style={{ width: "13px", height: "13px" }} /> Editar cierre
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Días sin cierre ── */}
      {!loading && diasSinCierre.length > 0 && (
        <div style={{ background: "#FFFBEB", borderRadius: "12px", padding: "14px 18px", border: "1px solid #FDE68A" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <span style={{ fontSize: "15px" }}>⚠️</span>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "#92400E" }}>
              {diasSinCierre.length} día{diasSinCierre.length !== 1 ? "s" : ""} sin cierre en {MESES_LARGO[filtroMes - 1]}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {diasSinCierre.map(fechaStr => {
              const d = new Date(fechaStr + "T12:00:00");
              const label = `${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
              return (
                <div key={fechaStr} style={{ display: "flex", alignItems: "center", gap: "4px", background: "#FFF", borderRadius: "8px", padding: "4px 10px", border: "1px solid #FCD34D" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#92400E" }}>{label}</span>
                  {onRegistrarFecha && (
                    <button
                      onClick={() => onRegistrarFecha(fechaStr)}
                      style={{ border: "none", background: "#FDE68A", borderRadius: "5px", padding: "1px 6px", fontSize: "10px", fontWeight: "700", color: "#92400E", cursor: "pointer" }}
                    >
                      Registrar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
