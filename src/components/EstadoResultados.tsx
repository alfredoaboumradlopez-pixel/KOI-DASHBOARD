import { useState, useEffect } from "react";
import { FileText, TrendingUp, TrendingDown, DollarSign, AlertTriangle } from "lucide-react";
import { api } from "../services/api";

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export const EstadoResultados = () => {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(2026);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const f = async () => {
      setLoading(true);
      try {
        const d = await api.get("/api/pl/" + mes + "/" + anio);
        setData(d);
      } catch(e) { setData(null); }
      setLoading(false);
    };
    f();
  }, [mes, anio]);

  const pct = (n: number, total: number) => total > 0 ? (n / total * 100).toFixed(1) + "%" : "--";
  const v = data?.ventas_totales || 0;

  return (
    <div style={{maxWidth:"900px",margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg,#3D1C1E,#5C2D30)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <FileText style={{width:"20px",height:"20px",color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px",fontWeight:"800",color:"#111827",margin:0}}>Estado de Resultados</h1>
            <p style={{fontSize:"13px",color:"#9CA3AF",margin:0}}>P&L mensual automatico</p>
          </div>
        </div>
        <div style={{display:"flex",gap:"4px",background:"#FFF",borderRadius:"10px",padding:"3px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
            <button key={m} onClick={() => setMes(m)} style={{padding:"6px 10px",borderRadius:"8px",border:"none",background:mes===m?"#3D1C1E":"transparent",color:mes===m?"#C8FF00":"#9CA3AF",fontSize:"11px",fontWeight:"700",cursor:"pointer"}}>{MESES[m].slice(0,3)}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:"40px"}}><p style={{color:"#9CA3AF"}}>Cargando...</p></div>
      ) : !data ? (
        <div style={{textAlign:"center",padding:"40px"}}><p style={{color:"#9CA3AF"}}>Sin datos para {MESES[mes]} {anio}</p></div>
      ) : (
        <div style={{background:"#FFF",borderRadius:"14px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
          <div style={{padding:"16px 24px",background:"#FAFBFC",borderBottom:"1px solid #F3F4F6",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:"15px",fontWeight:"700",color:"#111827"}}>P&L {MESES[mes]} {anio}</span>
            <span style={{fontSize:"12px",color:"#9CA3AF"}}>{data.dias_registrados} dias registrados</span>
          </div>

          {[
            {label:"VENTAS TOTALES",value:data.ventas_totales,pct:"100%",bold:true,color:"#059669",bg:"#ECFDF5"},
            {label:"Propinas recibidas",value:data.total_propinas,pct:pct(data.total_propinas,v),indent:true,color:"#6B7280"},
            {label:"(-) Costo Materia Prima",value:-data.costo_materia_prima,pct:pct(data.costo_materia_prima,v),color:"#DC2626"},
            {label:"UTILIDAD BRUTA",value:data.utilidad_bruta,pct:pct(data.utilidad_bruta,v),bold:true,color:data.utilidad_bruta>=0?"#059669":"#DC2626",bg:"#F9FAFB"},
            {label:"(-) Gastos Operativos",value:-data.gastos_operativos,pct:pct(data.gastos_operativos,v),color:"#DC2626"},
            {label:"(-) Gastos Fijos (Renta, Luz, Software)",value:-data.gastos_fijos,pct:pct(data.gastos_fijos,v),color:"#DC2626"},
            {label:"(-) Nomina",value:-data.gastos_nomina,pct:pct(data.gastos_nomina,v),color:"#DC2626"},
            {label:"(-) Comisiones (Bancarias + Plataformas)",value:-data.comisiones,pct:pct(data.comisiones,v),color:"#DC2626"},
            {label:"(-) Propinas Pagadas",value:-data.propinas_pagadas,pct:pct(data.propinas_pagadas,v),color:"#DC2626"},
            {label:"(-) Otros",value:-data.otros,pct:pct(data.otros,v),color:"#6B7280"},
            {label:"UTILIDAD OPERATIVA",value:data.utilidad_operativa,pct:pct(data.utilidad_operativa,v),bold:true,color:data.utilidad_operativa>=0?"#059669":"#DC2626",bg:"#F9FAFB"},
            {label:"(-) Impuestos",value:-data.impuestos,pct:pct(data.impuestos,v),color:"#DC2626"},
            {label:"UTILIDAD NETA",value:data.utilidad_neta,pct:pct(data.utilidad_neta,v),bold:true,color:data.utilidad_neta>=0?"#059669":"#DC2626",bg:data.utilidad_neta>=0?"#ECFDF5":"#FEF2F2"},
          ].map((row, i) => (
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:row.bold?"14px 24px":"10px 24px",paddingLeft:row.indent?"48px":"24px",borderBottom:"1px solid #F9FAFB",background:row.bg||"transparent",alignItems:"center"}}>
              <span style={{fontSize:row.bold?"14px":"13px",fontWeight:row.bold?"800":"500",color:row.bold?row.color:"#374151"}}>{row.label}</span>
              <span style={{fontSize:row.bold?"15px":"13px",fontWeight:row.bold?"800":"600",color:row.color,textAlign:"right",fontFeatureSettings:"'tnum'"}}>{formatMXN(row.value)}</span>
              <span style={{fontSize:"11px",fontWeight:"600",color:row.color,textAlign:"right"}}>{row.pct}</span>
            </div>
          ))}

          {data.desglose_categorias && Object.keys(data.desglose_categorias).length > 0 && (
            <>
              <div style={{padding:"14px 24px",background:"#FAFBFC",borderTop:"2px solid #F3F4F6"}}>
                <span style={{fontSize:"13px",fontWeight:"700",color:"#111827"}}>Desglose por Categoria</span>
              </div>
              {Object.entries(data.desglose_categorias).sort((a: any, b: any) => b[1] - a[1]).map(([cat, monto]: any, i: number) => (
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:"8px 24px 8px 48px",borderBottom:"1px solid #F9FAFB",alignItems:"center"}}>
                  <span style={{fontSize:"12px",color:"#374151"}}>{cat.replace(/_/g," ")}</span>
                  <span style={{fontSize:"12px",fontWeight:"600",color:"#111827",textAlign:"right"}}>{formatMXN(monto)}</span>
                  <span style={{fontSize:"11px",color:"#9CA3AF",textAlign:"right"}}>{pct(monto, v)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {data && (
        <div style={{background:"#3D1C1E",borderRadius:"14px",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"16px"}}>
          <div>
            <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>UTILIDAD NETA {MESES[mes].toUpperCase()}</span>
            <div style={{fontSize:"28px",fontWeight:"900",color:data.utilidad_neta>=0?"#C8FF00":"#FF6B6B",marginTop:"4px"}}>{formatMXN(data.utilidad_neta)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>MARGEN NETO</span>
            <div style={{fontSize:"28px",fontWeight:"900",color:"#FFF",marginTop:"4px"}}>{data.pct_utilidad_neta?.toFixed(1)||"--"}%</div>
          </div>
        </div>
      )}
    </div>
  );
};
