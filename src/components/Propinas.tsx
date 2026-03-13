import { useState, useMemo } from "react";
import { Calculator, Users, DollarSign, Calendar, Plus, X, Trash2 } from "lucide-react";

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

interface EmpleadoPropina {
  id: number;
  nombre: string;
  dias: number;
}

interface SemanaHistorial {
  semana: number;
  totalPropinas: number;
  empleados: EmpleadoPropina[];
  fecha: string;
}

export const Propinas = () => {
  const [semana, setSemana] = useState(11);
  const [totalPropinas, setTotalPropinas] = useState(0);
  const [empleados, setEmpleados] = useState<EmpleadoPropina[]>([
    { id: 1, nombre: "Luis Fernando", dias: 6 },
    { id: 2, nombre: "Martha Belem", dias: 6 },
    { id: 3, nombre: "Salvador", dias: 0 },
    { id: 4, nombre: "Jesus Uriel", dias: 6 },
    { id: 5, nombre: "Moises", dias: 6 },
    { id: 6, nombre: "Alejandra Anais", dias: 4 },
    { id: 7, nombre: "Sebastian", dias: 0 },
    { id: 8, nombre: "Edgar Amir", dias: 6 },
    { id: 9, nombre: "Jose Agustin", dias: 6 },
    { id: 10, nombre: "Gerardo", dias: 6 },
  ]);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [historial, setHistorial] = useState<SemanaHistorial[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);

  const totalDias = useMemo(() => empleados.reduce((s, e) => s + e.dias, 0), [empleados]);
  const propinaPorDia = totalDias > 0 ? totalPropinas / totalDias : 0;

  const resultados = useMemo(() => {
    return empleados.map(e => ({
      ...e,
      propina: propinaPorDia * e.dias,
      adelanto: 0,
      total: propinaPorDia * e.dias,
    }));
  }, [empleados, propinaPorDia]);

  const agregarEmpleado = () => {
    if (!nuevoNombre.trim()) return;
    setEmpleados(p => [...p, { id: Math.max(0, ...p.map(e => e.id)) + 1, nombre: nuevoNombre.trim(), dias: 6 }]);
    setNuevoNombre("");
  };

  const eliminarEmpleado = (id: number) => {
    setEmpleados(p => p.filter(e => e.id !== id));
  };

  const updateDias = (id: number, dias: number) => {
    setEmpleados(p => p.map(e => e.id === id ? { ...e, dias: Math.max(0, Math.min(7, dias)) } : e));
  };

  const guardarSemana = () => {
    if (totalPropinas <= 0) { alert("Ingresa el total de propinas de la semana"); return; }
    setHistorial(p => [{ semana, totalPropinas, empleados: [...empleados], fecha: new Date().toISOString().slice(0, 10) }, ...p]);
    setSemana(s => s + 1);
    setTotalPropinas(0);
    setEmpleados(p => p.map(e => ({ ...e, dias: 6 })));
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .prop-row { transition: background 0.1s; }
        .prop-row:hover { background: #FAFBFC !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #3D1C1E 0%, #5C2D30 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calculator style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Calculadora de Propinas</h1>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Distribucion semanal proporcional por dias trabajados</p>
          </div>
        </div>
        <button onClick={() => setVerHistorial(!verHistorial)} style={{ padding: "10px 18px", borderRadius: "10px", border: "none", background: verHistorial ? "#F3F4F6" : "#3D1C1E", color: verHistorial ? "#374151" : "#C8FF00", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
          {verHistorial ? "Volver a calculadora" : "Ver historial"}
        </button>
      </div>

      {!verHistorial ? (
        <>
          {/* Input principal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>Semana #</div>
              <input type="number" value={semana} onChange={e => setSemana(parseInt(e.target.value) || 0)} style={{ width: "100%", fontSize: "28px", fontWeight: "800", color: "#111827", border: "none", outline: "none", background: "transparent" }} />
            </div>
            <div style={{ background: "#3D1C1E", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "#C8FF00", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>Total Propinas Semana</div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "28px", fontWeight: "800", color: "#C8FF00" }}>$</span>
                <input type="number" step="0.01" value={totalPropinas || ""} onChange={e => setTotalPropinas(parseFloat(e.target.value) || 0)} placeholder="0.00" style={{ width: "100%", fontSize: "28px", fontWeight: "800", color: "#FFF", border: "none", outline: "none", background: "transparent" }} />
              </div>
            </div>
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Total Dias</span>
                <Calendar style={{ width: "16px", height: "16px", color: "#3D1C1E", opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#111827", marginTop: "8px" }}>{totalDias}</div>
              <span style={{ fontSize: "11px", color: "#9CA3AF" }}>de {empleados.length} empleados</span>
            </div>
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Propina/Dia</span>
                <DollarSign style={{ width: "16px", height: "16px", color: "#059669", opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#059669", marginTop: "8px" }}>{formatMXN(propinaPorDia)}</div>
              <span style={{ fontSize: "11px", color: "#9CA3AF" }}>por dia trabajado</span>
            </div>
          </div>

          {/* Tabla distribucion */}
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 120px 160px 160px 50px", padding: "12px 24px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
              {["", "Empleado", "Dias", "Propina", "Total", ""].map(h => (
                <span key={h} style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
              ))}
            </div>

            {resultados.map((e, i) => (
              <div key={e.id} className="prop-row" style={{ display: "grid", gridTemplateColumns: "50px 1fr 120px 160px 160px 50px", padding: "12px 24px", borderBottom: "1px solid #F9FAFB", alignItems: "center", animation: "slideUp 0.2s ease " + (i * 0.03) + "s both" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: e.dias > 0 ? "linear-gradient(135deg, #3D1C1E, #5C2D30)" : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", color: e.dias > 0 ? "#C8FF00" : "#9CA3AF", fontSize: "12px", fontWeight: "700" }}>{e.nombre.charAt(0)}</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: e.dias > 0 ? "#111827" : "#9CA3AF" }}>{e.nombre}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button onClick={() => updateDias(e.id, e.dias - 1)} style={{ width: "24px", height: "24px", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#6B7280" }}>-</button>
                  <input type="number" value={e.dias} onChange={ev => updateDias(e.id, parseInt(ev.target.value) || 0)} style={{ width: "40px", textAlign: "center" as const, fontSize: "14px", fontWeight: "700", color: "#111827", border: "1px solid #E5E7EB", borderRadius: "6px", padding: "4px", outline: "none" }} />
                  <button onClick={() => updateDias(e.id, e.dias + 1)} style={{ width: "24px", height: "24px", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#6B7280" }}>+</button>
                </div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: e.propina > 0 ? "#059669" : "#D1D5DB" }}>{formatMXN(e.propina)}</div>
                <div style={{ fontSize: "15px", fontWeight: "800", color: e.total > 0 ? "#111827" : "#D1D5DB" }}>{formatMXN(e.total)}</div>
                <button onClick={() => eliminarEmpleado(e.id)} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px" }}><Trash2 style={{ width: "14px", height: "14px", color: "#D1D5DB" }} /></button>
              </div>
            ))}

            {/* Agregar empleado */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderBottom: "1px solid #F3F4F6" }}>
              <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && agregarEmpleado()} placeholder="Nombre del empleado..." style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px", outline: "none" }} />
              <button onClick={agregarEmpleado} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 14px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}><Plus style={{ width: "14px", height: "14px" }} /> Agregar</button>
            </div>

            {/* TOTAL */}
            <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 120px 160px 160px 50px", padding: "16px 24px", background: "#FAFBFC", borderTop: "2px solid #3D1C1E" }}>
              <span></span>
              <span style={{ fontSize: "14px", fontWeight: "800", color: "#3D1C1E" }}>TOTAL</span>
              <span style={{ fontSize: "14px", fontWeight: "800", color: "#3D1C1E" }}>{totalDias}</span>
              <span style={{ fontSize: "14px", fontWeight: "800", color: "#059669" }}>{formatMXN(resultados.reduce((s, e) => s + e.propina, 0))}</span>
              <span style={{ fontSize: "15px", fontWeight: "900", color: "#3D1C1E" }}>{formatMXN(resultados.reduce((s, e) => s + e.total, 0))}</span>
              <span></span>
            </div>
          </div>

          {/* Boton guardar */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={guardarSemana} style={{ padding: "12px 32px", borderRadius: "12px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 12px rgba(61,28,30,0.3)" }}>
              Guardar Semana {semana} y Siguiente
            </button>
          </div>
        </>
      ) : (
        /* Historial */
        <div>
          {historial.length === 0 ? (
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "60px", textAlign: "center" as const, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <Calendar style={{ width: "40px", height: "40px", color: "#D1D5DB", margin: "0 auto 12px" }} />
              <p style={{ fontSize: "15px", fontWeight: "600", color: "#6B7280" }}>Sin historial</p>
              <p style={{ fontSize: "13px", color: "#9CA3AF" }}>Guarda una semana para verla aqui</p>
            </div>
          ) : historial.map((sem, si) => {
            const td = sem.empleados.reduce((s, e) => s + e.dias, 0);
            const ppd = td > 0 ? sem.totalPropinas / td : 0;
            return (
              <div key={si} style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", background: "#3D1C1E" }}>
                  <div>
                    <span style={{ fontSize: "16px", fontWeight: "800", color: "#FFF" }}>Semana #{sem.semana}</span>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginLeft: "12px" }}>{sem.fecha}</span>
                  </div>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <div style={{ textAlign: "right" as const }}><div style={{ fontSize: "10px", color: "#C8FF00" }}>TOTAL</div><div style={{ fontSize: "16px", fontWeight: "800", color: "#C8FF00" }}>{formatMXN(sem.totalPropinas)}</div></div>
                    <div style={{ textAlign: "right" as const }}><div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>POR DIA</div><div style={{ fontSize: "16px", fontWeight: "800", color: "#FFF" }}>{formatMXN(ppd)}</div></div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "8px 24px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
                  {["Empleado", "Dias", "Propina"].map(h => <span key={h} style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>{h}</span>)}
                </div>
                {sem.empleados.map(e => (
                  <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "10px 24px", borderBottom: "1px solid #F9FAFB" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: e.dias > 0 ? "#111827" : "#9CA3AF" }}>{e.nombre}</span>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{e.dias}</span>
                    <span style={{ fontSize: "14px", fontWeight: "700", color: e.dias > 0 ? "#059669" : "#D1D5DB" }}>{formatMXN(ppd * e.dias)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
