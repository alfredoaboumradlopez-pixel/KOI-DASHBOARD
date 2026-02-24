import React from 'react';
import { useStore } from '../store/useStore';
import { Menu, ChevronDown, Store } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, branches, activeBranch, setActiveBranch, toggleSidebar } = useStore();
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  return (
    <header className="bg-koi-bg border-b border-koi-border h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 relative">
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 text-koi-text-muted hover:bg-white/5 rounded-md lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <h1 className="text-xl font-semibold text-white hidden sm:block">Dashboard Directivo</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Branch Selector */}
        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-koi-card border border-koi-border rounded-lg hover:bg-white/5 transition-colors"
          >
            <Store className="w-4 h-4 text-koi-text-muted" />
            <span className="hidden sm:inline">{activeBranch?.name}</span>
            <span className="sm:hidden">Sucursal</span>
            <ChevronDown className="w-4 h-4 text-koi-text-muted" />
          </button>

          {isDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setIsDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-koi-card rounded-lg shadow-xl border border-koi-border py-1 z-20">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => {
                      setActiveBranch(branch);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      activeBranch?.id === branch.id 
                        ? 'bg-koi-accent/10 text-koi-accent font-medium' 
                        : 'text-white hover:bg-white/5'
                    }`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="h-8 w-px bg-koi-border hidden sm:block"></div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-white">{user.name}</span>
            <span className="text-xs text-koi-text-muted">{user.role}</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-koi-card border border-koi-border flex items-center justify-center overflow-hidden">
            <img src="https://picsum.photos/seed/user/100/100" alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        </div>
      </div>
    </header>
  );
};
