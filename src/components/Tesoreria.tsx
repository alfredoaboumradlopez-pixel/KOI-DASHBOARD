import { useState, useEffect, useMemo } from "react";
import { Calendar, Plus, Edit2, Trash2, X, RefreshCw, Check, ChevronDown, ChevronUp, Settings, TrendingUp } from "lucide-react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const FRECUENCIAS = ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL", "ANUAL", "VARIABLE"];

// ── Interfaces — Pagos ────────────────────────────────────────────────────────
interface PagoRecurrente {
  id: number;
  concepto: string;
  proveedor: string;
  categoria: string;
  frecuencia: string;
  deadline_texto: string;
  dia_limite: number | null;
  monto_estimado: number;
  activo: boolean;
  notas: string | null;
  pagado_mes: number | null;
  pagado_anio: number | null;
}

interface PagoComprometido {
  concepto: string;
  proveedor: string;
  monto: number;
  fecha_vencimiento: string;
  dias_para_vencer: number;
  estado: string;
}

interface SemanaFlujoLegacy {
  semana: string;
  ingresos_estimados: number;
  egresos_comprometidos: number;
  balance: number;
  semaforo: "verde" | "amarillo" | "rojo";
  pagos: PagoComprometido[];
}

interface FlujoCajaLegacy {
  datos_insuficientes: boolean;
  mensaje?: string;
  ventas_promedio_diario: number;
  ingresos_proyectados_30d: number;
  total_comprometido_30d: number;
  semanas: SemanaFlujoLegacy[];
  resumen: { semaforo_general: "verde" | "amarillo" | "rojo"; semanas_en_riesgo: number; superavit_estimado_30d: number };
}

interface FormData {
  concepto: string;
  proveedor: string;
  categoria: string;
  frecuencia: string;
  deadline_texto: string;
  dia_limite: string;
  monto_estimado: string;
  notas: string;
}

// ── Interfaces — Flujo de Caja nuevo ─────────────────────────────────────────
interface ConfigFlujo {
  saldo_banco_inicial: number;
  nomina_semanal_estimada: number;
  dia_corte_impuestos: number;
  porcentaje_iva: number;
  porcentaje_isr: number;
  retiro_utilidades_pct: number;
  semana_retiro: number;
  notas: string | null;
  updated_at?: string | null;
}

interface EgresoSemana {
  concepto: string;
  monto: number;
  dia: number;
  tipo: string;
  variable: boolean;
}

interface SemanaProyeccion {
  numero: number;
  dias: string;
  ingresos_estimados: number;
  egresos: EgresoSemana[];
  total_egresos: number;
  balance_semana: number;
  saldo_acumulado: number;
  semaforo: "verde" | "amarillo" | "rojo";
}

interface ProyeccionFlujo {
  config: ConfigFlujo;
  saldo_inicial: number;
  ventas_proyectadas: number;
  ventas_promedio_diario: number;
  dias_con_datos: number;
  mes: number;
  anio: number;
  semanas: SemanaProyeccion[];
  resumen: {
    total_ingresos_mes: number;
    total_egresos_mes: number;
    retiro_disponible: number;
    saldo_final: number;
    semaforo_general: "verde" | "amarillo" | "rojo";
  };
  recomendaciones: string[];
  datos_insuficientes: boolean;
}

const emptyForm: FormData = {
  concepto: "", proveedor: "", categoria: "RENTA", frecuencia: "MENSUAL",
  deadline_texto: "", dia_limite: "", monto_estimado: "", notas: "",
};

const emptyConfig: ConfigFlujo = {
  saldo_banco_inicial: 0,
  nomina_semanal_estimada: 20000,
  dia_corte_impuestos: 17,
  porcentaje_iva: 16,
  porcentaje_isr: 30,
  retiro_utilidades_pct: 0,
  semana_retiro: 4,
  notas: null,
};

// ── Date helpers ──────────────────────────────────────────────────────────────
const getDiaActual  = () => new Date().getDate();
const getMesActual  = () => new Date().getMonth() + 1;
const getAnioActual = () => new Date().getFullYear();
const getDiasEnMes  = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };

function isPagadoEsteMes(p: PagoRecurrente) {
  return p.pagado_mes === getMesActual() && p.pagado_anio === getAnioActual();
}

