import { ClipboardList } from "lucide-react";
import { ArqueoCaja } from "./ArqueoCaja";
import React, { useState } from "react";
import { api } from "../services/api";
import { Save, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

const formatMXN = (amount: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

export const CierreTurno: React.FC = () => {
  const [tabCierre, setTabCierre] = useState<"nuevo"|"historial">("nuevo");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [responsable, setResponsable] = useState("");
  const [elaboradoPor, setElaboradoPor] = useState("");
  const [semana, setSemana] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");

  // Canales de venta
  const [ventasEfectivo, setVentasEfectivo] = useState("");
  const [propinasEfectivo, setPropinasEfectivo] = useState("");
  const [ventasParrot, setVentasParrot] = useState("");
  const [propinasParrot, setPropinasParrot] = useState("");
  const [ventasTerminales, setVentasTerminales] = useState("");
  const [propinasTerminales, setPropinasTerminales] = useState("");
  const [ventasUber, setVentasUber] = useState("");
  const [ventasRappi, setVentasRappi] = useState("");
  const [cortesias, setCortesias] = useState("");
  const [otrosIngresos, setOtrosIngresos] = useState("");

  const [efectivoFisico, setEfectivoFisico] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const n = (v: string) => parseFloat(v) || 0;
  const totalVenta = n(ventasEfectivo) + n(ventasParrot) + n(ventasTerminales) + n(ventasUber) + n(ventasRappi) + n(cortesias) + n(otrosIngresos);
  const totalPropinas = n(propinasEfectivo) + n(propinasParrot) + n(propinasTerminales);
  const totalConPropina = totalVenta + totalPropinas;
  const saldoEsperado = n(saldoInicial) + n(ventasEfectivo) + n(propinasEfectivo);
  const diferencia = n(efectivoFisico) > 0 ? n(efectivoFisico) - saldoEsperado : 0;

  const handleSubmit = async () => {
    if (!fecha || !responsable || !elaboradoPor) {
      setError("Completa fecha, responsable y elaborado por");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/cierre-turno", {
        fecha,
        responsable,
        elaborado_por: elaboradoPor,
        saldo_inicial: n(saldoInicial),
        ventas_efectivo: n(ventasEfectivo),
        propinas_efectivo: n(propinasEfectivo),
        ventas_parrot: n(ventasParrot),
        propinas_parrot: n(propinasParrot),
        ventas_terminales: n(ventasTerminales),
        propinas_terminales: n(propinasTerminales),
        ventas_uber: n(ventasUber),
        ventas_rappi: n(ventasRappi),
        cortesias: n(cortesias),
        otros_ingresos: n(otrosIngresos),
        semana_numero: parseInt(semana) || 0,
        gastos: [],
        propinas: [],
        efectivo_fisico: n(efectivoFisico) || null,
        notas: notas || null,
      });
      setSuccess("Registro de ventas guardado!");
      setTimeout(() => setSuccess(null), 3000);
      // Reset
      setVentasEfectivo(""); setPropinasEfectivo(""); setVentasParrot(""); setPropinasParrot("");
      setVentasTerminales(""); setPropinasTerminales(""); setVentasUber(""); setVentasRappi("");
      setCortesias(""); setOtrosIngresos(""); setEfectivoFisico(""); setNotas("");
    } catch (e: any) {
      setError(e.message || "Error al guardar");
    }
    setLoading(false);
  };

  const inputStyle = { width:"100%", padding:"10px 12px", borderRadius:"8px", border:"1px solid #E5E7EB", fontSize:"14px", fontFamily:"'Inter',monospace" };
  const labelStyle = { fontSize:"11px", fontWeight:"600" as const, color:"#6B7280", display:"block", marginBottom:"4px" };

  return (
    <div style={{maxWidth:"1200px", margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg,#3D1C1E,#5C2D30)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <ClipboardList style={{width:"20px",height:"20px",color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px",fontWeight:"800",color:"#111827",margin:0}}>Cierre de Turno</h1>
            <p style={{fontSize:"13px",color:"#9CA3AF",margin:0}}>Registro diario de ventas y arqueo de caja</p>
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:"4px",background:"#FFF",borderRadius:"12px",padding:"4px",marginBottom:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <button onClick={() => setTabCierre("nuevo")} style={{flex:1,padding:"10px 16px",borderRadius:"10px",border:"none",cursor:"pointer",background:tabCierre==="nuevo"?"#3D1C1E":"transparent",color:tabCierre==="nuevo"?"#C8FF00":"#6B7280",fontSize:"13px",fontWeight:"600"}}>Nuevo Registro</button>
        <button onClick={() => setTabCierre("historial")} style={{flex:1,padding:"10px 16px",borderRadius:"10px",border:"none",cursor:"pointer",background:tabCierre==="historial"?"#3D1C1E":"transparent",color:tabCierre==="historial"?"#C8FF00":"#6B7280",fontSize:"13px",fontWeight:"600"}}>Historial (Arqueo)</button>
      </div>

      {tabCierre === "historial" && <ArqueoCaja />}
      {tabCierre === "nuevo" && (
        <div style={{display:"flex",flexDirection:"column" as const,gap:"16px"}}>

          {/* INFO BASICA */}
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",marginBottom:"14px"}}>Informacion del Dia</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 100px",gap:"12px"}}>
              <div><label style={labelStyle}>Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Responsable</label><input value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Nombre" style={inputStyle} /></div>
              <div><label style={labelStyle}>Elaborado por</label><input value={elaboradoPor} onChange={e => setElaboradoPor(e.target.value)} placeholder="Nombre" style={inputStyle} /></div>
              <div><label style={labelStyle}>No. Semana</label><input type="number" value={semana} onChange={e => setSemana(e.target.value)} placeholder="1" style={inputStyle} /></div>
            </div>
          </div>

          {/* CANALES DE VENTA */}
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",marginBottom:"14px"}}>Canales de Venta</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"2px",background:"#F3F4F6",borderRadius:"10px",overflow:"hidden"}}>
              {/* Header */}
              <div style={{background:"#3D1C1E",padding:"8px 14px"}}><span style={{fontSize:"11px",fontWeight:"700",color:"#C8FF00"}}>CANAL</span></div>
              <div style={{background:"#3D1C1E",padding:"8px 14px"}}><span style={{fontSize:"11px",fontWeight:"700",color:"#C8FF00"}}>VENTA $</span></div>
              <div style={{background:"#3D1C1E",padding:"8px 14px"}}><span style={{fontSize:"11px",fontWeight:"700",color:"#C8FF00"}}>PROPINA $</span></div>

              {/* Efectivo */}
              <div style={{background:"#FFF",padding:"10px 14px",display:"flex",alignItems:"center"}}><span style={{fontSize:"13px",fontWeight:"600"}}>💵 Efectivo</span></div>
              <div style={{background:"#FFF",padding:"6px 10px"}}><input type="number" step="0.01" value={ventasEfectivo} onChange={e => setVentasEfectivo(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>
              <div style={{background:"#FFF",padding:"6px 10px"}}><input type="number" step="0.01" value={propinasEfectivo} onChange={e => setPropinasEfectivo(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>

              {/* Parrot Pay */}
              <div style={{background:"#FAFBFC",padding:"10px 14px",display:"flex",alignItems:"center"}}><span style={{fontSize:"13px",fontWeight:"600"}}>🦜 Parrot Pay</span></div>
              <div style={{background:"#FAFBFC",padding:"6px 10px"}}><input type="number" step="0.01" value={ventasParrot} onChange={e => setVentasParrot(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>
              <div style={{background:"#FAFBFC",padding:"6px 10px"}}><input type="number" step="0.01" value={propinasParrot} onChange={e => setPropinasParrot(e.target.value)} placeholder="0.00" style={{...inputStyle,borr:"1px solid #E5E7EB"}} /></div>

              {/* Terminales */}
              <div style={{background:"#FFF",padding:"10px 14px",display:"flex",alignItems:"center"}}><span style={{fontSize:"13px",fontWeight:"600"}}>💳 Terminales</span></div>
              <div sle={{background:"#FFF",padding:"6px 10px"}}><input type="number" step="0.01" value={ventasTerminales} onChange={e => setVentasTerminales(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>
              <div style={{background:"#FFF",padding:"6px 10px"}}><input type="number" step="0.01" value={propinasTerminales} onChange={e => setPropinasTerminales(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>

              {/* Uber Eats */}
              <div style={{background:"#FAFBFC",padding:"10px 14px",display:"flex",alignItems:"center"}}><span style={{fontSize:"13px",fontWeight:"600"}}>🟢 Uber Eats</span></div>
              <div style={{background:"#FAFBFC",padding:"6px 10px"}}><input type="number" step="0.01" value={ventasUber} onChange={e => setVentasUber(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>
              <div style={{background:"#FAFBFC",padding:"6px 10px",displa"flex",alignItems:"center"}}><span style={{fontSize:"11px",color:"#9CA3AF"}}>N/A</span></div>

              {/* Rappi */}
              <div style={{background:"#FFF",padding:"10px 14px",display:"flex",alignItems:"center"}}><span style={{fontSize:"13px",fontWeight:"600"}}>🧡 Rappi</span></div>
              <div style={{background:"#FFF",padding:"6px 10px"}}><input type="number" step="0.01" value={ventasRappi} onChange={e => setVentasRappi(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>
              <div style={{background:"#FFF",padding:"6px 10px",display:"flex",alignItems:"center"}}><span style={{fontSize:"11px",color:"#9CA3AF"}}>N/A</span></div>

              {/* Cortesias */}
              <div style={{background:"#FAFBFC",padding:"10px 14px",display:"flex",alignItems:"center"}}><span style={{fontSize:"13px",fontWeight:"600"}}>🎁 Cortesias</span></div>
              <div style={{background:"#FAFBFC",padding:"6px 10px"}}><input type="number" step="0.value={cortesias} onChange={e => setCortesias(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>
              <div style={{background:"#FAFBFC",padding:"6px 10px",display:"flex",alignItems:"center"}}><span style={{fontSize:"11px",color:"#9CA3AF"}}>N/A</span></div>

              {/* Otros */}
              <div style={{background:"#FFF",padding:"10px 14px",display:"flex",alignItems:"center"}}><span style={{fontSize:"13px",fontWeight:"600"}}>📦 Otros Ingresos</span></div>
              <div style={{background:"#FFF",padding:"6px 10px"}}><input type="number" step="0.01" value={otrosIngresos} onChange={e => setOtrosIngresos(e.target.value)} placeholder="0.00" style={{...inputStyle,border:"1px solid #E5E7EB"}} /></div>
              <div style={{background:"#FFF",padding:"6px 10px",display:"flex",alignItems:"center"}}><span style={{fontSize:"11px",color:"#9CA3AF"}}>N/A</span></div>
            </div>
          </div>

          {/* TOTALES */}
          <div style{background:"#3D1C1E",borderRadius:"14px",padding:"20px",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"20px"}}>
            <div><span style={{fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>TOTAL VENTA</span><div style={{fontSize:"24px",fontWeight:"900",color:"#C8FF00",marginTop:"4px"}}>{formatMXN(totalVenta)}</div></div>
            <div><span style={{fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>TOTAL PROPINAS</span><div style={{fontSize:"24px",fontWeight:"900",color:"#FFF",marginTop:"4px"}}>{formatMXN(totalPropinas)}</div></div>
            <div><span style={{fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>TOTAL CON PROPINA</span><div style={{fontSize:"24px",fontWeight:"900",color:"#C8FF00",marginTop:"4px"}}>{formatMXN(totalConPropina)}</div></div>
          </div>

          {/* ARQUEO DE CAJA */}
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <h3 style={{fontSize:"14px",fontWeight:"700",color:"#111827",marginBottom:"14px"}}>Arqueo de Caja</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"}}>
              <div><label style={labelStyle}>Saldo Inicial</label><input type="number" step="0.01" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div><label style={labelStyle}>Efectivo Fisico (conteo)</label><input type="number" step="0.01" value={efectivoFisico} onChange={e => setEfectivoFisico(e.target.value)} placeholder="0.00" style={inputStyle} /></div>
              <div>
                <label style={labelStyle}>Saldo Esperado</label>
                <div style={{padding:"10px 12px",borderRadius:"8px",background:"#F3F4F6",fontSize:"14px",fontWeight:"700",color:"#111827"}}>{formatMXN(saldoEsperado)}</div>
              </div>
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

          {/* NOTAS */}
          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <label style={labelStyle}>Notas del dia</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones, incidentes, etc." rows={3} style={{...inputStyle,resize:"vertical" as const}} />
          </div>

          {/* MENSAJES Y BOTON */}
          {error && <div style={{padding:"12px 16px",borderRadius:"10px",background:"#FEF2F2",color:"#DC2626",fontSize:"13px",fontWeight:"600"}}>{error}</div>}
          {success && <div style={{padding:"12px 16px",borderRadius:"10px",background:"#ECFDF5",color:"#059669",fontSize:"13px",fontWeight:"600",display:"flex",alignItems:"center",gap:"8px"}}><CheckCircle style={{width:"16px",height:"16px"}} />{success}</div>}

          <button onClick={handleSubmit} disabled={loading} style={{padding:"14px 24px",borderRadius:"12px",border:"none",background:"#3D1C1E",color:"#C8FF00",fontSize:"15px",fontWeight:"800",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",opacity:loading?0.7:1}}>
            {loading ? <Loader2 style={{width:"18px",height:"18px",animation:"spin 1s linear infinite"}} /> : <Save style={{width:"18px",height:"18px"}} />}
            {loading ? "Guardando..." : "Guardar Registro del Dia"}
          </button>
        </div>
      )}
    </div>
  );
};
