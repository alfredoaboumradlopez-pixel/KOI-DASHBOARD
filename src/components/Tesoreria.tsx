import { useState, useEffect } from "react";
import {
  Calendar, AlertTriangle, CheckCircle, Bell, Plus, Edit2, Trash2, X,
  TrendingUp, TrendingDown, Wallet, RefreshCw, Check,
} from "lucide-react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const FRECUENCIAS = ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL", "ANUAL", "VARIABLE"];

// ── Interfaces ────────────────────────────────────────────────────────────────
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

interface SemanaFlujo {
  semana: string;
  ingresos_estimados: number;
  egresos_comprometidos: number;
  balance: number;
  semaforo: "verde" | "amarillo" | "rojo";
  pagos: PagoComprometido[];
}

interface FlujoCaja {
  datos_insuficientes: boolean;
  mensaje?: string;
  periodo_dias: number;
  ventas_promedio_diario: number;
  ingresos_proyectados_30d: number;
  pagos_comprometidos: PagoComprometido[];
  total_comprometido_30d: number;
  semanas: SemanaFlujo[];
  alertas_flujo: SemanaFlujo[];
  resumen: {
    semaforo_general: "verde" | "amarillo" | "rojo";
    semanas_en_riesgo: number;
    superavit_estimado_30d: number;
  };
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

const emptyForm: FormData = {
  concepto: "", proveedor: "", categoria: "RENTA", frecuencia: "MENSUAL",
  deadline_texto: "", dia_limite: "", monto_estimado: "0", notas: "",
};

// ── Helpers de estado de pago ─────────────────────────────────────────────────
function getDiaActual() { return new Date().getDate(); }
function getMesActual() { return new Date().getMonth() + 1; }
function getAnioActual() { return new Date().getFullYear(); }
function getDiasEnMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

function isPagadoEsteMes(p: PagoRecurrente) {
  return p.pagado_mes === getMesActual() && p.pagado_anio === getAnioActual();
}

function getDiasParaVencer(dia_limite: number | null): number | null {
  if (dia_limite == null) return null;
  const hoy = getDiaActual();
  const diasMes = getDiasEnMes();
  if (dia_limite >= hoy) return dia_limite - hoy;
  // Ya pasó este mes → calcular para mes siguiente (aproximado en días)
  return (diasMes - hoy) + dia_limite;
}

function getStatus(deadline: string | undefined, dia_limite: number | null): { status: "urgente" | "proximo" | "ok" | "continuo"; label: string } {
  if (!deadline) return { status: "ok", label: "-" };
  const dia = getDiaActual();
  const diasMes = getDiasEnMes();
  if (deadline === "Continuo" || deadline === "Variable") return { status: "continuo", label: deadline };
  if (deadline === "Cierre mes" || deadline === "Último día") {
    const f = diasMes - dia;
    if (f <= 3) return { status: "urgente", label: "En " + f + " días" };
    if (f <= 7) return { status: "proximo", label: "En " + f + " días" };
    return { status: "ok", label: "Día " + diasMes };
  }
  if (dia_limite != null) {
    if (dia > dia_limite) return { status: "ok", label: "Venció día " + dia_limite };
    if (dia >= dia_limite - 2) return { status: "urgente", label: "Vence día " + dia_limite };
    if (dia_limite - dia <= 7) return { status: "proximo", label: "En " + (dia_limite - dia) + " días" };
    return { status: "ok", label: "Día " + dia_limite };
  }
  const nums = deadline.match(/\d+/g);
  if (nums && nums.length > 0) {
    const d1 = parseInt(nums[0]);
    const d2 = nums.length > 1 ? parseInt(nums[nums.length - 1]) : d1;
    if (dia > d2) return { status: "ok", label: "Venció día " + d2 };
    if (dia >= d1) return { status: "urgente", label: "Vence día " + d2 };
    if (d1 - dia <= 5) return { status: "proximo", label: "En " + (d1 - dia) + " días" };
    return { status: "ok", label: deadline };
  }
  return { status: "ok", label: deadline };
}

const statusColors = {
  urgente: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  proximo: { bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
  ok: { bg: "#F9FAFB", color: "#6B7280", border: "#F3F4F6" },
  continuo: { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
};

const semaforoEmoji = { verde: "🟢", amarillo: "🟡", rojo: "🔴" };
const semaforoColor = { verde: "#059669", amarillo: "#D97706", rojo: "#DC2626" };
const semaforoBg = { verde: "#ECFDF5", amarillo: "#FFFBEB", rojo: "#FEF2F2" };

// ════════════════════════════════════════════════════════════════════════════════
export const Tesoreria = () => {
  const { restauranteId } = useRestaurante();
  const [CATEGORIAS, setCATEGORIAS] = useState<string[]>([]);
  useEffect(() => {
    api.get("/api/categorias").then((data: any[]) => setCATEGORIAS(data.map((c) => c.nombre))).catch(() => {});
  }, []);

  const [pagos, setPagos] = useState<PagoRecurrente[]>([]);
  const [flujo, setFlujo] = useState<FlujoCaja | null>(null);
  const [loadingPagos, setLoadingPagos] = useState(true);
  const [loadingFlujo, setLoadingFlujo] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "urgentes" | "proximos">("todos");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [marcandoPagado, setMarcandoPagado] = useState<Set<number>>(new Set());

  const fetchPagos = async () => {
    try {
      const data = await api.get(`/api/pagos-recurrentes?restaurante_id=${restauranteId}`);
      setPagos(data);
    } catch (e) {
      console.error("Error cargando pagos:", e);
    } finally {
      setLoadingPagos(false);
    }
  };

  const fetchFlujo = async () => {
    setLoadingFlujo(true);
    try {
      const data = await api.get(`/api/pagos/flujo-caja/${restauranteId}?dias=30`);
      setFlujo(data);
    } catch (e) {
      console.error("Error cargando flujo de caja:", e);
    } finally {
      setLoadingFlujo(false);
    }
  };

  useEffect(() => {
    fetchPagos();
    fetchFlujo();
  }, [restauranteId]);

  const pagosConStatus = pagos.map((p) => {
    const pagado = isPagadoEsteMes(p);
    const s = pagado
      ? { status: "ok" as const, label: "✓ Pagado" }
      : getStatus(p.deadline_texto, p.dia_limite);
    return { ...p, status: s.status, label: s.label, pagado };
  });

  const urgentes = pagosConStatus.filter((p) => p.status === "urgente" && !p.pagado).length;
  const proximos = pagosConStatus.filter((p) => p.status === "proximo" && !p.pagado).length;

  const filtrados = filtro === "urgentes"
    ? pagosConStatus.filter((p) => p.status === "urgente")
    : filtro === "proximos"
    ? pagosConStatus.filter((p) => p.status === "urgente" || p.status === "proximo")
    : pagosConStatus;

  const pagosPendientes = filtrados.filter((p) => !p.pagado);
  const pagosPagados = filtrados.filter((p) => p.pagado);
  const filtradosOrdenados = [...pagosPendientes, ...pagosPagados];

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit = (p: PagoRecurrente) => {
    setForm({
      concepto: p.concepto, proveedor: p.proveedor, categoria: p.categoria,
      frecuencia: p.frecuencia, deadline_texto: p.deadline_texto,
      dia_limite: p.dia_limite != null ? String(p.dia_limite) : "",
      monto_estimado: String(p.monto_estimado), notas: p.notas ?? "",
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
      if (editId) {
        await api.put(`/api/pagos-recurrentes/${editId}`, body);
      } else {
        await api.post("/api/pagos-recurrentes", { ...body, restaurante_id: restauranteId });
      }
      setShowForm(false);
      await Promise.all([fetchPagos(), fetchFlujo()]);
    } catch (e: any) {
      alert(`Error al guardar: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este pago recurrente?")) return;
    try { await api.del(`/api/pagos-recurrentes/${id}`); } catch {}
    await Promise.all([fetchPagos(), fetchFlujo()]);
  };

  const marcarPagado = async (id: number, yaPagado: boolean) => {
    setMarcandoPagado((prev) => new Set(prev).add(id));
    try {
      if (yaPagado) {
        await api.post(`/api/pagos-recurrentes/${id}/desmarcar-pagado`, {});
      } else {
        await api.post(`/api/pagos-recurrentes/${id}/marcar-pagado`, {});
      }
      await Promise.all([fetchPagos(), fetchFlujo()]);
    } catch (e: any) {
      alert(`Error: ${e?.message ?? e}`);
    } finally {
      setMarcandoPagado((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .pago-row:hover { background: #FAFAFA !important; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Calendario de Pagos</h1>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Control de pagos recurrentes y flujo de caja</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontSize: "13px", color: "#6B7280" }}>Hoy: día {getDiaActual()} del mes</div>
          <button
            onClick={() => { fetchPagos(); fetchFlujo(); }}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", background: "#FFF", fontSize: "12px", color: "#6B7280", cursor: "pointer" }}
          >
            <RefreshCw style={{ width: "13px", height: "13px" }} />
          </button>
          <button
            onClick={openCreate}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#3D1C1E", color: "#C8FF00", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
          >
            <Plus style={{ width: "14px", height: "14px" }} /> Nuevo pago
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 1 — Proyección de flujo de caja                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "12px" }}>
          Proyección flujo de caja · próximos 30 días
        </div>

        {loadingFlujo && (
          <div style={{ background: "#FFF", borderRadius: "14px", padding: "28px", textAlign: "center", color: "#9CA3AF", fontSize: "13px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <RefreshCw style={{ width: "16px", height: "16px", margin: "0 auto 8px", display: "block" }} />
            Calculando proyección…
          </div>
        )}

        {!loadingFlujo && flujo?.datos_insuficientes && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "12px", padding: "16px 20px", fontSize: "13px", color: "#92400E" }}>
            <AlertTriangle style={{ width: "14px", height: "14px", display: "inline", marginRight: "6px" }} />
            {flujo.mensaje}
          </div>
        )}

        {!loadingFlujo && flujo && !flujo.datos_insuficientes && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", animation: "fadeUp 0.3s ease both" }}>
            {[
              {
                label: "Ingresos estimados 30D",
                value: fmt(flujo.ingresos_proyectados_30d),
                sub: `${fmt(flujo.ventas_promedio_diario)}/día promedio`,
                color: "#059669", bg: "#ECFDF5",
                icon: TrendingUp,
              },
              {
                label: "Egresos comprometidos",
                value: fmt(flujo.total_comprometido_30d),
                sub: `${flujo.pagos_comprometidos.length} pagos pendientes`,
                color: "#DC2626", bg: "#FEF2F2",
                icon: TrendingDown,
              },
              {
                label: "Balance proyectado",
                value: fmt(flujo.resumen.superavit_estimado_30d),
                sub: flujo.resumen.semanas_en_riesgo > 0
                  ? `${flujo.resumen.semanas_en_riesgo} semana(s) en riesgo`
                  : "Sin semanas en riesgo",
                color: flujo.resumen.superavit_estimado_30d >= 0 ? "#059669" : "#DC2626",
                bg: flujo.resumen.superavit_estimado_30d >= 0 ? "#ECFDF5" : "#FEF2F2",
                icon: Wallet,
              },
              {
                label: "Semáforo general",
                value: flujo.resumen.semaforo_general.charAt(0).toUpperCase() + flujo.resumen.semaforo_general.slice(1),
                sub: `${semaforoEmoji[flujo.resumen.semaforo_general]} Flujo de caja`,
                color: semaforoColor[flujo.resumen.semaforo_general],
                bg: semaforoBg[flujo.resumen.semaforo_general],
                icon: CheckCircle,
              },
            ].map((card, i) => {
              const Ic = card.icon;
              return (
                <div key={i} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "10px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{card.label}</span>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ic style={{ width: "14px", height: "14px", color: card.color }} />
                    </div>
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: card.color, margin: "8px 0 4px" }}>{card.value}</div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{card.sub}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 2 — Timeline semanal                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {!loadingFlujo && flujo && !flujo.datos_insuficientes && flujo.semanas.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "12px" }}>
            Timeline semanal
          </div>

          {/* Alertas de semanas críticas */}
          {flujo.alertas_flujo.map((sem, i) => (
            <div key={i} style={{ background: sem.semaforo === "rojo" ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${sem.semaforo === "rojo" ? "#FECACA" : "#FDE68A"}`, borderRadius: "10px", padding: "10px 16px", marginBottom: "8px", fontSize: "13px", color: sem.semaforo === "rojo" ? "#DC2626" : "#92400E", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              <span>
                <strong>Semana {sem.semana}:</strong> egresos ({fmt(sem.egresos_comprometidos)}) {sem.semaforo === "rojo" ? "superan" : "se acercan a"} los ingresos estimados ({fmt(sem.ingresos_estimados)}) — revisar flujo
              </span>
            </div>
          ))}

          <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
            {flujo.semanas.map((sem, i) => (
              <div
                key={i}
                style={{
                  background: "#FFF",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  borderLeft: `4px solid ${semaforoColor[sem.semaforo]}`,
                  animation: `fadeUp 0.25s ease ${i * 0.04}s both`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sem.pagos.length > 0 ? "8px" : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "16px" }}>{semaforoEmoji[sem.semaforo]}</span>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>Semana {sem.semana}</span>
                  </div>
                  <div style={{ display: "flex", gap: "16px", fontSize: "12px" }}>
                    <span style={{ color: "#059669" }}>Ingresos est. {fmt(sem.ingresos_estimados)}</span>
                    {sem.egresos_comprometidos > 0 && (
                      <span style={{ color: "#DC2626" }}>· Egresos {fmt(sem.egresos_comprometidos)}</span>
                    )}
                    <span style={{ fontWeight: "700", color: sem.balance >= 0 ? "#059669" : "#DC2626" }}>
                      · Balance {sem.balance >= 0 ? "+" : ""}{fmt(sem.balance)}
                    </span>
                  </div>
                </div>
                {sem.pagos.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
                    {sem.pagos.map((p, j) => (
                      <span key={j} style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "20px", background: "#F3F4F6", color: "#374151" }}>
                        → {p.concepto} {fmt(p.monto)} (día {new Date(p.fecha_vencimiento + "T12:00:00").getDate()})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 3 — Cards de estado (existentes)                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px", marginBottom: "20px" }}>
        <div onClick={() => setFiltro("urgentes")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "urgentes" ? "2px solid #DC2626" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const }}>Urgentes</span>
            <AlertTriangle style={{ width: "16px", height: "16px", color: "#DC2626" }} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#DC2626", marginTop: "4px" }}>{urgentes}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>pagos por vencer</span>
        </div>
        <div onClick={() => setFiltro("proximos")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "proximos" ? "2px solid #D97706" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const }}>Próximos</span>
            <Bell style={{ width: "16px", height: "16px", color: "#D97706" }} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#D97706", marginTop: "4px" }}>{proximos}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>próximos 5 días</span>
        </div>
        <div onClick={() => setFiltro("todos")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "todos" ? "2px solid #059669" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const }}>Total Compromisos</span>
            <CheckCircle style={{ width: "16px", height: "16px", color: "#059669" }} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#059669", marginTop: "4px" }}>{pagos.length}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>pagos recurrentes</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 4 — Lista de pagos con "Marcar pagado"                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 100px 110px 120px 110px", padding: "10px 20px", background: "#FAFBFC", borderBottom: "1px solid #F3F4F6" }}>
          {["Concepto", "Proveedor", "Días p/vencer", "Frecuencia", "Deadline", "Estado", ""].map((h) => (
            <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
          ))}
        </div>

        {loadingPagos && (
          <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Cargando pagos...</div>
        )}
        {!loadingPagos && filtradosOrdenados.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No hay pagos. Usa "Nuevo pago".</div>
        )}

        {filtradosOrdenados.map((p) => {
          const sc = statusColors[p.status] || statusColors.ok;
          const diasVencer = getDiasParaVencer(p.dia_limite);
          const diasColor = diasVencer == null
            ? "#9CA3AF"
            : diasVencer <= 2 ? "#DC2626"
            : diasVencer <= 7 ? "#D97706"
            : "#059669";
          const diasBg = diasVencer == null
            ? "#F9FAFB"
            : diasVencer <= 2 ? "#FEF2F2"
            : diasVencer <= 7 ? "#FFFBEB"
            : "#ECFDF5";
          const marcando = marcandoPagado.has(p.id);

          return (
            <div
              key={p.id}
              className="pago-row"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 100px 100px 110px 120px 110px",
                padding: "12px 20px",
                borderBottom: "1px solid #F9FAFB",
                alignItems: "center",
                background: p.pagado ? "#F0FDF4" : p.status === "urgente" ? "#FEF2F2" : "transparent",
                opacity: p.pagado ? 0.8 : 1,
                transition: "background 0.15s",
              }}
            >
              <div>
                <span style={{
                  fontSize: "13px", fontWeight: "600", color: "#111827",
                  textDecoration: p.pagado ? "line-through" : "none",
                }}>
                  {p.concepto}
                </span>
                {p.monto_estimado > 0 && (
                  <span style={{ fontSize: "11px", color: "#6B7280", marginLeft: "6px" }}>{fmt(p.monto_estimado)}</span>
                )}
              </div>

              <span style={{ fontSize: "12px", color: "#374151" }}>{p.proveedor}</span>

              {/* Días para vencer */}
              <span style={{
                fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "6px",
                background: p.pagado ? "#D1FAE5" : diasBg,
                color: p.pagado ? "#059669" : diasColor,
                width: "fit-content",
              }}>
                {p.pagado ? "✓ Pagado" : diasVencer == null ? "—" : diasVencer === 0 ? "Hoy" : `${diasVencer}d`}
              </span>

              <span style={{ fontSize: "11px", color: "#6B7280" }}>{p.frecuencia}</span>
              <span style={{ fontSize: "11px", color: "#374151", fontWeight: "600" }}>{p.deadline_texto}</span>

              <span style={{
                fontSize: "11px", fontWeight: "600", padding: "4px 8px", borderRadius: "6px",
                background: p.pagado ? "#D1FAE5" : sc.bg,
                color: p.pagado ? "#059669" : sc.color,
                border: `1px solid ${p.pagado ? "#6EE7B7" : sc.border}`,
                textAlign: "center" as const,
              }}>
                {p.pagado ? "✓ Pagado este mes" : p.label}
              </span>

              {/* Acciones */}
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <button
                  onClick={() => marcarPagado(p.id, p.pagado)}
                  disabled={marcando}
                  title={p.pagado ? "Desmarcar pagado" : "Marcar como pagado"}
                  style={{
                    display: "flex", alignItems: "center", gap: "3px",
                    padding: "4px 8px", border: "none", borderRadius: "6px",
                    background: p.pagado ? "#F3F4F6" : "#D1FAE5",
                    color: p.pagado ? "#9CA3AF" : "#059669",
                    fontSize: "10px", fontWeight: "700", cursor: marcando ? "not-allowed" : "pointer",
                    opacity: marcando ? 0.5 : 1,
                  }}
                >
                  <Check style={{ width: "10px", height: "10px" }} />
                  {p.pagado ? "Deshacer" : "Pagado"}
                </button>
                <button onClick={() => openEdit(p)} style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
                  <Edit2 style={{ width: "13px", height: "13px" }} />
                </button>
                <button onClick={() => handleDelete(p.id)} style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}>
                  <Trash2 style={{ width: "13px", height: "13px" }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal crear/editar ───────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FFF", borderRadius: "16px", padding: "28px", width: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#111827" }}>{editId ? "Editar pago" : "Nuevo pago recurrente"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X style={{ width: "18px", height: "18px" }} /></button>
            </div>
            <div style={{ display: "grid", gap: "14px" }}>
              {[{ label: "Concepto", key: "concepto" }, { label: "Proveedor", key: "proveedor" }].map(({ label, key }) => (
                <div key={key}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>{label}</label>
                  <input type="text" value={form[key as keyof FormData]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
                </div>
              ))}
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
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Deadline (texto)</label>
                  <input type="text" placeholder="Ej: Día 1-10" value={form.deadline_texto} onChange={(e) => setForm((f) => ({ ...f, deadline_texto: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Día límite (número)</label>
                  <input type="number" min="1" max="31" placeholder="Ej: 10" value={form.dia_limite} onChange={(e) => setForm((f) => ({ ...f, dia_limite: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Monto estimado (MXN)</label>
                <input type="number" min="0" step="0.01" value={form.monto_estimado} onChange={(e) => setForm((f) => ({ ...f, monto_estimado: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Notas</label>
                <textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={2}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" as const, resize: "vertical" as const }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 18px", border: "1px solid #E5E7EB", borderRadius: "8px", background: "#FFF", fontSize: "13px", cursor: "pointer", color: "#374151" }}>Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.concepto || !form.proveedor || !form.deadline_texto}
                style={{ padding: "9px 18px", border: "none", borderRadius: "8px", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Guardando..." : editId ? "Guardar cambios" : "Crear pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
