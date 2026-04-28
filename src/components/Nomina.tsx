import { useState, useEffect, useMemo } from "react";
import { api } from "../services/api";
import { Users, Trash2, AlertTriangle, CheckCircle, Clock, FileText, Bell, Calendar, Shield, Plus, X, Edit2, Banknote, ChevronDown, ChevronUp } from "lucide-react";
import { useRestaurante } from "../context/RestauranteContext";

interface DocEmpleado {
  id: number;
  empleado_id: number;
  nombre: string;
  tipo: string;
  created_at: string;
}

interface Empleado {
  id: number;
  nombre: string;
  puesto: string;
  salario_base: number;
  fecha_ingreso: string;
  fecha_nacimiento?: string;
  tipo_contrato: string;
  activo: boolean;
  rfc?: string;
  curp?: string;
  numero_imss?: string;
  cuenta_banco?: string;
  restaurante_id?: number;
  documentos: DocEmpleado[];
}

interface NominaPago {
  id: number;
  empleado_id: number;
  empleado_nombre?: string;
  empleado_puesto?: string;
  periodo_inicio: string;
  periodo_fin: string;
  salario_base: number;
  horas_extra: number;
  deducciones: number;
  neto_pagado: number;
  fecha_pago: string;
}

interface NominaItem {
  empleado_id: number;
  nombre: string;
  puesto: string;
  salario_base_semanal: number;
  dias_trabajados: number;
  propinas: number;
  deducciones: number;
}

const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

