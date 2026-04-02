import { useState, useEffect } from "react";
import { BarChart3, Download, FileSpreadsheet } from "lucide-react";
import { api } from "../services/api";

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const exportToCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [headers.join(","), ...data.map(row => headers.map(h => {
    const v = row[h];
    if (typeof v === "string" && (v.includes(",") || v.includes('"'))) return '"' + v.replace(/"/g, '""') + '"';
    return v ?? "";
  }).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export const Reportes = () => {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(2026);
  const [ventas, setVentas] = useState<any>(null);
  const [gastos, setGastos] = useState<any[]>([]);
  const [pl, setPl] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const f = async () => {
      setLoading(true);
      try {
        const m = String(mes).padStart(2,"0");
        const ini = anio+"-"+m+"-01";
        const last = new Date(anio, mes, 0).getDate();
        const fin = anio+"-"+m+"-"+String(last).padStart(2,"0");
        const [v, g, p] = await Promise.all([
          api.get("/api/dashboard/ventas-mes?mes="+mes+"&anio="+anio),
          api.get("/api/gastos?fecha_inicio="+ini+"&fecha_fin="+fin),
          api.get("/api/pl/"+mes+"/"+anio).catch(() => null),
        ]);
        setVentas(v);
        setGastos(Array.isArray(g) ? g : []);
        setPl(p);
      } catch(e) {}
      setLoading(false);
    };
    f();
  }, [mes, anio]);

  const totalGastos = gastos.reduce((s, g) => s + (g.monto || 0), 0);

  const exportVentas = () => {
    if (!ventas?.dias) return;
    exportToCSV(ventas.dias.map((d: any) => ({
      Fecha: d.fecha,
      "Total Venta": d.total_venta,
      "Total con Propina": d.total_con_propina,
    })), "KOI_Ventas_" + MESES[mes] + "_" + anio + ".csv");
  };

  const exportGastos = () => {
    exportToCSV(gastos.map((g: any) => ({
      Fecha: g.fecha,
      Proveedor: g.proveedor,
      Categoria: (g.categoria || "").replace(/_/g, " "),
      Monto: g.monto,
      "Metodo Pago": (g.metodo_pago || "").replace(/_/g, " "),
      Comprobante: (g.comprobante || "").replace(/_/g, " "),
      Descripcion: g.descripcion || "",
    })), "KOI_Gastos_" + MESES[mes] + "_" + anio + ".csv");
  };

  const exportPL = () => {
    if (!pl) return;
    const rows = [
      { Concepto: "VENTAS TOTALES", Monto: pl.ventas_totales, "% sobre Ventas": "100%" },
      { Concepto: "Propinas recibidas", Monto: pl.total_propinas, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.total_propinas/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "(-) Costo Materia Prima", Monto: -pl.costo_materia_prima, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.costo_materia_prima/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "UTILIDAD BRUTA", Monto: pl.utilidad_bruta, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.utilidad_bruta/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "(-) Gastos Operativos", Monto: -pl.gastos_operativos, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.gastos_operativos/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "(-) Gastos Fijos", Monto: -pl.gastos_fijos, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.gastos_fijos/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "(-) Nomina", Monto: -pl.gastos_nomina, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.gastos_nomina/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "(-) Comisiones", Monto: -pl.comisiones, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.comisiones/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "(-) Impuestos", Monto: -pl.impuestos, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.impuestos/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
      { Concepto: "UTILIDAD NETA", Monto: pl.utilidad_neta, "% sobre Ventas": pl.ventas_totales > 0 ? (pl.utilidad_neta/pl.ventas_totales*100).toFixed(1)+"%" : "--" },
    ];
    exportToCSV(rows, "KOI_PL_" + MESES[mes] + "_" + anio + ".csv");
  };

  return (
    <div style={{maxWidth:"1000px",margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg,#3D1C1E,#5C2D30)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <BarChart3 style={{width:"20px",height:"20px",color:"#C8FF00"}} />
          </div>
          <div>
            <h1 style={{fontSize:"22px",fontWeight:"800",color:"#111827",margin:0}}>Reportes</h1>
            <p style={{fontSize:"13px",color:"#9CA3AF",margin:0}}>Descarga reportes en Excel/CSV</p>
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
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>

          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px"}}>
              <FileSpreadsheet style={{width:"20px",height:"20px",color:"#059669"}} />
              <h3 style={{fontSize:"15px",fontWeight:"700",color:"#111827",margin:0}}>Reporte de Ventas</h3>
            </div>
            <div style={{fontSize:"24px",fontWeight:"800",color:"#111827",marginBottom:"4px"}}>{formatMXN(ventas?.total_venta || 0)}</div>
            <p style={{fontSize:"12px",color:"#9CA3AF",marginBottom:"16px"}}>{ventas?.dias_registrados || 0} dias registrados en {MESES[mes]}</p>
            <button onClick={exportVentas} disabled={!ventas?.dias?.length} style={{width:"100%",padding:"10px",borderRadius:"10px",border:"none",background:ventas?.dias?.length?"#059669":"#E5E7EB",color:ventas?.dias?.length?"#FFF":"#9CA3AF",fontSize:"13px",fontWeight:"700",cursor:ventas?.dias?.length?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              <Download style={{width:"14px",height:"14px"}} /> Descargar CSV
            </button>
          </div>

          <div style={{background:"#FFF",borderRadius:"14px",padding:"20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px"}}>
              <FileSpreadsheet style={{width:"20px",height:"20px",color:"#DC2626"}} />
              <h3 style={{fontSize:"15px",fontWeight:"700",color:"#111827",margin:0}}>Reporte de Gastos</h3>
            </div>
            <div style={{fontSize:"24px",fontWeight:"800",color:"#111827",marginBottom:"4px"}}>{formatMXN(totalGastos)}</div>
            <p style={{fontSize:"12px",color:"#9CA3AF",marginBottom:"16px"}}>{gastos.length} gastos en {MESES[mes]}</p>
            <button onClick={exportGastos} disabled={!gastos.length} style={{width:"100%",padding:"10px",borderRadius:"10px",border:"none",background:gastos.length?"#DC2626":"#E5E7EB",color:gastos.length?"#FFF":"#9CA3AF",fontSize:"13px",fontWeight:"700",cursor:gastos.length?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              <Download style={{width:"14px",height:"14px"}} /> Descargar CSV
            </button>
          </div>


        </div>
      )}
    </div>
  );
};
