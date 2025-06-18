// src/context/RedirectContext.js
import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const RedirectContext = createContext();

export const RedirectProvider = ({ children }) => {
  const navigate = useNavigate(); // Utiliser useNavigate dans un composant fonctionnel

  // Fonction de redirection
  const redirectToLogin = (path = '/login') => {
    navigate(path); // Rediriger vers la page de connexion par défaut ou spécifiée
  };

  return (
    <RedirectContext.Provider value={{ redirectToLogin }}>
      {children}
    </RedirectContext.Provider>
  );
};

export const useRedirect = () => useContext(RedirectContext);
