import React, { useState, useEffect, useMemo } from "react";
import { PieChart, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, DollarSign, Banknote } from "lucide-react";
import { api } from "../services/api";

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const pctNum = (n: number, total: number) => total > 0 ? (n / total) * 100 : 0;

interface CatInfo { cat: string; label: string; emoji: string; min: number; max: number; esMP: boolean; color: string; bg: string; }

const CATS: CatInfo[] = [
  { cat:"PROTEINA", label:"Proteina", emoji:"\uD83E\uDD69", min:8, max:12, esMP:true, color:"#DC2626", bg:"#FEF2F2" },
  { cat:"VEGETALES_FRUTAS", label:"Vegetales y Frutas", emoji:"\uD83E\uDD66", min:2, max:4, esMP:true, color:"#16A34A", bg:"#F0FDF4" },
  { cat:"ABARROTES", label:"Abarrotes", emoji:"\uD83C\uDF5A", min:2, max:4, esMP:true, color:"#CA8A04", bg:"#FEFCE8" },
  { cat:"BEBIDAS", label:"Bebidas", emoji:"\uD83E\uDD64", min:3, max:5, esMP:true, color:"#2563EB", bg:"#EFF6FF" },
  { cat:"PRODUCTOS_ASIATICOS", label:"Productos Asiaticos", emoji:"\uD83C\uDF63", min:3, max:5, esMP:true, color:"#E11D48", bg:"#FFF1F2" },
  { cat:"DESECHABLES_EMPAQUES", label:"Desechables", emoji:"\uD83E\uDDCA", min:2, max:3, esMP:false, color:"#7C3AED", bg:"#F5F3FF" },
  { cat:"LIMPIEZA_MANTTO", label:"Limpieza y Mantto", emoji:"\uD83E\uDDF9", min:1, max:2, esMP:false, color:"#0891B2", bg:"#ECFEFF" },
  { cat:"UTENSILIOS", label:"Utensilios", emoji:"\uD83C\uDF74", min:1, max:2, esMP:false, color:"#6B7280", bg:"#F9FAFB" },
  { cat:"PERSONAL", label:"Personal", emoji:"\uD83D\uDC64", min:3, max:5, esMP:false, color:"#EA580C", bg:"#FFF7ED" },
  { cat:"PROPINAS", label:"Propinas", emoji:"\uD83D\uDCB0", min:0, max:0, esMP:false, color:"#16A34A", bg:"#F0FDF4" },
  { cat:"SERVICIOS", label:"Servicios", emoji:"\u26A1", min:1, max:2, esMP:false, color:"#CA8A04", bg:"#FEFCE8" },
  { cat:"EQUIPO", label:"Equipo", emoji:"\uD83D\uDD27", min:1, max:2, esMP:false, color:"#475569", bg:"#F8FAFC" },
  { cat:"MARKETING", label:"Marketing", emoji:"\uD83D\uDCE3", min:2, max:4, esMP:false, color:"#DB2777", bg:"#FDF2F8" },
  { cat:"PAPELERIA", label:"Papeleria", emoji:"\uD83D\uDCCB", min:0, max:1, esMP:false, color:"#6B7280", bg:"#F9FAFB" },
  { cat:"RENTA", label:"Renta", emoji:"\uD83C\uDFE0", min:8, max:12, esMP:false, color:"#7C3AED", bg:"#F5F3FF" },
  { cat:"LUZ", label:"Luz", emoji:"\uD83D\uDCA1", min:2, max:4, esMP:false, color:"#F59E0B", bg:"#FFFBEB" },
  { cat:"SOFTWARE", label:"Software", emoji:"\uD83D\uDCBB", min:0, max:1, esMP:false, color:"#2563EB", bg:"#EFF6FF" },
  { cat:"COMISIONES_BANCARIAS", label:"Comisiones Bancarias", emoji:"\uD83C\uDFE6", min:0, max:1, esMP:false, color:"#475569", bg:"#F8FAFC" },
  { cat:"IMPUESTOS", label:"Impuestos", emoji:"\uD83D\uDCCA", min:0, max:0, esMP:false, color:"#DC2626", bg:"#FEF2F2" },
  { cat:"NOMINA", label:"Nomina", emoji:"\uD83D\uDCB5", min:0, max:0, esMP:false, color:"#059669", bg:"#ECFDF5" },
  { cat:"COMISIONES_PLATAFORMAS", label:"Comisiones Plataformas", emoji:"\uD83D\uDCF1", min:0, max:0, esMP:false, color:"#EA580C", bg:"#FFF7ED" },
  { cat:"OTROS", label:"Otros", emoji:"\uD83D\uDCE6", min:0, max:0, esMP:false, color:"#6B7280", bg:"#F9FAFB" },
];

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function statusInfo(p: number, min: number, max: number) {
  if (min === 0 && max === 0) return null;
  if (p === 0) return null;
  if (p >= min && p <= max) return { label:"OK", color:"#059669", bg:"#ECFDF5", icon: CheckCircle };
  if (p < min) return { label:"BAJO", color:"#2563EB", bg:"#EFF6FF", icon: TrendingDown };
  return { label:"ALTO", color:"#DC2626", bg:"#FEF2F2", icon: TrendingUp };
}

