// src/components/TopBar.jsx
import React from "react";
import { FaSignOutAlt, FaBuilding, FaUserCircle } from "react-icons/fa";

const SPACE_LABELS = {
  agence: "Espace agence",
  fournisseur: "Espace fournisseur",
  client: "Espace client",
  succursale: "Espace succursale",
};

export default function TopBar({
  agenceNom,
  userName,
  onLogout,
  currentSpace = "agence",
  onChangeSpace,
}) {
  const spaceLabel = SPACE_LABELS[currentSpace] || "Espace";

  const otherSpaces = Object.entries(SPACE_LABELS).filter(
    ([key]) => key !== currentSpace
  );

  const canChange =
    otherSpaces.length > 0 && typeof onChangeSpace === "function";

  const handleChangeSpace = (key) => {
    if (!canChange) return;
    if (key === currentSpace) return; //  evite appels inutiles
    onChangeSpace(key);
  };

  const displayUser = userName && userName !== "Utilisateur" ? userName : "Chargement...";

  return (
    <>
      <header
        className="topbar d-flex align-items-center justify-content-between px-4"
        style={{
          position: "fixed",
          left: "var(--app-left)",
          right: 0,
          top: 0,
          height: "var(--topbar-h)",
          background: "#0b1020",
          borderBottom: "1px solid rgba(255,255,255,.08)",
          zIndex: 1080,
          transition: "left .3s ease",
        }}
      >
        {/* GAUCHE : agence + badge espace */}
        <div className="d-flex align-items-center gap-3 text-white">
          <div
            className="d-flex align-items-center gap-2 border-end pe-3"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          >
            <FaBuilding className="text-primary" />
            <span className="fw-bold letter-spacing-1 text-uppercase small">
              {agenceNom || "Chargement..."}
            </span>
          </div>

        </div>

        {/* DROITE : user + espace + logout */}
        <div className="d-flex align-items-center gap-3">

          <span className="badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3">
            
          </span>
          {/* Dropdown espace */}
          <div className="dropdown">
            <button
              className="btn btn-outline-light btn-sm rounded-2 dropdown-toggle"
              type="button"
              disabled={!canChange}
              data-bs-toggle={canChange ? "dropdown" : undefined}
              aria-expanded="false"
            >
            {spaceLabel}           
            </button>

            {canChange && (
              <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 mt-2">
                <li className="dropdown-header">Passer vers :</li>
                {otherSpaces.map(([key, label]) => (
                  <li key={key}>
                    <button
                      className="dropdown-item py-2"
                      onClick={() => handleChangeSpace(key)}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

         
        </div>
      </header>

      <style>{`
        :root { --topbar-h: 60px; }
        .letter-spacing-1 { letter-spacing: 0.5px; }
        .topbar .btn-outline-light {
          border-color: rgba(255,255,255,0.2);
          font-size: 0.85rem;
        }
        .topbar .btn-outline-light:hover {
          background: rgba(255,255,255,0.05);
        }
      `}</style>
    </>
  );
}
