import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, ChevronDown, ChevronUp, Trash2, Edit2, Pencil, FileText as FileTextIcon, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { CuentasPorPagar } from "./CuentasPorPagar";

const CATEGORIAS = ["PROTEINA","VEGETALES_FRUTAS","ABARROTES","BEBIDAS","PRODUCTOS_ASIATICOS","DESECHABLES_EMPAQUES","LIMPIEZA_MANTTO","UTENSILIOS","PERSONAL","PROPINAS","SERVICIOS","EQUIPO","MARKETING","PAPELERIA","RENTA","LUZ","SOFTWARE","COMISIONES_BANCARIAS","IMPUESTOS","NOMINA","COMISIONES_PLATAFORMAS","OTROS"];

interface ExpenseFormData {
  fecha: string;
  proveedor: string;
  categoria: string;
  total: string;
  metodoPago: string;
  comprobante: string;
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
  const [gastoRapido, setGastoRapido] = useState(false);
  const [rapidoProv, setRapidoProv] = useState<any>(null);
  const [rapidoMonto, setRapidoMonto] = useState("");
  const [rapidoDesc, setRapidoDesc] = useState("");
  const [rapidoComprobante, setRapidoComprobante] = useState("SIN_COMPROBANTE");
  const [rapidoMetodo, setRapidoMetodo] = useState("EFECTIVO");
  const [rapidoCategoria, setRapidoCategoria] = useState("");
  const [rapidoSaving, setRapidoSaving] = useState(false);
  const [rapidoSuccess, setRapidoSuccess] = useState(false);

  const selectRapidoProv = (p: any) => {
    setRapidoProv(p);
    setRapidoCategoria(p.categoria_default || "OTROS");
  };

  const guardarRapido = async () => {
    if (!rapidoProv || !rapidoMonto || parseFloat(rapidoMonto) <= 0) return;
    setRapidoSaving(true);
    try {
      await api.post("/api/gastos", {
        fecha: new Date().toISOString().split("T")[0],
        proveedor: rapidoProv.nombre,
        categoria: rapidoCategoria,
        monto: parseFloat(rapidoMonto),
        metodo_pago: rapidoMetodo,
        comprobante: rapidoComprobante,
        descripcion: rapidoDesc || null,
      });
      setRapidoSuccess(true);
      setRapidoMonto("");
      setRapidoDesc("");
      setTimeout(() => { setRapidoSuccess(false); }, 2000);
      fetchGastos();
    } catch(e) { alert("Error al guardar"); }
    setRapidoSaving(false);
  };
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const toggleDate = (fecha: string) => { setExpandedDates(prev => { const n = new Set(prev); n.has(fecha) ? n.delete(fecha) : n.add(fecha); return n; }); };

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

  const [lineasGasto, setLineasGasto] = useState([{ categoria: "", descripcion: "", monto: "" }]);

  const addLinea = () => setLineasGasto([...lineasGasto, { categoria: "", descripcion: "", monto: "" }]);
  const removeLinea = (i: number) => { if (lineasGasto.length > 1) setLineasGasto(lineasGasto.filter((_,idx) => idx !== i)); };
  const updateLinea = (i: number, field: string, value: string) => { const u = [...lineasGasto]; (u[i] as any)[field] = value; setLineasGasto(u); };

