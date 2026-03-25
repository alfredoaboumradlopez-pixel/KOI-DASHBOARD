import { useState, useEffect, useMemo } from "react";
import { PieChart, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, DollarSign, BarChart3, Banknote } from "lucide-react";
import { api } from "../services/api";

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const pctNum = (n: number, total: number) => total > 0 ? (n / total) * 100 : 0;

interface CatInfo { cat: string; label: string; min: number; max: number; esMP: boolean; }

const CATS: CatInfo[] = [
  { cat:"PROTEINA", label:"Proteina", min:8, max:12, esMP:true },
  { cat:"VEGETALES_FRUTAS", label:"Vegetales y Frutas", min:2, max:4, esMP:true },
  { cat:"ABARROTES", label:"Abarrotes", min:2, max:4, esMP:true },
  { cat:"BEBIDAS", label:"Bebidas", min:3, max:5, esMP:true },
  { cat:"PRODUCTOS_ASIATICOS", label:"Productos Asiaticos", min:3, max:5, esMP:true },
  { cat:"DESECHABLES_EMPAQUES", label:"Desechables y Empaques", min:2, max:3, esMP:false },
  { cat:"LIMPIEZA_MANTTO", label:"Limpieza y Mantto", min:1, max:2, esMP:false },
  { cat:"UTENSILIOS", label:"Utensilios", min:1, max:2, esMP:false },
  { cat:"PERSONAL", label:"Personal", min:3, max:5, esMP:false },
  { cat:"PROPINAS", label:"Propinas", min:0, max:0, esMP:false },
  { cat:"SERVICIOS", label:"Servicios", min:1, max:2, esMP:false },
  { cat:"EQUIPO", label:"Equipo", min:1, max:2, esMP:false },
  { cat:"MARKETING", label:"Marketing", min:2, max:4, esMP:false },
  { cat:"PAPELERIA", label:"Papeleria", min:0, max:1, esMP:false },
  { cat:"RENTA", label:"Renta", min:8, max:12, esMP:false },
  { cat:"LUZ", label:"Luz", min:2, max:4, esMP:false },
  { cat:"SOFTWARE", label:"Software", min:0, max:1, esMP:false },
  { cat:"COMISIONES_BANCARIAS", label:"Comisiones Bancarias", min:0, max:1, esMP:false },
  { cat:"IMPUESTOS", label:"Impuestos", min:0, max:0, esMP:false },
  { cat:"NOMINA", label:"Nomina", min:0, max:0, esMP:false },
  { cat:"COMISIONES_PLATAFORMAS", label:"Comisiones Plataformas", min:0, max:0, esMP:false },
  { cat:"OTROS", label:"Otros", min:0, max:0, esMP:false },
];

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function statusInfo(p: number, min: number, max: number) {
  if (min === 0 && max === 0) return { label:"-", color:"#9CA3AF", bg:"transparent" };
  if (p === 0) return { label:"-", color:"#9CA3AF", bg:"transparent" };
  if (p >= min && p <= max) return { label:"OK", color:"#059669", bg:"#ECFDF5" };
  if (p < min) return { label:"BAJO", color:"#2563EB", bg:"#EFF6FF" };
  return { label:"ALTO", color:"#DC2626", bg:"#FEF2F2" };
}

