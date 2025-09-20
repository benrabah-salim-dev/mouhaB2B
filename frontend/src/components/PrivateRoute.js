// src/components/ProtectedRoute.jsx
import React, { useContext } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function ProtectedRoute({ requiredRole, checkAgence = false }) {
  const { user, initialized } = useContext(AuthContext) || {};
  const { agence_id: paramAgence } = useParams();

  if (!initialized) return <div className="m-4">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && String(user.role).toLowerCase() !== String(requiredRole).toLowerCase()) {
    // accès refusé
    return <Navigate to="/login" replace />;
  }

  if (checkAgence) {
    if (String(user.role).toLowerCase() === "superadmin") {
      // superadmin DOIT avoir un :agence_id dans l'URL
      if (!paramAgence) return <Navigate to="/dashboard/superadmin" replace />;
    } else {
      // admin agence → on tolère l'absence de param et on redirige
      if (!paramAgence && user.agence_id) {
        return <Navigate to={`/agence/${user.agence_id}/dashboard`} replace />;
      }
    }
  }

  return <Outlet />;
}
