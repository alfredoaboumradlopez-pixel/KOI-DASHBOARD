import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Loader2, Plus, CheckCircle, AlertCircle, Clock, DollarSign } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

const CATEGORIAS = ["COMIDA_PERSONAL","PROPINAS","COMPRAS_INSUMOS","SERVICIOS","MANTENIMIENTO","LIMPIEZA","OTROS"];

export const CuentasPorPagar: React.FC = () => {
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormProv, setShowFormProv] = useState(false);
  const [showFormCuenta, setShowFormCuenta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newProv, setNewProv] = useState({ nombre: "", categoria_default: "COMPRAS_INSUMOS" });
  const [newCuenta, setNewCuenta] = useState({ proveedor_id: "", monto_total: "", fecha_vencimiento: "", descripcion: "" });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([
        api.get("/api/proveedores"),
        api.get("/api/gastos?fecha_inicio=2026-01-01&fecha_fin=2026-12-31"),
      ]);
      setProveedores(p);
      setCuentas(g);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddProv = async () => {
    if (newProv.nombre === "") return;
    setSaving(true); setError(null);
    try {
      await api.post("/api/proveedores", newProv);
      setSuccess("Proveedor registrado");
      setNewProv({ nombre: "", categoria_default: "COMPRAS_INSUMOS" });
      setShowFormProv(false);
      fetchData();
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleAddCuenta = async () => {
    const monto = parseFloat(newCuenta.monto_total);
    if (newCuenta.proveedor_id === "" || monto !== monto || monto <= 0 || newCuenta.fecha_vencimiento === "") {
      setError("Completa todos los campos");
      return;
    }
    setSaving(true); setError(null);
    try {
      await api.post("/api/gastos", {
        fecha: newCuenta.fecha_vencimiento,
        proveedor: proveedores.find((p: any) => p.id === Number(newCuenta.proveedor_id))?.nombre || "Desconocido",
        categoria: proveedores.find((p: any) => p.id === Number(newCuenta.proveedor_id))?.categoria_default || "OTROS",
        monto: monto,
        metodo_pago: "TRANSFERENCIA",
        descripcion: newCuenta.descripcion || null,
      });
      setSuccess("Cuenta registrada");
      setNewCuenta({ proveedor_id: "", monto_total: "", fecha_vencimiento: "", descripcion: "" });
      setShowFormCuenta(false);
      fetchData();
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const totalPendiente = cuentas.filter((c: any) => c.estado === "PENDIENTE").reduce((s: number, c: any) => s + c.monto, 0);
  const totalPagado = cuentas.filter((c: any) => c.estado === "PAGADO").reduce((s: number, c: any) => s + c.monto, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cuentas por Pagar</h1>
          <p className="text-sm text-slate-500 mt-1">Gastos registrados y proveedores.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowFormProv(true); setShowFormCuenta(false); }}
            className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus className="w-4 h-4" /> Proveedor</button>
          <button onClick={() => { setShowFormCuenta(true); setShowFormProv(false); }}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Nuevo Gasto</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Total Gastos</div>
          <p className="text-2xl font-bold text-slate-900">{formatMXN(totalPendiente + totalPagado)}</p>
          <p className="text-xs text-slate-400 mt-1">{cuentas.length} registros</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Proveedores</div>
          <p className="text-2xl font-bold text-indigo-600">{proveedores.length}</p>
          <p className="text-xs text-slate-400 mt-1">Activos</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Pendientes</div>
          <p className="text-2xl font-bold text-amber-600">{formatMXN(totalPendiente)}</p>
          <p className="text-xs text-slate-400 mt-1">{cuentas.filter((c: any) => c.estado === "PENDIENTE").length} por pagar</p>
        </div>
      </div>

      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {showFormProv && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Nuevo Proveedor</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-sm text-slate-500">Nombre</label>
              <input value={newProv.nombre} onChange={e => setNewProv({...newProv, nombre: e.target.value})}
                placeholder="Ej: Costco, Coca-Cola..." className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Categoria Default</label>
              <select value={newProv.categoria_default} onChange={e => setNewProv({...newProv, categoria_default: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFormProv(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
            <button onClick={handleAddProv} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </div>
      )}

      {showFormCuenta && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Nuevo Gasto / Cuenta por Pagar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-sm text-slate-500">Proveedor</label>
              <select value={newCuenta.proveedor_id} onChange={e => setNewCuenta({...newCuenta, proveedor_id: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Selecciona</option>
                {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select></div>
            <div><label className="text-sm text-slate-500">Monto $</label>
              <input type="number" step="0.01" value={newCuenta.monto_total} onChange={e => setNewCuenta({...newCuenta, monto_total: e.target.value})}
                placeholder="0.00" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" /></div>
            <div><label className="text-sm text-slate-500">Fecha</label>
              <input type="date" value={newCuenta.fecha_vencimiento} onChange={e => setNewCuenta({...newCuenta, fecha_vencimiento: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Descripcion</label>
              <input value={newCuenta.descripcion} onChange={e => setNewCuenta({...newCuenta, descripcion: e.target.value})}
                placeholder="Detalle opcional" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFormCuenta(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
            <button onClick={handleAddCuenta} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : "Registrar"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">Gastos Registrados</h2>
        </div>
        {cuentas.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No hay gastos registrados</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cuentas.map((c: any) => (
              <div key={c.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className={"w-8 h-8 rounded-full flex items-center justify-center " + (c.estado === "PENDIENTE" ? "bg-amber-50" : "bg-emerald-50")}>
                    {c.estado === "PENDIENTE" ? <Clock className="w-4 h-4 text-amber-600" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{c.proveedor}</p>
                    <p className="text-xs text-slate-400">{c.fecha} | {c.categoria.replace(/_/g, " ")} | {c.metodo_pago}{c.descripcion ? " | " + c.descripcion : ""}</p>
                  </div>
                </div>
                <span className="text-sm font-mono font-bold text-slate-900">{formatMXN(c.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {proveedores.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-800">Proveedores Registrados</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {proveedores.map((p: any) => (
              <div key={p.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.nombre}</p>
                  <p className="text-xs text-slate-400">{p.categoria_default.replace(/_/g, " ")}</p>
                </div>
                <span className={"text-xs px-2 py-1 rounded-full " + (p.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{p.activo ? "Activo" : "Inactivo"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
