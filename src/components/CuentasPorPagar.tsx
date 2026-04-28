import { useState, useEffect } from "react";
import { Plus, Trash2, Package, X } from "lucide-react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);


export const CuentasPorPagar = () => {
  const { restauranteId } = useRestaurante();

  // ── Categorías (minimal — for provider default dropdown only) ──
  const [categorias, setCategorias] = useState<any[]>([]);

  // ── Proveedores state ──
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showFormProv, setShowFormProv] = useState(false);
  const [newProv, setNewProv] = useState({ nombre: "", categoria_default: "" });

  // ── Analytics state ──
  const [alertasData, setAlertasData] = useState<any[]>([]);
  const [estadisticas, setEstadisticas] = useState<any>(null);
  const [selectedProv, setSelectedProv] = useState<string | null>(null);
  const [historialData, setHistorialData] = useState<any>(null);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

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

  // ── Proveedores handlers ──
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
      fetchProveedores();
      fetchAnalytics();
    } catch (e) {
      alert("Error al eliminar");
    }
  };

  // ── Merge proveedores with alertas data ──
  const provsConAnalytics = proveedores.map((p: any) => {
    const analytics = alertasData.find(
      (a: any) => a.proveedor === p.nombre.trim().toUpperCase()
    );
    return { ...p, analytics };
  });

  const alertasCount = alertasData.filter((a: any) => a.alerta).length;

  // ── Mini bar chart colors ──
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


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── PROVEEDORES ── */}
      <div>
        {/* KPI Cards — 2 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          {/* Top proveedor */}
          <div style={{ background: "#FFF", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #F3F4F6" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Proveedor Top</div>
            {estadisticas?.top_proveedor ? (
              <>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{estadisticas.top_proveedor.nombre}</div>
                <div style={{ fontSize: "13px", color: "#3D1C1E", fontWeight: "600" }}>{fmt(estadisticas.top_proveedor.total)}</div>
              </>
            ) : (
              <div style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin datos</div>
            )}
          </div>

          {/* Mayor incremento */}
          <div style={{ background: "#FFF", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #F3F4F6" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Mayor Incremento</div>
            {estadisticas?.mayor_incremento ? (
              <>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{estadisticas.mayor_incremento.nombre}</div>
                <div style={{ fontSize: "13px", color: "#DC2626", fontWeight: "600" }}>+{estadisticas.mayor_incremento.variacion_pct}% vs ant.</div>
                {estadisticas.mayor_incremento.categoria && <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{estadisticas.mayor_incremento.categoria.replace(/_/g, " ")}</div>}
              </>
            ) : (
              <div style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin incrementos</div>
            )}
          </div>
        </div>

        {/* Alert banner */}
        {alertasCount > 0 && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: "10px", padding: "10px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <span style={{ fontSize: "13px", color: "#92400E", fontWeight: "600" }}>
              {alertasCount} proveedor{alertasCount !== 1 ? "es" : ""} con incremento significativo este mes
            </span>
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", margin: 0 }}>
              <Package style={{ width: "16px", height: "16px", display: "inline", marginRight: "6px", color: "#3D1C1E" }} />
              Proveedores ({proveedores.length})
            </h2>
            <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Alta y gestión de proveedores con categoría default</p>
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
          <div style={{ background: "#FFF", borderRadius: "12px", padding: "16px 20px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
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

        {/* Main layout: list + panel lateral */}
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
          {/* Proveedores list */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 110px 80px 90px", padding: "10px 20px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
                {["Proveedor", "Categoría", "Mes actual", "Var.", ""].map(h => (
                  <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</span>
                ))}
              </div>

              {provsConAnalytics.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center" }}>
                  <Package style={{ width: "32px", height: "32px", color: "#D1D5DB", margin: "0 auto 8px" }} />
                  <p style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin proveedores. Agrega el primero.</p>
                </div>
              ) : provsConAnalytics.map((p: any) => {
                const isSelected = selectedProv === p.nombre.trim().toUpperCase();
                return (
                  <div
                    key={p.id}
                    style={{ display: "grid", gridTemplateColumns: "1fr 140px 110px 80px 90px", padding: "12px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center", background: isSelected ? "#FAFAF5" : "transparent" }}
                  >
                    {/* Nombre */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: p.activo ? "#059669" : "#D1D5DB", flexShrink: 0 }} />
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{p.nombre}</span>
                    </div>

                    {/* Categoría */}
                    <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "#F3F4F6", color: "#374151", width: "fit-content" }}>
                      {(p.categoria_default || "").replace(/_/g, " ")}
                    </span>

                    {/* Mes actual */}
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "#111827" }}>
                      {p.analytics ? fmt(p.analytics.mes_actual) : "—"}
                    </span>

                    {/* Variación badge — solo si hay mes anterior Y variación > 10% */}
                    <span>
                      {(() => {
                        const v = p.analytics?.variacion_pct;
                        const hasMesAnt = p.analytics?.mes_anterior > 0;
                        if (!hasMesAnt || v === null || v === undefined) return null;
                        if (v > 10) return (
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#FFF", background: v >= 20 ? "#DC2626" : "#F97316", borderRadius: "6px", padding: "2px 7px" }}>
                            +{v}% 🔴
                          </span>
                        );
                        if (v < -10) return (
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#FFF", background: "#059669", borderRadius: "6px", padding: "2px 7px" }}>
                            {v}% 🟢
                          </span>
                        );
                        return null;
                      })()}
                    </span>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        onClick={() => handleSelectProv(p.nombre)}
                        style={{ fontSize: "11px", color: isSelected ? "#3D1C1E" : "#6B7280", border: "1px solid #E5E7EB", background: isSelected ? "#F0EFE9" : "#FFF", borderRadius: "6px", padding: "3px 8px", cursor: "pointer", fontWeight: "600" }}
                      >
                        {isSelected ? "Cerrar" : "Ver →"}
                      </button>
                      <button onClick={() => eliminarProveedor(p.id)} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px" }}>
                        <Trash2 style={{ width: "13px", height: "13px", color: "#DC2626" }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panel lateral historial */}
          {selectedProv && (
            <div style={{ width: "320px", flexShrink: 0, background: "#FFF", borderRadius: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)", border: "1px solid #F3F4F6", position: "sticky", top: 0, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
              {/* Header */}
              <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{selectedProv}</div>
                  {historialData && (
                    <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                      {alertasData.find((a: any) => a.proveedor === selectedProv)?.categoria || ""}
                    </div>
                  )}
                </div>
                <button onClick={() => { setSelectedProv(null); setHistorialData(null); }} style={{ border: "none", background: "none", cursor: "pointer", padding: "2px" }}>
                  <X style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />
                </button>
              </div>

              {loadingHistorial ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Cargando...</div>
              ) : historialData ? (
                <>
                  {/* Resumen mes */}
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

                  {/* Historial tabla */}
                  <div style={{ padding: "14px 18px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>
                      Historial (últ. 3 meses)
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
                              <span style={{ fontSize: "10px", background: "#F3F4F6", color: "#374151", borderRadius: "4px", padding: "1px 6px" }}>{tx.categoria}</span>
                              {tx.descripcion && <span style={{ fontSize: "11px", color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.descripcion}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Sin datos</div>
              )}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
