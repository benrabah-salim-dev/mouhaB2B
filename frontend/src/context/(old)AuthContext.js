import { createContext, useState, useEffect } from "react";
import api, { setAccess, clearAccess, getAccess } from "../api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // Au démarrage : si access existe -> ok, sinon tenter refresh (cookie)
  useEffect(() => {
    const init = async () => {
      const access = getAccess();
      if (access) {
        try {
          const { data } = await api.get("auth/me/");
          setUser(data);
        } catch {
          // si access expiré -> refresh auto via interceptor quand une requête fera 401
        }
      } else {
        // tente refresh direct
        try {
          const { data } = await api.post("auth/refresh/");
          if (data?.access) {
            setAccess(data.access);
            const me = await api.get("auth/me/");
            setUser(me.data);
          }
        } catch {
          // pas loggé
        }
      }
      setInitialized(true);
    };
    init();
  }, []);

  const login = async (username, password) => {
    const { data } = await api.post("auth/login/", { username, password });

    // access token (refresh est en cookie HttpOnly)
    setAccess(data.access);

    // tu peux stocker ce que tu veux du user
    setUser(data.user || null);

    // (optionnel) si tu veux garder role/agence côté front :
    localStorage.setItem(
      "userData",
      JSON.stringify({
        role: data.role,
        agence_id: data.agence_id,
      })
    );
  };

  const logout = async () => {
    try { await api.post("auth/logout/"); } catch {}
    clearAccess();
    localStorage.removeItem("userData");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, initialized }}>
      {children}
    </AuthContext.Provider>
  );
};
