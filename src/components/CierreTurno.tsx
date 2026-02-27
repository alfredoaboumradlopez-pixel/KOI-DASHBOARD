import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Plus, Trash2, CheckCircle, AlertTriangle, Loader2, Save } from "lucide-react";

const formatMXN = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

const CATEGORIAS = ["COMIDA_PERSONAL","PROPINAS","COMPRAS_INSUMOS","SERVICIOS","MANTENIMIENTO","LIMPIEZA","OTROS"];
const COMPROBANTES = ["VALE","SISTEMA","FACTURA","TICKET","SIN_COMPROBANTE"];

interface GastoItem { proveedor:string; clase:string; categoria:string; comprobante:string; descripcion:string; monto:string; }
interface PropinaItem { terminal:string; monto:string; }

export const CierreTurno: React.FC = () => {
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [responsable, setResponsable] = useState("");
  const [elaboradoPor, setElaboradoPor] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [ventasEfectivo, setVentasEfectivo] = useState("");
  const [efectivoFisico, setEfectivoFisico] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gastos, setGastos] = useState<GastoItem[]>([
    { proveedor:"KOI", clase:"NMP", categoria:"COMIDA_PERSONAL", comprobante:"VALE", descripcion:"", monto:"" },
  ]);
  const [propinas, setPropinas] = useState<PropinaItem[]>([
    { terminal:"PARROT", monto:"" },
    { terminal:"CLIP", monto:"" },
    { terminal:"GETNET", monto:"" },
  ]);

  useEffect(() => {
    const fetchSaldo = async () => {
      try {
        const data = await api.get("/api/cierre-turno/ultimo-saldo/final");
        if (data.saldo > 0) setSaldoInicial(data.saldo.toString());
      } catch (e) { console.log("No hay saldo previo"); }
    };
    fetchSaldo();
  }, []);

  const addGasto = () => setGastos([...gastos, { proveedor:"KOI", clase:"NMP", categoria:"COMIDA_PERSONAL", comprobante:"VALE", descripcion:"", monto:"" }]);
  const removeGasto = (idx: number) => { if (gastos.length > 1) setGastos(gastos.filter((_, i) => i !== idx)); };
  const updateGasto = (idx: number, field: string, value: string) => { const u = [...gastos]; (u[idx] as any)[field] = value; setGastos(u); };
  const updatePropina = (idx: number, value: string) => { const u = [...propinas]; u[idx].monto = value; setPropinas(u); };

  const totalGastos = gastos.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
  const totalPropinas = propinas.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const si = parseFloat(saldoInicial) || 0;
  const ve = parseFloat(ventasEfectivo) || 0;
  const saldoEsperado = si + ve - totalGastos - totalPropinas;
  const ef = parseFloat(efectivoFisico);
  const hayConteo = String(efectivoFisico).length > 0 && ef === ef;
  const diferencia = hayConteo ? ef - saldoEsperado : null;

  const handleSubmit = async () => {
    setError(null); setSuccess(null);
    if (responsable === "" || elaboradoPor === "") { setError("Completa el responsable y quien elabora"); return; }
    if (si <= 0) { setError("El saldo inicial debe ser mayor a 0"); return; }
    setLoading(true);
    try {
      await api.post("/api/cierre-turno", {
        fecha, responsable, elaborado_por: elaboradoPor, saldo_inicial: si, ventas_efectivo: ve,
        gastos: gastos.filter(g => parseFloat(g.monto) > 0).map(g => ({...g, monto: parseFloat(g.monto)})),
        propinas: propinas.filter(p => parseFloat(p.monto) > 0).map(p => ({terminal: p.terminal, monto: parseFloat(p.monto)})),
        efectivo_fisico: hayConteo ? ef : null, notas: notas || null,
      });
      setSuccess("Cierre de turno registrado exitosamente");
    } catch (e: any) { setError(e.message || "Error al guardar"); }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Cierre de Turno</h1>
        <p className="text-sm text-slate-500 mt-1">Bitacora digital de gastos en efectivo del dia.</p></div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="text-sm font-medium text-slate-500">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="text-sm font-medium text-slate-500">Responsable</label>
            <input value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Ej: ANAIS" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="text-sm font-medium text-slate-500">Elaborada por</label>
            <input value={elaboradoPor} onChange={e => setElaboradoPor(e.target.value)} placeholder="Ej: SEBASTIAN" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
        </div></div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Gastos del Dia</h2>
          <button onClick={addGasto} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Agregar</button>
        </div>
        {gastos.map((g, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end border-b border-slate-100 pb-3">
            <div className="col-span-2"><label className="text-xs text-slate-500">Proveedor</label>
              <input value={g.proveedor} onChange={e => updateGasto(i,"proveedor",e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-500">Categoria</label>
              <select value={g.categoria} onChange={e => updateGasto(i,"categoria",e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}</select></div>
            <div className="col-span-2"><label className="text-xs text-slate-500">Comprobante</label>
              <select value={g.comprobante} onChange={e => updateGasto(i,"comprobante",e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                {COMPROBANTES.map(c => <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}</select></div>
            <div className="col-span-3"><label className="text-xs text-slate-500">Descripcion</label>
              <input value={g.descripcion} onChange={e => updateGasto(i,"descripcion",e.target.value)} placeholder="Detalle" className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-500">Monto $</label>
              <input type="number" step="0.01" value={g.monto} onChange={e => updateGasto(i,"monto",e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm font-mono" /></div>
            <div className="col-span-1 flex justify-center"><button onClick={() => removeGasto(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>
          </div>))}
        <div className="text-right text-sm text-slate-500">Total gastos: <span className="text-slate-900 font-mono font-bold">{formatMXN(totalGastos)}</span></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Propinas por Terminal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {propinas.map((p, i) => (
            <div key={i}><label className="text-sm font-medium text-slate-500">{p.terminal}</label>
              <div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input type="number" step="0.01" value={p.monto} onChange={e => updatePropina(i, e.target.value)} placeholder="0.00" className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" /></div></div>))}
        </div>
        <div className="text-right text-sm text-slate-500">Total propinas: <span className="text-slate-900 font-mono font-bold">{formatMXN(totalPropinas)}</span></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Cierre del Dia</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div><label className="text-sm text-slate-500">Saldo Inicial</label>
              <div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input type="number" step="0.01" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg font-mono" /></div></div>
            <div><label className="text-sm text-slate-500">Ventas en Efectivo</label>
              <div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input type="number" step="0.01" value={ventasEfectivo} onChange={e => setVentasEfectivo(e.target.value)} className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg font-mono" /></div></div>
            <div><label className="text-sm text-slate-500">Efectivo Fisico Contado</label>
              <div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input type="number" step="0.01" value={efectivoFisico} onChange={e => setEfectivoFisico(e.target.value)} placeholder="Contar la caja..." className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg font-mono" /></div></div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-200">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Saldo Inicial:</span><span className="font-mono">{formatMXN(si)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">(-) Total Gastos:</span><span className="text-red-600 font-mono">{formatMXN(totalGastos)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">(-) Propinas:</span><span className="text-red-600 font-mono">{formatMXN(totalPropinas)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">(+) Ventas Efectivo:</span><span className="text-emerald-600 font-mono">{formatMXN(ve)}</span></div>
            <div className="border-t border-slate-200 my-2"></div>
            <div className="flex justify-between text-base font-bold"><span>SALDO ESPERADO:</span><span className="text-indigo-600 font-mono">{formatMXN(saldoEsperado)}</span></div>
            {diferencia !== null && (<><div className="border-t border-slate-200 my-2"></div>
              <div className={"flex items-center gap-2 p-3 rounded-lg " + (Math.abs(diferencia) < 0.01 ? "bg-emerald-50 border border-emerald-200" : diferencia > 0 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200")}>
                {Math.abs(diferencia) < 0.01 ? (<><CheckCircle className="w-5 h-5 text-emerald-600" /><span className="text-emerald-700 font-bold">Caja Cuadrada</span></>) : (<><AlertTriangle className={"w-5 h-5 " + (diferencia > 0 ? "text-amber-600" : "text-red-600")} /><span className={"font-bold " + (diferencia > 0 ? "text-amber-700" : "text-red-700")}>{diferencia > 0 ? "Sobrante" : "Faltante"}: {formatMXN(Math.abs(diferencia))}</span></>)}
              </div></>)}
          </div>
        </div>
        <div><label className="text-sm text-slate-500">Notas / Incidencias</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Errores de meseros, devoluciones, cortesias..." className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}

      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={loading} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Guardar Cierre de Turno</button>
      </div>
    </div>
  );
};
