import { useStore } from '../store/useStore';
import { Search, Calculator, LayoutDashboard, ClipboardList, Receipt, Wallet, FileText, ClipboardCheck, PieChart, Users, Package, Banknote, BarChart3, Landmark } from 'lucide-react';

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Cierre de Turno', icon: ClipboardList, path: '/cierre-turno' },
  { name: 'Gastos', icon: Receipt, path: '/gastos' },
  { name: 'Arqueo de Caja', icon: Wallet, path: '/arqueo' },
  { name: 'Cuentas por Pagar', icon: FileText, path: '/cuentas' },
  { name: 'Inventario', icon: Package, path: '/inventario' },
  { name: 'Nomina', icon: Banknote, path: '/nomina' },
  { name: 'Estado de Resultados', icon: PieChart, path: '/pl' },
  { name: 'Distribucion', icon: Users, path: '/distribucion' },
  { name: 'Reportes', icon: BarChart3, path: '/reportes' },
  { name: 'Banco Santander', icon: Landmark, path: '/banco' },
  { name: 'Smart Finder', icon: Search, path: '/finder' },
  { name: 'Propinas', icon: Calculator, path: '/propinas' },
];

export const Sidebar = () => {
  const { currentRoute, setCurrentRoute } = useStore();
  return (
    <aside style={{
      width: '260px', minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg, #3D1C1E 0%, #2A1214 100%)',
      borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0'
    }}>
      <div style={{padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
          <img src="/KOI LOGO.jpeg" alt="KOI" style={{width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover'}} />
          <div>
            <div style={{fontSize: '18px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '2px'}}>KOI</div>
            <div style={{fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '1px'}}>HAND ROLL & POKE</div>
          </div>
        </div>
      </div>
      <div style={{padding: '12px 10px', flex: 1, overflowY: 'auto'}}>
        <div style={{fontSize: '10px', color: 'rgba(255,255,255,0.35)', padding: '8px 12px 6px', letterSpacing: '1.5px', fontWeight: '600'}}>MENU</div>
        {menuItems.map((item) => {
          const isActive = currentRoute === item.path;
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => setCurrentRoute(item.path)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', marginBottom: '2px', border: 'none', cursor: 'pointer',
                borderRadius: '8px', fontSize: '13px', borderLeft: isActive ? '3px solid #C8FF00' : '3px solid transparent', fontWeight: isActive ? '600' : '400',
                transition: 'all 0.15s ease',
                background: isActive ? 'rgba(200,255,0,0.1)' : 'transparent',
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}}
            >
              <Icon style={{width: '18px', height: '18px', opacity: isActive ? 1 : 0.7}} />
              {item.name}
              {isActive && <div style={{marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: '#C8FF00'}}></div>}
            </button>
          );
        })}
      </div>
      <div style={{padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)'}}>
        <div style={{fontSize: '11px', color: 'rgba(255,255,255,0.3)'}}>KOI Dashboard v1.0</div>
      </div>
    </aside>
  );
};
