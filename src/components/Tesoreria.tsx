import { useState, useEffect } from "react";
import { Calendar, AlertTriangle, CheckCircle, Bell, Plus, Edit2, Trash2, X } from "lucide-react";

const API = "http://localhost:8001";
const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const CATEGORIAS = [
  "RENTA","SERVICIOS","IMPUESTOS","COMISIONES_BANCARIAS","COMISIONES_PLATAFORMAS",
  "MARKETING","PERSONAL","NOMINA","PROTEINA","VEGETALES_FRUTAS","ABARROTES",
  "BEBIDAS","PRODUCTOS_ASIATICOS","DESECHABLES_EMPAQUES","LIMPIEZA_MANTTO",
  "UTENSILIOS","EQUIPO","PAPELERIA","LUZ","SOFTWARE","PROPINAS","OTROS",
];
const FRECUENCIAS = ["DIARIO","SEMANAL","QUINCENAL","MENSUAL","ANUAL"];

interface PagoRecurrente {
  id: number;
  concepto: string;
  proveedor: string;
  categoria: string;
  frecuencia: string;
  deadline_texto: string;
  dia_limite: number | null;
  monto_estimado: number;
  activo: boolean;
  notas: string | null;
}

interface FormData {
  concepto: string;
  proveedor: string;
  categoria: string;
  frecuencia: string;
  deadline_texto: string;
  dia_limite: string;
  monto_estimado: string;
  notas: string;
}

const emptyForm: FormData = {
  concepto: "", proveedor: "", categoria: "RENTA", frecuencia: "MENSUAL",
  deadline_texto: "", dia_limite: "", monto_estimado: "0", notas: "",
};

function getDiaActual() { return new Date().getDate(); }
function getDiasEnMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

function getStatus(deadline: string | undefined): { status: "urgente" | "proximo" | "ok" | "continuo"; label: string } {
  if (!deadline) return { status: "ok", label: "-" };
  const dia = getDiaActual();
  const diasMes = getDiasEnMes();
  if (deadline === "Continuo" || deadline === "Variable") return { status: "continuo", label: deadline };
  if (deadline === "Cierre mes" || deadline === "Último día") {
    const f = diasMes - dia;
    if (f <= 3) return { status: "urgente", label: "En " + f + " dias" };
    if (f <= 7) return { status: "proximo", label: "En " + f + " dias" };
    return { status: "ok", label: "Dia " + diasMes };
  }
  const nums = deadline.match(/\d+/g);
  if (nums && nums.length > 0) {
    const d1 = parseInt(nums[0]);
    const d2 = nums.length > 1 ? parseInt(nums[nums.length - 1]) : d1;
    if (dia > d2) return { status: "ok", label: "Vencio dia " + d2 };
    if (dia >= d1) return { status: "urgente", label: "Vence dia " + d2 };
    if (d1 - dia <= 5) return { status: "proximo", label: "En " + (d1 - dia) + " dias" };
    return { status: "ok", label: deadline };
  }
  return { status: "ok", label: deadline };
}

