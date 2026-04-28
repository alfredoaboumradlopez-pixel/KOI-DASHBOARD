import { useState, useEffect } from "react";
import { Plus, Trash2, Package, X, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

const catStyle = (nombre: string): { bg: string; border: string; accent: string } => {
  const n = (nombre || "").toUpperCase();
  if (["PROTEINA", "ABARROTES", "BEBIDAS", "VEGETAL", "FRUTA", "ASIATICO", "CARNICO", "LACTEO", "PANADERIA"].some(k => n.includes(k)))
    return { bg: "#FFF7ED", border: "#FED7AA", accent: "#EA580C" };
  if (["PERSONAL", "NOMINA", "HONORARIO"].some(k => n.includes(k)))
    return { bg: "#EFF6FF", border: "#BFDBFE", accent: "#2563EB" };
  if (["LIMPIEZA", "MANTTO", "MANTENIMIENTO", "EQUIPO", "HERRAMIENTA", "SANITARIO"].some(k => n.includes(k)))
    return { bg: "#F0FDF4", border: "#BBF7D0", accent: "#059669" };
  if (["RENTA", "SERVICIO", "LUZ", "GAS", "AGUA", "SEGURO", "TELEFONO"].some(k => n.includes(k)))
    return { bg: "#FAF5FF", border: "#DDD6FE", accent: "#7C3AED" };
  if (["COMISION", "BANCARIA", "PLATAFORMA", "IMPUESTO", "FISCAL"].some(k => n.includes(k)))
    return { bg: "#F8FAFC", border: "#E2E8F0", accent: "#64748B" };
  return { bg: "#F9FAFB", border: "#E5E7EB", accent: "#6B7280" };
};

export const CuentasPorPagar = () => {
  const { restauranteId } = useRestaurante();

  const [categorias, setCategorias] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showFormProv, setShowFormProv] = useState(false);
  const [newProv, setNewProv] = useState({ nombre: "", categoria_default: "" });

  const [alertasData, setAlertasData] = useState<any[]>([]);
  const [estadisticas, setEstadisticas] = useState<any>(null);
  const [selectedProv, setSelectedProv] = useState<string | null>(null);
  const [historialData, setHistorialData] = useState<any>(null);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const [hoveredProv, setHoveredProv] = useState<number | null>(null);
  const [editProv, setEditProv] = useState<{ id: number; nombre: string; categoria_default: string; activo: boolean } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const fetchCategorias = async () => {
    try {
      const data = await api.get("/api/categorias");
      setCategorias(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const fetchProveedores = async () => {
    try {
      const data = await api.get("/api/proveedores");
      setProveedores(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const fetchAnalytics = async () => {
    try {
      const [alertas, stats] = await Promise.all([
        api.get(`/api/proveedores-stats/${restauranteId}/alertas`),
        api.get(`/api/proveedores-stats/${restauranteId}/estadisticas`),
      ]);
      setAlertasData(Array.isArray(alertas) ? alertas : []);
      setEstadisticas(stats);
    } catch (e) {}
  };

  const fetchHistorial = async (nombre: string) => {
    setLoadingHistorial(true);
    try {
      const data = await api.get(
        `/api/proveedores-stats/${restauranteId}/historial/${encodeURIComponent(nombre)}?meses=3`
      );
      setHistorialData(data);
    } catch (e) {
      setHistorialData(null);
    } finally {
      setLoadingHistorial(false);
    }
  };

  useEffect(() => {
    fetchCategorias();
    fetchProveedores();
    fetchAnalytics();
  }, [restauranteId]);

  const catActivas = categorias.filter((c: any) => c.activo);

  const guardarProveedor = async () => {
    if (!newProv.nombre.trim() || !newProv.categoria_default) return;
    try {
      await api.post("/api/proveedores", newProv);
      setNewProv({ nombre: "", categoria_default: "" });
      setShowFormProv(false);
      fetchProveedores();
      fetchAnalytics();
    } catch (e) {
      alert("Error al guardar proveedor");
    }
  };

  const eliminarProveedor = async (id: number) => {
    if (!confirm("¿Eliminar este proveedor?")) return;
    try {
      await api.del("/api/proveedores/" + id);
      if (selectedProv) { setSelectedProv(null); setHistorialData(null); }
      fetchProveedores();
      fetchAnalytics();
    } catch (e) {
      alert("Error al eliminar");
    }
  };

  const editarProveedor = async () => {
    if (!editProv) return;
    setEditSaving(true);
    try {
      await api.put("/api/proveedores/" + editProv.id, {
        nombre: editProv.nombre,
        categoria_default: editProv.categoria_default,
        activo: editProv.activo,
      });
      setEditProv(null);
      fetchProveedores();
      fetchAnalytics();
    } catch {
      alert("Error al editar");
    } finally {
      setEditSaving(false);
    }
  };

  const provsConAnalytics = proveedores.map((p: any) => {
    const analytics = alertasData.find(
      (a: any) => a.proveedor === p.nombre.trim().toUpperCase()
    );
    return { ...p, analytics };
  });

  const totalGastosMes = alertasData.reduce((s: number, a: any) => s + (a.mes_actual || 0), 0);

  const alertasCount = alertasData.filter((a: any) => a.alerta).length;

  const barColor = (idx: number, tendencia: any[]) => {
    if (!tendencia || tendencia.length === 0) return "#9CA3AF";
    const maxVal = Math.max(...tendencia.map((t: any) => t.total));
    const minVal = Math.min(...tendencia.map((t: any) => t.total));
    const cur = tendencia[idx]?.total;
    if (cur === maxVal) return "#DC2626";
    if (cur === minVal) return "#059669";
    return "#9CA3AF";
  };

  const handleSelectProv = (nombre: string) => {
    const nameUpper = nombre.trim().toUpperCase();
    if (selectedProv === nameUpper) {
      setSelectedProv(null);
      setHistorialData(null);
    } else {
      setSelectedProv(nameUpper);
      fetchHistorial(nameUpper);
    }
  };

  const selectedProvObj = provsConAnalytics.find(
    (p: any) => p.nombre.trim().toUpperCase() === selectedProv
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ background: "#FFF", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #F3F4F6" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Proveedor Top</div>
          {estadisticas?.top_proveedor ? (
            <>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{estadisticas.top_proveedor.nombre}</div>
              <div style={{ fontSize: "13px", color: "#3D1C1E", fontWeight: "600" }}>{fmt(estadisticas.top_proveedor.total)}</div>
            </>
          ) : <div style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin datos</div>}
        </div>
        <div style={{ background: "#FFF", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #F3F4F6" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Mayor Incremento</div>
          {estadisticas?.mayor_incremento ? (
            <>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{estadisticas.mayor_incremento.nombre}</div>
              <div style={{ fontSize: "13px", color: "#DC2626", fontWeight: "600" }}>+{estadisticas.mayor_incremento.variacion_pct}% vs ant.</div>
              {estadisticas.mayor_incremento.categoria && <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{estadisticas.mayor_incremento.categoria.replace(/_/g, " ")}</div>}
            </>
          ) : <div style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin incrementos</div>}
        </div>
      </div>

      {/* Alert banner */}
      {alertasCount > 0 && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: "10px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>⚠️</span>
          <span style={{ fontSize: "13px", color: "#92400E", fontWeight: "600" }}>
            {alertasCount} proveedor{alertasCount !== 1 ? "es" : ""} con incremento significativo este mes
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", margin: 0 }}>
            <Package style={{ width: "16px", height: "16px", display: "inline", marginRight: "6px", color: "#3D1C1E" }} />
            Proveedores ({proveedores.length})
          </h2>
          <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Haz click en un proveedor para ver su historial</p>
        </div>
        <button
          onClick={() => setShowFormProv(!showFormProv)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", border: "none", background: showFormProv ? "#E5E7EB" : "#3D1C1E", color: showFormProv ? "#374151" : "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
        >
          {showFormProv ? "Cancelar" : <><Plus style={{ width: "14px", height: "14px" }} /> Nuevo Proveedor</>}
        </button>
      </div>

      {/* New provider form */}
      {showFormProv && (
        <div style={{ background: "#FFF", borderRadius: "12px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", alignItems: "end" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Nombre del proveedor *</label>
              <input
                value={newProv.nombre}
                onChange={e => setNewProv({ ...newProv, nombre: e.target.value })}
                onKeyDown={e => e.key === "Enter" && guardarProveedor()}
                placeholder="Ej: Distribuidora del Pacífico"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Categoría default</label>
              <select
                value={newProv.categoria_default}
                onChange={e => setNewProv({ ...newProv, categoria_default: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }}
              >
                <option value="">Seleccionar...</option>
                {catActivas.map((c: any) => (
                  <option key={c.id} value={c.nombre}>{c.nombre.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <button
              onClick={guardarProveedor}
              disabled={!newProv.nombre.trim() || !newProv.categoria_default}
              style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer", height: "38px" }}
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Main layout: chip grid + side panel */}
      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>

        {/* Chip grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {provsConAnalytics.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", background: "#FFF", borderRadius: "14px" }}>
              <Package style={{ width: "32px", height: "32px", color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin proveedores. Agrega el primero.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {provsConAnalytics.map((p: any) => {
                const s = catStyle(p.categoria_default || "");
                const v = p.analytics?.variacion_pct;
                const hasMesAnt = p.analytics?.mes_anterior > 0;
                const showVariacion = hasMesAnt && v !== null && v !== undefined && Math.abs(v) > 10;
                const isAlerta = showVariacion && v > 10;
                const isSelected = selectedProv === p.nombre.trim().toUpperCase();
                const isHovered = hoveredProv === p.id;

                return (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHoveredProv(p.id)}
                    onMouseLeave={() => setHoveredProv(null)}
                    onClick={() => handleSelectProv(p.nombre)}
                    style={{
                      background: isAlerta ? "#FFF5F5" : s.bg,
                      border: `1.5px solid ${isAlerta ? "#FECACA" : isSelected ? s.accent : s.border}`,
                      borderLeft: `4px solid ${isAlerta ? "#DC2626" : s.accent}`,
                      borderRadius: "10px",
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "box-shadow 0.15s",
                      boxShadow: isSelected ? `0 0 0 2px ${s.accent}33, 0 2px 8px rgba(0,0,0,0.08)` : isHovered ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                      opacity: p.activo ? 1 : 0.6,
                    }}
                  >
                    {/* Name row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.activo ? "#059669" : "#D1D5DB", flexShrink: 0 }} />
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.nombre}
                      </span>
                    </div>

                    {/* Categoría */}
                    <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "8px", paddingLeft: "12px" }}>
                      {(p.categoria_default || "Sin categoría").replace(/_/g, " ")}
                    </div>

                    {/* Bottom row: amount + badge + actions */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                            {p.analytics ? fmt(p.analytics.mes_actual) : "—"}
                          </span>
                          {showVariacion && (
                            <span style={{
                              fontSize: "10px", fontWeight: "700", color: "#FFF",
                              background: v > 10 ? (v >= 25 ? "#DC2626" : "#F97316") : "#059669",
                              borderRadius: "5px", padding: "1px 6px",
                            }}>
                              {v > 0 ? "+" : ""}{v}%
                            </span>
                          )}
                        </div>
                        {p.analytics && totalGastosMes > 0 && (
                          <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px" }}>
                            {((p.analytics.mes_actual / totalGastosMes) * 100).toFixed(1)}% del total
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "2px", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setEditProv({ id: p.id, nombre: p.nombre, categoria_default: p.categoria_default || "", activo: p.activo ?? true });
                          }}
                          title="Editar"
                          style={{ border: "none", background: "none", cursor: "pointer", padding: "3px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                        >
                          <Pencil style={{ width: "12px", height: "12px", color: "#6B7280" }} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); eliminarProveedor(p.id); }}
                          title="Eliminar"
                          style={{ border: "none", background: "none", cursor: "pointer", padding: "3px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                        >
                          <Trash2 style={{ width: "12px", height: "12px", color: "#DC2626" }} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side panel */}
        {selectedProv && (
          <div style={{ width: "320px", flexShrink: 0, background: "#FFF", borderRadius: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.08)", border: "1px solid #F3F4F6", position: "sticky", top: 0, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
            {/* Header */}
            <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{selectedProvObj?.nombre || selectedProv}</div>
                <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                  {(selectedProvObj?.categoria_default || "").replace(/_/g, " ")}
                </div>
              </div>
              <button onClick={() => { setSelectedProv(null); setHistorialData(null); }} style={{ border: "none", background: "none", cursor: "pointer", padding: "2px" }}>
                <X style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />
              </button>
            </div>

            {loadingHistorial ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Cargando...</div>
            ) : historialData ? (
              <>
                {/* Resumen */}
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3F4F6", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px" }}>Este mes</div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>{fmt(historialData.total_mes_actual)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px" }}>Mes ant.</div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>{fmt(historialData.total_mes_anterior)}</div>
                  </div>
                  {historialData.variacion_pct !== null && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: historialData.variacion_pct > 10 ? "#DC2626" : historialData.variacion_pct < 0 ? "#059669" : "#6B7280" }}>
                        {historialData.variacion_pct > 0 ? "↑" : "↓"} {Math.abs(historialData.variacion_pct)}% vs mes anterior
                      </span>
                    </div>
                  )}
                </div>

                {/* Mini bar chart */}
                {historialData.tendencia && historialData.tendencia.length > 0 && (
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3F4F6" }}>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Tendencia</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "60px" }}>
                      {historialData.tendencia.map((t: any, i: number) => {
                        const maxVal = Math.max(...historialData.tendencia.map((x: any) => x.total), 1);
                        const heightPct = maxVal > 0 ? Math.max((t.total / maxVal) * 100, 4) : 4;
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%", justifyContent: "flex-end" }}>
                            <div
                              title={`${t.mes_label}: ${fmt(t.total)}`}
                              style={{ width: "100%", height: `${heightPct}%`, background: barColor(i, historialData.tendencia), borderRadius: "3px 3px 0 0", minHeight: "4px" }}
                            />
                            <span style={{ fontSize: "9px", color: "#9CA3AF" }}>{t.mes_label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Transacciones */}
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>
                    Últimas transacciones
                  </div>
                  {historialData.transacciones.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#9CA3AF" }}>Sin transacciones registradas.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {historialData.transacciones.map((tx: any, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", background: "#FAFBFC", borderRadius: "8px", border: "1px solid #F3F4F6" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                            <span style={{ fontSize: "11px", color: "#6B7280" }}>{tx.fecha}</span>
                            <span style={{ fontSize: "12px", fontWeight: "700", color: "#111827" }}>{fmt(tx.monto)}</span>
                          </div>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <span style={{ fontSize: "10px", background: "#F3F4F6", color: "#374151", borderRadius: "4px", padding: "1px 6px" }}>{(tx.categoria || "").replace(/_/g, " ")}</span>
                            {tx.descripcion && <span style={{ fontSize: "11px", color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.descripcion}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit button */}
                <div style={{ padding: "14px 18px" }}>
                  <button
                    onClick={() => selectedProvObj && setEditProv({ id: selectedProvObj.id, nombre: selectedProvObj.nombre, categoria_default: selectedProvObj.categoria_default || "", activo: selectedProvObj.activo ?? true })}
                    style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", fontWeight: "600", color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <Pencil style={{ width: "13px", height: "13px" }} /> Editar proveedor
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Sin datos</div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editProv !== null && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setEditProv(null); }}
        >
          <div style={{ background: "#FFF", borderRadius: "16px", padding: "24px", width: "380px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", margin: "0 0 20px" }}>Editar Proveedor</h3>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "5px" }}>Nombre</label>
              <input
                value={editProv.nombre}
                onChange={e => setEditProv({ ...editProv, nombre: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "13px", boxSizing: "border-box" }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "5px" }}>Categoría default</label>
              <select
                value={editProv.categoria_default}
                onChange={e => setEditProv({ ...editProv, categoria_default: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "13px" }}
              >
                <option value="">Sin categoría</option>
                {catActivas.map((c: any) => (
                  <option key={c.id} value={c.nombre}>{c.nombre.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>Activo</label>
              <button
                onClick={() => setEditProv({ ...editProv, activo: !editProv.activo })}
                style={{ padding: "4px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "700", background: editProv.activo ? "#D1FAE5" : "#F3F4F6", color: editProv.activo ? "#059669" : "#9CA3AF" }}
              >
                {editProv.activo ? "Activo" : "Inactivo"}
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditProv(null)}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "13px", cursor: "pointer", color: "#6B7280" }}
              >
                Cancelar
              </button>
              <button
                onClick={editarProveedor}
                disabled={editSaving || !editProv.nombre.trim()}
                style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "700", cursor: "pointer", opacity: editSaving ? 0.6 : 1 }}
              >
                {editSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
