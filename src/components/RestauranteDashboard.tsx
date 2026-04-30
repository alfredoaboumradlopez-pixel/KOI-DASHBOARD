/**
 * RestauranteDashboard
 *
 * Renderiza el dashboard completo de un restaurante específico cuando
 * SUPER_ADMIN hace click en una fila del Panel RBO.
 *
 * Ruta: /rbo/restaurante/:slug  (ej. /rbo/restaurante/koi)
 *
 * - Lee el slug de currentRoute
 * - Resuelve restaurante_id via GET /api/restaurantes/:slug
 * - Muestra una barra de módulos horizontal con los 6 módulos operativos
 * - Cada módulo reutiliza los componentes existentes pasándoles
 *   restauranteIdOverride donde es necesario
 */
import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useStore } from "../store/useStore";
import {
  LayoutDashboard,
  ClipboardList,
  Receipt,
  Tag,
  Users,
  Wallet,
  BarChart2,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Calculator,
  ChefHat,
} from "lucide-react";

// Sub-componentes reutilizados
import { PLDashboard } from "./PLDashboard";
import { DashboardGastos } from "./DashboardGastos";
import { CategorizarGastos } from "./CategorizarGastos";
import { CierreTurno } from "./CierreTurno";
import { CapturaGastos } from "./CapturaGastos";
import { Nomina } from "./Nomina";
import { Tesoreria } from "./Tesoreria";
import { Fiscal } from "./Fiscal";
import { Costeo } from "./Costeo";
import { Propinas } from "./Propinas";
import { RestauranteProvider } from "../context/RestauranteContext";

type SubModule =
  | "dashboard"
  | "cierre-turno"
  | "gastos"
  | "dashboard-gastos"
  | "categorizar"
  | "nomina"
  | "propinas"
  | "tesoreria"
  | "fiscal"
  | "costeo";

const MODULOS: { key: SubModule; label: string; icon: any; badgeKey?: string }[] = [
  { key: "dashboard",         label: "Dashboard",            icon: LayoutDashboard },
  { key: "cierre-turno",      label: "Cierre de Turno",      icon: ClipboardList },
  { key: "gastos",            label: "Gastos & Proveedores", icon: Receipt },
  { key: "dashboard-gastos",  label: "Dashboard Gastos",     icon: BarChart2, badgeKey: "alertas" },
  { key: "categorizar",       label: "Categorizar gastos",   icon: Tag },
  { key: "nomina",            label: "Nómina",               icon: Users },
  { key: "propinas",          label: "Propinas",             icon: Wallet },
  { key: "tesoreria",         label: "Calendario Pagos",     icon: Wallet },
  { key: "fiscal",            label: "Fiscal",               icon: Calculator },
  { key: "costeo",            label: "Costeo & Menú",        icon: ChefHat },
];

