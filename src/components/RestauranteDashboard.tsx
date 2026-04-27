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
  ArrowLeft,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

// Sub-componentes reutilizados
import { PLDashboard } from "./PLDashboard";
import { CategorizarGastos } from "./CategorizarGastos";
import { CierreTurno } from "./CierreTurno";
import { CapturaGastos } from "./CapturaGastos";
import { Nomina } from "./Nomina";
import { Tesoreria } from "./Tesoreria";
import { RestauranteProvider } from "../context/RestauranteContext";

type SubModule =
  | "dashboard"
  | "cierre-turno"
  | "gastos"
  | "categorizar"
  | "nomina"
  | "tesoreria";

const MODULOS: { key: SubModule; label: string; icon: any }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "cierre-turno", label: "Cierre de Turno", icon: ClipboardList },
  { key: "gastos", label: "Gastos & Proveedores", icon: Receipt },
  { key: "categorizar", label: "Categorizar gastos", icon: Tag },
  { key: "nomina", label: "Nómina", icon: Users },
  { key: "tesoreria", label: "Calendario Pagos", icon: Wallet },
];

export const RestauranteDashboard = () => {
  const { currentRoute, setCurrentRoute } = useStore();

  // Extraer slug de la ruta: "/rbo/restaurante/koi" → "koi"
  const slug = currentRoute.split("/")[3] ?? "";

  const [restaurante, setRestaurante] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subModule, setSubModule] = useState<SubModule>("dashboard");

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
      })
      .catch((e: any) => {
        setError(
          `No se pudo cargar el restaurante "${slug}": ${e?.message ?? "error desconocido"}`
        );
        setLoading(false);
      });
  }, [slug]);

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

      {/* ── Barra de módulos horizontal ───────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          background: "#FFF",
          borderRadius: "12px",
          padding: "6px",
          marginBottom: "20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          overflowX: "auto" as const,
          flexWrap: "nowrap" as const,
        }}
      >
        {MODULOS.map((m) => {
          const Icon = m.icon;
          const active = subModule === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setSubModule(m.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: active ? "700" : "500",
                background: active ? "#3D1C1E" : "transparent",
                color: active ? "#C8FF00" : "#6B7280",
                transition: "all 0.15s",
                whiteSpace: "nowrap" as const,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "#F3F4F6";
                  e.currentTarget.style.color = "#374151";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#6B7280";
                }
              }}
            >
              <Icon style={{ width: "14px", height: "14px", flexShrink: 0 }} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Contenido del módulo seleccionado ──────────────────────── */}

      {subModule === "dashboard" && (
        <PLDashboard restauranteIdOverride={restauranteId} />
      )}

      {subModule === "cierre-turno" && <CierreTurno />}

      {subModule === "gastos" && <CapturaGastos />}

      {subModule === "categorizar" && (
        <CategorizarGastos restauranteIdOverride={restauranteId} />
      )}

      {subModule === "nomina" && <Nomina />}

      {subModule === "tesoreria" && <Tesoreria />}
    </div>
    </RestauranteProvider>
  );
};
