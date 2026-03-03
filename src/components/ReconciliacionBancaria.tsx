import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { Loader2, Upload, ArrowDownCircle, ArrowUpCircle, CheckCircle, Search, DollarSign } from "lucide-react";

const formatMXN = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export const ReconciliacionBancaria: React.FC = () => {
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchMovimientos = async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/banco/movimientos");
      setMovimientos(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchMovimientos(); }, []);

  const handleUpload = async (file: File) => {
    setUploading(true); setError(null); setSuccess(null);
    try {
      const result = await api.upload("/api/banco/upload", file);
      setSuccess("Se importaron " + (result.importados || result.total || 0) + " movimientos bancarios");
      fetchMovimientos();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) { setError("Error al procesar el PDF: " + (e.message || "formato no reconocido")); }
    setUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleUpload(e.target.files[0]);
  };

  const filtered = movimientos.filter((m: any) => {
    const matchTexto = filtro === "" || m.concepto?.toLowerCase().includes(filtro.toLowerCase()) || m.descripcion?.toLowerCase().includes(filtro.toLowerCase()) || m.referencia?.includes(filtro);
    const matchTipo = tipoFiltro === "todos" || (tipoFiltro === "cargos" && (m.tipo === "cargo" || m.tipo === "CARGO")) || (tipoFiltro === "abonos" && (m.tipo === "abono" || m.tipo === "ABONO"));
    return matchTexto && matchTipo;
  });

  const totalCargos = movimientos.filter((m: any) => m.tipo === "cargo" || m.tipo === "CARGO").reduce((s: number, m: any) => s + m.monto, 0);
  const totalAbonos = movimientos.filter((m: any) => m.tipo === "abono" || m.tipo === "ABONO").reduce((s: number, m: any) => s + m.monto, 0);
  const ultimoSaldo = movimientos.length > 0 ? movimientos[0].saldo : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reconciliacion Bancaria</h1>
          <p className="text-sm text-slate-500 mt-1">Sube tu consulta de movimientos de Santander (PDF).</p>
        </div>
        <div>
          <input ref={inputRef} type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Procesando..." : "Subir PDF Santander"}
          </button>
        </div>
      </div>

      {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Movimientos</div>
          <p className="text-2xl font-bold text-slate-900">{movimientos.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Total Cargos</div>
          <p className="text-2xl font-bold text-red-600">{formatMXN(totalCargos)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Total Abonos</div>
          <p className="text-2xl font-bold text-emerald-600">{formatMXN(totalAbonos)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Ultimo Saldo</div>
          <p className="text-2xl font-bold text-indigo-600">{ultimoSaldo !== null ? formatMXN(ultimoSaldo) : "Sin datos"}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={filtro} onChange={e => setFiltro(e.target.value)}
              placeholder="Buscar por concepto, descripcion o referencia..."
              className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
            <option value="todos">Todos</option>
            <option value="cargos">Solo Cargos</option>
            <option value="abonos">Solo Abonos</option>
          </select>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}

      {!loading && movimientos.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <DollarSign className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-slate-500 mt-3">No hay movimientos bancarios.</p>
          <p className="text-slate-400 text-sm mt-1">Sube tu consulta de movimientos de Santander en PDF para comenzar.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-800">Movimientos ({filtered.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {filtered.map((m: any) => (
              <div key={m.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  {(m.tipo === "cargo" || m.tipo === "CARGO") ? (
                    <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center"><ArrowUpCircle className="w-4 h-4 text-red-500" /></div>
                  ) : (
                    <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center"><ArrowDownCircle className="w-4 h-4 text-emerald-500" /></div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-900">{m.concepto || m.descripcion || "Sin concepto"}</p>
                    <p className="text-xs text-slate-400">{m.fecha} {m.hora || ""} | Ref: {m.referencia || "N/A"}{m.descripcion_larga ? " | " + m.descripcion_larga : ""}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={"text-sm font-mono font-bold " + ((m.tipo === "cargo" || m.tipo === "CARGO") ? "text-red-600" : "text-emerald-600")}>
                    {(m.tipo === "cargo" || m.tipo === "CARGO") ? "-" : "+"}{formatMXN(m.monto)}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">Saldo: {formatMXN(m.saldo)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
