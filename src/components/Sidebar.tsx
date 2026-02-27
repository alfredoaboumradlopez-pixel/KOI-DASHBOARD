import React from 'react';
import { useStore } from '../store/useStore';
import { LayoutDashboard, Receipt, Wallet, CreditCard, X, Fish, ClipboardCheck, PieChart, Users } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Cierre de Turno', icon: ClipboardCheck, path: '/cierre-turno' },
  { name: 'Captura de Gastos (OCR)', icon: Receipt, path: '/gastos' },
  { name: 'Arqueo de Caja', icon: Wallet, path: '/arqueo' },
  { name: 'Cuentas por Pagar', icon: CreditCard, path: '/cuentas' },
  { name: 'Estado de Resultados', icon: PieChart, path: '/pl' },
  { name: 'Distribucion Utilidades', icon: Users, path: '/distribucion' },
];

export const Sidebar: React.FC = () => {
  const { isSidebarOpen, setSidebarOpen, currentRoute, setCurrentRoute } = useStore();
  return (
    <>
      {isSidebarOpen && (
        <div className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200">
          <div className="flex items-center gap-2 text-indigo-600">
            <Fish className="w-8 h-8" />
            <span className="text-xl font-bold text-slate-900">KOI</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1 text-slate-500 hover:bg-slate-100 rounded-md lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = currentRoute === item.path;
            return (
              <a key={item.name} href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50 hover:text-indigo-600'}`}
                onClick={(e) => { e.preventDefault(); setCurrentRoute(item.path); setSidebarOpen(false); }}>
                <item.icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                {item.name}
              </a>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
