// src/context/AuthContext.js
import { createContext, useState } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("userData");
    return saved ? JSON.parse(saved) : null;
  });

  const API_URL = process.env.REACT_APP_API_URL;

  
  const login = async (username, password) => {
    const res = await axios.post(`${API_URL}/api/login/`, { username, password });

    if (!res.data.role || (!res.data.agence_id && res.data.role !== 'superadmin')) {
      throw new Error("Rôle ou agence non défini");
    }

    const userData = {
      token: res.data.access,
      role: res.data.role,
      agence_id: res.data.agence_id
    };

    localStorage.setItem("userData", JSON.stringify(userData));
    axios.defaults.headers.common["Authorization"] = `Bearer ${res.data.access}`;
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("userData");
    setUser(null);
    delete axios.defaults.headers.common["Authorization"];
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
