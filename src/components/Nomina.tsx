import { useState, useEffect } from "react";
import { api, API_BASE } from "../services/api";
import { Users, Trash2, AlertTriangle, CheckCircle, Clock, FileText, Bell, Calendar, Shield, Plus, X, Edit2, Banknote } from "lucide-react";
import { useRestaurante } from "../context/RestauranteContext";

interface DocEmpleado {
  id: number;
  empleado_id: number;
  nombre: string;
  tipo: string;
  created_at: string;
}

interface Empleado {
  id: number;
  nombre: string;
  puesto: string;
  salario_mensual: number;
  fecha_ingreso: string;
  fecha_nacimiento?: string;
  dia_pago: number;
  frecuencia_pago: "SEMANAL" | "QUINCENAL" | "MENSUAL";
  tipo_contrato: "INDEFINIDO" | "TEMPORAL" | "PRUEBA" | "CAPACITACION" | "SIN_CONTRATO";
  contrato_firmado: boolean;
  fecha_fin_contrato?: string;
  imss_registrado: boolean;
  numero_imss: string;
  rfc: string;
  curp: string;
  cuenta_banco?: string;
  documentos: DocEmpleado[];
}

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const CONTRATO_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  INDEFINIDO:   { label: "Indefinido",   bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0" },
  TEMPORAL:     { label: "Temporal",     bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  PRUEBA:       { label: "Prueba",       bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  CAPACITACION: { label: "Capacitación", bg: "#FDF4FF", text: "#7E22CE", border: "#E9D5FF" },
  SIN_CONTRATO: { label: "Sin Contrato", bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
};

const FREQ: Record<string, string> = { SEMANAL: "Semanal", QUINCENAL: "Quincenal", MENSUAL: "Mensual" };

function diasPago(dia: number, freq: string): number {
  const hoy = new Date(); const d = hoy.getDate(); const m = hoy.getMonth(); const y = hoy.getFullYear();
  if (freq === "SEMANAL") {
    let next = new Date(y, m, dia); if (next > hoy) return Math.ceil((next.getTime() - hoy.getTime()) / 86400000);
    while (next <= hoy) next.setDate(next.getDate() + 7); return Math.ceil((next.getTime() - hoy.getTime()) / 86400000);
  } else if (freq === "QUINCENAL") {
    const p1 = new Date(y, m, dia); const p2 = new Date(y, m, dia + 15);
    if (p1 > hoy) return Math.ceil((p1.getTime() - hoy.getTime()) / 86400000);
    if (p2 > hoy) return Math.ceil((p2.getTime() - hoy.getTime()) / 86400000);
    return Math.ceil((new Date(y, m + 1, dia).getTime() - hoy.getTime()) / 86400000);
  }
  let next = new Date(y, m, dia); if (next <= hoy) next = new Date(y, m + 1, dia);
  return Math.ceil((next.getTime() - hoy.getTime()) / 86400000);
}

function diasFin(f?: string): number | null {
  if (!f) return null; return Math.ceil((new Date(f + "T12:00:00").getTime() - new Date().getTime()) / 86400000);
}

const emptyNuevo = { nombre:'', puesto:'', salario_mensual:9000, fecha_ingreso:new Date().toISOString().slice(0,10), fecha_nacimiento:'', dia_pago:10, frecuencia_pago:'SEMANAL' as const, tipo_contrato:'INDEFINIDO' as const, contrato_firmado:false, imss_registrado:false, numero_imss:'', rfc:'', curp:'', cuenta_banco:'', fecha_fin_contrato:'' };

export const Nomina = () => {
  const { restauranteId } = useRestaurante();
  const [emps, setEmps] = useState<Empleado[]>([]);

  const fetchEmpleados = async () => {
    try {
      const data = await api.get(`/api/empleados?restaurante_id=${restauranteId}`);
      if (Array.isArray(data)) {
        setEmps(data.map((e: any) => ({
          id: e.id,
          nombre: e.nombre || "",
          puesto: e.puesto || "",
          salario_mensual: e.salario_base || 0,
          fecha_ingreso: e.fecha_ingreso || "",
          fecha_nacimiento: e.fecha_nacimiento || undefined,
          dia_pago: 10,
          frecuencia_pago: "SEMANAL" as const,
          tipo_contrato: (e.tipo_contrato || "INDEFINIDO") as Empleado["tipo_contrato"],
          contrato_firmado: e.tipo_contrato && e.tipo_contrato !== "SIN_CONTRATO",
          imss_registrado: !!e.numero_imss,
          numero_imss: e.numero_imss || "",
          rfc: e.rfc || "",
          curp: e.curp || "",
          cuenta_banco: e.cuenta_banco || "",
          documentos: Array.isArray(e.documentos) ? e.documentos : [],
        })));
      }
    } catch(e) {}
  };

  useEffect(() => { fetchEmpleados(); }, []);
  const [vista, setVista] = useState<"alertas" | "equipo" | "legal">("alertas");
  const [exp, setExp] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [nuevoEmp, setNuevoEmp] = useState(emptyNuevo);

  const handleFileUpload = async (files: FileList | null, empId?: number) => {
    if (!files) return;
    if (empId) {
      for (const file of Array.from(files)) {
        try {
          await api.upload(`/api/empleados/${empId}/documentos`, file);
        } catch(e) { alert("Error al subir " + file.name); }
      }
      fetchEmpleados();
    } else {
      setPendingFiles(p => [...p, ...Array.from(files)]);
    }
  };

  const eliminarDocumento = async (docId: number) => {
    try { await api.del(`/api/empleados/documentos/${docId}`); fetchEmpleados(); } catch(e) { alert("Error al eliminar documento"); }
  };

  const [editEmp, setEditEmp] = useState<any>(null);
  const [editEmpId, setEditEmpId] = useState<number | null>(null);

  const iniciarEdicionEmp = (e: Empleado) => {
    setEditEmp({ nombre: e.nombre, puesto: e.puesto, salario_mensual: e.salario_mensual, fecha_ingreso: e.fecha_ingreso, fecha_nacimiento: e.fecha_nacimiento || '', rfc: e.rfc, curp: e.curp, numero_imss: e.numero_imss, cuenta_banco: e.cuenta_banco, dia_pago: e.dia_pago, tipo_contrato: e.tipo_contrato, fecha_fin_contrato: e.fecha_fin_contrato || '' });
    setEditEmpId(e.id);
  };

  const guardarEdicionEmp = async () => {
    if (!editEmp || !editEmpId) return;
    try {
      await api.put("/api/empleados/" + editEmpId, {
        nombre: editEmp.nombre,
        puesto: editEmp.puesto,
        salario_base: parseFloat(editEmp.salario_mensual) || 1,
        fecha_ingreso: editEmp.fecha_ingreso,
        fecha_nacimiento: editEmp.fecha_nacimiento || null,
        tipo_contrato: editEmp.tipo_contrato || null,
        rfc: editEmp.rfc || null,
        curp: editEmp.curp || null,
        numero_imss: editEmp.numero_imss || null,
        cuenta_banco: editEmp.cuenta_banco || null,
      });
      setEditEmpId(null);
      setEditEmp(null);
      fetchEmpleados();
    } catch(e: any) { alert("Error al editar: " + (e.message || e)); }
  };

  const eliminarEmpleado = async (id: number) => {
    if (!confirm("Eliminar este empleado?")) return;
    try { await api.del("/api/empleados/" + id); fetchEmpleados(); } catch(e) { alert("Error al eliminar"); }
  };

  const agregarEmpleado = async () => {
    if (!nuevoEmp.nombre || !nuevoEmp.puesto) { alert('Completa nombre y puesto (*)'); return; }
    try {
      const created = await api.post("/api/empleados", {
        nombre: nuevoEmp.nombre,
        puesto: nuevoEmp.puesto,
        salario_base: nuevoEmp.salario_mensual,
        fecha_ingreso: nuevoEmp.fecha_ingreso,
        fecha_nacimiento: nuevoEmp.fecha_nacimiento || null,
        tipo_contrato: nuevoEmp.tipo_contrato || null,
        rfc: nuevoEmp.rfc || null,
        curp: nuevoEmp.curp || null,
        numero_imss: nuevoEmp.numero_imss || null,
        cuenta_banco: nuevoEmp.cuenta_banco || null,
        restaurante_id: restauranteId,
      });
      if (pendingFiles.length > 0 && created?.id) {
        for (const file of pendingFiles) {
          try { await api.upload(`/api/empleados/${created.id}/documentos`, file); } catch(e) {}
        }
      }
      setPendingFiles([]);
      setNuevoEmp(emptyNuevo);
      setShowForm(false);
      fetchEmpleados();
    } catch(e) { alert("Error al guardar empleado"); }
  };

  const nomTotal = emps.reduce((s, e) => s + e.salario_mensual, 0);
  const sinC = emps.filter(e => !e.contrato_firmado || e.tipo_contrato === "SIN_CONTRATO").length;
  const sinI = emps.filter(e => !e.imss_registrado).length;

  const proxPagos = emps.map(e => ({ ...e, dias: diasPago(e.dia_pago, e.frecuencia_pago) })).sort((a, b) => a.dias - b.dias);

  const alertas: { tipo: "urgente" | "aviso"; msg: string; det: string }[] = [];
  emps.forEach(e => {
    if (e.tipo_contrato === "SIN_CONTRATO") alertas.push({ tipo: "urgente", msg: e.nombre + " sin contrato registrado", det: "Puesto: " + e.puesto });
    else if (!e.contrato_firmado) alertas.push({ tipo: "urgente", msg: e.nombre + " no tiene contrato firmado", det: "Puesto: " + e.puesto + " - " + (CONTRATO_CFG[e.tipo_contrato]?.label || e.tipo_contrato) });
    if (!e.imss_registrado) alertas.push({ tipo: "urgente", msg: e.nombre + " sin registro IMSS", det: "Riesgo legal: multas y responsabilidad patronal" });
    const df = diasFin(e.fecha_fin_contrato);
    if (df !== null && df < 0) alertas.push({ tipo: "urgente", msg: "Contrato de " + e.nombre + " VENCIDO", det: "Venció: " + e.fecha_fin_contrato });
    else if (df !== null && df <= 30) alertas.push({ tipo: "aviso", msg: "Contrato de " + e.nombre + " vence en " + df + " días", det: "Vence: " + e.fecha_fin_contrato });
  });
  const pp3 = proxPagos.filter(e => e.dias <= 3);
  if (pp3.length > 0) alertas.push({ tipo: "aviso", msg: pp3.length + " pago(s) en los próximos 3 días", det: "Total: " + formatMXN(pp3.reduce((s, e) => s + e.salario_mensual, 0)) });

  const upd = (id: number, k: string, v: any) => setEmps(p => p.map(e => e.id === id ? { ...e, [k]: v } : e));

  const contratoOpts = [
    { value: "INDEFINIDO", label: "Indefinido" },
    { value: "TEMPORAL", label: "Temporal" },
    { value: "SIN_CONTRATO", label: "Sin Contrato" },
    { value: "PRUEBA", label: "Prueba" },
    { value: "CAPACITACION", label: "Capacitación" },
  ];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        .nom-row { transition: background 0.1s; } .nom-row:hover { background: #FAFBFC !important; }
      `}</style>

      <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"24px" }}>
        <div style={{ width:"40px", height:"40px", borderRadius:"12px", background:"linear-gradient(135deg,#3D1C1E,#5C2D30)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Users style={{ width:"20px", height:"20px", color:"#C8FF00" }} />
        </div>
        <div>
          <h1 style={{ fontSize:"22px", fontWeight:"800", color:"#111827", margin:0 }}>Nómina & Legal</h1>
          <p style={{ fontSize:"13px", color:"#9CA3AF", margin:0 }}>Control de pagos, contratos y compliance</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ marginLeft:"auto", display:'flex', alignItems:'center', gap:'6px', padding:'10px 18px', borderRadius:'10px', border:'none', background:'#3D1C1E', color:'#C8FF00', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>
          {showForm ? <X style={{width:'16px',height:'16px'}} /> : <Plus style={{width:'16px',height:'16px'}} />}
          {showForm ? 'Cancelar' : 'Nuevo Empleado'}
        </button>
      </div>

      {showForm && (
        <div style={{ background:'#FFF', borderRadius:'14px', padding:'20px 24px', marginBottom:'16px', boxShadow:'0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)' }}>
          <h3 style={{ fontSize:'14px', fontWeight:'700', color:'#111827', marginBottom:'16px' }}>Registrar Nuevo Empleado</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Nombre completo *</label><input value={nuevoEmp.nombre} onChange={e => setNuevoEmp({...nuevoEmp, nombre:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} placeholder='Ej: Juan Pérez' /></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Puesto *</label><input value={nuevoEmp.puesto} onChange={e => setNuevoEmp({...nuevoEmp, puesto:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} placeholder='Ej: Cocinero' /></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Salario Mensual *</label><input type='number' step='0.01' value={nuevoEmp.salario_mensual} onChange={e => setNuevoEmp({...nuevoEmp, salario_mensual:parseFloat(e.target.value)||0})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Fecha Ingreso</label><input type='date' value={nuevoEmp.fecha_ingreso} onChange={e => setNuevoEmp({...nuevoEmp, fecha_ingreso:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Fecha Nacimiento</label><input type='date' value={nuevoEmp.fecha_nacimiento} onChange={e => setNuevoEmp({...nuevoEmp, fecha_nacimiento:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Tipo Contrato</label><select value={nuevoEmp.tipo_contrato} onChange={e => setNuevoEmp({...nuevoEmp, tipo_contrato:e.target.value as any})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }}>{contratoOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Frecuencia Pago</label><select value={nuevoEmp.frecuencia_pago} onChange={e => setNuevoEmp({...nuevoEmp, frecuencia_pago:e.target.value as any})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }}><option value='SEMANAL'>Semanal</option><option value='QUINCENAL'>Quincenal</option><option value='MENSUAL'>Mensual</option></select></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>No. IMSS</label><input value={nuevoEmp.numero_imss} onChange={e => setNuevoEmp({...nuevoEmp, numero_imss:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>RFC</label><input value={nuevoEmp.rfc} onChange={e => setNuevoEmp({...nuevoEmp, rfc:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>CURP</label><input value={nuevoEmp.curp} onChange={e => setNuevoEmp({...nuevoEmp, curp:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Cuenta Banco</label><input value={nuevoEmp.cuenta_banco} onChange={e => setNuevoEmp({...nuevoEmp, cuenta_banco:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'12px', alignItems:'end', marginBottom:'16px' }}>
            <div><label style={{ fontSize:'11px', fontWeight:'600', color:'#6B7280', display:'block', marginBottom:'4px' }}>Fin Contrato (si aplica)</label><input type='date' value={nuevoEmp.fecha_fin_contrato} onChange={e => setNuevoEmp({...nuevoEmp, fecha_fin_contrato:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #E5E7EB', fontSize:'13px', boxSizing:'border-box' }} /></div>
            <button onClick={agregarEmpleado} style={{ padding:'10px 24px', borderRadius:'10px', border:'none', background:'#3D1C1E', color:'#C8FF00', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>Guardar</button>
          </div>
          <div style={{ paddingTop:'16px', borderTop:'1px solid #E5E7EB' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
              <span style={{ fontSize:'13px', fontWeight:'700', color:'#111827' }}>Documentos a adjuntar</span>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 14px', borderRadius:'8px', border:'1px dashed #D1D5DB', background:'#F9FAFB', fontSize:'12px', color:'#6B7280', cursor:'pointer', fontWeight:'600' }}>
                <Plus style={{width:'14px',height:'14px'}} /> Seleccionar archivos
                <input type='file' accept='.pdf,.jpg,.jpeg,.png' multiple onChange={e => handleFileUpload(e.target.files)} style={{ display:'none' }} />
              </label>
            </div>
            <div style={{ fontSize:'11px', color:'#9CA3AF', marginBottom:'8px' }}>Contrato, INE, CURP, constancia IMSS, etc. Se subirán al guardar el empleado.</div>
            {pendingFiles.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:'8px' }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 10px', borderRadius:'8px', background:'#EFF6FF', border:'1px solid #BFDBFE' }}>
                    <FileText style={{width:'14px',height:'14px',color:'#1D4ED8'}} />
                    <span style={{ fontSize:'11px', fontWeight:'600', color:'#1D4ED8' }}>{f.name}</span>
                    <button onClick={() => setPendingFiles(p => p.filter((_,j) => j!==i))} style={{ border:'none', background:'none', cursor:'pointer', padding:'0' }}><X style={{width:'12px',height:'12px',color:'#93C5FD'}} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"14px", marginBottom:"20px" }}>
        {[
          { l:"Empleados", v:String(emps.length), s:"activos", icon:Users, c:"#3D1C1E" },
          { l:"Nómina Mensual", v:formatMXN(nomTotal), s:"total base", icon:Banknote, c:"#059669" },
          { l:"Sin Contrato", v:String(sinC), s:sinC>0?"¡URGENTE!":"al día", icon:FileText, c:sinC>0?"#DC2626":"#059669" },
          { l:"Sin IMSS", v:String(sinI), s:sinI>0?"riesgo legal":"al día", icon:Shield, c:sinI>0?"#DC2626":"#059669" },
        ].map((k, i) => {
          const Ic = k.icon;
          return (<div key={i} style={{ background:"#FFF", borderRadius:"14px", padding:"18px 20px", boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ fontSize:"11px", fontWeight:"600", color:"#9CA3AF", textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{k.l}</span><Ic style={{ width:"16px", height:"16px", color:k.c, opacity:0.7 }} /></div>
            <div style={{ fontSize:"22px", fontWeight:"800", color:"#111827", marginTop:"8px" }}>{k.v}</div>
            <span style={{ fontSize:"11px", color:k.c==="#DC2626"?"#DC2626":"#9CA3AF", fontWeight:k.c==="#DC2626"?"700":"400" }}>{k.s}</span>
          </div>);
        })}
      </div>

      <div style={{ display:"flex", gap:"4px", background:"#FFF", borderRadius:"12px", padding:"4px", marginBottom:"16px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
        {([{ key:"alertas" as const, label:"Alertas & Pagos", icon:Bell, n:alertas.length }, { key:"equipo" as const, label:"Equipo", icon:Users, n:emps.length }, { key:"legal" as const, label:"Compliance Legal", icon:Shield, n:sinC+sinI }]).map(t => {
          const Ic = t.icon; const act = vista === t.key;
          return (<button key={t.key} onClick={() => setVista(t.key)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", padding:"10px 16px", borderRadius:"10px", border:"none", cursor:"pointer", background:act?"#3D1C1E":"transparent", color:act?"#FFF":"#6B7280", fontSize:"13px", fontWeight:"600", transition:"all 0.15s" }}>
            <Ic style={{ width:"16px", height:"16px" }} />{t.label}
            {t.n > 0 && <span style={{ padding:"1px 7px", borderRadius:"10px", fontSize:"11px", fontWeight:"700", background:act?"#C8FF00":(t.key==="legal"&&t.n>0?"#FEE2E2":"#F3F4F6"), color:act?"#1a1a1a":(t.key==="legal"&&t.n>0?"#DC2626":"#6B7280") }}>{t.n}</span>}
          </button>);
        })}
      </div>

      {editEmpId && editEmp && (
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.4)"}}>
          <div style={{background:"#FFF",borderRadius:"16px",padding:"24px",width:"640px",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
            <h3 style={{fontSize:"16px",fontWeight:"700",color:"#111827",marginBottom:"16px"}}>Editar Empleado</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Nombre *</label><input value={editEmp.nombre} onChange={e => setEditEmp({...editEmp, nombre:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Puesto *</label><input value={editEmp.puesto} onChange={e => setEditEmp({...editEmp, puesto:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Salario Mensual *</label><input type="number" step="0.01" value={editEmp.salario_mensual} onChange={e => setEditEmp({...editEmp, salario_mensual:parseFloat(e.target.value)||0})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Fecha Ingreso</label><input type="date" value={editEmp.fecha_ingreso} onChange={e => setEditEmp({...editEmp, fecha_ingreso:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Fecha Nacimiento</label><input type="date" value={editEmp.fecha_nacimiento||""} onChange={e => setEditEmp({...editEmp, fecha_nacimiento:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Tipo Contrato</label><select value={editEmp.tipo_contrato||"INDEFINIDO"} onChange={e => setEditEmp({...editEmp, tipo_contrato:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}}>{contratoOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>RFC</label><input value={editEmp.rfc||""} onChange={e => setEditEmp({...editEmp, rfc:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>CURP</label><input value={editEmp.curp||""} onChange={e => setEditEmp({...editEmp, curp:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>No. IMSS</label><input value={editEmp.numero_imss||""} onChange={e => setEditEmp({...editEmp, numero_imss:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Cuenta Banco</label><input value={editEmp.cuenta_banco||""} onChange={e => setEditEmp({...editEmp, cuenta_banco:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
              <div><label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Fin Contrato</label><input type="date" value={editEmp.fecha_fin_contrato||""} onChange={e => setEditEmp({...editEmp, fecha_fin_contrato:e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px",boxSizing:"border-box"}} /></div>
            </div>
            <div style={{display:"flex",gap:"8px",marginTop:"16px",justifyContent:"flex-end"}}>
              <button onClick={() => {setEditEmpId(null);setEditEmp(null);}} style={{padding:"8px 16px",borderRadius:"8px",border:"1px solid #E5E7EB",background:"#FFF",fontSize:"12px",cursor:"pointer"}}>Cancelar</button>
              <button onClick={guardarEdicionEmp} style={{padding:"8px 16px",borderRadius:"8px",border:"none",background:"#3D1C1E",color:"#C8FF00",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {vista === "alertas" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>
          <div style={{ background:"#FFF", borderRadius:"14px", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", gap:"8px" }}><Bell style={{ width:"16px", height:"16px", color:"#3D1C1E" }} /><span style={{ fontSize:"14px", fontWeight:"700", color:"#111827" }}>Alertas Activas</span></div>
            <div style={{ padding:"8px 12px", maxHeight:"400px", overflowY:"auto" }}>
              {alertas.length === 0 ? <div style={{ padding:"32px", textAlign:"center" as const }}><CheckCircle style={{ width:"32px", height:"32px", color:"#059669", margin:"0 auto 8px" }} /><p style={{ fontSize:"13px", color:"#6B7280" }}>Todo en orden</p></div> :
              alertas.map((a, i) => (
                <div key={i} style={{ display:"flex", gap:"10px", padding:"10px 12px", borderRadius:"10px", marginBottom:"4px", background:a.tipo==="urgente"?"#FEF2F2":"#FFFBEB" }}>
                  <div style={{ marginTop:"2px" }}>{a.tipo==="urgente"?<AlertTriangle style={{ width:"16px", height:"16px", color:"#DC2626" }} />:<Clock style={{ width:"16px", height:"16px", color:"#D97706" }} />}</div>
                  <div><div style={{ fontSize:"12px", fontWeight:"600", color:a.tipo==="urgente"?"#991B1B":"#92400E" }}>{a.msg}</div><div style={{ fontSize:"11px", color:"#9CA3AF", marginTop:"2px" }}>{a.det}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:"#FFF", borderRadius:"14px", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", gap:"8px" }}><Calendar style={{ width:"16px", height:"16px", color:"#3D1C1E" }} /><span style={{ fontSize:"14px", fontWeight:"700", color:"#111827" }}>Próximos Pagos</span></div>
            <div style={{ padding:"8px 12px" }}>
              {proxPagos.map((e) => {
                const urg = e.dias <= 1; const pronto = e.dias <= 3;
                return (<div key={e.id} className="nom-row" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:"10px", marginBottom:"4px", background:urg?"#FEF2F2":"transparent" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    <div style={{ width:"36px", height:"36px", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", background:urg?"#DC2626":pronto?"#F59E0B":"#E5E7EB", color:urg||pronto?"#FFF":"#6B7280", fontSize:"11px", fontWeight:"800", animation:urg?"pulse 1.5s infinite":"none" }}>{e.dias}d</div>
                    <div><div style={{ fontSize:"13px", fontWeight:"600", color:"#111827" }}>{e.nombre}</div><div style={{ fontSize:"11px", color:"#9CA3AF" }}>{e.puesto} - {FREQ[e.frecuencia_pago]}</div></div>
                  </div>
                  <div style={{ textAlign:"right" as const }}><div style={{ fontSize:"14px", fontWeight:"700", color:"#111827" }}>{formatMXN(e.salario_mensual)}</div><div style={{ fontSize:"10px", color:"#9CA3AF" }}>Día {e.dia_pago}</div></div>
                </div>);
              })}
            </div>
          </div>
        </div>
      )}

      {vista === "equipo" && (
        <div style={{ background:"#FFF", borderRadius:"14px", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ display:"grid", gridTemplateColumns:"50px 1fr 120px 120px 100px 120px", padding:"12px 24px", borderBottom:"1px solid #F3F4F6", background:"#FAFBFC" }}>
            {["","Empleado","Puesto","Contrato","IMSS","Salario"].map(h => <span key={h} style={{ fontSize:"11px", fontWeight:"700", color:"#9CA3AF", textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{h}</span>)}
          </div>
          {emps.map((e) => {
            const cs = CONTRATO_CFG[e.tipo_contrato] || CONTRATO_CFG["SIN_CONTRATO"]; const isExp = exp === e.id; const df = diasFin(e.fecha_fin_contrato);
            return (<div key={e.id}>
              <div className="nom-row" onClick={() => setExp(isExp ? null : e.id)} style={{ display:"grid", gridTemplateColumns:"50px 1fr 120px 120px 100px 120px", padding:"14px 24px", borderBottom:"1px solid #F9FAFB", alignItems:"center", cursor:"pointer" }}>
                <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:"linear-gradient(135deg,#3D1C1E,#5C2D30)", display:"flex", alignItems:"center", justifyContent:"center", color:"#C8FF00", fontSize:"14px", fontWeight:"700" }}>{e.nombre.charAt(0)}</div>
                <div><div style={{ fontSize:"13px", fontWeight:"600", color:"#111827" }}>{e.nombre}</div><div style={{ fontSize:"11px", color:"#9CA3AF" }}>Desde {new Date(e.fecha_ingreso+"T12:00:00").toLocaleDateString("es-MX",{month:"short",year:"numeric"})}</div></div>
                <span style={{ fontSize:"12px", color:"#6B7280" }}>{e.puesto}</span>
                <span style={{ display:"inline-flex", padding:"3px 8px", borderRadius:"6px", fontSize:"11px", fontWeight:"600", background:cs.bg, color:cs.text, border:"1px solid "+cs.border, width:"fit-content" }}>{cs.label}</span>
                <span>{e.imss_registrado?<CheckCircle style={{ width:"18px", height:"18px", color:"#059669" }} />:<AlertTriangle style={{ width:"18px", height:"18px", color:"#DC2626" }} />}</span>
                <div style={{display:"flex",alignItems:"center",gap:"8px",justifyContent:"flex-end"}}>
                  <span style={{ fontSize:"14px", fontWeight:"700", color:"#111827"}}>{formatMXN(e.salario_mensual)}</span>
                  <button onClick={(ev) => {ev.stopPropagation(); iniciarEdicionEmp(e);}} style={{border:"none",background:"none",cursor:"pointer",padding:"2px"}}><Edit2 style={{width:"14px",height:"14px",color:"#6B7280"}} /></button>
                  <button onClick={(ev) => {ev.stopPropagation(); eliminarEmpleado(e.id);}} style={{border:"none",background:"none",cursor:"pointer",padding:"2px"}}><Trash2 style={{width:"14px",height:"14px",color:"#DC2626"}} /></button>
                </div>
              </div>
              {isExp && (
                <div style={{ padding:"16px 24px 20px 74px", background:"#FAFBFC", borderBottom:"1px solid #F3F4F6" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"16px" }}>
                    <div>
                      <div style={{ fontSize:"11px", fontWeight:"600", color:"#9CA3AF", marginBottom:"8px", textTransform:"uppercase" as const }}>Pago</div>
                      <div style={{ fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Mensual: <strong>{formatMXN(e.salario_mensual)}</strong></div>
                      <div style={{ fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Semanal: <strong>{formatMXN(e.salario_mensual/4.33)}</strong></div>
                      <div style={{ fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Diario: <strong>{formatMXN(e.salario_mensual/30)}</strong></div>
                      <div style={{ fontSize:"13px", color:"#374151" }}>Cuenta: <strong>{e.cuenta_banco || "No registrada"}</strong></div>
                    </div>
                    <div>
                      <div style={{ fontSize:"11px", fontWeight:"600", color:"#9CA3AF", marginBottom:"8px", textTransform:"uppercase" as const }}>Datos Personales</div>
                      <div style={{ fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Contrato: <strong>{cs.label}</strong></div>
                      {e.fecha_nacimiento && <div style={{ fontSize:"13px", color:"#374151", marginBottom:"4px" }}>Nacimiento: <strong>{e.fecha_nacimiento}</strong></div>}
                      {e.fecha_fin_contrato && <div style={{ fontSize:"13px", color:df!==null&&df<=30?"#DC2626":"#374151" }}>Vence: <strong>{e.fecha_fin_contrato}</strong>{df!==null&&<span style={{ marginLeft:"4px", fontSize:"11px" }}>({df}d)</span>}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize:"11px", fontWeight:"600", color:"#9CA3AF", marginBottom:"8px", textTransform:"uppercase" as const }}>Documentos Legales</div>
                      <div style={{ fontSize:"13px", color:"#374151", marginBottom:"4px" }}>IMSS: <strong style={{ color:e.imss_registrado?"#059669":"#DC2626" }}>{e.imss_registrado?e.numero_imss:"NO REGISTRADO"}</strong></div>
                      <div style={{ fontSize:"13px", color:"#374151", marginBottom:"4px" }}>RFC: <strong>{e.rfc||"No registrado"}</strong></div>
                      <div style={{ fontSize:"13px", color:"#374151" }}>CURP: <strong>{e.curp||"No registrado"}</strong></div>
                    </div>
                  </div>
                  <div style={{ marginTop:"16px", paddingTop:"12px", borderTop:"1px solid #E5E7EB" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                      <span style={{ fontSize:"12px", fontWeight:"700", color:"#374151" }}>Archivos guardados ({e.documentos.length})</span>
                      <label style={{ display:"flex", alignItems:"center", gap:"4px", padding:"4px 10px", borderRadius:"6px", border:"1px dashed #D1D5DB", background:"#F9FAFB", fontSize:"11px", color:"#6B7280", cursor:"pointer", fontWeight:"600" }}>
                        <Plus style={{width:"12px",height:"12px"}} /> Subir
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={ev => handleFileUpload(ev.target.files, e.id)} style={{ display:"none" }} />
                      </label>
                    </div>
                    {e.documentos.length > 0 ? (
                      <div style={{ display:"flex", flexWrap:"wrap" as const, gap:"6px" }}>
                        {e.documentos.map((doc) => (
                          <div key={doc.id} style={{ display:"flex", alignItems:"center", gap:"5px", padding:"5px 10px", borderRadius:"6px", background:"#EFF6FF", border:"1px solid #BFDBFE" }}>
                            <a href={`${API_BASE}/api/empleados/documentos/${doc.id}/archivo`} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:"4px", textDecoration:"none" }}>
                              <FileText style={{width:"12px",height:"12px",color:"#1D4ED8"}} />
                              <span style={{ fontSize:"11px", fontWeight:"600", color:"#1D4ED8" }}>{doc.nombre}</span>
                              <span style={{ fontSize:"9px", color:"#60A5FA" }}>{doc.tipo}</span>
                            </a>
                            <button onClick={() => eliminarDocumento(doc.id)} style={{ border:"none", background:"none", cursor:"pointer", padding:"0", marginLeft:"2px" }}><X style={{width:"11px",height:"11px",color:"#93C5FD"}} /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize:"11px", color:"#9CA3AF" }}>Sin archivos adjuntos</div>
                    )}
                  </div>
                </div>
              )}
            </div>);
          })}
        </div>
      )}

      {vista === "legal" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>
          <div style={{ background:"#FFF", borderRadius:"14px", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", gap:"8px" }}><FileText style={{ width:"16px", height:"16px", color:"#3D1C1E" }} /><span style={{ fontSize:"14px", fontWeight:"700", color:"#111827" }}>Estado de Contratos</span></div>
            <div style={{ padding:"8px 12px" }}>
              {emps.map(e => {
                const df = diasFin(e.fecha_fin_contrato); const venc = df!==null&&df<0; const porV = df!==null&&df>=0&&df<=30;
                const noTiene = e.tipo_contrato === "SIN_CONTRATO";
                return (<div key={e.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:"10px", marginBottom:"4px", background:noTiene||venc?"#FEF2F2":porV?"#FFFBEB":"transparent" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    {(!noTiene&&!venc)?<CheckCircle style={{ width:"18px", height:"18px", color:porV?"#D97706":"#059669" }} />:<X style={{ width:"18px", height:"18px", color:"#DC2626" }} />}
                    <div>
                      <div style={{ fontSize:"13px", fontWeight:"600", color:"#111827" }}>{e.nombre}</div>
                      <div style={{ fontSize:"11px", color:"#9CA3AF" }}>{(CONTRATO_CFG[e.tipo_contrato]||CONTRATO_CFG["SIN_CONTRATO"]).label}{e.fecha_fin_contrato&&(" - Vence: "+e.fecha_fin_contrato)}{venc&&<span style={{ color:"#DC2626", fontWeight:"700" }}> ¡VENCIDO!</span>}{porV&&<span style={{ color:"#D97706", fontWeight:"700" }}> ({df}d)</span>}</div>
                    </div>
                  </div>
                  <span style={{ padding:"3px 10px", borderRadius:"6px", fontSize:"11px", fontWeight:"600", background:noTiene||venc?"#FEF2F2":"#ECFDF5", color:noTiene||venc?"#991B1B":"#065F46" }}>{noTiene?"Sin contrato":venc?"Vencido":"Activo"}</span>
                </div>);
              })}
            </div>
          </div>
          <div style={{ background:"#FFF", borderRadius:"14px", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", gap:"8px" }}><Shield style={{ width:"16px", height:"16px", color:"#3D1C1E" }} /><span style={{ fontSize:"14px", fontWeight:"700", color:"#111827" }}>IMSS & Documentos</span></div>
            <div style={{ padding:"8px 12px" }}>
              {emps.map(e => {
                const docs = [{l:"IMSS",ok:e.imss_registrado},{l:"RFC",ok:!!e.rfc},{l:"CURP",ok:!!e.curp},{l:"Cuenta",ok:!!e.cuenta_banco}];
                const pct = Math.round((docs.filter(d=>d.ok).length/docs.length)*100);
                return (<div key={e.id} style={{ padding:"10px 12px", borderRadius:"10px", marginBottom:"4px", background:pct<50?"#FEF2F2":"transparent" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}><div style={{ fontSize:"13px", fontWeight:"600", color:"#111827" }}>{e.nombre}</div><span style={{ fontSize:"11px", fontWeight:"700", color:pct===100?"#059669":pct>=50?"#D97706":"#DC2626" }}>{pct}%</span></div>
                  <div style={{ display:"flex", gap:"6px" }}>{docs.map(d => <span key={d.l} style={{ padding:"2px 8px", borderRadius:"4px", fontSize:"10px", fontWeight:"600", background:d.ok?"#ECFDF5":"#FEF2F2", color:d.ok?"#065F46":"#991B1B" }}>{d.ok?"✓":"✗"} {d.l}</span>)}</div>
                  <div style={{ height:"3px", background:"#F3F4F6", borderRadius:"2px", marginTop:"6px", overflow:"hidden" }}><div style={{ height:"100%", width:pct+"%", background:pct===100?"#059669":pct>=50?"#F59E0B":"#DC2626", borderRadius:"2px", transition:"width 0.3s" }} /></div>
                </div>);
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
