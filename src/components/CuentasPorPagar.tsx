import { useState, useEffect } from "react";
import { Plus, Trash2, Package } from "lucide-react";
import { api } from "../services/api";

const CATEGORIAS = ["PROTEINA","VEGETALES_FRUTAS","ABARROTES","BEBIDAS","PRODUCTOS_ASIATICOS","DESECHABLES_EMPAQUES","LIMPIEZA_MANTTO","UTENSILIOS","PERSONAL","PROPINAS","SERVICIOS","EQUIPO","MARKETING","PAPELERIA","RENTA","LUZ","SOFTWARE","COMISIONES_BANCARIAS","IMPUESTOS","NOMINA","COMISIONES_PLATAFORMAS","OTROS"];

export const CuentasPorPagar = () => {
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newProv, setNewProv] = useState({ nombre: "", categoria_default: "PROTEINA" });

  const fetchProveedores = async () => {
    try { const data = await api.get("/api/proveedores"); setProveedores(Array.isArray(data) ? data : []); } catch(e) {}
  };

  useEffect(() => { fetchProveedores(); }, []);

  const guardarProveedor = async () => {
    if (!newProv.nombre.trim()) return;
    try {
      await api.post("/api/proveedores", newProv);
      setNewProv({ nombre: "", categoria_default: "PROTEINA" });
      setShowForm(false);
      fetchProveedores();
    } catch(e) { alert("Error al guardar proveedor"); }
  };

  const eliminarProveedor = async (id: number) => {
    if (!confirm("Eliminar este proveedor?")) return;
    try { await api.del("/api/proveedores/" + id); fetchProveedores(); } catch(e) { alert("Error al eliminar"); }
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
        <div>
          <h2 style={{fontSize:"16px",fontWeight:"700",color:"#111827",margin:0}}>Proveedores ({proveedores.length})</h2>
          <p style={{fontSize:"12px",color:"#9CA3AF",margin:0}}>Alta y gestion de proveedores con categoria default</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:"6px",padding:"8px 16px",borderRadius:"10px",border:"none",background:showForm?"#E5E7EB":"#3D1C1E",color:showForm?"#374151":"#C8FF00",fontSize:"12px",fontWeight:"700",cursor:"pointer"}}>
          {showForm ? "Cancelar" : <><Plus style={{width:"14px",height:"14px"}} /> Nuevo Proveedor</>}
        </button>
      </div>

      {showForm && (
        <div style={{background:"#FFF",borderRadius:"12px",padding:"16px 20px",marginBottom:"16px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",border:"1px solid #F3F4F6"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:"12px",alignItems:"end"}}>
            <div>
              <label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Nombre del proveedor *</label>
              <input value={newProv.nombre} onChange={e => setNewProv({...newProv, nombre: e.target.value})} onKeyDown={e => e.key === "Enter" && guardarProveedor()} placeholder="Ej: Distribuidora del Pacifico" style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px"}} />
            </div>
            <div>
              <label style={{fontSize:"11px",fontWeight:"600",color:"#6B7280",display:"block",marginBottom:"4px"}}>Categoria default</label>
              <select value={newProv.categoria_default} onChange={e => setNewProv({...newProv, categoria_default: e.target.value})} style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #E5E7EB",fontSize:"13px"}}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
              </select>
            </div>
            <button onClick={guardarProveedor} style={{padding:"8px 20px",borderRadius:"8px",border:"none",background:"#3D1C1E",color:"#C8FF00",fontSize:"12px",fontWeight:"700",cursor:"pointer",height:"38px"}}>Guardar</button>
          </div>
        </div>
      )}

      <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 200px 60px",padding:"10px 24px",borderBottom:"1px solid #F3F4F6",background:"#FAFBFC"}}>
          {["Proveedor","Categoria Default",""].map(h => <span key={h} style={{fontSize:"11px",fontWeight:"700",color:"#9CA3AF",textTransform:"uppercase" as const,letterSpacing:"0.5px"}}>{h}</span>)}
        </div>
        {proveedores.length === 0 ? (
          <div style={{padding:"40px",textAlign:"center" as const}}>
            <Package style={{width:"32px",height:"32px",color:"#D1D5DB",margin:"0 auto 8px"}} />
            <p style={{fontSize:"13px",color:"#9CA3AF"}}>Sin proveedores. Agrega el primero.</p>
          </div>
        ) : proveedores.map((p: any) => (
          <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 200px 60px",padding:"12px 24px",borderBottom:"1px solid #F9FAFB",alignItems:"center"}}>
            <span style={{fontSize:"13px",fontWeight:"600",color:"#111827"}}>{p.nombre}</span>
            <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"6px",background:"#F3F4F6",color:"#374151",width:"fit-content"}}>{(p.categoria_default||"").replace(/_/g," ")}</span>
            <button onClick={() => eliminarProveedor(p.id)} style={{border:"none",background:"none",cursor:"pointer",padding:"4px"}}><Trash2 style={{width:"14px",height:"14px",color:"#DC2626"}} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};