export const DashboardGastos = () => {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(2026);
  const [gastos, setGastos] = useState<any[]>([]);
  const [ventasMes, setVentasMes] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const f = async () => {
      setLoading(true);
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
      setLoading(false);
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

  const topGastos = CATS.map(c => ({...c, monto: porCat[c.cat]||0, pct: pctNum(porCat[c.cat]||0, ventasMes)})).filter(c => c.monto > 0).sort((a,b) => b.monto - a.monto);
  const maxMonto = topGastos.length > 0 ? topGastos[0].monto : 1;

  return (
    <div style={{maxWidth:"1200px",margin:"0 auto"}}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .dg-row { transition: background 0.1s; }
        .dg-row:hover { background: #FAFBFC !important; }
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
        <div style={{display:"flex",gap:"8px"}}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
            <button key={m} onClick={() => setMes(m)} style={{padding:"6px 12px",borderRadius:"8px",border:"none",background:mes===m?"#3D1C1E":"#FFF",color:mes===m?"#C8FF00":"#9CA3AF",fontSize:"12px",fontWeight:"700",cursor:"pointer",boxShadow:mes===m?"none":"0 1px 2px rgba(0,0,0,0.05)"}}>{MESES[m].slice(0,3)}</button>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px",marginBottom:"20px"}}>
        {[
          {l:"Ventas "+MESES[mes],v:formatMXN(ventasMes),s:anio+"",icon:DollarSign,c:"#059669"},
          {l:"Total Gastos",v:formatMXN(totalGastos),s:ventasMes>0?(pctNum(totalGastos,ventasMes).toFixed(1)+"% de ventas"):"sin ventas",icon:Banknote,c:"#3D1C1E"},
          {l:"Materia Prima",v:formatMXN(totalMP),s:pctMP.toFixed(1)+"% (bench: 28-35%)",icon:TrendingUp,c:pctMP>35?"#DC2626":pctMP<28&&totalMP>0?"#2563EB":"#059669"},
          {l:"Alertas",v:String(alertas),s:alertas>0?"sobre benchmark":"todo en rango",icon:AlertTriangle,c:alertas>0?"#DC2626":"#059669"},
        ].map((k,i) => {
          const Ic = k.icon;
          return (<div key={i} style={{background:"#FFF",borderRadius:"14px",padding:"18px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)",animation:"slideUp 0.3s ease "+(i*0.05)+"s both"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:"11px",fontWeight:"600",color:"#9CA3AF",textTransform:"uppercase" as const,letterSpacing:"0.5px"}}>{k.l}</span><Ic style={{width:"16px",height:"16px",color:k.c,opacity:0.7}} /></div>
            <div style={{fontSize:"22px",fontWeight:"800",color:"#111827",marginTop:"8px"}}>{k.v}</div>
            <span style={{fontSize:"11px",color:k.c==="#DC2626"?"#DC2626":"#9CA3AF",fontWeight:k.c==="#DC2626"?"700":"400"}}>{k.s}</span>
          </div>);
        })}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"16px"}}>

        <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
          <div style={{padding:"16px 20px",borderBottom:"1px solid #F3F4F6",display:"flex",alignItems:"center",gap:"8px"}}>
            <BarChart3 style={{width:"16px",height:"16px",color:"#3D1C1E"}} />
            <span style={{fontSize:"14px",fontWeight:"700",color:"#111827"}}>Top Gastos del Mes</span>
          </div>
          <div style={{padding:"12px 20px"}}>
            {topGastos.length === 0 ? (
              <div style={{padding:"24px",textAlign:"center" as const}}><p style={{fontSize:"13px",color:"#9CA3AF"}}>Sin gastos este mes</p></div>
            ) : topGastos.slice(0,8).map((c,i) => {
              const st = statusInfo(c.pct, c.min, c.max);
              const barW = Math.max((c.monto / maxMonto) * 100, 3);
              return (
                <div key={c.cat} className="dg-row" style={{display:"flex",alignItems:"center",gap:"12px",padding:"8px 0",borderBottom:i<7?"1px solid #F9FAFB":"none"}}>
                  <div style={{width:"120px",flexShrink:0}}>
                    <span style={{fontSize:"12px",fontWeight:"600",color:"#374151"}}>{c.label}</span>
                  </div>
                  <div style={{flex:1,height:"24px",background:"#F3F4F6",borderRadius:"6px",overflow:"hidden",position:"relative"}}>
                    <div style={{height:"100%",width:barW+"%",background:st.label==="ALTO"?"#DC2626":st.label==="OK"?"#059669":st.label==="BAJO"?"#3B82F6":"#9CA3AF",borderRadius:"6px",transition:"width 0.3s"}} />
                    <span style={{position:"absolute",right:"8px",top:"50%",transform:"translateY(-50%)",fontSize:"11px",fontWeight:"700",color:"#374151"}}>{formatMXN(c.monto)}</span>
                  </div>
                  <div style={{width:"50px",textAlign:"right" as const}}>
                    <span style={{fontSize:"11px",fontWeight:"700",color:st.color}}>{c.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{width:"50px"}}>
                    {st.label !== "-" && <span style={{fontSize:"10px",fontWeight:"700",padding:"2px 6px",borderRadius:"4px",background:st.bg,color:st.color}}>{st.label}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
          <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid #F3F4F6"}}>
              <span style={{fontSize:"14px",fontWeight:"700",color:"#111827"}}>Materia Prima</span>
              <span style={{fontSize:"11px",color:"#9CA3AF",marginLeft:"8px"}}>Benchmark: 28%-35%</span>
            </div>
            <div style={{padding:"16px 20px"}}>
              {CATS.filter(c => c.esMP).map(c => {
                const monto = porCat[c.cat]||0;
                const p = pctNum(monto, ventasMes);
                const st = statusInfo(p, c.min, c.max);
                return (
                  <div key={c.cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F9FAFB"}}>
                    <span style={{fontSize:"12px",color:"#374151"}}>{c.label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                      <span style={{fontSize:"12px",fontWeight:"700",color:"#111827",fontFeatureSettings:"'tnum'"}}>{formatMXN(monto)}</span>
                      <span style={{fontSize:"11px",fontWeight:"600",color:st.color,width:"40px",textAlign:"right" as const}}>{monto>0?p.toFixed(1)+"%":"-"}</span>
                      {st.label !== "-" && <span style={{fontSize:"9px",fontWeight:"700",padding:"2px 5px",borderRadius:"4px",background:st.bg,color:st.color,width:"36px",textAlign:"center" as const}}>{st.label}</span>}
                    </div>
                  </div>
                );
              })}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",marginTop:"4px",borderTop:"2px solid #3D1C1E"}}>
                <span style={{fontSize:"13px",fontWeight:"800",color:"#3D1C1E"}}>Total MP</span>
                <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                  <span style={{fontSize:"13px",fontWeight:"800",color:"#3D1C1E"}}>{formatMXN(totalMP)}</span>
                  <span style={{fontSize:"12px",fontWeight:"800",color:pctMP>35?"#DC2626":pctMP<28&&totalMP>0?"#2563EB":"#059669"}}>{pctMP.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid #F3F4F6"}}>
              <span style={{fontSize:"14px",fontWeight:"700",color:"#111827"}}>Gastos Operativos</span>
            </div>
            <div style={{padding:"12px 20px"}}>
              {CATS.filter(c => !c.esMP && (porCat[c.cat]||0) > 0).map(c => {
                const monto = porCat[c.cat]||0;
                const p = pctNum(monto, ventasMes);
                const st = statusInfo(p, c.min, c.max);
                return (
                  <div key={c.cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #F9FAFB"}}>
                    <span style={{fontSize:"12px",color:"#374151"}}>{c.label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                      <span style={{fontSize:"12px",fontWeight:"700",color:"#111827"}}>{formatMXN(monto)}</span>
                      <span style={{fontSize:"11px",fontWeight:"600",color:st.color,width:"40px",textAlign:"right" as const}}>{p.toFixed(1)+"%"}</span>
                      {st.label !== "-" && <span style={{fontSize:"9px",fontWeight:"700",padding:"2px 5px",borderRadius:"4px",background:st.bg,color:st.color,width:"36px",textAlign:"center" as const}}>{st.label}</span>}
                    </div>
                  </div>
                );
              })}
              {CATS.filter(c => !c.esMP && (porCat[c.cat]||0) > 0).length === 0 && (
                <div style={{padding:"16px",textAlign:"center" as const}}><p style={{fontSize:"12px",color:"#9CA3AF"}}>Sin gastos operativos</p></div>
              )}
            </div>
          </div>
        </div>
      </div>

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
