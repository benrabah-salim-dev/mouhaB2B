// src/app/shells/AppShell.jsx
import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppLayout from "../../layout/AppLayout";
import { AuthContext } from "../../auth/AuthContext";

export default function AppShell() {
  const ctx = React.useContext(AuthContext);
  const user = ctx?.user;

  const location = useLocation();
  const navigate = useNavigate();

  const agenceId = user?.agence_id || user?.profile?.agence || null;
  const agenceNom = user?.profile?.agence_nom || user?.agence_nom || "Mon Agence";
  const role = user?.profile?.role || user?.role || "admin";

  const refreshing = !!ctx?.refreshing;
  const onRefresh = ctx?.onRefresh || (() => {});
  const onLogout = ctx?.logout || (() => {});

  const currentSpace = React.useMemo(() => {
    const p = location.pathname || "";
    if (p.startsWith("/fournisseur")) return "fournisseur";
    if (p.startsWith("/client")) return "client";
    if (p.startsWith("/succursale")) return "succursale";
    return "agence";
  }, [location.pathname]);

  const handleChangeSpace = (space) => {
    switch (space) {
      case "agence":
        if (agenceId) navigate(`/agence/${agenceId}/dashboard`);
        else navigate("/dashboard/superadmin");
        break;
      case "fournisseur":
        navigate("/fournisseur/tarifs");
        break;
      default:
        navigate("/dashboard/superadmin");
        break;
    }
  };

  return (
    <AppLayout
      agenceId={agenceId}
      agenceNom={agenceNom}
      role={role}
      onLogout={onLogout}
      onRefresh={onRefresh}
      refreshing={refreshing}
      currentSpace={currentSpace}
      onChangeSpace={handleChangeSpace}
    >
      <Outlet />
    </AppLayout>
  );
}
