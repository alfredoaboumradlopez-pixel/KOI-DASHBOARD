/**
 * Tabulador de Propinas
 * Distribución semanal de propinas entre empleados.
 */
import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Empleado {
  id: number;
  semana_id: number;
  nombre: string;
  trabajo_lun: boolean;
  trabajo_mar: boolean;
  trabajo_mie: boolean;
  trabajo_jue: boolean;
  trabajo_vie: boolean;
  trabajo_sab: boolean;
  trabajo_dom: boolean;
  propina_calculada: number;
  adelanto: number;
  total_neto: number;
}

interface Semana {
  id: number;
  restaurante_id: number;
  numero_semana: number;
  anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  propina_lun: number;
  propina_mar: number;
  propina_mie: number;
  propina_jue: number;
  propina_vie: number;
  propina_sab: number;
  propina_dom: number;
  total_propinas: number;
  total_empleados: number;
  total_restaurante: number;
  estado: string;
  empleados: Empleado[];
}

interface Config {
  porcentaje_empleados: number;
  porcentaje_restaurante: number;
}

const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
type Dia = typeof DIAS[number];
const DIA_LABEL: Record<Dia, string> = { lun: "Lun", mar: "Mar", mie: "Mié", jue: "Jue", vie: "Vie", sab: "Sáb", dom: "Dom" };

const fmt = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

function isoWeekAndYear(d: Date): { semana: number; anio: number } {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { semana, anio: tmp.getUTCFullYear() };
}

// ─── Design tokens (matching CapturaGastos / RBO system) ─────────────────────
const T = {
  // backgrounds
  pageBg:   "#F9FAFB",
  cardBg:   "#FFF",
  rowAlt:   "#F9FAFB",
  rowHover: "#F3F4F6",
  // text
  textPrimary:   "#111827",
  textSecondary: "#6B7280",
  textTertiary:  "#9CA3AF",
  // borders
  borderBase:    "#E5E7EB",
  borderLight:   "#F3F4F6",
  // accents
  purple:   "#7C3AED",
  purpleBg: "#F3E8FF",
  green:    "#059669",
  greenBg:  "#F0FDF4",
  red:      "#EF4444",
  redBg:    "#FEF2F2",
  amber:    "#D97706",
  amberBg:  "#FFFBEB",
  brand:    "#3D1C1E",
  // card shadow
  shadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",
};

// ─── Component ───────────────────────────────────────────────────────────────

