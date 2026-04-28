import { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";
import {
  ChefHat, RefreshCw, TrendingUp, TrendingDown, DollarSign,
  Search, Edit3, Check, X, ChevronDown, ChevronRight, Star,
  AlertTriangle,
} from "lucide-react";

interface Platillo {
  id: number;
  numero: number;
  nombre: string;
  categoria: string;
  costo_receta: number;
  markup: number;
  precio_venta: number;
  precio_venta_con_iva: number;
  margen_contribucion_pesos: number;
  margen_contribucion_pct: number;
  food_cost_pct: number;
  clasificacion: "ESTRELLA" | "CABALLO" | "ROMPECABEZAS" | "PERRO";
}

interface Insumo {
  id: number;
  numero: number;
  categoria: string;
  nombre: string;
  unidad: string;
  precio_unitario: number;
  precio_por_g_ml: number;
  porcentaje_merma: number;
  costo_real: number;
  updated_at: string | null;
}

interface ResumenIngenieria {
  total_platillos: number;
  food_cost_promedio: number;
  markup_promedio: number;
  mejor_margen_pesos: { nombre: string; margen: number };
  peor_margen_pct: { nombre: string; margen_pct: number };
  clasificacion_conteo: Record<string, number>;
}

const CLASIF_META: Record<string, { emoji: string; label: string; color: string; bg: string; desc: string }> = {
  ESTRELLA:     { emoji: "⭐", label: "Estrella",     color: "#059669", bg: "#ECFDF5", desc: "Alto margen y alta rentabilidad. Mantener y promover." },
  CABALLO:      { emoji: "🐴", label: "Caballo",      color: "#2563EB", bg: "#EFF6FF", desc: "Buen margen en pesos pero bajo porcentaje. Revisar precio." },
  ROMPECABEZAS: { emoji: "🧩", label: "Rompecabezas", color: "#D97706", bg: "#FFFBEB", desc: "Buen porcentaje pero menor contribución. Promover más." },
  PERRO:        { emoji: "🐕", label: "Perro",        color: "#DC2626", bg: "#FEF2F2", desc: "Bajo en ambas métricas. Evaluar permanencia en carta." },
};

const CATEGORIAS = ["Todos", "SASHIMIS", "TIRADITOS", "NIGIRIS", "OTRAS ENTRADAS", "CRISPY RICE", "TEMAKIS"];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export const Costeo = ({ restauranteIdOverride }: { restauranteIdOverride?: number }) => {
  const { restauranteId: ctxId } = useRestaurante();
  const restauranteId = restauranteIdOverride ?? ctxId;

  const [platillos, setPlatillos] = useState<Platillo[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [resumen, setResumen] = useState<ResumenIngenieria | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"menu" | "insumos">("menu");
  const [catTab, setCatTab] = useState("Todos");
  const [selectedPlatillo, setSelectedPlatillo] = useState<Platillo | null>(null);
  const [searchInsumo, setSearchInsumo] = useState("");
  const [editingInsumo, setEditingInsumo] = useState<number | null>(null);
  const [editPrecio, setEditPrecio] = useState("");
  const [savingInsumo, setSavingInsumo] = useState(false);

  const cargar = async () => {
    if (!restauranteId) return;
    setLoading(true);
    try {
      const [dataMenu, dataInsumos] = await Promise.all([
        api.get(`/api/costeo/${restauranteId}/ingenieria-menu`),
        api.get(`/api/costeo/${restauranteId}/insumos`),
      ]);
      setPlatillos(dataMenu.platillos ?? []);
      setResumen(dataMenu.resumen ?? null);
      setInsumos(dataInsumos ?? []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [restauranteId]);

  const platillosFiltrados = useMemo(() => {
    if (catTab === "Todos") return platillos;
    return platillos.filter((p) => p.categoria === catTab);
  }, [platillos, catTab]);

  const insumosFiltrados = useMemo(() => {
    if (!searchInsumo) return insumos;
    const q = searchInsumo.toLowerCase();
    return insumos.filter((i) => i.nombre.toLowerCase().includes(q) || i.categoria.toLowerCase().includes(q));
  }, [insumos, searchInsumo]);

  const handleGuardarPrecio = async (insumo: Insumo) => {
    const precio = parseFloat(editPrecio);
    if (isNaN(precio) || precio <= 0) return;
    setSavingInsumo(true);
    try {
      await api.put(`/api/costeo/${restauranteId}/insumo/${insumo.id}`, { precio_unitario: precio });
      await cargar();
      setEditingInsumo(null);
    } catch (e) {
      console.error(e);
    }
    setSavingInsumo(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", gap: "12px", color: "#9CA3AF", fontSize: "13px" }}>
        <RefreshCw style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
        Cargando costeo…
        <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChefHat style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#111827", margin: 0 }}>Costeo & Ingeniería de Menú</h1>
            <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Análisis de márgenes y clasificación de platillos KOI</p>
          </div>
        </div>
        <button onClick={cargar} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
          <RefreshCw style={{ width: "13px", height: "13px" }} />
          Actualizar
        </button>
      </div>

      {/* ── KPI Cards ── */}
      {resumen && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
          {[
            { label: "Food Cost Promedio", value: fmtPct(resumen.food_cost_promedio), sub: "del menú", icon: TrendingDown, color: resumen.food_cost_promedio > 30 ? "#DC2626" : "#059669" },
            { label: "Platillo más rentable", value: resumen.mejor_margen_pesos.nombre, sub: fmt(resumen.mejor_margen_pesos.margen) + " margen", icon: Star, color: "#059669" },
            { label: "Menor contribución %", value: resumen.peor_margen_pct.nombre, sub: fmtPct(resumen.peor_margen_pct.margen_pct * 100 || resumen.peor_margen_pct.margen_pct), icon: TrendingDown, color: "#DC2626" },
            { label: "Markup Promedio", value: `${resumen.markup_promedio}×`, sub: "sobre costo receta", icon: TrendingUp, color: "#7C3AED" },
          ].map((k, i) => {
            const Ic = k.icon;
            return (
              <div key={i} style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{k.label}</span>
                  <Ic style={{ width: "15px", height: "15px", color: k.color, opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: i === 0 || i === 3 ? "22px" : "14px", fontWeight: "800", color: k.color }}>{k.value}</div>
                <span style={{ fontSize: "11px", color: "#9CA3AF" }}>{k.sub}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Clasificación resumen badges ── */}
      {resumen?.clasificacion_conteo && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" as const }}>
          {Object.entries(CLASIF_META).map(([key, meta]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "20px", background: meta.bg, border: `1px solid ${meta.color}22` }}>
              <span style={{ fontSize: "14px" }}>{meta.emoji}</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: meta.color }}>{meta.label}</span>
              <span style={{ fontSize: "13px", fontWeight: "800", color: meta.color }}>{resumen.clasificacion_conteo[key] ?? 0}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs principales ── */}
      <div style={{ display: "flex", gap: "4px", background: "#FFF", borderRadius: "12px", padding: "5px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", width: "fit-content" }}>
        {(["menu", "insumos"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: tab === t ? "700" : "500", background: tab === t ? "#3D1C1E" : "transparent", color: tab === t ? "#C8FF00" : "#6B7280", transition: "all 0.15s" }}>
            {t === "menu" ? "Ingeniería de Menú" : "Catálogo de Insumos"}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: INGENIERÍA DE MENÚ
          ════════════════════════════════════════════════════════════════════ */}
      {tab === "menu" && (
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Category tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "16px", flexWrap: "wrap" as const }}>
              {CATEGORIAS.map((cat) => {
                const active = catTab === cat;
                const count = cat === "Todos" ? platillos.length : platillos.filter((p) => p.categoria === cat).length;
                return (
                  <button key={cat} onClick={() => setCatTab(cat)} style={{ padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: active ? "700" : "500", background: active ? "#3D1C1E" : "#F3F4F6", color: active ? "#C8FF00" : "#6B7280", transition: "all 0.15s" }}>
                    {cat} <span style={{ opacity: 0.7 }}>({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Platillos grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "12px" }}>
              {platillosFiltrados.map((p) => {
                const meta = CLASIF_META[p.clasificacion];
                const isSelected = selectedPlatillo?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlatillo(isSelected ? null : p)}
                    style={{ background: "#FFF", borderRadius: "12px", padding: "16px", cursor: "pointer", border: isSelected ? `2px solid ${meta.color}` : "2px solid #F3F4F6", boxShadow: isSelected ? `0 4px 16px ${meta.color}22` : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.15s" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "2px" }}>{p.categoria}</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827", lineHeight: 1.3 }}>{p.nombre}</div>
                      </div>
                      <span style={{ fontSize: "18px", flexShrink: 0 }}>{meta.emoji}</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "#9CA3AF" }}>Costo</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151" }}>{fmt(p.costo_receta)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "10px", color: "#9CA3AF" }}>Precio</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151" }}>{fmt(p.precio_venta)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "10px", color: "#9CA3AF" }}>Margen</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: meta.color }}>{fmt(p.margen_contribucion_pesos)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "10px", color: "#9CA3AF" }}>Margen %</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: meta.color }}>{fmtPct(p.margen_contribucion_pct)}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ padding: "3px 8px", borderRadius: "6px", background: meta.bg, fontSize: "10px", fontWeight: "700", color: meta.color }}>{meta.label}</div>
                      <div style={{ fontSize: "11px", color: p.food_cost_pct > 30 ? "#DC2626" : "#9CA3AF", fontWeight: "600" }}>FC: {fmtPct(p.food_cost_pct)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          {selectedPlatillo && (() => {
            const p = selectedPlatillo;
            const meta = CLASIF_META[p.clasificacion];
            return (
              <div style={{ width: "300px", flexShrink: 0, background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", position: "sticky" as const, top: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "#9CA3AF", marginBottom: "2px" }}>{p.categoria}</div>
                    <div style={{ fontSize: "15px", fontWeight: "800", color: "#111827" }}>{p.nombre}</div>
                  </div>
                  <button onClick={() => setSelectedPlatillo(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: "2px" }}>
                    <X style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>

                {/* Clasificación badge */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "10px", background: meta.bg, marginBottom: "14px" }}>
                  <span style={{ fontSize: "20px" }}>{meta.emoji}</span>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: meta.color }}>{meta.label}</div>
                    <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px" }}>{meta.desc}</div>
                  </div>
                </div>

                {/* Desglose de costo */}
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "8px", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Desglose</div>
                  {[
                    { l: "Costo receta",      v: fmt(p.costo_receta),               c: "#374151" },
                    { l: `Markup (${p.markup}×)`, v: fmt(p.precio_venta),            c: "#374151" },
                    { l: "Precio sin IVA",    v: fmt(p.precio_venta),               c: "#374151" },
                    { l: "Precio con IVA",    v: fmt(p.precio_venta_con_iva),        c: "#3D1C1E" },
                    { l: "Margen $",          v: fmt(p.margen_contribucion_pesos),   c: meta.color },
                    { l: "Margen %",          v: fmtPct(p.margen_contribucion_pct),  c: meta.color },
                    { l: "Food cost",         v: fmtPct(p.food_cost_pct),            c: p.food_cost_pct > 30 ? "#DC2626" : "#059669" },
                  ].map((row) => (
                    <div key={row.l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F9FAFB" }}>
                      <span style={{ fontSize: "12px", color: "#6B7280" }}>{row.l}</span>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: row.c }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: CATÁLOGO DE INSUMOS
          ════════════════════════════════════════════════════════════════════ */}
      {tab === "insumos" && (
        <div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center" }}>
            <div style={{ position: "relative" as const, flex: 1, maxWidth: "360px" }}>
              <Search style={{ position: "absolute" as const, left: "10px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "#9CA3AF" }} />
              <input
                value={searchInsumo}
                onChange={(e) => setSearchInsumo(e.target.value)}
                placeholder="Buscar insumo o categoría…"
                style={{ width: "100%", paddingLeft: "32px", paddingRight: "12px", paddingTop: "8px", paddingBottom: "8px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" as const }}
              />
            </div>
            <span style={{ fontSize: "12px", color: "#9CA3AF" }}>{insumosFiltrados.length} insumos</span>
          </div>

          {/* Insumos table */}
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["#", "Categoría", "Nombre", "Unidad", "Precio/KG o LT", "Precio/g-ml", "Merma", "Costo Real", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: "0.5px", whiteSpace: "nowrap" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insumosFiltrados.map((insumo, idx) => {
                  const isEditing = editingInsumo === insumo.id;
                  return (
                    <tr key={insumo.id} style={{ borderTop: "1px solid #F3F4F6", background: idx % 2 === 0 ? "#FFF" : "#FAFAFA" }}>
                      <td style={{ padding: "9px 12px", fontSize: "11px", color: "#9CA3AF" }}>{insumo.numero}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "4px", background: "#F3F4F6", fontSize: "10px", fontWeight: "600", color: "#6B7280", whiteSpace: "nowrap" as const }}>{insumo.categoria}</span>
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: "13px", fontWeight: "600", color: "#111827" }}>{insumo.nombre}</td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", color: "#374151" }}>{insumo.unidad}</td>
                      <td style={{ padding: "9px 12px" }}>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editPrecio}
                            onChange={(e) => setEditPrecio(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleGuardarPrecio(insumo); if (e.key === "Escape") setEditingInsumo(null); }}
                            style={{ width: "80px", padding: "4px 8px", border: "1px solid #3D1C1E", borderRadius: "6px", fontSize: "13px", fontWeight: "700", outline: "none" }}
                          />
                        ) : (
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{fmt(insumo.precio_unitario)}</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", color: "#6B7280" }}>{insumo.precio_por_g_ml.toFixed(5)}</td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", color: insumo.porcentaje_merma > 0 ? "#D97706" : "#9CA3AF" }}>
                        {insumo.porcentaje_merma > 0 ? `${insumo.porcentaje_merma}%` : "—"}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", fontWeight: "700", color: "#374151" }}>{insumo.costo_real.toFixed(4)}</td>
                      <td style={{ padding: "9px 12px" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button onClick={() => handleGuardarPrecio(insumo)} disabled={savingInsumo} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#059669", color: "#FFF", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}>
                              <Check style={{ width: "11px", height: "11px" }} />
                            </button>
                            <button onClick={() => setEditingInsumo(null)} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#F3F4F6", color: "#6B7280", cursor: "pointer" }}>
                              <X style={{ width: "11px", height: "11px" }} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingInsumo(insumo.id); setEditPrecio(String(insumo.precio_unitario)); }}
                            style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}
                          >
                            <Edit3 style={{ width: "11px", height: "11px" }} />
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {insumosFiltrados.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center" as const, color: "#9CA3AF", fontSize: "13px" }}>
                No se encontraron insumos
              </div>
            )}
          </div>

          {/* Alerta variación de costo */}
          {insumos.some((i) => i.porcentaje_merma > 0) && (
            <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "10px", background: "#FFFBEB", border: "1px solid #FDE68A", display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <AlertTriangle style={{ width: "16px", height: "16px", color: "#D97706", flexShrink: 0, marginTop: "1px" }} />
              <div style={{ fontSize: "12px", color: "#92400E" }}>
                <strong>Nota sobre merma:</strong> Los insumos con merma aplican la fórmula <code>costo_real = precio/g × (1 + merma)</code>. Al editar el precio de un insumo, el costo real se recalcula automáticamente y se refleja en el análisis de márgenes al recargar.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
