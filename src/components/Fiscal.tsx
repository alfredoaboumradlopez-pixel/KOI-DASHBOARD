import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";
import { Calculator, CheckCircle, AlertTriangle, Clock, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

interface Obligacion {
  tipo: string;
  descripcion: string;
  fecha_limite: string;
  dias_para_vencer: number;
  monto_estimado: number;
  estado: "pendiente" | "declarado";
  semaforo: "verde" | "amarillo" | "rojo";
  fecha_declarada: string | null;
  declarada_por: string | null;
}

interface FiscalData {
  periodo: { mes: number; anio: number; nombre: string };
  sin_datos: boolean;
  iva: { causado: number; acreditable: number; por_pagar: number; tasa: number };
  isr: { utilidad_fiscal: number; isr_estimado: number; pagos_provisionales: number; isr_pendiente: number };
  obligaciones: Obligacion[];
  gastos_deducibles: { total: number; sin_factura: number; total_gastos: number; porcentaje_deducible: number };
  resumen: { total_impuestos_estimados: number; semaforo: "verde" | "amarillo" | "rojo"; mensaje: string };
  historial: Array<{ id: number; mes: number; anio: number; tipo: string; monto: number | null; fecha_declarada: string | null; declarada_por: string | null; nombre_mes: string }>;
}

const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const SEM = {
  verde:   { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", dot: "🟢" },
  amarillo:{ bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", dot: "🟡" },
  rojo:    { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", dot: "🔴" },
};

const DISCLAIMER = (
  <p style={{ fontSize: "11px", color: "#9CA3AF", margin: "8px 0 0", fontStyle: "italic" }}>
    Estos son estimados informativos basados en los datos registrados. Confirmar montos exactos con PMG antes de cualquier declaración.
  </p>
);

export const Fiscal = () => {
  const { restauranteId } = useRestaurante();
  const [data, setData] = useState<FiscalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio] = useState(2026);
  const [marcando, setMarcando] = useState<Set<string>>(new Set());
  const [historialOpen, setHistorialOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetch = async () => {
    setLoading(true);
    try {
      const d = await api.get(`/api/fiscal/${restauranteId}/posicion-mes?mes=${mes}&anio=${anio}`);
      setData(d);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [restauranteId, mes, anio]);

  const marcarDeclarado = async (tipo: string) => {
    const key = tipo;
    setMarcando(p => new Set(p).add(key));
    try {
      await api.post(`/api/fiscal/${restauranteId}/obligacion/${encodeURIComponent(tipo)}/declarar?mes=${mes}&anio=${anio}&declarada_por=usuario`, {});
      showToast(`✓ ${tipo} marcado como declarado`);
      await fetch();
    } catch (e: any) {
      alert("Error al marcar: " + (e.message || e));
    } finally {
      setMarcando(p => { const s = new Set(p); s.delete(key); return s; });
    }
  };

  const desmarcarDeclarado = async (tipo: string) => {
    const key = tipo;
    setMarcando(p => new Set(p).add(key));
    try {
      await api.del(`/api/fiscal/${restauranteId}/obligacion/${encodeURIComponent(tipo)}/declarar?mes=${mes}&anio=${anio}`);
      showToast(`Declaración de ${tipo} deshecha`);
      await fetch();
    } catch (e: any) {
      alert("Error al desmarcar: " + (e.message || e));
    } finally {
      setMarcando(p => { const s = new Set(p); s.delete(key); return s; });
    }
  };

  const sem = data?.resumen.semaforo ?? "verde";
  const semCfg = SEM[sem];

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 200, padding: "12px 20px", borderRadius: "10px", background: "#111827", color: "#C8FF00", fontSize: "13px", fontWeight: "700", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", animation: "fadeIn 0.2s" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Calculator style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
        </div>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Posición Fiscal</h1>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>IVA · ISR · Obligaciones · Deducibles — estimados para PMG</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Selector mes */}
          <div style={{ display: "flex", gap: "2px", background: "#FFF", borderRadius: "10px", padding: "3px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <button key={m} onClick={() => setMes(m)}
                style={{ padding: "5px 9px", borderRadius: "7px", border: "none", background: mes === m ? "#3D1C1E" : "transparent", color: mes === m ? "#C8FF00" : "#9CA3AF", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                {MESES[m].slice(0,3)}
              </button>
            ))}
          </div>
          <button onClick={fetch} style={{ padding: "8px", borderRadius: "8px", border: "none", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <RefreshCw style={{ width: "14px", height: "14px", color: "#9CA3AF" }} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#9CA3AF", fontSize: "14px" }}>Calculando posición fiscal…</div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#9CA3AF", fontSize: "14px" }}>Error al cargar datos fiscales</div>
      ) : (
        <>
          {/* ── SECCIÓN 1: Banner situacional ── */}
          <div style={{ padding: "16px 20px", borderRadius: "14px", background: semCfg.bg, border: "1px solid " + semCfg.border, marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "20px" }}>{semCfg.dot}</span>
              <span style={{ fontSize: "15px", fontWeight: "700", color: semCfg.text }}>{data.resumen.mensaje}</span>
            </div>
            {data.sin_datos && (
              <p style={{ fontSize: "12px", color: "#D97706", margin: "6px 0 0", fontWeight: "600" }}>
                ⚠️ Sin cierres de turno registrados para este período — los montos son $0
              </p>
            )}
            {DISCLAIMER}
          </div>

          {/* ── SECCIÓN 2: Cards IVA e ISR ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
            {/* IVA Card */}
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>IVA {data.periodo.nombre}</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "#EFF6FF", color: "#1D4ED8", fontWeight: "600" }}>Tasa 16%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ fontSize: "13px", color: "#6B7280" }}>IVA causado (ventas)</span>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{fmt(data.iva.causado)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "2px solid #E5E7EB" }}>
                <span style={{ fontSize: "13px", color: "#6B7280" }}>IVA acreditable (gastos)</span>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#059669" }}>− {fmt(data.iva.acreditable)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Por pagar (estimado)</span>
                <span style={{ fontSize: "18px", fontWeight: "800", color: data.iva.por_pagar > 0 ? "#DC2626" : "#059669" }}>{fmt(data.iva.por_pagar)}</span>
              </div>
              <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6B7280" }}>Vence: 17 {MESES[data.periodo.mes % 12 + 1] || MESES[1]}</span>
                <span style={{ fontSize: "14px" }}>{SEM[data.obligaciones.find(o => o.tipo === "IVA mensual")?.semaforo ?? "verde"].dot}</span>
              </div>
              {DISCLAIMER}
            </div>

            {/* ISR Card */}
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>ISR Provisional</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "#FDF4FF", color: "#7E22CE", fontWeight: "600" }}>Tasa 30%</span>
              </div>
              <div style={{ padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ fontSize: "12px", color: "#6B7280" }}>Utilidad fiscal (EBITDA)</span>
                <div style={{ fontSize: "18px", fontWeight: "800", color: "#111827", marginTop: "2px" }}>{fmt(data.isr.utilidad_fiscal)}</div>
              </div>
              <div style={{ padding: "10px 0 4px" }}>
                <span style={{ fontSize: "12px", color: "#6B7280" }}>ISR estimado (30%)</span>
                <div style={{ fontSize: "18px", fontWeight: "800", color: data.isr.isr_estimado > 0 ? "#DC2626" : "#059669", marginTop: "2px" }}>{fmt(data.isr.isr_estimado)}</div>
              </div>
              <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "#6B7280" }}>Vence: 17 {MESES[data.periodo.mes % 12 + 1] || MESES[1]}</span>
                <span style={{ fontSize: "14px" }}>{SEM[data.obligaciones.find(o => o.tipo === "ISR provisional")?.semaforo ?? "verde"].dot}</span>
              </div>
              {DISCLAIMER}
            </div>
          </div>

          {/* ── SECCIÓN 3: Calendario de obligaciones ── */}
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: "16px" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: "8px" }}>
              <Clock style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Obligaciones Fiscales — {data.periodo.nombre}</span>
            </div>

            {data.obligaciones.map((o, i) => {
              const cfg = SEM[o.semaforo];
              const isMarcando = marcando.has(o.tipo);
              return (
                <div key={i} style={{ padding: "14px 20px", borderBottom: i < data.obligaciones.length - 1 ? "1px solid #F3F4F6" : "none", background: o.estado === "declarado" ? "#FAFBFC" : "transparent" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", flex: 1 }}>
                      <span style={{ fontSize: "18px", marginTop: "1px" }}>{cfg.dot}</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: o.estado === "declarado" ? "#9CA3AF" : "#111827", textDecoration: o.estado === "declarado" ? "line-through" : "none" }}>
                            {o.tipo} {data.periodo.nombre}
                          </span>
                          {o.estado === "declarado" && (
                            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "6px", background: "#ECFDF5", color: "#059669", fontWeight: "700" }}>DECLARADO</span>
                          )}
                        </div>
                        <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "2px" }}>
                          {o.monto_estimado > 0 ? `Monto estimado: ${fmt(o.monto_estimado)}` : "Sin monto estimado"}
                          {" · "}
                          {o.estado === "declarado"
                            ? `Declarado el ${o.fecha_declarada ? new Date(o.fecha_declarada + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}`
                            : `${Math.abs(o.dias_para_vencer)} días ${o.dias_para_vencer >= 0 ? "restantes" : "de retraso"}`}
                        </div>
                      </div>
                    </div>
                    <div>
                      {o.estado === "pendiente" ? (
                        <button onClick={() => marcarDeclarado(o.tipo)} disabled={isMarcando}
                          style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: isMarcando ? "#9CA3AF" : "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: isMarcando ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                          {isMarcando ? "…" : "Marcar como declarado"}
                        </button>
                      ) : (
                        <button onClick={() => desmarcarDeclarado(o.tipo)} disabled={isMarcando}
                          style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "12px", cursor: isMarcando ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                          {isMarcando ? "…" : "Deshacer"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div style={{ padding: "10px 20px", borderTop: "1px solid #F3F4F6", background: "#FAFBFC" }}>
              {DISCLAIMER}
            </div>
          </div>

          {/* ── SECCIÓN 4: Gastos deducibles vs no deducibles ── */}
          <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <CheckCircle style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Gastos — Deducibles vs No Deducibles</span>
            </div>

            <div style={{ display: "flex", gap: "24px", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "2px" }}>Con factura (deducible)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontSize: "20px", fontWeight: "800", color: "#059669" }}>{fmt(data.gastos_deducibles.total)}</span>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#059669" }}>{data.gastos_deducibles.porcentaje_deducible}%</span>
                </div>
              </div>
              <div style={{ width: "1px", background: "#E5E7EB" }} />
              <div>
                <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "2px" }}>Sin factura (no deducible)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontSize: "20px", fontWeight: "800", color: "#DC2626" }}>{fmt(data.gastos_deducibles.sin_factura)}</span>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#DC2626" }}>{(100 - data.gastos_deducibles.porcentaje_deducible).toFixed(1)}%</span>
                </div>
              </div>
              <div style={{ width: "1px", background: "#E5E7EB" }} />
              <div>
                <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "2px" }}>Total gastos</div>
                <span style={{ fontSize: "20px", fontWeight: "800", color: "#111827" }}>{fmt(data.gastos_deducibles.total_gastos)}</span>
              </div>
            </div>

            {/* Barra de progreso */}
            <div style={{ height: "10px", borderRadius: "6px", background: "#FEE2E2", overflow: "hidden", marginBottom: "8px" }}>
              <div style={{ height: "100%", width: data.gastos_deducibles.porcentaje_deducible + "%", background: "linear-gradient(90deg,#059669,#10B981)", borderRadius: "6px", transition: "width 0.5s" }} />
            </div>

            {data.gastos_deducibles.porcentaje_deducible < 70 && data.gastos_deducibles.total_gastos > 0 && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#FFFBEB", border: "1px solid #FDE68A", marginTop: "10px" }}>
                <span style={{ fontSize: "12px", color: "#92400E", fontWeight: "600" }}>
                  ⚠️ El {(100 - data.gastos_deducibles.porcentaje_deducible).toFixed(1)}% de tus gastos no tienen factura — solicitar comprobantes puede reducir tu carga fiscal
                </span>
              </div>
            )}

            {DISCLAIMER}
          </div>

          {/* ── SECCIÓN 5: Historial de declaraciones ── */}
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: "16px" }}>
            <button onClick={() => setHistorialOpen(!historialOpen)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", border: "none", background: "none", cursor: "pointer", borderBottom: historialOpen ? "1px solid #F3F4F6" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Historial de Declaraciones</span>
                {data.historial.length > 0 && (
                  <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", fontWeight: "700" }}>{data.historial.length} registros</span>
                )}
              </div>
              {historialOpen ? <ChevronUp style={{ width: "16px", height: "16px", color: "#9CA3AF" }} /> : <ChevronDown style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />}
            </button>

            {historialOpen && (
              <div>
                {data.historial.length === 0 ? (
                  <div style={{ padding: "28px", textAlign: "center", fontSize: "13px", color: "#9CA3AF" }}>Sin declaraciones registradas aún</div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "120px 140px 120px 1fr 40px", padding: "8px 20px", background: "#FAFBFC", borderBottom: "1px solid #F3F4F6" }}>
                      {["Período", "Tipo", "Monto", "Declarado", ""].map(h => (
                        <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px" }}>{h}</span>
                      ))}
                    </div>
                    {data.historial.map((h, i) => (
                      <div key={h.id} style={{ display: "grid", gridTemplateColumns: "120px 140px 120px 1fr 40px", padding: "10px 20px", borderBottom: i < data.historial.length - 1 ? "1px solid #F9FAFB" : "none", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", color: "#374151", fontWeight: "600" }}>{h.nombre_mes} {h.anio}</span>
                        <span style={{ fontSize: "12px", color: "#6B7280" }}>{h.tipo}</span>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{h.monto ? fmt(h.monto) : "—"}</span>
                        <span style={{ fontSize: "12px", color: "#059669" }}>
                          Declarado {h.fecha_declarada ? new Date(h.fecha_declarada + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </span>
                        <CheckCircle style={{ width: "16px", height: "16px", color: "#059669" }} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Resumen total estimado */}
          <div style={{ background: "#3D1C1E", borderRadius: "14px", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total impuestos estimados {data.periodo.nombre}</div>
              <div style={{ fontSize: "28px", fontWeight: "900", color: "#C8FF00", marginTop: "4px" }}>{fmt(data.resumen.total_impuestos_estimados)}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "4px", fontStyle: "italic" }}>Estimado — confirmar con PMG antes de declarar</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: "4px" }}>IVA + ISR provisional</div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div><div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>IVA</div><div style={{ fontSize: "16px", fontWeight: "800", color: "#FFF" }}>{fmt(data.iva.por_pagar)}</div></div>
                <div><div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>ISR</div><div style={{ fontSize: "16px", fontWeight: "800", color: "#FFF" }}>{fmt(data.isr.isr_estimado)}</div></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
