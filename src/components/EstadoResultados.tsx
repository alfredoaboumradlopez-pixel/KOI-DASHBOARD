import { useState, useEffect, useMemo } from "react";
import { FileText, ChevronRight, ChevronDown } from "lucide-react";
import { api } from "../services/api";

const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// categoria_pl groups for grouping subcategories
const COSTO_PL = new Set(["costo_alimentos", "costo_bebidas"]);
const NOMINA_PL = new Set(["nomina"]);
// everything else → opex

const RESTAURANTE_ID = 6;

export const EstadoResultados = () => {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(2026);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  // Default all groups open so categories are always visible
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["costo", "nomina", "opex"]));

  const isRBO = localStorage.getItem("user_role") === "SUPER_ADMIN";

  useEffect(() => {
    const f = async () => {
      setLoading(true);
      try {
        const resp = await api.get(`/api/pl/${RESTAURANTE_ID}/mes/${anio}/${mes}`);
        // pl_router wraps response in {data, generado_en, periodo}
        const d = resp.data ?? resp;
        console.log("[P&L] raw response:", resp);
        console.log("[P&L] gastos_por_categoria:", d?.gastos_por_categoria);
        setData(d);
      } catch(e) { setData(null); }
      setLoading(false);
    };
    f();
  }, [mes, anio]);

  const pct = (n: number, total: number) => total > 0 ? (n / total * 100).toFixed(1) + "%" : "--";
  // PLResult field names (pl_service) — different from legacy endpoint
  const v = data?.ventas_netas || 0;

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Build category buckets from gastos_por_categoria
  const catBuckets = useMemo(() => {
    const cats: any[] = data?.gastos_por_categoria || [];
    return {
      costo: cats.filter((c: any) => COSTO_PL.has(c.categoria_pl)),
      nomina: cats.filter((c: any) => NOMINA_PL.has(c.categoria_pl)),
      opex: cats.filter((c: any) => !COSTO_PL.has(c.categoria_pl) && !NOMINA_PL.has(c.categoria_pl) && c.categoria_pl !== "impuestos"),
    };
  }, [data]);

  const SubcatRows = ({ cats, visible }: { cats: any[]; visible: boolean }) => {
    if (!visible || cats.length === 0) return null;
    return (
      <>
        {cats.map((c: any) => (
          <div key={c.categoria} style={{ display: "grid", gridTemplateColumns: "1fr 150px 80px", padding: "6px 24px 6px 52px", borderBottom: "1px solid #F9FAFB", alignItems: "center", background: "#FAFBFC" }}>
            <span style={{ fontSize: "12px", color: "#6B7280" }}>{c.categoria.replace(/_/g, " ")}</span>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151", textAlign: "right", fontFeatureSettings: "'tnum'" }}>{fmt(c.monto)}</span>
            <span style={{ fontSize: "11px", color: "#9CA3AF", textAlign: "right" }}>{c.pct_ventas}%</span>
          </div>
        ))}
      </>
    );
  };

  const ParentRow = ({
    label, value, groupKey, cats, color,
  }: { label: string; value: number; groupKey: string; cats: any[]; color: string }) => {
    const isExpanded = isRBO || expandedGroups.has(groupKey);
    const hasCats = cats.length > 0;
    return (
      <>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 150px 80px", padding: "10px 24px", borderBottom: "1px solid #F9FAFB", alignItems: "center", cursor: hasCats && !isRBO ? "pointer" : "default" }}
          onClick={() => hasCats && !isRBO && toggleGroup(groupKey)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {hasCats && !isRBO && (
              isExpanded
                ? <ChevronDown style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
                : <ChevronRight style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: "13px", fontWeight: "500", color: "#374151", paddingLeft: hasCats && !isRBO ? 0 : "20px" }}>{label}</span>
          </div>
          <span style={{ fontSize: "13px", fontWeight: "600", color, textAlign: "right", fontFeatureSettings: "'tnum'" }}>{fmt(value)}</span>
          <span style={{ fontSize: "11px", fontWeight: "600", color, textAlign: "right" }}>{pct(value, v)}</span>
        </div>
        <SubcatRows cats={cats} visible={isExpanded} />
      </>
    );
  };

  return (
    <div style={{maxWidth:"900px",margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg,#3D1C1E,#5C2D30)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <FileText style={{width:"20px",height:"20px",color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px",fontWeight:"800",color:"#111827",margin:0}}>Estado de Resultados</h1>
            <p style={{fontSize:"13px",color:"#9CA3AF",margin:0}}>P&L mensual automático</p>
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
            <span style={{fontSize:"12px",color:"#9CA3AF"}}>{data.dias_con_datos} días registrados</span>
          </div>

          {/* Ventas netas */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:"14px 24px",borderBottom:"1px solid #F9FAFB",background:"#ECFDF5",alignItems:"center"}}>
            <span style={{fontSize:"14px",fontWeight:"800",color:"#059669"}}>VENTAS NETAS</span>
            <span style={{fontSize:"15px",fontWeight:"800",color:"#059669",textAlign:"right",fontFeatureSettings:"'tnum'"}}>{fmt(v)}</span>
            <span style={{fontSize:"11px",fontWeight:"600",color:"#059669",textAlign:"right"}}>100%</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:"10px 24px",paddingLeft:"48px",borderBottom:"1px solid #F9FAFB",alignItems:"center"}}>
            <span style={{fontSize:"13px",color:"#374151"}}>Propinas recibidas</span>
            <span style={{fontSize:"13px",fontWeight:"600",color:"#6B7280",textAlign:"right",fontFeatureSettings:"'tnum'"}}>{fmt(data.propinas_totales||0)}</span>
            <span style={{fontSize:"11px",color:"#6B7280",textAlign:"right"}}>{pct(data.propinas_totales||0,v)}</span>
          </div>

          {/* Costo de ventas */}
          <ParentRow
            label="↳ Costo de ventas"
            value={data.total_costo_ventas||0}
            groupKey="costo"
            cats={catBuckets.costo}
            color="#DC2626"
          />

          {/* Utilidad bruta */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:"14px 24px",borderBottom:"1px solid #F9FAFB",background:"#F9FAFB",alignItems:"center"}}>
            <span style={{fontSize:"14px",fontWeight:"800",color:data.utilidad_bruta>=0?"#059669":"#DC2626"}}>UTILIDAD BRUTA</span>
            <span style={{fontSize:"15px",fontWeight:"800",color:data.utilidad_bruta>=0?"#059669":"#DC2626",textAlign:"right",fontFeatureSettings:"'tnum'"}}>{fmt(data.utilidad_bruta||0)}</span>
            <span style={{fontSize:"11px",fontWeight:"600",color:data.utilidad_bruta>=0?"#059669":"#DC2626",textAlign:"right"}}>{pct(data.utilidad_bruta||0,v)}</span>
          </div>

          {/* Nómina */}
          <ParentRow
            label="↳ Nómina"
            value={data.gastos_nomina||0}
            groupKey="nomina"
            cats={catBuckets.nomina}
            color="#DC2626"
          />

          {/* Gastos operativos (renta + servicios + mantto + limpieza + marketing + admin + otros) */}
          <ParentRow
            label="↳ Gastos operativos"
            value={(data.gastos_renta||0)+(data.gastos_servicios||0)+(data.gastos_mantenimiento||0)+(data.gastos_limpieza||0)+(data.gastos_marketing||0)+(data.gastos_admin||0)+(data.gastos_otros||0)}
            groupKey="opex"
            cats={catBuckets.opex}
            color="#DC2626"
          />

          {/* EBITDA */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:"14px 24px",borderBottom:"1px solid #F9FAFB",background:"#F9FAFB",alignItems:"center"}}>
            <span style={{fontSize:"14px",fontWeight:"800",color:data.ebitda>=0?"#059669":"#DC2626"}}>EBITDA</span>
            <span style={{fontSize:"15px",fontWeight:"800",color:data.ebitda>=0?"#059669":"#DC2626",textAlign:"right",fontFeatureSettings:"'tnum'"}}>{fmt(data.ebitda||0)}</span>
            <span style={{fontSize:"11px",fontWeight:"600",color:data.ebitda>=0?"#059669":"#DC2626",textAlign:"right"}}>{pct(data.ebitda||0,v)}</span>
          </div>

          {/* Impuestos */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:"10px 24px",borderBottom:"1px solid #F9FAFB",alignItems:"center"}}>
            <span style={{fontSize:"13px",fontWeight:"500",color:"#374151",paddingLeft:"20px"}}>(-) Impuestos</span>
            <span style={{fontSize:"13px",fontWeight:"600",color:"#DC2626",textAlign:"right",fontFeatureSettings:"'tnum'"}}>{fmt(-(data.impuestos_estimados||0))}</span>
            <span style={{fontSize:"11px",fontWeight:"600",color:"#DC2626",textAlign:"right"}}>{pct(data.impuestos_estimados||0,v)}</span>
          </div>

          {/* Utilidad neta */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 150px 80px",padding:"14px 24px",alignItems:"center",background:data.utilidad_neta>=0?"#ECFDF5":"#FEF2F2"}}>
            <span style={{fontSize:"14px",fontWeight:"800",color:data.utilidad_neta>=0?"#059669":"#DC2626"}}>UTILIDAD NETA</span>
            <span style={{fontSize:"15px",fontWeight:"800",color:data.utilidad_neta>=0?"#059669":"#DC2626",textAlign:"right",fontFeatureSettings:"'tnum'"}}>{fmt(data.utilidad_neta||0)}</span>
            <span style={{fontSize:"11px",fontWeight:"600",color:data.utilidad_neta>=0?"#059669":"#DC2626",textAlign:"right"}}>{pct(data.utilidad_neta||0,v)}</span>
          </div>
        </div>
      )}

      {data && (
        <div style={{background:"#3D1C1E",borderRadius:"14px",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"16px"}}>
          <div>
            <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>UTILIDAD NETA {MESES[mes].toUpperCase()}</span>
            <div style={{fontSize:"28px",fontWeight:"900",color:data.utilidad_neta>=0?"#C8FF00":"#FF6B6B",marginTop:"4px"}}>{fmt(data.utilidad_neta)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>MARGEN NETO</span>
            <div style={{fontSize:"28px",fontWeight:"900",color:"#FFF",marginTop:"4px"}}>{data.margen_neto_pct?.toFixed(1)||"--"}%</div>
          </div>
        </div>
      )}
    </div>
  );
};
