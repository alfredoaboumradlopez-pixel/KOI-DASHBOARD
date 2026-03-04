import { useState, useEffect, useMemo } from "react";
import { Search, Filter, FileText, AlertTriangle, CheckCircle, Clock, ChevronDown, X, Receipt, TrendingDown, Banknote } from "lucide-react";

// ============================================================
// ENDPOINT REFERENCE (para FastAPI backend):
// GET /api/facturas?q={search}&status={status}&date_range={range}&min_amount={min}&max_amount={max}
// Response esperado: { facturas: Factura[], total: number, total_monto: number }
// ============================================================

interface Factura {
  id: number;
  fecha: string;
  proveedor: string;
  categoria: string;
  concepto: string;
  estatus: "PENDIENTE" | "PAGADO" | "CON_DISCREPANCIA";
  monto: number;
  metodo_pago?: string;
  referencia?: string;
}

const MOCK_FACTURAS: Factura[] = [
  { id: 1, fecha: "2026-03-03", proveedor: "Distribuidora del Pacífico", categoria: "COMPRAS_INSUMOS", concepto: "Atúfresco y salmón", estatus: "PAGADO", monto: 14739.00, metodo_pago: "SPEI", referencia: "FMI50297" },
  { id: 2, fecha: "2026-03-03", proveedor: "Verduras Premium MX", categoria: "COMPRAS_INSUMOS", concepto: "Aguacate, pepino, edamame", estatus: "PENDIENTE", monto: 5938.00, referencia: "FMI49900" },
  { id: 3, fecha: "2026-03-02", proveedor: "Clip Terminales", categoria: "SERVICIOS", concepto: "Comisión terminales febrero", estatus: "PAGADO", monto: 4814.67, metodo_pago: "Transferencia", referencia: "CLIP-0302" },
  { id: 4, fecha: "2026-03-01", proveedor: "Gas Natural MX", categoria: "SERVICIOS", concepto: "Gas cocina marzo", estatus: "CON_DISCREPANCIA", monto: 3138.00, referencia: "A16159" },
  { id: 5, fecha: "2026-02-27", proveedor: "Nómina Staff", categoria: "NOMINA", concepto: "Nómina semanal cocineros", estatus: "PAGADO", monto: 16932.00, metodo_pago: "SPEI", referencia: "NOM-0227" },
  { id: 6, fecha: "2026-02-26", proveedor: "Uber Eats México", categoria: "SERVICIOS", concepto: "Comisión platafebrero", estatus: "PENDIENTE", monto: 8245.50 },
  { id: 7, fecha: "2026-02-25", proveedor: "La Costeña Empaques", categoria: "COMPRAS_INSUMOS", concepto: "Contenedores biodegradables", estatus: "PAGADO", monto: 2814.00, metodo_pago: "SPEI", referencia: "FMI50505" },
  { id: 8, fecha: "2026-02-24", proveedor: "Rappi Pagos", categoria: "SERVICIOS", concepto: "Comisión delivery semana 8", estatus: "PAGADO", monto: 1483.00, metodo_pago: "Transferencia", referencia: "RPP-2402" },
  { id: 9, fecha: "2026-02-24", proveedor: "Distribuidora del Pacífico", categoria: "COMPRAS_INSUMOS", concepto: "Pulpo, camarón, surimi", estatus: "PENDIENTE", monto: 44544.00, referencia: "FMI50600" },
  { id: 10, fecha: "2026-02-23", proveedor: "Limpieza Industrial MX", categoria: "LIMPIEZA", concepto: "Productos limpieza mensual", estatus: "PAGADO", monto: 776.80, metodo_pago: "SPEI", referencia: "A16092" },
  { id: 11, fecha: "2026-02-20", proveedor: "Arroz y Granos SA", categoria: "COMPRAS_INSUMOS", concepto: "Arroz sushi prm 50kg", estatus: "CON_DISCREPANCIA", monto: 9992.00, referencia: "I537" },
  { id: 12, fecha: "2026-02-17", proveedor: "Santander México", categoria: "SERVICIOS", concepto: "Renta terminal punto de venta", estatus: "PAGADO", monto: 810.84, metodo_pago: "Cargo automático", referencia: "TPV-9897548" },
];

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const CATEGORIAS_LABEL: Record<string, string> = {
  COMPRAS_INSUMOS: "Insumos", SERVICIOS: "Servicios", NOMINA: "Nómina",
  LIMPIEZA: "Limpieza", MANTENIMIENTO: "Mantenimiento", OTROS: "Otros",
};

