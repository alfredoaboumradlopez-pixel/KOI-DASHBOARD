import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "../services/api";

// ── Color mapping by category keyword ──────────────────────────────────────
const catStyle = (nombre: string): { bg: string; border: string; accent: string } => {
  const n = nombre.toUpperCase();
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

export const CategoriaChips = () => {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [showFormCat, setShowFormCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [hoveredCat, setHoveredCat] = useState<number | null>(null);

  // Edit modal state
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [editCatNombre, setEditCatNombre] = useState("");

  const fetchCategorias = async () => {
    try {
      const data = await api.get("/api/categorias?solo_activas=false");
      setCategorias(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  useEffect(() => { fetchCategorias(); }, []);

  const catActivas = categorias.filter(c => c.activo);
  const catInactivas = categorias.filter(c => !c.activo);
  const catVisibles = mostrarInactivas ? categorias : catActivas;

  const guardarCategoria = async () => {
    if (!newCat.trim()) return;
    setSavingCat(true);
    try {
      await api.post("/api/categorias", { nombre: newCat.trim() });
      setNewCat("");
      setShowFormCat(false);
      await fetchCategorias();
    } catch (e: any) {
      alert(e?.message ?? "Error al guardar categoría");
    } finally { setSavingCat(false); }
  };

  const guardarEdicion = async () => {
    if (!editCatId || !editCatNombre.trim()) return;
    setSavingCat(true);
    try {
      await api.put("/api/categorias/" + editCatId, { nombre: editCatNombre.trim() });
      setEditCatId(null);
      await fetchCategorias();
    } catch (e: any) {
      alert(e?.message ?? "Error al editar");
    } finally { setSavingCat(false); }
  };

  const toggleCategoria = async (id: number) => {
    try {
      await api.patch("/api/categorias/" + id + "/toggle", {});
      await fetchCategorias();
    } catch { alert("Error al cambiar estado"); }
  };

  const eliminarCategoria = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar la categoría "${nombre}"? Los gastos existentes no se verán afectados.`)) return;
    try {
      await api.del("/api/categorias/" + id);
      await fetchCategorias();
    } catch { alert("Error al eliminar"); }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", margin: 0 }}>
            Categorías de Gastos
          </h2>
          <p style={{ fontSize: "12px", color: "#9CA3AF", margin: "2px 0 0" }}>
            {catActivas.length} activas{catInactivas.length > 0 ? ` · ${catInactivas.length} inactivas` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {catInactivas.length > 0 && (
            <button
              onClick={() => setMostrarInactivas(!mostrarInactivas)}
              style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: mostrarInactivas ? "#F3F4F6" : "#FFF", fontSize: "11px", color: "#6B7280", cursor: "pointer" }}
            >
              {mostrarInactivas ? "Ocultar inactivas" : `Ver ${catInactivas.length} inactivas`}
            </button>
          )}
          <button
            onClick={() => setShowFormCat(!showFormCat)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", border: "none", background: showFormCat ? "#E5E7EB" : "#3D1C1E", color: showFormCat ? "#374151" : "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
          >
            {showFormCat ? "Cancelar" : <><Plus style={{ width: "14px", height: "14px" }} /> Nueva Categoría</>}
          </button>
        </div>
      </div>

      {/* New category form */}
      {showFormCat && (
        <div style={{ background: "#FFF", borderRadius: "12px", padding: "16px 20px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "end" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Nombre de la categoría *</label>
              <input
                value={newCat}
                onChange={e => setNewCat(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && guardarCategoria()}
                placeholder="Ej: EVENTOS_ESPECIALES"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px", fontFamily: "monospace" }}
                autoFocus
              />
              <span style={{ fontSize: "10px", color: "#9CA3AF" }}>Se guardará en mayúsculas. Usa guiones bajos en lugar de espacios.</span>
            </div>
            <button
              onClick={guardarCategoria}
              disabled={savingCat || !newCat.trim()}
              style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer", height: "38px", opacity: savingCat ? 0.6 : 1 }}
            >
              {savingCat ? "..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Chips grid */}
      {catVisibles.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", background: "#FFF", borderRadius: "14px" }}>
          <p style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin categorías. Agrega la primera.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {catVisibles.map((c: any) => {
            const s = catStyle(c.nombre);
            const isHovered = hoveredCat === c.id;
            return (
              <div
                key={c.id}
                onMouseEnter={() => setHoveredCat(c.id)}
                onMouseLeave={() => setHoveredCat(null)}
                style={{
                  background: c.activo ? s.bg : "#F9FAFB",
                  border: `1.5px solid ${c.activo ? s.border : "#E5E7EB"}`,
                  borderLeft: `4px solid ${c.activo ? s.accent : "#D1D5DB"}`,
                  borderRadius: "10px",
                  padding: "12px 14px",
                  cursor: "default",
                  transition: "box-shadow 0.15s",
                  boxShadow: isHovered ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                  opacity: c.activo ? 1 : 0.6,
                  position: "relative",
                }}
              >
                {/* Category name */}
                <div style={{ fontSize: "12px", fontWeight: "700", color: c.activo ? "#111827" : "#9CA3AF", marginBottom: "8px", lineHeight: "1.3" }}>
                  {c.nombre.replace(/_/g, " ")}
                </div>

                {/* Bottom row: badge + actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    onClick={() => toggleCategoria(c.id)}
                    style={{
                      padding: "2px 8px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: "700",
                      background: c.activo ? "#D1FAE5" : "#F3F4F6",
                      color: c.activo ? "#059669" : "#9CA3AF",
                    }}
                  >
                    {c.activo ? "Activa" : "Inactiva"}
                  </button>
                  <div style={{ display: "flex", gap: "2px", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}>
                    <button
                      onClick={() => { setEditCatId(c.id); setEditCatNombre(c.nombre); }}
                      title="Editar"
                      style={{ border: "none", background: "none", cursor: "pointer", padding: "3px", borderRadius: "4px", display: "flex", alignItems: "center" }}
                    >
                      <Pencil style={{ width: "12px", height: "12px", color: "#6B7280" }} />
                    </button>
                    <button
                      onClick={() => eliminarCategoria(c.id, c.nombre)}
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

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexWrap: "wrap" }}>
        {[
          { label: "Costo de ventas", color: "#EA580C", bg: "#FFF7ED" },
          { label: "Nómina / Personal", color: "#2563EB", bg: "#EFF6FF" },
          { label: "Operativo", color: "#059669", bg: "#F0FDF4" },
          { label: "Gastos fijos", color: "#7C3AED", bg: "#FAF5FF" },
          { label: "Admin / Comisiones", color: "#6B7280", bg: "#F9FAFB" },
        ].map(({ label, color, bg }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: bg, border: `2px solid ${color}` }} />
            <span style={{ fontSize: "11px", color: "#6B7280" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editCatId !== null && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setEditCatId(null); }}
        >
          <div style={{ background: "#FFF", borderRadius: "16px", padding: "24px", width: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", margin: "0 0 16px" }}>Editar Categoría</h3>
            <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "6px" }}>Nombre</label>
            <input
              value={editCatNombre}
              onChange={e => setEditCatNombre(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter") guardarEdicion(); if (e.key === "Escape") setEditCatId(null); }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #3D1C1E", fontSize: "13px", fontFamily: "monospace", boxSizing: "border-box" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditCatId(null)}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "13px", cursor: "pointer", color: "#6B7280" }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={savingCat || !editCatNombre.trim()}
                style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "700", cursor: "pointer", opacity: savingCat ? 0.6 : 1 }}
              >
                {savingCat ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
