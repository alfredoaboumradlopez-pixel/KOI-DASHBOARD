import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api } from "../services/api";
import { useRestaurante } from "../context/RestauranteContext";
import {
  ChefHat, RefreshCw, TrendingUp, TrendingDown, Search, Edit3,
  Check, X, Star, AlertTriangle, Plus, Trash2, ChevronDown,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

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
  cantidad_vendida: number;
  pct_popularidad: number | null;
  umbral_popularidad: number | null;
  margen_promedio_menu: number | null;
  margen_vs_promedio: number | null;
  recomendacion: string;
}

interface IngredienteDetalle {
  insumo_id: number | null;
  nombre_ingrediente: string;
  unidad: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
}

interface PlatilloDetalle extends Platillo {
  activo: boolean;
  ingredientes: IngredienteDetalle[];
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

interface IngredienteEdit {
  _id: string;
  insumo_id: number | null;
  nombre_ingrediente: string;
  unidad: string;
  cantidad: string;
  costo_unitario: number;
  _search: string;
}

interface ResumenIngenieria {
  total_platillos: number;
  food_cost_promedio: number;
  markup_promedio: number;
  mejor_margen_pesos: { nombre: string; margen: number };
  peor_margen_pct: { nombre: string; margen_pct: number };
  clasificacion_conteo: Record<string, number>;
  umbral_popularidad: number;
  margen_promedio_ponderado: number;
  tiene_datos_ventas: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASIF_META: Record<string, { emoji: string; label: string; color: string; bg: string; desc: string }> = {
  ESTRELLA:     { emoji: "⭐", label: "Estrella",     color: "#059669", bg: "#ECFDF5", desc: "Alto margen y alta rentabilidad. Mantener y promover." },
  CABALLO:      { emoji: "🐴", label: "Caballo",      color: "#2563EB", bg: "#EFF6FF", desc: "Buen margen en pesos pero bajo porcentaje. Revisar precio." },
  ROMPECABEZAS: { emoji: "🧩", label: "Rompecabezas", color: "#D97706", bg: "#FFFBEB", desc: "Buen porcentaje pero menor contribución. Promover más." },
  PERRO:        { emoji: "🐕", label: "Perro",        color: "#DC2626", bg: "#FEF2F2", desc: "Bajo en ambas métricas. Evaluar permanencia en carta." },
};

const CATEGORIAS_MENU = ["Todos", "SASHIMIS", "TIRADITOS", "NIGIRIS", "OTRAS ENTRADAS", "CRISPY RICE", "TEMAKIS"];
const CATEGORIAS_PLATILLO = ["SASHIMIS", "TIRADITOS", "NIGIRIS", "OTRAS ENTRADAS", "CRISPY RICE", "TEMAKIS"];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const uid = () => Math.random().toString(36).slice(2);

// ── Main Component ────────────────────────────────────────────────────────────

export const Costeo = ({ restauranteIdOverride }: { restauranteIdOverride?: number }) => {
  const { restauranteId: ctxId } = useRestaurante();
  const restauranteId = restauranteIdOverride ?? ctxId;

  // Core data
  const [platillos, setPlatillos] = useState<Platillo[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [resumen, setResumen] = useState<ResumenIngenieria | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation
  const [tab, setTab] = useState<"menu" | "insumos">("menu");
  const [catTab, setCatTab] = useState("Todos");

  // Detail panel
  const [selectedPlatillo, setSelectedPlatillo] = useState<Platillo | null>(null);
  const [detalle, setDetalle] = useState<PlatilloDetalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Insumos tab
  const [searchInsumo, setSearchInsumo] = useState("");
  const [editingInsumo, setEditingInsumo] = useState<number | null>(null);
  const [editPrecio, setEditPrecio] = useState("");
  const [savingInsumo, setSavingInsumo] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlatilloId, setModalPlatilloId] = useState<number | null>(null);
  const [mNombre, setMNombre] = useState("");
  const [mCategoria, setMCategoria] = useState("SASHIMIS");
  const [mPrecio, setMPrecio] = useState("");
  const [mMarkup, setMMarkup] = useState("3.0");
  const [mActivo, setMActivo] = useState(true);
  const [mIngredientes, setMIngredientes] = useState<IngredienteEdit[]>([]);
  const [mSaving, setMSaving] = useState(false);
  const [mError, setMError] = useState("");
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
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
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [restauranteId]);

