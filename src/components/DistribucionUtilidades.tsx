import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Loader2, Users, DollarSign } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const meses = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const colores = ["bg-indigo-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-cyan-500"];

export const DistribucionUtilidades: React.FC = () => {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDist = async () => {
    setLoading(true); setError(null);
    try {
      const d = await api.get("/api/distribucion/" + mes + "/" + anio);
      setData(d);
    } catch (e: any) { setError("No hay datos para este periodo"); setData(null); }
    setLoading(false);
  };

  useEffect(() => { fetchDist(); }, [mes, anio]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Distribucion de Utilidades</h1>
        <p className="text-sm text-slate-500 mt-1">Reparto mensual entre los 5 socios de KOI.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-slate-500">Mes</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="block w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              {meses.map((m, i) => i > 0 && <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Anio</label>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))}
              className="block w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}
      {error && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Utilidad Neta</div>
              <p className={"text-2xl font-bold " + (data.utilidad_neta >= 0 ? "text-emerald-600" : "text-red-600")}>{formatMXN(data.utilidad_neta)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Saldo en Banco</div>
              <p className="text-2xl font-bold text-slate-900">{data.saldo_banco !== null ? formatMXN(data.saldo_banco) : "Sin datos"}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Saldo en Caja</div>
              <p className="text-2xl font-bold text-slate-900">{data.saldo_caja !== null ? formatMXN(data.saldo_caja) : "Sin datos"}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-900">Reparto - {meses[mes]} {anio}</h2>
            </div>
            <div className="space-y-4">
              {data.distribuciones && data.distribuciones.map((d: any, i: number) => (
                <div key={d.socio_nombre} className="flex items-center gap-4">
                  <div className={"w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm " + colores[i % colores.length]}>
                    {d.socio_nombre.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-medium text-slate-900">{d.socio_nombre}</span>
                      <span className="text-sm font-mono font-bold text-slate-900">{formatMXN(d.monto_calculado)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 mr-3">
                        <div className={colores[i % colores.length] + " h-2 rounded-full"} style={{width: d.porcentaje + "%"}}></div>
                      </div>
                      <span className="text-xs text-slate-500">{d.porcentaje}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {data.total_disponible !== null && (
              <div className="mt-6 pt-4 border-t border-slate-200">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-slate-900">Total Disponible (Banco + Caja)</span>
                  <span className="text-sm font-mono font-bold text-indigo-600">{formatMXN(data.total_disponible)}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
