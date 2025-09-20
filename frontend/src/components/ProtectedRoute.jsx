import React, { useContext } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function ProtectedRoute({ requiredRole = null, checkAgence = false }) {
  const { user, initialized } = useContext(AuthContext);
  const { agence_id } = useParams();

  if (!initialized) return <p className="m-4">Chargement en cours…</p>;
  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (checkAgence && user.role === "adminagence") {
    if (!user.agence_id || parseInt(user.agence_id, 10) !== parseInt(agence_id, 10)) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
}
