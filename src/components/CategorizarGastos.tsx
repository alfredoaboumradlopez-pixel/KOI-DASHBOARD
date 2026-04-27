/**
 * CategorizarGastos
 *
 * El equipo operativo de KOI ve categorías operativas (ABARROTES, BEBIDAS…),
 * NO códigos contables. El mapeo operativa→cuenta contable ocurre automáticamente
 * en el backend cada vez que se guarda una categoría.
 *
 * Flujo:
 *   1. Dropdown muestra categorías de la tabla `categorias` del restaurante
 *   2. Al seleccionar → PUT /api/gastos/{id}/cambiar-categoria con { categoria: "ABARROTES" }
 *   3. Backend actualiza categoria (texto) + catalogo_cuenta_id (auto-mapeado)
 *   4. PLService usa ambos campos; la cuenta contable es invisible al equipo
 */
import { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import { Tag, Check, AlertTriangle, Search, ChevronDown, RefreshCw, BarChart3 } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

interface CategorizarGastosProps {
  restauranteIdOverride?: number;
}

type TabFiltro = "pendientes" | "en_revision" | "todos";

export const CategorizarGastos = ({ restauranteIdOverride }: CategorizarGastosProps = {}) => {
  const { authUser } = useStore();
  const restauranteId = restauranteIdOverride ?? authUser?.restaurante_id ?? 1;

  // ── Estado ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);  // categorías operativas
  const [loading, setLoading] = useState(true);
  const [tabFiltro, setTabFiltro] = useState<TabFiltro>("pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [savedCount, setSavedCount] = useState(0);
  const [bulkCat, setBulkCat] = useState<string>("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  // ── Contadores derivados — misma lógica que los filtros de tab ────────
  // Al derivar de `items` con useMemo, se actualizan automáticamente cada
  // vez que se guarda un gasto (setItems), sin necesidad de recargar.
  const totalSinCat    = useMemo(() => items.filter(i => !i.catalogo_cuenta_id).length, [items]);
  const totalEnOtros   = useMemo(() => items.filter(i => i.es_otros).length, [items]);
  const montoTotal     = useMemo(
    () => items.filter(i => !i.catalogo_cuenta_id || i.es_otros).reduce((s, i) => s + (i.monto || 0), 0),
    [items]
  );

  // ── Carga de datos ────────────────────────────────────────────────────
  const cargar = async () => {
    setLoading(true);
    try {
      const [sinCatData, catData] = await Promise.all([
        // incluir_otros=true → también muestra gastos en cuenta "Otros gastos" para revisión
        api.get(`/api/gastos/sin-categorizar/${restauranteId}?incluir_otros=true`),
        // Categorías OPERATIVAS del restaurante (no contables)
        api.get(`/api/categorias/${restauranteId}`),
      ]);

      setItems(sinCatData.items || []);
      // totalSinCat / totalEnOtros / montoTotal se derivan de items via useMemo

      // Extraer nombres de categorías operativas
      const cats: string[] = Array.isArray(catData)
        ? catData.map((c: any) => c.nombre).sort()
        : [];
      setCategorias(cats);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [restauranteId]);

  // ── Filtrado en memoria ───────────────────────────────────────────────
  const itemsFiltrados = useMemo(() => {
    let lista = items;
    // "Sin categoría" = catalogo_cuenta_id IS NULL (mismo criterio que el contador)
    if (tabFiltro === "pendientes") lista = lista.filter(i => !i.catalogo_cuenta_id);
    if (tabFiltro === "en_revision") lista = lista.filter(i => i.es_otros);

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(i =>
        (i.proveedor || "").toLowerCase().includes(q) ||
        (i.categoria_texto || "").toLowerCase().includes(q) ||
        (i.descripcion || "").toLowerCase().includes(q)
      );
    }
    return lista;
  }, [items, tabFiltro, busqueda]);

  // ── Auto-save inmediato al cambiar categoría de una fila ─────────────
  const cambiarCategoria = async (item: any, nuevaCategoria: string) => {
    const key = `${item.tabla}-${item.id}`;
    setSaving(prev => new Set(prev).add(key));
    try {
      const endpoint = item.tabla === "gastos"
        ? `/api/gastos/${item.id}/cambiar-categoria`
        : `/api/gastos-diarios/${item.id}/cambiar-categoria`;
      await api.put(endpoint, { categoria: nuevaCategoria });
      setSavedCount(s => s + 1);
      // Actualizar item en memoria — ya no es "sin categorizar" ni "en revisión"
      setItems(prev => prev.map(i =>
        i.id === item.id && i.tabla === item.tabla
          ? { ...i, categoria_texto: nuevaCategoria, catalogo_cuenta_id: -1, es_otros: false }
          : i
      ));
    } catch { }
    setSaving(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  // ── Bulk — aplicar misma categoría a todos los seleccionados ─────────
  const aplicarBulk = async () => {
    if (!bulkCat || checked.size === 0) return;
    setApplyingBulk(true);
    const todo = Array.from(checked) as string[];
    for (const key of todo) {
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

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ background: "#FFF", borderRadius: "10px", padding: "16px", marginBottom: "8px", height: "60px", opacity: 0.6 }} />
      ))}
    </div>
  );

  // totalEnRevision = totalEnOtros (derived via useMemo above)
  const totalEnRevision = totalEnOtros;

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Tag style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
        </div>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#111827", margin: 0 }}>Categorizar gastos</h1>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>
            {fmt(montoTotal)} total · {totalSinCat} sin categoría · {totalEnOtros} en "Otros"
          </p>
        </div>
        <button onClick={cargar} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "12px", cursor: "pointer" }}>
          <RefreshCw style={{ width: "13px", height: "13px" }} /> Recargar
        </button>
        {savedCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", fontSize: "13px", fontWeight: "600" }}>
            <Check style={{ width: "14px", height: "14px" }} /> {savedCount} guardados
          </div>
        )}
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Sin categoría",     val: totalSinCat,           color: "#DC2626", bg: "#FEF2F2", Icon: AlertTriangle },
          { label: "En revisión",       val: totalEnRevision,       color: "#D97706", bg: "#FFFBEB", Icon: Tag },
          { label: "Monto pendiente",   val: fmt(montoTotal),       color: "#374151", bg: "#F9FAFB", Icon: BarChart3 },
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

      {/* ── Tabs + Búsqueda ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", background: "#FFF", borderRadius: "10px", padding: "3px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {([
            { key: "pendientes",  label: `Sin categoría (${totalSinCat})` },
            { key: "en_revision", label: `En revisión (${totalEnRevision})` },
            { key: "todos",       label: `Todos (${items.length})` },
          ] as { key: TabFiltro; label: string }[]).map(t => (
            <button key={t.key} onClick={() => { setTabFiltro(t.key); setChecked(new Set()); }}
              style={{ padding: "6px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600", background: tabFiltro === t.key ? "#3D1C1E" : "transparent", color: tabFiltro === t.key ? "#C8FF00" : "#9CA3AF" }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: "160px", display: "flex", alignItems: "center", gap: "8px", background: "#FFF", borderRadius: "10px", padding: "8px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <Search style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
          <input type="text" placeholder="Buscar proveedor…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: "13px", color: "#374151", flex: 1, background: "transparent" }} />
        </div>
      </div>

      {/* ── Acciones bulk ──────────────────────────────────────────────── */}
      {itemsFiltrados.length > 0 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" as const, alignItems: "center" }}>
          <button onClick={() => setChecked(new Set(itemsFiltrados.map(i => `${i.tabla}-${i.id}`)))}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer", color: "#374151" }}>
            Seleccionar todos ({itemsFiltrados.length})
          </button>

          {tabFiltro === "en_revision" && (
            <button onClick={() => setChecked(new Set(itemsFiltrados.filter(i => i.es_otros).map(i => `${i.tabla}-${i.id}`)))}
              style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #FDE68A", background: "#FFFBEB", fontSize: "12px", cursor: "pointer", color: "#D97706", fontWeight: "600" }}>
              ☑ Todos los de "Otros"
            </button>
          )}

          {checked.size > 0 && (
            <>
              <button onClick={() => setChecked(new Set())}
                style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer", color: "#9CA3AF" }}>
                Deseleccionar ({checked.size})
              </button>

              {/* Dropdown de categoría operativa + aplicar */}
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

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      {itemsFiltrados.length === 0 ? (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "48px", textAlign: "center" as const, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <Check style={{ width: "32px", height: "32px", color: "#059669", margin: "0 auto 8px" }} />
          <p style={{ fontSize: "14px", color: "#6B7280" }}>
            {tabFiltro === "pendientes"
              ? "¡Todos los gastos tienen categoría! ✓"
              : tabFiltro === "en_revision"
              ? "No hay gastos pendientes de revisión ✓"
              : "Sin resultados para esta búsqueda"}
          </p>
        </div>
      ) : (
        <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {/* Cabecera */}
          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 220px 110px", alignItems: "center", padding: "10px 20px", background: "#F9FAFB", borderBottom: "2px solid #F3F4F6" }}>
            <div />
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Gasto</span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Categoría operativa</span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, textAlign: "right" as const }}>Monto</span>
          </div>

          {itemsFiltrados.map((item: any) => {
            const key = `${item.tabla}-${item.id}`;
            const isChecked = checked.has(key);
            const isSaving = saving.has(key);

            return (
              <div key={key}
                style={{ display: "grid", gridTemplateColumns: "40px 1fr 220px 110px", alignItems: "center", padding: "11px 20px", borderBottom: "1px solid #F9FAFB", background: isChecked ? "#FAFFFE" : item.es_otros ? "#FFFDF0" : "transparent", transition: "background 0.1s" }}>

                {/* Checkbox */}
                <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(key)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#3D1C1E" }} />

                {/* Info del gasto */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{item.proveedor || "—"}</span>
                    {item.es_otros && (
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#FDE68A", color: "#B45309", fontWeight: "700" }}>REVISAR</span>
                    )}
                    {!item.catalogo_cuenta_id && (
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#FEE2E2", color: "#B91C1C", fontWeight: "700" }}>SIN CATEGORÍA</span>
                    )}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                    {item.fecha}
                    {item.tabla === "gastos_diarios" && (
                      <span style={{ marginLeft: "4px", fontSize: "10px", color: "#C4B5FD" }}>· cierre</span>
                    )}
                  </div>
                  {/* Descripción — campo clave para categorizar correctamente */}
                  {(item.descripcion || item.categoria_texto) && (
                    <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px", fontStyle: "italic", maxWidth: "340px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {item.descripcion || item.categoria_texto}
                    </div>
                  )}
                </div>

                {/* Dropdown de categoría OPERATIVA — auto-save al cambiar */}
                <div style={{ position: "relative" as const }}>
                  <select
                    value={item.categoria_texto || ""}
                    onChange={async e => {
                      const val = e.target.value;
                      if (!val) return;
                      await cambiarCategoria(item, val);
                    }}
                    disabled={isSaving}
                    style={{ width: "100%", padding: "5px 8px", borderRadius: "6px", border: `1px solid ${item.es_otros ? "#FDE68A" : "#E5E7EB"}`, fontSize: "12px", background: isSaving ? "#F9FAFB" : "#FFF", color: item.categoria_texto ? "#111827" : "#9CA3AF", cursor: isSaving ? "wait" : "pointer" }}
                  >
                    <option value="">{item.categoria_texto || "Seleccionar categoría…"}</option>
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

                {/* Monto */}
                <div style={{ textAlign: "right" as const, fontSize: "14px", fontWeight: "700", color: "#111827" }}>
                  {fmt(item.monto)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nota: categorías legítimamente en "Otros" ─────────────────── */}
      {totalEnRevision > 0 && tabFiltro !== "en_revision" && (
        <div style={{ marginTop: "16px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
          <AlertTriangle style={{ width: "16px", height: "16px", color: "#D97706", flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: "13px", color: "#92400E" }}>
            {totalEnRevision} gastos en "Otros gastos" — podrían necesitar una categoría más específica
          </div>
          <button onClick={() => setTabFiltro("en_revision")}
            style={{ padding: "5px 12px", borderRadius: "7px", border: "1px solid #F59E0B", background: "#FFF", color: "#D97706", fontSize: "12px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>
            Revisar →
          </button>
        </div>
      )}

      {/* ── Todo ok ───────────────────────────────────────────────────── */}
      {totalSinCat === 0 && totalEnRevision === 0 && (
        <div style={{ marginTop: "16px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "12px", padding: "14px 18px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#15803D" }}>✓ Todos los gastos están categorizados correctamente</div>
          <div style={{ fontSize: "12px", color: "#16A34A", marginTop: "4px" }}>
            El P&amp;L refleja los datos actuales. Si el margen parece alto, verifica que todos los gastos estén registrados (nómina, renta, servicios).
          </div>
        </div>
      )}

      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </div>
  );
};
