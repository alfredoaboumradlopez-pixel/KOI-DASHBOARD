import React, { useState, useEffect, useMemo } from "react";
import { ClipboardList, Save, Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../services/api";
import { ArqueoCaja } from "./ArqueoCaja";
import { useRestaurante } from "../context/RestauranteContext";

const fmt = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);

const n = (v: string) => parseFloat(v) || 0;

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const isoWeek = (dateStr: string): number => {
  const d = new Date(dateStr + "T12:00:00");
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const CierreTurno: React.FC = () => {
  const { restauranteId } = useRestaurante();
  const [tab, setTab] = useState<"registrar" | "historial">("registrar");

  // ── Empleados ──
  const [empleados, setEmpleados] = useState<any[]>([]);
  useEffect(() => {
    api.get(`/api/empleados/${restauranteId}`)
      .then((data: any) => setEmpleados(Array.isArray(data) ? data.filter((e: any) => e.activo !== false) : []))
      .catch(() => setEmpleados([]));
  }, [restauranteId]);

  // ── Header ──
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [responsable, setResponsable] = useState("");
  const [elaboradoPor, setElaboradoPor] = useState("");

  // ── Comisiones ──
  const [comisionUber, setComisionUber] = useState("30");
  const [comisionRappi, setComisionRappi] = useState("25");

  // ── Ventas por canal ──
  const [ventas, setVentas] = useState<Record<string, string>>({
    efectivo: "", parrot: "", terminales: "", uber: "", rappi: "", cortesias: "", otros: "",
  });
  const setVenta = (k: string, v: string) => setVentas(prev => ({ ...prev, [k]: v }));

  // ── Propinas ──
  const [propinas, setPropinas] = useState<Record<string, string>>({
    efectivo: "", parrot: "", terminales: "",
  });
  const setPropina = (k: string, v: string) => setPropinas(prev => ({ ...prev, [k]: v }));

  // ── Arqueo ──
  const [saldoInicial, setSaldoInicial] = useState("");
  const [efectivoFisico, setEfectivoFisico] = useState("");

  // ── Notas ──
  const [notasOpen, setNotasOpen] = useState(false);
  const [notas, setNotas] = useState("");

  // ── Focus ──
  const [focused, setFocused] = useState<string | null>(null);

  // ── UI ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<any>(null);

  // ── Computed ──
  const semana = useMemo(() => (fecha ? isoWeek(fecha) : 0), [fecha]);

  const fechaLabel = useMemo(() => {
    if (!fecha) return "";
    const d = new Date(fecha + "T12:00:00");
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`;
  }, [fecha]);

  const totalVentas = useMemo(
    () => (Object.values(ventas) as string[]).reduce((s, v) => s + n(v), 0),
    [ventas],
  );

  const totalPropinas = useMemo(
    () => (Object.values(propinas) as string[]).reduce((s, v) => s + n(v), 0),
    [propinas],
  );

  const nettoUber = useMemo(() => n(ventas.uber) * (1 - n(comisionUber) / 100), [ventas.uber, comisionUber]);
  const nettoRappi = useMemo(() => n(ventas.rappi) * (1 - n(comisionRappi) / 100), [ventas.rappi, comisionRappi]);

  // saldo esperado = saldo inicial + efectivo ventas + efectivo propinas
  const saldoEsperado = useMemo(
    () => n(saldoInicial) + n(ventas.efectivo) + n(propinas.efectivo),
    [saldoInicial, ventas.efectivo, propinas.efectivo],
  );

  const diferencia = useMemo(
    () => (n(efectivoFisico) > 0 ? n(efectivoFisico) - saldoEsperado : 0),
    [efectivoFisico, saldoEsperado],
  );

  const semaphore = useMemo(() => {
    if (n(efectivoFisico) === 0) return null;
    const abs = Math.abs(diferencia);
    if (abs < 1) return { bg: "#ECFDF5", color: "#059669", label: "✓ Cuadra" };
    if (abs <= 50) return { bg: "#FFFBEB", color: "#D97706", label: `⚠ ${diferencia > 0 ? "+" : ""}${fmt(diferencia)}` };
    return { bg: "#FEF2F2", color: "#DC2626", label: `✗ ${diferencia > 0 ? "+" : ""}${fmt(diferencia)}` };
  }, [efectivoFisico, diferencia]);

  // ── Save ──
  const handleSave = async () => {
    if (!elaboradoPor) {
      setError("Selecciona quién elabora el cierre");
      return;
    }
    if (totalVentas === 0) {
      if (!confirm("¿Confirmas que no hubo ventas hoy?")) return;
    }
    if (n(efectivoFisico) > 0 && Math.abs(diferencia) > 50) {
      if (!confirm(`Hay una diferencia de ${fmt(Math.abs(diferencia))} en el arqueo. ¿Continuar de todas formas?`)) return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/cierre-turno", {
        fecha,
        responsable: elaboradoPor,
        elaborado_por: elaboradoPor,
        saldo_inicial: n(saldoInicial),
        ventas_efectivo: n(ventas.efectivo),
        propinas_efectivo: n(propinas.efectivo),
        ventas_parrot: n(ventas.parrot),
        propinas_parrot: n(propinas.parrot),
        ventas_terminales: n(ventas.terminales),
        propinas_terminales: n(propinas.terminales),
        ventas_uber: n(ventas.uber),
        ventas_rappi: n(ventas.rappi),
        cortesias: n(ventas.cortesias),
        otros_ingresos: n(ventas.otros),
        semana_numero: semana,
        gastos: [],
        propinas: [],
        efectivo_fisico: n(efectivoFisico) || null,
        notas: notas || null,
        restaurante_id: restauranteId,
      });
      setSavedSummary({ fecha, responsable, totalVentas, totalPropinas, diferencia: n(efectivoFisico) > 0 ? diferencia : null, semana });
      // Reset
      setVentas({ efectivo: "", parrot: "", terminales: "", uber: "", rappi: "", cortesias: "", otros: "" });
      setPropinas({ efectivo: "", parrot: "", terminales: "" });
      setSaldoInicial("");
      setEfectivoFisico("");
      setNotas("");
      setNotasOpen(false);
    } catch (e: any) {
      setError(e.message || "Error al guardar el cierre");
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ──
  const cardInput = (key: string, accentColor = "#059669"): React.CSSProperties => ({
    width: "100%",
    paddingTop: "10px",
    paddingBottom: "10px",
    paddingRight: "14px",
    paddingLeft: "30px",
    borderRadius: "10px",
    border: `2px solid ${focused === key ? accentColor : "#E5E7EB"}`,
    fontSize: "20px",
    fontWeight: "800",
    color: "#111827",
    background: focused === key ? (accentColor === "#7C3AED" ? "#F5F3FF" : "#F0FDF4") : "#FFF",
    outline: "none",
    textAlign: "right",
    boxSizing: "border-box",
    transition: "border-color 0.15s, background 0.15s",
  });

  const sectionCard: React.CSSProperties = {
    background: "#FFF",
    borderRadius: "14px",
    padding: "20px 24px",
    marginBottom: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    border: "1px solid #F3F4F6",
  };

  const channelCard = (key: string, hasBg: boolean, bgColor: string, borderActive: string): React.CSSProperties => ({
    background: hasBg ? bgColor : "#FAFBFC",
    borderRadius: "12px",
    padding: "16px",
    border: `1.5px solid ${focused?.startsWith(key) ? "#059669" : hasBg ? borderActive : "#E5E7EB"}`,
    transition: "all 0.15s",
  });

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>

      {/* ── Module header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ClipboardList style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
        </div>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Cierre de Turno</h1>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Registro de ventas, propinas y arqueo</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: "4px", background: "#FFF", borderRadius: "12px", padding: "4px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <button onClick={() => setTab("registrar")} style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: tab === "registrar" ? "#059669" : "transparent", color: tab === "registrar" ? "#FFF" : "#6B7280", fontSize: "13px", fontWeight: "600", transition: "all 0.15s" }}>
          📋 Registrar Cierre
        </button>
        <button onClick={() => setTab("historial")} style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: tab === "historial" ? "#3D1C1E" : "transparent", color: tab === "historial" ? "#C8FF00" : "#6B7280", fontSize: "13px", fontWeight: "600", transition: "all 0.15s" }}>
          📊 Historial
        </button>
      </div>

      {/* ── HISTORIAL ── */}
      {tab === "historial" && <ArqueoCaja />}

      {/* ── REGISTRAR ── */}
      {tab === "registrar" && (
        <div>

          {/* Success summary */}
          {savedSummary && (
            <div style={{ background: "#ECFDF5", borderRadius: "14px", padding: "18px 20px", marginBottom: "16px", border: "1px solid #6EE7B7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <CheckCircle style={{ width: "22px", height: "22px", color: "#059669" }} />
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "800", color: "#065F46" }}>Cierre del día guardado</div>
                    <div style={{ fontSize: "11px", color: "#059669" }}>{savedSummary.fecha} · Semana {savedSummary.semana} · {savedSummary.responsable}</div>
                  </div>
                </div>
                <button onClick={() => setSavedSummary(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "20px", color: "#059669", lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Total Ventas", value: fmt(savedSummary.totalVentas), color: "#059669" },
                  { label: "Total Propinas", value: fmt(savedSummary.totalPropinas), color: "#7C3AED" },
                  { label: "Arqueo", value: savedSummary.diferencia === null ? "Sin contar" : Math.abs(savedSummary.diferencia) < 1 ? "✓ Cuadra" : `${savedSummary.diferencia > 0 ? "+" : ""}${fmt(savedSummary.diferencia)}`, color: savedSummary.diferencia === null ? "#9CA3AF" : Math.abs(savedSummary.diferencia) < 1 ? "#059669" : "#DC2626" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "#FFF", borderRadius: "8px", padding: "10px 14px" }}>
                    <div style={{ fontSize: "10px", color: "#6B7280", textTransform: "uppercase", fontWeight: "700", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontSize: "17px", fontWeight: "800", color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECCIÓN 1: Header compacto ── */}
          <div style={sectionCard}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 200px auto", gap: "16px", alignItems: "end" }}>

              {/* Fecha */}
              <div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>📅 Fecha</div>
                <input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px", fontWeight: "600", color: "#111827" }}
                />
              </div>

              {/* Día legible */}
              <div style={{ paddingBottom: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#374151" }}>{fechaLabel}</span>
              </div>

              {/* Elaborado por */}
              <div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>✍️ Elaborado por</div>
                {empleados.length > 0 ? (
                  <select
                    value={elaboradoPor}
                    onChange={e => setElaboradoPor(e.target.value)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "8px", border: `1px solid ${!elaboradoPor ? "#FCA5A5" : "#E5E7EB"}`, fontSize: "13px", color: elaboradoPor ? "#111827" : "#9CA3AF", background: "#FFF" }}
                  >
                    <option value="">Seleccionar...</option>
                    {empleados.map((e: any) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                  </select>
                ) : (
                  <input
                    value={elaboradoPor}
                    onChange={e => setElaboradoPor(e.target.value)}
                    placeholder="Escribe tu nombre"
                    style={{ width: "100%", padding: "7px 10px", borderRadius: "8px", border: `1px solid ${!elaboradoPor ? "#FCA5A5" : "#E5E7EB"}`, fontSize: "13px", color: "#111827", boxSizing: "border-box" }}
                  />
                )}
              </div>

              {/* Semana */}
              <div style={{ textAlign: "center", paddingBottom: "2px" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>Semana</div>
                <div style={{ fontSize: "26px", fontWeight: "900", color: "#3D1C1E", lineHeight: 1.1 }}>{semana || "—"}</div>
              </div>
            </div>
          </div>

          {/* ── SECCIÓN 2: Ventas por canal ── */}
          <div style={sectionCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#111827", margin: 0 }}>Ventas del día</h2>
                <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "3px 0 0" }}>Ingresa el total vendido por cada canal</p>
              </div>
              {/* Comisiones editables */}
              <div style={{ background: "#F9FAFB", borderRadius: "10px", padding: "10px 14px", border: "1px solid #F0F0F0", minWidth: "220px" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Comisiones de plataformas</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { label: "Uber Eats", value: comisionUber, set: setComisionUber },
                    { label: "Rappi", value: comisionRappi, set: setComisionRappi },
                  ].map(({ label, value, set }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>{label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number" value={value} onChange={e => set(e.target.value)}
                          style={{ width: "56px", padding: "4px 8px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "13px", fontWeight: "700", textAlign: "center", background: "#FFF" }}
                        />
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "#6B7280" }}>%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>

              {/* Efectivo */}
              <div style={channelCard("v_efectivo", n(ventas.efectivo) > 0, "#F0FDF4", "#86EFAC")}>
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>💵</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Efectivo</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={ventas.efectivo} onChange={e => setVenta("efectivo", e.target.value)} onFocus={() => setFocused("v_efectivo")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("v_efectivo")} />
                </div>
              </div>

              {/* Parrot Pay */}
              <div style={channelCard("v_parrot", n(ventas.parrot) > 0, "#EFF6FF", "#BFDBFE")}>
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>📱</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Parrot Pay</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={ventas.parrot} onChange={e => setVenta("parrot", e.target.value)} onFocus={() => setFocused("v_parrot")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("v_parrot")} />
                </div>
              </div>

              {/* Terminales */}
              <div style={channelCard("v_terminales", n(ventas.terminales) > 0, "#F0FDF4", "#86EFAC")}>
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>💳</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Terminales</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={ventas.terminales} onChange={e => setVenta("terminales", e.target.value)} onFocus={() => setFocused("v_terminales")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("v_terminales")} />
                </div>
              </div>

              {/* Uber Eats */}
              <div style={channelCard("v_uber", n(ventas.uber) > 0, "#FFF7ED", "#FED7AA")}>
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>🛵</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Uber Eats</div>
                <div style={{ fontSize: "10px", color: "#EA580C", fontWeight: "600", marginBottom: "8px" }}>Comisión {comisionUber}%</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={ventas.uber} onChange={e => setVenta("uber", e.target.value)} onFocus={() => setFocused("v_uber")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("v_uber")} />
                </div>
                {n(ventas.uber) > 0 && (
                  <div style={{ marginTop: "8px", padding: "5px 10px", borderRadius: "6px", background: "#ECFDF5", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "10px", color: "#059669", fontWeight: "600" }}>Neto</span>
                    <span style={{ fontSize: "11px", fontWeight: "800", color: "#059669" }}>{fmt(nettoUber)}</span>
                  </div>
                )}
              </div>

              {/* Rappi */}
              <div style={channelCard("v_rappi", n(ventas.rappi) > 0, "#FFF7ED", "#FED7AA")}>
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>🛵</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Rappi</div>
                <div style={{ fontSize: "10px", color: "#EA580C", fontWeight: "600", marginBottom: "8px" }}>Comisión {comisionRappi}%</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={ventas.rappi} onChange={e => setVenta("rappi", e.target.value)} onFocus={() => setFocused("v_rappi")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("v_rappi")} />
                </div>
                {n(ventas.rappi) > 0 && (
                  <div style={{ marginTop: "8px", padding: "5px 10px", borderRadius: "6px", background: "#ECFDF5", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "10px", color: "#059669", fontWeight: "600" }}>Neto</span>
                    <span style={{ fontSize: "11px", fontWeight: "800", color: "#059669" }}>{fmt(nettoRappi)}</span>
                  </div>
                )}
              </div>

              {/* Cortesías */}
              <div style={channelCard("v_cortesias", n(ventas.cortesias) > 0, "#FDF4FF", "#E9D5FF")}>
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>🎁</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Cortesías</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={ventas.cortesias} onChange={e => setVenta("cortesias", e.target.value)} onFocus={() => setFocused("v_cortesias")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("v_cortesias")} />
                </div>
              </div>

              {/* Otros ingresos — ocupa 1 columna */}
              <div style={{ ...channelCard("v_otros", n(ventas.otros) > 0, "#F0F9FF", "#BAE6FD") }}>
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>➕</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Otros Ingresos</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={ventas.otros} onChange={e => setVenta("otros", e.target.value)} onFocus={() => setFocused("v_otros")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("v_otros")} />
                </div>
              </div>

            </div>

            {/* Total bar */}
            <div style={{ marginTop: "16px", padding: "16px 24px", borderRadius: "12px", background: "linear-gradient(135deg,#059669 0%,#047857 100%)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Ventas del Día</span>
              <span style={{ fontSize: "30px", fontWeight: "900", color: "#FFF" }}>{fmt(totalVentas)}</span>
            </div>
          </div>

          {/* ── SECCIÓN 3: Propinas ── */}
          <div style={sectionCard}>
            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#111827", margin: "0 0 16px" }}>Propinas del día</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {[
                { key: "efectivo", label: "Efectivo", icon: "💵" },
                { key: "parrot", label: "Parrot Pay", icon: "📱" },
                { key: "terminales", label: "Terminales", icon: "💳" },
              ].map(ch => (
                <div key={ch.key} style={{ background: n(propinas[ch.key]) > 0 ? "#F5F3FF" : "#FAFBFC", borderRadius: "12px", padding: "16px", border: `1.5px solid ${focused === `p_${ch.key}` ? "#7C3AED" : n(propinas[ch.key]) > 0 ? "#C4B5FD" : "#E5E7EB"}`, transition: "all 0.15s" }}>
                  <div style={{ fontSize: "22px", marginBottom: "4px" }}>{ch.icon}</div>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>{ch.label}</div>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={propinas[ch.key]}
                      onChange={e => setPropina(ch.key, e.target.value)}
                      onFocus={() => setFocused(`p_${ch.key}`)}
                      onBlur={() => setFocused(null)}
                      placeholder="0.00"
                      style={cardInput(`p_${ch.key}`, "#7C3AED")}
                    />
                  </div>
                </div>
              ))}
            </div>
            {totalPropinas > 0 && (
              <div style={{ marginTop: "12px", padding: "14px 20px", borderRadius: "10px", background: "#F5F3FF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#7C3AED" }}>Total Propinas del Día</span>
                <span style={{ fontSize: "24px", fontWeight: "900", color: "#7C3AED" }}>{fmt(totalPropinas)}</span>
              </div>
            )}
          </div>

          {/* ── SECCIÓN 4: Arqueo de Caja ── */}
          <div style={sectionCard}>
            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#111827", margin: "0 0 4px" }}>Arqueo de Caja</h2>
            <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "0 0 16px" }}>Verifica que el efectivo cuadre</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>

              {/* Saldo inicial */}
              <div style={{ background: "#FAFBFC", borderRadius: "12px", padding: "16px", border: `1.5px solid ${focused === "saldo_ini" ? "#059669" : "#E5E7EB"}`, transition: "all 0.15s" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Saldo Inicial</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} onFocus={() => setFocused("saldo_ini")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("saldo_ini")} />
                </div>
              </div>

              {/* Efectivo físico */}
              <div style={{ background: "#FAFBFC", borderRadius: "12px", padding: "16px", border: `1.5px solid ${focused === "ef_fisico" ? "#059669" : "#E5E7EB"}`, transition: "all 0.15s" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Efectivo Físico</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: "#9CA3AF", pointerEvents: "none", fontWeight: "700" }}>$</span>
                  <input type="number" step="0.01" min="0" value={efectivoFisico} onChange={e => setEfectivoFisico(e.target.value)} onFocus={() => setFocused("ef_fisico")} onBlur={() => setFocused(null)} placeholder="0.00" style={cardInput("ef_fisico")} />
                </div>
              </div>

              {/* Diferencia / semáforo */}
              <div style={{ background: semaphore ? semaphore.bg : "#FAFBFC", borderRadius: "12px", padding: "16px", border: `1.5px solid ${semaphore ? semaphore.color + "55" : "#E5E7EB"}`, transition: "all 0.15s", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Diferencia</div>
                {semaphore ? (
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: "900", color: semaphore.color, textAlign: "right" }}>
                      {semaphore.label}
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", textAlign: "right", marginTop: "6px" }}>
                      Esperado: {fmt(saldoEsperado)}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: "12px", color: "#D1D5DB", fontStyle: "italic" }}>Ingresa efectivo físico</span>
                )}
              </div>

            </div>
          </div>

          {/* ── SECCIÓN 5: Notas (collapsible) ── */}
          <div style={{ background: "#FFF", borderRadius: "14px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6", overflow: "hidden" }}>
            <button
              onClick={() => setNotasOpen(v => !v)}
              style={{ width: "100%", padding: "14px 20px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#6B7280" }}>
                {notasOpen ? "📝 Notas del día" : "+ Agregar notas del día"}
              </span>
              {notasOpen
                ? <ChevronUp style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />
                : <ChevronDown style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />
              }
            </button>
            {notasOpen && (
              <div style={{ padding: "0 20px 16px" }}>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Observaciones del día, incidencias, comentarios..."
                  rows={3}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#FEF2F2", color: "#DC2626", fontSize: "13px", fontWeight: "600", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle style={{ width: "16px", height: "16px", flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* ── SECCIÓN 6: Guardar ── */}
          <button
            onClick={handleSave}
            disabled={loading}
            style={{ width: "100%", padding: "16px 24px", borderRadius: "14px", border: "none", background: loading ? "#9CA3AF" : "linear-gradient(135deg,#059669 0%,#047857 100%)", color: "#FFF", fontSize: "16px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: loading ? "none" : "0 4px 14px rgba(5,150,105,0.35)", transition: "all 0.15s" }}
          >
            {loading
              ? <><Loader2 style={{ width: "20px", height: "20px", animation: "spin 1s linear infinite" }} /> Guardando...</>
              : <><Save style={{ width: "20px", height: "20px" }} /> Guardar cierre del día</>
            }
          </button>

        </div>
      )}

    </div>
  );
};
