// src/components/Sidebar.js
import React, { useState, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FaUsers,
  FaCar,
  FaSignOutAlt,
  FaHome,
  FaSyncAlt,
  FaMapMarkedAlt,
  FaPlaneDeparture,
  FaPlaneArrival,
  FaTasks,
  FaChevronDown,
  FaExchangeAlt,
  FaShuttleVan
} from "react-icons/fa";

function SidebarLink({ to, icon, children, extraClass, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        "d-flex align-items-center gap-2 px-3 py-2 rounded " +
        (extraClass ? extraClass + " " : "") +
        (isActive ? "bg-light text-dark fw-semibold" : "text-white-50 hover-white")
      }
      style={{ textDecoration: "none" }}
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}

function SectionHeader({ label, icon, active, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "w-100 d-flex align-items-center justify-content-between px-3 py-2 rounded border-0 " +
        (active ? "bg-light text-dark fw-semibold" : "text-white-50 hover-white bg-transparent")
      }
      style={{ textAlign: "left" }}
      aria-expanded={open}
    >
      <span className="d-flex align-items-center gap-2">
        {icon}
        {label}
      </span>
      <FaChevronDown
        style={{
          transition: "transform .2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          opacity: 0.8
        }}
      />
    </button>
  );
}

const Sidebar = ({ agenceId, onRefresh, refreshing, onLogout, agenceNom, role }) => {
  const location = useLocation();

  // Activation & ouverture auto des sections selon la route courante
  const fmActive = useMemo(() => {
    const base = `/agence/${agenceId}`;
    return (
      location.pathname.startsWith(`${base}/fiches-mouvement`) ||
      location.pathname.startsWith(`${base}/mes-departs`) ||
      location.pathname.startsWith(`${base}/mes-arrivees`) ||
      location.pathname.startsWith(`${base}/fiche-mouvement`)
    );
  }, [location.pathname, agenceId]);

  const missionsActive = useMemo(() => {
    const base = `/agence/${agenceId}/missions`;
    return (
      location.pathname.startsWith(base) ||
      location.pathname.startsWith(`/agence/${agenceId}/missions/transferts`) ||
      location.pathname.startsWith(`/agence/${agenceId}/missions/excursions`) ||
      location.pathname.startsWith(`/agence/${agenceId}/missions/navettes`)
    );
  }, [location.pathname, agenceId]);

  const [openFM, setOpenFM] = useState(fmActive);
  const [openMissions, setOpenMissions] = useState(missionsActive);

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
        <SidebarLink to={`/agence/${agenceId}/ressources`} icon={<FaUsers />}>
          Ressources
        </SidebarLink>

        {/* Section: Fiches de mouvement */}
        <SectionHeader
          label="Fiches de mouvement"
          icon={<FaCar />}
          active={fmActive}
          open={openFM}
          onToggle={() => setOpenFM(v => !v)}
        />
        {openFM && (
          <>
            <SidebarLink
              to={`/agence/${agenceId}/mes-departs`}
              icon={<FaPlaneDeparture />}
              extraClass="ps-4 small"
              end
            >
              Mes départs
            </SidebarLink>
            <SidebarLink
              to={`/agence/${agenceId}/mes-arrivees`}
              icon={<FaPlaneArrival />}
              extraClass="ps-4 small"
              end
            >
              Mes arrivées
            </SidebarLink>
            <SidebarLink
              to={`/agence/${agenceId}/fiche-mouvement`}
              icon={<FaCar />}
              extraClass="ps-4 small"
              end
            >
              Créer fiche de mouvement
            </SidebarLink>
          </>
        )}

        {/* Section: Mes missions (avec sous-liens) */}
        <SectionHeader
          label="Mes missions"
          icon={<FaTasks />}
          active={missionsActive}
          open={openMissions}
          onToggle={() => setOpenMissions(v => !v)}
        />
        {openMissions && (
          <>
            <SidebarLink
              to={`/agence/${agenceId}/missions/transferts`}
              icon={<FaExchangeAlt />}
              extraClass="ps-4 small"
              end
            >
              Mes transferts
            </SidebarLink>
            <SidebarLink
              to={`/agence/${agenceId}/missions/excursions`}
              icon={<FaMapMarkedAlt />}
              extraClass="ps-4 small"
              end
            >
              Mes excursions
            </SidebarLink>
            <SidebarLink
              to={`/agence/${agenceId}/missions/navettes`}
              icon={<FaShuttleVan />}
              extraClass="ps-4 small"
              end
            >
              Mes navettes
            </SidebarLink>
          </>
        )}

        {/* Ordres de Mission */}
        <SidebarLink to={`/ordres-mission`} icon={<FaCar />} end>
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
