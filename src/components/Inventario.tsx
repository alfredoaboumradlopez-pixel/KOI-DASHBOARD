import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Loader2, Plus, AlertTriangle, Package, CheckCircle } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export const Inventario: React.FC = () => {
  const [insumos, setInsumos] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", unidad: "kg", stock_actual: "", stock_minimo: "", precio_unitario: "", proveedor: "" });
  const unidades = ["kg","lt","pz","caja","bolsa","sobre","bote","botella"];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ins, al] = await Promise.all([api.get("/api/insumos"), api.get("/api/insumos/alertas")]);
      setInsumos(ins);
      setAlertas(al);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async () => {
    if (form.nombre === "" || form.stock_actual === "") { setError("Completa nombre y stock actual"); return; }
    setSaving(true); setError(null);
    try {
      await api.post("/api/insumos", {
        nombre: form.nombre, unidad: form.unidad,
        stock_actual: parseFloat(form.stock_actual) || 0,
        stock_minimo: parseFloat(form.stock_minimo) || 0,
        precio_unitario: parseFloat(form.precio_unitario) || 0,
        proveedor: form.proveedor || null,
      });
      setSuccess("Insumo registrado");
      setForm({ nombre: "", unidad: "kg", stock_actual: "", stock_minimo: "", precio_unitario: "", proveedor: "" });
      setShowForm(false);
      fetchData();
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario de Insumos</h1>
          <p className="text-sm text-slate-500 mt-1">Control de stock y alertas de reabastecimiento.</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Nuevo Insumo</button>
      </div>

      {alertas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="text-sm font-bold text-red-800">Alertas de Stock Bajo ({alertas.length})</h3>
          </div>
          <div className="space-y-2">
            {alertas.map((a: any) => (
              <div key={a.id} className="flex justify-between items-center bg-white rounded-lg px-4 py-2 border border-red-100">
                <span className="text-sm font-medium text-slate-900">{a.nombre}</span>
                <div className="text-sm">
                  <span className="text-red-600 font-mono font-bold">{a.stock_actual}</span>
                  <span className="text-slate-400"> / {a.stock_minimo} min</span>
                  <span className="text-red-500 ml-2">(faltan {a.deficit.toFixed(1)})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Total Insumos</div>
          <p className="text-2xl font-bold text-slate-900">{insumos.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Con Stock Bajo</div>
          <p className="text-2xl font-bold text-red-600">{alertas.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Valor Inventario</div>
          <p className="text-2xl font-bold text-indigo-600">{formatMXN(insumos.reduce((s: number, i: any) => s + (i.stock_actual * i.precio_unitario), 0))}</p>
        </div>
      </div>

      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Nuevo Insumo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-sm text-slate-500">Nombre</label>
              <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                placeholder="Ej: Salmon, Arroz..." className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Unidad de Medida</label>
              <select value={form.unidad} onChange={e => setForm({...form, unidad: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                {unidades.map(u => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div><label className="text-sm text-slate-500">Cantidad Actual</label>
              <div className="flex mt-1">
                <input type="number" step="0.1" value={form.stock_actual} onChange={e => setForm({...form, stock_actual: e.target.value})}
                  placeholder="0" className="w-full px-3 py-2 border border-slate-200 rounded-l-lg text-sm font-mono" />
                <span className="px-3 py-2 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg text-sm text-slate-500">{form.unidad}</span>
              </div></div>
            <div><label className="text-sm text-slate-500">Cantidad Minima</label>
              <div className="flex mt-1">
                <input type="number" step="0.1" value={form.stock_minimo} onChange={e => setForm({...form, stock_minimo: e.target.value})}
                  placeholder="0" className="w-full px-3 py-2 border border-slate-200 rounded-l-lg text-sm font-mono" />
                <span className="px-3 py-2 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg text-sm text-slate-500">{form.unidad}</span>
              </div></div>
            <div><label className="text-sm text-slate-500">Proveedor</label>
              <input value={form.proveedor} onChange={e => setForm({...form, proveedor: e.target.value})}
                placeholder="Opcional" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Precio Unitario $</label>
              <input type="number" step="0.01" value={form.precio_unitario} onChange={e => setForm({...form, precio_unitario: e.target.value})}
                placeholder="0.00" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">Inventario Actual</h2>
        </div>
        {insumos.length === 0 ? (
          <div className="p-8 text-center"><Package className="w-10 h-10 text-slate-300 mx-auto" /><p className="text-slate-400 mt-3">No hay insumos registrados</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {insumos.map((ins: any) => {
              const bajo = ins.stock_actual < ins.stock_minimo;
              return (
                <div key={ins.id} className={"px-6 py-3 flex items-center justify-between " + (bajo ? "bg-red-50" : "hover:bg-slate-50")}>
                  <div className="flex items-center gap-3">
                    {bajo ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Package className="w-4 h-4 text-slate-400" />}
                    <div>
                      <p className="text-sm font-medium text-slate-900">{ins.nombre}</p>
                      <p className="text-xs text-slate-400">{ins.proveedor || "Sin proveedor"} | {formatMXN(ins.precio_unitario)}/{ins.unidad}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={"text-sm font-mono font-bold " + (bajo ? "text-red-600" : "text-slate-900")}>{ins.stock_actual} {ins.unidad}</p>
                    <p className="text-xs text-slate-400">min: {ins.stock_minimo}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
