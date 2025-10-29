// src/layout/AppLayout.jsx
import React, { useEffect } from "react";
import Sidebar from "../Sidebar";
import TopBar from "../components/TopBar";

export default function AppLayout({
  children,
  agenceId,
  agenceNom,
  role,
  onLogout,
  onRefresh,
  refreshing,
  currentSpace = "agence",     // ✅ on le déstructure ici
  onChangeSpace,               // ✅ et on reçoit aussi le handler
}) {
  // Optionnel : garantir l'état initial non-collapsé au premier render
  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", false);
  }, []);

  return (
    <>
      <Sidebar
        agenceId={agenceId}
        agenceNom={agenceNom}
        role={role}
        onLogout={onLogout}
        onRefresh={onRefresh}
        refreshing={refreshing}
        currentSpace={currentSpace}  
      />

      <TopBar
        agenceNom={agenceNom}
        role={role}
        onLogout={onLogout}
        currentSpace={currentSpace}  
        onChangeSpace={onChangeSpace} 
      />

      <main
        className="app-content container-fluid"
        style={{
          marginLeft: "var(--app-left)",
          paddingTop: "var(--topbar-h)",
          transition: "margin-left .2s ease",
          height: "auto",
          minHeight: "100vh",
          overflow: "visible",
        }}
      >
        {children}
      </main>
    </>
  );
}
