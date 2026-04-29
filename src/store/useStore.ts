import { create } from 'zustand';

interface AuthUser {
  id?: number;
  nombre: string;
  email?: string;
  rol: string;
  restaurante_id: number | null;
}

interface Branch {
  id: string;
  name: string;
}

interface AppState {
  // Auth
  authUser: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  // Legacy
  branches: Branch[];
  activeBranch: Branch | null;
  setActiveBranch: (branch: Branch) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  currentRoute: string;
  setCurrentRoute: (route: string) => void;
}

function loadFromStorage(): { user: AuthUser | null; token: string | null } {
  try {
    const token = localStorage.getItem('rbo_token');
    const userStr = localStorage.getItem('rbo_user');
    if (token && userStr) {
      return { token, user: JSON.parse(userStr) };
    }
  } catch {}
  return { user: null, token: null };
}

const { user: storedUser, token: storedToken } = loadFromStorage();

export const useStore = create<AppState>((set, get) => ({
  // Auth state (persisted in localStorage)
  authUser: storedUser,
  token: storedToken,
  setAuth: (user, token) => {
    localStorage.setItem('rbo_token', token);
    localStorage.setItem('rbo_user', JSON.stringify(user));
    set({ authUser: user, token });
  },
  clearAuth: () => {
    localStorage.removeItem('rbo_token');
    localStorage.removeItem('rbo_user');
    set({ authUser: null, token: null });
  },
  isAuthenticated: () => !!get().token,
  // Legacy
  branches: [{ id: '1', name: 'KOI' }],
  activeBranch: { id: '1', name: 'KOI' },
  setActiveBranch: (branch) => set({ activeBranch: branch }),
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  currentRoute: '/rbo',
  setCurrentRoute: (route) => set({ currentRoute: route }),
}));
