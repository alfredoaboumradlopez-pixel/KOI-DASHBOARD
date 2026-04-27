import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import { Tag, Check } from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

interface CategorizarGastosProps {
  restauranteIdOverride?: number;
}

export const CategorizarGastos = ({ restauranteIdOverride }: CategorizarGastosProps = {}) => {
  const { authUser } = useStore();
  const restauranteId = restauranteIdOverride ?? authUser?.restaurante_id ?? 1;
  const [items, setItems] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [selecciones, setSelecciones] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);

  const cargar = async () => {
    setLoading(true);
    try {
      const [data, catData] = await Promise.all([
        api.get(`/api/gastos/sin-categorizar/${restauranteId}`),
        api.get(`/api/catalogo-cuentas/${restauranteId}`).catch(() => ({ items: [] })),
      ]);
      setItems(data.items || []);
      // Pre-seleccionar sugerencias de alta confianza
      const presel: Record<string, number> = {};
      const preChecked = new Set<string>();
      (data.items || []).forEach((item: any) => {
        const key = `${item.tabla}-${item.id}`;
        if (item.sugerencia?.confianza === "alta") {
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

  useEffect(() => { cargar(); }, []);

  const totalSinCat = items.length;
  const totalMonto = items.reduce((s, i) => s + (i.monto || 0), 0);

  const toggleCheck = (key: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const guardar = async () => {
    const batch = Array.from(checked)
      .filter((key): key is string => typeof key === 'string' && !!selecciones[key as string])
      .map(key => {
        const [tabla, ...idParts] = (key as string).split("-");
        return { id: parseInt(idParts.join("-")), tabla, catalogo_cuenta_id: selecciones[key as string] };
      });
    if (batch.length === 0) return;
    setSaving(true);
    try {
      const res = await api.post("/api/gastos/categorizar-batch", batch);
      setSaved(res.categorizados || 0);
      cargar();
    } catch { }
    setSaving(false);
  };

  if (loading) return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ background: "#FFF", borderRadius: "10px", padding: "16px", marginBottom: "8px", height: "60px" }} />
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Tag style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
        </div>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#111827", margin: 0 }}>Categorizar gastos</h1>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>{totalSinCat} gastos sin categoría contable · {fmt(totalMonto)} en total</p>
        </div>
        {saved > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", fontSize: "13px", fontWeight: "600" }}>
            <Check style={{ width: "14px", height: "14px" }} /> {saved} categorizados
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "48px", textAlign: "center" as const, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <Check style={{ width: "32px", height: "32px", color: "#059669", margin: "0 auto 8px" }} />
          <p style={{ fontSize: "14px", color: "#6B7280" }}>Todos los gastos están categorizados ✓</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px", gap: "8px" }}>
            <button onClick={() => setChecked(new Set(items.map((i: any) => `${i.tabla}-${i.id}`)))} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer" }}>Seleccionar todos</button>
            <button onClick={guardar} disabled={saving || checked.size === 0} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: checked.size > 0 ? "#3D1C1E" : "#9CA3AF", color: "#C8FF00", fontSize: "13px", fontWeight: "700", cursor: checked.size > 0 ? "pointer" : "not-allowed" }}>
              {saving ? "Guardando..." : `Guardar ${checked.size} seleccionados`}
            </button>
          </div>
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            {items.map((item: any) => {
              const key = `${item.tabla}-${item.id}`;
              const isChecked = checked.has(key);
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 120px", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid #F9FAFB", background: isChecked ? "#FAFFFE" : "transparent" }}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(key)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{item.proveedor}</div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{item.fecha} · {item.tabla === "gastos_diarios" ? "Cierre turno" : "Gasto registrado"}</div>
                    {item.categoria_texto && <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "#F3F4F6", color: "#6B7280" }}>{item.categoria_texto}</span>}
                  </div>
                  <div>
                    {item.sugerencia ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: item.sugerencia.confianza === "alta" ? "#ECFDF5" : item.sugerencia.confianza === "media" ? "#FFFBEB" : "#F3F4F6", color: item.sugerencia.confianza === "alta" ? "#059669" : item.sugerencia.confianza === "media" ? "#D97706" : "#9CA3AF", fontWeight: "600" }}>
                          {item.sugerencia.confianza}
                        </span>
                        <span style={{ fontSize: "12px", color: "#374151" }}>→ {item.sugerencia.nombre}</span>
                      </div>
                    ) : <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Sin sugerencia</span>}
                    {cuentas.length > 0 && (
                      <select value={selecciones[key] || ""} onChange={e => setSelecciones(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                        style={{ marginTop: "4px", width: "100%", padding: "4px 8px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px", background: "#FFF" }}>
                        <option value="">Seleccionar cuenta...</option>
                        {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                      </select>
                    )}
                  </div>
                  <div style={{ textAlign: "right" as const, fontSize: "14px", fontWeight: "700", color: "#111827" }}>{fmt(item.monto)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
