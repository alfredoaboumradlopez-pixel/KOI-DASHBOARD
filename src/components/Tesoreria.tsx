import { useState } from "react";
import { Calendar, AlertTriangle, CheckCircle, Bell, DollarSign } from "lucide-react";

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

interface PagoRecurrente {
  concepto: string;
  proveedor: string;
  categoria: string;
  deadline: string;
  frecuencia: string;
  montoEstimado: number;
}

const PAGOS_FIJOS: PagoRecurrente[] = [
  { concepto: "Renta", proveedor: "PABELLON BOSQUES", categoria: "RENTA", deadline: "Día 1-10", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "Internet + Teléfono", proveedor: "TELMEX", categoria: "SERVICIOS", deadline: "Día 1-24", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "Mantto/Serv. local", proveedor: "PABELLON BOSQUES", categoria: "SERVICIOS", deadline: "Día 1-15", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "ISR / IVA / SAT", proveedor: "SAT", categoria: "IMPUESTOS",dline: "Día 17", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "Impuestos varios", proveedor: "OTRO", categoria: "IMPUESTOS", deadline: "Día 11-17", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "IVA Rappi", proveedor: "RAPPI", categoria: "IMPUESTOS", deadline: "Cierre mes", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "TPV Parrot", proveedor: "PARROT", categoria: "COMISIONES_BANCARIAS", deadline: "Día 11", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "TPV Clip", proveedor: "CLIP", categoria: "COMISIONES_BANCARIAS", deadline: "Día 16-28", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "TPV Getnet", proveedor: "GETNET", categoria: "COMISIONES_BANCARIAS", deadline: "Día 1-17", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "Comisiones banco", proveedor: "SANTANDER", categoria: "COMISIONES_BANCARIAS", deadline: "Último día", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "Comisión retiro efectivo (4%)", proveedor: "TPN", categoria: "COMISIONES_BANCARIAS", deadline: "Cierre mes", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "Comisión Uber Eats", proveedor: "UBER", categoria: "COMISIONES_PLATAFORMAS", deadline: "Cierre mes", frecuencia: "SEMANAL", montoEstimado: 0 },
  { concepto: "Comisión Rappi", proveedor: "RAPPI", categoria: "COMISIONES_PLATAFORMAS", deadline: "Cierre mes", frecuencia: "SEMANAL", montoEstimado: 0 },
  { concepto: "Diseño / fotos / redes", proveedor: "PABLO PAREDES", categoria: "MARKETING", deadline: "Variable", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "Mktg plataformas", proveedor: "RAPPI / UBER", categoria: "MARKETING", deadline: "Cierre mes", frecuencia: "MENSUAL", montoEstimado: 0 },
  { concepto: "TIKTOK", proveedor: "PAU", categoria: "MARKETING", deadline: "Variable", frecuencia: "SEMANAL", montoEstimado: 0 },
  { concepto: "Comidas personal", proveedor: "INTERNO", categoria: "PERSONAL", deadline: "Continuo", frecuencia: "DIARIO", montoEstimado: 400 },
  { concepto: "Nómina / pagos staff", proveedor: "INTERNO", categoria: "NOMINA", deadline: "Día 8 y 24", frecuencia: "QUINCENAL", montoEstimado: 0 },
];

function getDiaActual() { return new Date().getDate(); }
function getDiasEnMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

function getStatus(deadline: string): { status: "urgente" | "proximo" | "ok" | "continuo"; label: string } {
  const dia = getDiaActual();
  if (deadline === "Continuo" || deadline === "Variable") return { status: "continuo", label: deadline };
  if (deadline === "Cierre mes") {
    const diasFalta = getDiasEnMes() - dia;
    if (diasFalta <= 3) return { status: "urgente", label: "En " + diasFalta + " días" };
    if (diasFalta <= 7) return { status: "proximo", label: "En " + diasFalta + " días" };
    return { status: "ok", label: "Día " + getDiasEnMes() };
  }
  if (deadline === "Último día") {
    const diasFalta = getDiasEnMes() - dia;
    if (diasFalta <= 3) return { status: "urgente", label: "En " + diasFalta + " días" };
    return { status: "ok", label: "Día " + getDiasEnMes() };
  }
  const match = deadline.match(/Día (\d+)(?:\s*[-y]\s*(\d+))?/);
  if (match) {
    const d1 = parseInt(match[1]);
    const d2 = match[2] ? parseInt(match[2]) : d1;
    if (dia > d2) return { status: "ok", label: "✓ Pagado (venció día " + d2 + ")" };
    if (dia >= d1) return { status: "urgente", label: "¡HOY! Vence día " + d2 };
    if (d1 - dia <= 5) return { status: "proximo", label: "En " + (d1 - dia) + " días" };
    return { status: "ok", label: deadline };
  }
  return { status: "ok", label: deadline };
}

