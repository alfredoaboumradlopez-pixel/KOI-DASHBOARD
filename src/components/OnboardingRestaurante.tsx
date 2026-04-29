import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";

// ── Helpers ────────────────────────────────────────────────────────────────
const toSlug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const CATS_DEFAULT = [
  "ABARROTES","BEBIDAS","PERSONAL","COMIDA PERSONAL","LIMPIEZA MANTTO",
  "DESECHABLES EMPAQUES","PRODUCTOS ASIATICOS","PROTEINA","VEGETALES FRUTAS",
  "MARKETING","MANTENIMIENTO","SERVICIOS","RENTA","LUZ","PAPELERIA",
  "EQUIPO","ESTACIONAMIENTO","PROPINAS","IMPUESTOS","NOMINA","OTROS",
];

interface Pago { concepto: string; proveedor: string; monto: string; dia: string }
interface Alerta { tipo: string; label: string; umbral: string; unidad: string }

const ALERTAS_DEFAULT: Alerta[] = [
  { tipo: "FOOD_COST",      label: "Food cost máximo",        umbral: "32", unidad: "%" },
  { tipo: "NOMINA_PCT",     label: "Nómina máxima",           umbral: "35", unidad: "% de ventas" },
  { tipo: "MARGEN_MINIMO",  label: "Margen mínimo",           umbral: "15", unidad: "%" },
  { tipo: "NOMINA_SEMANAL", label: "Nómina semanal estimada", umbral: "0",  unidad: "$" },
  { tipo: "DIA_IMPUESTOS",  label: "Día de pago de impuestos",umbral: "17", unidad: "día del mes" },
];

// ── Progress bar ───────────────────────────────────────────────────────────
const ProgressBar = ({ step, total }: { step: number; total: number }) => (
  <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "32px" }}>
    {Array.from({ length: total }, (_, i) => (
      <div key={i} style={{ flex: 1, height: "4px", borderRadius: "99px", background: i < step ? "#3D1C1E" : "#E5E7EB", transition: "background 0.3s" }} />
    ))}
    <span style={{ fontSize: "11px", color: "#9CA3AF", whiteSpace: "nowrap", marginLeft: "4px" }}>
      Paso {step} de {total}
    </span>
  </div>
);

