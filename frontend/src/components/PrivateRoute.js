// src/components/PrivateRoute.js
import React, { useContext } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const PrivateRoute = ({ element, ...rest }) => {
  const { user } = useContext(AuthContext);

  // Si l'utilisateur est authentifié, retourne l'élément de la route, sinon redirige vers /login
  return (
    <Route 
      {...rest} 
      element={user ? element : <Navigate to="/login" replace />} 
    />
  );
};

export default PrivateRoute;
