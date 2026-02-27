import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { ArrowUpRight, ArrowDownRight, DollarSign, Activity, TrendingUp, Loader2 } from "lucide-react";
import { useStore } from "./store/useStore";
import { CapturaGastos } from "./components/CapturaGastos";
import { ArqueoCaja } from "./components/ArqueoCaja";
import { CierreTurno } from "./components/CierreTurno";
import { api } from "./services/api";

const formatMXN = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboard, ventasDiarias] = await Promise.all([
          api.get("/api/dashboard/resumen"),
          api.get("/api/reportes/ventas-diarias?mes=2&anio=2026"),
        ]);
        setData(dashboard);
        setVentas(ventasDiarias);
      } catch (e) {
        console.error("Error cargando dashboard:", e);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard KOI</h1>
        <p className="text-sm text-slate-500 mt-1">Resumen financiero y operativo en tiempo real.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-500">Ventas del Mes</h3>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-slate-900">{formatMXN(data?.ventas_mes || 0)}</p>
            {data?.cambio_vs_ayer !== null && data?.cambio_vs_ayer !== undefined && (
              <div className="flex items-center gap-1 mt-2 text-sm">
                {data.cambio_vs_ayer >= 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-red-500" />
                )}
                <span className={data.cambio_vs_ayer >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                  {data.cambio_vs_ayer >= 0 ? "+" : ""}{data.cambio_vs_ayer.toFixed(1)}%
                </span>
                <span className="text-slate-400">vs ayer</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-500">Ventas Semana</h3>
            <div className="p-2 bg-indigo-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-slate-900">{formatMXN(data?.ventas_semana || 0)}</p>
            <div className="flex items-center gap-1 mt-2 text-sm">
              <span className="text-slate-400">Ventas hoy: {formatMXN(data?.ventas_hoy || 0)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-500">Estado de Caja</h3>
            <div className={`p-2 rounded-lg ${
              data?.estado_caja?.includes("CUADRADA") ? "bg-emerald-50" : 
              data?.estado_caja?.includes("FALTANTE") ? "bg-red-50" : "bg-slate-50"
            }`}>
              <Activity className={`w-5 h-5 ${
                data?.estado_caja?.includes("CUADRADA") ? "text-emerald-600" : 
                data?.estado_caja?.includes("FALTANTE") ? "text-red-600" : "text-slate-600"
              }`} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-slate-900">{data?.estado_caja || "Sin arqueo"}</p>
            <div className="flex items-center gap-1 mt-2 text-sm">
              <span className="text-slate-400">
                {data?.ultimo_arqueo ? `Ultimo: ${data.ultimo_arqueo}` : "No hay cierres registrados"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {ventas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-medium text-slate-500 mb-4">Ventas Diarias - Febrero 2026</h3>
          <div className="flex items-end gap-1 h-48">
            {ventas.map((v: any, i: number) => {
              const max = Math.max(...ventas.map((x: any) => x.total));
              const height = max > 0 ? (v.total / max) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="hidden group-hover:block absolute -top-8 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {v.fecha}: {formatMXN(v.total)}
                  </div>
                  <div
                    className="w-full bg-indigo-500 rounded-t hover:bg-indigo-400 transition-colors"
                    style={{ height: `${height}%`, minHeight: v.total > 0 ? "4px" : "0px" }}
                  />
                  <span className="text-[9px] text-slate-400">{new Date(v.fecha + "T12:00:00").getDate()}</span>
                </div>
              );
            })}
          </div>
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
      {currentRoute === "/cuentas" && (
        <div className="flex items-center justify-center h-full">
          <p className="text-slate-500">Modulo de Cuentas por Pagar (En construccion)</p>
        </div>
      )}
      {currentRoute === "/pl" && (
        <div className="flex items-center justify-center h-full">
          <p className="text-slate-500">Estado de Resultados (Proximamente)</p>
        </div>
      )}
      {currentRoute === "/distribucion" && (
        <div className="flex items-center justify-center h-full">
          <p className="text-slate-500">Distribucion de Utilidades (Proximamente)</p>
        </div>
      )}
    </Layout>
  );
}
