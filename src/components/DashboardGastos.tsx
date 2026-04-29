/**
 * DashboardGastos — Rediseño completo
 * ════════════════════════════════════
 * Layout (de arriba a abajo):
 *   1. Header + selector período
 *   2. 4 cards resumen
 *   3. Alertas colapsables (si hay)
 *   4. Tendencia semanal (barras verticales)
 *   5. Grid 3×N de tarjetas por categoría
 *   6. Panel de desglose (si hay categoría activa)
 *   7. Footer 3 chips
 */
import { useState, useEffect, useMemo } from "react";
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  CalendarDays,
  ShoppingBag,
  Receipt,
  FileX,
} from "lucide-react";
import { api } from "../services/api";

// ── Formato moneda ────────────────────────────────────────────────────────────
const $ = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const $dec = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

// ── Colores borde izquierdo por tipo de cuenta ────────────────────────────────
const BORDER_COLOR: Record<string, string> = {
  costo:     "#E8593C",
  nomina:    "#378ADD",
  impuesto:  "#639922",
  operativo: "#888780",
};

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ── Interfaces ────────────────────────────────────────────────────────────────
interface GastoItem {
  id: number;
  tabla: string;
  fecha: string;
  proveedor: string;
  descripcion: string;
  monto: number;
  comprobante: string;
}

interface CategoriaData {
  categoria: string;
  cuenta_contable: string;
  tipo_cuenta: string;
  monto_total: number;
  porcentaje: number;
  num_transacciones: number;
  promedio_transaccion: number;
  vs_mes_anterior: number;
  mes_anterior_monto: number;
  gastos: GastoItem[];
}

interface DashData {
  periodo: { mes: number; anio: number; nombre_mes: string };
  resumen: {
    total_gastos: number;
    total_mp: number;
    total_nmp: number;
    total_efectivo: number;
    total_transferencia: number;
    num_transacciones: number;
    promedio_diario: number;
    dia_mas_caro: { fecha: string | null; monto: number };
    proveedor_top: { nombre: string | null; monto: number };
  };
  por_categoria: CategoriaData[];
  tendencia_semanal: { semana: string; monto: number }[];
  alertas_gastos: { categoria: string; variacion_pct: number; mes_actual: number; mes_anterior: number }[];
}

interface Props {
  restauranteIdOverride?: number;
}