export const DashboardGastos = () => {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(2026);
  const [gastos, setGastos] = useState<any[]>([]);
  const [catDetalle, setCatDetalle] = useState<string | null>(null);
  const detalleRef = React.useRef<HTMLDivElement>(null);
  const [ventasMes, setVentasMes] = useState(0);

  useEffect(() => { if (catDetalle && detalleRef.current) detalleRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [catDetalle]);

  useEffect(() => {
    const f = async () => {
      try {
        const m = String(mes).padStart(2,"0");
        const ini = anio+"-"+m+"-01";
        const last = new Date(anio, mes, 0).getDate();
        const fin = anio+"-"+m+"-"+String(last).padStart(2,"0");
        const g = await api.get("/api/gastos?fecha_inicio="+ini+"&fecha_fin="+fin);
        setGastos(Array.isArray(g) ? g : []);
        try {
          const v = await api.get("/api/reportes/ventas-diarias?mes="+mes+"&anio="+anio);
          setVentasMes(Array.isArray(v) ? v.reduce((s: number,d: any) => s+(d.total||0),0) : 0);
        } catch(e) { setVentasMes(0); }
      } catch(e) { setGastos([]); }
    };
    f();
  }, [mes, anio]);

  const porCat = useMemo(() => {
    const m: Record<string,number> = {};
    gastos.forEach((g: any) => { const c = g.categoria||"OTROS"; m[c]=(m[c]||0)+(g.total||g.monto||0); });
    return m;
  }, [gastos]);

  const totalGastos = Object.values(porCat).reduce((s,v) => s+v, 0);
  const totalMP = CATS.filter(c => c.esMP).reduce((s,c) => s+(porCat[c.cat]||0), 0);
  const pctMP = pctNum(totalMP, ventasMes);
  const alertas = CATS.filter(c => { const p = pctNum(porCat[c.cat]||0, ventasMes); return c.max > 0 && p > c.max; }).length;

  const catsConGasto = CATS.filter(c => (porCat[c.cat]||0) > 0);
  const catsSinGasto = CATS.filter(c => (porCat[c.cat]||0) === 0);

  return (
    <div style={{maxWidth:"1200px",margin:"0 auto"}}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .cat-card { transition: transform 0.15s, box-shadow 0.15s; cursor: default; }
        .cat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important; }
      `}</style>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg,#3D1C1E,#5C2D30)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <PieChart style={{width:"20px",height:"20px",color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px",fontWeight:"800",color:"#111827",margin:0}}>Dashboard de Gastos</h1>
            <p style={{fontSize:"13px",color:"#9CA3AF",margin:0}}>Analisis mensual vs benchmarks</p>
          </div>
        </div>
        <div style={{display:"flex",gap:"4px",background:"#FFF",borderRadius:"10px",padding:"3px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
            <button key={m} onClick={() => setMes(m)} style={{padding:"6px 10px",borderRadius:"8px",border:"none",background:mes===m?"#3D1C1E":"transparent",color:mes===m?"#C8FF00":"#9CA3AF",fontSize:"11px",fontWeight:"700",cursor:"pointer"}}>{MESES[m].slice(0,3)}</button>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px",marginBottom:"24px"}}>
        {[
          {l:"Ventas "+MESES[mes],v:formatMXN(ventasMes),s:anio+"",icon:DollarSign,c:"#059669"},
          {l:"Total Gastos",v:formatMXN(totalGastos),s:ventasMes>0?(pctNum(totalGastos,ventasMes).toFixed(1)+"% de ventas"):"--",icon:Banknote,c:"#3D1C1E"},
          {l:"Materia Prima",v:formatMXN(totalMP),s:pctMP.toFixed(1)+"% (bench 28-35%)",icon:TrendingUp,c:pctMP>35?"#DC2626":"#059669"},
          {l:"Alertas",v:String(alertas),s:alertas>0?"sobre benchmark":"todo OK",icon:AlertTriangle,c:alertas>0?"#DC2626":"#059669"},
        ].map((k,i) => {
          const Ic = k.icon;
          return (<div key={i} style={{background:"#FFF",borderRadius:"14px",padding:"18px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",animation:"slideUp 0.3s ease "+(i*0.05)+"s both"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:"11px",fontWeight:"600",color:"#9CA3AF",textTransform:"uppercase" as const,letterSpacing:"0.5px"}}>{k.l}</span><Ic style={{width:"16px",height:"16px",color:k.c,opacity:0.7}} /></div>
            <div style={{fontSize:"22px",fontWeight:"800",color:"#111827",marginTop:"8px"}}>{k.v}</div>
            <span style={{fontSize:"11px",color:k.c==="#DC2626"?"#DC2626":"#9CA3AF",fontWeight:k.c==="#DC2626"?"700":"400"}}>{k.s}</span>
          </div>);
        })}
      </div>

      {catsConGasto.length > 0 && (
        <>
          <div style={{fontSize:"13px",fontWeight:"700",color:"#111827",marginBottom:"12px"}}>Categorias con gastos este mes</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"24px"}}>
            {catsConGasto.sort((a,b) => (porCat[b.cat]||0)-(porCat[a.cat]||0)).map((c,i) => {
              const monto = porCat[c.cat]||0;
              const p = pctNum(monto, ventasMes);
              const st = statusInfo(p, c.min, c.max);
              const StIcon = st?.icon;
              return (
                <div key={c.cat} className="cat-card" onClick={() => setCatDetalle(catDetalle === c.cat ? null : c.cat)} style={{background:catDetalle===c.cat?"#F9FAFB":"#FFF",borderRadius:"14px",padding:"16px 18px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",borderLeft:"4px solid "+c.color,animation:"slideUp 0.25s ease "+(i*0.04)+"s both",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <span style={{fontSize:"20px"}}>{c.emoji}</span>
                      <div>
                        <div style={{fontSize:"13px",fontWeight:"700",color:"#111827"}}>{c.label}</div>
                        {c.esMP && <span style={{fontSize:"9px",padding:"1px 5px",borderRadius:"4px",background:"#FEF2F2",color:"#DC2626",fontWeight:"700"}}>MP</span>}
                      </div>
                    </div>
                    {st && StIcon && <span style={{display:"inline-flex",alignItems:"center",gap:"3px",fontSize:"10px",fontWeight:"700",padding:"3px 7px",borderRadius:"6px",background:st.bg,color:st.color}}><StIcon style={{width:"10px",height:"10px"}} />{st.label}</span>}
                  </div>
                  <div style={{marginTop:"12px",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                    <div>
                      <div style={{fontSize:"20px",fontWeight:"800",color:"#111827"}}>{formatMXN(monto)}</div>
                      <div style={{fontSize:"11px",color:"#9CA3AF",marginTop:"2px"}}>{p.toFixed(1)}% de ventas</div>
                    </div>
                    {c.min > 0 && <div style={{textAlign:"right" as const}}>
                      <div style={{fontSize:"10px",color:"#9CA3AF"}}>Benchmark</div>
                      <div style={{fontSize:"12px",fontWeight:"700",color:"#6B7280"}}>{c.min}%-{c.max}%</div>
                    </div>}
                  </div>
                  <div style={{marginTop:"10px",height:"4px",background:"#F3F4F6",borderRadius:"2px",overflow:"hidden"}}>
                    <div style={{height:"100%",width:Math.min(p/(c.max||100)*100,100)+"%",background:c.color,borderRadius:"2px",transition:"width 0.3s"}} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {catDetalle && (() => {
        const catInfo = CATS.find(c => c.cat === catDetalle);
        const gastosCategoria = gastos.filter((g: any) => g.categoria === catDetalle);
        const totalCat = gastosCategoria.reduce((s: number, g: any) => s + (g.total || g.monto || 0), 0);
        return (
          <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",marginBottom:"24px",borderTop:"4px solid "+(catInfo?.color||"#6B7280")}} ref={detalleRef}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid #F3F4F6",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <span style={{fontSize:"18px"}}>{catInfo?.emoji}</span>
                <span style={{fontSize:"15px",fontWeight:"700",color:"#111827"}}>{catInfo?.label}</span>
                <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"10px",background:"#F3F4F6",color:"#6B7280"}}>{gastosCategoria.length} gasto{gastosCategoria.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                <span style={{fontSize:"16px",fontWeight:"800",color:"#111827"}}>{formatMXN(totalCat)}</span>
                <button onClick={() => setCatDetalle(null)} style={{border:"none",background:"#F3F4F6",borderRadius:"6px",padding:"4px 10px",fontSize:"11px",cursor:"pointer",color:"#6B7280"}}>Cerrar</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"90px 1fr 100px 100px 90px",padding:"8px 20px",borderBottom:"1px solid #F3F4F6",background:"#FAFBFC"}}>
              {["Fecha","Proveedor","Monto","Metodo","Comprobante"].map(h => <span key={h} style={{fontSize:"10px",fontWeight:"700",color:"#9CA3AF",textTransform:"uppercase" as const}}>{h}</span>)}
            </div>
            {gastosCategoria.length === 0 ? (
              <div style={{padding:"24px",textAlign:"center" as const}}><p style={{fontSize:"12px",color:"#9CA3AF"}}>Sin gastos en esta categoria</p></div>
            ) : gastosCategoria.sort((a: any, b: any) => (b.fecha||"").localeCompare(a.fecha||"")).map((g: any) => (
              <div key={g.id} style={{display:"grid",gridTemplateColumns:"90px 1fr 100px 100px 90px",padding:"10px 20px",borderBottom:"1px solid #F9FAFB",alignItems:"center"}}>
                <span style={{fontSize:"12px",color:"#374151"}}>{g.fecha}</span>
                <div><span style={{fontSize:"13px",fontWeight:"600",color:"#111827"}}>{g.proveedor}</span>{g.descripcion && <div style={{fontSize:"11px",color:"#9CA3AF"}}>{g.descripcion}</div>}</div>
                <span style={{fontSize:"13px",fontWeight:"700",color:"#111827"}}>{formatMXN(g.total||g.monto||0)}</span>
                <span style={{fontSize:"11px",color:"#6B7280"}}>{(g.metodo_pago||"").replace(/_/g," ")}</span>
                <span style={{fontSize:"10px",padding:"2px 6px",borderRadius:"4px",background:"#FDF4FF",color:"#7E22CE"}}>{(g.comprobante||"").replace(/_/g," ")}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {catsSinGasto.length > 0 && (
        <>
          <div style={{fontSize:"13px",fontWeight:"700",color:"#9CA3AF",marginBottom:"10px"}}>Sin gastos este mes</div>
          <div style={{display:"flex",flexWrap:"wrap" as const,gap:"8px",marginBottom:"24px"}}>
            {catsSinGasto.map(c => (
              <span key={c.cat} style={{display:"inline-flex",alignItems:"center",gap:"4px",fontSize:"11px",padding:"4px 10px",borderRadius:"8px",background:"#F9FAFB",color:"#9CA3AF"}}>{c.emoji} {c.label}</span>
            ))}
          </div>
        </>
      )}

      <div style={{background:"#3D1C1E",borderRadius:"14px",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>TOTAL GASTOS {MESES[mes].toUpperCase()} {anio}</span>
          <div style={{fontSize:"28px",fontWeight:"900",color:"#C8FF00",marginTop:"4px"}}>{formatMXN(totalGastos)}</div>
        </div>
        <div style={{textAlign:"right" as const}}>
          <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>% SOBRE VENTAS</span>
          <div style={{fontSize:"28px",fontWeight:"900",color:"#FFF",marginTop:"4px"}}>{ventasMes>0?pctNum(totalGastos,ventasMes).toFixed(1)+"%":"--"}</div>
        </div>
      </div>
    </div>
  );
};