// ── Confetti ───────────────────────────────────────────────────────────────
const Confetti = () => {
  const colors = ["#C8FF00","#3D1C1E","#059669","#F59E0B","#7C3AED","#EF4444","#3B82F6"];
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    size: 6 + Math.random() * 8,
  }));
  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity:1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity:0; }
        }
      `}</style>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 999, overflow: "hidden" }}>
        {pieces.map(p => (
          <div key={p.id} style={{
            position: "absolute", top: 0, left: `${p.left}%`,
            width: `${p.size}px`, height: `${p.size}px`,
            background: p.color, borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          }} />
        ))}
      </div>
    </>
  );
};

// ── Field component ────────────────────────────────────────────────────────
const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: "18px" }}>
    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#374151", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
    {children}
    {error && <p style={{ fontSize: "11px", color: "#EF4444", marginTop: "4px", margin: "4px 0 0" }}>{error}</p>}
  </div>
);

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: "10px",
  border: "1px solid #E5E7EB", fontSize: "14px", color: "#111827",
  outline: "none", boxSizing: "border-box", background: "#FFF",
};

// ── Main component ─────────────────────────────────────────────────────────
export const OnboardingRestaurante = () => {
  const { setCurrentRoute } = useStore();
  const [step, setStep] = useState(1);

  // Step 1
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [plan, setPlan] = useState("profesional");
  const [slugError, setSlugError] = useState("");
  const [slugChecking, setSlugChecking] = useState(false);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2
  const [adminNombre, setAdminNombre] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPwd, setAdminPwd] = useState("");
  const [adminPwd2, setAdminPwd2] = useState("");

  // Step 3
  const [cats, setCats] = useState<{ nombre: string; checked: boolean }[]>(
    CATS_DEFAULT.map(n => ({ nombre: n, checked: true }))
  );
  const [newCat, setNewCat] = useState("");

  // Step 4
  const [alertas, setAlertas] = useState<Alerta[]>(ALERTAS_DEFAULT);
  const [pagos, setPagos] = useState<Pago[]>([{ concepto: "", proveedor: "", monto: "", dia: "" }]);

  // Step 5 / creation
  const [creating, setCreating] = useState(false);
  const [createLog, setCreateLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [createdNombre, setCreatedNombre] = useState("");
  const [createError, setCreateError] = useState("");

  // ── Auto-slug ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slugManual) setSlug(toSlug(nombre));
  }, [nombre, slugManual]);

  // ── Slug debounce check ────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) { setSlugError(""); return; }
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    setSlugChecking(true);
    slugTimerRef.current = setTimeout(async () => {
      try {
        await api.get(`/api/restaurantes/${slug}`);
        setSlugError("Este slug ya está en uso");
      } catch {
        setSlugError("");
      }
      setSlugChecking(false);
    }, 500);
  }, [slug]);

  // ── Validations ────────────────────────────────────────────────────────
  const step1Valid = nombre.trim().length >= 2 && slug.length >= 2 && !slugError && !slugChecking;
  const step2Valid = adminNombre.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) && adminPwd.length >= 8 && adminPwd === adminPwd2;
  const step3Valid = cats.some(c => c.checked);

  // ── Creation sequence ──────────────────────────────────────────────────
  const crearRestaurante = async () => {
    setCreating(true);
    setCreateError("");
    const log: string[] = [];
    const addLog = (msg: string) => { log.push(msg); setCreateLog([...log]); };
    let restauranteId: number | null = null;
    let createdSlug = slug;

    try {
      addLog("Creando restaurante...");
      const r = await api.post("/api/restaurantes", { nombre: nombre.trim(), slug, plan, timezone: "America/Mexico_City" });
      restauranteId = r.id;
      addLog(`✓ Restaurante "${nombre}" creado (ID ${r.id})`);

      addLog("Creando usuario administrador...");
      await api.post(`/api/restaurantes/${slug}/usuarios`, {
        nombre: adminNombre.trim(), email: adminEmail.trim().toLowerCase(),
        password: adminPwd, rol: "ADMIN",
      });
      addLog(`✓ Admin ${adminEmail} creado`);

      const catsSelected = cats.filter(c => c.checked).map(c => c.nombre);
      addLog(`Creando ${catsSelected.length} categorías...`);
      let catsOk = 0;
      for (const nombre_cat of catsSelected) {
        try { await api.post("/api/categorias", { nombre: nombre_cat }); catsOk++; }
        catch { /* ya existe, ok */ catsOk++; }
      }
      addLog(`✓ ${catsOk} categorías configuradas`);

      addLog("Configurando alertas financieras...");
      const alertasPayload = alertas.map(a => ({ tipo: a.tipo, umbral: parseFloat(a.umbral) || 0 }));
      await api.post(`/api/restaurantes/${createdSlug}/alertas-config`, alertasPayload);
      addLog(`✓ ${alertas.length} alertas configuradas`);

      const pagosValidos = pagos.filter(p => p.concepto.trim() && parseFloat(p.monto) > 0);
      if (pagosValidos.length > 0) {
        addLog(`Creando ${pagosValidos.length} pagos recurrentes...`);
        for (const p of pagosValidos) {
          await api.post("/api/pagos-recurrentes", {
            concepto: p.concepto.trim(), proveedor: p.proveedor.trim() || p.concepto.trim(),
            categoria: "SERVICIOS", frecuencia: "MENSUAL",
            deadline_texto: p.dia ? `Día ${p.dia} de cada mes` : "Mensual",
            dia_limite: p.dia ? parseInt(p.dia) : null,
            monto_estimado: parseFloat(p.monto) || 0,
            restaurante_id: restauranteId,
          });
        }
        addLog(`✓ ${pagosValidos.length} pagos recurrentes creados`);
      }

      setCreatedNombre(nombre.trim());
      setDone(true);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.detail || e?.message || String(e);
      setCreateError(`Error: ${msg}`);
      addLog(`✗ ${msg}`);
    }
    setCreating(false);
  };

  // ── Step nav ───────────────────────────────────────────────────────────
  const next = () => { window.scrollTo({ top: 0, behavior: "smooth" }); setStep(s => s + 1); };
  const prev = () => { window.scrollTo({ top: 0, behavior: "smooth" }); setStep(s => s - 1); };

  // ── Done screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <>
        <Confetti />
        <div style={{ maxWidth: "560px", margin: "60px auto", textAlign: "center", padding: "0 24px" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>🎉</div>
          <h1 style={{ fontSize: "28px", fontWeight: "900", color: "#111827", marginBottom: "8px" }}>
            ¡{createdNombre} está listo!
          </h1>
          <p style={{ fontSize: "15px", color: "#6B7280", marginBottom: "32px" }}>
            El restaurante fue configurado con todo lo necesario para operar.
          </p>
          <button
            onClick={() => setCurrentRoute("/rbo")}
            style={{ padding: "14px 32px", borderRadius: "12px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "15px", fontWeight: "800", cursor: "pointer" }}
          >
            Ver en Panel RBO →
          </button>
        </div>
      </>
    );
  }

  // ── Creating screen ────────────────────────────────────────────────────
  if (creating || (createLog.length > 0 && !createError && !done)) {
    return (
      <div style={{ maxWidth: "560px", margin: "60px auto", padding: "0 24px" }}>
        <div style={{ background: "#FFF", borderRadius: "16px", padding: "32px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#111827", marginBottom: "24px", textAlign: "center" }}>
            Configurando tu restaurante...
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {createLog.map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: line.startsWith("✓") ? "#059669" : line.startsWith("✗") ? "#EF4444" : "#374151" }}>
                {creating && i === createLog.length - 1 && !line.startsWith("✓") && !line.startsWith("✗") ? (
                  <span style={{ width: "16px", height: "16px", border: "2px solid #3D1C1E", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                ) : null}
                {line}
              </div>
            ))}
          </div>
          {createError && (
            <div style={{ marginTop: "20px", padding: "12px 16px", background: "#FEF2F2", borderRadius: "10px", border: "1px solid #FECACA" }}>
              <p style={{ fontSize: "13px", color: "#DC2626", margin: 0 }}>{createError}</p>
              <button onClick={() => { setCreateLog([]); setCreateError(""); setCreating(false); }} style={{ marginTop: "8px", padding: "6px 14px", borderRadius: "8px", border: "none", background: "#DC2626", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                Volver e intentar de nuevo
              </button>
            </div>
          )}
        </div>
        <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Common card wrapper ────────────────────────────────────────────────
  const Card = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
    <div style={{ background: "#FFF", borderRadius: "16px", padding: "32px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", border: "1px solid #F3F4F6" }}>
      <h2 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginBottom: "4px" }}>{title}</h2>
      <p style={{ fontSize: "13px", color: "#9CA3AF", marginBottom: "28px" }}>{subtitle}</p>
      {children}
    </div>
  );

  const BtnRow = ({ onPrev, onNext, nextLabel = "Siguiente →", nextDisabled = false }: { onPrev?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", gap: "12px" }}>
      {onPrev ? (
        <button onClick={onPrev} style={{ padding: "11px 22px", borderRadius: "10px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>← Anterior</button>
      ) : <div />}
      <button onClick={onNext} disabled={nextDisabled} style={{ padding: "11px 24px", borderRadius: "10px", border: "none", background: nextDisabled ? "#E5E7EB" : "#3D1C1E", color: nextDisabled ? "#9CA3AF" : "#C8FF00", fontSize: "13px", fontWeight: "800", cursor: nextDisabled ? "not-allowed" : "pointer" }}>
        {nextLabel}
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "0 24px 120px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
        <button onClick={() => setCurrentRoute("/rbo")} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
          ← Panel RBO
        </button>
        <span style={{ fontSize: "18px", fontWeight: "800", color: "#111827" }}>Nuevo restaurante</span>
      </div>

      <ProgressBar step={step} total={5} />

      {/* ── PASO 1 ── */}
      {step === 1 && (
        <Card title="Datos del restaurante" subtitle="Información básica para identificar y configurar el sistema.">
          <Field label="Nombre del restaurante *">
            <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} placeholder="Ej: Quadrilátero Restaurante" autoFocus />
          </Field>

          <Field label="Slug (URL identificador) *" error={slugError}>
            <div style={{ position: "relative" }}>
              <input
                value={slug}
                onChange={e => { setSlug(toSlug(e.target.value)); setSlugManual(true); }}
                style={{ ...inputStyle, paddingRight: "90px", borderColor: slugError ? "#FCA5A5" : "#E5E7EB" }}
                placeholder="mi-restaurante"
              />
              <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: slugChecking ? "#9CA3AF" : slugError ? "#EF4444" : slug ? "#059669" : "#9CA3AF" }}>
                {slugChecking ? "verificando..." : slugError ? "✗ en uso" : slug ? "✓ disponible" : ""}
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px", margin: "4px 0 0" }}>Se auto-genera desde el nombre. Usa solo letras, números y guiones.</p>
          </Field>

          <Field label="Plan">
            <select value={plan} onChange={e => setPlan(e.target.value)} style={{ ...inputStyle }}>
              <option value="basico">Básico</option>
              <option value="profesional">Profesional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </Field>

          <BtnRow onNext={next} nextDisabled={!step1Valid} />
        </Card>
      )}

      {/* ── PASO 2 ── */}
      {step === 2 && (
        <Card title="Usuario administrador" subtitle="La persona que operará el sistema diariamente.">
          <Field label="Nombre completo *">
            <input value={adminNombre} onChange={e => setAdminNombre(e.target.value)} style={inputStyle} placeholder="Federico García" autoFocus />
          </Field>
          <Field label="Email *">
            <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} style={inputStyle} placeholder="federico@restaurante.com" />
          </Field>
          <Field label="Contraseña * (mín. 8 caracteres)" error={adminPwd.length > 0 && adminPwd.length < 8 ? "Mínimo 8 caracteres" : undefined}>
            <input type="password" value={adminPwd} onChange={e => setAdminPwd(e.target.value)} style={{ ...inputStyle, borderColor: adminPwd.length > 0 && adminPwd.length < 8 ? "#FCA5A5" : "#E5E7EB" }} />
          </Field>
          <Field label="Confirmar contraseña *" error={adminPwd2.length > 0 && adminPwd !== adminPwd2 ? "Las contraseñas no coinciden" : undefined}>
            <input type="password" value={adminPwd2} onChange={e => setAdminPwd2(e.target.value)} style={{ ...inputStyle, borderColor: adminPwd2.length > 0 && adminPwd !== adminPwd2 ? "#FCA5A5" : "#E5E7EB" }} />
          </Field>
          <div style={{ padding: "10px 14px", background: "#F3F4F6", borderRadius: "8px", fontSize: "12px", color: "#6B7280" }}>
            Rol: <strong>ADMIN</strong> — acceso completo al restaurante
          </div>
          <BtnRow onPrev={prev} onNext={next} nextDisabled={!step2Valid} />
        </Card>
      )}

      {/* ── PASO 3 ── */}
      {step === 3 && (
        <Card title="Categorías operativas" subtitle="Selecciona las categorías de gastos que usa tu restaurante. Puedes modificarlas después.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "16px" }}>
            {cats.map((cat, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "8px", border: `1px solid ${cat.checked ? "#3D1C1E" : "#E5E7EB"}`, background: cat.checked ? "#F9F5F0" : "#FFF", cursor: "pointer", fontSize: "12px", fontWeight: "600", color: cat.checked ? "#3D1C1E" : "#9CA3AF" }}>
                <input type="checkbox" checked={cat.checked} onChange={e => { const n = [...cats]; n[i].checked = e.target.checked; setCats(n); }} style={{ accentColor: "#3D1C1E" }} />
                {cat.nombre}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newCat.trim()) { setCats([...cats, { nombre: newCat.trim().toUpperCase(), checked: true }]); setNewCat(""); } }} style={{ ...inputStyle, flex: 1 }} placeholder="Nueva categoría..." />
            <button onClick={() => { if (newCat.trim()) { setCats([...cats, { nombre: newCat.trim().toUpperCase(), checked: true }]); setNewCat(""); } }} style={{ padding: "10px 16px", borderRadius: "10px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
              + Agregar
            </button>
          </div>
          <p style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "8px" }}>{cats.filter(c => c.checked).length} categorías seleccionadas</p>
          <BtnRow onPrev={prev} onNext={next} nextDisabled={!step3Valid} />
        </Card>
      )}

      {/* ── PASO 4 ── */}
      {step === 4 && (
        <Card title="Configuración financiera" subtitle="Umbrales de alertas y pagos fijos. Editables en cualquier momento.">
          <h3 style={{ fontSize: "13px", fontWeight: "800", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>Alertas automáticas</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
            {alertas.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "#FAFBFC", borderRadius: "10px", border: "1px solid #F3F4F6" }}>
                <span style={{ flex: 1, fontSize: "13px", color: "#374151" }}>{a.label}</span>
                <input
                  type="number"
                  value={a.umbral}
                  onChange={e => { const n = [...alertas]; n[i].umbral = e.target.value; setAlertas(n); }}
                  style={{ width: "80px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "14px", fontWeight: "700", textAlign: "right" }}
                />
                <span style={{ fontSize: "12px", color: "#9CA3AF", minWidth: "80px" }}>{a.unidad}</span>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: "13px", fontWeight: "800", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>Pagos recurrentes</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
            {pagos.map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr auto", gap: "6px", alignItems: "center" }}>
                <input value={p.concepto} onChange={e => { const n = [...pagos]; n[i].concepto = e.target.value; setPagos(n); }} style={{ ...inputStyle, padding: "8px 10px", fontSize: "12px" }} placeholder="Concepto (ej: Renta)" />
                <input value={p.proveedor} onChange={e => { const n = [...pagos]; n[i].proveedor = e.target.value; setPagos(n); }} style={{ ...inputStyle, padding: "8px 10px", fontSize: "12px" }} placeholder="Proveedor" />
                <input type="number" value={p.monto} onChange={e => { const n = [...pagos]; n[i].monto = e.target.value; setPagos(n); }} style={{ ...inputStyle, padding: "8px 10px", fontSize: "12px" }} placeholder="$Monto" />
                <input type="number" value={p.dia} onChange={e => { const n = [...pagos]; n[i].dia = e.target.value; setPagos(n); }} style={{ ...inputStyle, padding: "8px 10px", fontSize: "12px" }} placeholder="Día" min="1" max="31" />
                <button onClick={() => setPagos(pagos.filter((_, j) => j !== i))} style={{ padding: "8px", borderRadius: "8px", border: "1px solid #FEE2E2", background: "#FFF", color: "#EF4444", cursor: "pointer", fontSize: "13px" }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setPagos([...pagos, { concepto: "", proveedor: "", monto: "", dia: "" }])} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px dashed #D1D5DB", background: "#FFF", color: "#6B7280", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>
            + Agregar pago recurrente
          </button>

          <BtnRow onPrev={prev} onNext={next} />
        </Card>
      )}

      {/* ── PASO 5 ── */}
      {step === 5 && (
        <Card title="Confirmar y crear" subtitle="Revisa todo antes de continuar. Podrás editar estos datos después.">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
            {[
              { icon: "🏪", label: "Restaurante", value: nombre },
              { icon: "🔗", label: "Slug", value: slug },
              { icon: "📋", label: "Plan", value: plan },
              { icon: "👤", label: "Admin", value: `${adminNombre} <${adminEmail}>` },
              { icon: "🏷️", label: "Categorías", value: `${cats.filter(c => c.checked).length} categorías configuradas` },
              { icon: "🔔", label: "Alertas", value: `${alertas.length} umbrales configurados` },
              { icon: "💳", label: "Pagos fijos", value: `${pagos.filter(p => p.concepto.trim()).length} pagos recurrentes` },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "#F9FBF9", borderRadius: "10px", border: "1px solid #E8F5E9" }}>
                <span style={{ fontSize: "18px" }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.label}</div>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "#111827" }}>{item.value}</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: "16px", color: "#059669" }}>✓</span>
              </div>
            ))}
          </div>
          <BtnRow onPrev={prev} onNext={crearRestaurante} nextLabel="✓ Crear restaurante" />
        </Card>
      )}
    </div>
  );
};