// ── Helper: fecha corta "15 abr" ──────────────────────────────────────────────
function fechaCorta(f: string) {
  if (!f) return "—";
  const [, m, d] = f.split("-");
  const mNom = ["","ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} ${mNom[parseInt(m)] ?? m}`;
}

// ── Helper: color y icono de variación ───────────────────────────────────────
function vsInfo(cat: CategoriaData) {
  if (cat.mes_anterior_monto === 0) {
    return { color: "#9CA3AF", bg: "#F9FAFB", Icon: Minus };
  }
  if (cat.vs_mes_anterior > 5) {
    return { color: "#DC2626", bg: "#FEF2F2", Icon: TrendingUp };
  }
  if (cat.vs_mes_anterior < -5) {
    return { color: "#059669", bg: "#ECFDF5", Icon: TrendingDown };
  }
  return { color: "#9CA3AF", bg: "#F9FAFB", Icon: Minus };
}

// ════════════════════════════════════════════════════════════════════════════════
export const DashboardGastos = ({ restauranteIdOverride }: Props) => {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alertasAbiertas, setAlertasAbiertas] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const restauranteId = restauranteIdOverride ?? 6;

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError("");
    setCategoriaActiva(null);
    setAlertasAbiertas(false);
    api
      .get(`/api/gastos/dashboard/${restauranteId}?mes=${mes}&anio=${anio}`)
      .then((d: any) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar los datos del dashboard de gastos.");
        setLoading(false);
      });
  }, [mes, anio, restauranteId]);

  // ── Escala para barras verticales de tendencia ────────────────────────────
  const maxTendencia = useMemo(
    () => (data ? Math.max(...data.tendencia_semanal.map((s) => s.monto), 1) : 1),
    [data]
  );

  // ── Toggle categoría activa ───────────────────────────────────────────────
  const toggleCategoria = (cat: string) => {
    setCategoriaActiva((prev) => {
      const opening = prev !== cat;
      if (opening) {
        setTimeout(() => {
          const panel = document.getElementById("desglose-panel");
          if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
      return prev === cat ? null : cat;
    });
  };

  // ── Datos del panel de desglose ───────────────────────────────────────────
  const catActiva = data?.por_categoria.find((c) => c.categoria === categoriaActiva) ?? null;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes panelSlide {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes spin { 100% { transform:rotate(360deg); } }
        .dg-card-cat { transition: box-shadow 0.18s, outline 0.15s; cursor: pointer; }
        .dg-card-cat:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.09) !important; }
        .dg-row:hover { background: #FAFAFA !important; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "28px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px", height: "42px", borderRadius: "12px",
              background: "linear-gradient(135deg,#3D1C1E,#5C2D30)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <BarChart2 style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#111827", margin: 0 }}>
              Dashboard Gastos
            </h1>
            <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>
              {data?.periodo.nombre_mes ?? `${MESES[mes]} ${anio}`} · Análisis por categoría
            </p>
          </div>
        </div>

        {/* Selector mes / año */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            style={{
              padding: "6px 10px", borderRadius: "8px",
              border: "1px solid #E5E7EB", fontSize: "12px",
              fontWeight: "700", background: "#FFF", cursor: "pointer",
              color: "#374151",
            }}
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div
            style={{
              display: "flex", gap: "2px", background: "#FFF",
              borderRadius: "10px", padding: "3px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
              <button
                key={m}
                onClick={() => setMes(m)}
                style={{
                  padding: "5px 9px", borderRadius: "7px",
                  border: "none",
                  background: mes === m ? "#3D1C1E" : "transparent",
                  color: mes === m ? "#C8FF00" : "#9CA3AF",
                  fontSize: "11px", fontWeight: "700", cursor: "pointer",
                }}
              >
                {MESES[m].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "220px", gap: "10px", color: "#9CA3AF", fontSize: "13px" }}>
          <RefreshCw style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} />
          Cargando datos…
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!loading && error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "12px", padding: "20px", color: "#DC2626", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {/* ── Sin datos ────────────────────────────────────────────────────── */}
      {!loading && !error && data && data.resumen.num_transacciones === 0 && (
        <div
          style={{
            textAlign: "center" as const, padding: "60px 20px",
            background: "#FFF", borderRadius: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <FileX style={{ width: "40px", height: "40px", color: "#D1D5DB", margin: "0 auto 12px" }} />
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#374151", marginBottom: "6px" }}>
            Sin gastos registrados
          </div>
          <div style={{ fontSize: "13px", color: "#9CA3AF" }}>
            No hay gastos en {MESES[mes]} {anio} para este restaurante.
          </div>
        </div>
      )}

      {!loading && !error && data && data.resumen.num_transacciones > 0 && (
        <>
          {/* ── 1. Cards de resumen ───────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: "14px",
              marginBottom: "24px",
            }}
          >
            {[
              {
                label: "Total Gastos",
                value: $(data.resumen.total_gastos),
                sub: `${data.resumen.num_transacciones} transacciones`,
                icon: ShoppingBag,
                color: "#3D1C1E",
                bg: "#F9FAFB",
              },
              {
                label: "Con Comprobante",
                value: $(data.resumen.total_mp),
                sub: `${data.resumen.total_gastos > 0 ? ((data.resumen.total_mp / data.resumen.total_gastos) * 100).toFixed(1) : 0}% del total`,
                icon: Receipt,
                color: "#059669",
                bg: "#ECFDF5",
              },
              {
                label: "Sin Comprobante",
                value: $(data.resumen.total_nmp),
                sub: `${data.resumen.total_gastos > 0 ? ((data.resumen.total_nmp / data.resumen.total_gastos) * 100).toFixed(1) : 0}% del total`,
                icon: FileX,
                color: "#DC2626",
                bg: "#FEF2F2",
              },
              {
                label: "Promedio Diario",
                value: $(data.resumen.promedio_diario),
                sub: `Efectivo ${$(data.resumen.total_efectivo)} · Transf. ${$(data.resumen.total_transferencia)}`,
                icon: CalendarDays,
                color: "#7C3AED",
                bg: "#F5F3FF",
              },
            ].map((card, i) => {
              const Ic = card.icon;
              return (
                <div
                  key={i}
                  style={{
                    background: "#FFF",
                    borderRadius: "14px",
                    padding: "18px 20px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",
                    animation: `fadeUp 0.3s ease ${i * 0.05}s both`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
                      {card.label}
                    </span>
                    <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: card.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Ic style={{ width: "14px", height: "14px", color: card.color }} />
                    </div>
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: "10px 0 4px" }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {card.sub}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── 2. Alertas colapsables ────────────────────────────────────── */}
          {data.alertas_gastos.length > 0 && (
            <div style={{ marginBottom: "24px", animation: "fadeUp 0.3s ease 0.15s both" }}>
              <button
                onClick={() => setAlertasAbiertas((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "11px 16px",
                  borderRadius: alertasAbiertas ? "12px 12px 0 0" : "12px",
                  border: "1px solid #FDE68A",
                  background: "#FFFBEB",
                  cursor: "pointer",
                  textAlign: "left" as const,
                }}
              >
                <AlertTriangle style={{ width: "15px", height: "15px", color: "#D97706", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: "13px", fontWeight: "700", color: "#92400E" }}>
                  ⚠️ {data.alertas_gastos.length} {data.alertas_gastos.length === 1 ? "categoría con variación" : "categorías con variación"} significativa vs mes anterior
                </span>
                {alertasAbiertas
                  ? <ChevronUp style={{ width: "15px", height: "15px", color: "#D97706", flexShrink: 0 }} />
                  : <ChevronDown style={{ width: "15px", height: "15px", color: "#D97706", flexShrink: 0 }} />
                }
              </button>
              {alertasAbiertas && (
                <div
                  style={{
                    background: "#FFFBEB",
                    border: "1px solid #FDE68A",
                    borderTop: "none",
                    borderRadius: "0 0 12px 12px",
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: "8px",
                  }}
                >
                  {data.alertas_gastos.map((a) => (
                    <div
                      key={a.categoria}
                      style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#78350F" }}
                    >
                      <TrendingUp style={{ width: "12px", height: "12px", color: "#D97706", flexShrink: 0 }} />
                      <span style={{ fontWeight: "700" }}>{a.categoria}</span>
                      <span>subió {a.variacion_pct.toFixed(1)}% vs mes anterior</span>
                      <span style={{ color: "#A16207" }}>({$(a.mes_actual)} vs {$(a.mes_anterior)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 3. Tendencia semanal (barras verticales) ──────────────────── */}
          {data.tendencia_semanal.length > 0 && (
            <div
              style={{
                background: "#FFF",
                borderRadius: "14px",
                padding: "20px 24px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                marginBottom: "24px",
                animation: "fadeUp 0.3s ease 0.2s both",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
                <BarChart2 style={{ width: "14px", height: "14px", color: "#9CA3AF" }} />
                Tendencia semanal — {MESES[mes]} {anio}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "16px",
                  height: "120px",
                }}
              >
                {data.tendencia_semanal.map((s, i) => {
                  const pct = maxTendencia > 0 ? (s.monto / maxTendencia) * 100 : 0;
                  const barH = Math.max(pct * 1.0, pct > 0 ? 4 : 0);
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column" as const,
                        alignItems: "center",
                        gap: "6px",
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span style={{ fontSize: "10px", fontWeight: "700", color: "#374151", whiteSpace: "nowrap" as const }}>
                        {$(s.monto)}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          height: `${barH}%`,
                          minHeight: pct > 0 ? "4px" : "0",
                          background: "linear-gradient(180deg,#3D1C1E,#7C3D40)",
                          borderRadius: "5px 5px 0 0",
                          transition: "height 0.6s ease",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "9px",
                          color: "#9CA3AF",
                          textAlign: "center" as const,
                          lineHeight: "1.3",
                          whiteSpace: "nowrap" as const,
                          overflow: "hidden",
                          maxWidth: "100%",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {s.semana.replace("Sem ", "S")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 4. Grid de tarjetas por categoría ────────────────────────── */}
          <div
            style={{
              fontSize: "12px", fontWeight: "600", color: "#9CA3AF",
              textTransform: "uppercase" as const, letterSpacing: "0.5px",
              marginBottom: "14px",
            }}
          >
            Desglose por categoría · {data.por_categoria.length} categorías
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "14px",
              marginBottom: "24px",
            }}
          >
            {data.por_categoria.map((cat, i) => {
              const borderColor = BORDER_COLOR[cat.tipo_cuenta] ?? "#888780";
              const activa = categoriaActiva === cat.categoria;
              const { color: vsColor, bg: vsBg, Icon: VsIcon } = vsInfo(cat);
              const esPrimera = cat.mes_anterior_monto === 0;

              return (
                <div
                  key={cat.categoria}
                  className="dg-card-cat"
                  onClick={() => toggleCategoria(cat.categoria)}
                  style={{
                    background: "#FFF",
                    borderRadius: "14px",
                    borderLeft: `${activa ? "5px" : "4px"} solid ${borderColor}`,
                    boxShadow: activa
                      ? `0 0 0 2px ${borderColor}33, 0 4px 16px rgba(0,0,0,0.08)`
                      : "0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)",
                    padding: "18px 18px 16px",
                    animation: `fadeUp 0.25s ease ${i * 0.03}s both`,
                    userSelect: "none" as const,
                  }}
                >
                  {/* Nombre + cuenta */}
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "13px", fontWeight: "800", color: "#111827", letterSpacing: "0.2px" }}>
                      {cat.categoria.toUpperCase()}
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                      {cat.cuenta_contable}
                    </div>
                  </div>

                  {/* Monto */}
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", lineHeight: "1" }}>
                      {$(cat.monto_total)}
                    </div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>
                      {cat.porcentaje.toFixed(1)}% del total
                    </div>
                  </div>

                  {/* Transacciones + variación */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#9CA3AF" }}>
                      {cat.num_transacciones} transacciones
                    </span>
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "3px",
                        padding: "3px 8px", borderRadius: "20px",
                        background: esPrimera ? "#F9FAFB" : vsBg,
                        fontSize: "11px", fontWeight: "700",
                        color: esPrimera ? "#9CA3AF" : vsColor,
                        flexShrink: 0,
                      }}
                    >
                      <VsIcon style={{ width: "10px", height: "10px" }} />
                      {esPrimera
                        ? "Nuevo"
                        : `${cat.vs_mes_anterior > 0 ? "+" : ""}${cat.vs_mes_anterior.toFixed(1)}%`
                      }
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── 5. Panel de desglose ─────────────────────────────────────── */}
          {catActiva && (
            <div
              id="desglose-panel"
              style={{
                background: "#FFF",
                borderRadius: "14px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                marginBottom: "24px",
                overflow: "hidden",
                animation: "panelSlide 0.3s ease both",
                borderLeft: `5px solid ${BORDER_COLOR[catActiva.tipo_cuenta] ?? "#888780"}`,
              }}
            >
              {/* Panel header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  borderBottom: "1px solid #F3F4F6",
                  background: "#FAFAFA",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: "#111827" }}>
                    {catActiva.categoria}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                    {catActiva.cuenta_contable} · {catActiva.num_transacciones} transacciones
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  {/* Métricas rápidas */}
                  <div style={{ textAlign: "right" as const }}>
                    <div style={{ fontSize: "10px", color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>Total</div>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#111827" }}>{$(catActiva.monto_total)}</div>
                  </div>
                  <div style={{ textAlign: "right" as const }}>
                    <div style={{ fontSize: "10px", color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>Prom./transacc.</div>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#111827" }}>{$(catActiva.promedio_transaccion)}</div>
                  </div>
                  {catActiva.mes_anterior_monto > 0 && (
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontSize: "10px", color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>Mes anterior</div>
                      <div style={{ fontSize: "16px", fontWeight: "800", color: "#111827" }}>{$(catActiva.mes_anterior_monto)}</div>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setCategoriaActiva(null); }}
                    style={{
                      border: "none", background: "#F3F4F6", cursor: "pointer",
                      borderRadius: "8px", padding: "6px", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      color: "#6B7280",
                    }}
                  >
                    <ChevronUp style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
              </div>

              {/* Tabla de transacciones */}
              <div>
                {/* Header tabla */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 160px 1fr 100px",
                    padding: "8px 20px",
                    background: "#F9FAFB",
                    borderBottom: "1px solid #F3F4F6",
                  }}
                >
                  {["Fecha", "Proveedor", "Descripción", "Monto"].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: "10px", fontWeight: "700",
                        color: "#9CA3AF", textTransform: "uppercase" as const,
                        letterSpacing: "0.4px",
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Filas con scroll */}
                <div style={{ maxHeight: "360px", overflowY: "auto" as const }}>
                  {catActiva.gastos.slice(0, 15).map((item, j) => (
                    <div
                      key={`${item.tabla}-${item.id}`}
                      className="dg-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 160px 1fr 100px",
                        padding: "10px 20px",
                        borderBottom: j < Math.min(catActiva.gastos.length, 15) - 1 ? "1px solid #F9FAFB" : "none",
                        alignItems: "start",
                        background: "#FFF",
                      }}
                    >
                      <span style={{ fontSize: "12px", color: "#6B7280" }}>
                        {fechaCorta(item.fecha)}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>
                        {item.proveedor || "—"}
                      </span>
                      <span style={{ fontSize: "12px", color: "#6B7280", paddingRight: "8px" }}>
                        {item.descripcion || "—"}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", textAlign: "right" as const }}>
                        {$dec(item.monto)}
                      </span>
                    </div>
                  ))}
                  {catActiva.gastos.length > 15 && (
                    <div style={{ padding: "10px 20px", background: "#F9FAFB", fontSize: "11px", color: "#9CA3AF", textAlign: "center" as const }}>
                      Mostrando 15 de {catActiva.gastos.length} transacciones
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── 6. Footer chips ───────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap" as const,
              animation: "fadeUp 0.3s ease 0.25s both",
              marginBottom: "8px",
            }}
          >
            {[
              {
                emoji: "📅",
                label: "Día más caro",
                value: data.resumen.dia_mas_caro.fecha
                  ? `${fechaCorta(data.resumen.dia_mas_caro.fecha)} · ${$(data.resumen.dia_mas_caro.monto)}`
                  : "—",
              },
              {
                emoji: "🏪",
                label: "Proveedor top",
                value: data.resumen.proveedor_top.nombre
                  ? `${data.resumen.proveedor_top.nombre} · ${$(data.resumen.proveedor_top.monto)}`
                  : "—",
              },
              {
                emoji: "📊",
                label: "Promedio diario",
                value: $(data.resumen.promedio_diario),
              },
            ].map((chip, i) => (
              <div
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 14px",
                  background: "#FFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: "100px",
                  fontSize: "12px",
                  color: "#374151",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <span>{chip.emoji}</span>
                <span style={{ color: "#9CA3AF", fontWeight: "600" }}>{chip.label}:</span>
                <span style={{ fontWeight: "700" }}>{chip.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
