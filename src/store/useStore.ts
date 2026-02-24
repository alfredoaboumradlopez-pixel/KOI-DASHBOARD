import { create } from 'zustand';

interface User {
  name: string;
  role: string;
}

interface Branch {
  id: string;
  name: string;
}

interface AppState {
  user: User;
  branches: Branch[];
  activeBranch: Branch | null;
  setActiveBranch: (branch: Branch) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  currentRoute: string;
  setCurrentRoute: (route: string) => void;
}

export const useStore = create<AppState>((set) => ({
  user: {
    name: 'Admin Matriz',
    role: 'Administrador General',
  },
  branches: [
    { id: '1', name: 'Sucursal Centro' },
    { id: '2', name: 'Sucursal Norte' },
    { id: '3', name: 'Sucursal Sur' },
  ],
  activeBranch: { id: '1', name: 'Sucursal Centro' },
  setActiveBranch: (branch) => set({ activeBranch: branch }),
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  currentRoute: '/',
  setCurrentRoute: (route) => set({ currentRoute: route }),
}));
