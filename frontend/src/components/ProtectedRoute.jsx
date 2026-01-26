// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthContext } from "../auth/AuthContext";

export default function ProtectedRoute({ requiredRole, checkAgence = false, children }) {
  const ctx = React.useContext(AuthContext);
  const location = useLocation();

  // Si le provider n'est pas monté / mauvais import
  if (!ctx) {
    // plutôt que crasher, on redirige login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const { user, initialized, refreshing } = ctx;

  // Pendant init/refresh : on évite de render des redirects
  if (!initialized || refreshing) {
    return null; // ou un spinner global
  }

  // Pas connecté
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Rôle requis
  if (requiredRole) {
    const role = ((user.role || user.profile?.role || "") + "").toLowerCase();
    if (role !== String(requiredRole).toLowerCase()) {
      // Par défaut on renvoie vers une zone cohérente
      return <Navigate to="/dashboard/superadmin" replace />;
    }
  }

  // Vérif agence (si tu veux forcer agence_id présent)
  if (checkAgence) {
    const agenceId = user.agence_id ?? user.profile?.agence ?? null;
    if (!agenceId) {
      return <Navigate to="/login" replace />;
    }
  }

  // Support 2 styles:
  // 1) <Route element={<ProtectedRoute />}> <Route .../> </Route>  => Outlet
  // 2) <ProtectedRoute><SomePage/></ProtectedRoute>               => children
  return children ? children : <Outlet />;
}
