import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtPct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;

function pctColor(pct: number, thresholds: { green: number; yellow: number; higher_is_worse?: boolean }) {
  if (thresholds.higher_is_worse) {
    if (pct <= thresholds.green) return "#059669";
    if (pct <= thresholds.yellow) return "#D97706";
    return "#DC2626";
  }
  if (pct >= thresholds.green) return "#059669";
  if (pct >= thresholds.yellow) return "#D97706";
  return "#DC2626";
}

function Badge({ pct, thresholds }: { pct: number; thresholds: { green: number; yellow: number; higher_is_worse?: boolean } }) {
  const color = pctColor(pct, thresholds);
  const bg = color === "#059669" ? "#ECFDF5" : color === "#D97706" ? "#FFFBEB" : "#FEF2F2";
  const border = color === "#059669" ? "#A7F3D0" : color === "#D97706" ? "#FDE68A" : "#FECACA";
  return (
    <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", color, background: bg, border: `1px solid ${border}` }}>
      {fmtPct(pct)}
    </span>
  );
}

function Skeleton() {
  return <div style={{ height: "20px", borderRadius: "6px", background: "linear-gradient(90deg,#F3F4F6 25%,#E5E7EB 50%,#F3F4F6 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />;
}

interface PLResult {
  ventas_netas: number; ventas_efectivo: number; ventas_parrot: number;
  ventas_terminales: number; ventas_uber: number; ventas_rappi: number;
  costo_alimentos: number; costo_bebidas: number; total_costo_ventas: number;
  utilidad_bruta: number; margen_bruto_pct: number;
  gastos_nomina: number; gastos_renta: number; gastos_servicios: number;
  gastos_mantenimiento: number; gastos_limpieza: number; gastos_marketing: number;
  gastos_admin: number; gastos_otros: number; total_gastos_operativos: number;
  ebitda: number; margen_ebitda_pct: number;
  impuestos_estimados: number; utilidad_neta: number; margen_neto_pct: number;
  food_cost_pct: number; nomina_pct: number;
  dias_con_datos: number; gastos_sin_categorizar: number;
  advertencias: string[];
}

// Suppress unused import warnings — these are used for future icon slots
void TrendingUp;
void TrendingDown;

export const PLDashboard = () => {
  const { authUser } = useStore();
  const restauranteId = authUser?.restaurante_id ?? 1;
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(new Date().getFullYear());
  const [pl, setPl] = useState<PLResult | null>(null);
  const [semanas, setSemanas] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const cargar = async (m: number) => {
    setLoading(true);
    setError("");
    try {
      const [plData, semData] = await Promise.all([
        api.get(`/api/pl/${restauranteId}/mes/${anio}/${m}`),
        api.get(`/api/pl/${restauranteId}/resumen-semana`),
      ]);
      setPl(plData.data);
      setSemanas(semData.semanas || []);
      setAlertas(plData.data?.advertencias || []);
    } catch (e: any) {
      setError("Error al cargar P&L. " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(mes); }, [mes]);

  const plRows = pl ? [
    { label: "Ventas netas", monto: pl.ventas_netas, bold: false, pct: 100 },
    { label: "↳ Costo de ventas", monto: -pl.total_costo_ventas, bold: false, pct: pl.total_costo_ventas / (pl.ventas_netas || 1) * 100 },
    { label: "Utilidad bruta", monto: pl.utilidad_bruta, bold: true, pct: pl.margen_bruto_pct, subtotal: true },
    { label: "Nómina", monto: -pl.gastos_nomina, bold: false, pct: pl.nomina_pct },
    { label: "Renta", monto: -pl.gastos_renta, bold: false, pct: pl.gastos_renta / (pl.ventas_netas || 1) * 100 },
    { label: "Servicios", monto: -pl.gastos_servicios, bold: false, pct: pl.gastos_servicios / (pl.ventas_netas || 1) * 100 },
    { label: "Mantenimiento", monto: -pl.gastos_mantenimiento, bold: false, pct: pl.gastos_mantenimiento / (pl.ventas_netas || 1) * 100 },
    { label: "Limpieza", monto: -pl.gastos_limpieza, bold: false, pct: pl.gastos_limpieza / (pl.ventas_netas || 1) * 100 },
    { label: "Marketing", monto: -pl.gastos_marketing, bold: false, pct: pl.gastos_marketing / (pl.ventas_netas || 1) * 100 },
    { label: "Otros gastos", monto: -(pl.gastos_admin + pl.gastos_otros), bold: false, pct: (pl.gastos_admin + pl.gastos_otros) / (pl.ventas_netas || 1) * 100 },
    { label: "EBITDA", monto: pl.ebitda, bold: true, pct: pl.margen_ebitda_pct, subtotal: true },
    { label: "Impuestos est.", monto: -pl.impuestos_estimados, bold: false, pct: pl.impuestos_estimados / (pl.ventas_netas || 1) * 100 },
    { label: "Utilidad neta", monto: pl.utilidad_neta, bold: true, pct: pl.margen_neto_pct, subtotal: true },
  ] : [];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      {/* Barra de alertas */}
      {alertas.length > 0 && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <AlertTriangle style={{ width: "16px", height: "16px", color: "#D97706", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#92400E", fontWeight: "600" }}>
            {alertas.length} alerta{alertas.length > 1 ? "s" : ""}: {alertas.join(" · ")}
          </span>
        </div>
      )}

      {/* Selector de mes */}
      <div style={{ background: "#FFF", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" as const }}>
        <span style={{ fontSize: "12px", color: "#9CA3AF", fontWeight: "600", marginRight: "4px" }}>{anio}</span>
        {MESES.slice(1).map((m, i) => (
          <button key={i + 1} onClick={() => setMes(i + 1)} style={{ padding: "6px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: mes === i + 1 ? "700" : "400", background: mes === i + 1 ? "#3D1C1E" : "transparent", color: mes === i + 1 ? "#C8FF00" : "#6B7280", transition: "all 0.15s" }}>
            {m}
          </button>
        ))}
        {loading && <RefreshCw style={{ width: "14px", height: "14px", color: "#9CA3AF", marginLeft: "auto", animation: "spin 1s linear infinite" }} />}
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "16px", marginBottom: "16px", fontSize: "13px", color: "#DC2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {error}
          <button onClick={() => cargar(mes)} style={{ border: "none", background: "none", color: "#DC2626", cursor: "pointer", fontWeight: "600", fontSize: "12px" }}>Reintentar →</button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "Ventas Netas", value: pl ? fmt(pl.ventas_netas) : null, sub: pl ? `${pl.dias_con_datos} días` : null, badge: null },
          { label: "Margen Neto", value: pl ? fmtPct(pl.margen_neto_pct) : null, sub: null, badge: pl ? <Badge pct={pl.margen_neto_pct} thresholds={{ green: 20, yellow: 10 }} /> : null },
          { label: "Food Cost", value: pl ? fmtPct(pl.food_cost_pct) : null, sub: null, badge: pl ? <Badge pct={pl.food_cost_pct} thresholds={{ green: 28, yellow: 32, higher_is_worse: true }} /> : null },
          { label: "Nómina %", value: pl ? fmtPct(pl.nomina_pct) : null, sub: null, badge: pl ? <Badge pct={pl.nomina_pct} thresholds={{ green: 32, yellow: 38, higher_is_worse: true }} /> : null },
        ].map((k, i) => (
          <div key={i} style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>{k.label}</div>
            {loading ? <Skeleton /> : (
              <>
                <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginBottom: "4px" }}>{k.value ?? "—"}</div>
                {k.badge && <div>{k.badge}</div>}
                {k.sub && <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{k.sub}</div>}
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Curva de margen — últimas 8 semanas */}
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827", marginBottom: "16px" }}>Margen neto — últimas 8 semanas</div>
          {loading ? (
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", height: "100px" }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: `${30 + Math.random() * 60}px`, borderRadius: "4px 4px 0 0", background: "#F3F4F6" }} />
              ))}
            </div>
          ) : semanas.length === 0 ? (
            <div style={{ textAlign: "center" as const, color: "#9CA3AF", fontSize: "13px", padding: "32px 0" }}>Sin datos de semanas</div>
          ) : (
            <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "120px" }}>
              {semanas.map((s, i) => {
                const pct = s.margen_neto_pct ?? 0;
                const color = pct >= 20 ? "#059669" : pct >= 10 ? "#F59E0B" : "#DC2626";
                const heightPct = Math.max(Math.abs(pct) / 50 * 100, 4);
                const ventas = s.ventas_netas || 0;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: "4px" }}>
                    <span style={{ fontSize: "9px", color, fontWeight: "700" }}>{pct.toFixed(1)}%</span>
                    <div title={`S. ${s.semana_inicio}\nVentas: ${fmt(ventas)}\nMargen: ${pct.toFixed(1)}%`} style={{ width: "100%", height: `${heightPct}%`, background: color, borderRadius: "3px 3px 0 0", opacity: s.dias_con_datos === 0 ? 0.3 : 1 }} />
                    <span style={{ fontSize: "8px", color: "#9CA3AF" }}>{s.semana_inicio?.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* P&L tabla */}
        <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Estado de Resultados — {MESES[mes]} {anio}</span>
            {pl?.gastos_sin_categorizar ? (
              <span style={{ marginLeft: "8px", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: "#FEF2F2", color: "#DC2626" }}>
                {pl.gastos_sin_categorizar} sin cat.
              </span>
            ) : null}
          </div>
          <div style={{ overflow: "auto", maxHeight: "320px" }}>
            {loading ? (
              <div style={{ padding: "16px 20px" }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F9FAFB" }}>
                    <div style={{ width: "40%", height: "14px", borderRadius: "4px", background: "#F3F4F6" }} />
                    <div style={{ width: "20%", height: "14px", borderRadius: "4px", background: "#F3F4F6" }} />
                  </div>
                ))}
              </div>
            ) : pl?.ventas_netas === 0 ? (
              <div style={{ padding: "32px", textAlign: "center" as const, color: "#9CA3AF", fontSize: "13px" }}>Sin datos registrados para este período</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFBFC" }}>
                    <th style={{ padding: "8px 20px", textAlign: "left" as const, fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Concepto</th>
                    <th style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Monto</th>
                    <th style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>% Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {plRows.map((row, i) => (
                    <tr key={i} style={{ background: row.subtotal ? "#F9FAFB" : "transparent", borderTop: row.subtotal ? "1px solid #E5E7EB" : "1px solid #F9FAFB" }}>
                      <td style={{ padding: "8px 20px", fontSize: "13px", fontWeight: row.bold ? "700" : "400", color: "#374151" }}>{row.label}</td>
                      <td style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "13px", fontWeight: row.bold ? "700" : "400", color: row.monto >= 0 ? "#111827" : "#6B7280" }}>
                        {fmt(Math.abs(row.monto))}
                      </td>
                      <td style={{ padding: "8px 20px", textAlign: "right" as const, fontSize: "12px", color: "#9CA3AF" }}>
                        {row.pct != null ? `${row.pct.toFixed(1)}%` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