export const Tesoreria = () => {
  const [filtro, setFiltro] = useState<"todos"|"urgentes"|"proximos">("todos");

  const pagosConStatus = PAGOS_FIJOS.map(p => ({ ...p, ...getStatus(p.deadline) }));
  const urgentes = pagosConStatus.filter(p => p.status === "urgente").length;
  const proximos = pagosConStatus.filter(p => p.status === "proximo").length;

  const filtrados = filtro === "urgentes" ? pagosConStatus.filter(p =s === "urgente")
    : filtro === "proximos" ? pagosConStatus.filter(p => p.status === "urgente" || p.status === "proximo")
    : pagosConStatus;

  const statusColors = {
    urgente: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
    proximo: { bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
    ok: { bg: "#F9FAFB", color: "#6B7280", border: "#F3F4F6" },
    continuo: { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Calendario de Pagos</h1>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Control de pagos recurrentes y compromisos</p>
          </div>
        </div>
        <div style={{ fontSize: "13px", color: "#6B7280" }}>Hoy: día {getDiaActual()} del mes</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px", marginBottom: "20px" }}>
        <div onClick={() => setFiltro("urgentes")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "urgentes" ? "2px solid #DC2626" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" }}>Urgentes</span><AlertTriangle style={{ width: "16px", height: "16px", coor: "#DC2626" }} /></div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#DC2626", marginTop: "4px" }}>{urgentes}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>pagos por vencer</span>
        </div>
        <div onClick={() => setFiltro("proximos")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "proximos" ? "2px solid #D97706" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" }}>Próximos</span><Bell style={{ width: "16px", height: "16px", color: "#D97706" }} /></div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#D97706", marginTop: "4px" }}>{proximos}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>próximos 5 días</span>
        </div>
        <div onClick={() =>tFiltro("todos")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "todos" ? "2px solid #059669" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" }}>Total Compromisos</span><CheckCircle style={{ width: "16px", height: "16px", color: "#059669" }} /></div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#059669", marginTop: "4px" }}>{PAGOS_FIJOS.length}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>pagos recurrentes</span>
        </div>
      </div>

      <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 110px 100px 120px", padding: "10px 20px", background: "#FAFBFC", borderBottom: "1px solid #F3F4F6" }}>
          {["Concepto", "Proveedor", "Categoría", "Frecuencia", "Deadline", "Estado"].map(h => (
            <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</span>
          ))}
        </div>
        {filtrados.map((p, i) => {
          const sc = statusColors[p.status];
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 110px 100px 120px", padding: "12px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center", background: p.status === "urgente" ? "#FEF2F2" : "transparent" }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{p.concepto}</span>
              </div>
              <span style={{ fontSize: "12px", color: "#374151" }}>{p.proveedor}</span>
              <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "px", background: "#F3F4F6", color: "#374151", width: "fit-content" }}>{p.categoria.replace(/_/g, " ")}</span>
              <span style={{ fontSize: "11px", color: "#6B7280" }}>{p.frecuencia}</span>
              <span style={{ fontSize: "11px", color: "#374151", fontWeight: "600" }}>{p.deadline}</span>
              <span style={{ fontSize: "11px", fontWeight: "600", padding: "4px 8px", borderRadius: "6px", background: sc.bg, color: sc.color, border: "1px solid " + sc.border, textAlign: "center" }}>{p.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
