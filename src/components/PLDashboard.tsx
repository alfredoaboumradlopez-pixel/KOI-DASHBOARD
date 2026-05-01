import React, { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw, AlertCircle, ChevronRight, ChevronDown } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// Suppress unused import warnings
void TrendingUp;
void TrendingDown;

function pctColor(
  pct: number,
  thresholds: { green: number; yellow: number; higher_is_worse?: boolean }
) {
  if (thresholds.higher_is_worse) {
    if (pct <= thresholds.green) return "#059669";
    if (pct <= thresholds.yellow) return "#D97706";
    return "#DC2626";
  }
  if (pct >= thresholds.green) return "#059669";
  if (pct >= thresholds.yellow) return "#D97706";
  return "#DC2626";
}

function Badge({
  pct,
  thresholds,
}: {
  pct: number;
  thresholds: { green: number; yellow: number; higher_is_worse?: boolean };
}) {
  const color = pctColor(pct, thresholds);
  const bg =
    color === "#059669" ? "#ECFDF5" : color === "#D97706" ? "#FFFBEB" : "#FEF2F2";
  const border =
    color === "#059669" ? "#A7F3D0" : color === "#D97706" ? "#FDE68A" : "#FECACA";
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: "700",
        color,
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      {fmtPct(pct)}
    </span>
  );
}

