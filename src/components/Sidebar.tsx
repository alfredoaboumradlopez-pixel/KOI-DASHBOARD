import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { LayoutDashboard, ClipboardList, Receipt, Wallet, FileText, Users, BarChart3, Tag, LogOut, Building2, Plus, Calculator } from 'lucide-react';
import { api } from '../services/api';

/** Semáforo color based on active alertas */
function getSemaforoColor(alertas: any[]): string {
  if (!Array.isArray(alertas) || alertas.length === 0) return '#22C55E'; // verde
  if (alertas.some((a: any) => a.severidad === 'CRITICAL')) return '#EF4444'; // rojo
  return '#F59E0B'; // amarillo
}

/** Shared nav button used by both SUPER_ADMIN and regular menus */
const NavBtn: React.FC<{ path: string; icon: any; label: string; badge?: number }> = ({ path, icon: Icon, label, badge }) => {
  const { currentRoute, setCurrentRoute } = useStore();
  const isActive = currentRoute === path || (path !== '/' && currentRoute.startsWith(path));
  return (
    <button
      onClick={() => setCurrentRoute(path)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '2px', border: 'none', cursor: 'pointer', borderRadius: '8px', fontSize: '13px', borderLeft: isActive ? '3px solid #C8FF00' : '3px solid transparent', fontWeight: isActive ? '600' : '400', transition: 'all 0.15s ease', background: isActive ? 'rgba(200,255,0,0.1)' : 'transparent', color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; } }}
    >
      <Icon style={{ width: '18px', height: '18px', opacity: isActive ? 1 : 0.7, flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: 'left' as const }}>{label}</span>
      {badge !== undefined && (
        <span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#DC2626', color: '#FFF' }}>{badge}</span>
      )}
      {isActive && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C8FF00' }} />}
    </button>
  );
};

