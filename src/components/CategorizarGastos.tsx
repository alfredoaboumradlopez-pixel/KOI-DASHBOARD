/**
 * CategorizarGastos
 *
 * Muestra TODOS los gastos del restaurante (tabla gastos + gastos_diarios)
 * con paginación y tabs para filtrar por estado.
 *
 * Flujo de categorización:
 *   1. Dropdown muestra categorías operativas (tabla `categorias`)
 *   2. Al seleccionar → PUT /api/gastos/{id}/cambiar-categoria
 *   3. Backend guarda categoria (texto) + catalogo_cuenta_id (auto-mapeado)
 *   4. Fila se marca verde "✓ GUARDADO" en la sesión actual
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import {
  Tag, Check, AlertTriangle, Search, ChevronDown,
  RefreshCw, BarChart3, X, ChevronLeft, ChevronRight,
} from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

interface CategorizarGastosProps {
  restauranteIdOverride?: number;
}

type TabFiltro = "pendientes" | "en_revision" | "todos";

interface Toast { id: number; msg: string; tipo: "ok" | "error" }
let _toastId = 0;

const PAGE_SIZE = 50;

export const CategorizarGastos = ({ restauranteIdOverride }: CategorizarGastosProps = {}) => {
  const { authUser } = useStore();
  const restauranteId = restauranteIdOverride ?? authUser?.restaurante_id ?? 1;

  // ── Estado ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFiltro, setTabFiltro] = useState<TabFiltro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState<string>("");
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [page, setPage] = useState(1);

  // Totales globales (de ambas tablas, no solo la página actual)
  const [totalGlobal, setTotalGlobal] = useState(0);
  const [totalSinCatDB, setTotalSinCatDB] = useState(0);
  const [totalEnOtrosDB, setTotalEnOtrosDB] = useState(0);

  // ── Toast helpers ─────────────────────────────────────────────────────
  const addToast = useCallback((msg: string, tipo: "ok" | "error" = "ok") => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, msg, tipo }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
  }, []);

  // ── Contadores locales (para la página actual, actualizados tras saves) ─
  const localSinCat   = useMemo(() => items.filter(i => !i.catalogo_cuenta_id && !i._guardado).length, [items]);
  const localEnOtros  = useMemo(() => items.filter(i => i.es_otros && !i._guardado).length, [items]);

  // ── Carga de datos ────────────────────────────────────────────────────
  const cargar = async (p: number = 1) => {
    setLoading(true);
    try {
      const [sinCatData, catData] = await Promise.all([
        // incluir_todos=true → devuelve TODOS los gastos de ambas tablas
        api.get(
          `/api/gastos/sin-categorizar/${restauranteId}` +
          `?incluir_todos=true&incluir_otros=true&page=${p}&limit=${PAGE_SIZE}`
        ),
        api.get(`/api/categorias/${restauranteId}`),
      ]);

      setItems(sinCatData.items || []);
      setTotalGlobal(sinCatData.total ?? 0);
      setTotalSinCatDB(sinCatData.total_sin_catalogo ?? 0);
      setTotalEnOtrosDB(sinCatData.total_en_otros ?? 0);
      setPage(p);

      const cats: string[] = Array.isArray(catData)
        ? catData.map((c: any) => c.nombre).sort()
        : [];
      setCategorias(cats);
    } catch (err) {
      console.error("[CategorizarGastos] cargar error:", err);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(1); }, [restauranteId]);

  // ── Filtrado en memoria (sobre la página actual) ──────────────────────
  const itemsFiltrados = useMemo(() => {
    let lista = items;
    if (tabFiltro === "pendientes")
      lista = lista.filter(i => !i.catalogo_cuenta_id && !i._guardado);
    if (tabFiltro === "en_revision")
      lista = lista.filter(i => i.es_otros && !i._guardado);

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(i =>
        (i.proveedor      || "").toLowerCase().includes(q) ||
        (i.categoria_texto || "").toLowerCase().includes(q) ||
        (i.descripcion    || "").toLowerCase().includes(q) ||
        (i.cuenta_nombre  || "").toLowerCase().includes(q)
      );
    }
    return lista;
  }, [items, tabFiltro, busqueda]);

  // ── Guardar categoría ─────────────────────────────────────────────────
  const cambiarCategoria = async (item: any, nuevaCategoria: string) => {
    const key = `${item.tabla}-${item.id}`;
    setSaving(prev => new Set(prev).add(key));
    try {
      const endpoint = item.tabla === "gastos"
        ? `/api/gastos/${item.id}/cambiar-categoria`
        : `/api/gastos-diarios/${item.id}/cambiar-categoria`;

      console.log(`[CategorizarGastos] PUT ${endpoint}`, { categoria: nuevaCategoria });
      const res = await api.put(endpoint, { categoria: nuevaCategoria });
      console.log(`[CategorizarGastos] Respuesta:`, res);

      setItems(prev => prev.map(i =>
        i.id === item.id && i.tabla === item.tabla
          ? {
              ...i,
              categoria_texto:    res.categoria          ?? nuevaCategoria,
              catalogo_cuenta_id: res.catalogo_cuenta_id ?? i.catalogo_cuenta_id,
              es_otros:           false,
              _guardado:          true,
            }
          : i
      ));
      // Actualizar contadores globales
      if (!item.catalogo_cuenta_id) setTotalSinCatDB(n => Math.max(0, n - 1));
      if (item.es_otros)            setTotalEnOtrosDB(n => Math.max(0, n - 1));

      addToast(`✓ ${item.proveedor || "Gasto"} → ${res.categoria ?? nuevaCategoria}`);
    } catch (err: any) {
      console.error(`[CategorizarGastos] ERROR ${item.tabla} id=${item.id}:`, err);
      addToast(`✗ Error al guardar "${item.proveedor || item.id}"`, "error");
    }
    setSaving(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  // ── Bulk ──────────────────────────────────────────────────────────────
  const aplicarBulk = async () => {
    if (!bulkCat || checked.size === 0) return;
    setApplyingBulk(true);
    for (const key of Array.from(checked) as string[]) {
      const [tabla, ...idParts] = key.split("-");
      const id = parseInt(idParts.join("-"));
      const item = items.find(i => i.tabla === tabla && i.id === id);
      if (item) await cambiarCategoria(item, bulkCat);
    }
    setChecked(new Set());
    setBulkCat("");
    setApplyingBulk(false);
  };

  const toggleCheck = (key: string) =>
    setChecked(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ maxWidth: "1060px", margin: "0 auto" }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ background: "#FFF", borderRadius: "10px", padding: "16px", marginBottom: "8px", height: "64px", opacity: 0.5 - i * 0.04 }} />
      ))}
    </div>
  );

  const totalPages = PAGE_SIZE > 0 ? Math.ceil(totalGlobal / PAGE_SIZE) : 1;
  const pageFrom = (page - 1) * PAGE_SIZE + 1;
  const pageTo   = Math.min(page * PAGE_SIZE, totalGlobal);

  return (
    <div style={{ maxWidth: "1060px", margin: "0 auto", position: "relative" as const }}>

      {/* ── Toast stack ─────────────────────────────────────────────────── */}
      <div style={{ position: "fixed" as const, bottom: "24px", right: "24px", display: "flex", flexDirection: "column" as const, gap: "8px", zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: "600",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            background: t.tipo === "ok" ? "#ECFDF5" : "#FEF2F2",
            color:      t.tipo === "ok" ? "#059669"  : "#DC2626",
            border:     `1px solid ${t.tipo === "ok" ? "#6EE7B7" : "#FCA5A5"}`,
            animation: "slideIn 0.2s ease",
          }}>
            {t.tipo === "ok"
              ? <Check style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              : <X     style={{ width: "14px", height: "14px", flexShrink: 0 }} />}
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Tag style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
        </div>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#111827", margin: 0 }}>
            Categorizar gastos
          </h1>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>
            {totalGlobal} gastos en total · {totalSinCatDB} sin categoría · {totalEnOtrosDB} en revisión
          </p>
        </div>
        <button onClick={() => cargar(page)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "12px", cursor: "pointer" }}>
          <RefreshCw style={{ width: "13px", height: "13px" }} /> Recargar
        </button>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Sin categoría",   val: totalSinCatDB,  color: "#DC2626", bg: "#FEF2F2", Icon: AlertTriangle },
          { label: "En revisión",     val: totalEnOtrosDB, color: "#D97706", bg: "#FFFBEB", Icon: Tag },
          { label: "Total gastos",    val: totalGlobal,    color: "#374151", bg: "#F9FAFB", Icon: BarChart3 },
        ].map(({ label, val, color, bg, Icon }, i) => (
          <div key={i} style={{ background: bg, borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
            <Icon style={{ width: "18px", height: "18px", color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "10px", color, fontWeight: "700", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{label}</div>
              <div style={{ fontSize: "22px", fontWeight: "900", color }}>{val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs + Búsqueda ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", background: "#FFF", borderRadius: "10px", padding: "3px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {([
            { key: "pendientes",  label: `Sin categoría (${totalSinCatDB})` },
            { key: "en_revision", label: `En revisión (${totalEnOtrosDB})` },
            { key: "todos",       label: `Todos (${totalGlobal})` },
          ] as { key: TabFiltro; label: string }[]).map(t => (
            <button key={t.key}
              onClick={() => { setTabFiltro(t.key); setChecked(new Set()); }}
              style={{ padding: "6px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600", background: tabFiltro === t.key ? "#3D1C1E" : "transparent", color: tabFiltro === t.key ? "#C8FF00" : "#9CA3AF" }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: "180px", display: "flex", alignItems: "center", gap: "8px", background: "#FFF", borderRadius: "10px", padding: "8px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <Search style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
          <input type="text" placeholder="Buscar proveedor, categoría, descripción…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: "13px", color: "#374151", flex: 1, background: "transparent" }} />
          {busqueda && (
            <button onClick={() => setBusqueda("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#9CA3AF", padding: 0 }}>
              <X style={{ width: "13px", height: "13px" }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Acciones bulk ───────────────────────────────────────────────── */}
      {itemsFiltrados.length > 0 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" as const, alignItems: "center" }}>
          <button onClick={() => setChecked(new Set(itemsFiltrados.map(i => `${i.tabla}-${i.id}`)))}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer", color: "#374151" }}>
            Seleccionar página ({itemsFiltrados.length})
          </button>
          {checked.size > 0 && (
            <>
              <button onClick={() => setChecked(new Set())}
                style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer", color: "#9CA3AF" }}>
                Deseleccionar ({checked.size})
              </button>
              <div style={{ display: "flex", gap: "4px", alignItems: "center", background: "#FFF", borderRadius: "10px", padding: "4px 8px 4px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <ChevronDown style={{ width: "13px", height: "13px", color: "#9CA3AF", flexShrink: 0 }} />
                <select value={bulkCat} onChange={e => setBulkCat(e.target.value)}
                  style={{ border: "none", outline: "none", fontSize: "12px", color: "#374151", background: "transparent", cursor: "pointer" }}>
                  <option value="">Categorizar como…</option>
                  {categorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <button onClick={aplicarBulk} disabled={!bulkCat || applyingBulk}
                style={{ padding: "6px 14px", borderRadius: "8px", border: "none", background: bulkCat ? "#3D1C1E" : "#D1D5DB", color: bulkCat ? "#C8FF00" : "#9CA3AF", fontSize: "12px", fontWeight: "700", cursor: bulkCat ? "pointer" : "not-allowed" }}>
                {applyingBulk ? "Aplicando…" : `Aplicar a ${checked.size}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {itemsFiltrados.length === 0 ? (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "48px", textAlign: "center" as const, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <Check style={{ width: "32px", height: "32px", color: "#059669", margin: "0 auto 8px" }} />
          <p style={{ fontSize: "14px", color: "#6B7280" }}>
            {busqueda
              ? `Sin resultados para "${busqueda}"`
              : tabFiltro === "pendientes"
              ? "¡Todos los gastos tienen categoría! ✓"
              : tabFiltro === "en_revision"
              ? "No hay gastos pendientes de revisión ✓"
              : "Sin gastos en esta página"}
          </p>
        </div>
      ) : (
        <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {/* Cabecera */}
          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 200px 120px 110px", alignItems: "center", padding: "10px 20px", background: "#F9FAFB", borderBottom: "2px solid #F3F4F6" }}>
            <div />
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Gasto</span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Categoría operativa</span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Cuenta contable</span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, textAlign: "right" as const }}>Monto</span>
          </div>

          {itemsFiltrados.map((item: any) => {
            const key = `${item.tabla}-${item.id}`;
            const isChecked = checked.has(key);
            const isSaving  = saving.has(key);

            return (
              <div key={key} style={{
                display: "grid", gridTemplateColumns: "40px 1fr 200px 120px 110px",
                alignItems: "start",
                padding: "11px 20px", borderBottom: "1px solid #F9FAFB",
                background: item._guardado ? "#F0FDF4" : isChecked ? "#FAFFFE" : item.es_otros ? "#FFFDF0" : "transparent",
                transition: "background 0.15s",
              }}>

                {/* Checkbox */}
                <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(key)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#3D1C1E", marginTop: "3px" }} />

                {/* Info del gasto */}
                <div style={{ paddingRight: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: item._guardado ? "#059669" : "#111827" }}>
                      {item.proveedor || "—"}
                    </span>
                    {item._guardado && (
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#D1FAE5", color: "#065F46", fontWeight: "700" }}>✓ GUARDADO</span>
                    )}
                    {!item._guardado && item.es_otros && (
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#FDE68A", color: "#B45309", fontWeight: "700" }}>REVISAR</span>
                    )}
                    {!item._guardado && !item.catalogo_cuenta_id && (
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#FEE2E2", color: "#B91C1C", fontWeight: "700" }}>SIN CATEGORÍA</span>
                    )}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                    {item.fecha}
                    {item.tabla === "gastos_diarios" && (
                      <span style={{ marginLeft: "4px", fontSize: "10px", color: "#C4B5FD" }}>· cierre</span>
                    )}
                  </div>
                  {(item.descripcion || item.categoria_texto) && (
                    <div style={{ fontSize: "12px", color: "#6B7280", fontStyle: "italic", marginTop: "3px", lineHeight: "1.4" }}>
                      {item.descripcion || item.categoria_texto}
                    </div>
                  )}
                </div>

                {/* Dropdown categoría OPERATIVA */}
                <div style={{ position: "relative" as const }}>
                  <select
                    value={item.categoria_texto || ""}
                    onChange={async e => {
                      const val = e.target.value;
                      if (!val) return;
                      await cambiarCategoria(item, val);
                    }}
                    disabled={isSaving}
                    style={{ width: "100%", padding: "5px 8px", borderRadius: "6px", border: `1px solid ${item.es_otros ? "#FDE68A" : item._guardado ? "#6EE7B7" : "#E5E7EB"}`, fontSize: "12px", background: isSaving ? "#F9FAFB" : "#FFF", color: item.categoria_texto ? "#111827" : "#9CA3AF", cursor: isSaving ? "wait" : "pointer" }}
                  >
                    <option value="">{item.categoria_texto || "Seleccionar…"}</option>
                    {categorias.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {isSaving && (
                    <div style={{ position: "absolute" as const, right: "8px", top: "50%", transform: "translateY(-50%)" }}>
                      <RefreshCw style={{ width: "12px", height: "12px", color: "#9CA3AF", animation: "spin 1s linear infinite" }} />
                    </div>
                  )}
                </div>

                {/* Cuenta contable asignada */}
                <div style={{ fontSize: "11px", color: "#6B7280", paddingLeft: "8px", marginTop: "4px" }}>
                  {item.cuenta_nombre || (item.catalogo_cuenta_id ? `ID ${item.catalogo_cuenta_id}` : "—")}
                </div>

                {/* Monto */}
                <div style={{ textAlign: "right" as const, fontSize: "14px", fontWeight: "700", color: "#111827", marginTop: "3px" }}>
                  {fmt(item.monto)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Paginación ──────────────────────────────────────────────────── */}
      {totalPages > 1 && !busqueda && tabFiltro === "todos" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", padding: "12px 16px", background: "#FFF", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: "13px", color: "#6B7280" }}>
            Mostrando <strong>{pageFrom}–{pageTo}</strong> de <strong>{totalGlobal}</strong> gastos
          </span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={() => cargar(page - 1)} disabled={page === 1}
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: page === 1 ? "#F9FAFB" : "#FFF", color: page === 1 ? "#D1D5DB" : "#374151", fontSize: "12px", fontWeight: "600", cursor: page === 1 ? "not-allowed" : "pointer" }}>
              <ChevronLeft style={{ width: "14px", height: "14px" }} /> Anterior
            </button>
            {/* Números de página (hasta 7) */}
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1
                : page <= 4 ? i + 1
                : page >= totalPages - 3 ? totalPages - 6 + i
                : page - 3 + i;
              return (
                <button key={p} onClick={() => cargar(p)}
                  style={{ width: "32px", height: "32px", borderRadius: "8px", border: "none", background: p === page ? "#3D1C1E" : "transparent", color: p === page ? "#C8FF00" : "#6B7280", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => cargar(page + 1)} disabled={page === totalPages}
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: page === totalPages ? "#F9FAFB" : "#FFF", color: page === totalPages ? "#D1D5DB" : "#374151", fontSize: "12px", fontWeight: "600", cursor: page === totalPages ? "not-allowed" : "pointer" }}>
              Siguiente <ChevronRight style={{ width: "14px", height: "14px" }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Todo categorizado ────────────────────────────────────────────── */}
      {totalSinCatDB === 0 && totalEnOtrosDB === 0 && (
        <div style={{ marginTop: "16px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "12px", padding: "14px 18px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#15803D" }}>✓ Todos los gastos están categorizados correctamente</div>
          <div style={{ fontSize: "12px", color: "#16A34A", marginTop: "4px" }}>
            El P&amp;L refleja los datos actuales.
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin    { 0%   { transform: rotate(0deg)   } 100% { transform: rotate(360deg) } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
};
