import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { ArrowUpRight, ArrowDownRight, DollarSign, Activity, TrendingUp, Loader2, BarChart3 } from "lucide-react";
import { useStore } from "./store/useStore";
import { CapturaGastos } from "./components/CapturaGastos";
import { ArqueoCaja } from "./components/ArqueoCaja";
import { CierreTurno } from "./components/CierreTurno";
import { EstadoResultados } from "./components/EstadoResultados";
import { DistribucionUtilidades } from "./components/DistribucionUtilidades";
import { CuentasPorPagar } from "./components/CuentasPorPagar";
import { Inventario } from "./components/Inventario";
import { Nomina } from "./components/Nomina";
import { Reportes } from "./components/Reportes";
import { InvoiceFinder } from "./components/InvoiceFinder";
import { ReconciliacionBancaria } from "./components/ReconciliacionBancaria";
import { api } from "./services/api";

const formatMXN = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [ventasEnero, setVentasEnero] = useState<any[]>([]);
  const [ventasFebrero, setVentasFebrero] = useState<any[]>([]);
  const [canales, setCanales] = useState<any>(null);
  const [plEnero, setPlEnero] = useState<any>(null);
  const [plFebrero, setPlFebrero] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([
          api.get("/api/dashboard/resumen"),
          api.get("/api/reportes/ventas-diarias?mes=1&anio=2026"),
          api.get("/api/reportes/ventas-diarias?mes=2&anio=2026"),
          api.get("/api/reportes/ventas-por-canal?mes=2&anio=2026"),
          api.get("/api/pl/1/2026"),
          api.get("/api/pl/2/2026"),
        ]);
        if (results[0].status === "fulfilled") setData(results[0].value);
        if (results[1].status === "fulfilled") setVentasEnero(results[1].value);
        if (results[2].status === "fulfilled") setVentasFebrero(results[2].value);
        if (results[3].status === "fulfilled") setCanales(results[3].value);
        if (results[4].status === "fulfilled") setPlEnero(results[4].value);
        if (results[5].status === "fulfilled") setPlFebrero(results[5].value);
      } catch (e) { console.error("Error:", e); }
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  const ventasTotalEnero = ventasEnero.reduce((s: number, v: any) => s + (v.total || 0), 0);
  const ventasTotalFebrero = ventasFebrero.reduce((s: number, v: any) => s + (v.total || 0), 0);
  const cambioMes = ventasTotalEnero > 0 ? ((ventasTotalFebrero - ventasTotalEnero) / ventasTotalEnero * 100) : 0;

  const ventas = ventasFebrero.length > 0 ? ventasFebrero : ventasEnero;
  const mesLabel = ventasFebrero.length > 0 ? "Febrero" : "Enero";

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard KOI</h1>
        <p className="text-sm text-slate-500 mt-1">Resumen financiero y operativo.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div style={{background:"#fff",borderRadius:"16px",padding:"20px 24px",boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",border:"none",transition:"box-shadow 0.2s"}}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-500 uppercase">Ventas Enero</h3>
            <div className="p-1.5 bg-emerald-50 rounded-lg"><DollarSign className="w-4 h-4 text-emerald-600" /></div>
          </div>
          <p style={{fontSize:"28px",fontWeight:"800",color:"#1a1a1a",marginTop:"8px"}}>{formatMXN(ventasTotalEnero)}</p>
        </div>
        <div style={{background:"#fff",borderRadius:"16px",padding:"20px 24px",boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",border:"none",transition:"box-shadow 0.2s"}}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-500 uppercase">Ventas Febrero</h3>
            <div className="p-1.5 bg-indigo-50 rounded-lg"><TrendingUp className="w-4 h-4 text-indigo-600" /></div>
          </div>
          <p style={{fontSize:"28px",fontWeight:"800",color:"#1a1a1a",marginTop:"8px"}}>{formatMXN(ventasTotalFebrero)}</p>
          {ventasTotalEnero > 0 && (
            <div className="flex items-center gap-1 mt-1 text-xs">
              {cambioMes >= 0 ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
              <span className={cambioMes >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>{cambioMes >= 0 ? "+" : ""}{cambioMes.toFixed(1)}%</span>
              <span className="text-slate-400">vs enero</span>
            </div>
          )}
        </div>
        <div style={{background:"#fff",borderRadius:"16px",padding:"20px 24px",boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",border:"none",transition:"box-shadow 0.2s"}}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-500 uppercase">Utilidad Neta Feb</h3>
            <div className="p-1.5 bg-amber-50 rounded-lg"><BarChart3 className="w-4 h-4 text-amber-600" /></div>
          </div>
          <p className={"text-2xl font-bold mt-2 " + ((plFebrero?.utilidad_neta || 0) >= 0 ? "text-emerald-600" : "text-red-600")}>{formatMXN(plFebrero?.utilidad_neta || 0)}</p>
          {plFebrero?.ventas_totales > 0 && (
            <div className="text-xs text-slate-400 mt-1">Margen: {((plFebrero.utilidad_neta / plFebrero.ventas_totales) * 100).toFixed(1)}%</div>
          )}
        </div>
        <div style={{background:"#fff",borderRadius:"16px",padding:"20px 24px",boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",border:"none",transition:"box-shadow 0.2s"}}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-slate-500 uppercase">Estado Caja</h3>
            <div className={"p-1.5 rounded-lg " + (data?.estado_caja?.includes("CUADRADA") ? "bg-emerald-50" : data?.estado_caja?.includes("FALTANTE") ? "bg-red-50" : "bg-slate-50")}>
              <Activity className={"w-4 h-4 " + (data?.estado_caja?.includes("CUADRADA") ? "text-emerald-600" : data?.estado_caja?.includes("FALTANTE") ? "text-red-600" : "text-slate-600")} />
            </div>
          </div>
          <p style={{fontSize:"28px",fontWeight:"800",color:"#1a1a1a",marginTop:"8px"}}>{data?.estado_caja || "Sin arqueo"}</p>
          <div className="text-xs text-slate-400 mt-1">{data?.ultimo_arqueo ? "Ultimo: " + data.ultimo_arqueo : "Sin cierres"}</div>
        </div>
      </div>

      {ventas.length > 0 && (
        <div style={{backgrd:"#fff",borderRadius:"16px",padding:"24px",boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",border:"none"}}>
          <h3 className="text-sm font-medium text-slate-500 mb-4">Ventas Diarias - {mesLabel} 2026</h3>
          <div style={{display: "flex", alignItems: "flex-end", gap: "4px", height: "192px"}}>
            {ventas.filter((v: any) => v.total > 0).map((v: any, i: number) => {
              const diasConVentas = ventas.filter((x: any) => x.total > 0);
              const max = Math.max(...diasConVentas.map((x: any) => x.total));
              const barHeight = max > 0 ? Math.max((v.total / max) * 170, 6) : 0;
              return (
                <div key={i} style={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", position: "relative"}} className="group">
                  <div className="hidden group-hover:block absolute bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10" style={{top: "-10px"}}>{v.fecha}: {formatMXN(v.total)}</div>
                  <div style={{width: "100%", height: barHeight + "px", backgroundColor: "#6366f1", borderRadius: "4px 4px 0 0", transition: "opacity 0.2s"}} className="hover:opacity-80" />
                  <span style={{fontSize: "9px", color: "#94a3b8", marginTop: "4px"}}>{new Date(v.fecha + "T12:00:00").getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canales && canales.canales && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div style={{backgrd:"#fff",borderRadius:"16px",padding:"24px",boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",border:"none"}}>
            <h3 className="text-sm font-medium text-slate-500 mb-4">Ventas por Canal - Febrero</h3>
            <div className="space-y-3">
              {canales.canales.filter((c: any) => c.monto > 0).map((c: any) => {
                const total = canales.canales.reduce((s: number, x: any) => s + x.monto, 0);
                const pct = total > 0 ? (c.monto / total * 100) : 0;
                const colors: Record<string, string> = { Efectivo: "bg-emerald-500", Pay: "bg-blue-500", Terminales: "bg-indigo-500", "Uber Eats": "bg-green-500", Rappi: "bg-orange-500" };
                return (
                  <div key={c.nombre}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{c.nombre}</span>
                      <span className="text-slate-900 font-mono font-medium">{formatMXN(c.monto)} <span className="text-slate-400 text-xs">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={(colors[c.nombre] || "bg-slate-500") + " h-2 rounded-full"} style={{width: pct + "%"}}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {plEnero && plFebrero && (
            <div style={{backgrd:"#fff",borderRadius:"16px",padding:"24px",boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",border:"none"}}>
              <h3 className="text-sm font-medium text-slate-500 mb-4">Comparativo Ene vs Feb</h3>
              <div className="space-y-3">
                {[
                  { label: "Ventas", ene: plEnero.ventas_totales, feb: plFebrero.ventas_totales },
                  { label: "Costo Insumos", ene: plEnero.costo_insumos, feb: plFebrero.costo_insumos },
                  { label: "Gastos Op.", ene: plEnero.gastos_servicios + plEnero.gastos_renta + plEnero.gastos_mantenimiento, feb: plFebrero.gastos_servicios + plFebrero.gastos_renta + plFebrero.gastos_mantenimiento },
                  { label: "Utilidad Neta", ene: plEnero.utilidad_neta, feb: plFebrero.utilidad_neta },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <div className="flex gap-6">
                      <span className="text-xs text-slate-400 font-mono w-28 text-right">{formatMXN(row.ene)}</span>
                      <span className="text-sm text-slate-900 font-mono font-medium w-28 text-right">{formatMXN(row.feb)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end gap-6 text-xs text-slate-400 pt-1">
                  <span className="w-28 text-right">Enero</span>
                  <span className="w-28 text-right font-medium text-slate-600">Febrero</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { currentRoute } = useStore();
  return (
    <Layout>
      {currentRoute === "/" && <Dashboard />}
      {currentRoute === "/cierre-turno" && <CierreTurno />}
      {currentRoute === "/gastos" && <CapturaGastos />}
      {currentRoute === "/arqueo" && <ArqueoCaja />}
      {currentRoute === "/cuentas" && <CuentasPorPagar />}
      {currentRoute === "/inventario" && <Inventario />}
      {currentRoute === "/nomina" && <Nomina />}
      {currentRoute === "/pl" && <EstadoResultados />}
      {currentRoute === "/distribucion" && <DistribucionUtilidades />}
      {currentRoute === "/reportes" && <Reportes />}
      {currentRoute === "/banco" && <ReconciliacionBancaria />}
      {currentRoute === "/finder" && <InvoiceFinder />}
    </Layout>
  );
}
