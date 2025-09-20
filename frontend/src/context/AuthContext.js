// src/context/AuthContext.js
import React, { createContext, useEffect, useState, useMemo } from "react";
import api, { setTokens, clearTokens, getTokens } from "../api";
import { loginAuto } from "../api";

export const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // {role, agence_id, username?}
  const [initialized, setInitialized] = useState(false);

  // Au boot: recharge tokens + userData du localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("userData") || "null");
      const { access } = getTokens();
      if (access && saved) setUser(saved);
    } catch {
      // ignore
    }
    setInitialized(true);
  }, []);

  const login = async (username, password) => {
    // POST /api/login/ renvoie {access, refresh, role, agence_id}
    const data = await loginAuto({ username, password }); // tente /login/ puis /token/

    const payload = {
      access: data?.access,
      refresh: data?.refresh,
    };
    if (!payload.access || !payload.refresh) {
      throw new Error("Jetons JWT manquants");
    }
    setTokens(payload);

    const userData = {
      role: data?.role || "adminagence",
      agence_id: data?.agence_id ?? null,
      username,
    };
    localStorage.setItem("userData", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = (redirect = false) => {
    clearTokens();
    localStorage.removeItem("userData");
    setUser(null);
    if (redirect) window.location.assign("/login");
  };

  const value = useMemo(
    () => ({ user, initialized, login, logout }),
    [user, initialized]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
