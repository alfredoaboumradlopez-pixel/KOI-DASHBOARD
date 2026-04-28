/**
 * DashboardGastos
 * ═══════════════
 * Módulo analítico de gastos por período: tarjetas por categoría expandibles,
 * tendencia semanal, alertas de variación, resumen MP/NMP, proveedor top.
 *
 * Props:
 *   restauranteIdOverride  — ID del restaurante (requerido desde RestauranteDashboard)
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
  Users,
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

// ── Colores por tipo de cuenta ────────────────────────────────────────────────
const COLOR_MAP: Record<string, { border: string; badge: string; text: string }> = {
  costo:     { border: "#F97316", badge: "#FFF7ED", text: "#EA580C" },
  nomina:    { border: "#3B82F6", badge: "#EFF6FF", text: "#2563EB" },
  impuesto:  { border: "#EAB308", badge: "#FEFCE8", text: "#CA8A04" },
  operativo: { border: "#9CA3AF", badge: "#F9FAFB", text: "#6B7280" },
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

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  restauranteIdOverride?: number;
}

// ════════════════════════════════════════════════════════════════════════════════
export const DashboardGastos = ({ restauranteIdOverride }: Props) => {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [verTodosMap, setVerTodosMap] = useState<Record<string, boolean>>({});

  const restauranteId = restauranteIdOverride ?? 6;

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError("");
    setExpandidos(new Set());
    setVerTodosMap({});
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

  // ── Tendencia max para escala ─────────────────────────────────────────────
  const maxTendencia = useMemo(
    () =>
      data
        ? Math.max(...data.tendencia_semanal.map((s) => s.monto), 1)
        : 1,
    [data]
  );

  // ── Toggle expandir tarjeta ───────────────────────────────────────────────
  const toggleExpandido = (cat: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // ── Fecha legible "15 abr" ────────────────────────────────────────────────
  const fechaCorta = (f: string) => {
    if (!f) return "—";
    const [, m, d] = f.split("-");
    const mNom = ["","ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${parseInt(d)} ${mNom[parseInt(m)] ?? m}`;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes spin { 100% { transform:rotate(360deg); } }
        .dg-card { transition: box-shadow 0.18s; }
        .dg-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.09) !important; }
        .dg-cat-row:hover { background: #FAFAFA !important; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
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
          {/* ── Cards de resumen ──────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: "14px",
              marginBottom: "20px",
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
                  className="dg-card"
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

          {/* ── Alertas ──────────────────────────────────────────────────── */}
          {data.alertas_gastos.length > 0 && (
            <div
              style={{
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: "12px",
                padding: "14px 18px",
                marginBottom: "20px",
                animation: "fadeUp 0.3s ease 0.15s both",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <AlertTriangle style={{ width: "16px", height: "16px", color: "#D97706", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#92400E" }}>
                  Categorías con aumento &gt;15% vs mes anterior
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
                {data.alertas_gastos.map((a) => (
                  <div
                    key={a.categoria}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      fontSize: "12px", color: "#78350F",
                    }}
                  >
                    <TrendingUp style={{ width: "12px", height: "12px", color: "#D97706", flexShrink: 0 }} />
                    <span style={{ fontWeight: "700" }}>{a.categoria}</span>
                    <span>subió {a.variacion_pct.toFixed(1)}% vs mes anterior</span>
                    <span style={{ color: "#A16207" }}>
                      ({$(a.mes_actual)} vs {$(a.mes_anterior)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tendencia semanal ─────────────────────────────────────────── */}
          <div
            style={{
              background: "#FFF",
              borderRadius: "14px",
              padding: "20px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              marginBottom: "20px",
              animation: "fadeUp 0.3s ease 0.2s both",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <BarChart2 style={{ width: "14px", height: "14px", color: "#9CA3AF" }} />
              Tendencia semanal — {MESES[mes]} {anio}
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px" }}>
              {data.tendencia_semanal.map((s, i) => {
                const pct = maxTendencia > 0 ? (s.monto / maxTendencia) * 100 : 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#9CA3AF", width: "130px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {s.semana}
                    </span>
                    <div style={{ flex: 1, height: "22px", background: "#F3F4F6", borderRadius: "6px", overflow: "hidden", position: "relative" as const }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: "linear-gradient(90deg,#3D1C1E,#7C3D40)",
                          borderRadius: "6px",
                          transition: "width 0.6s ease",
                          minWidth: pct > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#374151", width: "80px", textAlign: "right" as const, flexShrink: 0 }}>
                      {$(s.monto)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Tarjetas por categoría ────────────────────────────────────── */}
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Users style={{ width: "14px", height: "14px", color: "#9CA3AF" }} />
            Desglose por categoría ({data.por_categoria.length})
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px", marginBottom: "24px" }}>
            {data.por_categoria.map((cat, i) => {
              const colors = COLOR_MAP[cat.tipo_cuenta] ?? COLOR_MAP.operativo;
              const expanded = expandidos.has(cat.categoria);
              const verTodos = verTodosMap[cat.categoria] ?? false;
              const itemsVisible = verTodos ? cat.gastos : cat.gastos.slice(0, 10);

              const VsTrend =
                cat.vs_mes_anterior > 5
                  ? TrendingUp
                  : cat.vs_mes_anterior < -5
                  ? TrendingDown
                  : Minus;
              const vsColor =
                cat.vs_mes_anterior > 5
                  ? "#DC2626"
                  : cat.vs_mes_anterior < -5
                  ? "#059669"
                  : "#9CA3AF";

              return (
                <div
                  key={cat.categoria}
                  className="dg-card"
                  style={{
                    background: "#FFF",
                    borderRadius: "14px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    borderLeft: `4px solid ${colors.border}`,
                    overflow: "hidden",
                    animation: `fadeUp 0.25s ease ${i * 0.03}s both`,
                  }}
                >
                  {/* Cabecera de la tarjeta (siempre visible) */}
                  <button
                    onClick={() => toggleExpandido(cat.categoria)}
                    style={{
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto auto",
                      gap: "12px",
                      alignItems: "center",
                      padding: "16px 20px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left" as const,
                    }}
                  >
                    {/* Nombre */}
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "800", color: "#111827" }}>
                        {cat.categoria}
                      </div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>
                        {cat.cuenta_contable}
                      </div>
                    </div>

                    {/* Monto */}
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontSize: "16px", fontWeight: "800", color: "#111827" }}>
                        {$(cat.monto_total)}
                      </div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>
                        {cat.porcentaje.toFixed(1)}% del total
                      </div>
                    </div>

                    {/* vs mes anterior */}
                    <div
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "3px",
                        padding: "3px 8px", borderRadius: "20px",
                        background: cat.vs_mes_anterior > 5 ? "#FEF2F2" : cat.vs_mes_anterior < -5 ? "#ECFDF5" : "#F9FAFB",
                        fontSize: "11px", fontWeight: "700", color: vsColor,
                        flexShrink: 0,
                      }}
                    >
                      <VsTrend style={{ width: "11px", height: "11px" }} />
                      {cat.vs_mes_anterior > 0 ? "+" : ""}{cat.vs_mes_anterior.toFixed(1)}%
                    </div>

                    {/* Num transacciones */}
                    <div
                      style={{
                        fontSize: "11px", color: "#9CA3AF",
                        whiteSpace: "nowrap" as const,
                        flexShrink: 0,
                      }}
                    >
                      {cat.num_transacciones} transacc.
                    </div>

                    {/* Chevron */}
                    <div style={{ color: "#9CA3AF", flexShrink: 0 }}>
                      {expanded
                        ? <ChevronUp style={{ width: "16px", height: "16px" }} />
                        : <ChevronDown style={{ width: "16px", height: "16px" }} />
                      }
                    </div>
                  </button>

                  {/* Detalle expandido */}
                  {expanded && (
                    <div style={{ borderTop: "1px solid #F3F4F6" }}>
                      {/* Métricas secundarias */}
                      <div
                        style={{
                          display: "flex", gap: "24px", padding: "12px 20px",
                          background: "#FAFAFA", flexWrap: "wrap" as const,
                        }}
                      >
                        <div>
                          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>vs mes anterior </span>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: vsColor }}>
                            {cat.vs_mes_anterior > 0 ? "+" : ""}{cat.vs_mes_anterior.toFixed(1)}%
                          </span>
                          {cat.mes_anterior_monto > 0 && (
                            <span style={{ fontSize: "11px", color: "#9CA3AF" }}>
                              {" "}({$(cat.mes_anterior_monto)} mes ant.)
                            </span>
                          )}
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>Promedio/transacción </span>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: "#374151" }}>
                            {$(cat.promedio_transaccion)}
                          </span>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: "10px", fontWeight: "700",
                              padding: "2px 8px", borderRadius: "6px",
                              background: colors.badge, color: colors.text,
                            }}
                          >
                            {cat.cuenta_contable}
                          </span>
                        </div>
                      </div>

                      {/* Tabla de transacciones */}
                      <div>
                        {/* Header tabla */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "90px 160px 1fr 90px",
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

                        {/* Filas */}
                        {itemsVisible.map((item, j) => (
                          <div
                            key={`${item.tabla}-${item.id}`}
                            className="dg-cat-row"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "90px 160px 1fr 90px",
                              padding: "10px 20px",
                              borderBottom: j < itemsVisible.length - 1 ? "1px solid #F9FAFB" : "none",
                              alignItems: "start",
                              background: "#FFF",
                            }}
                          >
                            <span style={{ fontSize: "12px", color: "#6B7280", paddingTop: "1px" }}>
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

                        {/* Ver todos */}
                        {cat.gastos.length > 10 && (
                          <div style={{ padding: "10px 20px", borderTop: "1px solid #F3F4F6", textAlign: "center" as const }}>
                            <button
                              onClick={() =>
                                setVerTodosMap((prev) => ({
                                  ...prev,
                                  [cat.categoria]: !verTodos,
                                }))
                              }
                              style={{
                                border: "none",
                                background: "transparent",
                                fontSize: "12px",
                                fontWeight: "700",
                                color: "#3D1C1E",
                                cursor: "pointer",
                                textDecoration: "underline",
                              }}
                            >
                              {verTodos
                                ? "Ver menos"
                                : `Ver todos (${cat.gastos.length})`}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <div
            style={{
              background: "#3D1C1E",
              borderRadius: "14px",
              padding: "20px 28px",
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: "20px",
              animation: "fadeUp 0.3s ease 0.25s both",
            }}
          >
            {[
              {
                label: "Día más costoso",
                value: data.resumen.dia_mas_caro.fecha
                  ? `${fechaCorta(data.resumen.dia_mas_caro.fecha)} — ${$(data.resumen.dia_mas_caro.monto)}`
                  : "—",
              },
              {
                label: "Proveedor top",
                value: data.resumen.proveedor_top.nombre
                  ? `${data.resumen.proveedor_top.nombre} · ${$(data.resumen.proveedor_top.monto)}`
                  : "—",
              },
              {
                label: "Promedio diario",
                value: $(data.resumen.promedio_diario),
              },
            ].map((f, i) => (
              <div key={i}>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "6px" }}>
                  {f.label}
                </div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#FFF" }}>
                  {f.value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
