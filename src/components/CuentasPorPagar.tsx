import { useState, useEffect } from "react";
import { Plus, Trash2, Package, Tag, Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import { api } from "../services/api";

export const CuentasPorPagar = () => {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [showFormProv, setShowFormProv] = useState(false);
  const [showFormCat, setShowFormCat] = useState(false);
  const [newProv, setNewProv] = useState({ nombre: "", categoria_default: "" });
  const [newCat, setNewCat] = useState("");
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [editCatNombre, setEditCatNombre] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);

  const fetchCategorias = async () => {
    try {
      const data = await api.get("/api/categorias?solo_activas=false");
      setCategorias(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  const fetchProveedores = async () => {
    try {
      const data = await api.get("/api/proveedores");
      setProveedores(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchCategorias();
    fetchProveedores();
  }, []);

  const catActivas = categorias.filter(c => c.activo);
  const catInactivas = categorias.filter(c => !c.activo);
  const catVisibles = mostrarInactivas ? categorias : catActivas;

  // Proveedores
  const guardarProveedor = async () => {
    if (!newProv.nombre.trim() || !newProv.categoria_default) return;
    try {
      await api.post("/api/proveedores", newProv);
      setNewProv({ nombre: "", categoria_default: "" });
      setShowFormProv(false);
      fetchProveedores();
    } catch (e) { alert("Error al guardar proveedor"); }
  };

  const eliminarProveedor = async (id: number) => {
    if (!confirm("¿Eliminar este proveedor?")) return;
    try { await api.del("/api/proveedores/" + id); fetchProveedores(); } catch (e) { alert("Error al eliminar"); }
  };

  // Categorías
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

  const guardarEdicionCat = async (id: number) => {
    if (!editCatNombre.trim()) return;
    setSavingCat(true);
    try {
      await api.put("/api/categorias/" + id, { nombre: editCatNombre.trim() });
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
    } catch (e) { alert("Error al cambiar estado"); }
  };

  const eliminarCategoria = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar la categoría "${nombre}"? Los gastos existentes con esta categoría no se verán afectados.`)) return;
    try { await api.del("/api/categorias/" + id); await fetchCategorias(); } catch (e) { alert("Error al eliminar"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── CATEGORÍAS ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Tag style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
              Categorías ({catActivas.length} activas{catInactivas.length > 0 ? `, ${catInactivas.length} inactivas` : ""})
            </h2>
            <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Define las categorías disponibles para clasificar gastos</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {catInactivas.length > 0 && (
              <button onClick={() => setMostrarInactivas(!mostrarInactivas)} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "11px", color: "#6B7280", cursor: "pointer" }}>
                {mostrarInactivas ? <EyeOff style={{ width: "12px", height: "12px" }} /> : <Eye style={{ width: "12px", height: "12px" }} />}
                {mostrarInactivas ? "Ocultar inactivas" : "Ver inactivas"}
              </button>
            )}
            <button onClick={() => setShowFormCat(!showFormCat)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", border: "none", background: showFormCat ? "#E5E7EB" : "#3D1C1E", color: showFormCat ? "#374151" : "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
              {showFormCat ? "Cancelar" : <><Plus style={{ width: "14px", height: "14px" }} /> Nueva Categoría</>}
            </button>
          </div>
        </div>

        {showFormCat && (
          <div style={{ background: "#FFF", borderRadius: "12px", padding: "16px 20px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
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
              <button onClick={guardarCategoria} disabled={savingCat || !newCat.trim()} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer", height: "38px", opacity: savingCat ? 0.6 : 1 }}>
                {savingCat ? "..." : "Guardar"}
              </button>
            </div>
          </div>
        )}

        <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", padding: "10px 20px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
            {["Categoría", "Estado", ""].map(h => <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</span>)}
          </div>
          {catVisibles.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <Tag style={{ width: "28px", height: "28px", color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin categorías. Agrega la primera.</p>
            </div>
          ) : catVisibles.map((c: any) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", padding: "10px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center", background: c.activo ? "transparent" : "#FAFAFA" }}>
              {editCatId === c.id ? (
                <>
                  <input
                    value={editCatNombre}
                    onChange={e => setEditCatNombre(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === "Enter") guardarEdicionCat(c.id); if (e.key === "Escape") setEditCatId(null); }}
                    style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #3D1C1E", fontSize: "12px", fontFamily: "monospace" }}
                    autoFocus
                  />
                  <span />
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button onClick={() => guardarEdicionCat(c.id)} style={{ border: "none", background: "#059669", color: "#FFF", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}><Check style={{ width: "12px", height: "12px" }} /></button>
                    <button onClick={() => setEditCatId(null)} style={{ border: "1px solid #E5E7EB", background: "#FFF", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}><X style={{ width: "12px", height: "12px" }} /></button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: c.activo ? "#111827" : "#9CA3AF", fontFamily: "monospace", textDecoration: c.activo ? "none" : "line-through" }}>
                    {c.nombre.replace(/_/g, " ")}
                  </span>
                  <button onClick={() => toggleCategoria(c.id)} style={{ padding: "3px 10px", borderRadius: "10px", border: "none", background: c.activo ? "#D1FAE5" : "#F3F4F6", color: c.activo ? "#059669" : "#9CA3AF", fontSize: "10px", fontWeight: "700", cursor: "pointer", width: "fit-content" }}>
                    {c.activo ? "Activa" : "Inactiva"}
                  </button>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button onClick={() => { setEditCatId(c.id); setEditCatNombre(c.nombre); }} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px" }}>
                      <Pencil style={{ width: "12px", height: "12px", color: "#6B7280" }} />
                    </button>
                    <button onClick={() => eliminarCategoria(c.id, c.nombre)} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px" }}>
                      <Trash2 style={{ width: "12px", height: "12px", color: "#DC2626" }} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── PROVEEDORES ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", margin: 0 }}>Proveedores ({proveedores.length})</h2>
            <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Alta y gestión de proveedores con categoría default</p>
          </div>
          <button onClick={() => setShowFormProv(!showFormProv)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", border: "none", background: showFormProv ? "#E5E7EB" : "#3D1C1E", color: showFormProv ? "#374151" : "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
            {showFormProv ? "Cancelar" : <><Plus style={{ width: "14px", height: "14px" }} /> Nuevo Proveedor</>}
          </button>
        </div>

        {showFormProv && (
          <div style={{ background: "#FFF", borderRadius: "12px", padding: "16px 20px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #F3F4F6" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Nombre del proveedor *</label>
                <input value={newProv.nombre} onChange={e => setNewProv({ ...newProv, nombre: e.target.value })} onKeyDown={e => e.key === "Enter" && guardarProveedor()} placeholder="Ej: Distribuidora del Pacífico" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }} />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Categoría default</label>
                <select value={newProv.categoria_default} onChange={e => setNewProv({ ...newProv, categoria_default: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }}>
                  <option value="">Seleccionar...</option>
                  {catActivas.map(c => <option key={c.id} value={c.nombre}>{c.nombre.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <button onClick={guardarProveedor} disabled={!newProv.nombre.trim() || !newProv.categoria_default} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer", height: "38px" }}>Guardar</button>
            </div>
          </div>
        )}

        <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 60px", padding: "10px 24px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
            {["Proveedor", "Categoría Default", ""].map(h => <span key={h} style={{ fontSize: "11px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</span>)}
          </div>
          {proveedores.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <Package style={{ width: "32px", height: "32px", color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: "13px", color: "#9CA3AF" }}>Sin proveedores. Agrega el primero.</p>
            </div>
          ) : proveedores.map((p: any) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 200px 60px", padding: "12px 24px", borderBottom: "1px solid #F9FAFB", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{p.nombre}</span>
              <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "6px", background: "#F3F4F6", color: "#374151", width: "fit-content" }}>{(p.categoria_default || "").replace(/_/g, " ")}</span>
              <button onClick={() => eliminarProveedor(p.id)} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px" }}><Trash2 style={{ width: "14px", height: "14px", color: "#DC2626" }} /></button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
