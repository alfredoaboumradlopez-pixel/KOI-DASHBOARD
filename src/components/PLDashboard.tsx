import { useState, useEffect, useMemo } from "react";
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
  const [semanas, setSemanas] = useState<any[]>([]);
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

      // Fetch semanas (no-crítico: si falla, continuamos)
      let semanasData: any[] = [];
      try {
        const semResp = await fetch(
          `${(window as any).__API_BASE__ || ""}/api/pl/${restauranteId}/resumen-semana`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(localStorage.getItem("rbo_token")
                ? { Authorization: `Bearer ${localStorage.getItem("rbo_token")}` }
                : {}),
            },
          }
        );
        if (semResp.ok) {
          const semJson = await semResp.json();
          semanasData = semJson?.semanas ?? [];
        } else {
          console.warn(`[PLDashboard] resumen-semana retornó ${semResp.status}`);
        }
      } catch (semErr) {
        console.warn("[PLDashboard] resumen-semana fetch falló:", semErr);
      }

      setPl(plData);
      setSemanas(semanasData);
      setAlertas(plData?.advertencias ?? []);
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

  const isSuperAdmin = localStorage.getItem("user_role") === "SUPER_ADMIN";
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGrupo = (k: string) =>
    setExpandedGroups(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const GRUPO_MAP: Record<string, string> = {
    costo_alimentos: "Costo de ventas", costo_bebidas: "Costo de ventas",
    nomina: "Nómina", renta: "Renta", servicios: "Servicios",
    limpieza: "Limpieza", mantenimiento: "Mantenimiento",
    marketing: "Marketing", otros_gastos: "Otros gastos", admin: "Otros gastos",
  };
  const GRUPO_ORDER = ["Costo de ventas","Nómina","Renta","Servicios","Limpieza","Mantenimiento","Marketing","Otros gastos"];

  // Build {grupoNombre: [{categoria, monto, pct_ventas}]} from gastos_por_categoria
  const gruposData = useMemo(() => {
    const cats = pl?.gastos_por_categoria ?? [];
    const map: Record<string, typeof cats> = {};
    cats.forEach(c => {
      const nombre = GRUPO_MAP[c.categoria_pl] ?? "Otros gastos";
      if (!map[nombre]) map[nombre] = [];
      map[nombre].push(c);
    });
    return map;
  }, [pl]);

  const hasDesglose = Object.keys(gruposData).length > 0;

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
        {[
          {
            label: "Ventas Netas",
            value: pl ? fmt(pl.ventas_netas) : null,
            sub: pl ? `${pl.dias_con_datos} días con datos` : null,
            badge: null,
          },
          {
            label: "Margen Neto",
            value: pl ? fmtPct(pl.margen_neto_pct) : null,
            sub: pl ? fmt(pl.utilidad_neta) : null,
            badge: pl ? (
              <Badge
                pct={pl.margen_neto_pct}
                thresholds={{ green: 20, yellow: 10 }}
              />
            ) : null,
          },
          {
            label: "Food Cost",
            value: pl ? fmtPct(pl.food_cost_pct) : null,
            sub: pl ? fmt(pl.total_costo_ventas) : null,
            badge: pl ? (
              <Badge
                pct={pl.food_cost_pct}
                thresholds={{ green: 28, yellow: 32, higher_is_worse: true }}
              />
            ) : null,
          },
          {
            label: "Nómina %",
            value: pl ? fmtPct(pl.nomina_pct) : null,
            sub: pl ? fmt(pl.gastos_nomina) : null,
            badge: pl ? (
              <Badge
                pct={pl.nomina_pct}
                thresholds={{ green: 32, yellow: 38, higher_is_worse: true }}
              />
            ) : null,
          },
        ].map((k, i) => (
          <div
            key={i}
            style={{
              background: "#FFF",
              borderRadius: "14px",
              padding: "18px 20px",
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "600",
                color: "#9CA3AF",
                textTransform: "uppercase" as const,
                letterSpacing: "0.5px",
                marginBottom: "8px",
              }}
            >
              {k.label}
            </div>
            {loading ? (
              <Skeleton />
            ) : error ? (
              <div style={{ fontSize: "13px", color: "#D1D5DB" }}>—</div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: "800",
                    color: "#111827",
                    marginBottom: "4px",
                  }}
                >
                  {k.value ?? "—"}
                </div>
                {k.badge && <div style={{ marginBottom: "2px" }}>{k.badge}</div>}
                {k.sub && (
                  <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
                    {k.sub}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Curva de margen — últimas 8 semanas */}
        <div
          style={{
            background: "#FFF",
            borderRadius: "14px",
            padding: "20px",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "#111827",
              marginBottom: "16px",
            }}
          >
            Margen neto — últimas 8 semanas
          </div>
          {loading ? (
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-end",
                height: "100px",
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: "50px",
                    borderRadius: "4px 4px 0 0",
                    background: "#F3F4F6",
                  }}
                />
              ))}
            </div>
          ) : semanas.length === 0 ? (
            <div
              style={{
                textAlign: "center" as const,
                color: "#9CA3AF",
                fontSize: "13px",
                padding: "32px 0",
              }}
            >
              Sin datos de semanas para restaurante ID {restauranteId}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                gap: "4px",
                alignItems: "flex-end",
                height: "120px",
              }}
            >
              {semanas.map((s, i) => {
                const pct = s.margen_neto_pct ?? 0;
                const color =
                  pct >= 20 ? "#059669" : pct >= 10 ? "#F59E0B" : "#DC2626";
                const heightPct = Math.max(
                  (Math.abs(pct) / 50) * 100,
                  4
                );
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column" as const,
                      alignItems: "center",
                      justifyContent: "flex-end",
                      height: "100%",
                      gap: "4px",
                    }}
                  >
                    <span
                      style={{ fontSize: "9px", color, fontWeight: "700" }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                    <div
                      title={`${s.semana_inicio}\nVentas: ${fmt(s.ventas_netas || 0)}\nMargen: ${pct.toFixed(1)}%`}
                      style={{
                        width: "100%",
                        height: `${heightPct}%`,
                        background: color,
                        borderRadius: "3px 3px 0 0",
                        opacity: s.dias_con_datos === 0 ? 0.3 : 1,
                      }}
                    />
                    <span style={{ fontSize: "8px", color: "#9CA3AF" }}>
                      {s.semana_inicio?.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
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
              <div
                style={{
                  padding: "32px",
                  textAlign: "center" as const,
                  color: "#9CA3AF",
                  fontSize: "13px",
                  lineHeight: "1.6",
                }}
              >
                Sin datos registrados para {MESES[mes]} {anio}
                <br />
                <span style={{ fontSize: "11px", color: "#D1D5DB" }}>
                  Restaurante ID: {restauranteId}
                </span>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFBFC" }}>
                    <th
                      style={{
                        padding: "8px 20px",
                        textAlign: "left" as const,
                        fontSize: "10px",
                        fontWeight: "700",
                        color: "#9CA3AF",
                        textTransform: "uppercase" as const,
                      }}
                    >
                      Concepto
                    </th>
                    <th
                      style={{
                        padding: "8px 20px",
                        textAlign: "right" as const,
                        fontSize: "10px",
                        fontWeight: "700",
                        color: "#9CA3AF",
                        textTransform: "uppercase" as const,
                      }}
                    >
                      Monto
                    </th>
                    <th
                      style={{
                        padding: "8px 20px",
                        textAlign: "right" as const,
                        fontSize: "10px",
                        fontWeight: "700",
                        color: "#9CA3AF",
                        textTransform: "uppercase" as const,
                      }}
                    >
                      % Ventas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Ventas netas */}
                  <tr style={{ borderTop: "1px solid #F9FAFB" }}>
                    <td style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "700", color: "#059669" }}>Ventas netas</td>
                    <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "13px", fontWeight: "700", color: "#059669" }}>{fmt(pl!.ventas_netas)}</td>
                    <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "12px", color: "#059669" }}>100%</td>
                  </tr>

                  {/* Grupos antes de Utilidad Bruta (solo Costo de ventas) y después */}
                  {(() => {
                    const rows: ReturnType<typeof Array<any>>[] = [] as any[];
                    const ventas = pl!.ventas_netas || 1;

                    const renderGrupo = (nombre: string, isCosto: boolean) => {
                      const cats = gruposData[nombre];
                      if (!cats || cats.length === 0) return;
                      const total = cats.reduce((s, c) => s + c.monto, 0);
                      const pctGrupo = (total / ventas * 100).toFixed(1);
                      const isOpen = isSuperAdmin || expandedGroups.has(nombre);

                      rows.push(
                        <tr
                          key={nombre}
                          onClick={() => !isSuperAdmin && toggleGrupo(nombre)}
                          style={{ borderTop: "1px solid #F9FAFB", cursor: isSuperAdmin ? "default" : "pointer", background: isOpen ? "#FAFBFC" : "transparent" }}
                        >
                          <td style={{ padding: "8px 20px", fontSize: "13px", color: "#374151" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              {!isSuperAdmin && (isOpen
                                ? <ChevronDown style={{ width: "13px", height: "13px", color: "#9CA3AF" }} />
                                : <ChevronRight style={{ width: "13px", height: "13px", color: "#9CA3AF" }} />
                              )}
                              ↳ {nombre}
                            </span>
                          </td>
                          <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "13px", color: "#DC2626" }}>{fmt(total)}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "12px", color: "#DC2626" }}>{pctGrupo}%</td>
                        </tr>
                      );

                      if (isOpen) {
                        cats.forEach(c => {
                          rows.push(
                            <tr key={c.categoria} style={{ borderTop: "1px solid #F9FAFB", background: "#FAFBFC" }}>
                              <td style={{ padding: "5px 20px 5px 44px", fontSize: "12px", color: "#6B7280" }}>
                                {c.categoria.replace(/_/g, " ")}
                              </td>
                              <td style={{ padding: "5px 20px", textAlign: "right", fontSize: "12px", color: "#374151" }}>{fmt(c.monto)}</td>
                              <td style={{ padding: "5px 20px", textAlign: "right", fontSize: "11px", color: "#9CA3AF" }}>{c.pct_ventas.toFixed(1)}%</td>
                            </tr>
                          );
                        });
                      }
                    };

                    // Costo de ventas (antes de utilidad bruta)
                    if (hasDesglose) {
                      renderGrupo("Costo de ventas", true);
                    } else {
                      rows.push(
                        <tr key="costo-fb" style={{ borderTop: "1px solid #F9FAFB" }}>
                          <td style={{ padding: "8px 20px", fontSize: "13px", color: "#374151" }}>↳ Costo de ventas</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "13px", color: "#DC2626" }}>{fmt(pl!.total_costo_ventas)}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "12px", color: "#DC2626" }}>{(pl!.total_costo_ventas/ventas*100).toFixed(1)}%</td>
                        </tr>
                      );
                    }

                    // Utilidad bruta
                    rows.push(
                      <tr key="ub" style={{ borderTop: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                        <td style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "700", color: pl!.utilidad_bruta >= 0 ? "#059669" : "#DC2626" }}>Utilidad bruta</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "13px", fontWeight: "700", color: pl!.utilidad_bruta >= 0 ? "#059669" : "#DC2626" }}>{fmt(pl!.utilidad_bruta)}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "12px", color: pl!.utilidad_bruta >= 0 ? "#059669" : "#DC2626" }}>{pl!.margen_bruto_pct.toFixed(1)}%</td>
                      </tr>
                    );

                    // Gastos operativos (todos los grupos excepto costo)
                    if (hasDesglose) {
                      GRUPO_ORDER.filter(n => n !== "Costo de ventas").forEach(nombre => renderGrupo(nombre, false));
                    } else {
                      [
                        { label: "Nómina", v: pl!.gastos_nomina },
                        { label: "Renta", v: pl!.gastos_renta },
                        { label: "Servicios", v: pl!.gastos_servicios },
                        { label: "Mantenimiento", v: pl!.gastos_mantenimiento },
                        { label: "Limpieza", v: pl!.gastos_limpieza },
                        { label: "Marketing", v: pl!.gastos_marketing },
                        { label: "Otros gastos", v: pl!.gastos_admin + pl!.gastos_otros },
                      ].filter(r => r.v > 0).forEach(r => {
                        rows.push(
                          <tr key={r.label} style={{ borderTop: "1px solid #F9FAFB" }}>
                            <td style={{ padding: "8px 20px", fontSize: "13px", color: "#374151" }}>{r.label}</td>
                            <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "13px", color: "#DC2626" }}>{fmt(r.v)}</td>
                            <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "12px", color: "#DC2626" }}>{(r.v/ventas*100).toFixed(1)}%</td>
                          </tr>
                        );
                      });
                    }

                    // EBITDA
                    rows.push(
                      <tr key="ebitda" style={{ borderTop: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                        <td style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "700", color: pl!.ebitda >= 0 ? "#059669" : "#DC2626" }}>EBITDA</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "13px", fontWeight: "700", color: pl!.ebitda >= 0 ? "#059669" : "#DC2626" }}>{fmt(pl!.ebitda)}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "12px", color: pl!.ebitda >= 0 ? "#059669" : "#DC2626" }}>{pl!.margen_ebitda_pct.toFixed(1)}%</td>
                      </tr>
                    );

                    // Impuestos
                    if (pl!.impuestos_estimados > 0) {
                      rows.push(
                        <tr key="imp" style={{ borderTop: "1px solid #F9FAFB" }}>
                          <td style={{ padding: "8px 20px", fontSize: "13px", color: "#374151" }}>Impuestos est.</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "13px", color: "#DC2626" }}>{fmt(pl!.impuestos_estimados)}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", fontSize: "12px", color: "#9CA3AF" }}>{(pl!.impuestos_estimados/ventas*100).toFixed(1)}%</td>
                        </tr>
                      );
                    }

                    // Utilidad neta
                    rows.push(
                      <tr key="un" style={{ borderTop: "1px solid #E5E7EB", background: pl!.utilidad_neta >= 0 ? "#ECFDF5" : "#FEF2F2" }}>
                        <td style={{ padding: "9px 20px", fontSize: "13px", fontWeight: "700", color: pl!.utilidad_neta >= 0 ? "#059669" : "#DC2626" }}>Utilidad neta</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "13px", fontWeight: "700", color: pl!.utilidad_neta >= 0 ? "#059669" : "#DC2626" }}>{fmt(pl!.utilidad_neta)}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontSize: "12px", color: pl!.utilidad_neta >= 0 ? "#059669" : "#DC2626" }}>{pl!.margen_neto_pct.toFixed(1)}%</td>
                      </tr>
                    );

                    return rows;
                  })()}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