function calcDias(deadline_texto: string, dia_limite: number | null): number | null {
  const hoy = getDiaActual();
  const diasMes = getDiasEnMes();
  if (!deadline_texto) return null;
  const dl = deadline_texto.toLowerCase();
  if (dl === "continuo" || dl === "variable") return null;
  if (dl === "cierre mes" || dl === "último día") return diasMes - hoy;

  if (dia_limite != null) {
    if (dia_limite >= hoy) return dia_limite - hoy;
    return (diasMes - hoy) + dia_limite;
  }

  const nums = deadline_texto.match(/\d+/g);
  if (nums) {
    const d1 = parseInt(nums[0]);
    if (d1 >= hoy) return d1 - hoy;
    return (diasMes - hoy) + d1;
  }
  return null;
}

function urgencyDot(dias: number | null, pagado: boolean): { dot: string; label: string; sortKey: number } {
  if (pagado) return { dot: "⬜", label: "pagado", sortKey: 9999 };
  if (dias == null) return { dot: "⬜", label: "continuo", sortKey: 500 };
  if (dias <= 2)  return { dot: "🔴", label: dias === 0 ? "hoy" : `${dias}d`, sortKey: dias };
  if (dias <= 7)  return { dot: "🟡", label: `${dias}d`, sortKey: 100 + dias };
  return           { dot: "🟢", label: `${dias}d`, sortKey: 200 + dias };
}

function deadlineLabel(p: PagoRecurrente, dias: number | null): string {
  if (p.deadline_texto === "Continuo" || p.deadline_texto === "Variable") return p.deadline_texto;
  if (dias == null) return p.deadline_texto;
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return `Vence mañana — día ${p.dia_limite ?? p.deadline_texto}`;
  if (dias <= 7)  return `Vence en ${dias} días — ${p.deadline_texto}`;
  return `Vence día ${p.dia_limite ?? p.deadline_texto} del mes`;
}

const SEMAFORO_BG    = { verde: "#ECFDF5", amarillo: "#FFFBEB", rojo: "#FEF2F2" } as const;
const SEMAFORO_COLOR = { verde: "#059669", amarillo: "#D97706", rojo: "#DC2626" } as const;
const SEMAFORO_BORDE = { verde: "#6EE7B7", amarillo: "#FDE68A", rojo: "#FECACA" } as const;
const SEMAFORO_EMOJI = { verde: "🟢", amarillo: "🟡", rojo: "🔴" } as const;
const SEMAFORO_TEXTO = {
  verde:    "Flujo de caja saludable este mes",
  amarillo: "Algunas semanas pueden estar ajustadas — revisa pagos",
  rojo:     "Hay semanas con déficit proyectado — acción recomendada",
} as const;

const TIPO_COLOR: Record<string, string> = {
  nomina: "#7C3AED",
  impuesto: "#DC2626",
  retiro: "#D97706",
  renta: "#2563EB",
  servicios: "#0891B2",
  otro: "#6B7280",
};

