// src/layouts/AppLayout.jsx
import React, { useEffect, useMemo } from "react";
import Sidebar from "./Sidebar";
import TopBar from "../components/TopBar";

export default function AppLayout({
  children,
  user,
  agenceId,
  agenceNom,
  role,
  onLogout,
  onRefresh,
  refreshing,
  currentSpace = "agence",
  onChangeSpace,
}) {
  // ✅ reset sidebar à l'ouverture
  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", false);
  }, []);

  // ✅ extraction robuste du nom user (aucun refresh / aucun loop)
  const userName = useMemo(() => {
    if (!user) return "Utilisateur";

    return (
      user?.username ??
      user?.user?.username ??
      user?.profile?.username ??
      user?.email ??
      user?.user?.email ??
      "Utilisateur"
    );
  }, [user]);

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
        userName={userName}
        onLogout={onLogout}
        currentSpace={currentSpace}
        onChangeSpace={onChangeSpace}
      />

      <main
        className="app-main-container"
        style={{
          marginLeft: "var(--app-left)",
          paddingTop: "var(--topbar-h)",
          transition: "margin-left .3s cubic-bezier(0.4, 0, 0.2, 1)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f8fafc",
        }}
      >
        <div
          className="content-inner container-fluid py-4"
          style={{
            flex: 1,
            width: "100%",
            maxWidth: "1600px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .app-main-container { margin-left: 0 !important; }
        }
      `}</style>
    </>
  );
}
