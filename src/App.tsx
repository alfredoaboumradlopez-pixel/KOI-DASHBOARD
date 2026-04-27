import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { ArrowUpRight, ArrowDownRight, DollarSign, Activity, TrendingUp, Loader2, BarChart3, Calendar, Banknote } from "lucide-react";
import { useStore } from "./store/useStore";
import { CapturaGastos } from "./components/CapturaGastos";
import { ArqueoCaja } from "./components/ArqueoCaja";
import { CierreTurno } from "./components/CierreTurno";
import { EstadoResultados } from "./components/EstadoResultados";
import { DistribucionUtilidades } from "./components/DistribucionUtilidades";
import { CuentasPorPagar } from "./components/CuentasPorPagar";
import { Inventario } from "./components/Inventario";
import { Nomina } from "./components/Nomina";
import { Tesoreria } from "./components/Tesoreria";
import { Reportes } from "./components/Reportes";
import { Propinas } from './components/Propinas';
import { DashboardGastos } from './components/DashboardGastos';
import { InvoiceFinder } from "./components/InvoiceFinder";
import { ReconciliacionBancaria } from "./components/ReconciliacionBancaria";
import { LoginPage } from "./components/LoginPage";
import { PLDashboard } from "./components/PLDashboard";
import { RBODashboard } from "./components/RBODashboard";
import { RestauranteDashboard } from "./components/RestauranteDashboard";
import { CategorizarGastos } from "./components/CategorizarGastos";
import { api } from "./services/api";

// Suppress unused import warnings for icon imports kept for potential future use
void ArrowUpRight;
void ArrowDownRight;
void Activity;

const formatMXN = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

