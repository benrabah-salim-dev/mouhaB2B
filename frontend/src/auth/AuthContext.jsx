// src/auth/AuthContext.jsx
import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import api, { clearAccess, getAccess, refreshAccess, setAccess } from "../api/client";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMe = useCallback(async () => {
    const { data } = await api.get("auth/me/");
    setUser(data);
    return data;
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const newAccess = await refreshAccess();
      if (newAccess) {
        setAccess(newAccess);
        await fetchMe();
        return true;
      }
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [fetchMe]);

  useEffect(() => {
    const init = async () => {
      const access = getAccess();
      try {
        if (access) await fetchMe();
        else await onRefresh();
      } catch {
        try { await onRefresh(); } catch {}
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [fetchMe, onRefresh]);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post("auth/login/", { username, password });
    if (data?.access) setAccess(data.access);
    if (data?.user) setUser(data.user);
    else await fetchMe();
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try { await api.post("auth/logout/"); } catch {}
    clearAccess();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    initialized,
    refreshing,
    login,
    logout,
    onRefresh,
  }), [user, initialized, refreshing, login, logout, onRefresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
