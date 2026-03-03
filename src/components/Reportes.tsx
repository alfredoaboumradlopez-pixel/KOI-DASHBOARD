import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Loader2, TrendingUp, BarChart3 } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const meses = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const coloresCanal: Record<string, string> = {
  Efectivo: "#10b981", Pay: "#3b82f6", Terminales: "#6366f1",
  "Uber Eats": "#22c55e", Rappi: "#f97316", Propinas: "#8b5cf6",
  Cortesias: "#ec4899", Otros: "#64748b"
};

export const Reportes: React.FC = () => {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [canales, setCanales] = useState<any>(null);
  const [ventasDiarias, setVentasDiarias] = useState<any[]>([]);
  const [ventasSemana, setVentasSemana] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.get("/api/reportes/ventas-por-canal?mes=" + mes + "&anio=" + anio),
        api.get("/api/reportes/ventas-diarias?mes=" + mes + "&anio=" + anio),
        api.get("/api/reportes/ventas-por-semana?mes=" + mes + "&anio=" + anio),
      ]);
      if (results[0].status === "fulfilled") setCanales(results[0].value);
      if (results[1].status === "fulfilled") setVentasDiarias(results[1].value);
      if (results[2].status === "fulfilled") setVentasSemana(results[2].value);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [mes, anio]);

  const diasConVentas = ventasDiarias.filter((v: any) => v.total > 0);
  const totalMes = diasConVentas.reduce((s: number, v: any) => s + v.total, 0);
  const promDiario = diasConVentas.length > 0 ? totalMes / diasConVentas.length : 0;
  const mejorDia = diasConVentas.length > 0 ? diasConVentas.reduce((best: any, v: any) => v.total > best.total ? v : best, diasConVentas[0]) : null;
  const peorDia = diasConVentas.length > 0 ? diasConVentas.reduce((worst: any, v: any) => v.total < worst.total ? v : worst, diasConVentas[0]) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes de Ventas</h1>
        <p className="text-sm text-slate-500 mt-1">Analisis por canal, tendencias diarias y semanales.</p>
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

      {!loading && diasConVentas.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm">No hay datos de ventas para {meses[mes]} {anio}</div>
      )}

      {!loading && diasConVentas.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Total del Mes</div>
              <p className="text-xl font-bold text-slate-900">{formatMXN(totalMes)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Promedio Diario</div>
              <p className="text-xl font-bold text-indigo-600">{formatMXN(promDiario)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Mejor Dia</div>
              <p className="text-xl font-bold text-emerald-600">{formatMXN(mejorDia.total)}</p>
              <p className="text-xs text-slate-400">{mejorDia.fecha}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Peor Dia</div>
              <p className="text-xl font-bold text-red-600">{formatMXN(peorDia.total)}</p>
              <p className="text-xs text-slate-400">{peorDia.fecha}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {canales && canales.canales && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-600" /> Ventas por Canal</h3>
                <div className="space-y-3">
                  {canales.canales.filter((c: any) => c.monto > 0).sort((a: any, b: any) => b.monto - a.monto).map((c: any) => {
                    const pct = totalMes > 0 ? (c.monto / totalMes * 100) : 0;
                    return (
                      <div key={c.nombre}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-700">{c.nombre}</span>
                          <span className="font-mono font-medium text-slate-900">{formatMXN(c.monto)} <span className="text-slate-400 text-xs">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full" style={{width: pct + "%", backgroundColor: coloresCanal[c.nombre] || "#64748b"}}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ventasSemana && ventasSemana.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /> Ventas por Semana</h3>
                <div className="space-y-3">
                  {ventasSemana.map((s: any, i: number) => {
                    const maxSemana = Math.max(...ventasSemana.map((x: any) => x.total));
                    const pct = maxSemana > 0 ? (s.total / maxSemana * 100) : 0;
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-700">Semana {s.semana}</span>
                          <span className="font-mono font-medium text-slate-900">{formatMXN(s.total)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full bg-emerald-500" style={{width: pct + "%"}}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Ventas Diarias - {meses[mes]} {anio}</h3>
            <div style={{display: "flex", alignItems: "flex-end", gap: "6px", height: "224px"}}>
              {diasConVentas.map((v: any, i: number) => {
                const max = Math.max(...diasConVentas.map((x: any) => x.total));
                const barHeight = max > 0 ? Math.max((v.total / max) * 200, 8) : 0;
                const esMejor = v.fecha === mejorDia.fecha;
                const esPeor = v.fecha === peorDia.fecha;
                const color = esMejor ? "#10b981" : esPeor ? "#f87171" : "#6366f1";
                return (
                  <div key={i} style={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", position: "relative"}} className="group">
                    <div className="hidden group-hover:block absolute bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10" style={{top: "-10px"}}>
                      {v.fecha}: {formatMXN(v.total)}
                    </div>
                    <div style={{width: "100%", height: barHeight + "px", backgroundColor: color, borderRadius: "4px 4px 0 0", transition: "opacity 0.2s"}} className="hover:opacity-80" />
                    <span style={{fontSize: "9px", color: "#94a3b8", marginTop: "4px"}}>{new Date(v.fecha + "T12:00:00").getDate()}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded-sm inline-block"></span> Mejor dia</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block"></span> Peor dia</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-500 rounded-sm inline-block"></span> Normal</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
