import React, { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { Loader2, Trash2, Pencil, ChevronRight, X, Check } from "lucide-react";
import { useRestaurante } from "../context/RestauranteContext";

const fmt = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);

const n = (v: any) => parseFloat(v) || 0;

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface ArqueoCajaProps {
  onEditCierre?: (cierre: any) => void;
  onRegistrarFecha?: (fecha: string) => void;
}

const isoWeekInfo = (dateStr: string): { week: number; year: number } => {
  const d = new Date(dateStr + "T12:00:00");
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
    year: utc.getUTCFullYear(),
  };
};

const weekMonday = (isoYear: number, week: number): Date => {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday;
};

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

const fmtFechaCorta = (fechaStr: string) => {
  const d = new Date(fechaStr + "T12:00:00");
  return `${DIAS_CORTO[d.getDay()]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
};

const fmtFechaLarga = (fechaStr: string) => {
  const d = new Date(fechaStr + "T12:00:00");
  return `${DIAS_CORTO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]} ${d.getFullYear()}`;
};

// Canal filters config
type CanalFilter = "efectivo" | "parrot" | "terminales" | "plataformas";
const CANAL_FILTERS: { key: CanalFilter; label: string; color: string; bg: string; check: (c: any) => number }[] = [
  { key: "efectivo",    label: "💵 Efectivo",    color: "#059669", bg: "#F0FDF4",  check: c => n(c.ventas_efectivo) },
  { key: "parrot",      label: "📱 Parrot",       color: "#2563EB", bg: "#EFF6FF",  check: c => n(c.ventas_parrot) },
  { key: "terminales",  label: "💳 Terminal",     color: "#7C3AED", bg: "#F5F3FF",  check: c => n(c.ventas_terminales) },
  { key: "plataformas", label: "🛵 Plataformas",  color: "#EA580C", bg: "#FFF7ED",  check: c => n(c.ventas_uber) + n(c.ventas_rappi) },
];

// Formas de pago editables en el panel de detalle
const FORMAS_PAGO_EDITABLE = [
  { campo: "ventas_efectivo",    label: "Efectivo",    canal: "efectivo",    color: "#059669" },
  { campo: "ventas_parrot",      label: "Parrot Pay",  canal: "parrot",      color: "#2563EB" },
  { campo: "ventas_terminales",  label: "Terminales",  canal: "terminales",  color: "#7C3AED" },
  { campo: "ventas_uber",        label: "Uber Eats",   canal: "plataformas", color: "#EA580C" },
  { campo: "ventas_rappi",       label: "Rappi",       canal: "plataformas", color: "#EA580C" },
  { campo: "cortesias",          label: "Cortesías",   canal: null,          color: "#9CA3AF" },
  { campo: "otros_ingresos",     label: "Otros",       canal: null,          color: "#9CA3AF" },
];

export const ArqueoCaja: React.FC<ArqueoCajaProps> = ({ onEditCierre, onRegistrarFecha }) => {
  const { restauranteId } = useRestaurante();
  const [cierres, setCierres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [detailCierre, setDetailCierre] = useState<any | null>(null);

  // Canal filters
  const [filtrosActivos, setFiltrosActivos] = useState<Set<CanalFilter>>(new Set());
  const toggleFiltro = (key: CanalFilter) =>
    setFiltrosActivos(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  // Inline edit state
  const [editField, setEditField] = useState<string | null>(null);  // "campo"
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const hoy = new Date();
  const hoyStr = hoy.toISOString().split("T")[0];
  const [filtroMes, setFiltroMes] = useState(hoy.getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());

  const mesesTabs = useMemo(() => {
    const tabs = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      tabs.push({ mes: d.getMonth() + 1, anio: d.getFullYear(), label: `${MESES_CORTO[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
    }
    return tabs;
  }, []);

  const fetchCierres = async () => {
    setLoading(true);
    try {
      const params = `mes=${filtroMes}&anio=${filtroAnio}&limit=50${restauranteId ? `&restaurante_id=${restauranteId}` : ""}`;
      const data = await api.get(`/api/cierre-turno?${params}`);
      setCierres(Array.isArray(data) ? data : []);
    } catch { setCierres([]); }
    setLoading(false);
  };

  useEffect(() => { fetchCierres(); }, [filtroMes, filtroAnio, restauranteId]);

  // Filtered cierres for display
  const cierresFiltrados = useMemo(() => {
    if (filtrosActivos.size === 0) return cierres;
    return cierres.filter(c =>
      Array.from(filtrosActivos).some(k => {
        const fc = CANAL_FILTERS.find(f => f.key === k);
        return fc ? fc.check(c) > 0 : false;
      })
    );
  }, [cierres, filtrosActivos]);

  const semanaGroups = useMemo(() => {
    const groups: Record<string, { key: string; semana: number; isoAnio: number; cierres: any[]; totalVentas: number }> = {};
    for (const c of cierresFiltrados) {
      const { week, year } = isoWeekInfo(c.fecha);
      const key = `${year}-W${String(week).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = { key, semana: week, isoAnio: year, cierres: [], totalVentas: 0 };
      groups[key].cierres.push(c);
      groups[key].totalVentas += c.total_venta || 0;
    }
    return Object.values(groups).sort((a, b) =>
      a.isoAnio !== b.isoAnio ? b.isoAnio - a.isoAnio : b.semana - a.semana
    );
  }, [cierresFiltrados]);

  useEffect(() => {
    setExpandedWeek(semanaGroups.length > 0 ? semanaGroups[0].key : null);
    setDetailCierre(null);
  }, [semanaGroups]);

  const resumen = useMemo(() => {
    if (!cierres.length) return null;
    const diasEnMes = new Date(filtroAnio, filtroMes, 0).getDate();
    const totalVentas = cierres.reduce((s, c) => s + (c.total_venta || 0), 0);
    const mejorDia = cierres.reduce((best, c) => (c.total_venta || 0) > (best.total_venta || 0) ? c : best, cierres[0]);
    return { totalVentas, diasRegistrados: cierres.length, diasEnMes, mejorDia, promedioDiario: totalVentas / cierres.length };
  }, [cierres, filtroMes, filtroAnio]);

  const eliminarCierre = async (id: number) => {
    if (!confirm("¿Eliminar este cierre? Esta acción no se puede deshacer.")) return;
    try {
      await api.del("/api/cierre-turno/" + id);
      setCierres(prev => prev.filter(ci => ci.id !== id));
      if (detailCierre?.id === id) setDetailCierre(null);
    } catch { alert("Error al eliminar cierre"); }
  };

  // Inline edit handlers
  const startEdit = (campo: string, valorActual: number) => {
    setEditField(campo);
    setEditValue(String(valorActual || 0));
  };
  const cancelEdit = () => { setEditField(null); setEditValue(""); };
  const saveEdit = async () => {
    if (!detailCierre || !editField) return;
    setSavingEdit(true);
    try {
      const updated = await api.put(`/api/cierres/${detailCierre.id}/formas-pago`, {
        campo: editField,
        valor: parseFloat(editValue) || 0,
      });
      // Update local state
      const updatedCierre = { ...detailCierre, ...updated };
      setDetailCierre(updatedCierre);
      setCierres(prev => prev.map(c => c.id === detailCierre.id ? updatedCierre : c));
      setEditField(null);
      setEditValue("");
    } catch (e: any) {
      alert("Error al guardar: " + (e?.message || "Error desconocido"));
    } finally {
      setSavingEdit(false);
    }
  };

  const weekRangeLabel = (g: typeof semanaGroups[0]) => {
    const monday = weekMonday(g.isoAnio, g.semana);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const monthStart = new Date(Date.UTC(filtroAnio, filtroMes - 1, 1));
    const monthEnd = new Date(Date.UTC(filtroAnio, filtroMes, 0));
    const start = monday < monthStart ? monthStart : monday;
    const end = sunday > monthEnd ? monthEnd : sunday;
    const fmtD = (d: Date) => `${DIAS_CORTO[d.getUTCDay()]} ${d.getUTCDate()}`;
    return `${fmtD(start)} — ${fmtD(end)} ${MESES_CORTO[end.getUTCMonth()]}`;
  };

  const getWeekDays = (g: typeof semanaGroups[0]) => {
    const monday = weekMonday(g.isoAnio, g.semana);
    const cierreByFecha = new Map(g.cierres.map(c => [c.fecha, c]));
    const dias: { fechaStr: string; cierre: any | null; enMes: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const fechaStr = d.toISOString().split("T")[0];
      const enMes = d.getUTCMonth() + 1 === filtroMes && d.getUTCFullYear() === filtroAnio;
      const cierre = cierreByFecha.get(fechaStr) || null;
      if (enMes || cierre) dias.push({ fechaStr, cierre, enMes });
    }
    return dias.reverse();
  };

  const isActiveTab = (mes: number, anio: number) => mes === filtroMes && anio === filtroAnio;

  // Determine if a canal row should be highlighted based on active filters
  const isCanalHighlighted = (canal: string | null) => {
    if (filtrosActivos.size === 0) return false;
    if (!canal) return false;
    return filtrosActivos.has(canal as CanalFilter) ||
      (canal === "plataformas" && (filtrosActivos.has("plataformas")));
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>

      {/* ── Tabs de meses ── */}
      <div style={{ display: "flex", gap: "4px", background: "#FFF", borderRadius: "12px", padding: "4px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
        {mesesTabs.map(({ mes, anio, label }) => (
          <button
            key={`${mes}-${anio}`}
            onClick={() => { setFiltroMes(mes); setFiltroAnio(anio); }}
            style={{ flex: 1, padding: "8px 4px", borderRadius: "8px", border: "none", cursor: "pointer", background: isActiveTab(mes, anio) ? "#3D1C1E" : "transparent", color: isActiveTab(mes, anio) ? "#C8FF00" : "#6B7280", fontSize: "12px", fontWeight: isActiveTab(mes, anio) ? "700" : "500", transition: "all 0.15s", whiteSpace: "nowrap" }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Filtros por canal ── */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: "4px" }}>Filtrar:</span>
        <button
          onClick={() => setFiltrosActivos(new Set())}
          style={{
            padding: "5px 12px", borderRadius: "20px", border: "1px solid #E5E7EB", cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.15s",
            background: filtrosActivos.size === 0 ? "#111827" : "#FFF",
            color: filtrosActivos.size === 0 ? "#FFF" : "#6B7280",
          }}
        >
          Todos
        </button>
        {CANAL_FILTERS.map(f => {
          const active = filtrosActivos.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggleFiltro(f.key)}
              style={{
                padding: "5px 12px", borderRadius: "20px", border: `1px solid ${active ? f.color : "#E5E7EB"}`,
                cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.15s",
                background: active ? f.bg : "#FFF",
                color: active ? f.color : "#6B7280",
              }}
            >
              {f.label}
              {active && (
                <span style={{ marginLeft: "6px", fontSize: "10px", opacity: 0.7 }}>
                  ({cierres.filter(c => f.check(c) > 0).length})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Resumen del mes ── */}
      {resumen && !loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "16px" }}>
          {[
            { label: "Días registrados", value: `${resumen.diasRegistrados} / ${resumen.diasEnMes}`, sub: `${resumen.diasEnMes - resumen.diasRegistrados} sin cierre`, color: resumen.diasRegistrados === resumen.diasEnMes ? "#059669" : "#D97706" },
            { label: "Total ventas del mes", value: fmt(resumen.totalVentas), sub: `${MESES_LARGO[filtroMes - 1]} ${filtroAnio}`, color: "#111827" },
            { label: "Mejor día", value: fmt(resumen.mejorDia?.total_venta || 0), sub: resumen.mejorDia ? `${new Date(resumen.mejorDia.fecha + "T12:00:00").getDate()} de ${MESES_LARGO[filtroMes - 1]}` : "—", color: "#059669" },
            { label: "Promedio diario", value: fmt(resumen.promedioDiario), sub: `sobre ${resumen.diasRegistrados} días`, color: "#111827" },
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
      {!loading && cierres.length > 0 && cierresFiltrados.length === 0 && (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "32px", textAlign: "center", border: "1px dashed #E5E7EB" }}>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Ningún cierre coincide con los filtros seleccionados</p>
        </div>
      )}

      {/* ── Semana blocks ── */}
      {!loading && semanaGroups.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {semanaGroups.map(g => {
            const isOpen = expandedWeek === g.key;
            const dias = isOpen ? getWeekDays(g) : [];

            return (
              <div
                key={g.key}
                style={{ background: "#FFF", borderRadius: "12px", border: `1px solid ${isOpen ? "#E5E7EB" : "#F3F4F6"}`, boxShadow: isOpen ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 2px rgba(0,0,0,0.03)", overflow: "hidden", transition: "box-shadow 0.2s" }}
              >
                <button
                  onClick={() => setExpandedWeek(isOpen ? null : g.key)}
                  style={{ width: "100%", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <div style={{ color: "#9CA3AF", flexShrink: 0, display: "flex", alignItems: "center", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
                    <ChevronRight style={{ width: "15px", height: "15px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>Semana {g.semana}</span>
                    <span style={{ fontSize: "12px", color: "#6B7280" }}>· {weekRangeLabel(g)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                    <span style={{ fontSize: "15px", fontWeight: "800", color: "#111827" }}>{fmt(g.totalVentas)}</span>
                    <span style={{ fontSize: "11px", color: "#9CA3AF", background: "#F3F4F6", padding: "2px 8px", borderRadius: "8px" }}>{g.cierres.length}d</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: "1px solid #F3F4F6" }}>
                    {dias.map(({ fechaStr, cierre, enMes }) => {
                      const isPast = fechaStr <= hoyStr;
                      const showSinRegistro = !cierre && enMes && isPast;
                      if (!cierre && !showSinRegistro) return null;

                      const dotColor = cierre ? arqueoColor(cierre.estado) : "#D1D5DB";
                      // Highlight if filtered canal matches
                      const highlighted = filtrosActivos.size > 0 && cierre &&
                        Array.from(filtrosActivos).some(k => {
                          const fc = CANAL_FILTERS.find(f => f.key === k);
                          return fc ? fc.check(cierre) > 0 : false;
                        });

                      return (
                        <div
                          key={fechaStr}
                          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderBottom: "1px solid #F9FAFB", transition: "background 0.1s", cursor: cierre ? "pointer" : "default", background: highlighted ? "#FAFBFF" : "transparent" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFC")}
                          onMouseLeave={e => (e.currentTarget.style.background = highlighted ? "#FAFBFF" : "transparent")}
                          onClick={() => cierre && setDetailCierre(cierre)}
                        >
                          <span style={{ fontSize: "13px", fontWeight: "600", color: cierre ? "#111827" : "#9CA3AF", width: "82px", flexShrink: 0 }}>
                            {fmtFechaCorta(fechaStr)}
                          </span>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: cierre ? "#111827" : "#D1D5DB", width: "92px", flexShrink: 0, textAlign: "right" }}>
                            {cierre ? fmt(cierre.total_venta || 0) : "Sin registro"}
                          </span>
                          {/* Canal chips */}
                          <div style={{ flex: 1, display: "flex", gap: "4px", overflow: "hidden" }}>
                            {cierre && CANAL_FILTERS.filter(f => f.check(cierre) > 0).map(f => (
                              <span key={f.key} style={{
                                fontSize: "10px", fontWeight: "600", padding: "1px 6px", borderRadius: "8px",
                                background: filtrosActivos.has(f.key) ? f.bg : "#F3F4F6",
                                color: filtrosActivos.has(f.key) ? f.color : "#9CA3AF",
                                border: filtrosActivos.has(f.key) ? `1px solid ${f.color}33` : "none",
                              }}>
                                {f.label.split(" ")[1]}
                              </span>
                            ))}
                          </div>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                          {cierre ? (
                            <div style={{ color: "#D1D5DB", flexShrink: 0 }}>
                              <ChevronRight style={{ width: "15px", height: "15px" }} />
                            </div>
                          ) : (
                            onRegistrarFecha && (
                              <button
                                onClick={e => { e.stopPropagation(); onRegistrarFecha(fechaStr); }}
                                style={{ border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", color: "#6B7280", flexShrink: 0 }}
                              >
                                + Registrar
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Side panel de detalle ── */}
      {detailCierre && (
        <>
          <div
            onClick={() => { setDetailCierre(null); setEditField(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 200, backdropFilter: "blur(2px)" }}
          />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "440px", background: "#FFF", zIndex: 201, boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", overflowY: "auto" }}>

            {/* Panel header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "800", color: "#111827" }}>{fmtFechaLarga(detailCierre.fecha)}</div>
                <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "3px" }}>
                  Elaboró: {detailCierre.elaborado_por || detailCierre.responsable}
                  {detailCierre.semana_numero ? ` · Semana ${detailCierre.semana_numero}` : ""}
                </div>
                {detailCierre.edited_by && (
                  <div style={{ fontSize: "11px", color: "#D97706", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span>✏️</span> Editado por {detailCierre.edited_by}
                    {detailCierre.edited_at && ` · ${new Date(detailCierre.edited_at).toLocaleDateString("es-MX")}`}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setDetailCierre(null); setEditField(null); }}
                style={{ border: "none", background: "#F3F4F6", cursor: "pointer", padding: "6px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <X style={{ width: "16px", height: "16px", color: "#6B7280" }} />
              </button>
            </div>

            {/* Panel body */}
            <div style={{ padding: "20px 24px", flex: 1 }}>

              {/* Ventas por canal — con edición inline */}
              <div style={{ background: "#F9FFF9", borderRadius: "10px", padding: "14px 16px", border: "1px solid #D1FAE5", marginBottom: "12px" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#059669", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Ventas por canal</span>
                  <span style={{ fontSize: "9px", fontWeight: "500", color: "#9CA3AF" }}>Clic ✏️ para editar</span>
                </div>
                {FORMAS_PAGO_EDITABLE.filter(fp => (detailCierre[fp.campo] || 0) > 0 || editField === fp.campo).map(fp => {
                  const isEditing = editField === fp.campo;
                  const highlighted = fp.canal && filtrosActivos.has(fp.canal as CanalFilter);
                  return (
                    <div key={fp.campo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #F0FDF4", background: highlighted ? "#ECFDF5" : "transparent", borderRadius: "4px", paddingLeft: highlighted ? "6px" : "0" }}>
                      <span style={{ fontSize: "13px", color: highlighted ? fp.color : "#374151", fontWeight: highlighted ? "700" : "400", minWidth: "90px" }}>{fp.label}</span>
                      {isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "#9CA3AF", fontWeight: "700" }}>$</span>
                            <input
                              autoFocus
                              type="number"
                              step="0.01"
                              min="0"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                              style={{ width: "110px", padding: "4px 8px 4px 22px", borderRadius: "6px", border: "2px solid #059669", fontSize: "13px", fontWeight: "700", textAlign: "right", outline: "none" }}
                            />
                          </div>
                          <button
                            onClick={saveEdit}
                            disabled={savingEdit}
                            style={{ border: "none", background: "#059669", color: "#FFF", borderRadius: "6px", width: "28px", height: "28px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            title="Guardar"
                          >
                            {savingEdit ? <Loader2 style={{ width: "13px", height: "13px", animation: "spin 1s linear infinite" }} /> : <Check style={{ width: "13px", height: "13px" }} />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{ border: "none", background: "#F3F4F6", color: "#6B7280", borderRadius: "6px", width: "28px", height: "28px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            title="Cancelar"
                          >
                            <X style={{ width: "13px", height: "13px" }} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{fmt(detailCierre[fp.campo] || 0)}</span>
                          <button
                            onClick={() => startEdit(fp.campo, detailCierre[fp.campo] || 0)}
                            style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 4px", borderRadius: "4px", color: "#D1D5DB", fontSize: "12px", lineHeight: 1 }}
                            title="Editar"
                            onMouseEnter={e => (e.currentTarget.style.color = "#059669")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#D1D5DB")}
                          >
                            <Pencil style={{ width: "12px", height: "12px" }} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Total */}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #86EFAC", paddingTop: "8px", marginTop: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "800", color: "#059669" }}>Total</span>
                  <span style={{ fontSize: "15px", fontWeight: "800", color: "#059669" }}>{fmt(detailCierre.total_venta || 0)}</span>
                </div>
              </div>

              {/* Propinas */}
              {(() => {
                const totalPropinas = n(detailCierre.propinas_efectivo) + n(detailCierre.propinas_parrot) + n(detailCierre.propinas_terminales);
                return (
                  <div style={{ background: "#FAF5FF", borderRadius: "10px", padding: "14px 16px", border: "1px solid #E9D5FF", marginBottom: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Propinas</div>
                    {totalPropinas === 0 ? (
                      <span style={{ fontSize: "13px", color: "#9CA3AF", fontStyle: "italic" }}>Sin propinas registradas</span>
                    ) : (
                      <>
                        {[
                          { l: "Efectivo", v: detailCierre.propinas_efectivo },
                          { l: "Parrot Pay", v: detailCierre.propinas_parrot },
                          { l: "Terminales", v: detailCierre.propinas_terminales },
                        ].filter(x => (x.v || 0) > 0).map((x, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                            <span style={{ fontSize: "13px", color: "#374151" }}>{x.l}</span>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{fmt(x.v || 0)}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #C4B5FD", paddingTop: "8px", marginTop: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "800", color: "#7C3AED" }}>Total propinas</span>
                          <span style={{ fontSize: "14px", fontWeight: "800", color: "#7C3AED" }}>{fmt(totalPropinas)}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Arqueo */}
              <div style={{ background: detailCierre.estado === "CUADRADA" ? "#F9FFF9" : detailCierre.estado === "SOBRANTE" ? "#FFFBEB" : detailCierre.estado === "FALTANTE" ? "#FFF5F5" : "#FAFBFC", borderRadius: "10px", padding: "14px 16px", border: `1px solid ${arqueoColor(detailCierre.estado)}33`, marginBottom: "12px" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Arqueo de caja</div>
                {[
                  { l: "Saldo inicial", v: detailCierre.saldo_inicial },
                  { l: "Efectivo real", v: detailCierre.efectivo_fisico },
                ].map((x, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: "13px", color: "#374151" }}>{x.l}</span>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{x.v != null ? fmt(x.v) : "—"}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${arqueoColor(detailCierre.estado)}55`, paddingTop: "8px", marginTop: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: arqueoColor(detailCierre.estado) }}>Diferencia</span>
                  <span style={{ fontSize: "13px", fontWeight: "800", color: arqueoColor(detailCierre.estado) }}>
                    {arqueoLabel(detailCierre.estado, detailCierre.diferencia)}
                  </span>
                </div>
              </div>

              {/* Gastos */}
              {detailCierre.gastos && detailCierre.gastos.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Gastos del día</div>
                  <div style={{ background: "#FAFBFC", borderRadius: "8px", overflow: "hidden", border: "1px solid #F3F4F6" }}>
                    {detailCierre.gastos.map((g: any, i: number) => (
                      <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: i < detailCierre.gastos.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                        <div>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>{g.proveedor}</span>
                          <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "6px" }}>{(g.categoria || "").replace(/_/g, " ")}</span>
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#DC2626" }}>{fmt(g.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas */}
              {detailCierre.notas && (
                <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#FFFBEB", border: "1px solid #FDE68A", marginBottom: "12px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#D97706", textTransform: "uppercase", marginRight: "6px" }}>Notas:</span>
                  <span style={{ fontSize: "13px", color: "#92400E" }}>{detailCierre.notas}</span>
                </div>
              )}
            </div>

            {/* Panel footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F3F4F6", display: "flex", gap: "8px", flexShrink: 0 }}>
              <button
                onClick={() => eliminarCierre(detailCierre.id)}
                style={{ padding: "9px 16px", borderRadius: "9px", border: "1px solid #FCA5A5", background: "#FFF", fontSize: "13px", fontWeight: "600", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Trash2 style={{ width: "14px", height: "14px" }} /> Eliminar
              </button>
              {onEditCierre && (
                <button
                  onClick={() => { onEditCierre(detailCierre); setDetailCierre(null); setEditField(null); }}
                  style={{ flex: 1, padding: "9px 16px", borderRadius: "9px", border: "none", background: "#3D1C1E", fontSize: "13px", fontWeight: "700", color: "#C8FF00", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <Pencil style={{ width: "14px", height: "14px" }} /> Editar este cierre
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
