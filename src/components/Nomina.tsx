import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Loader2, Plus, CheckCircle, Users, DollarSign } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export const Nomina: React.FC = () => {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormEmp, setShowFormEmp] = useState(false);
  const [showFormPago, setShowFormPago] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newEmp, setNewEmp] = useState({ nombre: "", puesto: "", salario_base: "", fecha_ingreso: "" });
  const [newPago, setNewPago] = useState({ empleado_id: "", periodo_inicio: "", periodo_fin: "", salario_base: "", horas_extra: "0", deducciones: "0", neto_pagado: "", fecha_pago: new Date().toISOString().split("T")[0] });

  const fetchData = async () => {
    setLoading(true);
    try { setEmpleados(await api.get("/api/empleados")); } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddEmp = async () => {
    if (newEmp.nombre === "" || newEmp.puesto === "" || newEmp.salario_base === "" || newEmp.fecha_ingreso === "") {
      setError("Completa todos los campos"); return; }
    setSaving(true); setError(null);
    try {
      await api.post("/api/empleados", { ...newEmp, salario_base: parseFloat(newEmp.salario_base) });
      setSuccess("Empleado registrado");
      setNewEmp({ nombre: "", puesto: "", salario_base: "", fecha_ingreso: "" });
      setShowFormEmp(false);
      fetchData();
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const selectEmp = (id: string) => {
    const emp = empleados.find((e: any) => e.id === Number(id));
    if (emp) {
      setNewPago({...newPago, empleado_id: id, salario_base: String(emp.salario_base), neto_pagado: String(emp.salario_base)});
    } else {
      setNewPago({...newPago, empleado_id: id});
    }
  };

  const calcNeto = () => {
    const base = parseFloat(newPago.salario_base) || 0;
    const extra = parseFloat(newPago.horas_extra) || 0;
    const ded = parseFloat(newPago.deducciones) || 0;
    return base + extra - ded;
  };

  const handleAddPago = async () => {
    if (newPago.empleado_id === "" || newPago.periodo_inicio === "" || newPago.periodo_fin === "") {
      setError("Completa todos los campos requeridos"); return; }
    setSaving(true); setError(null);
    try {
      const neto = calcNeto();
      await api.post("/api/nomina", {
        empleado_id: Number(newPago.empleado_id),
        periodo_inicio: newPago.periodo_inicio,
        periodo_fin: newPago.periodo_fin,
        salario_base: parseFloat(newPago.salario_base) || 0,
        horas_extra: parseFloat(newPago.horas_extra) || 0,
        deducciones: parseFloat(newPago.deducciones) || 0,
        neto_pagado: neto,
        fecha_pago: newPago.fecha_pago,
      });
      setSuccess("Pago de nomina registrado");
      setNewPago({ empleado_id: "", periodo_inicio: "", periodo_fin: "", salario_base: "", horas_extra: "0", deducciones: "0", neto_pagado: "", fecha_pago: new Date().toISOString().split("T")[0] });
      setShowFormPago(false);
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const totalNomina = empleados.reduce((s: number, e: any) => s + e.salario_base, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nomina y Empleados</h1>
          <p className="text-sm text-slate-500 mt-1">Gestion de personal y pagos.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowFormEmp(true); setShowFormPago(false); }}
            className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus className="w-4 h-4" /> Empleado</button>
          <button onClick={() => { setShowFormPago(true); setShowFormEmp(false); }}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <DollarSign className="w-4 h-4" /> Registrar Pago</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Empleados Activos</div>
          <p className="text-2xl font-bold text-indigo-600">{empleados.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Nomina Mensual Base</div>
          <p className="text-2xl font-bold text-slate-900">{formatMXN(totalNomina)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Costo por Empleado</div>
          <p className="text-2xl font-bold text-slate-900">{empleados.length > 0 ? formatMXN(totalNomina / empleados.length) : "$0"}</p>
        </div>
      </div>

      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {showFormEmp && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Nuevo Empleado</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-sm text-slate-500">Nombre Completo</label>
              <input value={newEmp.nombre} onChange={e => setNewEmp({...newEmp, nombre: e.target.value})}
                placeholder="Ej: Juan Perez" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Puesto</label>
              <input value={newEmp.puesto} onChange={e => setNewEmp({...newEmp, puesto: e.target.value})}
                placeholder="Ej: Mesero, Cocinero..." className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Salario Base Mensual $</label>
              <input type="number" step="0.01" value={newEmp.salario_base} onChange={e => setNewEmp({...newEmp, salario_base: e.target.value})}
                placeholder="0.00" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" /></div>
            <div><label className="text-sm text-slate-500">Fecha de Ingreso</label>
              <input type="date" value={newEmp.fecha_ingreso} onChange={e => setNewEmp({...newEmp, fecha_ingreso: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFormEmp(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
            <button onClick={handleAddEmp} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </div>
      )}

      {showFormPago && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Registrar Pago de Nomina</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-sm text-slate-500">Empleado</label>
              <select value={newPago.empleado_id} onChange={e => selectEmp(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Selecciona</option>
                {empleados.map((e: any) => <option key={e.id} value={e.id}>{e.nombre} - {e.puesto}</option>)}
              </select></div>
            <div><label className="text-sm text-slate-500">Fecha de Pago</label>
              <input type="date" value={newPago.fecha_pago} onChange={e => setNewPago({...newPago, fecha_pago: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Periodo Inicio</label>
              <input type="date" value={newPago.periodo_inicio} onChange={e => setNewPago({...newPago, periodo_inicio: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Periodo Fin</label>
              <input type="date" value={newPago.periodo_fin} onChange={e => setNewPago({...newPago, periodo_fin: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
            <div><label className="text-sm text-slate-500">Salario Base $</label>
              <input type="number" step="0.01" value={newPago.salario_base} onChange={e => setNewPago({...newPago, salario_base: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" /></div>
            <div><label className="text-sm text-slate-500">Horas Extra $</label>
              <input type="number" step="0.01" value={newPago.horas_extra} onChange={e => setNewPago({...newPago, horas_extra: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" /></div>
            <div><label className="text-sm text-slate-500">Deducciones $</label>
              <input type="number" step="0.01" value={newPago.deducciones} onChange={e => setNewPago({...newPago, deducciones: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" /></div>
            <div><label className="text-sm text-slate-500">Neto a Pagar</label>
              <div className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-indigo-600">
                {formatMXN(calcNeto())}
              </div></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFormPago(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
            <button onClick={handleAddPago} disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Guardando..." : "Registrar Pago"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-800">Empleados Activos</h2>
        </div>
        {empleados.length === 0 ? (
          <div className="p-8 text-center"><Users className="w-10 h-10 text-slate-300 mx-auto" /><p className="text-slate-400 mt-3">No hay empleados registrados</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {empleados.map((e: any) => (
              <div key={e.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-sm">{e.nombre.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{e.nombre}</p>
                    <p className="text-xs text-slate-400">{e.puesto} | Ingreso: {e.fecha_ingreso}</p>
                  </div>
                </div>
                <span className="text-sm font-mono font-bold text-slate-900">{formatMXN(e.salario_base)}/mes</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
