import { useState, useEffect, useMemo } from "react";
import { FileText, ChevronRight, ChevronDown } from "lucide-react";
import { api } from "../services/api";

const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const RESTAURANTE_ID = 6;

// Order and labels for each categoria_pl bucket
const GRUPOS_CONFIG = [
  { key: "costo",         label: "Costo de ventas", pls: new Set(["costo_alimentos","costo_bebidas"]) },
  { key: "nomina",        label: "Nómina",           pls: new Set(["nomina"]) },
  { key: "renta",         label: "Renta",            pls: new Set(["renta"]) },
  { key: "servicios",     label: "Servicios",        pls: new Set(["servicios"]) },
  { key: "limpieza",      label: "Limpieza",         pls: new Set(["limpieza"]) },
  { key: "mantenimiento", label: "Mantenimiento",    pls: new Set(["mantenimiento"]) },
  { key: "marketing",     label: "Marketing",        pls: new Set(["marketing"]) },
  { key: "otros_gastos",  label: "Otros gastos",     pls: new Set(["otros_gastos","admin"]) },
] as const;

export const EstadoResultados = () => {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(2026);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const isRBO = localStorage.getItem("user_role") === "SUPER_ADMIN";

  useEffect(() => {
    const f = async () => {
      setLoading(true);
      try {
        const resp = await api.get(`/api/pl/${RESTAURANTE_ID}/mes/${anio}/${mes}`);
        const d = resp.data ?? resp;
        console.log("PL raw response:", resp);
        console.log("PL gastos_por_categoria:", d?.gastos_por_categoria);
        setData(d);
      } catch(e) { setData(null); }
      setLoading(false);
    };
    f();
  }, [mes, anio]);

  const pct = (n: number, total: number) => total > 0 ? (n / total * 100).toFixed(1) + "%" : "--";
  const v = data?.ventas_netas || 0;

  const toggle = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Build grupos from gastos_por_categoria; null = no data → use fallback lines
  const grupos = useMemo(() => {
    const cats: any[] = data?.gastos_por_categoria || [];
    if (cats.length === 0) return null;
    return GRUPOS_CONFIG
      .map(g => {
        const items = cats.filter((c: any) => g.pls.has(c.categoria_pl));
        const total = items.reduce((s: number, c: any) => s + (c.monto || 0), 0);
        return { key: g.key, label: g.label, items, total };
      })
      .filter(g => g.total > 0);
  }, [data]);

  const gruposCosto = grupos?.filter(g => g.key === "costo") ?? [];
  const gruposOpex  = grupos?.filter(g => g.key !== "costo") ?? [];

  const GrupoRow = ({ g }: { g: { key: string; label: string; items: any[]; total: number } }) => {
    const expanded = isRBO || expandedGroups.has(g.key);
    return (
      <>
        <div
          onClick={() => !isRBO && toggle(g.key)}
          style={{
            display: "grid", gridTemplateColumns: "1fr 150px 80px",
            padding: "10px 24px", borderBottom: "1px solid #F9FAFB",
            alignItems: "center", cursor: isRBO ? "default" : "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {!isRBO && (
              expanded
                ? <ChevronDown style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
                : <ChevronRight style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: "13px", fontWeight: "500", color: "#374151", paddingLeft: isRBO ? "20px" : 0 }}>
              ↳ {g.label}
            </span>
          </div>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#DC2626", textAlign: "right", fontFeatureSettings: "'tnum'" }}>
            {fmt(g.total)}
          </span>
          <span style={{ fontSize: "11px", fontWeight: "600", color: "#DC2626", textAlign: "right" }}>
            {pct(g.total, v)}
          </span>
        </div>
        <div style={{
          overflow: "hidden",
          maxHeight: expanded ? "800px" : "0",
          transition: "max-height 200ms ease-in-out",
        }}>
          {g.items.map((c: any) => (
            <div key={c.categoria} style={{
              display: "grid", gridTemplateColumns: "1fr 150px 80px",
              padding: "5px 24px 5px 48px", borderBottom: "1px solid #F9FAFB",
              alignItems: "center", background: "#FAFBFC",
            }}>
              <span style={{ fontSize: "12px", color: "#6B7280" }}>
                {c.categoria.replace(/_/g, " ")}
              </span>
              <span style={{ fontSize: "12px", color: "#374151", textAlign: "right", fontFeatureSettings: "'tnum'" }}>
                {fmt(c.monto)}
              </span>
              <span style={{ fontSize: "11px", color: "#9CA3AF", textAlign: "right" }}>
                {c.pct_ventas}%
              </span>
            </div>
          ))}
        </div>
      </>
    );
  };

  // Fallback totals from PLResult aggregate fields
  const costoFallback = data?.total_costo_ventas || 0;
  const nominaFallback = data?.gastos_nomina || 0;
  const opexFallback = (data?.gastos_renta||0)+(data?.gastos_servicios||0)+
    (data?.gastos_mantenimiento||0)+(data?.gastos_limpieza||0)+
    (data?.gastos_marketing||0)+(data?.gastos_admin||0)+(data?.gastos_otros||0);

  const LineaGenerica = ({ label, value }: { label: string; value: number }) => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"10px 24px",
                  borderBottom:"1px solid #F9FAFB", alignItems:"center" }}>
      <span style={{ fontSize:"13px", fontWeight:"500", color:"#374151", paddingLeft:"20px" }}>{label}</span>
      <span style={{ fontSize:"13px", fontWeight:"600", color:"#DC2626", textAlign:"right", fontFeatureSettings:"'tnum'" }}>{fmt(value)}</span>
      <span style={{ fontSize:"11px", fontWeight:"600", color:"#DC2626", textAlign:"right" }}>{pct(value,v)}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <div style={{ width:"40px", height:"40px", borderRadius:"12px", background:"linear-gradient(135deg,#3D1C1E,#5C2D30)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <FileText style={{ width:"20px", height:"20px", color:"#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize:"22px", fontWeight:"800", color:"#111827", margin:0 }}>Estado de Resultados</h1>
            <p style={{ fontSize:"13px", color:"#9CA3AF", margin:0 }}>P&L mensual · KOI</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:"4px", background:"#FFF", borderRadius:"10px", padding:"3px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
            <button key={m} onClick={() => setMes(m)} style={{ padding:"6px 10px", borderRadius:"8px", border:"none", background:mes===m?"#3D1C1E":"transparent", color:mes===m?"#C8FF00":"#9CA3AF", fontSize:"11px", fontWeight:"700", cursor:"pointer" }}>
              {MESES[m].slice(0,3)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:"40px" }}><p style={{ color:"#9CA3AF" }}>Cargando...</p></div>
      ) : !data ? (
        <div style={{ textAlign:"center", padding:"40px" }}><p style={{ color:"#9CA3AF" }}>Sin datos para {MESES[mes]} {anio}</p></div>
      ) : (
        <div style={{ background:"#FFF", borderRadius:"14px", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>

          {/* Column headers */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"12px 24px", background:"#FAFBFC", borderBottom:"1px solid #F3F4F6" }}>
            <span style={{ fontSize:"11px", fontWeight:"700", color:"#9CA3AF", letterSpacing:"0.06em" }}>CONCEPTO</span>
            <span style={{ fontSize:"11px", fontWeight:"700", color:"#9CA3AF", letterSpacing:"0.06em", textAlign:"right" }}>MONTO</span>
            <span style={{ fontSize:"11px", fontWeight:"700", color:"#9CA3AF", letterSpacing:"0.06em", textAlign:"right" }}>% VENTAS</span>
          </div>

          {/* Ventas netas */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"14px 24px", borderBottom:"1px solid #F9FAFB", background:"#ECFDF5", alignItems:"center" }}>
            <span style={{ fontSize:"14px", fontWeight:"800", color:"#059669" }}>Ventas netas</span>
            <span style={{ fontSize:"15px", fontWeight:"800", color:"#059669", textAlign:"right", fontFeatureSettings:"'tnum'" }}>{fmt(v)}</span>
            <span style={{ fontSize:"11px", fontWeight:"600", color:"#059669", textAlign:"right" }}>100%</span>
          </div>

          {/* Propinas recibidas (informativo) */}
          {(data.propinas_totales||0) > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"7px 24px 7px 44px", borderBottom:"1px solid #F9FAFB", alignItems:"center" }}>
              <span style={{ fontSize:"12px", color:"#6B7280" }}>Propinas recibidas</span>
              <span style={{ fontSize:"12px", color:"#6B7280", textAlign:"right", fontFeatureSettings:"'tnum'" }}>{fmt(data.propinas_totales)}</span>
              <span style={{ fontSize:"11px", color:"#9CA3AF", textAlign:"right" }}>{pct(data.propinas_totales, v)}</span>
            </div>
          )}

          {/* Costo de ventas */}
          {grupos
            ? gruposCosto.map(g => <GrupoRow key={g.key} g={g} />)
            : <LineaGenerica label="↳ Costo de ventas" value={costoFallback} />
          }

          {/* Utilidad bruta */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"14px 24px", borderBottom:"1px solid #F9FAFB", background:"#F9FAFB", alignItems:"center" }}>
            <span style={{ fontSize:"14px", fontWeight:"800", color:(data.utilidad_bruta||0)>=0?"#059669":"#DC2626" }}>Utilidad bruta</span>
            <span style={{ fontSize:"15px", fontWeight:"800", color:(data.utilidad_bruta||0)>=0?"#059669":"#DC2626", textAlign:"right", fontFeatureSettings:"'tnum'" }}>{fmt(data.utilidad_bruta||0)}</span>
            <span style={{ fontSize:"11px", fontWeight:"600", color:(data.utilidad_bruta||0)>=0?"#059669":"#DC2626", textAlign:"right" }}>{pct(data.utilidad_bruta||0,v)}</span>
          </div>

          {/* Gastos operativos */}
          {grupos ? (
            gruposOpex.map(g => <GrupoRow key={g.key} g={g} />)
          ) : (
            <>
              <LineaGenerica label="↳ Nómina" value={nominaFallback} />
              <LineaGenerica label="↳ Gastos operativos" value={opexFallback} />
            </>
          )}

          {/* EBITDA */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"14px 24px", borderBottom:"1px solid #F9FAFB", background:"#F9FAFB", alignItems:"center" }}>
            <span style={{ fontSize:"14px", fontWeight:"800", color:(data.ebitda||0)>=0?"#059669":"#DC2626" }}>EBITDA</span>
            <span style={{ fontSize:"15px", fontWeight:"800", color:(data.ebitda||0)>=0?"#059669":"#DC2626", textAlign:"right", fontFeatureSettings:"'tnum'" }}>{fmt(data.ebitda||0)}</span>
            <span style={{ fontSize:"11px", fontWeight:"600", color:(data.ebitda||0)>=0?"#059669":"#DC2626", textAlign:"right" }}>{pct(data.ebitda||0,v)}</span>
          </div>

          {/* Impuestos */}
          {(data.impuestos_estimados||0) > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"10px 24px", borderBottom:"1px solid #F9FAFB", alignItems:"center" }}>
              <span style={{ fontSize:"13px", fontWeight:"500", color:"#374151", paddingLeft:"20px" }}>(-) Impuestos</span>
              <span style={{ fontSize:"13px", fontWeight:"600", color:"#DC2626", textAlign:"right", fontFeatureSettings:"'tnum'" }}>{fmt(-data.impuestos_estimados)}</span>
              <span style={{ fontSize:"11px", fontWeight:"600", color:"#DC2626", textAlign:"right" }}>{pct(data.impuestos_estimados,v)}</span>
            </div>
          )}

          {/* Utilidad neta */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 150px 80px", padding:"14px 24px", alignItems:"center", background:(data.utilidad_neta||0)>=0?"#ECFDF5":"#FEF2F2" }}>
            <span style={{ fontSize:"14px", fontWeight:"800", color:(data.utilidad_neta||0)>=0?"#059669":"#DC2626" }}>UTILIDAD NETA</span>
            <span style={{ fontSize:"15px", fontWeight:"800", color:(data.utilidad_neta||0)>=0?"#059669":"#DC2626", textAlign:"right", fontFeatureSettings:"'tnum'" }}>{fmt(data.utilidad_neta||0)}</span>
            <span style={{ fontSize:"11px", fontWeight:"600", color:(data.utilidad_neta||0)>=0?"#059669":"#DC2626", textAlign:"right" }}>{pct(data.utilidad_neta||0,v)}</span>
          </div>
        </div>
      )}

      {/* Summary card */}
      {data && (
        <div style={{ background:"#3D1C1E", borderRadius:"14px", padding:"20px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"16px" }}>
          <div>
            <span style={{ fontSize:"12px", color:"rgba(255,255,255,0.5)" }}>UTILIDAD NETA {MESES[mes].toUpperCase()}</span>
            <div style={{ fontSize:"28px", fontWeight:"900", color:(data.utilidad_neta||0)>=0?"#C8FF00":"#FF6B6B", marginTop:"4px" }}>{fmt(data.utilidad_neta||0)}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <span style={{ fontSize:"12px", color:"rgba(255,255,255,0.5)" }}>MARGEN NETO</span>
            <div style={{ fontSize:"28px", fontWeight:"900", color:"#FFF", marginTop:"4px" }}>{data.margen_neto_pct?.toFixed(1)||"--"}%</div>
          </div>
        </div>
      )}
    </div>
  );
};
