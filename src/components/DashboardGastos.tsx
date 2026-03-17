import { useState, useEffect, useMemo } from "react";
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, DollarSign, Calendar, Filter, PieChart } from "lucide-react";
import { api } from "../services/api";

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const pct = (n: number, total: number) => total > 0 ? ((n / total) * 100).toFixed(1) + "%" : "0%";
const pctNum = (n: number, total: number) => total > 0 ? (n / total) * 100 : 0;

interface CatBenchmark {
  categoria: string;
  label: string;
  min: number;
  max: number;
  esMP: boolean;
}

const BENCHMARKS: CatBenchmark[] = [
  { categoria: "PROTEINA", label: "Proteina", min: 8, max: 12, esMP: true },
  { categoria: "VEGETALES_FRUTAS", label: "Vegetales y Frutas", min: 2, max: 4, esMP: true },
  { categoria: "ABARROTES", label: "Abarrotes", min: 2, max: 4, esMP: true },
  { categoria: "BEBIDAS", label: "Bebidas", min: 3, max: 5, esMP: true },
  { categoria: "PRODUCTOS_ASIATICOS", label: "Productos Asiaticos", min: 3, max: 5, esMP: true },
  { categoria: "DESECHABLES_EMPAQUES", label: "Desechables y Empaques", min: 2, max: 3, esMP: false },
  { categoria: "LIMPIEZA_MANTTO", label: "Limpieza y Mantto", min: 1, max: 2, esMP: false },
  { categoria: "UTENSILIOS", label: "Utensilios", min: 1, max: 2, esMP: false },
  { categoria: "PERSONAL", label: "Personal", min: 3, max: 5, esMP: false },
  { categoria: "PROPINAS", label: "Propinas", min: 0, max: 0, esMP: false },
  { categoria: "SERVICIOS", label: "Servicios", min: 1, max: 2, esMP: false },
  { categoria: "EQUIPO", label: "Equipo", min: 1, max: 2, esMP: false },
  { categoria: "MARKETING", label: "Marketing", min: 2, max: 4, esMP: false },
  { categoria: "PAPELERIA", label: "Papeleria", min: 0, max: 1, esMP: false },
  { categoria: "RENTA", label: "Renta", min: 8, max: 12, esMP: false },
  { categoria: "LUZ", label: "Luz", min: 2, max: 4, esMP: false },
  { categoria: "SOFTWARE", label: "Software", min: 0, max: 1, esMP: false },
  { categoria: "COMISIONES_BANCARIAS", label: "Comisiones Bancarias", min: 0, max: 1, esMP: false },
  { categoria: "IMPUESTOS", label: "Impuestos", min: 0, max: 0, esMP: false },
  { categoria: "NOMINA", label: "Nomina", min: 0, max: 0, esMP: false },
  { categoria: "COMISIONES_PLATAFORMAS", label: "Comisiones Plataformas", min: 0, max: 0, esMP: false },
  { categoria: "OTROS", label: "Otros", min: 0, max: 0, esMP: false },
];