export const RestauranteDashboard = () => {
  const { currentRoute, setCurrentRoute } = useStore();

  // Extraer slug de la ruta: "/rbo/restaurante/koi" → "koi"
  const slug = currentRoute.split("/")[3] ?? "";

  const [restaurante, setRestaurante] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subModule, setSubModule] = useState<SubModule>("dashboard");
  const [alertasGastos, setAlertasGastos] = useState(0);
  const [sinCategorizar, setSinCategorizar] = useState(0);
  const [hoveredDock, setHoveredDock] = useState<SubModule | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("Slug de restaurante no encontrado en la URL");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api
      .get(`/api/restaurantes/${slug}`)
      .then((r: any) => {
        setRestaurante(r);
        setLoading(false);
        // Cargar conteo de alertas de gastos para el mes actual
        const hoy = new Date();
        api
          .get(`/api/gastos/dashboard/${r.id}?mes=${hoy.getMonth() + 1}&anio=${hoy.getFullYear()}`)
          .then((d: any) => setAlertasGastos(d?.alertas_gastos?.length ?? 0))
          .catch(() => {});
      })
      .catch((e: any) => {
        setError(
          `No se pudo cargar el restaurante "${slug}": ${e?.message ?? "error desconocido"}`
        );
        setLoading(false);
      });
  }, [slug]);

  useEffect(() => {
    if (!restaurante) return;
    api.get(`/api/gastos/sin-categorizar/${restaurante.id}`)
      .then((d: any) => setSinCategorizar(d?.count ?? d?.total ?? 0))
      .catch(() => {});
  }, [restaurante]);

  // ── Estado de carga ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "300px",
          gap: "12px",
          color: "#9CA3AF",
          fontSize: "13px",
        }}
      >
        <RefreshCw
          style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }}
        />
        Cargando restaurante {slug}…
        <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Error al resolver slug ───────────────────────────────────────────────
  if (error || !restaurante) {
    return (
      <div
        style={{
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          borderRadius: "12px",
          padding: "24px",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
          maxWidth: "600px",
        }}
      >
        <AlertCircle
          style={{ width: "20px", height: "20px", color: "#DC2626", flexShrink: 0 }}
        />
        <div>
          <div
            style={{ fontSize: "14px", fontWeight: "700", color: "#DC2626", marginBottom: "4px" }}
          >
            Restaurante no encontrado
          </div>
          <div style={{ fontSize: "13px", color: "#EF4444" }}>
            {error || `No existe ningún restaurante con slug "${slug}"`}
          </div>
          <button
            onClick={() => setCurrentRoute("/rbo")}
            style={{
              marginTop: "12px",
              padding: "6px 14px",
              borderRadius: "8px",
              border: "1px solid #FECACA",
              background: "#FFF",
              color: "#DC2626",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            ← Volver al Panel RBO
          </button>
        </div>
      </div>
    );
  }

  const restauranteId: number = restaurante.id;

  // ── Render principal ─────────────────────────────────────────────────────
  return (
    <RestauranteProvider value={{ restauranteId, nombre: restaurante.nombre, slug }}>
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={() => setCurrentRoute("/rbo")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid #E5E7EB",
            background: "#FFF",
            color: "#6B7280",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#F9FAFB";
            e.currentTarget.style.color = "#374151";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#FFF";
            e.currentTarget.style.color = "#6B7280";
          }}
        >
          <ArrowLeft style={{ width: "13px", height: "13px" }} />
          Panel RBO
        </button>

        <span style={{ color: "#D1D5DB", fontSize: "14px" }}>/</span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "linear-gradient(135deg,#C8FF00,#A0D000)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{ fontSize: "13px", fontWeight: "900", color: "#3D1C1E" }}
            >
              {restaurante.nombre?.[0] ?? "R"}
            </span>
          </div>
          <div>
            <span
              style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}
            >
              {restaurante.nombre}
            </span>
            <span
              style={{
                marginLeft: "8px",
                padding: "2px 8px",
                borderRadius: "6px",
                fontSize: "10px",
                fontWeight: "600",
                background: "#F3F4F6",
                color: "#6B7280",
              }}
            >
              ID {restauranteId} · {restaurante.plan}
            </span>
          </div>
        </div>
      </div>

      {/* ── Contenido del módulo seleccionado ──────────────────────── */}
      <div style={{ paddingBottom: "100px" }}>
        {subModule === "dashboard" && (
          <PLDashboard restauranteIdOverride={restauranteId} />
        )}
        {subModule === "cierre-turno" && <CierreTurno />}
        {subModule === "gastos" && <CapturaGastos />}
        {subModule === "dashboard-gastos" && (
          <DashboardGastos restauranteIdOverride={restauranteId} />
        )}
        {subModule === "categorizar" && (
          <CategorizarGastos restauranteIdOverride={restauranteId} />
        )}
        {subModule === "nomina" && <Nomina />}
        {subModule === "propinas" && <Propinas />}
        {subModule === "tesoreria" && <Tesoreria />}
        {subModule === "fiscal" && <Fiscal />}
        {subModule === "costeo" && (
          <Costeo restauranteIdOverride={restauranteId} />
        )}
      </div>

      {/* ── Dock flotante inferior ──────────────────────────────────── */}
      <style>{`
        .koi-dock-item { position: relative; display: flex; flex-direction: column; align-items: center; padding: 8px 12px; border-radius: 12px; cursor: pointer; transition: transform 0.2s ease, background 0.15s ease; min-width: 56px; border: none; background: transparent; }
        .koi-dock-item:hover { transform: translateY(-4px); background: rgba(255,255,255,0.08); }
        .koi-dock-item.active { background: #1a1a1a; }
        .koi-dock-tooltip { position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); background: #1a1a1a; color: white; padding: 4px 10px; border-radius: 8px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.15s; z-index: 10; }
        .koi-dock-item:hover .koi-dock-tooltip { opacity: 1; }
        @media (max-width: 768px) { .koi-dock { left: 0 !important; right: 0 !important; transform: none !important; bottom: 0 !important; border-radius: 16px 16px 0 0 !important; max-width: 100% !important; overflow-x: auto; justify-content: flex-start; } }
      `}</style>
      <div
        className="koi-dock"
        style={{
          position: "fixed",
          bottom: "20px",
          left: "calc(50% + 130px)",
          transform: "translateX(-50%)",
          background: "rgba(30,30,30,0.96)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
          padding: "8px 12px",
          display: "flex",
          gap: "2px",
          zIndex: 100,
          maxWidth: "700px",
        }}
      >
        {([
          { key: "dashboard",        label: "Dashboard",    shortLabel: "Dashboard",  emoji: "📊" },
          { key: "cierre-turno",     label: "Cierre de Turno", shortLabel: "Cierre", emoji: "📋" },
          { key: "gastos",           label: "Gastos",       shortLabel: "Gastos",     emoji: "💰" },
          { key: "dashboard-gastos", label: "Análisis",     shortLabel: "Análisis",   emoji: "📈" },
          { key: "categorizar",      label: "Categorizar",  shortLabel: "Categ.",     emoji: "🏷️", badge: true },
          { key: "nomina",           label: "Nómina",       shortLabel: "Nómina",     emoji: "👥" },
          { key: "propinas",         label: "Propinas",     shortLabel: "Propinas",   emoji: "💵" },
          { key: "tesoreria",        label: "Pagos",        shortLabel: "Pagos",      emoji: "📅" },
          { key: "fiscal",           label: "Fiscal",       shortLabel: "Fiscal",     emoji: "🏛️" },
          { key: "costeo",           label: "Costeo & Menú", shortLabel: "Costeo",   emoji: "🍽️" },
        ] as { key: SubModule; label: string; shortLabel: string; emoji: string; badge?: boolean }[]).map((m) => {
          const active = subModule === m.key;
          const badgeCount = m.badge ? sinCategorizar : 0;
          return (
            <button
              key={m.key}
              className={`koi-dock-item${active ? " active" : ""}`}
              onClick={() => {
                setSubModule(m.key);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span style={{ fontSize: "22px", lineHeight: 1 }}>{m.emoji}</span>
              <span style={{ fontSize: "10px", marginTop: "4px", fontWeight: "500", color: active ? "#C8FF00" : "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{m.shortLabel}</span>
              <span className="koi-dock-tooltip">{m.label}</span>
              {badgeCount > 0 && (
                <span style={{ position: "absolute", top: "4px", right: "6px", background: "#ef4444", color: "white", fontSize: "9px", fontWeight: "700", padding: "1px 5px", borderRadius: "10px", minWidth: "16px", textAlign: "center" }}>{badgeCount}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
    </RestauranteProvider>
  );
};