export const Propinas = () => {
  const { restauranteId } = useRestaurante();

  const today = new Date();
  const { semana: semanaHoy, anio: anioHoy } = isoWeekAndYear(today);

  const [semanaActual, setSemanaActual] = useState(semanaHoy);
  const [anioActual, setAnioActual] = useState(anioHoy);
  const [semana, setSemana] = useState<Semana | null>(null);
  const [listaSemanas, setListaSemanas] = useState<Semana[]>([]);
  const [config, setConfig] = useState<Config>({ porcentaje_empleados: 90, porcentaje_restaurante: 10 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  // Modals
  const [showConfig, setShowConfig] = useState(false);
  const [configEdit, setConfigEdit] = useState<Config>({ porcentaje_empleados: 90, porcentaje_restaurante: 10 });
  const [showAddEmpleado, setShowAddEmpleado] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [showEditPool, setShowEditPool] = useState(false);
  const [poolEdit, setPoolEdit] = useState<Record<Dia, number>>({ lun: 0, mar: 0, mie: 0, jue: 0, vie: 0, sab: 0, dom: 0 });
  const [showLista, setShowLista] = useState(false);

  // ── Load config ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!restauranteId) return;
    api.get(`/api/propinas/config/${restauranteId}`)
      .then((d: any) => setConfig({ porcentaje_empleados: d.porcentaje_empleados, porcentaje_restaurante: d.porcentaje_restaurante }))
      .catch(() => {});
  }, [restauranteId]);

  // ── Load week ──────────────────────────────────────────────────────────────
  const cargarSemana = useCallback(async (sem: number, anio: number) => {
    if (!restauranteId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/propinas/semana/${restauranteId}?semana=${sem}&anio=${anio}`);
      setSemana(data as Semana);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    cargarSemana(semanaActual, anioActual);
  }, [semanaActual, anioActual, cargarSemana]);

  // ── Load semanas list ──────────────────────────────────────────────────────
  const cargarLista = async () => {
    if (!restauranteId) return;
    const data = await api.get(`/api/propinas/semanas/${restauranteId}?anio=${anioActual}`);
    setListaSemanas(data as Semana[]);
    setShowLista(true);
  };

  // ── Navegación ─────────────────────────────────────────────────────────────
  const irSemana = (delta: number) => {
    let s = semanaActual + delta;
    let a = anioActual;
    if (s < 1) { a -= 1; s = 52; }
    if (s > 52) { a += 1; s = 1; }
    setSemanaActual(s);
    setAnioActual(a);
  };

  // ── Toggle día trabajado ───────────────────────────────────────────────────
  const toggleDia = async (emp: Empleado, dia: Dia) => {
    if (!semana) return;
    setSaving(emp.id);
    try {
      const updated = await api.put(`/api/propinas/empleado/${emp.id}`, {
        [`trabajo_${dia}`]: !(emp as any)[`trabajo_${dia}`],
      });
      setSemana(updated as Semana);
    } finally {
      setSaving(null);
    }
  };

  // ── Adelanto ───────────────────────────────────────────────────────────────
  const [adelantoEdit, setAdelantoEdit] = useState<Record<number, string>>({});

  const guardarAdelanto = async (emp: Empleado) => {
    const val = parseFloat(adelantoEdit[emp.id] ?? String(emp.adelanto));
    if (isNaN(val)) return;
    setSaving(emp.id);
    try {
      const updated = await api.put(`/api/propinas/empleado/${emp.id}`, { adelanto: val });
      setSemana(updated as Semana);
      setAdelantoEdit((prev) => { const n = { ...prev }; delete n[emp.id]; return n; });
    } finally {
      setSaving(null);
    }
  };

  // ── Add empleado ───────────────────────────────────────────────────────────
  const agregarEmpleado = async () => {
    if (!semana || !nuevoNombre.trim()) return;
    setSaving(-1);
    try {
      const updated = await api.post(`/api/propinas/semana/${semana.id}/empleado`, { nombre: nuevoNombre.trim() });
      setSemana(updated as Semana);
      setNuevoNombre("");
      setShowAddEmpleado(false);
    } finally {
      setSaving(null);
    }
  };

  // ── Delete empleado ────────────────────────────────────────────────────────
  const eliminarEmpleado = async (emp: Empleado) => {
    if (!confirm(`¿Eliminar a ${emp.nombre} de esta semana?`)) return;
    setSaving(emp.id);
    try {
      const updated = await api.del(`/api/propinas/empleado/${emp.id}`);
      if (updated && (updated as any).empleados) {
        setSemana(updated as Semana);
      } else {
        await cargarSemana(semanaActual, anioActual);
      }
    } finally {
      setSaving(null);
    }
  };

  // ── Recalcular desde cierres ───────────────────────────────────────────────
  const recalcular = async () => {
    if (!semana) return;
    setSaving(-99);
    try {
      const updated = await api.post(`/api/propinas/semana/${semana.id}/recalcular`, {});
      setSemana(updated as Semana);
    } finally {
      setSaving(null);
    }
  };

  // ── Cerrar semana ─────────────────────────────────────────────────────────
  const toggleEstado = async () => {
    if (!semana) return;
    const nuevo = semana.estado === "cerrado" ? "borrador" : "cerrado";
    const updated = await api.put(`/api/propinas/semana/${semana.id}/estado?estado=${nuevo}`, {});
    setSemana(updated as Semana);
  };

  // ── Guardar pool manual ────────────────────────────────────────────────────
  const guardarPool = async () => {
    if (!semana) return;
    setSaving(-2);
    try {
      const payload = Object.fromEntries(DIAS.map((d) => [`propina_${d}`, poolEdit[d]]));
      const updated = await api.put(`/api/propinas/semana/${semana.id}/pool`, payload);
      setSemana(updated as Semana);
      setShowEditPool(false);
    } finally {
      setSaving(null);
    }
  };

  // ── Save config ────────────────────────────────────────────────────────────
  const guardarConfig = async () => {
    if (!restauranteId) return;
    await api.put(`/api/propinas/config/${restauranteId}`, configEdit);
    setConfig(configEdit);
    setShowConfig(false);
    await recalcular();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const cerrado = semana?.estado === "cerrado";

  const fechaRango = semana
    ? `${new Date(semana.fecha_inicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })} – ${new Date(semana.fecha_fin + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}`
    : "";

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        .prop-row:hover { background: ${T.rowHover} !important; }
        .prop-btn-ghost:hover { background: #E5E7EB !important; }
        .prop-day-btn:hover:not(:disabled) { transform: scale(1.08); }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "20px" }}>💵</span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: T.textPrimary }}>Tabulador de Propinas</h1>
            {semana && <p style={{ margin: "2px 0 0", fontSize: "13px", color: T.textSecondary }}>{fechaRango}</p>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <BtnGhost onClick={cargarLista}>📋 Historial</BtnGhost>
          <BtnGhost onClick={recalcular} disabled={saving === -99}>
            {saving === -99
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "13px", height: "13px", border: "2px solid #D1D5DB", borderTopColor: T.purple, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Calculando…</span>
              : "🔄 Recalcular cierres"}
          </BtnGhost>
          <BtnGhost onClick={() => { setConfigEdit(config); setShowConfig(true); }}>
            ⚙️ Config {config.porcentaje_empleados}%/{config.porcentaje_restaurante}%
          </BtnGhost>
          <button
            onClick={toggleEstado}
            style={{
              padding: "8px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none", transition: "opacity 0.15s",
              background: cerrado ? T.amberBg : T.greenBg,
              color: cerrado ? T.amber : T.green,
              outline: `1px solid ${cerrado ? "#FDE68A" : "#A7F3D0"}`,
            }}
          >
            {cerrado ? "🔓 Reabrir semana" : "🔒 Cerrar semana"}
          </button>
        </div>
      </div>

      {/* ── Week nav ───────────────────────────────────────────────────────── */}
      <div style={{ background: T.cardBg, borderRadius: "12px", padding: "12px 16px", marginBottom: "20px", boxShadow: T.shadow, display: "flex", alignItems: "center", gap: "12px" }}>
        <BtnGhost onClick={() => irSemana(-1)}>‹ Anterior</BtnGhost>
        <div style={{ textAlign: "center", minWidth: "120px" }}>
          <div style={{ fontWeight: 700, fontSize: "16px", color: T.textPrimary }}>Semana {semanaActual}</div>
          <div style={{ fontSize: "12px", color: T.textTertiary }}>{anioActual}</div>
        </div>
        <BtnGhost onClick={() => irSemana(1)}>Siguiente ›</BtnGhost>
        <BtnGhost
          onClick={() => { setSemanaActual(semanaHoy); setAnioActual(anioHoy); }}
          style={{ fontSize: "12px" }}
        >
          Hoy
        </BtnGhost>
        {cerrado && (
          <span style={{ background: T.amberBg, color: T.amber, border: "1px solid #FDE68A", padding: "3px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700 }}>
            CERRADA
          </span>
        )}
        {loading && (
          <span style={{ width: "16px", height: "16px", border: "2px solid #E5E7EB", borderTopColor: T.purple, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite", marginLeft: "auto" }} />
        )}
      </div>

      {semana && !loading && (
        <>
          {/* ── Pool diario ─────────────────────────────────────────────────── */}
          <div style={{ background: T.cardBg, borderRadius: "14px", padding: "20px", marginBottom: "16px", boxShadow: T.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "4px", height: "18px", borderRadius: "2px", background: T.purple }} />
                <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: T.textPrimary }}>Pool de propinas por día</h2>
              </div>
              {!cerrado && (
                <BtnGhost
                  onClick={() => {
                    setPoolEdit(DIAS.reduce((a, d) => ({ ...a, [d]: (semana as any)[`propina_${d}`] }), {} as Record<Dia, number>));
                    setShowEditPool(true);
                  }}
                >
                  ✏️ Editar manual
                </BtnGhost>
              )}
            </div>

            {/* Day grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px", marginBottom: "16px" }}>
              {DIAS.map((d) => {
                const monto = (semana as any)[`propina_${d}`] as number;
                const hasValue = monto > 0;
                return (
                  <div key={d} style={{ textAlign: "center", background: hasValue ? T.greenBg : T.rowAlt, borderRadius: "10px", padding: "10px 6px", border: `1px solid ${hasValue ? "#A7F3D0" : T.borderLight}` }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: T.textTertiary, marginBottom: "4px", textTransform: "uppercase" as const }}>{DIA_LABEL[d]}</div>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: hasValue ? T.green : T.textTertiary }}>
                      {hasValue ? fmt(monto) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
              <MetricCard label="Total propinas" value={fmt(semana.total_propinas)} color={T.textPrimary} bg="#F9FAFB" />
              <MetricCard label={`Empleados (${config.porcentaje_empleados}%)`} value={fmt(semana.total_empleados)} color={T.green} bg={T.greenBg} />
              <MetricCard label={`Restaurante (${config.porcentaje_restaurante}%)`} value={fmt(semana.total_restaurante)} color={T.purple} bg={T.purpleBg} />
            </div>
          </div>

          {/* ── Tabulador ───────────────────────────────────────────────────── */}
          <div style={{ background: T.cardBg, borderRadius: "14px", overflow: "hidden", boxShadow: T.shadow }}>
            {/* Card header */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "4px", height: "18px", borderRadius: "2px", background: T.green }} />
                <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: T.textPrimary }}>Empleados</h2>
                <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: T.rowAlt, color: T.textSecondary, border: `1px solid ${T.borderBase}` }}>
                  {semana.empleados.length} personas
                </span>
              </div>
              {!cerrado && (
                <button
                  onClick={() => setShowAddEmpleado(true)}
                  style={{ padding: "7px 14px", borderRadius: "9px", border: "none", background: T.green, color: "#FFF", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  + Agregar empleado
                </button>
              )}
            </div>

            {semana.empleados.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center" as const }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>👥</div>
                <p style={{ color: T.textTertiary, fontSize: "14px", margin: 0 }}>
                  Sin empleados. Agrega empleados para calcular propinas.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: T.rowAlt, borderBottom: `1px solid ${T.borderBase}` }}>
                      <th style={thStyle("left")}>Empleado</th>
                      {DIAS.map((d) => (
                        <th key={d} style={thStyle("center")}>
                          <div style={{ fontWeight: 700 }}>{DIA_LABEL[d]}</div>
                          <div style={{ fontSize: "10px", color: T.textTertiary, fontWeight: 400, marginTop: "2px" }}>
                            {(semana as any)[`propina_${d}`] > 0
                              ? fmt((semana as any)[`propina_${d}`])
                              : "—"}
                          </div>
                        </th>
                      ))}
                      <th style={thStyle("right")}>Propina</th>
                      <th style={thStyle("right")}>Adelanto</th>
                      <th style={thStyle("right")}>Total Neto</th>
                      {!cerrado && <th style={thStyle("center")} />}
                    </tr>
                  </thead>
                  <tbody>
                    {semana.empleados.map((emp, rowIdx) => (
                      <tr
                        key={emp.id}
                        className="prop-row"
                        style={{ borderBottom: `1px solid ${T.borderLight}`, background: rowIdx % 2 === 0 ? "#FFF" : T.rowAlt }}
                      >
                        <td style={{ padding: "10px 16px", fontWeight: 600, color: T.textPrimary, whiteSpace: "nowrap" as const }}>{emp.nombre}</td>
                        {DIAS.map((d) => {
                          const trabajado = (emp as any)[`trabajo_${d}`] as boolean;
                          const isSavingThis = saving === emp.id;
                          return (
                            <td key={d} style={{ padding: "8px 6px", textAlign: "center" as const }}>
                              <button
                                className="prop-day-btn"
                                disabled={cerrado || isSavingThis}
                                onClick={() => toggleDia(emp, d)}
                                style={{
                                  width: "32px", height: "32px", borderRadius: "8px",
                                  border: trabajado ? "none" : `1px solid ${T.borderBase}`,
                                  cursor: cerrado ? "default" : "pointer",
                                  background: trabajado ? T.green : T.cardBg,
                                  color: trabajado ? "#FFF" : T.textTertiary,
                                  fontSize: "14px", fontWeight: 700,
                                  transition: "all 0.15s",
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                }}
                                title={trabajado ? "Trabajó" : "No trabajó"}
                              >
                                {trabajado ? "✓" : "·"}
                              </button>
                            </td>
                          );
                        })}
                        {/* Propina calculada */}
                        <td style={{ padding: "10px 16px", textAlign: "right" as const, fontWeight: 700, color: T.green }}>
                          {fmt(emp.propina_calculada)}
                        </td>
                        {/* Adelanto */}
                        <td style={{ padding: "8px 12px", textAlign: "right" as const }}>
                          {cerrado ? (
                            <span style={{ color: emp.adelanto > 0 ? T.red : T.textTertiary, fontWeight: emp.adelanto > 0 ? 700 : 400 }}>
                              {fmt(emp.adelanto)}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={adelantoEdit[emp.id] !== undefined ? adelantoEdit[emp.id] : emp.adelanto}
                              onChange={(e) => setAdelantoEdit((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                              onBlur={() => guardarAdelanto(emp)}
                              onKeyDown={(e) => e.key === "Enter" && guardarAdelanto(emp)}
                              style={{
                                width: "90px", boxSizing: "border-box" as const,
                                background: emp.adelanto > 0 ? T.redBg : T.cardBg,
                                border: `1px solid ${emp.adelanto > 0 ? "#FECACA" : T.borderBase}`,
                                borderRadius: "6px", padding: "4px 8px",
                                color: emp.adelanto > 0 ? T.red : T.textPrimary,
                                textAlign: "right" as const, fontSize: "13px",
                              }}
                            />
                          )}
                        </td>
                        {/* Total neto */}
                        <td style={{ padding: "10px 16px", textAlign: "right" as const, fontWeight: 700, color: emp.total_neto >= 0 ? T.textPrimary : T.red }}>
                          {fmt(emp.total_neto)}
                        </td>
                        {!cerrado && (
                          <td style={{ padding: "10px 8px", textAlign: "center" as const }}>
                            <button
                              onClick={() => eliminarEmpleado(emp)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: T.textTertiary, fontSize: "14px", padding: "4px", borderRadius: "4px", transition: "color 0.15s" }}
                              title="Eliminar"
                              onMouseEnter={(e) => (e.currentTarget.style.color = T.red)}
                              onMouseLeave={(e) => (e.currentTarget.style.color = T.textTertiary)}
                            >✕</button>
                          </td>
                        )}
                      </tr>
                    ))}

                    {/* Totals row */}
                    <tr style={{ borderTop: `2px solid ${T.borderBase}`, background: T.rowAlt }}>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: T.textSecondary, fontSize: "12px", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>TOTAL</td>
                      {DIAS.map((d) => {
                        const n = semana.empleados.filter((e) => (e as any)[`trabajo_${d}`]).length;
                        return (
                          <td key={d} style={{ padding: "12px 6px", textAlign: "center" as const, fontSize: "11px", color: T.textTertiary }}>
                            {n > 0 ? <span style={{ background: T.greenBg, color: T.green, padding: "2px 6px", borderRadius: "10px", fontWeight: 600 }}>{n} emp.</span> : ""}
                          </td>
                        );
                      })}
                      <td style={{ padding: "12px 16px", textAlign: "right" as const, color: T.green, fontWeight: 800, fontSize: "14px" }}>
                        {fmt(semana.empleados.reduce((s, e) => s + e.propina_calculada, 0))}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" as const, color: T.red, fontWeight: 700 }}>
                        {fmt(semana.empleados.reduce((s, e) => s + e.adelanto, 0))}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" as const, fontWeight: 800, fontSize: "14px", color: T.textPrimary }}>
                        {fmt(semana.empleados.reduce((s, e) => s + e.total_neto, 0))}
                      </td>
                      {!cerrado && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Skeleton while loading ────────────────────────────────────────── */}
      {loading && (
        <div style={{ background: T.cardBg, borderRadius: "14px", padding: "48px", textAlign: "center" as const, boxShadow: T.shadow }}>
          <span style={{ width: "20px", height: "20px", border: "2px solid #E5E7EB", borderTopColor: T.purple, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: T.textTertiary, fontSize: "13px", marginTop: "12px" }}>Cargando semana…</p>
        </div>
      )}

      {/* ── Modal: Agregar empleado ─────────────────────────────────────────── */}
      {showAddEmpleado && (
        <ModalWrapper onClose={() => setShowAddEmpleado(false)} title="Agregar empleado">
          <input
            autoFocus
            placeholder="Nombre del empleado"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregarEmpleado()}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <BtnPrimary onClick={agregarEmpleado} disabled={!nuevoNombre.trim() || saving === -1}>
              Agregar
            </BtnPrimary>
            <BtnGhost onClick={() => setShowAddEmpleado(false)}>Cancelar</BtnGhost>
          </div>
        </ModalWrapper>
      )}

      {/* ── Modal: Editar pool manual ──────────────────────────────────────── */}
      {showEditPool && (
        <ModalWrapper onClose={() => setShowEditPool(false)} title="Editar pool de propinas">
          <p style={{ fontSize: "13px", color: T.textSecondary, marginBottom: "16px" }}>
            Ajusta manualmente el monto de propinas por día (ya con porcentaje aplicado).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {DIAS.map((d) => (
              <div key={d}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: T.textSecondary, display: "block", marginBottom: "4px" }}>{DIA_LABEL[d]}</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={poolEdit[d]}
                  onChange={(e) => setPoolEdit((prev) => ({ ...prev, [d]: parseFloat(e.target.value) || 0 }))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <BtnPrimary onClick={guardarPool} disabled={saving === -2}>Guardar</BtnPrimary>
            <BtnGhost onClick={() => setShowEditPool(false)}>Cancelar</BtnGhost>
          </div>
        </ModalWrapper>
      )}

      {/* ── Modal: Configuración ──────────────────────────────────────────── */}
      {showConfig && (
        <ModalWrapper onClose={() => setShowConfig(false)} title="Configuración de propinas">
          <p style={{ fontSize: "13px", color: T.textSecondary, marginBottom: "16px" }}>
            Define cómo se distribuye el pool de propinas de cada día.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: T.textSecondary, display: "block", marginBottom: "4px" }}>% Empleados</label>
              <input
                type="number" min="0" max="100" step="5"
                value={configEdit.porcentaje_empleados}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setConfigEdit({ porcentaje_empleados: v, porcentaje_restaurante: Math.max(0, 100 - v) });
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: T.textSecondary, display: "block", marginBottom: "4px" }}>% Restaurante</label>
              <input
                type="number" min="0" max="100" step="5"
                value={configEdit.porcentaje_restaurante}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setConfigEdit({ porcentaje_restaurante: v, porcentaje_empleados: Math.max(0, 100 - v) });
                }}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{
            marginTop: "12px", fontSize: "13px", fontWeight: 600,
            color: configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante === 100 ? T.green : T.red,
            background: configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante === 100 ? T.greenBg : T.redBg,
            padding: "8px 12px", borderRadius: "8px",
          }}>
            Total: {configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante}%
            {configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante === 100 ? " ✓ Correcto" : " — debe ser 100%"}
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <BtnPrimary
              onClick={guardarConfig}
              disabled={Math.abs(configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante - 100) > 0.01}
            >
              Guardar y recalcular
            </BtnPrimary>
            <BtnGhost onClick={() => setShowConfig(false)}>Cancelar</BtnGhost>
          </div>
        </ModalWrapper>
      )}

      {/* ── Modal: Historial de semanas ───────────────────────────────────── */}
      {showLista && (
        <ModalWrapper onClose={() => setShowLista(false)} title={`Semanas ${anioActual}`}>
          {listaSemanas.length === 0 ? (
            <p style={{ color: T.textTertiary, textAlign: "center" as const, padding: "24px 0" }}>Sin semanas registradas.</p>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column" as const, gap: "6px" }}>
              {listaSemanas.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSemanaActual(s.numero_semana); setAnioActual(s.anio); setShowLista(false); }}
                  style={{
                    display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
                    background: s.numero_semana === semanaActual && s.anio === anioActual ? T.purpleBg : "#FFF",
                    border: `1px solid ${s.numero_semana === semanaActual && s.anio === anioActual ? "#C4B5FD" : T.borderBase}`,
                    borderRadius: "10px", padding: "10px 16px", cursor: "pointer",
                    color: T.textPrimary, textAlign: "left" as const,
                    transition: "background 0.15s",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "13px" }}>Semana {s.numero_semana}</span>
                    <span style={{ fontSize: "12px", color: T.textSecondary, marginLeft: "10px" }}>
                      {new Date(s.fecha_inicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })} – {new Date(s.fecha_fin + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <span style={{ color: T.green, fontWeight: 700, fontSize: "13px" }}>{fmt(s.total_propinas)}</span>
                    {s.estado === "cerrado" && (
                      <span style={{ background: T.amberBg, color: T.amber, border: "1px solid #FDE68A", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600 }}>CERRADA</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ModalWrapper>
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const MetricCard = ({ label, value, color, bg }: { label: string; value: string; color: string; bg?: string }) => (
  <div style={{ borderRadius: "12px", padding: "14px 16px", background: bg || T.rowAlt, border: `1px solid ${T.borderLight}` }}>
    <div style={{ fontSize: "11px", fontWeight: 600, color: T.textTertiary, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "6px" }}>{label}</div>
    <div style={{ fontWeight: 800, fontSize: "18px", color }}>{value}</div>
  </div>
);

const ModalWrapper = ({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) => (
  <div
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div style={{ background: "#FFF", borderRadius: "16px", padding: "24px", minWidth: "340px", maxWidth: "520px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: T.textPrimary }}>{title}</h3>
        <button onClick={onClose} style={{ background: T.rowAlt, border: `1px solid ${T.borderBase}`, color: T.textSecondary, cursor: "pointer", fontSize: "16px", borderRadius: "8px", width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

// ─── Button primitives ────────────────────────────────────────────────────────

const BtnGhost = ({ onClick, children, disabled, style }: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}) => (
  <button
    className="prop-btn-ghost"
    onClick={onClick}
    disabled={disabled}
    style={{
      border: `1px solid ${T.borderBase}`, borderRadius: "10px", padding: "8px 14px",
      fontSize: "13px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      background: "#FFF", color: T.textSecondary, transition: "background 0.15s",
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}
  >
    {children}
  </button>
);

const BtnPrimary = ({ onClick, children, disabled }: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      border: "none", borderRadius: "10px", padding: "8px 16px",
      fontSize: "13px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      background: disabled ? "#E5E7EB" : T.purple,
      color: disabled ? T.textTertiary : "#FFF",
      transition: "opacity 0.15s",
      opacity: disabled ? 0.7 : 1,
    }}
  >
    {children}
  </button>
);

// ─── Style helpers ────────────────────────────────────────────────────────────

function thStyle(align: "left" | "center" | "right"): React.CSSProperties {
  return {
    padding: "10px 12px",
    textAlign: align,
    fontSize: "11px",
    color: T.textTertiary,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    whiteSpace: "nowrap",
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#FFF",
  border: `1px solid ${T.borderBase}`,
  borderRadius: "8px",
  padding: "9px 12px",
  color: T.textPrimary,
  fontSize: "14px",
  outline: "none",
};