const statusColors = {
  urgente: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  proximo: { bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
  ok: { bg: "#F9FAFB", color: "#6B7280", border: "#F3F4F6" },
  continuo: { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
};

export const Tesoreria = () => {
  const [pagos, setPagos] = useState<PagoRecurrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "urgentes" | "proximos">("todos");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchPagos = async () => {
    try {
      const res = await fetch(`${API}/api/pagos-recurrentes`);
      if (res.ok) setPagos(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPagos(); }, []);

  const pagosConStatus = pagos.map(p => {
    const s = getStatus(p.deadline_texto);
    return { ...p, status: s.status, label: s.label };
  });

  const urgentes = pagosConStatus.filter(p => p.status === "urgente").length;
  const proximos = pagosConStatus.filter(p => p.status === "proximo").length;

  const filtrados = filtro === "urgentes"
    ? pagosConStatus.filter(p => p.status === "urgente")
    : filtro === "proximos"
    ? pagosConStatus.filter(p => p.status === "urgente" || p.status === "proximo")
    : pagosConStatus;

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit = (p: PagoRecurrente) => {
    setForm({
      concepto: p.concepto, proveedor: p.proveedor, categoria: p.categoria,
      frecuencia: p.frecuencia, deadline_texto: p.deadline_texto,
      dia_limite: p.dia_limite != null ? String(p.dia_limite) : "",
      monto_estimado: String(p.monto_estimado), notas: p.notas ?? "",
    });
    setEditId(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      concepto: form.concepto, proveedor: form.proveedor,
      categoria: form.categoria, frecuencia: form.frecuencia,
      deadline_texto: form.deadline_texto,
      dia_limite: form.dia_limite ? parseInt(form.dia_limite) : null,
      monto_estimado: parseFloat(form.monto_estimado) || 0,
      notas: form.notas || null,
    };
    try {
      const url = editId ? `${API}/api/pagos-recurrentes/${editId}` : `${API}/api/pagos-recurrentes`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setShowForm(false);
        await fetchPagos();
      } else {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        alert(`Error ${res.status}: ${JSON.stringify(err.detail ?? err)}`);
      }
    } catch (e) {
      alert(`Error de conexión con el backend: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este pago recurrente?")) return;
    await fetch(`${API}/api/pagos-recurrentes/${id}`, { method: "DELETE" });
    await fetchPagos();
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Calendario de Pagos</h1>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Control de pagos recurrentes y compromisos</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "13px", color: "#6B7280" }}>Hoy: día {getDiaActual()} del mes</div>
          <button onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#3D1C1E", color: "#C8FF00", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
            <Plus style={{ width: "14px", height: "14px" }} /> Nuevo pago
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px", marginBottom: "20px" }}>
        <div onClick={() => setFiltro("urgentes")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "urgentes" ? "2px solid #DC2626" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" }}>Urgentes</span><AlertTriangle style={{ width: "16px", height: "16px", color: "#DC2626" }} /></div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#DC2626", marginTop: "4px" }}>{urgentes}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>pagos por vencer</span>
        </div>
        <div onClick={() => setFiltro("proximos")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "proximos" ? "2px solid #D97706" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" }}>Próximos</span><Bell style={{ width: "16px", height: "16px", color: "#D97706" }} /></div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#D97706", marginTop: "4px" }}>{proximos}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>próximos 5 días</span>
        </div>
        <div onClick={() => setFiltro("todos")} style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", cursor: "pointer", border: filtro === "todos" ? "2px solid #059669" : "2px solid transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" }}>Total Compromisos</span><CheckCircle style={{ width: "16px", height: "16px", color: "#059669" }} /></div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#059669", marginTop: "4px" }}>{pagos.length}</div>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>pagos recurrentes</span>
        </div>
      </div>

      <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 110px 100px 120px 80px", padding: "10px 20px", background: "#FAFBFC", borderBottom: "1px solid #F3F4F6" }}>
          {["Concepto", "Proveedor", "Categoría", "Frecuencia", "Deadline", "Estado", ""].map(h => (
            <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</span>
          ))}
        </div>
        {loading && (
          <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>Cargando pagos...</div>
        )}
        {!loading && filtrados.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", color: "#9CA3AF", fontSize: "13px" }}>No hay pagos. Usa "Nuevo pago" o corre el seed.</div>
        )}
        {filtrados.map((p, i) => {
          const sc = statusColors[p.status] || statusColors.ok;
          return (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 110px 100px 120px 80px", padding: "12px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center", background: p.status === "urgente" ? "#FEF2F2" : "transparent" }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{p.concepto}</span>
                {p.monto_estimado > 0 && <span style={{ fontSize: "11px", color: "#6B7280", marginLeft: "6px" }}>{formatMXN(p.monto_estimado)}</span>}
              </div>
              <span style={{ fontSize: "12px", color: "#374151" }}>{p.proveedor}</span>
              <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "#F3F4F6", color: "#374151", width: "fit-content" }}>{p.categoria.replace(/_/g, " ")}</span>
              <span style={{ fontSize: "11px", color: "#6B7280" }}>{p.frecuencia}</span>
              <span style={{ fontSize: "11px", color: "#374151", fontWeight: "600" }}>{p.deadline_texto}</span>
              <span style={{ fontSize: "11px", fontWeight: "600", padding: "4px 8px", borderRadius: "6px", background: sc.bg, color: sc.color, border: "1px solid " + sc.border, textAlign: "center" }}>{p.label}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => openEdit(p)} style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
                  <Edit2 style={{ width: "13px", height: "13px" }} />
                </button>
                <button onClick={() => handleDelete(p.id)} style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}>
                  <Trash2 style={{ width: "13px", height: "13px" }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FFF", borderRadius: "16px", padding: "28px", width: "520px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#111827" }}>{editId ? "Editar pago" : "Nuevo pago recurrente"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X style={{ width: "18px", height: "18px" }} /></button>
            </div>
            <div style={{ display: "grid", gap: "14px" }}>
              {[
                { label: "Concepto", key: "concepto", type: "text" },
                { label: "Proveedor", key: "proveedor", type: "text" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>{label}</label>
                  <input type={type} value={form[key as keyof FormData]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px" }}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Frecuencia</label>
                  <select value={form.frecuencia} onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px" }}>
                    {FRECUENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Deadline (texto)</label>
                  <input type="text" placeholder="Ej: Día 1-10" value={form.deadline_texto} onChange={e => setForm(f => ({ ...f, deadline_texto: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Día límite (número)</label>
                  <input type="number" min="1" max="31" placeholder="Ej: 10" value={form.dia_limite} onChange={e => setForm(f => ({ ...f, dia_limite: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Monto estimado (MXN)</label>
                <input type="number" min="0" step="0.01" value={form.monto_estimado} onChange={e => setForm(f => ({ ...f, monto_estimado: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "4px" }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 18px", border: "1px solid #E5E7EB", borderRadius: "8px", background: "#FFF", fontSize: "13px", cursor: "pointer", color: "#374151" }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !form.concepto || !form.proveedor || !form.deadline_texto}
                style={{ padding: "9px 18px", border: "none", borderRadius: "8px", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Guardando..." : editId ? "Guardar cambios" : "Crear pago"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
