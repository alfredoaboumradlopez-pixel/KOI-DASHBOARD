import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import {
  Building2,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  ExternalLink,
  Zap,
} from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function Semaforo({ color }: { color: "verde" | "amarillo" | "rojo" | string }) {
  const c =
    color === "verde" ? "#059669" : color === "amarillo" ? "#F59E0B" : "#DC2626";
  return (
    <span
      style={{
        display: "inline-block",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background: c,
        flexShrink: 0,
      }}
    />
  );
}

// Muestra el contador de alertas con color según severidad
function AlertaBadge({ alertas }: { alertas: any[] }) {
  if (!alertas || alertas.length === 0) {
    return <span style={{ fontSize: "12px", color: "#059669" }}>✓</span>;
  }
  const hasCritical = alertas.some(
    (a) => (a.severidad || "WARNING") === "CRITICAL"
  );
  const bg = hasCritical ? "#FEF2F2" : "#FFFBEB";
  const color = hasCritical ? "#DC2626" : "#D97706";
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "6px",
        fontSize: "11px",
        fontWeight: "700",
        background: bg,
        color,
      }}
    >
      {alertas.length}
    </span>
  );
}

export const RBODashboard = () => {
  const { setCurrentRoute } = useStore();
  const [restaurantes, setRestaurantes] = useState<any[]>([]);
  const [pls, setPls] = useState<Record<number, any>>({});
  const [healths, setHealths] = useState<Record<string, any>>({});
  const [alertasPorRestaurante, setAlertasPorRestaurante] = useState<
    Record<number, any[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [evaluando, setEvaluando] = useState(false);
  const [error, setError] = useState("");
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const rests = await api.get("/api/restaurantes");
      setRestaurantes(rests);

      const plResults: Record<number, any> = {};
      const healthResults: Record<string, any> = {};
      const alertasResults: Record<number, any[]> = {};

      await Promise.all(
        rests.map(async (r: any) => {
          // P&L, health y alertas en paralelo por restaurante
          await Promise.all([
            // P&L
            api
              .get(`/api/pl/${r.id}/mes/${anio}/${mes}`)
              .then((d: any) => {
                plResults[r.id] = d.data ?? d;
              })
              .catch((e: any) =>
                console.error(`PL error r=${r.id}:`, e.message)
              ),
            // Health
            api
              .get(`/api/restaurantes/${r.slug}/health`)
              .then((d: any) => {
                healthResults[r.slug] = d;
              })
              .catch((e: any) =>
                console.error(`Health error r=${r.slug}:`, e.message)
              ),
            // Alertas activas reales
            api
              .get(`/api/alertas/${r.id}/activas`)
              .then((d: any) => {
                alertasResults[r.id] = Array.isArray(d) ? d : [];
              })
              .catch(() => {
                alertasResults[r.id] = [];
              }),
          ]);
        })
      );

      setPls(plResults);
      setHealths(healthResults);
      setAlertasPorRestaurante(alertasResults);
    } catch (e: any) {
      setError("Error al cargar datos: " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };

  // Evaluar alertas de todos los restaurantes y recargar
  const evaluarTodasAlertas = async () => {
    setEvaluando(true);
    try {
      await Promise.all(
        restaurantes.map((r) =>
          api
            .post(`/api/alertas/${r.id}/evaluar`, {})
            .catch((e: any) =>
              console.warn(`Evaluar alertas r=${r.id}:`, e.message)
            )
        )
      );
      // Recargar solo las alertas
      const alertasResults: Record<number, any[]> = {};
      await Promise.all(
        restaurantes.map((r) =>
          api
            .get(`/api/alertas/${r.id}/activas`)
            .then((d: any) => {
              alertasResults[r.id] = Array.isArray(d) ? d : [];
            })
            .catch(() => {
              alertasResults[r.id] = [];
            })
        )
      );
      setAlertasPorRestaurante(alertasResults);
    } catch (e: any) {
      console.error("Error evaluando alertas:", e);
    } finally {
      setEvaluando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  // Portfolio totals
  const plValues = Object.values(pls) as any[];
  const totalVentas = plValues.reduce(
    (s: number, p: any) => s + (p?.ventas_netas || 0),
    0
  );
  const avgMargen =
    plValues.length > 0
      ? plValues.reduce((s: number, p: any) => s + (p?.margen_neto_pct || 0), 0) /
        plValues.length
      : 0;
  const totalAlertas: number = (Object.values(alertasPorRestaurante) as any[][]).reduce(
    (s: number, arr: any[]) => s + (Array.isArray(arr) ? arr.length : 0),
    0
  );

  const getSemaforo = (r: any): "verde" | "amarillo" | "rojo" => {
    const pl = pls[r.id];
    const alertas = alertasPorRestaurante[r.id] ?? [];
    const diasSinCierre = healths[r.slug]?.dias_sin_cierre ?? 0;
    const hasCritical = alertas.some(
      (a) => (a.severidad || "WARNING") === "CRITICAL"
    );
    if (!pl) return "amarillo";
    if (
      pl.margen_neto_pct < 10 ||
      pl.food_cost_pct > 38 ||
      alertas.length > 3 ||
      hasCritical
    )
      return "rojo";
    if (
      pl.margen_neto_pct < 20 ||
      pl.food_cost_pct > 32 ||
      alertas.length > 0 ||
      diasSinCierre > 0
    )
      return "amarillo";
    return "verde";
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1
            style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}
          >
            Panel RBO
          </h1>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>
            Vista multi-restaurante —{" "}
            {new Date().toLocaleDateString("es-MX", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {/* Evaluar alertas — dispara evaluación en todos los restaurantes */}
          <button
            onClick={evaluarTodasAlertas}
            disabled={evaluando || loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              background: evaluando ? "#F9FAFB" : "#FFF",
              fontSize: "12px",
              cursor: evaluando ? "not-allowed" : "pointer",
              color: "#374151",
              opacity: evaluando ? 0.7 : 1,
            }}
          >
            <Zap style={{ width: "14px", height: "14px", color: "#D97706" }} />
            {evaluando ? "Evaluando…" : "Evaluar alertas"}
          </button>
          {/* Actualizar datos */}
          <button
            onClick={cargar}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              background: "#FFF",
              fontSize: "12px",
              cursor: loading ? "not-allowed" : "pointer",
              color: "#374151",
              opacity: loading ? 0.7 : 1,
            }}
          >
            <RefreshCw style={{ width: "14px", height: "14px" }} /> Actualizar
          </button>
          <button
            onClick={() => setCurrentRoute("/rbo/nuevo-restaurante")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "#3D1C1E",
              color: "#C8FF00",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            + Restaurante
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#DC2626",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {error}
          <button
            onClick={cargar}
            style={{
              border: "none",
              background: "none",
              color: "#DC2626",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            Reintentar →
          </button>
        </div>
      )}

      {/* Portfolio Summary Cards */}
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
            label: "Restaurantes activos",
            value: String(restaurantes.filter((r) => r.activo).length),
            icon: Building2,
            color: "#3D1C1E",
          },
          {
            label: "Ventas portafolio",
            value: fmt(totalVentas),
            icon: DollarSign,
            color: "#059669",
          },
          {
            label: "Margen promedio",
            value: `${avgMargen.toFixed(1)}%`,
            icon: TrendingUp,
            color:
              avgMargen >= 20 ? "#059669" : avgMargen >= 10 ? "#D97706" : "#DC2626",
          },
          {
            label: "Alertas activas",
            value: String(totalAlertas),
            icon: AlertTriangle,
            color: totalAlertas > 0 ? "#DC2626" : "#059669",
          },
        ].map((k, i) => {
          const Ic = k.icon;
          return (
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
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#9CA3AF",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {k.label}
                </span>
                <Ic style={{ width: "16px", height: "16px", color: k.color }} />
              </div>
              {loading ? (
                <div
                  style={{
                    height: "28px",
                    borderRadius: "6px",
                    background: "#F3F4F6",
                    marginTop: "8px",
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: "800",
                    color: k.color,
                    marginTop: "8px",
                  }}
                >
                  {k.value}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabla de restaurantes */}
      <div
        style={{
          background: "#FFF",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #F3F4F6",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>
            Restaurantes
          </span>
          {evaluando && (
            <span style={{ fontSize: "12px", color: "#D97706" }}>
              Evaluando alertas…
            </span>
          )}
        </div>
        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                {[
                  "",
                  "Restaurante",
                  "Ventas mes",
                  "Margen %",
                  "Food Cost %",
                  "Nómina %",
                  "Último cierre",
                  "Alertas",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left" as const,
                      fontSize: "10px",
                      fontWeight: "700",
                      color: "#9CA3AF",
                      textTransform: "uppercase" as const,
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={{ padding: "12px 16px" }}>
                        <div
                          style={{
                            height: "14px",
                            borderRadius: "4px",
                            background: "#F3F4F6",
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : restaurantes.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: "32px",
                      textAlign: "center" as const,
                      color: "#9CA3AF",
                      fontSize: "13px",
                    }}
                  >
                    Sin restaurantes registrados
                  </td>
                </tr>
              ) : (
                restaurantes.map((r) => {
                  const pl = pls[r.id];
                  const h = healths[r.slug];
                  const alertas = alertasPorRestaurante[r.id] ?? [];
                  const sem = getSemaforo(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() =>
                        setCurrentRoute(`/rbo/restaurante/${r.slug}`)
                      }
                      style={{
                        borderTop: "1px solid #F9FAFB",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#FAFBFC")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <Semaforo color={sem} />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "#111827",
                          }}
                        >
                          {r.nombre}
                        </div>
                        <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
                          {r.slug} · {r.plan}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "#111827",
                        }}
                      >
                        {pl ? fmt(pl.ventas_netas) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: pl
                            ? pl.margen_neto_pct >= 20
                              ? "#059669"
                              : pl.margen_neto_pct >= 10
                              ? "#D97706"
                              : "#DC2626"
                            : "#9CA3AF",
                          fontWeight: "600",
                        }}
                      >
                        {pl ? `${pl.margen_neto_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: pl
                            ? pl.food_cost_pct <= 28
                              ? "#059669"
                              : pl.food_cost_pct <= 32
                              ? "#D97706"
                              : "#DC2626"
                            : "#9CA3AF",
                          fontWeight: "600",
                        }}
                      >
                        {pl ? `${pl.food_cost_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: pl
                            ? pl.nomina_pct <= 32
                              ? "#059669"
                              : pl.nomina_pct <= 38
                              ? "#D97706"
                              : "#DC2626"
                            : "#9CA3AF",
                          fontWeight: "600",
                        }}
                      >
                        {pl ? `${pl.nomina_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "12px",
                          color: "#6B7280",
                        }}
                      >
                        {h?.ultimo_cierre
                          ? h.dias_sin_cierre === 0
                            ? "Hoy"
                            : `Hace ${h.dias_sin_cierre}d`
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <AlertaBadge alertas={alertas} />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <ExternalLink
                          style={{ width: "14px", height: "14px", color: "#9CA3AF" }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