  useEffect(() => { cargar(); }, [cargar]);

  const cargarDetalle = useCallback(async (id: number) => {
    if (!restauranteId) return;
    setLoadingDetalle(true);
    setDetalle(null);
    try {
      const d = await api.get(`/api/costeo/${restauranteId}/platillo/${id}`);
      setDetalle(d);
    } catch (e) { console.error(e); }
    setLoadingDetalle(false);
  }, [restauranteId]);

  const handleSelectPlatillo = (p: Platillo) => {
    if (selectedPlatillo?.id === p.id) {
      setSelectedPlatillo(null);
      setDetalle(null);
    } else {
      setSelectedPlatillo(p);
      cargarDetalle(p.id);
    }
  };

  // ── Toast ─────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const openModalNew = () => {
    setModalPlatilloId(null);
    setMNombre("");
    setMCategoria("OTRAS ENTRADAS");
    setMPrecio("");
    setMMarkup("3.0");
    setMActivo(true);
    setMIngredientes([]);
    setMError("");
    setDropdownOpenId(null);
    setModalOpen(true);
  };

  const openModalEdit = (d: PlatilloDetalle) => {
    setModalPlatilloId(d.id);
    setMNombre(d.nombre);
    setMCategoria(d.categoria);
    setMPrecio(String(d.precio_venta));
    setMMarkup(String(d.markup));
    setMActivo(d.activo !== false);
    setMIngredientes(
      d.ingredientes.map((ing) => ({
        _id: uid(),
        insumo_id: ing.insumo_id,
        nombre_ingrediente: ing.nombre_ingrediente,
        unidad: ing.unidad,
        cantidad: String(ing.cantidad),
        costo_unitario: ing.costo_unitario,
        _search: ing.nombre_ingrediente,
      }))
    );
    setMError("");
    setDropdownOpenId(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setMError("");
    setDropdownOpenId(null);
  };

  // ── Ingredient row helpers ────────────────────────────────────────────────

  const addIngrediente = () => {
    setMIngredientes((prev) => [
      ...prev,
      { _id: uid(), insumo_id: null, nombre_ingrediente: "", unidad: "g", cantidad: "", costo_unitario: 0, _search: "" },
    ]);
  };

  const removeIngrediente = (id: string) =>
    setMIngredientes((prev) => prev.filter((r) => r._id !== id));

  const updateIngrediente = (id: string, patch: Partial<IngredienteEdit>) =>
    setMIngredientes((prev) => prev.map((r) => r._id === id ? { ...r, ...patch } : r));

  const selectInsumo = (rowId: string, insumo: Insumo) => {
    updateIngrediente(rowId, {
      insumo_id: insumo.id,
      nombre_ingrediente: insumo.nombre,
      unidad: insumo.unidad === "KG" ? "g" : insumo.unidad === "LT" ? "ml" : insumo.unidad,
      costo_unitario: insumo.costo_real,
      _search: insumo.nombre,
    });
    setDropdownOpenId(null);
  };

  // ── Real-time modal calculations ──────────────────────────────────────────

  const mCostoReceta = useMemo(() => {
    return mIngredientes.reduce((acc, ing) => {
      const cant = parseFloat(ing.cantidad) || 0;
      return acc + cant * ing.costo_unitario;
    }, 0);
  }, [mIngredientes]);

  const mPrecioVenta = parseFloat(mPrecio) || 0;
  const mMarkupNum = parseFloat(mMarkup) || 3.0;
  const mMargenPesos = mPrecioVenta - mCostoReceta;
  const mMargenPct = mPrecioVenta > 0 ? (mMargenPesos / mPrecioVenta) * 100 : 0;
  const mFoodCost = mPrecioVenta > 0 ? (mCostoReceta / mPrecioVenta) * 100 : 0;

  // ── Save modal ────────────────────────────────────────────────────────────

  const handleSaveModal = async () => {
    if (!mNombre.trim()) { setMError("El nombre es requerido"); return; }
    if (mPrecioVenta <= 0) { setMError("El precio de venta debe ser mayor a 0"); return; }

    const body = {
      nombre: mNombre.trim(),
      categoria: mCategoria,
      precio_venta: mPrecioVenta,
      markup: mMarkupNum,
      activo: mActivo,
      ingredientes: mIngredientes
        .filter((ing) => ing.nombre_ingrediente && (parseFloat(ing.cantidad) || 0) > 0)
        .map((ing) => ({
          insumo_id: ing.insumo_id,
          nombre_ingrediente: ing.nombre_ingrediente,
          unidad: ing.unidad,
          cantidad: parseFloat(ing.cantidad) || 0,
          costo_unitario: ing.costo_unitario,
          costo_total: (parseFloat(ing.cantidad) || 0) * ing.costo_unitario,
        })),
    };

    setMSaving(true);
    setMError("");
    try {
      if (modalPlatilloId !== null) {
        await api.put(`/api/costeo/${restauranteId}/platillo/${modalPlatilloId}`, body);
      } else {
        await api.post(`/api/costeo/${restauranteId}/platillos`, body);
      }
      closeModal();
      await cargar();
      if (modalPlatilloId !== null && selectedPlatillo?.id === modalPlatilloId) {
        cargarDetalle(modalPlatilloId);
      }
      showToast(modalPlatilloId !== null ? "✓ Receta actualizada" : "✓ Platillo creado");
    } catch (e: any) {
      setMError(e?.message ?? "Error al guardar");
    }
    setMSaving(false);
  };

  // ── Filtered data ─────────────────────────────────────────────────────────

  const platillosFiltrados = useMemo(() => {
    if (catTab === "Todos") return platillos;
    return platillos.filter((p) => p.categoria === catTab);
  }, [platillos, catTab]);

  const insumosFiltrados = useMemo(() => {
    if (!searchInsumo) return insumos;
    const q = searchInsumo.toLowerCase();
    return insumos.filter((i) => i.nombre.toLowerCase().includes(q) || i.categoria.toLowerCase().includes(q));
  }, [insumos, searchInsumo]);

  // ── Insumo price edit ─────────────────────────────────────────────────────

  const handleGuardarPrecio = async (insumo: Insumo) => {
    const precio = parseFloat(editPrecio);
    if (isNaN(precio) || precio <= 0) return;
    setSavingInsumo(true);
    try {
      await api.put(`/api/costeo/${restauranteId}/insumo/${insumo.id}`, { precio_unitario: precio });
      await cargar();
      setEditingInsumo(null);
      showToast("✓ Precio actualizado");
    } catch (e) { console.error(e); }
    setSavingInsumo(false);
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", gap: "12px", color: "#9CA3AF", fontSize: "13px" }}>
        <RefreshCw style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
        Cargando costeo…
        <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "#111827", color: "#C8FF00", padding: "12px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: "700", zIndex: 9999, animation: "toastIn 0.25s ease", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}

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
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={openModalNew} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", cursor: "pointer", fontSize: "12px", fontWeight: "700" }}>
            <Plus style={{ width: "13px", height: "13px" }} />
            Nuevo platillo
          </button>
          <button onClick={cargar} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
            <RefreshCw style={{ width: "13px", height: "13px" }} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {resumen && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
          {[
            { label: "Food Cost Promedio", value: fmtPct(resumen.food_cost_promedio), sub: "del menú", icon: TrendingDown, color: resumen.food_cost_promedio > 30 ? "#DC2626" : "#059669" },
            { label: "Platillo más rentable", value: resumen.mejor_margen_pesos.nombre, sub: fmt(resumen.mejor_margen_pesos.margen) + " margen", icon: Star, color: "#059669" },
            { label: "Menor contribución %", value: resumen.peor_margen_pct.nombre, sub: fmtPct(resumen.peor_margen_pct.margen_pct), icon: TrendingDown, color: "#DC2626" },
            { label: "Markup Promedio", value: `${resumen.markup_promedio}×`, sub: "sobre costo receta", icon: TrendingUp, color: "#7C3AED" },
          ].map((k, i) => {
            const Ic = k.icon;
            return (
              <div key={i} style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{k.label}</span>
                  <Ic style={{ width: "15px", height: "15px", color: k.color, opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: i === 0 || i === 3 ? "22px" : "13px", fontWeight: "800", color: k.color, lineHeight: 1.2 }}>{k.value}</div>
                <span style={{ fontSize: "11px", color: "#9CA3AF" }}>{k.sub}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Resumen del Menú (Kasavana-Smith) ── */}
      {resumen && (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
              Resumen del Menú
            </span>
            {resumen.tiene_datos_ventas ? (
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#059669", background: "#ECFDF5", padding: "2px 8px", borderRadius: "20px" }}>
                ✓ Metodología Kasavana-Smith · Abr 2026
              </span>
            ) : (
              <span style={{ fontSize: "11px", color: "#9CA3AF" }}>Sin datos de ventas — clasificación por margen</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: resumen.tiene_datos_ventas ? "14px" : "0" }}>
            {Object.entries(CLASIF_META).map(([key, meta]) => (
              <div key={key} style={{ padding: "12px 10px", borderRadius: "10px", background: meta.bg, border: `1px solid ${meta.color}22`, textAlign: "center" as const }}>
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>{meta.emoji}</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: meta.color }}>{meta.label}</div>
                <div style={{ fontSize: "26px", fontWeight: "900", color: meta.color, lineHeight: 1 }}>{resumen.clasificacion_conteo[key] ?? 0}</div>
                <div style={{ fontSize: "10px", color: "#9CA3AF" }}>platillos</div>
              </div>
            ))}
          </div>

          {resumen.tiene_datos_ventas && (
            <div style={{ display: "flex", gap: "20px", padding: "10px 14px", background: "#F9FAFB", borderRadius: "8px", fontSize: "12px", flexWrap: "wrap" as const }}>
              <div>
                <span style={{ color: "#9CA3AF" }}>Umbral popularidad: </span>
                <strong style={{ color: "#374151" }}>{fmtPct(resumen.umbral_popularidad)}</strong>
                <span style={{ color: "#9CA3AF" }}> ({resumen.total_platillos} platillos × 70%)</span>
              </div>
              <div>
                <span style={{ color: "#9CA3AF" }}>Margen promedio ponderado: </span>
                <strong style={{ color: "#374151" }}>{fmt(resumen.margen_promedio_ponderado)}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main tabs ── */}
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
            {/* Category filter */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "16px", flexWrap: "wrap" as const }}>
              {CATEGORIAS_MENU.map((cat) => {
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: "12px" }}>
              {platillosFiltrados.map((p) => {
                const meta = CLASIF_META[p.clasificacion];
                const isSelected = selectedPlatillo?.id === p.id;
                return (
                  <div key={p.id} onClick={() => handleSelectPlatillo(p)}
                    style={{ background: "#FFF", borderRadius: "12px", padding: "16px", cursor: "pointer", border: isSelected ? `2px solid ${meta.color}` : "2px solid #F3F4F6", boxShadow: isSelected ? `0 4px 16px ${meta.color}22` : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.15s" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "#9CA3AF", marginBottom: "2px" }}>{p.categoria}</div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827", lineHeight: 1.3 }}>{p.nombre}</div>
                      </div>
                      <span style={{ fontSize: "18px", flexShrink: 0 }}>{meta.emoji}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                      {[
                        { l: "Costo", v: fmt(p.costo_receta), c: "#374151" },
                        { l: "Precio", v: fmt(p.precio_venta), c: "#374151" },
                        { l: "Margen $", v: fmt(p.margen_contribucion_pesos), c: meta.color },
                        { l: "Margen %", v: fmtPct(p.margen_contribucion_pct), c: meta.color },
                      ].map((row) => (
                        <div key={row.l}>
                          <div style={{ fontSize: "10px", color: "#9CA3AF" }}>{row.l}</div>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: row.c }}>{row.v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: p.cantidad_vendida > 0 ? "8px" : "0" }}>
                      <div style={{ padding: "3px 8px", borderRadius: "6px", background: meta.bg, fontSize: "10px", fontWeight: "700", color: meta.color }}>{meta.label}</div>
                      <div style={{ fontSize: "11px", color: p.food_cost_pct > 30 ? "#DC2626" : "#9CA3AF", fontWeight: "600" }}>FC: {fmtPct(p.food_cost_pct)}</div>
                    </div>
                    {p.cantidad_vendida > 0 && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#9CA3AF", marginBottom: "3px" }}>
                          <span>{p.cantidad_vendida} vendidos · {p.pct_popularidad?.toFixed(1)}% pop</span>
                          <span>umbral {p.umbral_popularidad?.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: "3px", background: "#F3F4F6", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.min(100, ((p.pct_popularidad ?? 0) / (p.umbral_popularidad || 1)) * 100)}%`,
                            background: (p.pct_popularidad ?? 0) >= (p.umbral_popularidad ?? 0) ? "#059669" : "#D97706",
                            borderRadius: "2px",
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Detail panel ── */}
          {selectedPlatillo && (
            <div style={{ width: "310px", flexShrink: 0, background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", position: "sticky" as const, top: "20px", maxHeight: "calc(100vh - 80px)", overflowY: "auto" as const }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "#9CA3AF", marginBottom: "2px" }}>{selectedPlatillo.categoria}</div>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: "#111827" }}>{selectedPlatillo.nombre}</div>
                </div>
                <button onClick={() => { setSelectedPlatillo(null); setDetalle(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: "2px" }}>
                  <X style={{ width: "16px", height: "16px" }} />
                </button>
              </div>

              {loadingDetalle && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#9CA3AF", fontSize: "12px", padding: "12px 0" }}>
                  <RefreshCw style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
                  Cargando…
                </div>
              )}

              {detalle && (() => {
                const meta = CLASIF_META[detalle.clasificacion];
                return (
                  <>
                    {/* Clasificación */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "10px", background: meta.bg, marginBottom: "10px" }}>
                      <span style={{ fontSize: "20px" }}>{meta.emoji}</span>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "700", color: meta.color }}>{meta.label}</div>
                        <div style={{ fontSize: "10px", color: "#6B7280", marginTop: "2px", lineHeight: 1.3 }}>{meta.desc}</div>
                      </div>
                    </div>

                    {/* Kasavana-Smith reasoning */}
                    {selectedPlatillo && selectedPlatillo.pct_popularidad != null && (
                      <div style={{ background: "#F9FAFB", borderRadius: "8px", padding: "10px 12px", marginBottom: "10px", fontSize: "11px", color: "#6B7280", lineHeight: 1.6 }}>
                        <div>
                          <strong style={{ color: "#374151" }}>{selectedPlatillo.cantidad_vendida}</strong> vendidos
                          {" "}({fmtPct(selectedPlatillo.pct_popularidad)} del total) — umbral {fmtPct(selectedPlatillo.umbral_popularidad ?? 0)}
                        </div>
                        <div>
                          Margen <strong style={{ color: "#374151" }}>{fmt(selectedPlatillo.margen_contribucion_pesos)}</strong>
                          {" "}— promedio del menú {fmt(selectedPlatillo.margen_promedio_menu ?? 0)}
                          {" "}
                          <span style={{ color: (selectedPlatillo.margen_vs_promedio ?? 0) >= 0 ? "#059669" : "#DC2626", fontWeight: "700" }}>
                            ({(selectedPlatillo.margen_vs_promedio ?? 0) >= 0 ? "+" : ""}{fmt(selectedPlatillo.margen_vs_promedio ?? 0)})
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Recomendación */}
                    {selectedPlatillo?.recomendacion && (
                      <div style={{ padding: "10px 12px", background: meta.bg, borderRadius: "8px", marginBottom: "10px", fontSize: "11px", color: meta.color, fontWeight: "600", lineHeight: 1.5, border: `1px solid ${meta.color}22` }}>
                        💡 {selectedPlatillo.recomendacion}
                      </div>
                    )}

                    {/* Editar receta */}
                    <button onClick={() => openModalEdit(detalle)}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "9px", borderRadius: "8px", border: "1px solid #3D1C1E", background: "#3D1C1E", color: "#C8FF00", cursor: "pointer", fontSize: "12px", fontWeight: "700", marginBottom: "14px" }}
                    >
                      <Edit3 style={{ width: "13px", height: "13px" }} />
                      Editar receta
                    </button>

                    {/* Desglose */}
                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", marginBottom: "8px", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Desglose</div>
                      {[
                        { l: "Costo receta",       v: fmt(detalle.costo_receta),               c: "#374151" },
                        { l: `Markup (${detalle.markup}×)`, v: fmt(detalle.precio_venta),       c: "#374151" },
                        { l: "Precio con IVA",     v: fmt(detalle.precio_venta_con_iva),        c: "#3D1C1E" },
                        { l: "Margen $",           v: fmt(detalle.margen_contribucion_pesos),   c: meta.color },
                        { l: "Margen %",           v: fmtPct(detalle.margen_contribucion_pct),  c: meta.color },
                        { l: "Food cost",          v: fmtPct(detalle.food_cost_pct),            c: detalle.food_cost_pct > 30 ? "#DC2626" : "#059669" },
                      ].map((row) => (
                        <div key={row.l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F9FAFB" }}>
                          <span style={{ fontSize: "12px", color: "#6B7280" }}>{row.l}</span>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: row.c }}>{row.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Ingredientes */}
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", marginBottom: "8px", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
                        Ingredientes ({detalle.ingredientes.length})
                      </div>
                      {detalle.ingredientes.length === 0 ? (
                        <div style={{ fontSize: "12px", color: "#9CA3AF", padding: "12px 0", textAlign: "center" as const }}>
                          Sin ingredientes registrados
                        </div>
                      ) : (
                        <div style={{ background: "#F9FAFB", borderRadius: "8px", overflow: "hidden" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 50px 56px", gap: "0", padding: "6px 10px", background: "#F3F4F6", fontSize: "9px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>
                            <span>Ingrediente</span><span style={{ textAlign: "right" as const }}>Cant.</span><span style={{ textAlign: "right" as const }}>$/u</span><span style={{ textAlign: "right" as const }}>Total</span>
                          </div>
                          {detalle.ingredientes.map((ing, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 50px 56px", gap: "0", padding: "6px 10px", borderTop: i > 0 ? "1px solid #E5E7EB" : "none", alignItems: "center" }}>
                              <span style={{ fontSize: "11px", color: "#374151", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{ing.nombre_ingrediente || "—"}</span>
                              <span style={{ fontSize: "11px", color: "#6B7280", textAlign: "right" as const }}>{ing.cantidad}{ing.unidad}</span>
                              <span style={{ fontSize: "10px", color: "#9CA3AF", textAlign: "right" as const }}>{ing.costo_unitario.toFixed(3)}</span>
                              <span style={{ fontSize: "11px", fontWeight: "700", color: "#374151", textAlign: "right" as const }}>{fmt(ing.costo_total)}</span>
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "#F3F4F6", borderTop: "1px solid #E5E7EB" }}>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: "#374151" }}>Total costo</span>
                            <span style={{ fontSize: "12px", fontWeight: "800", color: "#3D1C1E" }}>{fmt(detalle.costo_receta)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
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
              <input value={searchInsumo} onChange={(e) => setSearchInsumo(e.target.value)} placeholder="Buscar insumo o categoría…"
                style={{ width: "100%", paddingLeft: "32px", paddingRight: "12px", paddingTop: "8px", paddingBottom: "8px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" as const }}
              />
            </div>
            <span style={{ fontSize: "12px", color: "#9CA3AF" }}>{insumosFiltrados.length} insumos</span>
          </div>

          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["#", "Categoría", "Nombre", "Unidad", "Precio/KG·LT", "Precio/g·ml", "Merma", "Costo Real", ""].map((h) => (
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
                          <input autoFocus value={editPrecio} onChange={(e) => setEditPrecio(e.target.value)}
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
                            <button onClick={() => handleGuardarPrecio(insumo)} disabled={savingInsumo} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#059669", color: "#FFF", cursor: "pointer" }}>
                              <Check style={{ width: "11px", height: "11px" }} />
                            </button>
                            <button onClick={() => setEditingInsumo(null)} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#F3F4F6", color: "#6B7280", cursor: "pointer" }}>
                              <X style={{ width: "11px", height: "11px" }} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingInsumo(insumo.id); setEditPrecio(String(insumo.precio_unitario)); }}
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

          {insumos.some((i) => i.porcentaje_merma > 0) && (
            <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "10px", background: "#FFFBEB", border: "1px solid #FDE68A", display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <AlertTriangle style={{ width: "16px", height: "16px", color: "#D97706", flexShrink: 0, marginTop: "1px" }} />
              <div style={{ fontSize: "12px", color: "#92400E" }}>
                <strong>Nota sobre merma:</strong> Los insumos con merma aplican la fórmula <code>costo_real = precio/g × (1 + merma)</code>. Al editar el precio, el costo real se recalcula automáticamente.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL DE EDICIÓN DE RECETA
          ════════════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" as const }}
        >
          <div
            style={{ background: "#FFF", borderRadius: "16px", width: "100%", maxWidth: "720px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", animation: "slideIn 0.2s ease" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "800", color: "#111827" }}>
                  {modalPlatilloId !== null ? `Editar receta — ${mNombre || "…"}` : "Nuevo platillo"}
                </div>
                <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "2px" }}>Ingredientes y datos del platillo</div>
              </div>
              <button onClick={closeModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: "4px" }}>
                <X style={{ width: "18px", height: "18px" }} />
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* ── Sección 1 — Datos del platillo ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Nombre del platillo</label>
                  <input value={mNombre} onChange={(e) => setMNombre(e.target.value)} placeholder="Ej: SASHIMI SALMÓN"
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Categoría</label>
                  <div style={{ position: "relative" as const }}>
                    <select value={mCategoria} onChange={(e) => setMCategoria(e.target.value)} style={{ ...inputStyle, appearance: "none" as const, paddingRight: "32px" }}>
                      {CATEGORIAS_PLATILLO.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "#9CA3AF", pointerEvents: "none" as const }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Precio de venta (sin IVA) $</label>
                  <input type="number" value={mPrecio} onChange={(e) => setMPrecio(e.target.value)} placeholder="0.00" min="0" step="0.5"
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Markup</label>
                  <input type="number" value={mMarkup} onChange={(e) => setMMarkup(e.target.value)} placeholder="3.0" min="1" step="0.1"
                    style={inputStyle} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>Activo</label>
                  <button onClick={() => setMActivo((v) => !v)}
                    style={{ width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer", background: mActivo ? "#059669" : "#D1D5DB", position: "relative" as const, transition: "background 0.2s", flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: "3px", left: mActivo ? "20px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#FFF", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </button>
                  <span style={{ fontSize: "12px", color: mActivo ? "#059669" : "#9CA3AF" }}>{mActivo ? "Sí" : "No"}</span>
                </div>
              </div>

              {/* ── Sección 2 — Ingredientes ── */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>Ingredientes</div>
                  <button onClick={addIngrediente}
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "6px", border: "1px dashed #3D1C1E", background: "transparent", color: "#3D1C1E", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
                  >
                    <Plus style={{ width: "12px", height: "12px" }} />
                    Agregar ingrediente
                  </button>
                </div>

                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 80px 32px", gap: "8px", padding: "6px 8px", background: "#F9FAFB", borderRadius: "6px", marginBottom: "4px", fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>
                  <span>Insumo</span><span>Cantidad</span><span>Unidad</span><span style={{ textAlign: "right" as const }}>$/u · Total</span><span></span>
                </div>

                <div style={{ display: "flex", flexDirection: "column" as const, gap: "4px" }}>
                  {mIngredientes.map((ing) => {
                    const cant = parseFloat(ing.cantidad) || 0;
                    const total = cant * ing.costo_unitario;
                    const filteredInsumos = ing._search.length >= 1
                      ? insumos.filter((i) => i.nombre.toLowerCase().includes(ing._search.toLowerCase())).slice(0, 8)
                      : [];
                    const isDropdownOpen = dropdownOpenId === ing._id;

                    return (
                      <div key={ing._id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 80px 32px", gap: "8px", alignItems: "center" }}>
                        {/* Insumo search */}
                        <div style={{ position: "relative" as const }}>
                          <input
                            value={ing._search}
                            onChange={(e) => {
                              updateIngrediente(ing._id, { _search: e.target.value, nombre_ingrediente: e.target.value, insumo_id: null, costo_unitario: 0 });
                              setDropdownOpenId(ing._id);
                            }}
                            onFocus={() => { if (ing._search) setDropdownOpenId(ing._id); }}
                            onBlur={() => setTimeout(() => setDropdownOpenId(null), 150)}
                            placeholder="Buscar insumo…"
                            style={{ width: "100%", padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "12px", outline: "none", boxSizing: "border-box" as const, background: ing.insumo_id ? "#F0FDF4" : "#FFF" }}
                          />
                          {isDropdownOpen && filteredInsumos.length > 0 && (
                            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#FFF", border: "1px solid #E5E7EB", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: "200px", overflowY: "auto" as const, marginTop: "2px" }}>
                              {filteredInsumos.map((ins) => (
                                <button
                                  key={ins.id}
                                  onMouseDown={() => selectInsumo(ing._id, ins)}
                                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", border: "none", background: "none", cursor: "pointer", fontSize: "12px", textAlign: "left" as const, borderBottom: "1px solid #F9FAFB" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F9FAFB"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                                >
                                  <span style={{ fontWeight: "600", color: "#111827" }}>{ins.nombre}</span>
                                  <span style={{ fontSize: "10px", color: "#9CA3AF", flexShrink: 0, marginLeft: "8px" }}>
                                    {ins.costo_real.toFixed(4)}/{ins.unidad === "KG" ? "g" : ins.unidad === "LT" ? "ml" : ins.unidad}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Cantidad */}
                        <input
                          type="number"
                          value={ing.cantidad}
                          onChange={(e) => updateIngrediente(ing._id, { cantidad: e.target.value })}
                          placeholder="0"
                          min="0"
                          step="0.1"
                          style={{ padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "12px", outline: "none", width: "100%", boxSizing: "border-box" as const }}
                        />

                        {/* Unidad */}
                        <input
                          value={ing.unidad}
                          onChange={(e) => updateIngrediente(ing._id, { unidad: e.target.value })}
                          placeholder="g"
                          style={{ padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "12px", outline: "none", width: "100%", boxSizing: "border-box" as const }}
                        />

                        {/* Costo */}
                        <div style={{ textAlign: "right" as const }}>
                          <div style={{ fontSize: "10px", color: "#9CA3AF" }}>{ing.costo_unitario.toFixed(4)}</div>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: "#111827" }}>{fmt(total)}</div>
                        </div>

                        {/* Delete */}
                        <button onClick={() => removeIngrediente(ing._id)} style={{ padding: "4px", borderRadius: "4px", border: "none", background: "none", cursor: "pointer", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Trash2 style={{ width: "13px", height: "13px" }} />
                        </button>
                      </div>
                    );
                  })}
                  {mIngredientes.length === 0 && (
                    <div style={{ padding: "16px", textAlign: "center" as const, color: "#9CA3AF", fontSize: "12px", background: "#F9FAFB", borderRadius: "8px" }}>
                      Sin ingredientes — usa "+ Agregar ingrediente"
                    </div>
                  )}
                </div>
              </div>

              {/* ── Sección 3 — Resumen en tiempo real ── */}
              <div style={{ background: "#F9FAFB", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", marginBottom: "10px", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Resumen en tiempo real</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px" }}>
                  {[
                    { l: "Costo receta", v: fmt(mCostoReceta), c: "#374151" },
                    { l: `Con markup (${mMarkupNum}×)`, v: fmt(mCostoReceta * mMarkupNum), c: "#374151" },
                    { l: "Precio venta", v: fmt(mPrecioVenta), c: "#3D1C1E" },
                    { l: "Margen $", v: fmt(mMargenPesos), c: mMargenPesos >= 0 ? "#059669" : "#DC2626" },
                    { l: "Food cost", v: fmtPct(mFoodCost), c: mFoodCost > 32 ? "#DC2626" : "#059669" },
                  ].map((k) => (
                    <div key={k.l}>
                      <div style={{ fontSize: "10px", color: "#9CA3AF", marginBottom: "2px" }}>{k.l}</div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: k.c }}>{k.v}</div>
                    </div>
                  ))}
                </div>
                {mFoodCost > 32 && mPrecioVenta > 0 && (
                  <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#DC2626", fontWeight: "600" }}>
                    <AlertTriangle style={{ width: "13px", height: "13px" }} />
                    Food cost alto — considera ajustar el precio de venta
                  </div>
                )}
              </div>

              {/* Error */}
              {mError && (
                <div style={{ marginBottom: "12px", padding: "10px 14px", borderRadius: "8px", background: "#FEF2F2", border: "1px solid #FECACA", fontSize: "12px", color: "#DC2626", fontWeight: "600" }}>
                  {mError}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button onClick={closeModal} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                  Cancelar
                </button>
                <button onClick={handleSaveModal} disabled={mSaving}
                  style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: mSaving ? "#9CA3AF" : "#3D1C1E", color: "#C8FF00", cursor: mSaving ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  {mSaving ? <RefreshCw style={{ width: "13px", height: "13px", animation: "spin 1s linear infinite" }} /> : <Check style={{ width: "13px", height: "13px" }} />}
                  {mSaving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Style helpers ─────────────────────────────────────────────────────────────

import type { CSSProperties } from "react";

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: "700",
  color: "#6B7280",
  marginBottom: "5px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #E5E7EB",
  borderRadius: "8px",
  fontSize: "13px",
  outline: "none",
  boxSizing: "border-box",
  background: "#FFF",
  color: "#111827",
};