  const [formData, setFormData] = useState<ExpenseFormData>({
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    categoria: '',
    total: '',
    metodoPago: 'EFECTIVO',
    comprobante: '',
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
    const lineasValidas = lineasGasto.filter(l => l.categoria && parseFloat(l.monto) > 0);
    const amount = parseFloat(formData.total) || 0;
    if (amount <= 0 && lineasValidas.length === 0) {
      setError('Ingresa un monto o agrega lineas de desglose.');
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
        comprobante: formData.comprobante || 'SIN_COMPROBANTE',
        descripcion: formData.descripcion || null,
      });
      setSuccessMsg('Gasto registrado exitosamente.');
      setTimeout(() => {
        setFile(null);
        setOcrState('idle');
        setSuccessMsg(null);
        setFormData({ fecha: new Date().toISOString().split('T')[0], proveedor: '', categoria: '', total: '', metodoPago: 'EFECTIVO', comprobante: '', descripcion: '' });
        setLineasGasto([{ categoria: '', descripcion: '', monto: '' }]);
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
      {tabGastos === "gastos" && !showNuevoGasto && !gastoRapido && (
        <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
          <div style={{padding:"16px 24px",borderBottom:"1px solid #F3F4F6",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:"14px",fontWeight:"700",color:"#111827"}}>Gastos Registrados ({gastosLista.length})</span>
            <div style={{display:"flex",gap:"8px"}}>
              <button onClick={fetchGastos} style={{padding:"6px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",background:"#FFF",fontSize:"12px",color:"#6B7280",cursor:"pointer"}}>Actualizar</button>
              <button onClick={() => { setGastoRapido(true); setShowNuevoGasto(false); setRapidoProv(null); }} style={{padding:"6px 14px",borderRadius:"8px",border:"none",background:"#059669",color:"#FFF",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>⚡ Gasto Rapido</button>
              <button onClick={() => { setShowNuevoGasto(true); setGastoRapido(false); }} style={{padding:"6px 14px",borderRadius:"8px",border:"none",background:"#3D1C1E",color:"#C8FF00",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>+ Manual</button>
            </div>
          </div>
          
          {gastosLista.length === 0 ? (
            <div style={{padding:"40px",textAlign:"center" as const}}><p style={{fontSize:"13px",color:"#9CA3AF"}}>Sin gastos registrados</p></div>
          ) : (() => {
            const grouped: Record<string, any[]> = {};
            gastosLista.forEach((g: any) => { const f = g.fecha || "Sin fecha"; if (!grouped[f]) grouped[f] = []; grouped[f].push(g); });
            const fechas = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
            return fechas.map(fecha => {
              const items = grouped[fecha];
              const totalFecha = items.reduce((s: number, g: any) => s + (g.total || g.monto || 0), 0);
              const isOpen = expandedDates.has(fecha);
              return (
                <div key={fecha}>
                  <button onClick={() => toggleDate(fecha)} style={{width:"100%",display:"flex",justifyContent:"space-between",padding:"12px 24px",borderBottom:"1px solid #F3F4F6",background:isOpen?"#F9FAFB":"#FFF",border:"none",cursor:"pointer",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      {isOpen ? <ChevronUp style={{width:"16px",height:"16px",color:"#3D1C1E"}} /> : <ChevronDown style={{width:"16px",height:"16px",color:"#9CA3AF"}} />}
                      <span style={{fontSize:"14px",fontWeight:"700",color:"#111827"}}>{new Date(fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})}</span>
                      <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"10px",background:"#F3F4F6",color:"#6B7280"}}>{items.length} gasto{items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <span style={{fontSize:"15px",fontWeight:"800",color:"#3D1C1E"}}>${totalFecha.toLocaleString("es-MX",{minimumFractionDigits:2})}</span>
                  </button>
                  {isOpen && (
                    <div style={{background:"#FAFBFC"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 110px 110px 90px 90px 60px",padding:"6px 24px 6px 48px",borderBottom:"1px solid #F3F4F6"}}>
                        {["Proveedor","Categoria","Monto","Metodo","Comprobante",""].map(h => <span key={h} style={{fontSize:"10px",fontWeight:"700",color:"#9CA3AF",textTransform:"uppercase" as const}}>{h}</span>)}
                      </div>
                      {items.map((g: any) => (
                        <div key={g.id}>
                          {editingId === g.id ? (
                            <div style={{display:"grid",gridTemplateColumns:"1fr 110px 110px 90px 90px 60px",padding:"8px 24px 8px 48px",borderBottom:"1px solid #F3F4F6",alignItems:"center",background:"#FFFBEB"}}>
                              <input value={editGasto.proveedor} onChange={e => setEditGasto({...editGasto, proveedor: e.target.value})} style={{fontSize:"12px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB"}} />
                              <select value={editGasto.categoria} onChange={e => setEditGasto({...editGasto, categoria: e.target.value})} style={{fontSize:"11px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB"}}>{CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat.replace(/_/g," ")}</option>)}</select>
                              <input type="number" step="0.01" value={editGasto.total} onChange={e => setEditGasto({...editGasto, total: e.target.value})} style={{fontSize:"12px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB",width:"100px"}} />
                              <select value={editGasto.metodo_pago||"EFECTIVO"} onChange={e => setEditGasto({...editGasto, metodo_pago: e.target.value})} style={{fontSize:"11px",padding:"4px 6px",borderRadius:"6px",border:"1px solid #E5E7EB"}}><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option></select>
                              <span></span>
                              <div style={{display:"flex",gap:"2px"}}><button onClick={guardarEdicion} style={{border:"none",background:"#059669",color:"#FFF",borderRadius:"4px",padding:"4px 8px",fontSize:"10px",fontWeight:"700",cursor:"pointer"}}>OK</button><button onClick={cancelarEdicion} style={{border:"1px solid #E5E7EB",background:"#FFF",borderRadius:"4px",padding:"4px 6px",fontSize:"10px",cursor:"pointer"}}>X</button></div>
                            </div>
                          ) : (
                            <div style={{display:"grid",gridTemplateColumns:"1fr 110px 110px 90px 90px 60px",padding:"8px 24px 8px 48px",borderBottom:"1px solid #F9FAFB",alignItems:"center"}}>
                              <div><span style={{fontSize:"13px",fontWeight:"600",color:"#111827"}}>{g.proveedor}</span>{g.descripcion && <span style={{fontSize:"11px",color:"#9CA3AF",marginLeft:"8px"}}>{g.descripcion}</span>}</div>
                              <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",background:"#F3F4F6",color:"#374151"}}>{(g.categoria||"").replace(/_/g," ")}</span>
                              <span style={{fontSize:"13px",fontWeight:"700",color:"#111827"}}>${(g.total||g.monto||0).toLocaleString("es-MX",{minimumFractionDigits:2})}</span>
                              <span style={{fontSize:"11px",color:"#6B7280"}}>{(g.metodo_pago||"").replace(/_/g," ")}</span>
                              <span style={{fontSize:"10px",padding:"2px 6px",borderRadius:"4px",background:"#FDF4FF",color:"#7E22CE"}}>{(g.comprobante||"").replace(/_/g," ")}</span>
                              <div style={{display:"flex",gap:"4px"}}><button onClick={() => iniciarEdicion(g)} style={{border:"none",background:"none",cursor:"pointer",padding:"4px"}}><Edit2 style={{width:"14px",height:"14px",color:"#6B7280"}} /></button><button onClick={() => eliminarGasto(g.id)} style={{border:"none",background:"none",cursor:"pointer",padding:"4px"}}><Trash2 style={{width:"14px",height:"14px",color:"#DC2626"}} /></button></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
          {gastosLista.length > 0 && (
            <div style={{display:"flex",justifyContent:"space-between",padding:"14px 24px",background:"#3D1C1E",borderTop:"2px solid #3D1C1E"}}>
              <span style={{fontSize:"14px",fontWeight:"900",color:"#FFF"}}>TOTAL GENERAL</span>
              <span style={{fontSize:"15px",fontWeight:"900",color:"#C8FF00"}}>${gastosLista.reduce((s: number,g: any) => s+(g.total||g.monto||0),0).toLocaleString("es-MX",{minimumFractionDigits:2})}</span>
            </div>
          )}
        </div>
      )}
      {tabGastos === "gastos" && gastoRapido && (
        <div>
          <div style={{marginBottom:"12px"}}>
            <button onClick={() => { setGastoRapido(false); fetchGastos(); }} style={{padding:"8px 16px",borderRadius:"8px",border:"1px solid #E5E7EB",ckground:"#FFF",fontSize:"12px",color:"#6B7280",cursor:"pointer"}}>← Volver a lista</button>
          </div>
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
            <h3 style={{fontSize:"16px",fontWeight:"700",color:"#111827",marginBottom:"4px"}}>⚡ Gasto Rapido</h3>
            <p style={{fontSize:"12px",color:"#9CA3AF",marginBottom:"16px"}}>Selecciona proveedor → se auto-llena la categoria → solo pon monto y descripcion</p>

            {!rapidoProv ? (
              <div>
                <p style={{fontSize:"13px",fontWeight:"600",color:"#374151",marginBottom:"10px"}}>Selecciona proveedor:</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
                  {proveedores.map((p: any) => (
                    <button key={p.id} onClick={() => selectRapidoProv(p)} style={{padding:"14px 12px",borderRadius:"10px",border:"2px solid #F3F4F6",background:"#FFF",cursor:"pointer",textAlign:"left" as const,transition:"all 0.15s"}}>
                      <div style={{fontSize:"14px",fontWeight:"700",color:"#111827"}}>{p.nombre}</div>
                      <div style={{fontSize:"11px",color:"#9CA3AF",marginTop:"2px"}}>{(p.categoria_default||"").replace(/_/g," ")}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",padding:"12px 16px",borderRadius:"10px",background:"#F0FDF4",border:"2px solid #059669"}}>
                  <div>
                    <span style={{fontSize:"16px",fontWeight:"800",color:"#059669"}}>{rapidoProv.nombre}</span>
                    <span style={{fontSize:"12px",color:"#6B7280",marginLeft:"12px"}}>{(rapidoCategoria||"").replace(/_/g," ")}</span>
                  </div>
                  <button onClick={() => setRapidoProv(null)} style={{fontSize:"11px",color:"#059669",border:"none",background:"none",cursor:"pointer",fontWeight:"700"}}>Cambiar</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                  <div>
                    <label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Monto $ *</label>
                    <input type="number" step="0.01" value={rapidoMonto} onChange={e => setRapidoMonto(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarRapido()} placeholder="0.00" autoFocus style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"16px",fontWeight:"700"}} />
                  </div>
                  <div>
                    <label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Descripcion</label>
                    <input value={rapidoDesc} onChange={e => setRapidoDesc(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarRapido()} placeholder="Detalle del gasto" style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px"}} />
                  </div>
                  <div>
                    <label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Metodo</label>
                    <select value={rapidoMetodo} onChange={e => setRapidoMetodo(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px"}}>
                      <option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option>
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Comprobante</label>
                    <select value={rapidoComprobante} onChange={e => setRapidoComprobante(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px"}}>
                      <option value="SIN_COMPROBANTE">Sin comprobante</option><option value="FACTURA">Factura</option><option value="TICKET">Ticket</option><option value="VALE">Vale</option><option value="TRANSFERENCIA">Transferencia</option><option value="NOTA_REMISION">Nota de Remision</option><option value="RECIBO">Recibo</option>
                    </select>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                  <button onClick={guardarRapido} disabled={rapidoSaving || !rapidoMonto} style={{padding:"12px 24px",borderRadius:"10px",border:"none",background:rapidoSaving?"#9CA3AF":"#059669",color:"#FFF",fontSize:"14px",fontWeight:"700",cursor:"pointer"}}>{rapidoSaving ? "Guardando..." : "Guardar Gasto"}</button>
                  {rapidoSuccess && <span style={{fontSize:"13px",color:"#059669",fontWeight:"600"}}>✓ Guardo!</span>}
                  <span style={{fontSize:"12px",color:"#9CA3AF",marginLeft:"auto"}}>Tip: Enter para guardar rapido</span>
                </div>
              </div>
            )}
          </div>
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
                <label className="text-sm font-medium text-slate-700">Categoria (principal)</label>
                <select name="categoria" value={formData.categoria} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
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
                <label className="text-sm font-medium text-slate-700">Comprobante</label>
                <select name="comprobante" value={formData.comprobante} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                  <option value="">Selecciona tipo...</option>
                  <option value="FACTURA">Factura</option>
                  <option value="TICKET">Ticket</option>
                  <option value="VALE">Vale</option>
                  <option value="NOTA_REMISION">Nota de Remision</option>
                  <option value="RECIBO">Recibo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="SIN_COMPROBANTE">Sin comprobante</option>
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
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-700">Desglose por categoria (si el ticket tiene multiples conceptos)</label>
                <button type="button" onClick={addLinea} className="text-xs px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100">+ Agregar linea</button>
              </div>
              {lineasGasto.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {i === 0 && <label className="text-xs text-slate-500">Categoria</label>}
                    <select value={l.categoria} onChange={e => updateLinea(i, "categoria", e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
                      <option value="">Selecciona</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4">
                    {i === 0 && <label className="text-xs text-slate-500">Descripcion</label>}
                    <input value={l.descripcion} onChange={e => updateLinea(i, "descripcion", e.target.value)} placeholder="Detalle" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                  </div>
                  <div className="col-span-3">
                    {i === 0 && <label className="text-xs text-slate-500">Monto $</label>}
                    <input type="number" step="0.01" value={l.monto} onChange={e => updateLinea(i, "monto", e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-mono" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {lineasGasto.length > 1 && <button type="button" onClick={() => removeLinea(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
              ))}
              {lineasGasto.filter(l => parseFloat(l.monto) > 0).length > 0 && (
                <div className="text-right text-sm mt-2 mb-3">
                  <span className="text-slate-500">Total desglose: </span>
                  <span className="font-bold text-slate-900 font-mono">${lineasGasto.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0).toLocaleString("es-MX", {minimumFractionDigits: 2})}</span>
                </div>
              )}
            </div>
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