function Skeleton() {
  return (
    <div
      style={{
        height: "20px",
        borderRadius: "6px",
        background:
          "linear-gradient(90deg,#F3F4F6 25%,#E5E7EB 50%,#F3F4F6 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  );
}

interface PLResult {
  ventas_netas: number;
  ventas_efectivo: number;
  ventas_parrot: number;
  ventas_terminales: number;
  ventas_uber: number;
  ventas_rappi: number;
  costo_alimentos: number;
  costo_bebidas: number;
  total_costo_ventas: number;
  utilidad_bruta: number;
  margen_bruto_pct: number;
  gastos_nomina: number;
  gastos_renta: number;
  gastos_servicios: number;
  gastos_mantenimiento: number;
  gastos_limpieza: number;
  gastos_marketing: number;
  gastos_admin: number;
  gastos_otros: number;
  total_gastos_operativos: number;
  ebitda: number;
  margen_ebitda_pct: number;
  impuestos_estimados: number;
  utilidad_neta: number;
  margen_neto_pct: number;
  food_cost_pct: number;
  nomina_pct: number;
  dias_con_datos: number;
  gastos_sin_categorizar: number;
  advertencias: string[];
  gastos_por_categoria?: Array<{
    categoria: string;
    categoria_pl: string;
    monto: number;
    pct_ventas: number;
  }>;
}

// Props opcionales: si se pasa restauranteIdOverride, usa ese en vez del del JWT
// (para cuando SUPER_ADMIN entra a un restaurante específico desde /rbo)
interface PLDashboardProps {
  restauranteIdOverride?: number;
}

export const PLDashboard = ({ restauranteIdOverride }: PLDashboardProps = {}) => {
  const { authUser } = useStore();

  // Determinar restaurante_id correcto:
  // 1. Si viene override (App.tsx resolvió slug→id para SUPER_ADMIN) → usar ese
  // 2. Si el usuario tiene restaurante_id en el JWT → usar ese
  // 3. Fallback: 1
  const restauranteId: number =
    restauranteIdOverride ??
    (authUser?.restaurante_id != null ? authUser.restaurante_id : 1);

  const [mes, setMes] = useState(new Date().getMonth() + 1);
  void authUser; // usado arriba para restauranteId
  const [anio] = useState(new Date().getFullYear());
  const [pl, setPl] = useState<PLResult | null>(null);
  const [plV2, setPlV2] = useState<any>(null);
  const [margenMensual, setMargenMensual] = useState<any[]>([]);
  const [platillos, setPlatillos] = useState<any[]>([]);
  const [ventasDiarias, setVentasDiarias] = useState<any>(null);
  const [alertas, setAlertas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const MESES = [
    "",
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  const cargar = async (m: number) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch P&L del mes
      const plResp = await fetch(
        `${(window as any).__API_BASE__ || ""}/api/pl/${restauranteId}/mes/${anio}/${m}`,
        {
          headers: {
            "Content-Type": "application/json",
            ...(localStorage.getItem("rbo_token")
              ? { Authorization: `Bearer ${localStorage.getItem("rbo_token")}` }
              : {}),
          },
        }
      );

      if (!plResp.ok) {
        const errText = await plResp.text().catch(() => "Sin detalle");
        console.error(`[PLDashboard] Error ${plResp.status} en /api/pl/${restauranteId}/mes/${anio}/${m}:`, errText);
        setError({
          message: `Error ${plResp.status} al cargar P&L: ${errText.slice(0, 120)}`,
          status: plResp.status,
        });
        return;
      }

      const plJson = await plResp.json();
      const plData: PLResult = plJson?.data ?? plJson;

      setPl(plData);
      setAlertas(plData?.advertencias ?? []);

      const authHeader = {
        "Content-Type": "application/json",
        ...(localStorage.getItem("rbo_token")
          ? { Authorization: `Bearer ${localStorage.getItem("rbo_token")}` }
          : {}),
      };
      const base = (window as any).__API_BASE__ || "";

      // Fetch adicionales (no-críticos)
      await Promise.allSettled([
        // P&L v2
        fetch(`${base}/api/pl/${restauranteId}/v2/mes/${anio}/${m}`, { headers: authHeader })
          .then(r => r.ok ? r.json() : null)
          .then(d => d && setPlV2(d))
          .catch(() => {}),
        // Margen mensual (12 meses)
        fetch(`${base}/api/pl/${restauranteId}/margen-mensual`, { headers: authHeader })
          .then(r => r.ok ? r.json() : null)
          .then(d => d?.meses && setMargenMensual(d.meses))
          .catch(() => {}),
        // Top platillos del mes
        fetch(`${base}/api/pl/${restauranteId}/top-platillos?mes=${m}&anio=${anio}`, { headers: authHeader })
          .then(r => r.ok ? r.json() : null)
          .then(d => d?.platillos && setPlatillos(d.platillos))
          .catch(() => {}),
        // Ventas diarias resumen (sparkline)
        fetch(`${base}/api/pl/${restauranteId}/ventas-diarias-resumen`, { headers: authHeader })
          .then(r => r.ok ? r.json() : null)
          .then(d => d && setVentasDiarias(d))
          .catch(() => {}),
      ]);
    } catch (e: any) {
      console.error("[PLDashboard] fetch falló:", e);
      setError({ message: `Error de red: ${e?.message ?? "desconocido"}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar(mes);
  }, [mes, restauranteId]);

  void useMemo; // kept import for potential future use

  // Grupos v2 — todos abiertos por default
  const V2_GRUPOS = ["food_cost","beverage_cost","nomina","gastos_personal","operacion","servicios","comisiones","otros","impuestos"];
  const [v2Open, setV2Open] = useState<Record<string,boolean>>(Object.fromEntries(V2_GRUPOS.map(k => [k, true])));
  const toggleV2 = (k: string) => setV2Open(prev => ({ ...prev, [k]: !prev[k] }));

  // Prime Cost = (Nómina + Gastos Personal + Food Cost) / Ventas
  const primeCost = (() => {
    if (!plV2) return null;
    const nomina = plV2.gastos_operativos?.nomina_g?.subtotal || 0;
    const personal = plV2.gastos_operativos?.gastos_personal?.subtotal || 0;
    const foodCost = plV2.costo_ventas?.food_cost?.subtotal || 0;
    const total = nomina + personal + foodCost;
    const ventas = plV2.ventas || 0;
    return ventas > 0 ? { monto: total, pct: (total / ventas) * 100 } : null;
  })();

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      `}</style>

      {/* Banner de error — nunca pantalla en blanco */}
      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
          <AlertCircle
            style={{ width: "18px", height: "18px", color: "#DC2626", flexShrink: 0, marginTop: "1px" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#DC2626", marginBottom: "4px" }}>
              Error cargando P&L
            </div>
            <div style={{ fontSize: "12px", color: "#EF4444" }}>{error.message}</div>
            {error.status === 401 && (
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>
                Token expirado — recarga la página para volver a entrar.
              </div>
            )}
          </div>
          <button
            onClick={() => cargar(mes)}
            style={{
              border: "1px solid #FECACA",
              borderRadius: "6px",
              background: "#FFF",
              color: "#DC2626",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "12px",
              padding: "4px 10px",
              flexShrink: 0,
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Barra de advertencias del P&L */}
      {!error && alertas.length > 0 && (
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: "10px",
            padding: "12px 16px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <AlertTriangle
            style={{ width: "16px", height: "16px", color: "#D97706", flexShrink: 0 }}
          />
          <span style={{ fontSize: "13px", color: "#92400E", fontWeight: "600" }}>
            {alertas.length} aviso{alertas.length > 1 ? "s" : ""}:{" "}
            {alertas.join(" · ")}
          </span>
        </div>
      )}

      {/* Selector de mes */}
      <div
        style={{
          background: "#FFF",
          borderRadius: "12px",
          padding: "12px 16px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap" as const,
        }}
      >
        <span
          style={{
            fontSize: "12px",
            color: "#9CA3AF",
            fontWeight: "600",
            marginRight: "4px",
          }}
        >
          {anio}
        </span>
        {MESES.slice(1).map((m, i) => (
          <button
            key={i + 1}
            onClick={() => setMes(i + 1)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: mes === i + 1 ? "700" : "400",
              background: mes === i + 1 ? "#3D1C1E" : "transparent",
              color: mes === i + 1 ? "#C8FF00" : "#6B7280",
              transition: "all 0.15s",
            }}
          >
            {m}
          </button>
        ))}
        {loading && (
          <RefreshCw
            style={{
              width: "14px",
              height: "14px",
              color: "#9CA3AF",
              marginLeft: "auto",
              animation: "spin 1s linear infinite",
            }}
          />
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            color: "#D1D5DB",
          }}
        >
          ID {restauranteId}
        </span>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: "14px",
          marginBottom: "20px",
        }}
      >
        {/* Card 1 — Ventas Netas */}
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>Ventas Netas</div>
          {loading ? <Skeleton /> : error ? <div style={{ fontSize: "13px", color: "#D1D5DB" }}>—</div> : <>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginBottom: "4px" }}>{pl ? fmt(pl.ventas_netas) : "—"}</div>
            <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{pl ? `${pl.dias_con_datos} días con datos` : ""}</div>
          </>}
        </div>

        {/* Card 2 — Margen Neto */}
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>Margen Neto</div>
          {loading ? <Skeleton /> : error ? <div style={{ fontSize: "13px", color: "#D1D5DB" }}>—</div> : <>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginBottom: "4px" }}>{pl ? fmtPct(pl.margen_neto_pct) : "—"}</div>
            {pl && <div style={{ marginBottom: "2px" }}><Badge pct={pl.margen_neto_pct} thresholds={{ green: 20, yellow: 10 }} /></div>}
            <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{pl ? fmt(pl.utilidad_neta) : ""}</div>
          </>}
        </div>

        {/* Card 3 — Prime Cost */}
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>Prime Cost</div>
          {loading ? <Skeleton /> : error ? <div style={{ fontSize: "13px", color: "#D1D5DB" }}>—</div> : <>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginBottom: "4px" }}>
              {primeCost ? fmtPct(primeCost.pct) : "—"}
            </div>
            {primeCost && (() => {
              const pc = primeCost.pct;
              const color = pc < 60 ? "#059669" : pc < 65 ? "#D97706" : "#DC2626";
              const bg = pc < 60 ? "#ECFDF5" : pc < 65 ? "#FFFBEB" : "#FEF2F2";
              const border = pc < 60 ? "#A7F3D0" : pc < 65 ? "#FDE68A" : "#FECACA";
              const label = pc < 60 ? "Óptimo" : pc < 65 ? "Atención" : "Crítico";
              return <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", color, background: bg, border: `1px solid ${border}`, display: "inline-block", marginBottom: "4px" }}>{label}</span>;
            })()}
            <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
              {primeCost ? `Nómina + Personal + Food Cost = ${fmt(primeCost.monto)}` : "Calculando…"}
            </div>
          </>}
        </div>

        {/* Card 4 — Venta Promedio Diaria + sparkline */}
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>Venta Diaria Prom.</div>
          {loading ? <Skeleton /> : error ? <div style={{ fontSize: "13px", color: "#D1D5DB" }}>—</div> : <>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginBottom: "2px" }}>
              {ventasDiarias ? fmt(ventasDiarias.promedio_mes) : "—"}
            </div>
            {ventasDiarias?.variacion_pct != null && (() => {
              const v = ventasDiarias.variacion_pct;
              const color = v >= 0 ? "#059669" : "#DC2626";
              return <div style={{ fontSize: "11px", color, fontWeight: "600", marginBottom: "6px" }}>{v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1)}% vs semana pasada</div>;
            })()}
            {/* Mini sparkline SVG */}
            {ventasDiarias?.ultimos_7_dias?.length > 0 && (() => {
              const dias = ventasDiarias.ultimos_7_dias as { ventas: number; dia: string; sobre_promedio: boolean }[];
              const maxV = Math.max(...dias.map(d => d.ventas), 1);
              const W = 120, H = 32;
              const pts = dias.map((d, i) => `${(i / (dias.length - 1)) * W},${H - (d.ventas / maxV) * H}`).join(" ");
              return (
                <svg width={W} height={H} style={{ display: "block" }}>
                  <polyline points={pts} fill="none" stroke="#3D1C1E" strokeWidth="2" strokeLinejoin="round" />
                  {dias.map((d, i) => (
                    <circle key={i} cx={(i / (dias.length - 1)) * W} cy={H - (d.ventas / maxV) * H}
                      r="3" fill={d.sobre_promedio ? "#C8FF00" : "#9CA3AF"} />
                  ))}
                </svg>
              );
            })()}
          </>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Margen neto — últimos 12 meses */}
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827", marginBottom: "4px" }}>
            Margen neto — últimos 12 meses
          </div>
          <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "16px" }}>
            {margenMensual.length > 0
              ? `${margenMensual[0]?.short_label} ${margenMensual[0]?.anio} → ${margenMensual[margenMensual.length - 1]?.short_label} ${margenMensual[margenMensual.length - 1]?.anio}`
              : "Cargando…"}
          </div>
          {loading ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", height: "120px" }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: "60px", borderRadius: "4px 4px 0 0", background: "#F3F4F6" }} />
              ))}
            </div>
          ) : margenMensual.length === 0 ? (
            <div style={{ textAlign: "center" as const, color: "#9CA3AF", fontSize: "13px", padding: "32px 0" }}>
              Sin datos mensuales
            </div>
          ) : (() => {
            // Separate positive from negative; scale max absolute value
            const maxAbs = Math.max(...margenMensual.map(m => Math.abs(m.margen_pct)), 1);
            const BAR_H = 110;
            const isCurrent = (m: any) => m.mes === mes && m.anio === anio;
            return (
              <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: `${BAR_H + 28}px` }}>
                {margenMensual.map((m, i) => {
                  const pct = m.margen_pct ?? 0;
                  const color = pct >= 15 ? "#059669" : pct >= 5 ? "#F59E0B" : "#DC2626";
                  const barH = Math.max((Math.abs(pct) / maxAbs) * BAR_H, 4);
                  const active = isCurrent(m);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: "3px" }}>
                      <span style={{ fontSize: "8px", color, fontWeight: "700", opacity: active ? 1 : 0.7 }}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                      <div
                        title={`${m.label}\nVentas: ${fmt(m.ventas)}\nMargen: ${pct.toFixed(1)}%\nUtilidad: ${fmt(m.utilidad)}`}
                        style={{
                          width: "100%",
                          height: `${barH}px`,
                          background: active ? "#3D1C1E" : color,
                          borderRadius: "3px 3px 0 0",
                          opacity: m.dias_con_datos === 0 ? 0.25 : active ? 1 : 0.75,
                          transition: "height 0.3s ease",
                          outline: active ? "2px solid #C8FF00" : "none",
                          outlineOffset: "1px",
                        }}
                      />
                      <span style={{ fontSize: "8px", color: active ? "#111827" : "#9CA3AF", fontWeight: active ? "700" : "400" }}>{m.short_label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {/* Leyenda */}
          <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" as const }}>
            {[["#059669","≥15% Óptimo"],["#F59E0B","5–15% Aceptable"],["#DC2626","<5% Crítico"]].map(([c,l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: c }} />
                <span style={{ fontSize: "10px", color: "#9CA3AF" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* P&L tabla */}
        <div
          style={{
            background: "#FFF",
            borderRadius: "14px",
            overflow: "hidden",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #F3F4F6",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}
            >
              Estado de Resultados — {MESES[mes]} {anio}
            </span>
            {pl?.gastos_sin_categorizar ? (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: "600",
                  background: "#FEF2F2",
                  color: "#DC2626",
                }}
              >
                {pl.gastos_sin_categorizar} sin cat.
              </span>
            ) : null}
          </div>
          <div style={{ overflow: "auto", maxHeight: "520px" }}>
            {loading ? (
              <div style={{ padding: "16px 20px" }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: "1px solid #F9FAFB",
                    }}
                  >
                    <div
                      style={{
                        width: "40%",
                        height: "14px",
                        borderRadius: "4px",
                        background: "#F3F4F6",
                      }}
                    />
                    <div
                      style={{
                        width: "20%",
                        height: "14px",
                        borderRadius: "4px",
                        background: "#F3F4F6",
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div
                style={{
                  padding: "32px",
                  textAlign: "center" as const,
                  color: "#EF4444",
                  fontSize: "13px",
                }}
              >
                No se pudieron cargar los datos — {error.message}
              </div>
            ) : !pl || pl.ventas_netas === 0 ? (
              <div style={{ padding: "32px", textAlign: "center" as const, color: "#9CA3AF", fontSize: "13px", lineHeight: "1.6" }}>
                Sin datos registrados para {MESES[mes]} {anio}
                <br />
                <span style={{ fontSize: "11px", color: "#D1D5DB" }}>Restaurante ID: {restauranteId}</span>
              </div>
            ) : plV2 ? (
              /* ── Nueva tabla v2 ── */
              (() => {
                const v = plV2.ventas || 0;
                const pct = (n: number) => v > 0 ? `${(n / v * 100).toFixed(1)}%` : "—";
                const healthFC = (p: number) => p <= 30 ? "#059669" : p <= 35 ? "#D97706" : "#DC2626";
                const healthEB = (p: number) => p >= 15 ? "#059669" : p >= 5 ? "#D97706" : "#DC2626";

                const SectionLabel = ({ label }: { label: string }) => (
                  <tr><td colSpan={3} style={{ padding: "6px 20px 3px", fontSize: "9px", fontWeight: "800", color: "#9CA3AF", letterSpacing: "0.1em", background: "#FAFBFC", borderTop: "1px solid #E5E7EB", textTransform: "uppercase" as const }}>{label}</td></tr>
                );
                const TotalLine = ({ label, monto, pctVal, color, bg }: { label: string; monto: number; pctVal: string; color: string; bg?: string }) => (
                  <tr style={{ background: bg || "#F9FAFB", borderTop: "1px solid #E5E7EB" }}>
                    <td style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "700", color }}>{label}</td>
                    <td style={{ padding: "9px 20px", textAlign: "right" as const, fontSize: "13px", fontWeight: "700", color }}>{fmt(monto)}</td>
                    <td style={{ padding: "9px 20px", textAlign: "right" as const, fontSize: "12px", color }}>{pctVal}</td>
                  </tr>
                );
                const GroupRow = ({ label, subtotal, open, onToggle, pctStr, color }: { label: string; subtotal: number; open: boolean; onToggle: () => void; pctStr: string; color?: string }) => (
                  <tr onClick={onToggle} style={{ borderTop: "1px solid #F9FAFB", cursor: "pointer", background: open ? "#FAFBFC" : "transparent" }}>
                    <td style={{ padding: "8px 20px", fontSize: "13px", color: color || "#374151" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        {open ? <ChevronDown style={{ width: "13px", height: "13px", color: "#9CA3AF" }} /> : <ChevronRight style={{ width: "13px", height: "13px", color: "#9CA3AF" }} />}
                        ↳ {label}
                      </span>
                    </td>
                    <td style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "13px", color: "#DC2626" }}>{subtotal > 0 ? fmt(subtotal) : "—"}</td>
                    <td style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "12px", color: "#DC2626" }}>{pctStr}</td>
                  </tr>
                );
                const DetailRow = ({ label, monto, alert, alertMsg }: { key?: React.Key; label: string; monto: number; alert?: boolean; alertMsg?: string }) => (
                  <tr style={{ borderTop: "1px solid #F9FAFB", background: "#FAFBFC" }}>
                    <td style={{ padding: "4px 20px 4px 44px", fontSize: "12px", color: "#6B7280" }}>
                      {label}
                      {alert && <span title={alertMsg} style={{ marginLeft: "6px", cursor: "help", fontSize: "10px", background: "#FEF2F2", color: "#DC2626", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>⚠️ &gt;0.5%</span>}
                    </td>
                    <td style={{ padding: "4px 20px", textAlign: "right" as const, fontSize: "12px", color: "#374151" }}>{monto > 0 ? fmt(monto) : "—"}</td>
                    <td style={{ padding: "4px 20px", textAlign: "right" as const, fontSize: "11px", color: "#9CA3AF" }}>{pct(monto)}</td>
                  </tr>
                );

                const renderGrupo = (key: string, label: string) => {
                  const g = plV2.gastos_operativos[key];
                  if (!g) return null;
                  return <>
                    <GroupRow label={label} subtotal={g.subtotal} open={v2Open[key]} onToggle={() => toggleV2(key)} pctStr={pct(g.subtotal)} />
                    {v2Open[key] && Object.entries(g.detalle as Record<string,number>).map(([line, monto]) => (
                      <DetailRow key={line} label={line} monto={monto as number}
                        alert={key === "otros" && g.alerta && line === "OTROS"}
                        alertMsg={String(g.alerta_mensaje || "")} />
                    ))}
                  </>;
                };

                const fc = plV2.costo_ventas.food_cost;
                const bev = plV2.costo_ventas.beverage_cost;

                return (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#FAFBFC" }}>
                        <th style={{ padding: "8px 20px", textAlign: "left" as const, fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Concepto</th>
                        <th style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Monto</th>
                        <th style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>% Ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Ventas */}
                      <tr style={{ borderTop: "1px solid #F9FAFB" }}>
                        <td style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "700", color: "#059669" }}>Ventas netas</td>
                        <td style={{ padding: "9px 20px", textAlign: "right" as const, fontSize: "13px", fontWeight: "700", color: "#059669" }}>{fmt(v)}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right" as const, fontSize: "12px", color: "#059669" }}>100%</td>
                      </tr>

                      {/* COSTO DE VENTAS */}
                      <SectionLabel label="Costo de Ventas" />
                      <GroupRow label={`Food Cost · ${fc.porcentaje.toFixed(1)}%`} subtotal={fc.subtotal} open={v2Open["food_cost"]} onToggle={() => toggleV2("food_cost")} pctStr={`${fc.porcentaje.toFixed(1)}%`} color={healthFC(fc.porcentaje)} />
                      {v2Open["food_cost"] && Object.entries(fc.detalle as Record<string,number>).map(([l, m]) => <DetailRow key={l} label={l} monto={m as number} />)}
                      <GroupRow label={`Beverage Cost · ${bev.porcentaje.toFixed(1)}%`} subtotal={bev.subtotal} open={v2Open["beverage_cost"]} onToggle={() => toggleV2("beverage_cost")} pctStr={`${bev.porcentaje.toFixed(1)}%`} />
                      {v2Open["beverage_cost"] && Object.entries(bev.detalle as Record<string,number>).map(([l, m]) => <DetailRow key={l} label={l} monto={m as number} />)}
                      <TotalLine label="Total Costo de Ventas" monto={plV2.costo_ventas.total} pctVal={pct(plV2.costo_ventas.total)} color="#DC2626" />
                      <TotalLine label="UTILIDAD BRUTA" monto={plV2.utilidad_bruta} pctVal={pct(plV2.utilidad_bruta)} color={plV2.utilidad_bruta >= 0 ? "#059669" : "#DC2626"} bg={plV2.utilidad_bruta >= 0 ? "#F0FDF4" : "#FEF2F2"} />

                      {/* GASTOS OPERATIVOS */}
                      <SectionLabel label="Gastos Operativos" />
                      {renderGrupo("nomina", "Nómina")}
                      {renderGrupo("gastos_personal", "Gastos de Personal")}
                      {renderGrupo("operacion", "Operación")}
                      {renderGrupo("servicios", "Servicios")}
                      {renderGrupo("comisiones", "Comisiones")}
                      {renderGrupo("otros", "Otros")}
                      <TotalLine label="Total Gastos Operativos" monto={plV2.gastos_operativos.total} pctVal={pct(plV2.gastos_operativos.total)} color="#DC2626" />

                      {/* EBITDA */}
                      <TotalLine label="EBITDA" monto={plV2.ebitda} pctVal={`${plV2.ebitda_pct.toFixed(1)}%`} color={healthEB(plV2.ebitda_pct)} bg={plV2.ebitda >= 0 ? "#F0FDF4" : "#FEF2F2"} />

                      {/* IMPUESTOS */}
                      {plV2.impuestos.total > 0 && <>
                        <SectionLabel label="Impuestos" />
                        {Object.entries(plV2.impuestos.detalle as Record<string,number>).filter(([,m]) => (m as number) > 0).map(([l, m]) => <DetailRow key={l} label={l} monto={m as number} />)}
                        <TotalLine label="Total Impuestos" monto={plV2.impuestos.total} pctVal={pct(plV2.impuestos.total)} color="#DC2626" />
                      </>}

                      {/* UTILIDAD NETA */}
                      <TotalLine label="UTILIDAD NETA" monto={plV2.utilidad_neta} pctVal={`${plV2.utilidad_neta_pct.toFixed(1)}%`} color={plV2.utilidad_neta >= 0 ? "#059669" : "#DC2626"} bg={plV2.utilidad_neta >= 0 ? "#ECFDF5" : "#FEF2F2"} />
                    </tbody>
                  </table>
                );
              })()
            ) : (
              <div style={{ padding: "32px", textAlign: "center" as const, color: "#9CA3AF", fontSize: "13px" }}>Cargando desglose…</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Top 10 Platillos ──────────────────────────────────────── */}
      <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)", marginTop: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Top 10 Platillos</div>
            <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{MESES[mes]} {anio} · por venta total</div>
          </div>
        </div>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: "40px", borderRadius: "8px", background: "#F3F4F6" }} />)}
          </div>
        ) : platillos.length === 0 ? (
          <div style={{ textAlign: "center" as const, color: "#9CA3AF", fontSize: "13px", padding: "32px 0" }}>
            Sin datos de platillos para {MESES[mes]} {anio}<br />
            <span style={{ fontSize: "11px" }}>Los datos se cargan desde los cierres de turno de Parrot POS</span>
          </div>
        ) : (() => {
          const maxVenta = Math.max(...platillos.map(p => p.venta_total), 1);
          return (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
              {platillos.map((p, i) => {
                const pct = (p.venta_total / maxVenta) * 100;
                const trend = p.trend_pct;
                const trendColor = trend == null ? "#9CA3AF" : trend >= 0 ? "#059669" : "#DC2626";
                const trendLabel = trend == null ? "Nuevo" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend).toFixed(0)}%`;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto auto", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: i < 3 ? "#3D1C1E" : "#9CA3AF", textAlign: "right" as const }}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "#374151", marginBottom: "3px", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "260px" }}>{p.nombre}</div>
                      <div style={{ height: "5px", background: "#F3F4F6", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: i === 0 ? "#C8FF00" : i < 3 ? "#3D1C1E" : "#9CA3AF", borderRadius: "3px", transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#111827" }}>{fmt(p.venta_total)}</div>
                      <div style={{ fontSize: "10px", color: "#9CA3AF" }}>{p.cantidad} uds · {fmt(p.precio_promedio)} prom</div>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: "600", color: trendColor, minWidth: "40px", textAlign: "right" as const }}>{trendLabel}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
