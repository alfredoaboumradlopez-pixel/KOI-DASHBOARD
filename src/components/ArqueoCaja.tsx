import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Search, Trash2 } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export const ArqueoCaja: React.FC = () => {
  const [cierres, setCierres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear());

  const meses = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const fetchCierres = async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/cierre-turno?mes=" + filtroMes + "&anio=" + filtroAnio + "&limit=50");
      setCierres(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchCierres(); }, [filtroMes, filtroAnio]);

  const toggle = (id: number) => setExpandido(expandido === id ? null : id);

  const eliminarCierre = async (id: number) => {
    if (!confirm("Eliminar este cierre? Esta accion no se puede deshacer.")) return;
    try {
      await api.del("/api/cierre-turno/" + id);
      // Refrescar lista
      setCierres(prev => prev.filter(ci => ci.id !== id));
    } catch(e) { alert("Error al eliminar cierre"); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Arqueo de Caja</h1>
        <p className="text-sm text-slate-500 mt-1">Historial de cierres de turno y estado de caja.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-slate-500">Mes</label>
            <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}
              className="block w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              {meses.map((m, i) => i > 0 && <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Anio</label>
            <select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}
              className="block w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <div className="ml-auto pt-4">
            <span className="text-sm text-slate-500">{cierres.length} cierre{cierres.length !== 1 ? "s" : ""} encontrado{cierres.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}

      {cierres.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <Search className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-slate-500 mt-3">No hay cierres para {meses[filtroMes]} {filtroAnio}</p>
        </div>
      )}

      <div className="space-y-3">
        {cierres.map((c: any) => {
          const isOpen = expandido === c.id;
          const eliminarCierre = async (id: number) => {
    if (!confirm("Eliminar este cierre? Esta accion no se puede deshacer.")) return;
    try {
      await api.del("/api/cierre-turno/" + id);
      // Refrescar lista
      setCierres(prev => prev.filter(ci => ci.id !== id));
    } catch(e) { alert("Error al eliminar cierre"); }
  };

  return (
            <div key={c.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <button onClick={() => toggle(c.id)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  {c.estado === "CUADRADA" ? (
                    <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
                  ) : c.estado === "SOBRANTE" ? (
                    <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
                  ) : c.estado === "FALTANTE" ? (
                    <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                  ) : (
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center"><Search className="w-5 h-5 text-slate-400" /></div>
                  )}
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-900">{c.fecha}</p>
                    <p className="text-xs text-slate-500">Responsable: {c.responsable} | Elaboro: {c.elaborado_por}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold text-slate-900">{formatMXN(c.saldo_final_esperado)}</p>
                    <p className={"text-xs font-medium " + (c.estado === "CUADRADA" ? "text-emerald-600" : c.estado === "SOBRANTE" ? "text-amber-600" : c.estado === "FALTANTE" ? "text-red-600" : "text-slate-400")}>
                      {c.estado || "Sin arqueo"}{c.diferencia && c.diferencia !== 0 ? " (" + (c.diferencia > 0 ? "+" : "") + formatMXN(c.diferencia) + ")" : ""}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); eliminarCierre(c.id); }} className="p-1.5 rounded-lg hover:bg-red-50" title="Eliminar cierre"><Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" /></button>
                  {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </button>

              {isOpen && (
                <div className="px-6 pb-5 border-t border-slate-100 pt-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500">Saldo Inicial</p>
                      <p className="text-sm font-mono font-bold text-slate-900">{formatMXN(c.saldo_inicial)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500">Ventas Efectivo</p>
                      <p className="text-sm font-mono font-bold text-emerald-600">{formatMXN(c.ventas_efectivo)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500">Total Gastos</p>
                      <p className="text-sm font-mono font-bold text-red-600">{formatMXN(c.total_gastos)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500">Efectivo Fisico</p>
                      <p className="text-sm font-mono font-bold text-slate-900">{c.efectivo_fisico !== null ? formatMXN(c.efectivo_fisico) : "No contado"}</p>
                    </div>
                  </div>

                  {c.gastos && c.gastos.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Gastos del dia</h4>
                      <div className="bg-slate-50 rounded-lg overflow-hidden">
                        {c.gastos.map((g: any) => (
                          <div key={g.id} className="flex justify-between px-4 py-2 border-b border-slate-100 last:border-0 text-sm">
                            <div>
                              <span className="text-slate-700 font-medium">{g.proveedor}</span>
                              <span className="text-slate-400 ml-2">{g.categoria.replace(/_/g, " ")}</span>
                              {g.descripcion && <span className="text-slate-400 ml-2">- {g.descripcion}</span>}
                            </div>
                            <span className="font-mono text-red-600">{formatMXN(g.monto)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.propinas && c.propinas.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Propinas pagadas</h4>
                      <div className="flex gap-4">
                        {c.propinas.map((p: any) => (
                          <div key={p.id} className="bg-slate-50 rounded-lg px-4 py-2 text-sm">
                            <span className="text-slate-500">{p.terminal}: </span>
                            <span className="font-mono font-medium text-slate-900">{formatMXN(p.monto)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.notas && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Notas:</p>
                      <p className="text-sm text-amber-800">{c.notas}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
