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
    <div style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto", color: "#fff", fontFamily: "Inter, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#C8FF00" }}>💵 Tabulador de Propinas</h1>
          {semana && <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#888" }}>{fechaRango}</p>}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={cargarLista} style={btnStyle("ghost")}>📋 Historial</button>
          <button onClick={recalcular} disabled={saving === -99} style={btnStyle("ghost")}>🔄 Recalcular cierres</button>
          <button onClick={() => { setConfigEdit(config); setShowConfig(true); }} style={btnStyle("ghost")}>⚙️ Config {config.porcentaje_empleados}%/{config.porcentaje_restaurante}%</button>
          <button
            onClick={toggleEstado}
            style={btnStyle(cerrado ? "yellow" : "green")}
          >
            {cerrado ? "🔓 Reabrir semana" : "🔒 Cerrar semana"}
          </button>
        </div>
      </div>

      {/* ── Week nav ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        <button onClick={() => irSemana(-1)} style={btnStyle("ghost")}>‹ Anterior</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "18px" }}>Semana {semanaActual}</div>
          <div style={{ fontSize: "12px", color: "#888" }}>{anioActual}</div>
        </div>
        <button onClick={() => irSemana(1)} style={btnStyle("ghost")}>Siguiente ›</button>
        <button
          onClick={() => { setSemanaActual(semanaHoy); setAnioActual(anioHoy); }}
          style={{ ...btnStyle("ghost"), marginLeft: "8px", fontSize: "12px" }}
        >
          Hoy
        </button>
        {cerrado && (
          <span style={{ background: "#854d0e", color: "#fef08a", padding: "3px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600 }}>
            CERRADA
          </span>
        )}
      </div>

      {loading && <div style={{ color: "#888", textAlign: "center", padding: "40px" }}>Cargando…</div>}

      {semana && !loading && (
        <>
          {/* ── Pool diario ─────────────────────────────────────────────────── */}
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", color: "#C8FF00" }}>Pool de propinas por día</h2>
              {!cerrado && (
                <button
                  onClick={() => {
                    setPoolEdit(DIAS.reduce((a, d) => ({ ...a, [d]: (semana as any)[`propina_${d}`] }), {} as Record<Dia, number>));
                    setShowEditPool(true);
                  }}
                  style={btnStyle("ghost")}
                >
                  ✏️ Editar manual
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px" }}>
              {DIAS.map((d) => (
                <div key={d} style={{ textAlign: "center", background: "#1a1a1a", borderRadius: "12px", padding: "12px 6px" }}>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>{DIA_LABEL[d]}</div>
                  <div style={{ fontWeight: 700, fontSize: "15px", color: (semana as any)[`propina_${d}`] > 0 ? "#C8FF00" : "#444" }}>
                    {(semana as any)[`propina_${d}`] > 0
                      ? fmt((semana as any)[`propina_${d}`])
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
            {/* Totals */}
            <div style={{ display: "flex", gap: "20px", marginTop: "16px", flexWrap: "wrap" }}>
              <MetricCard label="Total propinas" value={fmt(semana.total_propinas)} color="#fff" />
              <MetricCard label={`Empleados (${config.porcentaje_empleados}%)`} value={fmt(semana.total_empleados)} color="#C8FF00" />
              <MetricCard label={`Restaurante (${config.porcentaje_restaurante}%)`} value={fmt(semana.total_restaurante)} color="#60a5fa" />
            </div>
          </div>

          {/* ── Tabulador ───────────────────────────────────────────────────── */}
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", color: "#C8FF00" }}>Empleados</h2>
              {!cerrado && (
                <button onClick={() => setShowAddEmpleado(true)} style={btnStyle("green")}>+ Agregar empleado</button>
              )}
            </div>

            {semana.empleados.length === 0 ? (
              <p style={{ color: "#555", textAlign: "center", padding: "20px" }}>
                No hay empleados. Agrega empleados para calcular propinas.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                      <th style={thStyle("left")}>Empleado</th>
                      {DIAS.map((d) => (
                        <th key={d} style={thStyle("center")}>
                          <div>{DIA_LABEL[d]}</div>
                          <div style={{ fontSize: "10px", color: "#555", fontWeight: 400 }}>
                            {(semana as any)[`propina_${d}`] > 0
                              ? fmt((semana as any)[`propina_${d}`])
                              : "—"}
                          </div>
                        </th>
                      ))}
                      <th style={thStyle("right")}>Propina</th>
                      <th style={thStyle("right")}>Adelanto</th>
                      <th style={thStyle("right")}>Total Neto</th>
                      {!cerrado && <th style={thStyle("center")}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {semana.empleados.map((emp) => (
                      <tr key={emp.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{emp.nombre}</td>
                        {DIAS.map((d) => {
                          const trabajado = (emp as any)[`trabajo_${d}`] as boolean;
                          return (
                            <td key={d} style={{ padding: "10px 6px", textAlign: "center" }}>
                              <button
                                disabled={cerrado || saving === emp.id}
                                onClick={() => toggleDia(emp, d)}
                                style={{
                                  width: "32px", height: "32px", borderRadius: "8px", border: "none",
                                  cursor: cerrado ? "default" : "pointer",
                                  background: trabajado ? "#166534" : "#1a1a1a",
                                  color: trabajado ? "#C8FF00" : "#444",
                                  fontSize: "16px", transition: "all 0.15s",
                                }}
                              >
                                {trabajado ? "✓" : "·"}
                              </button>
                            </td>
                          );
                        })}
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "#C8FF00", fontWeight: 700 }}>
                          {fmt(emp.propina_calculada)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          {cerrado ? (
                            <span style={{ color: emp.adelanto > 0 ? "#f87171" : "#555" }}>{fmt(emp.adelanto)}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={adelantoEdit[emp.id] !== undefined ? adelantoEdit[emp.id] : emp.adelanto}
                              onChange={(e) => setAdelantoEdit((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                              onBlur={() => guardarAdelanto(emp)}
                              onKeyDown={(e) => e.key === "Enter" && guardarAdelanto(emp)}
                              style={{ width: "90px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "6px", padding: "4px 8px", color: "#f87171", textAlign: "right", fontSize: "13px" }}
                            />
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: emp.total_neto >= 0 ? "#fff" : "#f87171" }}>
                          {fmt(emp.total_neto)}
                        </td>
                        {!cerrado && (
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            <button
                              onClick={() => eliminarEmpleado(emp)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: "14px" }}
                              title="Eliminar"
                            >✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ borderTop: "2px solid #2a2a2a", background: "#0d0d0d" }}>
                      <td style={{ padding: "12px 12px", fontWeight: 700, color: "#888" }}>TOTAL</td>
                      {DIAS.map((d) => {
                        const n = semana.empleados.filter((e) => (e as any)[`trabajo_${d}`]).length;
                        return (
                          <td key={d} style={{ padding: "12px 6px", textAlign: "center", fontSize: "12px", color: "#666" }}>
                            {n > 0 ? `${n} emp.` : ""}
                          </td>
                        );
                      })}
                      <td style={{ padding: "12px 12px", textAlign: "right", color: "#C8FF00", fontWeight: 700 }}>
                        {fmt(semana.empleados.reduce((s, e) => s + e.propina_calculada, 0))}
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right", color: "#f87171" }}>
                        {fmt(semana.empleados.reduce((s, e) => s + e.adelanto, 0))}
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right", fontWeight: 700 }}>
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
            <button onClick={agregarEmpleado} disabled={!nuevoNombre.trim() || saving === -1} style={btnStyle("green")}>
              Agregar
            </button>
            <button onClick={() => setShowAddEmpleado(false)} style={btnStyle("ghost")}>Cancelar</button>
          </div>
        </ModalWrapper>
      )}

      {/* ── Modal: Editar pool manual ──────────────────────────────────────── */}
      {showEditPool && (
        <ModalWrapper onClose={() => setShowEditPool(false)} title="Editar pool de propinas">
          <p style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>
            Ajusta manualmente el monto de propinas por día (ya con porcentaje aplicado).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {DIAS.map((d) => (
              <div key={d}>
                <label style={{ fontSize: "12px", color: "#888", display: "block", marginBottom: "4px" }}>{DIA_LABEL[d]}</label>
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
            <button onClick={guardarPool} disabled={saving === -2} style={btnStyle("green")}>Guardar</button>
            <button onClick={() => setShowEditPool(false)} style={btnStyle("ghost")}>Cancelar</button>
          </div>
        </ModalWrapper>
      )}

      {/* ── Modal: Configuración ──────────────────────────────────────────── */}
      {showConfig && (
        <ModalWrapper onClose={() => setShowConfig(false)} title="Configuración de propinas">
          <p style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>
            Define cómo se distribuye el pool de propinas de cada día.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#888", display: "block", marginBottom: "4px" }}>% Empleados</label>
              <input
                type="number"
                min="0"
                max="100"
                step="5"
                value={configEdit.porcentaje_empleados}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setConfigEdit({ porcentaje_empleados: v, porcentaje_restaurante: Math.max(0, 100 - v) });
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "#888", display: "block", marginBottom: "4px" }}>% Restaurante</label>
              <input
                type="number"
                min="0"
                max="100"
                step="5"
                value={configEdit.porcentaje_restaurante}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setConfigEdit({ porcentaje_restaurante: v, porcentaje_empleados: Math.max(0, 100 - v) });
                }}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginTop: "12px", fontSize: "13px", color: configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante === 100 ? "#C8FF00" : "#f87171" }}>
            Total: {configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante}% {configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante === 100 ? "✓" : "(debe ser 100%)"}
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <button
              onClick={guardarConfig}
              disabled={Math.abs(configEdit.porcentaje_empleados + configEdit.porcentaje_restaurante - 100) > 0.01}
              style={btnStyle("green")}
            >
              Guardar y recalcular
            </button>
            <button onClick={() => setShowConfig(false)} style={btnStyle("ghost")}>Cancelar</button>
          </div>
        </ModalWrapper>
      )}

      {/* ── Modal: Historial de semanas ───────────────────────────────────── */}
      {showLista && (
        <ModalWrapper onClose={() => setShowLista(false)} title={`Semanas ${anioActual}`}>
          {listaSemanas.length === 0 ? (
            <p style={{ color: "#555", textAlign: "center" }}>Sin semanas registradas.</p>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              {listaSemanas.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSemanaActual(s.numero_semana); setAnioActual(s.anio); setShowLista(false); }}
                  style={{
                    display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
                    background: s.numero_semana === semanaActual && s.anio === anioActual ? "#1a1a1a" : "transparent",
                    border: "1px solid #2a2a2a", borderRadius: "10px", marginBottom: "8px",
                    padding: "10px 16px", cursor: "pointer", color: "#fff",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>Semana {s.numero_semana}</span>
                    <span style={{ fontSize: "12px", color: "#888", marginLeft: "10px" }}>
                      {new Date(s.fecha_inicio + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })} – {new Date(s.fecha_fin + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <span style={{ color: "#C8FF00", fontWeight: 700 }}>{fmt(s.total_propinas)}</span>
                    {s.estado === "cerrado" && (
                      <span style={{ background: "#854d0e", color: "#fef08a", padding: "2px 8px", borderRadius: "10px", fontSize: "11px" }}>CERRADA</span>
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

const MetricCard = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ flex: 1, minWidth: "140px", background: "#1a1a1a", borderRadius: "12px", padding: "12px 16px" }}>
    <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>{label}</div>
    <div style={{ fontWeight: 700, fontSize: "18px", color }}>{value}</div>
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
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "20px", padding: "28px", minWidth: "340px", maxWidth: "520px", width: "90%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff" }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "20px" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

function btnStyle(variant: "green" | "yellow" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    border: "none", borderRadius: "10px", padding: "8px 14px",
    fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "opacity 0.15s",
  };
  if (variant === "green") return { ...base, background: "#166534", color: "#C8FF00" };
  if (variant === "yellow") return { ...base, background: "#854d0e", color: "#fef08a" };
  return { ...base, background: "rgba(255,255,255,0.07)", color: "#ccc" };
}

function thStyle(align: "left" | "center" | "right"): React.CSSProperties {
  return { padding: "8px 12px", textAlign: align, fontSize: "12px", color: "#888", fontWeight: 600, whiteSpace: "nowrap" };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "#fff",
  fontSize: "14px",
};
