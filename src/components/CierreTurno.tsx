import { ClipboardList } from "lucide-react";
import { ArqueoCaja } from "./ArqueoCaja";
import React, { useState } from "react";
import { api } from "../services/api";
import { Save, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { useRestaurante } from "../context/RestauranteContext";

const formatMXN = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

export const CierreTurno: React.FC = () => {
  const { restauranteId } = useRestaurante();
  const [tabCierre, setTabCierre] = useState<"ventas"|"propinas"|"historial">("ventas");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [responsable, setResponsable] = useState("");
  const [elaboradoPor, setElaboradoPor] = useState("");
  const [semana, setSemana] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [ventasEfectivo, setVentasEfectivo] = useState("");
  const [ventasParrot, setVentasParrot] = useState("");
  const [ventasTerminales, setVentasTerminales] = useState("");
  const [ventasUber, setVentasUber] = useState("");
  const [ventasRappi, setVentasRappi] = useState("");
  const [cortesias, setCortesias] = useState("");
  const [otrosIngresos, setOtrosIngresos] = useState("");
  const [efectivoFisico, setEfectivoFisico] = useState("");
  const [notas, setNotas] = useState("");
  const [propinaFecha, setPropinaFecha] = useState(new Date().toISOString().split("T")[0]);
  const [propinasEfectivo, setPropinasEfectivo] = useState("");
  const [propinasParrot, setPropinasParrot] = useState("");
  const [propinasTerminales, setPropinasTerminales] = useState("");
  const [propinaResponsable, setPropinaResponsable] = useState("");
  const [comisionUber, setComisionUber] = useState("30");
  const [comisionRappi, setComisionRappi] = useState("25");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const n = (v: string) => parseFloat(v) || 0;
  const totalVenta = n(ventasEfectivo) + n(ventasParrot) + n(ventasTerminales) + n(ventasUber) + n(ventasRappi) + n(cortesias) + n(otrosIngresos);
  const totalPropinas = n(propinasEfectivo) + n(propinasParrot) + n(propinasTerminales);
  const pctPropinas = totalVenta > 0 ? (totalPropinas / totalVenta * 100) : 0;
  const saldoEsperado = n(saldoInicial) + n(ventasEfectivo);
  const diferencia = n(efectivoFisico) > 0 ? n(efectivoFisico) - saldoEsperado : 0;

  const handleSubmitVentas = async () => {
    if (!fecha || !responsable || !elaboradoPor) { setError("Completa fecha, responsable y elaborado por"); return; }
    setLoading(true); setError(null);
    try {
      await api.post("/api/cierre-turno", {
        fecha, responsable, elaborado_por: elaboradoPor, saldo_inicial: n(saldoInicial),
        ventas_efectivo: n(ventasEfectivo), propinas_efectivo: 0,
        ventas_parrot: n(ventasParrot), propinas_parrot: 0,
        ventas_terminales: n(ventasTerminales), propinas_terminales: 0,
        ventas_uber: n(ventasUber), ventas_rappi: n(ventasRappi),
        cortesias: n(cortesias), otros_ingresos: n(otrosIngresos),
        semana_numero: parseInt(semana) || 0, gastos: [], propinas: [],
        efectivo_fisico: n(efectivoFisico) || null, notas: notas || null,
        restaurante_id: restauranteId,
      });
      setSuccess("Ventas registradas!"); setTimeout(() => setSuccess(null), 3000);
      setVentasEfectivo(""); setVentasParrot(""); setVentasTerminales("");
      setVentasUber(""); setVentasRappi(""); setCortesias(""); setOtrosIngresos("");
      setEfectivoFisico(""); setNotas("");
    } catch (e: any) { setError(e.message || "Error al guardar"); }
    setLoading(false);
  };

  const handleSubmitPropinas = async () => {
    if (!propinaFecha || !propinaResponsable) { setError("Completa fecha y responsable"); return; }
    setLoading(true); setError(null);
    try {
      const m = parseInt(propinaFecha.split("-")[1]);
      const a = parseInt(propinaFecha.split("-")[0]);
      const cierres = await api.get(`/api/cierre-turno?mes=${m}&anio=${a}&restaurante_id=${restauranteId}`);
      const cierre = Array.isArray(cierres) ? cierres.find((c: any) => c.fecha === propinaFecha) : null;
      if (!cierre) {
        await api.post("/api/cierre-turno", {
          fecha: propinaFecha, responsable: propinaResponsable, elaborado_por: propinaResponsable,
          saldo_inicial: 0, ventas_efectivo: 0, propinas_efectivo: n(propinasEfectivo),
          propinas_parrot: n(propinasParrot), propinas_terminales: n(propinasTerminales),
          ventas_parrot: 0, ventas_terminales: 0, ventas_uber: 0, ventas_rappi: 0,
          cortesias: 0, otros_ingresos: 0, semana_numero: 0,
          gastos: [], propinas: [], efectivo_fisico: null, notas: "Propinas - " + propinaResponsable,
          restaurante_id: restauranteId,
        });
      } else {
        await api.put("/api/cierre-turno/" + cierre.id + "/propinas", {
          propinas_efectivo: n(propinasEfectivo), propinas_parrot: n(propinasParrot), propinas_terminales: n(propinasTerminales),
        });
      }
      setSuccess("Propinas registradas!"); setTimeout(() => setSuccess(null), 3000);
      setPropinasEfectivo(""); setPropinasParrot(""); setPropinasTerminales("");
    } catch (e: any) { setError(e.message || "Error al guardar propinas"); }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius:"8px", border:"1px solid #E5E7EB", fontSize:"14px" };
  const labelStyle: React.CSSProperties = { fontSize:"11px", fontWeight:"600", color:"#6B7280", display:"block", marginBottom:"4px" };

  return (
    <div style={{maxWidth:"1200px", margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg,#3D1C1E,#5C2D30)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <ClipboardList style={{width:"20px",height:"20px",color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px",fontWeight:"800",color:"#111827",margin:0}}>Cierre de Turno</h1>
            <p style={{fontSize:"13px",color:"#9CA3AF",margin:0}}>Registro de ventas, propinas y arqueo</p>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:"4px",background:"#FFF",borderRadius:"12px",padding:"4px",marginBottom:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <button onClick={() => setTabCierre("ventas")} style={{flex:1,padding:"10px 16px",borderRadius:"10px",border:"none",cursor:"pointer",background:tabCierre==="ventas"?"#059669":"transparent",color:tabCierre==="ventas"?"#FFF":"#6B7280",fontSize:"13px",fontWeight:"600"}}>Registrar Ventas</button>
        <button onClick={() => setTabCierre("propinas")} style={{flex:1,padding:"10px 16px",borderRadius:"10px",border:"none",cursor:"pointer",background:tabCierre==="propinas"?"#7C3AED":"transparent",color:tabCierre==="propinas"?"#FFF":"#6B7280",fontSize:"13px",fontWeight:"600"}}>Registrar Propinas</button>
        <button onClick={() => setTabCierre("historial")} style={{flex:1,padding:"10px 16px",borderRadius:"10px",border:"none",cursor:"pointer",background:tabCierre==="historial"?"#3D1C1E":"transparent",color:tabCierre==="historial"?"#C8FF00":"#6B7280",fontSize:"13px",fontWeight:"600"}}>Historial</button>
      </div>
      {tabCierre === "historial" && <ArqueoCaja />}
      {tabCierre === "ventas" && (
        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",marginBottom:"14px"}}>Informacion del Dia</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 100px",gap:"12px"}}>
              <div><label style={labelStyle}>Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Responsable</label><input value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Nombre" style={inputStyle} /></div>
              <div><label style={labelStyle}>Elaborado por</label><input value={elaboradoPor} onChange={e => setElaboradoPor(e.target.value)} placeholder="Nombre" style={inputStyle} /></div>
              <div><label style={labelStyle}>No. Semana</label><input type="number" value={semana} onChange={e => setSemana(e.target.value)} placeholder="1" style={inputStyle} /></div>
            </div>
          </div>
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
              <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",margin:0}}>Ventas por Canal</h3>
              <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                <span style={{fontSize:"10px",color:"#9CA3AF"}}>Comisiones:</span>
                <div style={{display:"flex",alignItems:"center",gap:"2px"}}><span style={{fontSize:"10px",color:"#6B7280"}}>Uber</span><input type="number" value={comisionUber} onChange={e => setComisionUber(e.target.value)} style={{width:"40px",padding:"2px 4px",borderRadius:"4px",border:"1px solid #E5E7EB",fontSize:"11px",textAlign:"center"}} /><span style={{fontSize:"10px",color:"#6B7280"}}>%</span></div>
                <div style={{display:"flex",alignItems:"center",gap:"2px"}}><span style={{fontSize:"10px",color:"#6B7280"}}>Rappi</span><input type="number" value={comisionRappi} onChange={e => setComisionRappi(e.target.value)} style={{width:"40px",padding:"2px 4px",borderRadius:"4px",border:"1px solid #E5E7EB",fontSize:"11px",textAlign:"center"}} /><span style={{fontSize:"10px",color:"#6B7280"}}>%</span></div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              <div><label style={labelStyle}>Efectivo</label><input type="number" step="0.01" value={ventasEfectivo} onChange={e => setVentasEfectivo(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Parrot Pay</label><input type="number" step="0.01" value={ventasParrot} onChange={e => setVentasParrot(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Terminales</label><input type="number" step="0.01" value={ventasTerminales} onChange={e => setVentasTerminales(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div>
                <label style={labelStyle}>Uber Eats</label>
                <input type="number" step="0.01" value={ventasUber} onChange={e => setVentasUber(e.target.value)} placeholder="0.00" style={inputStyle} />
                {n(ventasUber) > 0 && <div style={{marginTop:"4px",display:"flex",justifyContent:"space-between",padding:"4px 8px",borderRadius:"6px",background:"#FEF2F2"}}>
                  <span style={{fontSize:"10px",color:"#DC2626"}}>Comision {comisionUber}%</span>
                  <span style={{fontSize:"11px",fontWeight:"700",color:"#DC2626"}}>-{formatMXN(n(ventasUber)*n(comisionUber)/100)}</span>
                </div>}
                {n(ventasUber) > 0 && <div style={{display:"flex",justifyContent:"space-between",padding:"4px 8px"}}>
                  <span style={{fontSize:"10px",color:"#059669"}}>Ingreso real</span>
                  <span style={{fontSize:"11px",fontWeight:"700",color:"#059669"}}>{formatMXN(n(ventasUber)*(1-n(comisionUber)/100))}</span>
                </div>}
              </div>
              <div>
                <label style={labelStyle}>Rappi</label>
                <input type="number" step="0.01" value={ventasRappi} onChange={e => setVentasRappi(e.target.value)} placeholder="0.00" style={inputStyle} />
                {n(ventasRappi) > 0 && <div style={{marginTop:"4px",display:"flex",justifyContent:"space-between",padding:"4px 8px",borderRadius:"6px",background:"#FEF2F2"}}>
                  <span style={{fontSize:"10px",color:"#DC2626"}}>Comision {comisionRappi}%</span>
                  <span style={{fontSize:"11px",fontWeight:"700",color:"#DC2626"}}>-{formatMXN(n(ventasRappi)*n(comisionRappi)/100)}</span>
                </div>}
                {n(ventasRappi) > 0 && <div style={{display:"flex",justifyContent:"space-between",padding:"4px 8px"}}>
                  <span style={{fontSize:"10px",color:"#059669"}}>Ingreso real</span>
                  <span style={{fontSize:"11px",fontWeight:"700",color:"#059669"}}>{formatMXN(n(ventasRappi)*(1-n(comisionRappi)/100))}</span>
                </div>}
              </div>
              <div><label style={labelStyle}>Cortesias</label><input type="number" step="0.01" value={cortesias} onChange={e => setCortesias(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div style={{gridColumn:"span 2"}}><label style={labelStyle}>Otros Ingresos</label><input type="number" step="0.01" value={otrosIngresos} onChange={e => setOtrosIngresos(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
            </div>
            <div style={{padding:"12px",borderRadius:"8px",background:"#ECFDF5",display:"flex",justifyContent:"space-between",marginTop:"12px"}}>
              <span style={{fontSize:"14px",fontWeight:"700",color:"#059669"}}>Total Ventas</span>
              <span style={{fontSize:"18px",fontWeight:"800",color:"#059669"}}>{formatMXN(totalVenta)}</span>
            </div>
          </div>
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",marginBottom:"14px"}}>Arqueo de Caja</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"}}>
              <div><label style={labelStyle}>Saldo Inicial</label><input type="number" step="0.01" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Efectivo Fisico</label><input type="number" step="0.01" value={efectivoFisico} onChange={e => setEfectivoFisico(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Saldo Esperado</label><div style={{padding:"10px 12px",borderRadius:"8px",background:"#F3F4F6",fontSize:"14px",fontWeight:"700"}}>{formatMXN(saldoEsperado)}</div></div>
            </div>
            {n(efectivoFisico) > 0 && (
              <div style={{marginTop:"12px",padding:"12px 16px",borderRadius:"10px",background:Math.abs(diferencia)<1?"#ECFDF5":diferencia>0?"#FEF3C7":"#FEF2F2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  {Math.abs(diferencia)<1 ? <CheckCircle style={{width:"18px",height:"18px",color:"#059669"}} /> : <AlertTriangle style={{width:"18px",height:"18px",color:diferencia>0?"#D97706":"#DC2626"}} />}
                  <span style={{fontSize:"13px",fontWeight:"700",color:Math.abs(diferencia)<1?"#059669":diferencia>0?"#D97706":"#DC2626"}}>{Math.abs(diferencia)<1?"CUADRADA":diferencia>0?"SOBRANTE":"FALTANTE"}</span>
                </div>
                <span style={{fontSize:"15px",fontWeight:"800",color:Math.abs(diferencia)<1?"#059669":diferencia>0?"#D97706":"#DC2626"}}>{diferencia>0?"+":""}{formatMXN(diferencia)}</span>
              </div>
            )}
          </div>
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <label style={labelStyle}>Notas del dia</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." rows={2} style={{...inputStyle,resize:"vertical"}} />
          </div>
          {error && <div style={{padding:"12px 16px",borderRadius:"10px",background:"#FEF2F2",color:"#DC2626",fontSize:"13px",fontWeight:"600"}}>{error}</div>}
          {success && <div style={{padding:"12px 16px",borderRadius:"10px",background:"#ECFDF5",color:"#059669",fontSize:"13px",fontWeight:"600",display:"flex",alignItems:"center",gap:"8px"}}><CheckCircle style={{width:"16px",height:"16px"}} />{success}</div>}
          <button onClick={handleSubmitVentas} disabled={loading} style={{padding:"14px 24px",borderRadius:"12px",border:"none",background:"#059669",color:"#FFF",fontSize:"15px",fontWeight:"800",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
            {loading ? <Loader2 style={{width:"18px",height:"18px",animation:"spin 1s linear infinite"}} /> : <Save style={{width:"18px",height:"18px"}} />}
            {loading ? "Guardando..." : "Guardar Ventas del Dia"}
          </button>
        </div>
      )}
      {tabCierre === "propinas" && (
        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#7C3AED"}} />
              <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",margin:0}}>Registro de Propinas</h3>
              <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"6px",background:"#F5F3FF",color:"#7C3AED",fontWeight:"600"}}>Gerenta</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"14px"}}>
              <div><label style={labelStyle}>Fecha</label><input type="date" value={propinaFecha} onChange={e => setPropinaFecha(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Responsable</label><input value={propinaResponsable} onChange={e => setPropinaResponsable(e.target.value)} placeholder="Nombre" style={inputStyle} /></div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div><label style={labelStyle}>Propinas Efectivo</label><input type="number" step="0.01" value={propinasEfectivo} onChange={e => setPropinasEfectivo(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Propinas Parrot Pay</label><input type="number" step="0.01" value={propinasParrot} onChange={e => setPropinasParrot(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Propinas Terminales</label><input type="number" step="0.01" value={propinasTerminales} onChange={e => setPropinasTerminales(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
            </div>
            <div style={{padding:"12px",borderRadius:"8px",background:"#F5F3FF",display:"flex",justifyContent:"space-between",marginTop:"12px"}}>
              <span style={{fontSize:"14px",fontWeight:"700",color:"#7C3AED"}}>Total Propinas</span>
              <span style={{fontSize:"18px",fontWeight:"800",color:"#7C3AED"}}>{formatMXN(totalPropinas)}</span>
            </div>
          </div>
          {error && <div style={{padding:"12px 16px",borderRadius:"10px",background:"#FEF2F2",color:"#DC2626",fontSize:"13px",fontWeight:"600"}}>{error}</div>}
          {success && <div style={{padding:"12px 16px",borderRadius:"10px",background:"#ECFDF5",color:"#059669",fontSize:"13px",fontWeight:"600",display:"flex",alignItems:"center",gap:"8px"}}><CheckCircle style={{width:"16px",height:"16px"}} />{success}</div>}
          <button onClick={handleSubmitPropinas} disabled={loading} style={{padding:"14px 24px",borderRadius:"12px",border:"none",background:"#7C3AED",color:"#FFF",fontSize:"15px",fontWeight:"800",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
            {loading ? <Loader2 style={{width:"18px",height:"18px",animation:"spin 1s linear infinite"}} /> : <Save style={{width:"18px",height:"18px"}} />}
            {loading ? "Guardando..." : "Guardar Propinas"}
          </button>
        </div>
      )}
    </div>
  );
};
