import { createContext, useState, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Récupère l'utilisateur depuis le localStorage au démarrage de l'application
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("userData");
    return saved ? JSON.parse(saved) : null;
  });

  const API_URL = process.env.REACT_APP_API_URL;

  // Fonction pour rafraîchir le token
  const refreshToken = async () => {
    const refresh = localStorage.getItem("refresh_token");
    if (refresh) {
      try {
        // Demander un nouveau token à l'API
        const response = await axios.post(`${API_URL}/api/token/refresh/`, { refresh });

        const { access } = response.data;

        // Mettre à jour les données de l'utilisateur dans le localStorage
        const newUserData = { ...user, token: access };
        localStorage.setItem("userData", JSON.stringify(newUserData));

        // Mettre à jour les headers axios pour les futures requêtes
        axios.defaults.headers.common["Authorization"] = `Bearer ${access}`;
        return access;
      } catch (error) {
        console.error('Erreur lors du rafraîchissement du token', error);
        logout(); // Déconnecter l'utilisateur en cas d'erreur
      }
    }
  };

  // Fonction de connexion
  const login = async (username, password) => {
    try {
      const res = await axios.post(`${API_URL}/api/login/`, { username, password });

      if (!res.data.role || (!res.data.agence_id && res.data.role !== 'superadmin')) {
        throw new Error("Rôle ou agence non défini");
      }

      // Créer les données utilisateur à stocker
      const userData = {
        token: res.data.access,
        refresh_token: res.data.refresh, // Assurez-vous de stocker aussi le refresh_token
        role: res.data.role,
        agence_id: res.data.agence_id
      };

      // Sauvegarder les données utilisateur dans le localStorage
      localStorage.setItem("userData", JSON.stringify(userData));

      // Ajouter le token dans les headers axios pour l'utiliser dans toutes les requêtes
      axios.defaults.headers.common["Authorization"] = `Bearer ${res.data.access}`;

      // Mettre à jour l'état du user
      setUser(userData);
    } catch (err) {
      throw new Error("Nom d'utilisateur ou mot de passe incorrect");
    }
  };

  // Fonction de déconnexion
  const logout = () => {
    localStorage.removeItem("userData");
    setUser(null); // Remettre l'état du user à null
    delete axios.defaults.headers.common["Authorization"]; // Supprimer l'en-tête d'autorisation
  };

  useEffect(() => {
    // Vérifier si l'utilisateur est connecté et rafraîchir le token si nécessaire
    const interval = setInterval(() => {
      if (user) {
        refreshToken(); // Rafraîchir le token à chaque intervalle de temps
      }
    }, 15 * 60 * 1000); // Rafraîchir toutes les 15 minutes (si nécessaire)

    return () => clearInterval(interval); // Nettoyer l'intervalle quand le composant est démonté
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
};