export const Sidebar = () => {
  const { currentRoute, setCurrentRoute, authUser, clearAuth } = useStore();
  const [sinCatCount, setSinCatCount] = useState(0);
  const rol = authUser?.rol || 'OPERADOR';
  const restauranteId = authUser?.restaurante_id ?? 1;

  // ── SUPER_ADMIN: cargar lista de restaurantes + alertas por restaurante ──
  const [restaurantes, setRestaurantes] = useState<any[]>([]);
  const [alertasPor, setAlertasPor] = useState<Record<number, any[]>>({});
  const [loadingRests, setLoadingRests] = useState(false);

  const isSuperAdmin = rol === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isSuperAdmin) return;
    setLoadingRests(true);
    api.get('/api/restaurantes')
      .then(async (rests: any[]) => {
        setRestaurantes(rests);
        // Cargar alertas activas para cada restaurante en paralelo
        const results = await Promise.allSettled(
          rests.map((r: any) =>
            api.get(`/api/alertas/${r.id}/activas`).then((data: any) => ({ id: r.id, alertas: Array.isArray(data) ? data : [] }))
          )
        );
        const mapa: Record<number, any[]> = {};
        results.forEach(res => {
          if (res.status === 'fulfilled') mapa[res.value.id] = res.value.alertas;
        });
        setAlertasPor(mapa);
      })
      .catch(() => {})
      .finally(() => setLoadingRests(false));
  }, [isSuperAdmin]);

  // Cargar badge de gastos sin categorizar (solo para usuarios regulares)
  useEffect(() => {
    if (isSuperAdmin) return;
    api.get(`/api/gastos/sin-categorizar/${restauranteId}`)
      .then(d => setSinCatCount(d.total || 0))
      .catch(() => {});
  }, [currentRoute, isSuperAdmin, restauranteId]);

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch {}
    clearAuth();
    setCurrentRoute('/login');
  };

  const menuItemsOwner = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Cierre de Turno', icon: ClipboardList, path: '/cierre-turno' },
    { name: 'Gastos & Proveedores', icon: Receipt, path: '/gastos' },
    { name: 'Dashboard Gastos', icon: BarChart3, path: '/dashboard-gastos' },
    { name: 'Categorizar gastos', icon: Tag, path: '/categorizar', badge: sinCatCount > 0 ? sinCatCount : undefined },
    { name: 'P&L & Reportes', icon: FileText, path: '/reportes' },
    { name: 'Calendario Pagos', icon: Wallet, path: '/tesoreria' },
    { name: 'Fiscal', icon: Calculator, path: '/fiscal' },
    { name: 'Nómina', icon: Users, path: '/nomina' },
  ];

  return (
    <aside style={{ width: '260px', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #3D1C1E 0%, #2A1214 100%)', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0' }}>

      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'linear-gradient(135deg,#C8FF00,#A0D000)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '18px', fontWeight: '900', color: '#3D1C1E' }}>{isSuperAdmin ? 'R' : 'K'}</span>
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '1px' }}>{isSuperAdmin ? 'RBO' : 'KOI'}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>{authUser?.nombre || 'Usuario'}</div>
          </div>
        </div>
      </div>

      {/* ── Contenido del sidebar ──────────────────────────────────────── */}
      <div style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>

        {isSuperAdmin ? (
          /* ── SUPER_ADMIN: Panel RBO + lista dinámica de restaurantes ── */
          <>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', padding: '8px 12px 6px', letterSpacing: '1.5px', fontWeight: '600' }}>SUPER ADMIN</div>

            {/* Panel RBO */}
            <NavBtn path="/rbo" icon={Building2} label="Panel RBO" />

            {/* Separador */}
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', padding: '12px 12px 4px', letterSpacing: '1.5px', fontWeight: '600' }}>RESTAURANTES</div>

            {/* Lista dinámica */}
            {loadingRests ? (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Cargando…</div>
            ) : restaurantes.map((r: any) => {
              const path = `/rbo/restaurante/${r.slug}`;
              const isActive = currentRoute.startsWith(path);
              const alertas = alertasPor[r.id] || [];
              const dotColor = getSemaforoColor(alertas);
              return (
                <button
                  key={r.id}
                  onClick={() => setCurrentRoute(path)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', marginBottom: '2px', border: 'none', cursor: 'pointer', borderRadius: '8px', fontSize: '13px', borderLeft: isActive ? '3px solid #C8FF00' : '3px solid transparent', fontWeight: isActive ? '600' : '400', transition: 'all 0.15s ease', background: isActive ? 'rgba(200,255,0,0.1)' : 'transparent', color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; } }}
                >
                  {/* Semáforo dot */}
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 6px ${dotColor}` }} />
                  <span style={{ flex: 1, textAlign: 'left' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.nombre}</span>
                  {alertas.length > 0 && (
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 5px', borderRadius: '6px', background: alertas.some((a: any) => a.severidad === 'CRITICAL') ? '#DC2626' : '#D97706', color: '#FFF' }}>{alertas.length}</span>
                  )}
                  {isActive && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C8FF00', flexShrink: 0 }} />}
                </button>
              );
            })}

            {/* + Restaurante */}
            <button
              onClick={() => alert('Próximamente: formulario para agregar restaurante')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', marginTop: '6px', border: '1px dashed rgba(255,255,255,0.15)', cursor: 'pointer', borderRadius: '8px', fontSize: '12px', background: 'transparent', color: 'rgba(255,255,255,0.35)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(200,255,0,0.4)'; e.currentTarget.style.color = 'rgba(200,255,0,0.7)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
            >
              <Plus style={{ width: '14px', height: '14px' }} />
              + Restaurante
            </button>
          </>
        ) : (
          /* ── Usuario regular: menú operativo ─────────────────────────── */
          <>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', padding: '8px 12px 6px', letterSpacing: '1.5px', fontWeight: '600' }}>MENÚ</div>
            {menuItemsOwner.map((item) => (
              <NavBtn key={item.path} path={item.path} icon={item.icon} label={item.name} badge={(item as any).badge} />
            ))}
          </>
        )}
      </div>

      {/* ── Logout ────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: 'none', cursor: 'pointer', borderRadius: '8px', fontSize: '13px', background: 'transparent', color: 'rgba(255,255,255,0.4)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}>
          <LogOut style={{ width: '18px', height: '18px', opacity: 0.7 }} />
          Cerrar sesión
        </button>
        <div style={{ padding: '8px 12px 0', fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>KOI Dashboard v2.0</div>
      </div>
    </aside>
  );
};
