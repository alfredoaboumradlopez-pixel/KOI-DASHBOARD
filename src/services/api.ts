export const API_BASE = import.meta.env.VITE_API_URL || (window.location.hostname === "localhost" ? "http://127.0.0.1:8001" : "");

function getToken(): string | null {
  return localStorage.getItem('rbo_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function handleUnauth(res: Response) {
  if (res.status === 401) {
    // Lazy import to avoid circular dependency — Zustand store is safe to call outside React
    import('../store/useStore').then(({ useStore }) => {
      const { clearAuth, setCurrentRoute } = useStore.getState();
      clearAuth();
      setCurrentRoute('/login');
    });
  }
}

export const api = {
  get: async (endpoint: string) => {
    const res = await fetch(`${API_BASE}${endpoint}`, { headers: authHeaders() });
    handleUnauth(res);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  post: async (endpoint: string, data: any) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    handleUnauth(res);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  patch: async (endpoint: string, data: any) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    handleUnauth(res);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  put: async (endpoint: string, data: any) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    handleUnauth(res);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  del: async (endpoint: string) => {
    const res = await fetch(API_BASE + endpoint, { method: "DELETE", headers: authHeaders() });
    handleUnauth(res);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  upload: async (endpoint: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", body: formData, headers });
    handleUnauth(res);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
};
