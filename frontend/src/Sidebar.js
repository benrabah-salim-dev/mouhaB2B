// src/components/Sidebar.js
import React from "react";
import { NavLink } from "react-router-dom";
import {
  FaFileImport,
  FaUsers,
  FaCar,
  FaSignOutAlt,
  FaHome,
  FaSyncAlt,
} from "react-icons/fa";

function SidebarLink({ to, icon, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "d-flex align-items-center gap-2 px-3 py-2 rounded " +
        (isActive ? "bg-light text-dark fw-semibold" : "text-white-50 hover-white")
      }
      style={{ textDecoration: "none" }}
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}

const Sidebar = ({ agenceId, onRefresh, refreshing, onLogout, agenceNom, role }) => {
  return (
    <aside
      className="d-flex flex-column p-3 text-white"
      style={{
        height: "100vh",
        width: 270,
        position: "fixed",
        left: 0,
        top: 0,
        background:
          "linear-gradient(180deg, #0f172a 0%, #111827 40%, #0b1020 100%)",
        borderRight: "1px solid rgba(255,255,255,.08)",
      }}
    >
      {/* Header */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <div
          className="rounded-circle d-flex align-items-center justify-content-center"
          style={{
            width: 36,
            height: 36,
            background: "rgba(255,255,255,.08)",
            color: "#fff",
          }}
        >
          <FaHome />
        </div>
        <div>
          <div className="fw-bold">{agenceNom || "Mon Agence"}</div>
          <div className="text-white-50 small">
            {role === "superadmin" ? "Super Admin" : "Admin Agence"}
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="mt-2" style={{ rowGap: 8, display: "grid" }}>
        <SidebarLink to={`/agence/${agenceId}/dossiers`} icon={<FaFileImport />}>
          Dossiers
        </SidebarLink>
        <SidebarLink to={`/agence/${agenceId}/ressources`} icon={<FaUsers />}>
          Ressources
        </SidebarLink>
        <SidebarLink to={`/agence/${agenceId}/fiches-mouvement`} icon={<FaCar />}>
          Fiches de mouvement
        </SidebarLink>
        <SidebarLink to={`/agence/${agenceId}/fiche-mouvement`} icon={<FaCar />}>
          Créer fiche de mouvement
        </SidebarLink>
        <SidebarLink to={`/ordres-mission`} icon={<FaCar />}>
          Ordres de Mission
        </SidebarLink>
      </nav>

      {/* Boutons bas */}
      <div className="mt-auto">
        <button
          className="btn btn-outline-light w-100 d-flex align-items-center justify-content-center gap-2"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <FaSyncAlt /> {refreshing ? "Actualisation…" : "Actualiser"}
        </button>

        <button
          className="btn btn-danger w-100 d-flex align-items-center gap-2 mt-2"
          onClick={onLogout}
        >
          <FaSignOutAlt /> Déconnexion
        </button>
      </div>

      <style>{`
        .hover-white:hover { color: #fff !important; background: rgba(255,255,255,.08); }
      `}</style>
    </aside>
  );
};

export default Sidebar;
