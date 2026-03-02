import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Loader2, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

const meses = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export const EstadoResultados: React.FC = () => {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [pl, setPl] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPL = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get("/api/pl/" + mes + "/" + anio);
      setPl(data);
    } catch (e: any) {
      setError("No hay datos para este periodo");
      setPl(null);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPL(); }, [mes, anio]);

  const Row = ({ label, value, bold, color, indent }: { label: string; value: number; bold?: boolean; color?: string; indent?: boolean }) => (
    <div className={"flex justify-between py-2 " + (bold ? "font-bold border-t border-slate-200 pt-3" : "") + (indent ? " pl-6" : "")}>
      <span className={"text-sm " + (bold ? "text-slate-900" : "text-slate-600")}>{label}</span>
      <span className={"text-sm font-mono " + (color || (value >= 0 ? "text-slate-900" : "text-red-600"))}>{formatMXN(value)}</span>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Estado de Resultados</h1>
        <p className="text-sm text-slate-500 mt-1">P&L mensual calculado automaticamente.</p>
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

      {pl && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-2"><DollarSign className="w-4 h-4" /> Ventas Totales</div>
              <p className="text-2xl font-bold text-slate-900">{formatMXN(pl.ventas_totales)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-2"><TrendingUp className="w-4 h-4" /> Utilidad Bruta</div>
              <p className={"text-2xl font-bold " + (pl.utilidad_bruta >= 0 ? "text-emerald-600" : "text-red-600")}>{formatMXN(pl.utilidad_bruta)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">{pl.utilidad_neta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} Utilidad Neta</div>
              <p className={"text-2xl font-bold " + (pl.utilidad_neta >= 0 ? "text-emerald-600" : "text-red-600")}>{formatMXN(pl.utilidad_neta)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{meses[pl.mes]} {pl.anio}</h2>

            <div className="space-y-0">
              <Row label="Ventas Totales" value={pl.ventas_totales} bold color="text-slate-900" />

              <div className="mt-4 mb-1"><span className="text-xs font-semibold text-slate-400 uppercase">Costo de Ventas</span></div>
              <Row label="Compras de Insumos" value={-pl.costo_insumos} indent color="text-red-600" />
              <Row label="Utilidad Bruta" value={pl.utilidad_bruta} bold color={pl.utilidad_bruta >= 0 ? "text-emerald-600" : "text-red-600"} />

              <div className="mt-4 mb-1"><span className="text-xs font-semibold text-slate-400 uppercase">Gastos Operativos</span></div>
              <Row label="Servicios (luz, agua, gas)" value={-pl.gastos_servicios} indent color="text-red-600" />
              <Row label="Renta" value={-pl.gastos_renta} indent color="text-red-600" />
              <Row label="Mantenimiento" value={-pl.gastos_mantenimiento} indent color="text-red-600" />
              <Row label="Limpieza" value={-pl.gastos_limpieza} indent color="text-red-600" />
              <Row label="Comida de Personal" value={-pl.gastos_comida_personal} indent color="text-red-600" />
              <Row label="Otros Gastos" value={-pl.gastos_otros} indent color="text-red-600" />
              <Row label="Utilidad Operativa" value={pl.utilidad_operativa} bold color={pl.utilidad_operativa >= 0 ? "text-emerald-600" : "text-red-600"} />

              <div className="mt-4 mb-1"><span className="text-xs font-semibold text-slate-400 uppercase">Nomina e Impuestos</span></div>
              <Row label="Nomina" value={-pl.gastos_nomina} indent color="text-red-600" />
              <Row label="Impuestos" value={-pl.impuestos} indent color="text-red-600" />

              <div className="mt-2 pt-3 border-t-2 border-slate-300">
                <Row label="UTILIDAD NETA" value={pl.utilidad_neta} bold color={pl.utilidad_neta >= 0 ? "text-emerald-700" : "text-red-700"} />
              </div>
              {pl.ventas_totales > 0 && (
                <div className="text-right text-xs text-slate-400 mt-1">
                  Margen neto: {((pl.utilidad_neta / pl.ventas_totales) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
