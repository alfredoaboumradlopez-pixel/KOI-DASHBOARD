/**
 * RestauranteContext
 *
 * Provides restaurante_id, nombre, slug to any descendant component.
 * Used by RestauranteDashboard to scope all sub-modules (CierreTurno,
 * CapturaGastos, Nomina, Tesoreria) to a specific restaurant when a
 * SUPER_ADMIN is viewing a restaurant's detail page.
 *
 * For regular users (not wrapped in RestauranteProvider), useRestaurante()
 * falls back to authUser.restaurante_id automatically — no behaviour change.
 */
import { createContext, useContext, ReactNode } from "react";
import { useStore } from "../store/useStore";

export interface RestauranteContextValue {
  /** null = "no override — use authUser.restaurante_id" */
  restauranteId: number | null;
  nombre: string;
  slug: string;
}

const RestauranteContext = createContext<RestauranteContextValue>({
  restauranteId: null,
  nombre: "",
  slug: "",
});

export const RestauranteProvider = ({
  value,
  children,
}: {
  value: RestauranteContextValue;
  children: ReactNode;
}) => (
  <RestauranteContext.Provider value={value}>
    {children}
  </RestauranteContext.Provider>
);

/**
 * Returns resolved restauranteId (never null).
 * Priority: context override → authUser.restaurante_id → fallback 1
 */
export const useRestaurante = (): {
  restauranteId: number;
  nombre: string;
  slug: string;
} => {
  const ctx = useContext(RestauranteContext);
  const { authUser } = useStore();
  return {
    restauranteId: ctx.restauranteId ?? authUser?.restaurante_id ?? 1,
    nombre: ctx.nombre || authUser?.nombre || "KOI",
    slug: ctx.slug || "koi",
  };
};