const MESES = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" }, { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" }, { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" }, { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" }, { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

function getStatus(pctVal: number, min: number, max: number): { label: string; color: string; bg: string; icon: any } {
  if (min === 0 && max === 0) return { label: "-", color: "#9CA3AF", bg: "transparent", icon: null };
  if (pctVal === 0) return { label: "-", color: "#9CA3AF", bg: "transparent", icon: null };
  if (pctVal >= min && pctVal <= max) return { label: "OK", color: "#059669", bg: "#ECFDF5", icon: CheckCircle };
  if (pctVal < min) return { label: "BAJO", color: "#2563EB", bg: "#EFF6FF", icon: TrendingDown };
  return { label: "ALTO", color: "#DC2626", bg: "#FEF2F2", icon: TrendingUp };
}

export const DashboardGastos = () => {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(2026);
  const [gastos, setGastos] = useState<any[]>([]);
  const [ventasMes, setVentasMes] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch gastos del mes
        const mesStr = String(mes).padStart(2, "0");
        const fechaInicio = anio + "-" + mesStr + "-01";
        const lastDay = new Date(anio, mes, 0).getDate();
        const fechaFin = anio + "-" + mesStr + "-" + String(lastDay).padStart(2, "0");
        const g = await api.get("/api/gastos?fecha_inicio=" + fechaInicio + "&fecha_fin=" + fechaFin);
        setGastos(Array.isArray(g) ? g : []);

        // Fetch ventas del mes
        try {
          const v = await api.get("/api/reportes/ventas-diarias?mes=" + mes + "&anio=" + anio);
          const totalV = Array.isArray(v) ? v.reduce((s: number, d: any) => s + (d.total || 0), 0) : 0;
          setVentasMes(totalV);
        } catch(e) { setVentasMes(0); }
      } catch(e) {
        setGastos([]);
      }
      setLoading(false);
    };
    fetchData();
  }, [mes, anio]);

  // Agrupar gastos por categoria
  const porCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    gastos.forEach((g: any) => {
      const cat = g.categoria || "OTROS";
      map[cat] = (map[cat] || 0) + (g.total || g.monto || 0);
    });
    return map;
  }, [gastos]);

  const totalGastos = Object.values(porCategoria).reduce((s, v) => s + v, 0);
  const totalMP = BENCHMARKS.filter(b => b.esMP).reduce((s, b) => s + (porCategoria[b.categoria] || 0), 0);
  const pctMP = pctNum(totalMP, ventasMes);
  const gastosAltos = BENCHMARKS.filter(b => {
    const p = pctNum(porCategoria[b.categoria] || 0, ventasMes);
    return b.max > 0 && p > b.max;
  }).length;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #3D1C1E 0%, #5C2D30 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PieChart style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Dashboard de Gastos</h1>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Analisis por categoria vs benchmark - % sobre venta</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select value={mes} onChange={e => setMes(parseInt(e.target.value))} style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "13px", fontWeight: "600", color: "#374151", background: "#FFF" }}>
            {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(parseInt(e.target.value))} style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "13px", fontWeight: "600", color: "#374151", background: "#FFF" }}>
            <option value={2026}>2026</option><option value={2025}>2025</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { l: "Ventas del Mes", v: formatMXN(ventasMes), s: MESES.find(m=>m.value===mes)?.label || "", icon: DollarSign, c: "#059669" },
          { l: "Total Gastos", v: formatMXN(totalGastos), s: pct(totalGastos, ventasMes) + " de ventas", icon: BarChart3, c: "#3D1C1E" },
          { l: "Materia Prima", v: formatMXN(totalMP), s: pctMP.toFixed(1) + "% (bench: 28-35%)", icon: TrendingUp, c: pctMP > 35 ? "#DC2626" : pctMP < 28 && totalMP > 0 ? "#2563EB" : "#059669" },
          { l: "Alertas", v: String(gastosAltos), s: gastosAltos > 0 ? "categorias sobre benchmark" : "todo en rango", icon: AlertTriangle, c: gastosAltos > 0 ? "#DC2626" : "#059669" },
        ].map((k, i) => {
          const Ic = k.icon;
          return (<div key={i} style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)", animation: "slideUp 0.3s ease " + (i * 0.05) + "s both" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{k.l}</span><Ic style={{ width: "16px", height: "16px", color: k.c, opacity: 0.7 }} /></div>
            <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginTop: "8px" }}>{k.v}</div>
            <span style={{ fontSize: "11px", color: k.c === "#DC2626" ? "#DC2626" : "#9CA3AF", fontWeight: k.c === "#DC2626" ? "700" : "400" }}>{k.s}</span>
          </div>);
        })}
      </div>

      {/* Tabla resumen por categoria */}
      <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)", marginBottom: "16px" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Resumen por Categoria</span>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>*% Venta = Gasto categoria / Ventas Totales del mes</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 120px 100px", padding: "10px 24px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
          {["Categoria", "Monto", "% Venta*", "Benchmark", "Status"].map(h => (
            <span key={h} style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
          ))}
        </div>

        {/* Materia Prima header */}
        <div style={{ padding: "8px 24px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
          <span style={{ fontSize: "12px", fontWeight: "800", color: "#3D1C1E" }}>MATERIA PRIMA</span>
        </div>

        {BENCHMARKS.filter(b => b.esMP).map((b, i) => {
          const monto = porCategoria[b.categoria] || 0;
          const p = pctNum(monto, ventasMes);
          const st = getStatus(p, b.min, b.max);
          const StIcon = st.icon;
          return (
            <div key={b.categoria} style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 120px 100px", padding: "10px 24px", borderBottom: "1px solid #F9FAFB", alignItems: "center", animation: "slideUp 0.2s ease " + (i * 0.03) + "s both" }}>
              <span style={{ fontSize: "13px", color: "#374151" }}>{b.label}</span>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", fontFeatureSettings: "'tnum'" }}>{formatMXN(monto)}</span>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>{monto > 0 ? p.toFixed(1) + "%" : "0.0%"}</span>
              <span style={{ fontSize: "12px", color: "#6B7280" }}>{b.min}%-{b.max}%</span>
              <div>{StIcon && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: st.bg, color: st.color }}><StIcon style={{ width: "12px", height: "12px" }} />{st.label}</span>}</div>
            </div>
          );
        })}

        {/* Total MP */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 120px 100px", padding: "10px 24px", background: "#FEF2F2", borderBottom: "1px solid #F3F4F6" }}>
          <span style={{ fontSize: "13px", fontWeight: "800", color: "#3D1C1E" }}>TOTAL MP</span>
          <span style={{ fontSize: "13px", fontWeight: "800", color: "#3D1C1E" }}>{formatMXN(totalMP)}</span>
          <span style={{ fontSize: "13px", fontWeight: "800", color: "#3D1C1E" }}>{pctMP.toFixed(1)}%</span>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#6B7280" }}>28%-35%</span>
          <div>{(() => { const s = getStatus(pctMP, 28, 35); const I = s.icon; return I ? <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: s.bg, color: s.color }}><I style={{ width: "12px", height: "12px" }} />{s.label}</span> : null; })()}</div>
        </div>

        {/* Gastos Operativos header */}
        <div style={{ padding: "8px 24px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
          <span style={{ fontSize: "12px", fontWeight: "800", color: "#3D1C1E" }}>GASTOS OPERATIVOS</span>
        </div>

        {BENCHMARKS.filter(b => !b.esMP).map((b, i) => {
          const monto = porCategoria[b.categoria] || 0;
          const p = pctNum(monto, ventasMes);
          const st = getStatus(p, b.min, b.max);
          const StIcon = st.icon;
          return (
            <div key={b.categoria} style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 120px 100px", padding: "10px 24px", borderBottom: "1px solid #F9FAFB", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#374151" }}>{b.label}</span>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", fontFeatureSettings: "'tnum'" }}>{formatMXN(monto)}</span>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>{monto > 0 ? p.toFixed(1) + "%" : "0.0%"}</span>
              <span style={{ fontSize: "12px", color: "#6B7280" }}>{b.min > 0 || b.max > 0 ? b.min + "%-" + b.max + "%" : "-"}</span>
              <div>{StIcon ? <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: st.bg, color: st.color }}><StIcon style={{ width: "12px", height: "12px" }} />{st.label}</span> : <span style={{ fontSize: "11px", color: "#9CA3AF" }}>-</span>}</div>
            </div>
          );
        })}

        {/* TOTAL GENERAL */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 120px 100px", padding: "14px 24px", background: "#3D1C1E", borderTop: "2px solid #3D1C1E" }}>
          <span style={{ fontSize: "14px", fontWeight: "900", color: "#FFF" }}>TOTAL GASTOS</span>
          <span style={{ fontSize: "14px", fontWeight: "900", color: "#C8FF00" }}>{formatMXN(totalGastos)}</span>
          <span style={{ fontSize: "14px", fontWeight: "900", color: "#C8FF00" }}>{pct(totalGastos, ventasMes)}</span>
          <span></span>
          <span></span>
        </div>
      </div>

      {/* Nota */}
      <div style={{ padding: "12px 20px", background: "#FFFBEB", borderRadius: "10px", border: "1px solid #FDE68A" }}>
        <p style={{ fontSize: "12px", color: "#92400E", margin: 0 }}>
          <strong>Nota:</strong> Los datos se alimentan automaticamente desde la seccion de Gastos & Proveedores. Ve registrando gastos para ver el analisis en tiempo real.
        </p>
      </div>
    </div>
  );
};
