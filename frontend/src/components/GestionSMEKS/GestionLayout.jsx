// src/layouts/GestionLayout.jsx
import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import SidebarGestion from "../ui/SidebarGestion";
import TopBar from "../ui/TopBar";

export default function GestionLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentSpace, setCurrentSpace] = useState(
    localStorage.getItem("app:space") || "agence"
  );

  useEffect(() => {
    document.body.style.margin = 0;
    return () => { document.body.style.margin = ""; };
  }, []);

  const handleChangeSpace = (spaceKey) => {
    localStorage.setItem("app:space", spaceKey);
    setCurrentSpace(spaceKey);
    // adapte la redirection si besoin
    navigate("/gestion");
  };

  return (
    <>
      <TopBar
        agenceNom="RENTOUT"
        role="superadmin"
        currentSpace={currentSpace}
        onChangeSpace={handleChangeSpace}
        onLogout={() => alert("Déconnexion")}
      />
      <SidebarGestion currentPath={location.pathname} />
      <main className="app-main container-fluid py-3">
        <div className="container-xxl">
          <Outlet />
        </div>
      </main>

      <style>{`
        :root{
          --sidebar-w-open: 270px;
          --sidebar-w-closed: 64px;
          --topbar-h: 56px;
        }
        body{ overflow: hidden; }
        .app-main{
          position: fixed;
          left: var(--sidebar-w-open);
          right: 0;
          top: var(--topbar-h);
          bottom: 0;
          overflow-y: auto;
          overflow-x: hidden; /* pas de scroll horizontal */
          background: #f7f8fa;
        }
        body.sidebar-collapsed .app-main{
          left: var(--sidebar-w-closed);
        }
      `}</style>
    </>
  );
}
