import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Trash2, Edit2, Pencil, FileText as FileTextIcon, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { CuentasPorPagar } from "./CuentasPorPagar";

const CATEGORIAS = ["PROTEINA","VEGETALES_FRUTAS","ABARROTES","BEBIDAS","PRODUCTOS_ASIATICOS","DESECHABLES_EMPAQUES","LIMPIEZA_MANTTO","UTENSILIOS","PERSONAL","PROPINAS","SERVICIOS","EQUIPO","MARKETING","PAPELERIA","RENTA","LUZ","SOFTWARE","COMISIONES_BANCARIAS","IMPUESTOS","NOMINA","COMISIONES_PLATAFORMAS","OTROS"];

interface ExpenseFormData {
  fecha: string;
  proveedor: string;
  categoria: string;
  total: string;
  metodoPago: string;
  descripcion: string;
}

export const CapturaGastos: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [gastosLista, setGastosLista] = useState<any[]>([]);
  const [showNuevoGasto, setShowNuevoGasto] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editGasto, setEditGasto] = useState<any>(null);

  const iniciarEdicion = (g: any) => {
    setEditGasto({...g, total: g.total || g.monto || 0});
    setEditingId(g.id);
  };

  const guardarEdicion = async () => {
    if (!editGasto) return;
    try {
      await api.put("/api/gastos/" + editingId, {
        fecha: editGasto.fecha,
        proveedor: editGasto.proveedor,
        categoria: editGasto.categoria,
        monto: parseFloat(editGasto.total) || 0,
        metodo_pago: editGasto.metodo_pago || "EFECTIVO",
        descripcion: editGasto.descripcion || "",
      });
      setEditingId(null);
      setEditGasto(null);
      fetchGastos();
    } catch(e) { alert("Error al editar"); }
  };

  const cancelarEdicion = () => { setEditingId(null); setEditGasto(null); };

  const fetchGastos = async () => {
    try { const g = await api.get("/api/gastos"); setGastosLista(Array.isArray(g) ? g : []); } catch(e) {}
  };
  useEffect(() => { fetchGastos(); }, []);

  const eliminarGasto = async (id: number) => {
    if (!confirm("Eliminar este gasto?")) return;
    try { await api.del("/api/gastos/" + id); fetchGastos(); } catch(e) { alert("Error al eliminar"); }
  };

  const [tabGastos, setTabGastos] = useState<"gastos"|"proveedores">("gastos");
  const [proveedores, setProveedores] = useState<{id:number;nombre:string;categoria_default:string}[]>([]);

  useEffect(() => {
    const fetchProv = async () => {
      try {
        const data = await api.get("/api/proveedores");
        setProveedores(data);
      } catch(e) {}
    };
    fetchProv();
  }, []);

  const [formData, setFormData] = useState<ExpenseFormData>({
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    categoria: '',
    total: '',
    metodoPago: 'EFECTIVO',
    descripcion: '',
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setOcrState('processing');
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await api.upload('/api/gastos/ocr', selectedFile);
      setFormData({
        fecha: result.fecha || new Date().toISOString().split('T')[0],
        proveedor: result.proveedor || '',
        categoria: result.categoria || '',
        total: result.total ? String(result.total) : '',
        metodoPago: 'EFECTIVO',
        descripcion: result.descripcion || '',
      });
      setOcrState('success');
    } catch (e: any) {
      setOcrState('error');
      setError('No se pudo procesar el ticket. Puedes llenar los datos manualmente.');
      setOcrState('success');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const amount = parseFloat(formData.total);
    if (amount !== amount || amount <= 0) {
      setError('El monto total debe ser un numero mayor a cero.');
      return;
    }
    if (formData.proveedor === '' || formData.categoria === '') {
      setError('Completa todos los campos requeridos.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/gastos', {
        fecha: formData.fecha,
        proveedor: formData.proveedor,
        categoria: formData.categoria,
        monto: amount,
        metodo_pago: formData.metodoPago,
        descripcion: formData.descripcion || null,
      });
      setSuccessMsg('Gasto registrado exitosamente.');
      setTimeout(() => {
        setFile(null);
        setOcrState('idle');
        setSuccessMsg(null);
        setFormData({ fecha: new Date().toISOString().split('T')[0], proveedor: '', categoria: '', total: '', metodoPago: 'EFECTIVO', descripcion: '' });
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Error al guardar el gasto');
    }
    setSaving(false);
  };

  const handleManual = () => {
    setOcrState('success');
    setFile(null);
  };

  return (
    <div style={{maxWidth:"1200px", margin:"0 auto"}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"24px"}}>
        <div style={{display:"flex", alignItems:"center", gap:"12px"}}>
          <div style={{width:"40px", height:"40px", borderRadius:"12px", background:"linear-gradient(135deg, #3D1C1E 0%, #5C2D30 100%)", display:"flex", alignItems:"center", justifyContent:"center"}}>
            <FileText style={{width:"20px", height:"20px", color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px", fontWeight:"800", color:"#111827", margin:0}}>Gastos & Proveedores</h1>
            <p style={{fontSize:"13px", color:"#9CA3AF", margin:0}}>Facturas, gastos y gestion de proveedores</p>
          </div>
        </div>
      </div>

      <div style={{display:"flex", gap:"4px", background:"#FFF", borderRadius:"12px", padding:"4px", marginBottom:"20px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <button onClick={() => setTabGastos("gastos")} style={{flex:1, padding:"10px 16px", borderRadius:"10px", border:"none", cursor:"pointer", background:tabGastos==="gastos"?"#3D1C1E":"transparent", color:tabGastos==="gastos"?"#FFF":"#6B7280", fontSize:"13px", fontWeight:"600", transition:"all 0.15s"}}>Gastos</button>
        <button onClick={() => setTabGastos("proveedores")} style={{flex:1, padding:"10px 16px", borderRadius:"10px", border:"none", cursor:"pointer", background:tabGastos==="proveedores"?"#3D1C1E":"transparent", color:tabGastos==="proveedores"?"#FFF":"#6B7280", fontSize:"13px", fontWeight:"600", transition:"all 0.15s"}}>Proveedores</button>
      </div>

      {tabGastos === "proveedores" && <CuentasPorPagar />}
      {tabGastos === "gastos" && !showNuevoGasto && (
        <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
          <div style={{padding:"16px 24px",borderBottom:"1px solid #F3F4F6",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:"14px",fontWeight:"700",color:"#111827"}}>Gastos Registrados ({gastosLista.length})</span>
            <div style={{display:"flex",gap:"8px"}}>
              <button onClick={fetchGastos} style={{padding:"6px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",background:"#FFF",fontSize:"12px",color:"#6B7280",cursor:"pointer"}}>Actualizar</button>
              <button onClick={() => setShowNuevoGasto(true)} style={{padding:"6px 14px",borderRadius:"8px",border:"none",background:"#3D1C1E",color:"#C8FF00",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>+ Nuevo Gasto</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"90px 1fr 120px 120px 100px 80px",padding:"10px 24px",borderBottom:"1px solid #F3F4F6",background:"#FAFBFC"}}>
            {["Fecha","Proveedor","Categoria","Monto","Metodo",""].map(h => <span key={h} style={{fontSize:"11px",fontWeight:"700",color:"#9CA3AF",textTransform:"uppercase" as const}}>{h}</span>)}
          </div>
          {gastosLista.length === 0 ? (
            <div style={{padding:"40px",textAlign:"center" as const}}><p style={{fontSize:"13px",color:"#9CA3AF"}}>Sin gastos registrados</p></div>
          ) : gastosLista.map((g: any) => (
            <div key={g.id}>
              {editingId === g.id ? (
                <div style={{display:"grid",gridTemplateColumns:"90px 1fr 120px 120px 100px 80px",padding:"10px 24px",borderBottom:"1px solid #F3F4F6",alignItems:"center",background:"#FFFBEB"}}>
                  <input type="date" value={editGasto.fecha} onChange={e => setEditGasto({...editGasto, fecha: e.target.value})} style={{fontSize:"12px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB",width:"85px"}} />
                  <input value={editGasto.proveedor} onChange={e => setEditGasto({...editGasto, proveedor: e.target.value})} style={{fontSize:"12px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB"}} />
                  <select value={editGasto.categoria} onChange={e => setEditGasto({...editGasto, categoria: e.target.value})} style={{fontSize:"11px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB"}}>
                    {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat.replace(/_/g," ")}</option>)}
                  </select>
                  <input type="number" step="0.01" value={editGasto.total} onChange={e => setEditGasto({...editGasto, total: e.target.value})} style={{fontSize:"12px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB",width:"100px"}} />
                  <select value={editGasto.metodo_pago||"EFECTIVO"} onChange={e => setEditGasto({...editGasto, metodo_pago: e.target.value})} style={{fontSize:"11px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB"}}>
                    <option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option>
                  </select>
                  <div style={{display:"flex",gap:"2px"}}>
                    <button onClick={guardarEdicion} style={{border:"none",background:"#059669",color:"#FFF",borderRadius:"4px",padding:"4px 8px",fontSize:"10px",fontWeight:"700",cursor:"pointer"}}>OK</button>
                    <button onClick={cancelarEdicion} style={{border:"1px solid #E5E7EB",background:"#FFF",borderRadius:"4px",padding:"4px 6px",fontSize:"10px",cursor:"pointer"}}>X</button>
                  </div>
                </div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:"90px 1fr 120px 120px 100px 80px",padding:"10px 24px",borderBottom:"1px solid #F9FAFB",alignItems:"center"}}>
                  <span style={{fontSize:"12px",color:"#374151"}}>{g.fecha}</span>
                  <div><span style={{fontSize:"13px",fontWeight:"600",color:"#111827"}}>{g.proveedor}</span>{g.descripcion && <div style={{fontSize:"11px",color:"#9CA3AF"}}>{g.descripcion}</div>}</div>
                  <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",background:"#F3F4F6",color:"#374151"}}>{(g.categoria||"").replace(/_/g," ")}</span>
                  <span style={{fontSize:"13px",fontWeight:"700",color:"#111827"}}>${(g.total||g.monto||0).toLocaleString("es-MX",{minimumFractionDigits:2})}</span>
                  <span style={{fontSize:"11px",color:"#6B7280"}}>{(g.metodo_pago||"").replace(/_/g," ")}</span>
                  <div style={{display:"flex",gap:"4px"}}>
                    <button onClick={() => iniciarEdicion(g)} style={{border:"none",background:"none",cursor:"pointer",padding:"4px"}}><Edit2 style={{width:"14px",height:"14px",color:"#6B7280"}} /></button>
                    <button onClick={() => eliminarGasto(g.id)} style={{border:"none",background:"none",cursor:"pointer",padding:"4px"}}><Trash2 style={{width:"14px",height:"14px",color:"#DC2626"}} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {gastosLista.length > 0 && (
            <div style={{display:"grid",gridTemplateColumns:"90px 1fr 120px 120px 100px 80px",padding:"14px 24px",background:"#3D1C1E",borderTop:"2px solid #3D1C1E"}}>
              <span></span>
              <span style={{fontSize:"14px",fontWeight:"900",color:"#FFF"}}>TOTAL</span>
              <span></span>
              <span style={{fontSize:"14px",fontWeight:"900",color:"#C8FF00"}}>${gastosLista.reduce((s: number,g: any) => s+(g.total||g.monto||0),0).toLocaleString("es-MX",{minimumFractionDigits:2})}</span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      )}
      {tabGastos === "gastos" && showNuevoGasto && (
      <>
        <div style={{marginBottom:"12px"}}>
          <button onClick={() => { setShowNuevoGasto(false); fetchGastos(); }} style={{padding:"8px 16px",borderRadius:"8px",border:"1px solid #E5E7EB",background:"#FFF",fontSize:"12px",color:"#6B7280",cursor:"pointer"}}>← Volver a lista</button>
        </div>
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Captura de Gastos</h1>
        <p className="text-sm text-slate-500 mt-1">Sube un ticket para OCR o captura manualmente.</p>
      </div>

      {ocrState === 'idle' && (
        <>
          <div
            className={"relative border-2 border-dashed rounded-xl p-8 text-center transition-colors " + (dragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:bg-slate-50")}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
            <input ref={inputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleChange} />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center">
                <UploadCloud className="w-6 h-6" /></div>
              <div>
                <p className="text-sm font-medium text-slate-900">Arrastra y suelta tu ticket aqui</p>
                <p className="text-xs text-slate-500 mt-1">PNG, JPG o PDF hasta 5MB</p></div>
              <button onClick={() => inputRef.current?.click()}
                className="mt-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                Seleccionar archivo</button>
            </div>
          </div>
          <div className="text-center">
            <button onClick={handleManual} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              O captura manualmente sin ticket</button>
          </div>
        </>
      )}

      {ocrState === 'processing' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600 mt-3">Analizando documento con Gemini AI...</p>
        </div>
      )}

      {ocrState === 'success' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-800">{file ? "Datos Extraidos por OCR" : "Captura Manual"}</h2>
            </div>
            {file && <button onClick={() => { setFile(null); setOcrState('idle'); }}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Subir otro</button>}
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Fecha</label>
                <input type="date" name="fecha" value={formData.fecha} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required /></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Proveedor</label>
                <select name="proveedor" value={formData.proveedor} onChange={e => {
                  const val = e.target.value;
                  const prov = proveedores.find(p => p.nombre === val);
                  setFormData(prev => ({...prev, proveedor: val, ...(prov ? {categoria: prov.categoria_default} : {})}));
                }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </select>
                <input type="hidden" name="proveedor_fallback" value={formData.proveedor} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required /></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Categoria</label>
                <select name="categoria" value={formData.categoria} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" required>
                  <option value="">Selecciona</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
                </select></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Metodo de Pago</label>
                <select name="metodoPago" value={formData.metodoPago} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" required>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Descripcion</label>
                <input type="text" name="descripcion" value={formData.descripcion} onChange={handleInputChange}
                  placeholder="Descripcion breve" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Total $</label>
                <input type="number" step="0.01" name="total" value={formData.total} onChange={handleInputChange}
                  placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" required /></div>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{error}</div>}
            {successMsg && <div className="p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{successMsg}</div>}
            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button type="submit" disabled={saving}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Guardando..." : "Registrar Gasto"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
      </>)}
    </div>
  );

};
