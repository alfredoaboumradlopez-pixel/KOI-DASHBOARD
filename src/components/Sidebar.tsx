import { useStore } from '../store/useStore';
import { Search, LayoutDashboard, ClipboardList, Receipt, Wallet, FileText, Users, BarChart3, Tag, LogOut, Building2, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import { useState, useEffect } from 'react';

// Suppress unused import warnings
void Search;
void ChevronRight;

export const Sidebar = () => {
  const { currentRoute, setCurrentRoute, authUser, clearAuth } = useStore();
  const [sinCatCount, setSinCatCount] = useState(0);
  const rol = authUser?.rol || 'OPERADOR';
  const restauranteId = authUser?.restaurante_id ?? 1;

  // Cargar badge de gastos sin categorizar
  useEffect(() => {
    if (rol !== 'SUPER_ADMIN') {
      api.get(`/api/gastos/sin-categorizar/${restauranteId}`)
        .then(d => setSinCatCount(d.total || 0))
        .catch(() => {});
    }
  }, [currentRoute]);

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch {}
    clearAuth();
    setCurrentRoute('/login');
  };

  const isSuperAdmin = rol === 'SUPER_ADMIN';

  const menuItemsOwner = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Cierre de Turno', icon: ClipboardList, path: '/cierre-turno' },
    { name: 'Gastos & Proveedores', icon: Receipt, path: '/gastos' },
    { name: 'Dashboard Gastos', icon: BarChart3, path: '/dashboard-gastos' },
    { name: 'Categorizar gastos', icon: Tag, path: '/categorizar', badge: sinCatCount > 0 ? sinCatCount : undefined },
    { name: 'P&L & Reportes', icon: FileText, path: '/reportes' },
    { name: 'Calendario Pagos', icon: Wallet, path: '/tesoreria' },
    { name: 'Nómina', icon: Users, path: '/nomina' },
  ];

  const menuItemsSuperAdmin = [
    { name: 'Panel RBO', icon: Building2, path: '/rbo' },
    { name: 'Dashboard KOI', icon: LayoutDashboard, path: '/' },
    { name: 'Gastos & Proveedores', icon: Receipt, path: '/gastos' },
    { name: 'Categorizar gastos', icon: Tag, path: '/categorizar' },
  ];

  const menuItems = isSuperAdmin ? menuItemsSuperAdmin : menuItemsOwner;

  return (
    <aside style={{ width: '260px', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #3D1C1E 0%, #2A1214 100%)', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0' }}>
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
      <div style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', padding: '8px 12px 6px', letterSpacing: '1.5px', fontWeight: '600' }}>{isSuperAdmin ? 'SUPER ADMIN' : 'MENÚ'}</div>
        {menuItems.map((item) => {
          const isActive = currentRoute === item.path || (item.path !== '/' && currentRoute.startsWith(item.path));
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => setCurrentRoute(item.path)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '2px', border: 'none', cursor: 'pointer', borderRadius: '8px', fontSize: '13px', borderLeft: isActive ? '3px solid #C8FF00' : '3px solid transparent', fontWeight: isActive ? '600' : '400', transition: 'all 0.15s ease', background: isActive ? 'rgba(200,255,0,0.1)' : 'transparent', color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; } }}>
              <Icon style={{ width: '18px', height: '18px', opacity: isActive ? 1 : 0.7, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' as const }}>{item.name}</span>
              {(item as any).badge && (
                <span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#DC2626', color: '#FFF' }}>{(item as any).badge}</span>
              )}
              {isActive && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C8FF00' }} />}
            </button>
          );
        })}
      </div>
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