function Dashboard() {
  const { authUser } = useStore();
  const isSuperAdmin = authUser?.rol === "SUPER_ADMIN";

  // Para SUPER_ADMIN: resolver restaurante_id de KOI via API (slug → id)
  // Así no hay nada hardcodeado y funciona aunque el id cambie.
  const [koiRestauranteId, setKoiRestauranteId] = useState<number | null>(null);
  const [resolvingKoi, setResolvingKoi] = useState(isSuperAdmin);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get("/api/restaurantes")
      .then((rests: any[]) => {
        const koi = rests.find((r: any) => r.slug === "koi") ?? rests[0] ?? null;
        setKoiRestauranteId(koi?.id ?? null);
      })
      .catch(() => setKoiRestauranteId(null))
      .finally(() => setResolvingKoi(false));
  }, [isSuperAdmin]);

  const [ventas, setVentas] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(2026);
  const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  useEffect(() => {
    const f = async () => {
      setLoading(true);
      try {
        const v = await api.get("/api/dashboard/ventas-mes?mes=" + mes + "&anio=" + anio);
        setVentas(v);
      } catch(e) { console.error(e); }
      setLoading(false);
    };
    f();
  }, [mes, anio]);

  // Mientras SUPER_ADMIN resuelve el id del restaurante, mostrar spinner
  if (resolvingKoi) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", gap: "10px", color: "#9CA3AF" }}>
      <Loader2 style={{ width: "20px", height: "20px", animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: "13px" }}>Cargando dashboard KOI…</span>
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  const tv = ventas?.total_venta || 0;
  const tp = ventas?.total_propinas || 0;
  const tcp = ventas?.total_con_propina || 0;
  const dias = ventas?.dias_registrados || 0;
  const canal = ventas?.por_canal || {};

  return (
    <div style={{maxWidth:"1200px",margin:"0 auto"}}>
      {/* P&L Dashboard at top — para SUPER_ADMIN pasa el id resuelto de KOI */}
      <PLDashboard restauranteIdOverride={isSuperAdmin && koiRestauranteId ? koiRestauranteId : undefined} />

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"24px",marginTop:"32px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg,#3D1C1E,#5C2D30)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <DollarSign style={{width:"20px",height:"20px",color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px",fontWeight:"800",color:"#111827",margin:0}}>Dashboard KOI</h1>
            <p style={{fontSize:"13px",color:"#9CA3AF",margin:0}}>Resumen de ventas y operaciones</p>
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
          {l:"Total Venta",v:formatMXN(tv),s:dias+" dias registrados",icon:DollarSign,c:"#059669"},
          {l:"Total Propinas",v:formatMXN(tp),s:"del mes",icon:Banknote,c:"#7C3AED"},
          {l:"Total con Propina",v:formatMXN(tcp),s:"venta + propinas",icon:TrendingUp,c:"#3D1C1E"},
          {l:"Dias Registrados",v:String(dias),s:MESES[mes]+" "+anio,icon:Calendar,c:"#2563EB"},
        ].map((k,i) => {
          const Ic = k.icon;
          return (<div key={i} style={{background:"#FFF",borderRadius:"14px",padding:"18px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:"11px",fontWeight:"600",color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.5px"}}>{k.l}</span><Ic style={{width:"16px",height:"16px",color:k.c,opacity:0.7}} /></div>
            <div style={{fontSize:"22px",fontWeight:"800",color:"#111827",marginTop:"8px"}}>{k.v}</div>
            <span style={{fontSize:"11px",color:"#9CA3AF"}}>{k.s}</span>
          </div>);
        })}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"24px"}}>
        <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
          <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",marginBottom:"16px"}}>Ventas por Canal</h3>
          {[
            {l:"Efectivo",v:canal.efectivo||0,c:"#059669"},
            {l:"Parrot Pay",v:canal.parrot||0,c:"#7C3AED"},
            {l:"Terminales",v:canal.terminales||0,c:"#2563EB"},
            {l:"Uber Eats",v:canal.uber||0,c:"#16A34A"},
            {l:"Rappi",v:canal.rappi||0,c:"#EA580C"},
            {l:"Cortesias",v:canal.cortesias||0,c:"#DC2626"},
            {l:"Otros",v:canal.otros||0,c:"#6B7280"},
          ].filter(x => x.v > 0).map((x,i) => {
            const maxV = Math.max(canal.efectivo||0, canal.parrot||0, canal.terminales||0, canal.uber||0, canal.rappi||0, 1);
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"10px"}}>
                <span style={{width:"90px",fontSize:"12px",fontWeight:"600",color:"#374151"}}>{x.l}</span>
                <div style={{flex:1,height:"24px",background:"#F3F4F6",borderRadius:"6px",overflow:"hidden",position:"relative"}}>
                  <div style={{height:"100%",width:Math.max((x.v/maxV)*100,3)+"%",background:x.c,borderRadius:"6px"}} />
                  <span style={{position:"absolute",right:"8px",top:"50%",transform:"translateY(-50%)",fontSize:"11px",fontWeight:"700",color:"#374151"}}>{formatMXN(x.v)}</span>
                </div>
              </div>
            );
          })}
          {Object.values(canal).every((v: any) => !v) && <p style={{fontSize:"13px",color:"#9CA3AF",textAlign:"center",padding:"20px"}}>Sin ventas registradas este mes</p>}
        </div>

        <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
          <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",marginBottom:"16px"}}>Ventas por Dia</h3>
          {ventas?.dias && ventas.dias.length > 0 ? ventas.dias.sort((a: any, b: any) => b.fecha.localeCompare(a.fecha)).map((d: any, i: number) => (
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F9FAFB"}}>
              <span style={{fontSize:"12px",color:"#374151"}}>{new Date(d.fecha+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"short"})}</span>
              <div style={{display:"flex",gap:"16px"}}>
                <span style={{fontSize:"13px",fontWeight:"700",color:"#111827"}}>{formatMXN(d.total_venta)}</span>
                <span style={{fontSize:"11px",color:"#7C3AED"}}>{formatMXN(d.total_con_propina)}</span>
              </div>
            </div>
          )) : <p style={{fontSize:"13px",color:"#9CA3AF",textAlign:"center",padding:"20px"}}>Sin registros este mes</p>}
        </div>
      </div>

      <div style={{background:"#3D1C1E",borderRadius:"14px",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>TOTAL VENTAS {MESES[mes].toUpperCase()} {anio}</span>
          <div style={{fontSize:"28px",fontWeight:"900",color:"#C8FF00",marginTop:"4px"}}>{formatMXN(tv)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>CON PROPINAS</span>
          <div style={{fontSize:"28px",fontWeight:"900",color:"#FFF",marginTop:"4px"}}>{formatMXN(tcp)}</div>
        </div>
      </div>
    </div>
  );
}


function App() {
  const { currentRoute, authUser, token } = useStore();

  // Show login if not authenticated
  if (!token || !authUser) {
    return <LoginPage />;
  }

  return (
    <Layout>
      {currentRoute === "/" && <Dashboard />}
      {currentRoute === "/cierre-turno" && <CierreTurno />}
      {currentRoute === "/gastos" && <CapturaGastos />}
      {currentRoute === "/arqueo" && <ArqueoCaja />}
      {currentRoute === "/cuentas" && <CuentasPorPagar />}
      {currentRoute === "/inventario" && <Inventario />}
      {currentRoute === "/nomina" && <Nomina />}
      {currentRoute === "/pl" && <EstadoResultados />}
      {currentRoute === "/distribucion" && <DistribucionUtilidades />}
      {currentRoute === "/reportes" && <Reportes />}
      {currentRoute === "/tesoreria" && <Tesoreria />}
      {currentRoute === "/banco" && <ReconciliacionBancaria />}
      {currentRoute === "/dashboard-gastos" && <DashboardGastos />}
      {currentRoute === "/finder" && <InvoiceFinder />}
      {currentRoute === "/propinas" && <Propinas />}
      {currentRoute === "/rbo" && <RBODashboard />}
      {currentRoute.startsWith("/rbo/restaurante/") && <RestauranteDashboard />}
      {currentRoute === "/pl-dashboard" && <PLDashboard />}
      {currentRoute === "/categorizar" && <CategorizarGastos />}
      {currentRoute === "/login" && <LoginPage />}
    </Layout>
  );
}

export default App;