// ════════════════════════════════════════════════════════════════════════════════
export const Tesoreria = () => {
  const { restauranteId } = useRestaurante();

  const [CATEGORIAS, setCATEGORIAS] = useState<string[]>([]);
  useEffect(() => {
    api.get("/api/categorias").then((data: any[]) => setCATEGORIAS(data.map((c) => c.nombre))).catch(() => {});
  }, []);

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"pagos" | "flujo">("pagos");

  // ── Pagos state ───────────────────────────────────────────────────────────
  const [pagos,       setPagos]       = useState<PagoRecurrente[]>([]);
  const [flujoLegacy, setFlujoLegacy] = useState<FlujoCajaLegacy | null>(null);
  const [loadingP,    setLoadingP]    = useState(true);
  const [loadingF,    setLoadingF]    = useState(true);
  const [proyeccion,  setProyeccion]  = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [editId,      setEditId]      = useState<number | null>(null);
  const [form,        setForm]        = useState<FormData>(emptyForm);
  const [saving,      setSaving]      = useState(false);
  const [marcando,    setMarcando]    = useState<Set<number>>(new Set());
  const [confirm,     setConfirm]     = useState<{ id: number; concepto: string; monto: number } | null>(null);

  // ── Flujo de Caja nuevo state ─────────────────────────────────────────────
  const [proyFlujo,   setProyFlujo]   = useState<ProyeccionFlujo | null>(null);
  const [loadingPF,   setLoadingPF]   = useState(false);
  const [savingCfg,   setSavingCfg]   = useState(false);
  const [configOpen,  setConfigOpen]  = useState(false);
  const [cfgForm,     setCfgForm]     = useState<ConfigFlujo>(emptyConfig);
  const [mesFlujo,    setMesFlujo]    = useState(getMesActual());
  const [anioFlujo,   setAnioFlujo]   = useState(getAnioActual());

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchPagos = async () => {
    setLoadingP(true);
    try {
      const data = await api.get(`/api/pagos-recurrentes?restaurante_id=${restauranteId}`);
      setPagos(data);
    } catch {}
    finally { setLoadingP(false); }
  };

  const fetchFlujoLegacy = async () => {
    setLoadingF(true);
    try {
      const data = await api.get(`/api/pagos/flujo-caja/${restauranteId}?dias=30`);
      setFlujoLegacy(data);
    } catch {}
    finally { setLoadingF(false); }
  };

  const fetchProyeccion = async (mes = mesFlujo, anio = anioFlujo) => {
    setLoadingPF(true);
    try {
      const data = await api.get(`/api/flujo-caja/${restauranteId}/proyeccion?mes=${mes}&anio=${anio}`);
      setProyFlujo(data);
      if (data.config) setCfgForm({ ...emptyConfig, ...data.config });
    } catch {}
    finally { setLoadingPF(false); }
  };

  useEffect(() => { fetchPagos(); fetchFlujoLegacy(); }, [restauranteId]);

  useEffect(() => {
    if (activeTab === "flujo") fetchProyeccion(mesFlujo, anioFlujo);
  }, [activeTab, restauranteId]);

  // ── Pagos helpers ─────────────────────────────────────────────────────────
  const pagosOrdenados = useMemo(() => {
    return pagos
      .map((p) => {
        const pagado = isPagadoEsteMes(p);
        const dias   = pagado ? null : calcDias(p.deadline_texto, p.dia_limite);
        const urg    = urgencyDot(dias, pagado);
        return { ...p, pagado, dias, urg };
      })
      .sort((a, b) => a.urg.sortKey - b.urg.sortKey);
  }, [pagos]);

  const semanaActual: SemanaFlujoLegacy | null = flujoLegacy && !flujoLegacy.datos_insuficientes && flujoLegacy.semanas.length > 0
    ? flujoLegacy.semanas[0] : null;

  // ── Pagos actions ─────────────────────────────────────────────────────────
  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit   = (p: PagoRecurrente) => {
    setForm({
      concepto: p.concepto, proveedor: p.proveedor, categoria: p.categoria,
      frecuencia: p.frecuencia, deadline_texto: p.deadline_texto,
      dia_limite: p.dia_limite != null ? String(p.dia_limite) : "",
      monto_estimado: p.monto_estimado ? String(p.monto_estimado) : "",
      notas: p.notas ?? "",
    });
    setEditId(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      concepto: form.concepto, proveedor: form.proveedor,
      categoria: form.categoria, frecuencia: form.frecuencia,
      deadline_texto: form.deadline_texto,
      dia_limite: form.dia_limite ? parseInt(form.dia_limite) : null,
      monto_estimado: parseFloat(form.monto_estimado) || 0,
      notas: form.notas || null,
    };
    try {
      if (editId) await api.put(`/api/pagos-recurrentes/${editId}`, body);
      else        await api.post("/api/pagos-recurrentes", { ...body, restaurante_id: restauranteId });
      setShowForm(false);
      await Promise.all([fetchPagos(), fetchFlujoLegacy()]);
    } catch (e: any) {
      alert(`Error al guardar: ${e?.message ?? e}`);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Eliminar este pago recurrente?")) return;
    try { await api.del(`/api/pagos-recurrentes/${id}`); } catch {}
    await Promise.all([fetchPagos(), fetchFlujoLegacy()]);
  };

  const confirmarPago = (p: typeof pagosOrdenados[0]) => {
    if (p.pagado) {
      doMarcar(p.id, true);
    } else {
      setConfirm({ id: p.id, concepto: p.concepto, monto: p.monto_estimado });
    }
  };

  const doMarcar = async (id: number, yaPagado: boolean) => {
    setConfirm(null);
    setMarcando((prev) => new Set(prev).add(id));
    try {
      if (yaPagado) await api.post(`/api/pagos-recurrentes/${id}/desmarcar-pagado`, {});
      else          await api.post(`/api/pagos-recurrentes/${id}/marcar-pagado`, {});
      await Promise.all([fetchPagos(), fetchFlujoLegacy()]);
    } catch (e: any) { alert(`Error: ${e?.message ?? e}`); }
    finally { setMarcando((prev) => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  // ── Flujo config save ─────────────────────────────────────────────────────
  const handleSaveCfg = async () => {
    setSavingCfg(true);
    try {
      await api.put(`/api/flujo-caja/${restauranteId}/config`, cfgForm);
      await fetchProyeccion(mesFlujo, anioFlujo);
      setConfigOpen(false);
    } catch (e: any) { alert(`Error al guardar config: ${e?.message ?? e}`); }
    finally { setSavingCfg(false); }
  };

  const MESES_ES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "840px", margin: "0 auto" }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeOut { from { opacity:1; } to { opacity:0; } }
        .pr-row { transition: background 0.15s, opacity 0.2s; }
        .pr-row:hover { background: #FAFAFA !important; }
        .semana-card { transition: box-shadow 0.15s; }
        .semana-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#111827", margin: 0 }}>Calendario de Pagos</h1>
            <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Día {getDiaActual()} del mes</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => { fetchPagos(); fetchFlujoLegacy(); if (activeTab === "flujo") fetchProyeccion(mesFlujo, anioFlujo); }}
            style={{ padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", background: "#FFF", cursor: "pointer", color: "#6B7280", display: "flex", alignItems: "center" }}
          >
            <RefreshCw style={{ width: "13px", height: "13px" }} />
          </button>
          {activeTab === "pagos" && (
            <button
              onClick={openCreate}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#3D1C1E", color: "#C8FF00", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
            >
              <Plus style={{ width: "14px", height: "14px" }} /> Nuevo pago
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "4px", background: "#F3F4F6", borderRadius: "10px", padding: "4px", marginBottom: "20px" }}>
        <button
          onClick={() => setActiveTab("pagos")}
          style={{
            flex: 1, padding: "8px 16px", borderRadius: "7px", border: "none", cursor: "pointer",
            fontSize: "13px", fontWeight: "600",
            background: activeTab === "pagos" ? "#FFF" : "transparent",
            color: activeTab === "pagos" ? "#111827" : "#6B7280",
            boxShadow: activeTab === "pagos" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
        >
          <Calendar style={{ width: "13px", height: "13px" }} />
          Pagos recurrentes
        </button>
        <button
          onClick={() => setActiveTab("flujo")}
          style={{
            flex: 1, padding: "8px 16px", borderRadius: "7px", border: "none", cursor: "pointer",
            fontSize: "13px", fontWeight: "600",
            background: activeTab === "flujo" ? "#FFF" : "transparent",
            color: activeTab === "flujo" ? "#111827" : "#6B7280",
            boxShadow: activeTab === "flujo" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
        >
          <TrendingUp style={{ width: "13px", height: "13px" }} />
          Flujo de Caja
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: PAGOS RECURRENTES                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "pagos" && (
        <>
          {/* Banner situación semana actual */}
          {loadingF && (
            <div style={{ background: "#FFF", borderRadius: "16px", padding: "28px 24px", marginBottom: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>
              Calculando proyección…
            </div>
          )}

          {!loadingF && flujoLegacy?.datos_insuficientes && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "14px", padding: "18px 22px", marginBottom: "20px", fontSize: "13px", color: "#92400E" }}>
              Sin suficientes cierres de turno para proyectar el flujo de caja esta semana.
            </div>
          )}

          {!loadingF && semanaActual && (() => {
            const sem = semanaActual;
            const bg    = SEMAFORO_BG[sem.semaforo];
            const color = SEMAFORO_COLOR[sem.semaforo];
            const borde = SEMAFORO_BORDE[sem.semaforo];
            return (
              <div style={{ background: bg, border: `1px solid ${borde}`, borderRadius: "16px", padding: "22px 26px", marginBottom: "24px", animation: "fadeIn 0.3s ease both" }}>
                <div style={{ fontSize: "18px", fontWeight: "800", color, marginBottom: "10px" }}>
                  {SEMAFORO_EMOJI[sem.semaforo]} {sem.semaforo === "verde" ? "Esta semana estás bien" : sem.semaforo === "amarillo" ? "Esta semana está ajustada — revisa tus pagos" : "Esta semana puede estar apretada — considera priorizar pagos"}
                </div>
                <div style={{ display: "flex", gap: "6px", fontSize: "13px", color, flexWrap: "wrap" as const }}>
                  <span>Ventas estimadas {fmt(sem.ingresos_estimados)}</span>
                  {sem.egresos_comprometidos > 0 && (
                    <span style={{ opacity: 0.75 }}>· Por pagar {fmt(sem.egresos_comprometidos)}</span>
                  )}
                </div>
                {sem.balance > 0 && (
                  <div style={{ fontSize: "13px", color, opacity: 0.75, marginTop: "4px" }}>
                    Te sobran ~{fmt(sem.balance)} después de compromisos esta semana
                  </div>
                )}
                {sem.balance <= 0 && sem.egresos_comprometidos > 0 && (
                  <div style={{ fontSize: "13px", color, opacity: 0.75, marginTop: "4px" }}>
                    Los compromisos exceden las ventas estimadas en {fmt(Math.abs(sem.balance))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Lista de pagos */}
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: "16px" }}>
            {loadingP && (
              <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Cargando pagos…</div>
            )}
            {!loadingP && pagosOrdenados.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>
                No hay pagos recurrentes. Usa "Nuevo pago" para agregar.
              </div>
            )}

            {pagosOrdenados.map((p, i) => {
              const esMarcando = marcando.has(p.id);
              const dl = deadlineLabel(p, p.dias);

              return (
                <div
                  key={p.id}
                  className="pr-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 20px",
                    borderBottom: i < pagosOrdenados.length - 1 ? "1px solid #F3F4F6" : "none",
                    background: "transparent",
                    opacity: p.pagado ? 0.6 : 1,
                    animation: `fadeIn 0.2s ease ${Math.min(i, 8) * 0.03}s both`,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "2px", width: "36px", flexShrink: 0 }}>
                    <span style={{ fontSize: "15px", lineHeight: "1" }}>{p.urg.dot}</span>
                    <span style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF" }}>{p.urg.label}</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" as const }}>
                      <span style={{
                        fontSize: "14px", fontWeight: "700", color: p.pagado ? "#9CA3AF" : "#111827",
                        textDecoration: p.pagado ? "line-through" : "none",
                      }}>
                        {p.concepto}
                      </span>
                      <span style={{ fontSize: "12px", color: "#9CA3AF" }}>· {p.proveedor}</span>
                      {p.monto_estimado > 0 ? (
                        <span style={{ fontSize: "12px", fontWeight: "600", color: p.pagado ? "#9CA3AF" : "#374151" }}>
                          {fmt(p.monto_estimado)}
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", color: "#D1D5DB", fontStyle: "italic" }}>monto variable</span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{dl}</div>
                  </div>

                  <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0 }}>
                    {!p.pagado && (
                      <button
                        onClick={() => confirmarPago(p)}
                        disabled={esMarcando}
                        style={{
                          display: "flex", alignItems: "center", gap: "4px",
                          padding: "5px 10px", border: "1px solid #D1FAE5", borderRadius: "7px",
                          background: "#ECFDF5", color: "#059669",
                          fontSize: "11px", fontWeight: "700", cursor: esMarcando ? "not-allowed" : "pointer",
                          opacity: esMarcando ? 0.5 : 1, whiteSpace: "nowrap" as const,
                        }}
                      >
                        <Check style={{ width: "11px", height: "11px" }} />
                        Marcar pagado
                      </button>
                    )}
                    {p.pagado && (
                      <button
                        onClick={() => confirmarPago(p)}
                        disabled={esMarcando}
                        style={{ padding: "5px 8px", border: "1px solid #E5E7EB", borderRadius: "7px", background: "#FFF", color: "#9CA3AF", fontSize: "11px", cursor: "pointer" }}
                      >
                        Deshacer
                      </button>
                    )}
                    <button onClick={() => openEdit(p)} style={{ padding: "5px", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
                      <Edit2 style={{ width: "13px", height: "13px" }} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} style={{ padding: "5px", background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}>
                      <Trash2 style={{ width: "13px", height: "13px" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Proyección legacy colapsable */}
          {!loadingF && flujoLegacy && !flujoLegacy.datos_insuficientes && flujoLegacy.semanas.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <button
                onClick={() => setProyeccion((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "13px 18px",
                  background: "#FFF", border: "1px solid #E5E7EB", borderRadius: proyeccion ? "12px 12px 0 0" : "12px",
                  cursor: "pointer", fontSize: "13px", fontWeight: "600", color: "#374151",
                }}
              >
                <span>Ver proyección próximas 4 semanas</span>
                {proyeccion ? <ChevronUp style={{ width: "16px", height: "16px", color: "#9CA3AF" }} /> : <ChevronDown style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />}
              </button>

              {proyeccion && (
                <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 40px", padding: "8px 18px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                    {["Semana", "Compromisos", "Balance estimado", ""].map((h) => (
                      <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>{h}</span>
                    ))}
                  </div>
                  {flujoLegacy.semanas.map((sem, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 40px", padding: "11px 18px", borderBottom: i < flujoLegacy.semanas.length - 1 ? "1px solid #F9FAFB" : "none", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", color: "#374151", fontWeight: "600" }}>{sem.semana}</span>
                      <span style={{ fontSize: "12px", color: "#374151" }}>
                        {sem.pagos.length === 0
                          ? <span style={{ color: "#9CA3AF" }}>Sin pagos</span>
                          : sem.pagos.map((p) => `${p.concepto} ${fmt(p.monto)}`).join(" · ")
                        }
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: sem.balance >= 0 ? "#059669" : "#DC2626" }}>
                        {sem.egresos_comprometidos > 0
                          ? `${fmt(sem.balance)} balance`
                          : `${fmt(sem.ingresos_estimados)} estimado`
                        }
                      </span>
                      <span style={{ fontSize: "14px", textAlign: "center" as const }}>
                        {SEMAFORO_EMOJI[sem.semaforo]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB: FLUJO DE CAJA                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "flujo" && (
        <>
          {/* ── Selector de mes ──────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>Período:</label>
            <select
              value={mesFlujo}
              onChange={(e) => { const m = parseInt(e.target.value); setMesFlujo(m); fetchProyeccion(m, anioFlujo); }}
              style={{ padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", background: "#FFF", cursor: "pointer" }}
            >
              {MESES_ES.slice(1).map((n, i) => (
                <option key={i + 1} value={i + 1}>{n}</option>
              ))}
            </select>
            <select
              value={anioFlujo}
              onChange={(e) => { const a = parseInt(e.target.value); setAnioFlujo(a); fetchProyeccion(mesFlujo, a); }}
              style={{ padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", background: "#FFF", cursor: "pointer" }}
            >
              {[getAnioActual() - 1, getAnioActual(), getAnioActual() + 1].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* ── Sección 1: Config colapsable ─────────────────────────────── */}
          <div style={{ marginBottom: "16px", background: "#FFF", borderRadius: "14px", border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <button
              onClick={() => setConfigOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "14px 18px", background: "transparent", border: "none",
                cursor: "pointer", fontSize: "13px", fontWeight: "600", color: "#374151",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Settings style={{ width: "14px", height: "14px", color: "#6B7280" }} />
                Configuración del flujo
              </span>
              {configOpen ? <ChevronUp style={{ width: "16px", height: "16px", color: "#9CA3AF" }} /> : <ChevronDown style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />}
            </button>

            {configOpen && (
              <div style={{ padding: "16px 18px 20px", borderTop: "1px solid #F3F4F6", animation: "fadeIn 0.15s ease both" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Saldo banco inicial (MXN)</label>
                    <input
                      type="number" min="0" step="100"
                      value={cfgForm.saldo_banco_inicial}
                      onChange={(e) => setCfgForm((f) => ({ ...f, saldo_banco_inicial: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Nómina semanal estimada (MXN)</label>
                    <input
                      type="number" min="0" step="100"
                      value={cfgForm.nomina_semanal_estimada}
                      onChange={(e) => setCfgForm((f) => ({ ...f, nomina_semanal_estimada: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>IVA % (sobre ventas netas)</label>
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={cfgForm.porcentaje_iva}
                      onChange={(e) => setCfgForm((f) => ({ ...f, porcentaje_iva: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>ISR % (sobre utilidad estimada)</label>
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={cfgForm.porcentaje_isr}
                      onChange={(e) => setCfgForm((f) => ({ ...f, porcentaje_isr: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Día corte impuestos</label>
                    <input
                      type="number" min="1" max="31"
                      value={cfgForm.dia_corte_impuestos}
                      onChange={(e) => setCfgForm((f) => ({ ...f, dia_corte_impuestos: parseInt(e.target.value) || 17 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Semana de retiro (1–4)</label>
                    <select
                      value={cfgForm.semana_retiro}
                      onChange={(e) => setCfgForm((f) => ({ ...f, semana_retiro: parseInt(e.target.value) }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px" }}
                    >
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Semana {n}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>% Retiro de utilidades (0 = sin retiro fijo)</label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={cfgForm.retiro_utilidades_pct}
                      onChange={(e) => setCfgForm((f) => ({ ...f, retiro_utilidades_pct: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={handleSaveCfg}
                    disabled={savingCfg}
                    style={{ padding: "9px 20px", border: "none", borderRadius: "8px", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "600", cursor: savingCfg ? "not-allowed" : "pointer", opacity: savingCfg ? 0.6 : 1 }}
                  >
                    {savingCfg ? "Guardando…" : "Guardar configuración"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Loading ───────────────────────────────────────────────────── */}
          {loadingPF && (
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "40px", textAlign: "center", color: "#9CA3AF", fontSize: "13px", marginBottom: "16px" }}>
              Calculando proyección de flujo de caja…
            </div>
          )}

          {/* ── Sección 2: Banner semáforo general ───────────────────────── */}
          {!loadingPF && proyFlujo && (() => {
            const { resumen, ventas_proyectadas, ventas_promedio_diario, dias_con_datos, datos_insuficientes } = proyFlujo;

            if (datos_insuficientes) {
              return (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "14px", padding: "18px 22px", marginBottom: "16px", fontSize: "13px", color: "#92400E" }}>
                  Sin suficientes cierres de turno para proyectar este mes. Registra cierres de turno para activar la proyección.
                </div>
              );
            }

            const sem = resumen.semaforo_general;
            return (
              <div style={{ background: SEMAFORO_BG[sem], border: `1px solid ${SEMAFORO_BORDE[sem]}`, borderRadius: "16px", padding: "20px 24px", marginBottom: "20px", animation: "fadeIn 0.25s ease both" }}>
                <div style={{ fontSize: "17px", fontWeight: "800", color: SEMAFORO_COLOR[sem], marginBottom: "10px" }}>
                  {SEMAFORO_EMOJI[sem]} {SEMAFORO_TEXTO[sem]}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "2px" }}>Ventas proyectadas mes</div>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{fmt(ventas_proyectadas)}</div>
                    <div style={{ fontSize: "11px", color: "#6B7280" }}>{fmt(ventas_promedio_diario)}/día · {dias_con_datos} días con datos</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "2px" }}>Total egresos estimados</div>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#374151" }}>{fmt(resumen.total_egresos_mes)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "2px" }}>Saldo final proyectado</div>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: resumen.saldo_final >= 0 ? "#059669" : "#DC2626" }}>
                      {fmt(resumen.saldo_final)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Sección 3: Timeline 4 semanas ────────────────────────────── */}
          {!loadingPF && proyFlujo && !proyFlujo.datos_insuficientes && (
            <div style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
              {proyFlujo.semanas.map((sem) => {
                const sem_color = SEMAFORO_COLOR[sem.semaforo];
                const sem_bg    = SEMAFORO_BG[sem.semaforo];
                const sem_borde = SEMAFORO_BORDE[sem.semaforo];

                return (
                  <div
                    key={sem.numero}
                    className="semana-card"
                    style={{
                      background: "#FFF", borderRadius: "14px", overflow: "hidden",
                      border: `1px solid ${sem_borde}`,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      animation: `fadeIn 0.2s ease ${(sem.numero - 1) * 0.06}s both`,
                    }}
                  >
                    {/* Card header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: sem_bg, borderBottom: `1px solid ${sem_borde}` }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: sem_color }}>
                          {SEMAFORO_EMOJI[sem.semaforo]} Semana {sem.numero}
                        </div>
                        <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "1px" }}>{sem.dias}</div>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <div style={{ fontSize: "11px", color: "#9CA3AF" }}>Balance semana</div>
                        <div style={{ fontSize: "16px", fontWeight: "800", color: sem.balance_semana >= 0 ? "#059669" : "#DC2626" }}>
                          {sem.balance_semana >= 0 ? "+" : ""}{fmt(sem.balance_semana)}
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div style={{ padding: "14px 18px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "2px" }}>Ingresos estimados</div>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#059669" }}>{fmt(sem.ingresos_estimados)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "2px" }}>Total egresos</div>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: "#374151" }}>{fmt(sem.total_egresos)}</div>
                        </div>
                      </div>

                      {/* Egresos detalle */}
                      {sem.egresos.length > 0 && (
                        <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: "10px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>Egresos</div>
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: "5px" }}>
                            {sem.egresos.map((eg, j) => (
                              <div key={j} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{
                                    display: "inline-block", padding: "1px 7px", borderRadius: "100px",
                                    fontSize: "10px", fontWeight: "700",
                                    background: (TIPO_COLOR[eg.tipo] || "#6B7280") + "1A",
                                    color: TIPO_COLOR[eg.tipo] || "#6B7280",
                                  }}>
                                    {eg.tipo}
                                  </span>
                                  <span style={{ fontSize: "12px", color: "#374151" }}>
                                    {eg.concepto}
                                    {eg.variable && <span style={{ color: "#9CA3AF", marginLeft: "4px", fontStyle: "italic" }}>(variable)</span>}
                                  </span>
                                </div>
                                <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151", whiteSpace: "nowrap" as const }}>
                                  {eg.monto > 0 ? fmt(eg.monto) : <span style={{ color: "#D1D5DB" }}>$0</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Saldo acumulado */}
                      <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "#6B7280", fontWeight: "600" }}>Saldo acumulado al cierre</span>
                        <span style={{ fontSize: "14px", fontWeight: "800", color: sem.saldo_acumulado >= 0 ? "#059669" : "#DC2626" }}>
                          {fmt(sem.saldo_acumulado)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Sección 4: Recomendaciones ────────────────────────────────── */}
          {!loadingPF && proyFlujo && !proyFlujo.datos_insuficientes && proyFlujo.recomendaciones.length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "14px", padding: "16px 20px", marginBottom: "24px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#92400E", marginBottom: "10px", textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>
                Recomendaciones
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
                {proyFlujo.recomendaciones.map((rec, i) => (
                  <div key={i} style={{ fontSize: "13px", color: "#78350F", lineHeight: "1.5" }}>{rec}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Modal de confirmación de pago                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FFF", borderRadius: "14px", padding: "26px 28px", width: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", animation: "fadeIn 0.18s ease both" }}>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827", marginBottom: "8px" }}>Confirmar pago</div>
            <div style={{ fontSize: "13px", color: "#6B7280", marginBottom: "20px" }}>
              ¿Confirmar pago de <strong>{confirm.concepto}</strong>{confirm.monto > 0 ? ` ${fmt(confirm.monto)}` : ""}?
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setConfirm(null)} style={{ padding: "8px 16px", border: "1px solid #E5E7EB", borderRadius: "8px", background: "#FFF", fontSize: "13px", cursor: "pointer", color: "#374151" }}>
                No
              </button>
              <button
                onClick={() => doMarcar(confirm.id, false)}
                style={{ padding: "8px 20px", border: "none", borderRadius: "8px", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
              >
                Sí, pagado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Modal crear / editar pago                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FFF", borderRadius: "16px", padding: "28px", width: "480px", maxHeight: "90vh", overflowY: "auto", animation: "fadeIn 0.18s ease both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#111827" }}>
                {editId ? "Editar pago" : "Nuevo pago recurrente"}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
                <X style={{ width: "18px", height: "18px" }} />
              </button>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Concepto *</label>
                <input type="text" value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Renta local"
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Proveedor *</label>
                <input type="text" value={form.proveedor} onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))}
                  placeholder="Ej: Pabellón"
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Categoría</label>
                  <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px" }}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Frecuencia</label>
                  <select value={form.frecuencia} onChange={(e) => setForm((f) => ({ ...f, frecuencia: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px" }}>
                    {FRECUENCIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Deadline *</label>
                  <input type="text" placeholder="Ej: Día 10, Cierre mes" value={form.deadline_texto} onChange={(e) => setForm((f) => ({ ...f, deadline_texto: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Día límite (número)</label>
                  <input type="number" min="1" max="31" placeholder="Ej: 10" value={form.dia_limite} onChange={(e) => setForm((f) => ({ ...f, dia_limite: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Monto estimado (MXN) — opcional</label>
                <input type="number" min="0" step="1" placeholder="Dejar en blanco si es variable" value={form.monto_estimado} onChange={(e) => setForm((f) => ({ ...f, monto_estimado: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "22px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 18px", border: "1px solid #E5E7EB", borderRadius: "8px", background: "#FFF", fontSize: "13px", cursor: "pointer", color: "#374151" }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.concepto.trim() || !form.proveedor.trim() || !form.deadline_texto.trim()}
                style={{ padding: "9px 20px", border: "none", borderRadius: "8px", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
