/**
 * Estado de Resultados — P&L v2
 * Nueva estructura con Food Cost / Beverage Cost / Nómina / Personal /
 * Operación / Servicios / Comisiones / Otros + alertas y colores de salud.
 */
import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";

// ─── Utils ────────────────────────────────────────────────────────────────────

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const pctFmt = (n: number) => `${n.toFixed(1)}%`;

function healthColor(pct: number, thresholds: { green: number; yellow: number; higherIsBad?: boolean }) {
  if (thresholds.higherIsBad) {
    if (pct <= thresholds.green) return "#4ade80";
    if (pct <= thresholds.yellow) return "#facc15";
    return "#f87171";
  }
  if (pct >= thresholds.green) return "#4ade80";
  if (pct >= thresholds.yellow) return "#facc15";
  return "#f87171";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GrupoDetalle {
  detalle: Record<string, number>;
  subtotal: number;
  porcentaje: number;
  alerta?: boolean;
  alerta_mensaje?: string | null;
}

interface PL2 {
  ventas: number;
  propinas_totales: number;
  costo_ventas: {
    food_cost: GrupoDetalle;
    beverage_cost: GrupoDetalle;
    total: number;
    total_porcentaje: number;
    margen_bruto_pct: number;
  };
  utilidad_bruta: number;
  utilidad_bruta_pct: number;
  gastos_operativos: {
    nomina: GrupoDetalle;
    gastos_personal: GrupoDetalle;
    operacion: GrupoDetalle;
    servicios: GrupoDetalle;
    comisiones: GrupoDetalle;
    otros: GrupoDetalle & { alerta: boolean; alerta_mensaje: string | null };
    total: number;
    total_porcentaje: number;
  };
  ebitda: number;
  ebitda_pct: number;
  impuestos: { detalle: Record<string, number>; total: number };
  utilidad_neta: number;
  utilidad_neta_pct: number;
  food_cost_pct: number;
  beverage_cost_pct: number;
  advertencias: string[];
  gastos_sin_categorizar: number;
  dias_con_datos: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ROW_COLS = "1fr 130px 72px";

const HeaderRow = () => (
  <div style={{ display: "grid", gridTemplateColumns: ROW_COLS, padding: "10px 20px", background: "#0d0d0d", borderBottom: "1px solid #2a2a2a" }}>
    <span style={{ fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.08em" }}>CONCEPTO</span>
    <span style={{ fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.08em", textAlign: "right" }}>MONTO</span>
    <span style={{ fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.08em", textAlign: "right" }}>% VENTAS</span>
  </div>
);

// Detail line (leaf)
type DetailLineProps = { key?: React.Key; label: string; monto: number; pct: number; indent?: number; alert?: boolean; alertMsg?: string };
const DetailLine = ({ label, monto, pct, indent = 2, alert = false, alertMsg = "" }: DetailLineProps) => (
  <div style={{ display: "grid", gridTemplateColumns: ROW_COLS, padding: `5px 20px 5px ${indent * 12}px`, borderBottom: "1px solid #1a1a1a", alignItems: "center", background: "#0a0a0a" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "12px", color: "#777" }}>{label}</span>
      {alert && (
        <span title={alertMsg} style={{ cursor: "help", fontSize: "11px", background: "#450a0a", color: "#f87171", padding: "1px 6px", borderRadius: "6px", fontWeight: 700 }}>
          ⚠️ Excede 0.5%
        </span>
      )}
    </div>
    <span style={{ fontSize: "12px", color: "#aaa", textAlign: "right", fontFeatureSettings: "'tnum'" }}>{monto > 0 ? fmt(monto) : "—"}</span>
    <span style={{ fontSize: "11px", color: pct > 0 ? "#666" : "#333", textAlign: "right" }}>{pct > 0 ? pctFmt(pct) : "—"}</span>
  </div>
);

// Subtotal / group header (collapsible)
const GroupRow = ({ label, subtotal, pct, expanded, onToggle, colorOverride }: {
  label: string; subtotal: number; pct: number; expanded: boolean; onToggle: () => void; colorOverride?: string;
}) => (
  <div onClick={onToggle} style={{ display: "grid", gridTemplateColumns: ROW_COLS, padding: "9px 20px", borderBottom: "1px solid #222", alignItems: "center", cursor: "pointer", background: "#111", userSelect: "none" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "11px", color: "#555" }}>{expanded ? "▼" : "▶"}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: colorOverride || "#ccc" }}>{label}</span>
    </div>
    <span style={{ fontSize: "13px", fontWeight: 700, color: "#f87171", textAlign: "right", fontFeatureSettings: "'tnum'" }}>{subtotal > 0 ? fmt(subtotal) : "—"}</span>
    <span style={{ fontSize: "12px", fontWeight: 600, color: "#f87171", textAlign: "right" }}>{pct > 0 ? pctFmt(pct) : "—"}</span>
  </div>
);

// Section title bar
const SectionBar = ({ label, color = "#C8FF00" }: { label: string; color?: string }) => (
  <div style={{ padding: "8px 20px", background: "#161616", borderBottom: "1px solid #2a2a2a", borderTop: "1px solid #2a2a2a" }}>
    <span style={{ fontSize: "10px", fontWeight: 800, color, letterSpacing: "0.1em" }}>{label}</span>
  </div>
);

// Total highlight row
const TotalRow = ({ label, value, pctVal, color, big = false }: {
  label: string; value: number; pctVal: number; color: string; big?: boolean;
}) => (
  <div style={{ display: "grid", gridTemplateColumns: ROW_COLS, padding: big ? "16px 20px" : "12px 20px", background: big ? "#0f0f0f" : "#141414", borderBottom: "2px solid #2a2a2a", alignItems: "center" }}>
    <span style={{ fontSize: big ? "15px" : "13px", fontWeight: 800, color }}>{label}</span>
    <span style={{ fontSize: big ? "16px" : "14px", fontWeight: 800, color, textAlign: "right", fontFeatureSettings: "'tnum'" }}>{fmt(value)}</span>
    <span style={{ fontSize: big ? "13px" : "12px", fontWeight: 700, color, textAlign: "right" }}>{pctFmt(pctVal)}</span>
  </div>
);

// Collapsible group with detail lines
const CollapsibleGroup = ({
  label,
  grupo,
  ventas,
  open,
  onToggle,
  colorLabel,
  showAlerts = false,
}: {
  label: string;
  grupo: GrupoDetalle;
  ventas: number;
  open: boolean;
  onToggle: () => void;
  colorLabel?: string;
  showAlerts?: boolean;
}) => {
  const pct = (n: number) => ventas > 0 ? n / ventas * 100 : 0;
  const hasData = grupo.subtotal > 0 || Object.values(grupo.detalle).some((v) => v > 0);
  if (!hasData && !showAlerts) return null;
  return (
    <>
      <GroupRow label={label} subtotal={grupo.subtotal} pct={grupo.porcentaje} expanded={open} onToggle={onToggle} colorOverride={colorLabel} />
      {open && Object.entries(grupo.detalle).map(([line, monto]) => (
        <DetailLine
          key={line}
          label={line}
          monto={monto}
          pct={pct(monto)}
          indent={4}
          alert={showAlerts && (grupo as any).alerta && line === "OTROS"}
          alertMsg={String((grupo as any).alerta_mensaje || "")}
        />
      ))}
    </>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface EstadoResultadosProps {
  restauranteIdOverride?: number;
}

export const EstadoResultados = ({ restauranteIdOverride }: EstadoResultadosProps = {}) => {
  const { authUser } = useStore();
  const restauranteId = restauranteIdOverride ?? (authUser?.restaurante_id ?? 6);

  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(2026);
  const [data, setData] = useState<PL2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default all groups open
  const allGroups = ["food_cost", "beverage_cost", "nomina", "gastos_personal", "operacion", "servicios", "comisiones", "otros", "impuestos"];
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(allGroups.map((k) => [k, true]))
  );
  const toggle = (k: string) => setOpen((prev) => ({ ...prev, [k]: !prev[k] }));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await api.get(`/api/pl/${restauranteId}/v2/mes/${anio}/${mes}`);
        setData(resp as PL2);
      } catch (e: any) {
        setError(e?.message || "Error cargando P&L");
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mes, anio, restauranteId]);

  const v = data?.ventas || 0;
  const pct = (n: number) => (v > 0 ? n / v * 100 : 0);

  const fcColor = data ? healthColor(data.food_cost_pct, { green: 30, yellow: 35, higherIsBad: true }) : "#aaa";
  const bevColor = data ? healthColor(data.beverage_cost_pct, { green: 25, yellow: 28, higherIsBad: true }) : "#aaa";
  const ebitdaColor = data ? healthColor(data.ebitda_pct, { green: 15, yellow: 5 }) : "#aaa";
  const netaColor = data ? (data.utilidad_neta >= 0 ? "#4ade80" : "#f87171") : "#aaa";
  const brutaColor = data ? (data.utilidad_bruta >= 0 ? "#4ade80" : "#f87171") : "#aaa";

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", fontFamily: "Inter, sans-serif", color: "#fff", paddingBottom: "80px" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#C8FF00" }}>Estado de Resultados</h1>
          <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#555" }}>P&L mensual · {anio}</p>
        </div>
        {/* Month selector */}
        <div style={{ display: "flex", gap: "3px", background: "#111", borderRadius: "12px", padding: "4px", border: "1px solid #222", flexWrap: "wrap" }}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
            <button key={m} onClick={() => setMes(m)} style={{
              padding: "5px 9px", borderRadius: "8px", border: "none",
              background: mes === m ? "#C8FF00" : "transparent",
              color: mes === m ? "#000" : "#666",
              fontSize: "11px", fontWeight: 700, cursor: "pointer",
            }}>
              {MESES[m].slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading / error ─────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px", color: "#555" }}>Cargando {MESES[mes]}…</div>
      )}
      {error && !loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#f87171" }}>{error}</div>
      )}

      {/* ── KPI cards rápidas ───────────────────────────────────────────────── */}
      {data && !loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "16px" }}>
            <KPICard label="Ventas netas" value={fmt(v)} sub="100%" color="#4ade80" />
            <KPICard label="Food Cost %" value={pctFmt(data.food_cost_pct)} sub={fmt(data.costo_ventas.food_cost.subtotal)} color={fcColor} />
            <KPICard label="EBITDA" value={fmt(data.ebitda)} sub={pctFmt(data.ebitda_pct)} color={ebitdaColor} />
            <KPICard label="Utilidad neta" value={fmt(data.utilidad_neta)} sub={pctFmt(data.utilidad_neta_pct)} color={netaColor} />
          </div>

          {/* Advertencias */}
          {data.advertencias.length > 0 && (
            <div style={{ background: "#1c1400", border: "1px solid #854d0e", borderRadius: "10px", padding: "10px 16px", marginBottom: "12px" }}>
              {data.advertencias.map((a, i) => (
                <div key={i} style={{ fontSize: "12px", color: "#fbbf24", display: "flex", gap: "6px", alignItems: "center" }}>
                  <span>⚠️</span> {a}
                </div>
              ))}
            </div>
          )}

          {/* ── P&L Table ───────────────────────────────────────────────────── */}
          <div style={{ background: "#111", borderRadius: "16px", overflow: "hidden", border: "1px solid #1e1e1e" }}>
            <HeaderRow />

            {/* ── VENTAS ────────────────────────────────────── */}
            <SectionBar label="VENTAS TOTALES" color="#4ade80" />
            <div style={{ display: "grid", gridTemplateColumns: ROW_COLS, padding: "14px 20px", background: "#0c1a0c", borderBottom: "1px solid #1e3a1e", alignItems: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#4ade80" }}>Ventas netas</span>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "#4ade80", textAlign: "right", fontFeatureSettings: "'tnum'" }}>{fmt(v)}</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#4ade80", textAlign: "right" }}>100%</span>
            </div>
            {data.propinas_totales > 0 && (
              <DetailLine label="Propinas recibidas (informativo)" monto={data.propinas_totales} pct={pct(data.propinas_totales)} />
            )}

            {/* ── COSTO DE VENTAS ───────────────────────────── */}
            <SectionBar label="COSTO DE VENTAS" color="#fb923c" />

            {/* Food Cost */}
            <GroupRow
              label={`FOOD COST · ${pctFmt(data.food_cost_pct)}`}
              subtotal={data.costo_ventas.food_cost.subtotal}
              pct={data.food_cost_pct}
              expanded={open["food_cost"]}
              onToggle={() => toggle("food_cost")}
              colorOverride={fcColor}
            />
            {open["food_cost"] && Object.entries(data.costo_ventas.food_cost.detalle).map(([line, monto]) => (
              <DetailLine key={line} label={line} monto={monto as number} pct={pct(monto as number)} indent={4} />
            ))}

            {/* Beverage Cost */}
            <GroupRow
              label={`BEVERAGE COST · ${pctFmt(data.beverage_cost_pct)}`}
              subtotal={data.costo_ventas.beverage_cost.subtotal}
              pct={data.beverage_cost_pct}
              expanded={open["beverage_cost"]}
              onToggle={() => toggle("beverage_cost")}
              colorOverride={bevColor}
            />
            {open["beverage_cost"] && Object.entries(data.costo_ventas.beverage_cost.detalle).map(([line, monto]) => (
              <DetailLine key={line} label={line} monto={monto as number} pct={pct(monto as number)} indent={4} />
            ))}

            {/* Total CdV + Utilidad Bruta */}
            <TotalRow label="TOTAL COSTO DE VENTAS" value={data.costo_ventas.total} pctVal={data.costo_ventas.total_porcentaje} color="#fb923c" />
            <TotalRow label="UTILIDAD BRUTA" value={data.utilidad_bruta} pctVal={data.utilidad_bruta_pct} color={brutaColor} big />

            {/* ── GASTOS OPERATIVOS ─────────────────────────── */}
            <SectionBar label="GASTOS OPERATIVOS" color="#a78bfa" />

            <CollapsibleGroup label="NÓMINA" grupo={data.gastos_operativos.nomina} ventas={v} open={open["nomina"]} onToggle={() => toggle("nomina")} colorLabel="#e2e8f0" />
            <CollapsibleGroup label="GASTOS DE PERSONAL" grupo={data.gastos_operativos.gastos_personal} ventas={v} open={open["gastos_personal"]} onToggle={() => toggle("gastos_personal")} colorLabel="#e2e8f0" showAlerts />
            <CollapsibleGroup label="OPERACIÓN" grupo={data.gastos_operativos.operacion} ventas={v} open={open["operacion"]} onToggle={() => toggle("operacion")} colorLabel="#e2e8f0" />
            <CollapsibleGroup label="SERVICIOS" grupo={data.gastos_operativos.servicios} ventas={v} open={open["servicios"]} onToggle={() => toggle("servicios")} colorLabel="#e2e8f0" />
            <CollapsibleGroup label="COMISIONES" grupo={data.gastos_operativos.comisiones} ventas={v} open={open["comisiones"]} onToggle={() => toggle("comisiones")} colorLabel="#e2e8f0" />

            {/* OTROS con alerta */}
            <GroupRow
              label={`OTROS${data.gastos_operativos.otros.alerta ? " ⚠️" : ""}`}
              subtotal={data.gastos_operativos.otros.subtotal}
              pct={data.gastos_operativos.otros.porcentaje}
              expanded={open["otros"]}
              onToggle={() => toggle("otros")}
              colorOverride={data.gastos_operativos.otros.alerta ? "#f87171" : "#ccc"}
            />
            {open["otros"] && (
              <DetailLine
                label="OTROS"
                monto={data.gastos_operativos.otros.subtotal}
                pct={pct(data.gastos_operativos.otros.subtotal)}
                indent={4}
                alert={data.gastos_operativos.otros.alerta}
                alertMsg={data.gastos_operativos.otros.alerta_mensaje || ""}
              />
            )}

            <TotalRow label="TOTAL GASTOS OPERATIVOS" value={data.gastos_operativos.total} pctVal={data.gastos_operativos.total_porcentaje} color="#a78bfa" />

            {/* ── EBITDA ───────────────────────────────────── */}
            <TotalRow label="EBITDA" value={data.ebitda} pctVal={data.ebitda_pct} color={ebitdaColor} big />

            {/* ── IMPUESTOS ────────────────────────────────── */}
            {data.impuestos.total > 0 && (
              <>
                <SectionBar label="IMPUESTOS" color="#f472b6" />
                <GroupRow
                  label="IMPUESTOS"
                  subtotal={data.impuestos.total}
                  pct={pct(data.impuestos.total)}
                  expanded={open["impuestos"]}
                  onToggle={() => toggle("impuestos")}
                  colorOverride="#f472b6"
                />
                {open["impuestos"] && Object.entries(data.impuestos.detalle).map(([line, monto]) => (
                  <DetailLine key={line} label={line} monto={monto as number} pct={pct(monto as number)} indent={4} />
                ))}
                <TotalRow label="TOTAL IMPUESTOS" value={data.impuestos.total} pctVal={pct(data.impuestos.total)} color="#f472b6" />
              </>
            )}

            {/* ── UTILIDAD NETA ─────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: ROW_COLS, padding: "20px 20px", background: data.utilidad_neta >= 0 ? "#071a0d" : "#1a0707", alignItems: "center" }}>
              <span style={{ fontSize: "16px", fontWeight: 900, color: netaColor }}>UTILIDAD NETA</span>
              <span style={{ fontSize: "18px", fontWeight: 900, color: netaColor, textAlign: "right", fontFeatureSettings: "'tnum'" }}>{fmt(data.utilidad_neta)}</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: netaColor, textAlign: "right" }}>{pctFmt(data.utilidad_neta_pct)}</span>
            </div>
          </div>

          {/* ── Summary card ─────────────────────────────────────────────────── */}
          <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "16px", padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", marginTop: "16px" }}>
            <SummaryMetric label="UTILIDAD NETA" value={fmt(data.utilidad_neta)} color={netaColor} sub={MESES[mes].toUpperCase()} />
            <SummaryMetric label="FOOD COST %" value={pctFmt(data.food_cost_pct)} color={fcColor} sub={`${pctFmt(data.costo_ventas.total_porcentaje)} costo total`} />
            <SummaryMetric label="EBITDA %" value={pctFmt(data.ebitda_pct)} color={ebitdaColor} sub={fmt(data.ebitda)} />
          </div>

          {/* ── Color legend ─────────────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: "16px", marginTop: "12px", flexWrap: "wrap" }}>
            <LegendItem color="#4ade80" label="Food Cost <30% · EBITDA >15% · Utilidad +0%" />
            <LegendItem color="#facc15" label="Food Cost 30-35% · EBITDA 5-15%" />
            <LegendItem color="#f87171" label="Food Cost >35% · EBITDA <5% · Pérdida" />
          </div>
        </>
      )}
    </div>
  );
};

// ─── Mini helpers ─────────────────────────────────────────────────────────────

const KPICard = ({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) => (
  <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "14px 16px" }}>
    <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>{label}</div>
    <div style={{ fontSize: "18px", fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: "11px", color: "#444", marginTop: "2px" }}>{sub}</div>
  </div>
);

const SummaryMetric = ({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) => (
  <div>
    <div style={{ fontSize: "10px", color: "#555", letterSpacing: "0.08em" }}>{label}</div>
    <div style={{ fontSize: "26px", fontWeight: 900, color, marginTop: "4px" }}>{value}</div>
    <div style={{ fontSize: "12px", color: "#555" }}>{sub}</div>
  </div>
);

const LegendItem = ({ color, label }: { color: string; label: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: color, flexShrink: 0 }} />
    <span style={{ fontSize: "11px", color: "#555" }}>{label}</span>
  </div>
);
