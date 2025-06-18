import { createContext, useState } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("userData");
    return saved ? JSON.parse(saved) : null;
  });

  const API_URL = process.env.REACT_APP_API_URL;

  // Rafraîchir le token lorsque l'access token a expiré
  const refreshToken = async () => {
    const refresh = localStorage.getItem("refresh_token");
    if (refresh) {
      try {
        const response = await axios.post(`${API_URL}/api/token/refresh/`, { refresh });
        const { access } = response.data;
        const newUserData = { ...user, token: access };
        localStorage.setItem("userData", JSON.stringify(newUserData));
        axios.defaults.headers.common["Authorization"] = `Bearer ${access}`;
        return access;
      } catch (error) {
        console.error('Erreur lors du rafraîchissement du token', error);
        logout();
      }
    }
  };

  const login = async (username, password) => {
    try {
      const res = await axios.post(`${API_URL}/api/login/`, { username, password });

      if (!res.data.role || (!res.data.agence_id && res.data.role !== 'superadmin')) {
        throw new Error("Rôle ou agence non défini");
      }

      const userData = {
        token: res.data.access,
        refresh_token: res.data.refresh, // Enregistrez également le refresh_token
        role: res.data.role,
        agence_id: res.data.agence_id
      };

      localStorage.setItem("userData", JSON.stringify(userData));
      axios.defaults.headers.common["Authorization"] = `Bearer ${res.data.access}`;
      setUser(userData);
    } catch (err) {
      throw new Error("Nom d'utilisateur ou mot de passe incorrect");
    }
  };

  const logout = () => {
    localStorage.removeItem("userData");
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
};
