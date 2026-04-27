import { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import { Tag, Check, AlertTriangle, Search, ChevronDown, RefreshCw, BarChart3 } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

interface CategorizarGastosProps {
  restauranteIdOverride?: number;
}

type TabFiltro = "pendientes" | "en_otros" | "todos";

// Color por confianza de sugerencia
const CONFIANZA_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  alta:  { bg: "#ECFDF5", text: "#059669", label: "alta" },
  media: { bg: "#FFFBEB", text: "#D97706", label: "media" },
  baja:  { bg: "#F3F4F6", text: "#9CA3AF", label: "baja" },
};

export const CategorizarGastos = ({ restauranteIdOverride }: CategorizarGastosProps = {}) => {
  const { authUser } = useStore();
  const restauranteId = restauranteIdOverride ?? authUser?.restaurante_id ?? 1;

  // ── Estado principal ───────────────────────────────────────────────────
  const [items, setItems] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFiltro, setTabFiltro] = useState<TabFiltro>("pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selecciones, setSelecciones] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(0);
  const [bulkCuenta, setBulkCuenta] = useState<string>("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Metadata
  const [totalSinCat, setTotalSinCat] = useState(0);
  const [totalEnOtros, setTotalEnOtros] = useState(0);
  const [montoTotal, setMontoTotal] = useState(0);

  const cargar = async () => {
    setLoading(true);
    try {
      const [data, catData] = await Promise.all([
        api.get(`/api/gastos/sin-categorizar/${restauranteId}?incluir_otros=true`),
        api.get(`/api/catalogo-cuentas/${restauranteId}`).catch(() => ({ items: [] })),
      ]);
      setItems(data.items || []);
      setTotalSinCat(data.total_sin_catalogo || 0);
      setTotalEnOtros(data.total_en_otros || 0);
      setMontoTotal(data.monto_total || 0);

      // Pre-seleccionar sugerencias de alta confianza para pendientes
      const presel: Record<string, number> = {};
      const preChecked = new Set<string>();
      (data.items || []).forEach((item: any) => {
        const key = `${item.tabla}-${item.id}`;
        if (!item.es_otros && item.sugerencia?.confianza === "alta") {
          presel[key] = item.sugerencia.catalogo_cuenta_id;
          preChecked.add(key);
        }
      });
      setSelecciones(presel);
      setChecked(preChecked);
      setCuentas(catData.items || catData || []);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [restauranteId]);

  // ── Filtrado en memoria ────────────────────────────────────────────────
  const itemsFiltrados = useMemo(() => {
    let lista = items;
    if (tabFiltro === "pendientes") lista = lista.filter(i => !i.es_otros && !i.catalogo_cuenta_id);
    if (tabFiltro === "en_otros")   lista = lista.filter(i => i.es_otros);
    // "todos" = todo

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(i =>
        (i.proveedor || "").toLowerCase().includes(q) ||
        (i.categoria_texto || "").toLowerCase().includes(q) ||
        (i.cuenta_nombre || "").toLowerCase().includes(q)
      );
    }
    return lista;
  }, [items, tabFiltro, busqueda]);

  // ── Auto-save inmediato por fila ───────────────────────────────────────
  const autoSave = async (item: any, cuentaId: number) => {
    const key = `${item.tabla}-${item.id}`;
    setSaving(prev => new Set(prev).add(key));
    try {
      const endpoint = item.tabla === "gastos"
        ? `/api/gastos/${item.id}/categorizar`
        : `/api/gastos-diarios/${item.id}/categorizar`;
      await api.put(endpoint, { catalogo_cuenta_id: cuentaId });
      setSaved(s => s + 1);
      // Actualizar el item en memoria
      setItems(prev => prev.map(i =>
        i.id === item.id && i.tabla === item.tabla
          ? { ...i, catalogo_cuenta_id: cuentaId, cuenta_nombre: cuentas.find(c => c.id === cuentaId)?.nombre || "", es_otros: cuentas.find(c => c.id === cuentaId)?.codigo === "6008" }
          : i
      ));
    } catch { }
    setSaving(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  // ── Batch save (para selección múltiple sin auto-save) ─────────────────
  const guardarSeleccionados = async () => {
    const batch = Array.from(checked)
      .filter((key): key is string => typeof key === "string" && !!selecciones[key])
      .map((key: string) => {
        const [tabla, ...idParts] = key.split("-");
        return { id: parseInt(idParts.join("-")), tabla, catalogo_cuenta_id: selecciones[key] };
      });
    if (batch.length === 0) return;
    setSaving(new Set(batch.map(b => `${b.tabla}-${b.id}`)));
    try {
      const res = await api.post("/api/gastos/categorizar-batch", batch);
      setSaved(res.categorizados || 0);
      await cargar();
    } catch { }
    setSaving(new Set());
  };

  // ── Aplicar categoría a todos los seleccionados ────────────────────────
  const aplicarBulk = async () => {
    if (!bulkCuenta || checked.size === 0) return;
    const cuentaId = parseInt(bulkCuenta);
    const batch = Array.from(checked).map((key: unknown) => {
      const [tabla, ...idParts] = (key as string).split("-");
      return { id: parseInt(idParts.join("-")), tabla, catalogo_cuenta_id: cuentaId };
    });
    setApplyingBulk(true);
    try {
      await api.post("/api/gastos/categorizar-batch", batch);
      setSaved(batch.length);
      await cargar();
      setChecked(new Set());
      setBulkCuenta("");
    } catch { }
    setApplyingBulk(false);
  };

  const toggleCheck = (key: string) => {
    setChecked(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const selectTodosEnOtros = () => {
    const keys = itemsFiltrados.filter(i => i.es_otros).map(i => `${i.tabla}-${i.id}`);
    setChecked(new Set(keys));
  };

  // ── Cálculo de impacto P&L estimado ───────────────────────────────────
  const impactoBadge = useMemo(() => {
    if (totalEnOtros === 0) return null;
    // Cuánto hay actualmente en "otros" que podría ser food cost
    const enOtros = items.filter(i => i.es_otros);
    const totalOtros = enOtros.reduce((s, i) => s + (i.monto || 0), 0);
    return { totalOtros, count: enOtros.length };
  }, [items, totalEnOtros]);

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ background: "#FFF", borderRadius: "10px", padding: "16px", marginBottom: "8px", height: "60px", animation: "pulse 1.5s ease-in-out infinite", opacity: 0.7 }} />
      ))}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────
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
        {saved > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", fontSize: "13px", fontWeight: "600" }}>
            <Check style={{ width: "14px", height: "14px" }} /> {saved} guardados
          </div>
        )}
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Sin categoría",  value: totalSinCat,   color: "#DC2626", bg: "#FEF2F2", icon: AlertTriangle },
          { label: "En 'Otros'",     value: totalEnOtros,  color: "#D97706", bg: "#FFFBEB", icon: Tag },
          { label: "Monto total",    value: fmt(montoTotal), color: "#374151", bg: "#F9FAFB", icon: BarChart3, isText: true },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} style={{ background: card.bg, borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
              <Icon style={{ width: "18px", height: "18px", color: card.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "10px", color: card.color, fontWeight: "700", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{card.label}</div>
                <div style={{ fontSize: "22px", fontWeight: "900", color: card.color }}>{(card as any).isText ? card.value : card.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Tabs + Búsqueda ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" as const }}>
        {/* Tabs */}
        <div style={{ display: "flex", background: "#FFF", borderRadius: "10px", padding: "3px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {([
            { key: "pendientes", label: `Sin cat. (${totalSinCat})` },
            { key: "en_otros",   label: `En Otros (${totalEnOtros})` },
            { key: "todos",      label: `Todos (${items.length})` },
          ] as { key: TabFiltro; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => { setTabFiltro(t.key); setChecked(new Set()); }}
              style={{ padding: "6px 12px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600", background: tabFiltro === t.key ? "#3D1C1E" : "transparent", color: tabFiltro === t.key ? "#C8FF00" : "#9CA3AF" }}
            >{t.label}</button>
          ))}
        </div>

        {/* Búsqueda */}
        <div style={{ flex: 1, minWidth: "160px", display: "flex", alignItems: "center", gap: "8px", background: "#FFF", borderRadius: "10px", padding: "8px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <Search style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Buscar proveedor, categoría..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: "13px", color: "#374151", flex: 1, background: "transparent" }}
          />
        </div>
      </div>

      {/* ── Acciones bulk ──────────────────────────────────────────────── */}
      {itemsFiltrados.length > 0 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" as const, alignItems: "center" }}>
          <button
            onClick={() => setChecked(new Set(itemsFiltrados.map(i => `${i.tabla}-${i.id}`)))}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer", color: "#374151" }}
          >
            Seleccionar todos ({itemsFiltrados.length})
          </button>
          {tabFiltro === "en_otros" && (
            <button
              onClick={selectTodosEnOtros}
              style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #FDE68A", background: "#FFFBEB", fontSize: "12px", cursor: "pointer", color: "#D97706", fontWeight: "600" }}
            >
              ☑ Todos los de 'Otros'
            </button>
          )}
          {checked.size > 0 && (
            <>
              <button
                onClick={() => setChecked(new Set())}
                style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer", color: "#9CA3AF" }}
              >
                Deseleccionar ({checked.size})
              </button>

              {/* Dropdown + aplicar */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#FFF", borderRadius: "10px", padding: "4px 8px 4px 4px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <ChevronDown style={{ width: "14px", height: "14px", color: "#9CA3AF", flexShrink: 0 }} />
                <select
                  value={bulkCuenta}
                  onChange={e => setBulkCuenta(e.target.value)}
                  style={{ border: "none", outline: "none", fontSize: "12px", color: "#374151", background: "transparent", cursor: "pointer" }}
                >
                  <option value="">Categorizar como...</option>
                  {cuentas.filter(c => !c.codigo?.startsWith("4") && !c.codigo?.startsWith("7")).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={aplicarBulk}
                disabled={!bulkCuenta || applyingBulk}
                style={{ padding: "6px 14px", borderRadius: "8px", border: "none", background: bulkCuenta ? "#3D1C1E" : "#D1D5DB", color: bulkCuenta ? "#C8FF00" : "#9CA3AF", fontSize: "12px", fontWeight: "700", cursor: bulkCuenta ? "pointer" : "not-allowed" }}
              >
                {applyingBulk ? "Aplicando…" : `Aplicar a ${checked.size}`}
              </button>

              {/* Guardar seleccionados con dropdowns individuales */}
              {Object.keys(selecciones).some(k => checked.has(k)) && (
                <button
                  onClick={guardarSeleccionados}
                  style={{ padding: "6px 14px", borderRadius: "8px", border: "none", background: "#059669", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                >
                  Guardar con selección individual
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Lista de gastos ────────────────────────────────────────────── */}
      {itemsFiltrados.length === 0 ? (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "48px", textAlign: "center" as const, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <Check style={{ width: "32px", height: "32px", color: "#059669", margin: "0 auto 8px" }} />
          <p style={{ fontSize: "14px", color: "#6B7280" }}>
            {tabFiltro === "pendientes"
              ? "¡Todos los gastos tienen categoría contable! ✓"
              : tabFiltro === "en_otros"
              ? "No hay gastos en 'Otros gastos'"
              : "Sin gastos que coincidan con la búsqueda"}
          </p>
        </div>
      ) : (
        <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {/* Header de tabla */}
          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 110px", alignItems: "center", padding: "10px 20px", borderBottom: "2px solid #F3F4F6", background: "#F9FAFB" }}>
            <div />
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Gasto</span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const }}>Cuenta contable</span>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" as const, textAlign: "right" as const }}>Monto</span>
          </div>

          {itemsFiltrados.map((item: any) => {
            const key = `${item.tabla}-${item.id}`;
            const isChecked = checked.has(key);
            const isSaving = saving.has(key);
            const conf = item.sugerencia?.confianza;
            const confStyle = conf ? CONFIANZA_COLOR[conf] : null;

            return (
              <div
                key={key}
                style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 110px", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #F9FAFB", background: isChecked ? "#FAFFFE" : item.es_otros ? "#FFFCF0" : "transparent", transition: "background 0.1s" }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCheck(key)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#3D1C1E" }}
                />

                {/* Info del gasto */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{item.proveedor || "Sin proveedor"}</span>
                    {item.es_otros && (
                      <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "#FDE68A", color: "#B45309", fontWeight: "700" }}>EN REVISIÓN</span>
                    )}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>
                    {item.fecha}
                    {item.categoria_texto && (
                      <span style={{ marginLeft: "6px", padding: "1px 5px", borderRadius: "4px", background: "#F3F4F6", color: "#6B7280" }}>{item.categoria_texto}</span>
                    )}
                  </div>
                </div>

                {/* Selector de cuenta */}
                <div>
                  {/* Sugerencia */}
                  {item.sugerencia && confStyle && (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: confStyle.bg, color: confStyle.text, fontWeight: "700" }}>
                        {confStyle.label}
                      </span>
                      <span style={{ fontSize: "11px", color: "#374151" }}>→ {item.sugerencia.nombre}</span>
                    </div>
                  )}

                  {/* Dropdown — auto-save al cambiar */}
                  <div style={{ position: "relative" as const }}>
                    <select
                      value={selecciones[key] || item.catalogo_cuenta_id || ""}
                      onChange={async e => {
                        const val = parseInt(e.target.value);
                        if (!val) return;
                        setSelecciones(prev => ({ ...prev, [key]: val }));
                        // Auto-save inmediato
                        await autoSave(item, val);
                      }}
                      disabled={isSaving}
                      style={{ width: "100%", padding: "5px 8px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px", background: isSaving ? "#F9FAFB" : "#FFF", color: "#374151", cursor: isSaving ? "wait" : "pointer" }}
                    >
                      <option value="">{item.cuenta_nombre || "Seleccionar cuenta..."}</option>
                      {cuentas
                        .filter((c: any) => !c.codigo?.startsWith("4") && !c.codigo?.startsWith("7"))
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                        ))}
                    </select>
                    {isSaving && (
                      <div style={{ position: "absolute" as const, right: "8px", top: "50%", transform: "translateY(-50%)" }}>
                        <RefreshCw style={{ width: "12px", height: "12px", color: "#9CA3AF", animation: "spin 1s linear infinite" }} />
                      </div>
                    )}
                  </div>
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

      {/* ── Badge impacto P&L ──────────────────────────────────────────── */}
      {impactoBadge && impactoBadge.count > 0 && (
        <div style={{ marginTop: "20px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
          <AlertTriangle style={{ width: "18px", height: "18px", color: "#D97706", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#92400E" }}>
              {impactoBadge.count} gastos en "Otros gastos" — {fmt(impactoBadge.totalOtros)}
            </div>
            <div style={{ fontSize: "12px", color: "#B45309", marginTop: "2px" }}>
              Recategorizarlos correctamente mejorará la precisión del P&L. Usa la tab "En Otros" para revisarlos.
            </div>
          </div>
          <button
            onClick={() => setTabFiltro("en_otros")}
            style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: "8px", border: "1px solid #F59E0B", background: "#FFF", color: "#D97706", fontSize: "12px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}
          >
            Revisar →
          </button>
        </div>
      )}

      {/* ── Nota P&L datos incompletos ────────────────────────────────── */}
      {totalSinCat === 0 && totalEnOtros === 0 && items.length > 0 && (
        <div style={{ marginTop: "16px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "12px", padding: "14px 18px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#1E40AF" }}>✓ Todos los gastos categorizados</div>
          <div style={{ fontSize: "12px", color: "#3B82F6", marginTop: "4px" }}>
            Si el P&amp;L muestra márgenes muy altos (&gt;80%), probablemente faltan registrar gastos:
            nómina completa, renta mensual, servicios (luz, gas), y compras de alimentos.
          </div>
        </div>
      )}

      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
};
