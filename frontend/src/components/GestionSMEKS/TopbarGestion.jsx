// src/ui/TopBar.jsx
import React from "react";
import { FaSignOutAlt, FaBuilding } from "react-icons/fa";

const SPACE_LABELS = {
  agence: "Espace agence",
  fournisseur: "Espace fournisseur",
  client: "Espace client",
  succursale: "Espace succursale",
};

export default function TopBar({ agenceNom, role, onLogout, currentSpace="agence", onChangeSpace }) {
  const spaceLabel = SPACE_LABELS[currentSpace] || "Espace";
  const otherSpaces = Object.entries(SPACE_LABELS).filter(([k]) => k !== currentSpace);
  const canChange = otherSpaces.length > 0;

  return (
    <>
      <header
        className="topbar d-flex align-items-center justify-content-between px-3"
        style={{
          position: "fixed",
          left: "var(--sidebar-w-open)",
          right: 0,
          top: 0,
          height: "var(--topbar-h)",
          background: "#0b1020",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          zIndex: 1080,
          transition: "left .2s ease",
          color: "#fff"
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-2">
            <FaBuilding />
            <div className="d-flex flex-column">
              <span className="fw-semibold">{agenceNom || "Mon Agence"}</span>
              <span className="text-white-50 small">{role === "superadmin" ? "Super Admin" : "Admin Agence"}</span>
            </div>
          </div>
          <span className="badge rounded-pill bg-light text-dark fw-semibold">{spaceLabel}</span>
        </div>

        <div className="d-flex align-items-center gap-2">
          <div className="dropdown">
            <button
              className={`btn btn-outline-light btn-sm dropdown-toggle ${!canChange ? "disabled" : ""}`}
              type="button"
              data-bs-toggle={canChange ? "dropdown" : undefined}
              aria-expanded="false"
              aria-disabled={!canChange}
            >
              {spaceLabel}
            </button>
            {canChange && (
              <ul className="dropdown-menu dropdown-menu-end">
                {otherSpaces.map(([key, label]) => (
                  <li key={key}>
                    <button className="dropdown-item" onClick={() => onChangeSpace && onChangeSpace(key)}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button className="btn btn-danger btn-sm d-flex align-items-center gap-2" onClick={onLogout}>
            <FaSignOutAlt /> <span>Déconnexion</span>
          </button>
        </div>
      </header>

      <style>{`
        body.sidebar-collapsed .topbar{ left: var(--sidebar-w-closed) !important; }
      `}</style>
    </>
  );
}
