import { createContext, useState, useEffect } from "react";
import api, { setTokens, clearTokens, getTokens } from "../api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // Au démarrage → lire tokens
  useEffect(() => {
    const { access } = getTokens();
    if (access) {
      api.defaults.headers.Authorization = `Bearer ${access}`;
      const u = JSON.parse(localStorage.getItem("userData") || "{}");
      if (u?.role) setUser(u);
    }
    setInitialized(true);
  }, []);

  // Login
  const login = async (username, password) => {
    const { data } = await api.post("login/", { username, password });

    const userData = {
      token: data.access,
      refresh_token: data.refresh,
      role: data.role,
      agence_id: data.agence_id,
    };

    localStorage.setItem("userData", JSON.stringify(userData));
    setTokens({ access: data.access, refresh: data.refresh });

    api.defaults.headers.Authorization = `Bearer ${data.access}`;
    setUser(userData);
  };

  // Refresh Token
  const refreshToken = async () => {
    const { refresh } = getTokens();
    if (!refresh) return logout();

    try {
      const { data } = await api.post("login/refresh/", { refresh });
      setTokens({ access: data.access, refresh });
      api.defaults.headers.Authorization = `Bearer ${data.access}`;
    } catch {
      logout();
    }
  };

  // Logout
  const logout = () => {
    clearTokens();
    localStorage.removeItem("userData");
    setUser(null);
    delete api.defaults.headers.Authorization;
  };

  // Auto-refresh toutes les 15 min
  useEffect(() => {
    if (!user) return;
    const id = setInterval(refreshToken, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshToken, initialized }}>
      {children}
    </AuthContext.Provider>
  );
};