const CONTRATO_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  INDEFINIDO:   { label: "Indefinido",   bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0" },
  TEMPORAL:     { label: "Temporal",     bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  PRUEBA:       { label: "Prueba",       bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  CAPACITACION: { label: "Capacitación", bg: "#FDF4FF", text: "#7E22CE", border: "#E9D5FF" },
  SIN_CONTRATO: { label: "Sin Contrato", bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
};

function diasFin(f?: string): number | null {
  if (!f) return null;
  return Math.ceil((new Date(f + "T12:00:00").getTime() - Date.now()) / 86400000);
}

function complianceSemaforo(e: Empleado): "rojo" | "amarillo" | "verde" {
  const sinContrato = !e.tipo_contrato || e.tipo_contrato === "SIN_CONTRATO";
  const sinIMSS = !e.numero_imss;
  if (sinContrato || sinIMSS) return "rojo";
  if (!e.rfc || !e.curp) return "amarillo";
  return "verde";
}

const SEM_DOT: Record<string, string> = { rojo: "🔴", amarillo: "🟡", verde: "🟢" };

const emptyForm = {
  nombre: "", puesto: "", salario_base: 9000,
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  fecha_nacimiento: "", tipo_contrato: "INDEFINIDO",
  rfc: "", curp: "", numero_imss: "", cuenta_banco: "",
  fecha_fin_contrato: "",
};

export const Nomina = () => {
  const { restauranteId } = useRestaurante();
  const [emps, setEmps] = useState<Empleado[]>([]);
  const [historial, setHistorial] = useState<NominaPago[]>([]);
  const [vista, setVista] = useState<"alertas" | "equipo" | "legal">("alertas");
  const [exp, setExp] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editEmp, setEditEmp] = useState<any>(null);
  const [editEmpId, setEditEmpId] = useState<number | null>(null);

  // Nómina semanal
  const [nominaItems, setNominaItems] = useState<NominaItem[]>([]);
  const [nominaOpen, setNominaOpen] = useState(false);
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [periodoFin, setPeriodoFin] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [savingNomina, setSavingNomina] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchEmpleados = async () => {
    try {
      const data = await api.get(`/api/empleados?restaurante_id=${restauranteId}`);
      if (Array.isArray(data)) setEmps(data);
    } catch (e) {}
  };

  const fetchHistorial = async () => {
    try {
      const data = await api.get(`/api/nomina?restaurante_id=${restauranteId}&meses=3`);
      if (Array.isArray(data)) setHistorial(data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchEmpleados();
    fetchHistorial();
  }, [restauranteId]);

  // Build nomina items when emps change and nomina panel is opened
  useEffect(() => {
    if (nominaOpen && emps.length > 0) {
      setNominaItems(emps.map(e => ({
        empleado_id: e.id,
        nombre: e.nombre,
        puesto: e.puesto,
        salario_base_semanal: Math.round(e.salario_base / 4.33),
        dias_trabajados: 6,
        propinas: 0,
        deducciones: 0,
      })));
    }
  }, [nominaOpen, emps]);

  const netoCalculado = (item: NominaItem) =>
    Math.round((item.salario_base_semanal / 6) * item.dias_trabajados + item.propinas - item.deducciones);

  const totalNomina = useMemo(
    () => nominaItems.reduce((s, it) => s + netoCalculado(it), 0),
    [nominaItems]
  );

  const registrarNomina = async () => {
    if (nominaItems.length === 0) return;
    setSavingNomina(true);
    try {
      const res = await api.post("/api/nomina/semana", {
        restaurante_id: restauranteId,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        fecha_pago: new Date().toISOString().slice(0, 10),
        items: nominaItems.map(it => ({
          empleado_id: it.empleado_id,
          salario_base_semanal: it.salario_base_semanal,
          dias_trabajados: it.dias_trabajados,
          propinas: it.propinas,
          deducciones: it.deducciones,
          neto_pagado: netoCalculado(it),
        })),
      });
      showToast(`✓ Nómina registrada — Total: ${fmt(res.total_nomina)}`);
      setNominaOpen(false);
      fetchHistorial();
    } catch (e: any) {
      alert("Error al registrar nómina: " + (e.message || e));
    } finally {
      setSavingNomina(false);
    }
  };

  const handleFileUpload = async (files: FileList | null, empId?: number) => {
    if (!files) return;
    const arr = Array.from(files);
    const tooBig = arr.find(f => f.size > 10 * 1024 * 1024);
    if (tooBig) { alert(`"${tooBig.name}" supera el límite de 10MB`); return; }
    if (empId) {
      for (const file of arr) {
        try {
          await api.upload(`/api/empleados/${empId}/documentos`, file);
        } catch (e: any) {
          alert("Error al subir " + file.name + ": " + (e.message || ""));
        }
      }
      fetchEmpleados();
    } else {
      setPendingFiles(p => [...p, ...arr]);
    }
  };

  const eliminarDocumento = async (docId: number) => {
    try { await api.del(`/api/empleados/documentos/${docId}`); fetchEmpleados(); }
    catch (e) { alert("Error al eliminar documento"); }
  };

  const iniciarEdicion = (e: Empleado) => {
    setEditEmp({
      nombre: e.nombre, puesto: e.puesto, salario_base: e.salario_base,
      fecha_ingreso: e.fecha_ingreso, fecha_nacimiento: e.fecha_nacimiento || "",
      tipo_contrato: e.tipo_contrato || "INDEFINIDO",
      rfc: e.rfc || "", curp: e.curp || "",
      numero_imss: e.numero_imss || "", cuenta_banco: e.cuenta_banco || "",
      fecha_fin_contrato: "",
    });
    setEditEmpId(e.id);
  };

  const guardarEdicion = async () => {
    if (!editEmp || !editEmpId) return;
    try {
      await api.put("/api/empleados/" + editEmpId, {
        nombre: editEmp.nombre, puesto: editEmp.puesto,
        salario_base: parseFloat(editEmp.salario_base) || 1,
        fecha_ingreso: editEmp.fecha_ingreso,
        fecha_nacimiento: editEmp.fecha_nacimiento || null,
        tipo_contrato: editEmp.tipo_contrato || null,
        rfc: editEmp.rfc || null, curp: editEmp.curp || null,
        numero_imss: editEmp.numero_imss || null,
        cuenta_banco: editEmp.cuenta_banco || null,
        restaurante_id: restauranteId,
      });
      setEditEmpId(null); setEditEmp(null);
      fetchEmpleados();
      showToast("✓ Empleado actualizado");
    } catch (e: any) { alert("Error al editar: " + (e.message || e)); }
  };

  const eliminarEmpleado = async (id: number) => {
    if (!confirm("¿Eliminar este empleado?")) return;
    try { await api.del("/api/empleados/" + id); fetchEmpleados(); }
    catch (e) { alert("Error al eliminar"); }
  };

  const agregarEmpleado = async () => {
    if (!form.nombre.trim() || !form.puesto.trim()) {
      alert("Nombre y puesto son obligatorios (*)"); return;
    }
    setSaving(true);
    try {
      const created = await api.post("/api/empleados", {
        nombre: form.nombre,
        puesto: form.puesto,
        salario_base: Number(form.salario_base) || 1,
        fecha_ingreso: form.fecha_ingreso,
        fecha_nacimiento: form.fecha_nacimiento || null,
        tipo_contrato: form.tipo_contrato || null,
        rfc: form.rfc || null,
        curp: form.curp || null,
        numero_imss: form.numero_imss || null,
        cuenta_banco: form.cuenta_banco || null,
        restaurante_id: restauranteId,
      });
      if (pendingFiles.length > 0 && created?.id) {
        for (const file of pendingFiles) {
          try { await api.upload(`/api/empleados/${created.id}/documentos`, file); } catch (e) {}
        }
      }
      setPendingFiles([]);
      setForm(emptyForm);
      setShowForm(false);
      await fetchEmpleados();
      showToast("✓ Empleado guardado correctamente");
    } catch (e: any) {
      const msg = e?.detail || e?.message || JSON.stringify(e);
      alert("Error al guardar empleado: " + msg);
    } finally {
      setSaving(false);
    }
  };

  // Derived stats
  const nomTotal = emps.reduce((s, e) => s + e.salario_base, 0);
  const sinC = emps.filter(e => !e.tipo_contrato || e.tipo_contrato === "SIN_CONTRATO").length;
  const sinI = emps.filter(e => !e.numero_imss).length;

  const alertas: { tipo: "urgente" | "aviso"; msg: string; det: string }[] = [];
  emps.forEach(e => {
    if (!e.tipo_contrato || e.tipo_contrato === "SIN_CONTRATO")
      alertas.push({ tipo: "urgente", msg: e.nombre + " sin contrato registrado", det: "Puesto: " + e.puesto });
    if (!e.numero_imss)
      alertas.push({ tipo: "urgente", msg: e.nombre + " sin registro IMSS", det: "Riesgo legal — multas y responsabilidad patronal" });
    const df = diasFin(undefined);
    if (df !== null && df < 0)
      alertas.push({ tipo: "urgente", msg: "Contrato de " + e.nombre + " VENCIDO", det: "" });
  });

  // Group historial by semana
  const historialAgrupado = useMemo(() => {
    const map = new Map<string, { periodo: string; total: number; fecha: string; ids: number[] }>();
    for (const p of historial) {
      const key = p.periodo_inicio + "_" + p.periodo_fin;
      if (!map.has(key)) {
        const ini = new Date(p.periodo_inicio + "T12:00:00");
        const fin = new Date(p.periodo_fin + "T12:00:00");
        const fmtDate = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
        map.set(key, { periodo: fmtDate(ini) + " – " + fmtDate(fin), total: 0, fecha: p.fecha_pago, ids: [] });
      }
      const g = map.get(key)!;
      g.total += p.neto_pagado;
      g.ids.push(p.id);
    }
    return Array.from(map.values()).slice(0, 12);
  }, [historial]);

  const contratoOpts = [
    { value: "INDEFINIDO", label: "Indefinido" },
    { value: "TEMPORAL", label: "Temporal" },
    { value: "PRUEBA", label: "Prueba" },
    { value: "CAPACITACION", label: "Capacitación" },
    { value: "SIN_CONTRATO", label: "Sin Contrato" },
  ];

  const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px", boxSizing: "border-box" as const };
  const labelStyle = { fontSize: "11px", fontWeight: "600" as const, color: "#6B7280", display: "block" as const, marginBottom: "4px" };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes slideUp { from { opacity:0;transform:translateY(10px); } to { opacity:1;transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .nom-row { transition:background 0.1s; } .nom-row:hover { background:#FAFBFC !important; }
        .nom-btn { transition:opacity 0.15s; } .nom-btn:hover { opacity:0.8; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 200, padding: "12px 20px", borderRadius: "10px", background: "#111827", color: "#C8FF00", fontSize: "13px", fontWeight: "700", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", animation: "fadeIn 0.2s" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Users style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
        </div>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Nómina & Legal</h1>
          <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Control de pagos, contratos y compliance</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setForm(emptyForm); setPendingFiles([]); }}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "10px 18px", borderRadius: "10px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
          {showForm ? <X style={{ width: "16px", height: "16px" }} /> : <Plus style={{ width: "16px", height: "16px" }} />}
          {showForm ? "Cancelar" : "Nuevo Empleado"}
        </button>
      </div>

      {/* Formulario nuevo empleado */}
      {showForm && (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px 24px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)", animation: "slideUp 0.2s" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#111827", marginBottom: "16px" }}>Registrar Nuevo Empleado</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div><label style={labelStyle}>Nombre completo *</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={inputStyle} placeholder="Ej: Juan Pérez" /></div>
            <div><label style={labelStyle}>Puesto *</label><input value={form.puesto} onChange={e => setForm({ ...form, puesto: e.target.value })} style={inputStyle} placeholder="Ej: Cocinero" /></div>
            <div><label style={labelStyle}>Salario Mensual *</label><input type="number" value={form.salario_base} onChange={e => setForm({ ...form, salario_base: parseFloat(e.target.value) || 0 })} style={inputStyle} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div><label style={labelStyle}>Fecha Ingreso</label><input type="date" value={form.fecha_ingreso} onChange={e => setForm({ ...form, fecha_ingreso: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Fecha Nacimiento</label><input type="date" value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Tipo Contrato</label>
              <select value={form.tipo_contrato} onChange={e => setForm({ ...form, tipo_contrato: e.target.value })} style={inputStyle}>
                {contratoOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div><label style={labelStyle}>No. IMSS</label><input value={form.numero_imss} onChange={e => setForm({ ...form, numero_imss: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>RFC</label><input value={form.rfc} onChange={e => setForm({ ...form, rfc: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>CURP</label><input value={form.curp} onChange={e => setForm({ ...form, curp: e.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle}>Cuenta Banco</label><input value={form.cuenta_banco} onChange={e => setForm({ ...form, cuenta_banco: e.target.value })} style={inputStyle} /></div>
          </div>

          {/* Documentos pending */}
          <div style={{ paddingTop: "14px", borderTop: "1px solid #F3F4F6", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#374151" }}>Documentos (se suben al guardar)</span>
              <label style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "7px", border: "1px dashed #D1D5DB", background: "#F9FAFB", fontSize: "11px", color: "#6B7280", cursor: "pointer", fontWeight: "600" }}>
                <Plus style={{ width: "12px", height: "12px" }} /> Seleccionar
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={e => handleFileUpload(e.target.files)} style={{ display: "none" }} />
              </label>
            </div>
            <p style={{ fontSize: "11px", color: "#9CA3AF", margin: "0 0 8px" }}>Contrato, INE, CURP, constancia IMSS, etc. Máx 10MB por archivo.</p>
            {pendingFiles.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "7px", background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                    <FileText style={{ width: "12px", height: "12px", color: "#1D4ED8" }} />
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#1D4ED8" }}>{f.name}</span>
                    <span style={{ fontSize: "10px", color: "#93C5FD" }}>({(f.size / 1024).toFixed(0)}KB)</span>
                    <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} style={{ border: "none", background: "none", cursor: "pointer", padding: "0" }}>
                      <X style={{ width: "11px", height: "11px", color: "#93C5FD" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={agregarEmpleado} disabled={saving}
              style={{ padding: "10px 28px", borderRadius: "10px", border: "none", background: saving ? "#9CA3AF" : "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Guardando..." : "Guardar Empleado"}
            </button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { l: "Empleados", v: String(emps.length), s: "activos", icon: Users, c: "#3D1C1E" },
          { l: "Nómina Mensual", v: fmt(nomTotal), s: "total base", icon: Banknote, c: "#059669" },
          { l: "Sin Contrato", v: String(sinC), s: sinC > 0 ? "¡URGENTE!" : "al día", icon: FileText, c: sinC > 0 ? "#DC2626" : "#059669" },
          { l: "Sin IMSS", v: String(sinI), s: sinI > 0 ? "riesgo legal" : "al día", icon: Shield, c: sinI > 0 ? "#DC2626" : "#059669" },
        ].map((k, i) => {
          const Ic = k.icon;
          return (
            <div key={i} style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{k.l}</span>
                <Ic style={{ width: "16px", height: "16px", color: k.c, opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginTop: "8px" }}>{k.v}</div>
              <span style={{ fontSize: "11px", color: k.c === "#DC2626" ? "#DC2626" : "#9CA3AF", fontWeight: k.c === "#DC2626" ? "700" : "400" }}>{k.s}</span>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", background: "#FFF", borderRadius: "12px", padding: "4px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        {[
          { key: "alertas" as const, label: "Alertas & Pagos", icon: Bell, n: alertas.length },
          { key: "equipo" as const, label: "Equipo", icon: Users, n: emps.length },
          { key: "legal" as const, label: "Compliance Legal", icon: Shield, n: sinC + sinI },
        ].map(t => {
          const Ic = t.icon; const act = vista === t.key;
          return (
            <button key={t.key} onClick={() => setVista(t.key)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: act ? "#3D1C1E" : "transparent", color: act ? "#FFF" : "#6B7280", fontSize: "13px", fontWeight: "600", transition: "all 0.15s" }}>
              <Ic style={{ width: "16px", height: "16px" }} />{t.label}
              {t.n > 0 && (
                <span style={{ padding: "1px 7px", borderRadius: "10px", fontSize: "11px", fontWeight: "700", background: act ? "#C8FF00" : (t.key === "legal" && t.n > 0 ? "#FEE2E2" : "#F3F4F6"), color: act ? "#1a1a1a" : (t.key === "legal" && t.n > 0 ? "#DC2626" : "#6B7280") }}>{t.n}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Modal editar empleado */}
      {editEmpId && editEmp && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
          <div style={{ background: "#FFF", borderRadius: "16px", padding: "24px", width: "640px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", marginBottom: "16px" }}>Editar Empleado</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {[
                { label: "Nombre *", key: "nombre", type: "text" },
                { label: "Puesto *", key: "puesto", type: "text" },
                { label: "Salario Mensual *", key: "salario_base", type: "number" },
                { label: "Fecha Ingreso", key: "fecha_ingreso", type: "date" },
                { label: "Fecha Nacimiento", key: "fecha_nacimiento", type: "date" },
                { label: "RFC", key: "rfc", type: "text" },
                { label: "CURP", key: "curp", type: "text" },
                { label: "No. IMSS", key: "numero_imss", type: "text" },
                { label: "Cuenta Banco", key: "cuenta_banco", type: "text" },
              ].map(f => (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <input type={f.type} value={editEmp[f.key] || ""} onChange={e => setEditEmp({ ...editEmp, [f.key]: e.target.value })} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Tipo Contrato</label>
                <select value={editEmp.tipo_contrato || "INDEFINIDO"} onChange={e => setEditEmp({ ...editEmp, tipo_contrato: e.target.value })} style={inputStyle}>
                  {contratoOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" }}>
              <button onClick={() => { setEditEmpId(null); setEditEmp(null); }} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer" }}>Cancelar</button>
              <button onClick={guardarEdicion} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ALERTAS & PAGOS ── */}
      {vista === "alertas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Alertas */}
            <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: "8px" }}>
                <Bell style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Alertas Activas</span>
              </div>
              <div style={{ padding: "8px 12px", maxHeight: "320px", overflowY: "auto" }}>
                {alertas.length === 0
                  ? <div style={{ padding: "28px", textAlign: "center" }}><CheckCircle style={{ width: "28px", height: "28px", color: "#059669", margin: "0 auto 6px" }} /><p style={{ fontSize: "13px", color: "#6B7280" }}>Todo en orden</p></div>
                  : alertas.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", padding: "10px 12px", borderRadius: "10px", marginBottom: "4px", background: a.tipo === "urgente" ? "#FEF2F2" : "#FFFBEB" }}>
                      {a.tipo === "urgente" ? <AlertTriangle style={{ width: "16px", height: "16px", color: "#DC2626", flexShrink: 0, marginTop: "2px" }} /> : <Clock style={{ width: "16px", height: "16px", color: "#D97706", flexShrink: 0, marginTop: "2px" }} />}
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: a.tipo === "urgente" ? "#991B1B" : "#92400E" }}>{a.msg}</div>
                        {a.det && <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{a.det}</div>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Próximos pagos */}
            <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: "8px" }}>
                <Calendar style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Equipo — Salarios</span>
              </div>
              <div style={{ padding: "8px 12px", maxHeight: "320px", overflowY: "auto" }}>
                {emps.length === 0
                  ? <div style={{ padding: "24px", textAlign: "center", fontSize: "13px", color: "#9CA3AF" }}>No hay empleados registrados</div>
                  : emps.map(e => (
                    <div key={e.id} className="nom-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center", color: "#C8FF00", fontSize: "13px", fontWeight: "700" }}>{e.nombre.charAt(0)}</div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{e.nombre}</div>
                          <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{e.puesto}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{fmt(e.salario_base)}</div>
                        <div style={{ fontSize: "10px", color: "#9CA3AF" }}>mensual</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Calcular nómina semanal */}
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <button onClick={() => setNominaOpen(!nominaOpen)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", border: "none", background: "none", cursor: "pointer", borderBottom: nominaOpen ? "1px solid #F3F4F6" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Banknote style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Calcular Nómina de la Semana</span>
              </div>
              {nominaOpen ? <ChevronUp style={{ width: "16px", height: "16px", color: "#9CA3AF" }} /> : <ChevronDown style={{ width: "16px", height: "16px", color: "#9CA3AF" }} />}
            </button>

            {nominaOpen && (
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center" }}>
                  <div><label style={labelStyle}>Periodo inicio</label><input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} style={{ ...inputStyle, width: "150px" }} /></div>
                  <div><label style={labelStyle}>Periodo fin</label><input type="date" value={periodoFin} onChange={e => setPeriodoFin(e.target.value)} style={{ ...inputStyle, width: "150px" }} /></div>
                </div>

                {nominaItems.length === 0
                  ? <p style={{ fontSize: "13px", color: "#9CA3AF" }}>No hay empleados activos</p>
                  : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 110px 100px 90px", gap: "0", marginBottom: "4px", padding: "0 8px" }}>
                        {["Empleado", "Días trab.", "Propinas", "Deducciones", "Sueldo sem.", "Total"].map(h => (
                          <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px" }}>{h}</span>
                        ))}
                      </div>
                      {nominaItems.map((it, idx) => {
                        const neto = netoCalculado(it);
                        return (
                          <div key={it.empleado_id} className="nom-row" style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 110px 100px 90px", gap: "0", alignItems: "center", padding: "8px", borderRadius: "8px", marginBottom: "2px" }}>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{it.nombre}</div>
                              <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{it.puesto}</div>
                            </div>
                            <input type="number" min={0} max={7} step={0.5} value={it.dias_trabajados}
                              onChange={e => setNominaItems(p => p.map((x, i) => i === idx ? { ...x, dias_trabajados: parseFloat(e.target.value) || 0 } : x))}
                              style={{ ...inputStyle, width: "72px", textAlign: "center" }} />
                            <input type="number" min={0} step={100} value={it.propinas}
                              onChange={e => setNominaItems(p => p.map((x, i) => i === idx ? { ...x, propinas: parseFloat(e.target.value) || 0 } : x))}
                              style={{ ...inputStyle, width: "90px" }} />
                            <input type="number" min={0} step={100} value={it.deducciones}
                              onChange={e => setNominaItems(p => p.map((x, i) => i === idx ? { ...x, deducciones: parseFloat(e.target.value) || 0 } : x))}
                              style={{ ...inputStyle, width: "90px" }} />
                            <span style={{ fontSize: "12px", color: "#6B7280" }}>{fmt(it.salario_base_semanal)}</span>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{fmt(neto)}</span>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #F3F4F6" }}>
                        <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Nómina total esta semana: <span style={{ color: "#059669" }}>{fmt(totalNomina)}</span></span>
                        <button onClick={registrarNomina} disabled={savingNomina}
                          style={{ padding: "10px 22px", borderRadius: "10px", border: "none", background: savingNomina ? "#9CA3AF" : "#3D1C1E", color: "#C8FF00", fontSize: "13px", fontWeight: "700", cursor: savingNomina ? "not-allowed" : "pointer" }}>
                          {savingNomina ? "Registrando..." : "Registrar Pago de Nómina"}
                        </button>
                      </div>
                    </>
                  )}
              </div>
            )}
          </div>

          {/* Historial de pagos */}
          <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: "8px" }}>
              <Clock style={{ width: "16px", height: "16px", color: "#3D1C1E" }} />
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>Historial de Pagos</span>
              <span style={{ fontSize: "12px", color: "#9CA3AF" }}>— últimos 3 meses</span>
            </div>
            <div style={{ padding: "8px 12px" }}>
              {historialAgrupado.length === 0
                ? <div style={{ padding: "24px", textAlign: "center", fontSize: "13px", color: "#9CA3AF" }}>Sin pagos registrados</div>
                : historialAgrupado.map((g, i) => (
                  <div key={i} className="nom-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: "10px", marginBottom: "2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#059669", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>Semana del {g.periodo}</div>
                        <div style={{ fontSize: "11px", color: "#9CA3AF" }}>Pagado el {new Date(g.fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>{fmt(g.total)}</span>
                      <CheckCircle style={{ width: "16px", height: "16px", color: "#059669" }} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EQUIPO ── */}
      {vista === "equipo" && (
        <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ padding: "12px 24px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC", display: "grid", gridTemplateColumns: "44px 1fr 110px 100px 80px 110px 130px" }}>
            {["", "Empleado", "Puesto", "Contrato", "IMSS", "Compliance", "Salario"].map(h => (
              <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.4px" }}>{h}</span>
            ))}
          </div>
          {emps.length === 0 && (
            <div style={{ padding: "40px", textAlign: "center", fontSize: "13px", color: "#9CA3AF" }}>
              No hay empleados registrados. Usa "Nuevo Empleado" para agregar.
            </div>
          )}
          {emps.map(e => {
            const cs = CONTRATO_CFG[e.tipo_contrato || "SIN_CONTRATO"] || CONTRATO_CFG["SIN_CONTRATO"];
            const isExp = exp === e.id;
            const sem = complianceSemaforo(e);
            const semLabel = sem === "verde" ? "Completo" : sem === "amarillo" ? "Pendiente" : "Urgente";
            const semColor = sem === "verde" ? "#059669" : sem === "amarillo" ? "#D97706" : "#DC2626";
            const semBg = sem === "verde" ? "#ECFDF5" : sem === "amarillo" ? "#FFFBEB" : "#FEF2F2";
            return (
              <div key={e.id}>
                <div className="nom-row" onClick={() => setExp(isExp ? null : e.id)}
                  style={{ display: "grid", gridTemplateColumns: "44px 1fr 110px 100px 80px 110px 130px", padding: "12px 24px", borderBottom: "1px solid #F9FAFB", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", display: "flex", alignItems: "center", justifyContent: "center", color: "#C8FF00", fontSize: "13px", fontWeight: "700" }}>{e.nombre.charAt(0)}</div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{e.nombre}</div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF" }}>Desde {new Date(e.fecha_ingreso + "T12:00:00").toLocaleDateString("es-MX", { month: "short", year: "numeric" })}</div>
                  </div>
                  <span style={{ fontSize: "12px", color: "#6B7280" }}>{e.puesto}</span>
                  <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "600", background: cs.bg, color: cs.text, border: "1px solid " + cs.border, width: "fit-content" }}>{cs.label}</span>
                  <span>{e.numero_imss ? <CheckCircle style={{ width: "16px", height: "16px", color: "#059669" }} /> : <AlertTriangle style={{ width: "16px", height: "16px", color: "#DC2626" }} />}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "700", background: semBg, color: semColor, width: "fit-content" }}>
                    {SEM_DOT[sem]} {semLabel}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{fmt(e.salario_base)}</span>
                    <button onClick={ev => { ev.stopPropagation(); iniciarEdicion(e); }} style={{ border: "none", background: "none", cursor: "pointer", padding: "2px" }} className="nom-btn"><Edit2 style={{ width: "13px", height: "13px", color: "#6B7280" }} /></button>
                    <button onClick={ev => { ev.stopPropagation(); eliminarEmpleado(e.id); }} style={{ border: "none", background: "none", cursor: "pointer", padding: "2px" }} className="nom-btn"><Trash2 style={{ width: "13px", height: "13px", color: "#DC2626" }} /></button>
                  </div>
                </div>

                {isExp && (
                  <div style={{ padding: "16px 24px 20px 68px", background: "#FAFBFC", borderBottom: "1px solid #F3F4F6" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "16px" }}>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", marginBottom: "8px" }}>Pago</div>
                        <div style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>Mensual: <strong>{fmt(e.salario_base)}</strong></div>
                        <div style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>Semanal: <strong>{fmt(e.salario_base / 4.33)}</strong></div>
                        <div style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>Diario: <strong>{fmt(e.salario_base / 30)}</strong></div>
                        <div style={{ fontSize: "13px", color: "#374151" }}>Cuenta: <strong>{e.cuenta_banco || "No registrada"}</strong></div>
                      </div>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", marginBottom: "8px" }}>Datos Personales</div>
                        <div style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>Contrato: <strong>{cs.label}</strong></div>
                        {e.fecha_nacimiento && <div style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>Nacimiento: <strong>{e.fecha_nacimiento}</strong></div>}
                      </div>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", marginBottom: "8px" }}>Documentos Legales</div>
                        <div style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>IMSS: <strong style={{ color: e.numero_imss ? "#059669" : "#DC2626" }}>{e.numero_imss || "NO REGISTRADO"}</strong></div>
                        <div style={{ fontSize: "13px", color: "#374151", marginBottom: "4px" }}>RFC: <strong>{e.rfc || "No registrado"}</strong></div>
                        <div style={{ fontSize: "13px", color: "#374151" }}>CURP: <strong>{e.curp || "No registrado"}</strong></div>
                      </div>
                    </div>
                    {/* Archivos */}
                    <div style={{ paddingTop: "12px", borderTop: "1px solid #E5E7EB" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#374151" }}>Archivos guardados ({e.documentos.length})</span>
                        <label style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", border: "1px dashed #D1D5DB", background: "#F9FAFB", fontSize: "11px", color: "#6B7280", cursor: "pointer", fontWeight: "600" }}>
                          <Plus style={{ width: "11px", height: "11px" }} /> Subir
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={ev => handleFileUpload(ev.target.files, e.id)} style={{ display: "none" }} />
                        </label>
                      </div>
                      {e.documentos.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {e.documentos.map(doc => (
                            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "6px", background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                              <a href={`/api/empleados/documentos/${doc.id}/archivo`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}>
                                <FileText style={{ width: "11px", height: "11px", color: "#1D4ED8" }} />
                                <span style={{ fontSize: "11px", fontWeight: "600", color: "#1D4ED8" }}>{doc.nombre}</span>
                                <span style={{ fontSize: "9px", color: "#60A5FA" }}>{doc.tipo}</span>
                              </a>
                              <button onClick={() => eliminarDocumento(doc.id)} style={{ border: "none", background: "none", cursor: "pointer", padding: "0", marginLeft: "2px" }}><X style={{ width: "10px", height: "10px", color: "#93C5FD" }} /></button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#9CA3AF" }}>Sin archivos adjuntos</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── COMPLIANCE LEGAL ── */}
      {vista === "legal" && (
        <div>
          {/* Contador resumen */}
          <div style={{ padding: "12px 16px", background: "#FFF", borderRadius: "12px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "#059669" }}>
              {emps.filter(e => complianceSemaforo(e) === "verde").length} empleados con documentación completa
            </span>
            <span style={{ color: "#E5E7EB" }}>·</span>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "#DC2626" }}>
              {emps.filter(e => complianceSemaforo(e) !== "verde").length} pendientes
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
            {emps.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", fontSize: "13px", color: "#9CA3AF", background: "#FFF", borderRadius: "14px" }}>No hay empleados registrados</div>
            )}
            {emps.map(e => {
              const sem = complianceSemaforo(e);
              const semColor = sem === "verde" ? "#059669" : sem === "amarillo" ? "#D97706" : "#DC2626";
              const semBorder = sem === "verde" ? "#A7F3D0" : sem === "amarillo" ? "#FDE68A" : "#FECACA";
              const semBg = sem === "verde" ? "#ECFDF5" : sem === "amarillo" ? "#FFFBEB" : "#FEF2F2";
              const checks: { label: string; ok: boolean; note: string; required: boolean }[] = [
                { label: "Contrato", ok: !!e.tipo_contrato && e.tipo_contrato !== "SIN_CONTRATO", note: e.tipo_contrato && e.tipo_contrato !== "SIN_CONTRATO" ? (CONTRATO_CFG[e.tipo_contrato]?.label || "firmado") : "sin contrato", required: true },
                { label: "IMSS", ok: !!e.numero_imss, note: e.numero_imss || "pendiente", required: true },
                { label: "RFC", ok: !!e.rfc, note: e.rfc || "pendiente", required: false },
                { label: "CURP", ok: !!e.curp, note: e.curp || "pendiente", required: false },
                { label: "INE / Doc", ok: e.documentos.length > 0, note: e.documentos.length > 0 ? `${e.documentos.length} archivo(s)` : "pendiente", required: false },
              ];
              return (
                <div key={e.id} style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", border: "1px solid " + semBorder }}>
                  <div style={{ padding: "14px 16px", background: semBg, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>{e.nombre}</div>
                      <div style={{ fontSize: "12px", color: "#6B7280" }}>{e.puesto}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {SEM_DOT[sem]}
                      <span style={{ fontSize: "11px", fontWeight: "700", color: semColor }}>
                        {sem === "verde" ? "Completo" : sem === "amarillo" ? "Faltan datos" : "Urgente"}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    {checks.map(c => (
                      <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F9FAFB" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px" }}>{c.ok ? "🟢" : c.required ? "🔴" : "🟡"}</span>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>{c.label}</span>
                          {c.required && !c.ok && <span style={{ fontSize: "10px", color: "#DC2626", fontWeight: "700" }}>REQUERIDO</span>}
                        </div>
                        <span style={{ fontSize: "11px", color: c.ok ? "#059669" : "#9CA3AF", fontWeight: c.ok ? "600" : "400" }}>
                          {c.ok ? "✓ " : "⚠ "}{c.note}
                        </span>
                      </div>
                    ))}
                    <button onClick={() => iniciarEdicion(e)}
                      style={{ marginTop: "10px", width: "100%", padding: "7px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", fontWeight: "600", color: "#374151", cursor: "pointer" }}>
                      Editar datos
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