const CATEGORIA_COLORS: Record<string, { bg: string; text: string }> = {
  COMPRAS_INSUMOS: { bg: "#FFF7ED", text: "#C2410C" },
  SERVICIOS: { bg: "#EFF6FF", text: "#1D4ED8" },
  NOMINA: { bg: "#F0FDF4", text: "#15803D" },
  LIMPIEZA: { bg: "#FDF4FF", text: "#7E22CE" },
  MANTENIMIENTO: { bg: "#FEF2F2", text: "#DC2626" },
  OTROS: { bg: "#F8FAFC", text: "#475569" },
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const STATUS_CONFIG = {
  PAGADO: { label: "Pagado", bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0", icon: CheckCircle },
  PENDIENTE: { label: "Pendiente", bg: "#FFFBEB", text: "#92400E", border: "#FDE68A", icon: Clock },
  CON_DISCREPANCIA: { label: "Discrepancia", bg: "#FEF2F2", text: "#991B1B", border: "#FECACA", icon: AlertTriangle },
};

export const InvoiceFinder = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [dateRange, setDateRange] = useState("all");
  const [montoRange, setMontoRange] = useState("all");
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 500);

  const filtered = useMemo(() => {
    let results = [...MOCK_FACTURAS];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      results = results.filter(f => f.proveedor.toLowerCase().includes(q) || f.concepto.toLowerCase().includes(q) || (f.referencia && f.referencia.toLowerCase().includes(q)));
    }
    if (statusFilter !== "TODOS") results = results.filter(f => f.estatus === statusFilter);
    if (dateRange !== "all") {
      const now = new Date();
      let start = new Date();
      if (dateRange === "this_week") { start.setDate(now.getDate() - 7); }
      else if (dateRange === "this_month") { start = new Date(now.getFullYear(), now.getMonth(), 1); }
      else if (dateRange === "last_month") {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        results = results.filter(f => { const d = new Date(f.fecha); return d >= start && d <= end; });
        return results;
      }
      results = results.filter(f => new Date(f.fecha) >= start);
    }
    if (montoRange === "lt1000") results = results.filter(f => f.monto < 1000);
    else if (montoRange === "1000_5000") results = results.filter(f => f.monto >= 1000 && f.monto <= 5000);
    else if (montoRange === "5000_20000") results = results.filter(f => f.monto >= 5000 && f.monto <= 20000);
    else if (montoRange === "gt20000") results = results.filter(f => f.monto > 20000);
    return results;
  }, [debouncedSearch, statusFilter, dateRange, montoRange]);

  const totalMonto = filtered.reduce((s, f) => s + f.monto, 0);
  const pendientes = filtered.filter(f => f.estatus === "PENDIENTE").length;
  const discrepancias = filtered.filter(f => f.estatus === "CON_DISCREPANCIA").length;

  const clearFilters = () => { setSearch(""); setStatusFilter("TODOS"); setDateRange("all"); setMontoRange("all"); };
  const hasFilters = search || statusFilter !== "TODOS" || dateRange !== "all" || montoRange !== "all";

  const SelectDropdown = ({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; }) => {
    const isOpen = activeDropdown === id;
    const selected = options.find(o => o.value === value);
    return (
      <div style={{ position: "relative" }}>
        <button onClick={() => setActiveDropdown(isOpen ? null : id)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", border: "1px solid #E5E7EB", background: value !== options[0].value ? "#3D1C1E" : "#FFF", color: value !== options[0].value ? "#FFF" : "#374151", fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const }}>
          {selected?.label || label}
          <ChevronDown style={{ width: "14px", height: "14px", opacity: 0.6, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        {isOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setActiveDropdown(null)} />
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "#FFF", borderRadius: "12px", padding: "4px", boxShadow: "0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)", border: "1px solid #F3F4F6", minWidth: "180px", animation: "fadeIn 0.15s ease" }}>
              {options.map(opt => (
                <button key={opt.value} onClick={() => { onChange(opt.value); setActiveDropdown(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: "8px", border: "none", background: value === opt.value ? "#F9FAFB" : "transparent", color: value === opt.value ? "#3D1C1E" : "#374151", fontWeight: value === opt.value ? "600" : "400", fontSize: "13px", cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = "#F9FAFB"; }} onMouseLeave={e => { if (value !== opt.value) e.currentTarget.style.background = "transparent"; }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .finder-row { transition: background 0.1s; }
        .finder-row:hover { background: #FAFBFC !important; }
      `}</style>

      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #3D1C1E 0%, #5C2D30 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Receipt style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0, letterSpacing: "-0.02em" }}>Smart Finder</h1>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Buscador inteligente de facturas y tickets</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "Resultados", value: String(filtered.length), sub: "de " + MOCK_FACTURAS.length, icon: FileText, color: "#3D1C1E" },
          { label: "Monto Total", value: formatMXN(totalMonto), sub: "filtrado", icon: Banknote, color: "#059669" },
          { label: "Pendientes", value: String(pendientes), sub: "por pagar", icon: TrendingDown, color: "#D97706" },
          { label: "Discrepancias", value: String(discrepancias), sub: "revisar", icon: AlertTriangle, color: "#DC2626" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={i} style={{ background: "#FFF", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)", animation: "slideUp 0.3s ease " + (i * 0.05) + "s both" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{kpi.label}</span>
                <Icon style={{ width: "16px", height: "16px", color: kpi.color, opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginTop: "8px", letterSpacing: "-0.02em" }}>{kpi.value}</div>
              <span style={{ fontSize: "11px", color: "#9CA3AF" }}>{kpi.sub}</span>
            </div>
          );
        })}
      </div>

      <div style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" as const }}>
          <div style={{ flex: 1, minWidth: "260px", display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderRadius: "12px", background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
            <Search style={{ width: "18px", height: "18px", color: "#9CA3AF", flexShrink: 0 }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por proveedor, concepto o referencia..." style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: "14px", color: "#111827" }} />
            {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", padding: "2px" }}><X style={{ width: "16px", height: "16px", color: "#9CA3AF" }} /></button>}
          </div>
          <div style={{ width: "1px", height: "28px", background: "#E5E7EB" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Filter style={{ width: "15px", height: "15px", color: "#9CA3AF" }} />
            <SelectDropdown id="date" label="Fecha" value={dateRange} onChange={setDateRange} options={[{ value: "all", label: "Todas las fechas" }, { value: "this_week", label: "Esta semana" }, { value: "this_month", label: "Este mes" }, { value: "last_month", label: "Mes anterior" }]} />
            <SelectDropdown id="status" label="Estatus" value={statusFilter} onChange={setStatusFilter} options={[{ value: "TODOS", label: "Todos" }, { value: "PENDIENTE", label: "Pendientes" }, { value: "PAGADO", label: "Pagados" }, { value: "CON_DISCREPANCIA", label: "Con discrepancia" }]} />
            <SelectDropdown id="monto" label="Monto" value={montoRange} onChange={setMontoRange} options={[{ value: "all", label: "Todos los montos" }, { value: "lt1000", label: "Menor a $1,000" }, { value: "1000_5000", label: "$1,000 - $5,000" }, { value: "5000_20000", label: "$5,000 - $20,000" }, { value: "gt20000", label: "Mayor a $20,000" }]} />
          </div>
          {hasFilters && <button onClick={clearFilters} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px", borderRadius: "10px", border: "none", background: "#FEF2F2", color: "#DC2626", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}><X style={{ width: "14px", height: "14px" }} />Limpiar</button>}
        </div>
      </div>

      <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 120px 130px 140px", padding: "12px 24px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
          {["Fecha", "Proveedor / Concepto", "Categoría", "Estatus", "Monto"].map(h => (
            <span key={h} style={{ fontSize: "11px", fontWeight: "70", color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" as const }}>
            <Search style={{ width: "40px", height: "40px", color: "#D1D5DB", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "15px", fontWeight: "600", color: "#6B7280" }}>Sin resultados</p>
            <p style={{ fontSize: "13px", color: "#9CA3AF", marginTop: "4px" }}>Intenta con otros filtros o términos de búsqueda</p>
          </div>
        ) : (
          filtered.map((f, i) => {
            const status = STATUS_CONFIG[f.estatus];
            const StatusIcon = status.icon;
            const catColor = CATEGORIA_COLORS[f.categoria] || CATEGORIA_COLORS.OTROS;
            return (
              <div key={f.id} className="finder-row" style={{ display: "grid", gridTemplateColumns: "110px 1fr 120px 130px 140px", padding: "14px 24px", borderBottom: "1pxolid #F9FAFB", alignItems: "center", animation: "slideUp 0.25s ease " + (i * 0.03) + "s both", cursor: "pointer" }}>
                <div>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>{new Date(f.fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                  <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{new Date(f.fecha + "T12:00:00").getFullYear()}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{f.proveedor}</div>
                  <div style={{ fontSize: "12px", color: "#9CA3AF", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", marginTop: "1px" }}>
                    {f.concepto}{f.referencia && <span style={{ marginLeft: "6px", color: "#C4B5FD", fontFamily: "monospace", fontSize: "11px" }}>#{f.referencia}</span>}
                  </div>
                </div>
                <div><span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "600", background: catColor.bg, color: catColor.text }}>{CATEGORIAS_LABEL[f.categoria] || f.categoria}</span></div>
                <div><span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", background: status.bg, color: status.text, border: "1px solid " + status.border }}><StatusIcon style={{ width: "12px", height: "12px" }} />{status.label}</span></div>
                <div style={{ textAlign: "right" as const }}>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827", fontFeatureSettings: "'tnum'", letterSpacing: "-0.01em" }}>{formatMXN(f.monto)}</span>
                  {f.metodo_pago && <div style={{ fontSize: "10px", color: "#9CA3AF", marginTop: "2px" }}>{f.metodo_pago}</div>}
                </div>
              </div>
            );
          })
        )}

        {filtered.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "#FAFBFC", borderTop: "1px solid #F3F4F6" }}>
            <span style={{ fontSize: "12px", color: "#9CA3AF" }}>{filtered.length} factura{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}</span>
            <span style={{ fontSize: "14px", fontWeight: "800", color: "#3D1C1E" }}>Total: {formatMXN(totalMonto)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
