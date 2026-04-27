import React, { useState } from "react";
import { useStore } from "../store/useStore";
import { API_BASE } from "../services/api";

export const LoginPage = () => {
  const { setAuth, setCurrentRoute } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.detail?.detail || data?.detail || "Credenciales incorrectas");
        return;
      }
      const data = await res.json();
      setAuth(
        {
          nombre: data.nombre,
          email: email.trim().toLowerCase(),
          rol: data.rol,
          restaurante_id: data.restaurante_id,
        },
        data.access_token
      );
      // Redirect based on role
      if (data.rol === "SUPER_ADMIN") {
        setCurrentRoute("/rbo");
      } else {
        setCurrentRoute("/");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#3D1C1E,#2A1214)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#FFF", borderRadius: "20px", padding: "48px 40px", width: "100%", maxWidth: "420px", boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "64px", height: "64px", borderRadius: "16px", background: "linear-gradient(135deg,#3D1C1E,#5C2D30)", marginBottom: "16px" }}>
            <span style={{ fontSize: "24px", fontWeight: "900", color: "#C8FF00" }}>R</span>
          </div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827" }}>RBO</div>
          <div style={{ fontSize: "12px", color: "#9CA3AF", letterSpacing: "2px" }}>RESTAURANT BACK OFFICE</div>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "6px" }}>Correo electrónico</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
              placeholder="usuario@restaurante.com"
            />
          </div>
          <div style={{ marginBottom: "24px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#374151", display: "block", marginBottom: "6px" }}>Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#DC2626" }}>
              {error}
            </div>
          )}
          <button
            type="submit" disabled={loading}
            style={{ width: "100%", padding: "14px", borderRadius: "10px", border: "none", background: loading ? "#9CA3AF" : "#3D1C1E", color: loading ? "#FFF" : "#C8FF00", fontSize: "14px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "12px", color: "#9CA3AF" }}>
          Acceso solo por invitación
        </p>
      </div>
    </div>
  );
};
