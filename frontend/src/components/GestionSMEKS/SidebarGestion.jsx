// SidebarGestion.jsx
import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FaTachometerAlt,
  FaBuilding,
  FaChevronDown,
  FaClipboardList,
  FaSignOutAlt,
} from "react-icons/fa";

const SIDEBAR_OPEN = 220;   // doit matcher GestionLayout
const SIDEBAR_CLOSED = 64;

// 👉 Mets ici les clés exactes que tu utilises pour stocker les tokens
const TOKEN_KEYS = [
  "access",
  "refresh",
  "access_token",
  "refresh_token",
  "token",
  "authToken",
];

export default function SidebarGestion() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname || "";

  const [collapsed, setCollapsed] = useState(
    JSON.parse(localStorage.getItem("gestion-sidebar:collapsed") || "false")
  );
  const [openGestion, setOpenGestion] = useState(
    currentPath.startsWith("/gestion/agences") || currentPath.startsWith("/gestion/agences/")
  );

  const [openSuivi, setOpenSuivi] = useState(
    currentPath.startsWith("/gestion/suivi")
  );

  useEffect(() => {
    document.body.classList.toggle("gestion-sidebar-collapsed", collapsed);
    localStorage.setItem("gestion-sidebar:collapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (currentPath.startsWith("/gestion/agences")) setOpenGestion(true);
    if (currentPath.startsWith("/gestion/suivi")) setOpenSuivi(true);
  }, [currentPath]);

  const clearCookie = (name) => {
    // tente de supprimer sur plusieurs paths
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/;`;
  };

const handleLogout = async () => {
  try {
    // tentative de logout API  

  } catch (e) {
    // on ignore, on logout quand même
  } finally {
    // purge tokens + état
    ["access", "refresh", "access_token", "refresh_token", "token"].forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });

    localStorage.removeItem("user");
    sessionStorage.removeItem("user");

    // redirection login
    navigate("/login", { replace: true });
  }
};


  return (
    <>
      {/* Burger spécifique à la gestion */}
      <button
        type="button"
        aria-label={collapsed ? "Ouvrir le menu" : "Replier le menu"}
        onClick={() => setCollapsed((v) => !v)}
        className="gestion-sidebar-burger btn btn-dark"
        title={collapsed ? "Ouvrir le menu" : "Replier le menu"}
      >
        {collapsed ? "☰" : "✕"}
      </button>

      <aside className="gestion-sidebar-root text-white">
        <div className="gestion-brand px-2 mb-3">
          <div className="gestion-brand-icon">🏢</div>
          {!collapsed && <div className="fw-bold mt-2">Gestion</div>}
        </div>

        <nav className="d-grid gap-1 flex-grow-1">
          {/* Dashboard gestion */}
          <NavLink
            to="/gestion"
            end
            className={({ isActive }) =>
              "gestion-side-link d-flex align-items-center gap-2 px-3 py-2 rounded " +
              (isActive ? "active" : "")
            }
            title={collapsed ? "Dashboard" : undefined}
          >
            <FaTachometerAlt className="me-1" /> {!collapsed && "Dashboard"}
          </NavLink>

          {/* Section : Gestion des agences */}
          <button
            type="button"
            className={
              "gestion-side-section w-100 d-flex align-items-center justify-content-between px-3 py-2 rounded " +
              (openGestion ? "active" : "")
            }
            onClick={() => setOpenGestion((v) => !v)}
            title={collapsed ? "Gestion des agences" : undefined}
          >
            <span className="d-flex align-items-center gap-2">
              <FaBuilding /> {!collapsed && "Gestion des agences"}
            </span>
            {!collapsed && (
              <FaChevronDown
                style={{ transform: openGestion ? "rotate(180deg)" : "none" }}
              />
            )}
          </button>

          {!collapsed && openGestion && (
            <div className="ps-4 d-grid gap-1">
              <NavLink
                to="/gestion/agences/demandes"
                className={({ isActive }) =>
                  "gestion-side-link small px-3 py-2 rounded " +
                  (isActive ? "active" : "")
                }
              >
                Demandes d’inscription
              </NavLink>

              <NavLink
                to="/gestion/agences"
                className={({ isActive }) =>
                  "gestion-side-link small px-3 py-2 rounded " +
                  (isActive ? "active" : "")
                }
              >
                Agences (tableau)
              </NavLink>

              <NavLink
                to="/gestion/agences/nouvelle-inscription"
                className={({ isActive }) =>
                  "gestion-side-link small px-3 py-2 rounded " +
                  (isActive ? "active" : "")
                }
              >
                Nouvelle inscription
              </NavLink>

              <NavLink
                to="/gestion/agences/zonage"
                className={({ isActive }) =>
                  "gestion-side-link small px-3 py-2 rounded " +
                  (isActive ? "active" : "")
                }
              >
                Zonage
              </NavLink>
            </div>
          )}

          {/* Section : Suivi (missions + OM) */}
          <button
            type="button"
            className={
              "gestion-side-section w-100 d-flex align-items-center justify-content-between px-3 py-2 rounded " +
              (openSuivi ? "active" : "")
            }
            onClick={() => setOpenSuivi((v) => !v)}
            title={collapsed ? "Suivi" : undefined}
          >
            <span className="d-flex align-items-center gap-2">
              <FaClipboardList /> {!collapsed && "Suivi"}
            </span>
            {!collapsed && (
              <FaChevronDown
                style={{ transform: openSuivi ? "rotate(180deg)" : "none" }}
              />
            )}
          </button>

          {!collapsed && openSuivi && (
            <div className="ps-4 d-grid gap-1">
              <NavLink
                to="/gestion/suivi/missions-om"
                className={({ isActive }) =>
                  "gestion-side-link small px-3 py-2 rounded " +
                  (isActive ? "active" : "")
                }
              >
                Missions & OM
              </NavLink>
            </div>
          )}
        </nav>

        {/* ✅ Bouton Déconnexion (en bas) */}
        <div className="pt-2 mt-2 border-top border-light border-opacity-10">
          <button
            type="button"
            onClick={handleLogout}
            className="gestion-logout-btn d-flex align-items-center gap-2 w-100 px-3 py-2 rounded"
            title={collapsed ? "Déconnexion" : undefined}
          >
            <FaSignOutAlt />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      <style>{`
        .gestion-sidebar-burger {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 2100;
          width: 38px;
          height: 38px;
          padding: 0;
          border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0,0,0,.25);
        }

        .gestion-sidebar-root {
          position: fixed;
          inset: 0 auto 0 0;
          height: 100vh;
          width: ${SIDEBAR_OPEN}px;
          background: linear-gradient(180deg, #0f172a 0%, #111827 40%, #0b1020 100%);
          border-right: 1px solid rgba(255,255,255,.08);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 2090;
          transition: width .2s ease;
        }

        body.gestion-sidebar-collapsed .gestion-sidebar-root {
          width: ${SIDEBAR_CLOSED}px;
        }

        .gestion-brand-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(255,255,255,.1);
          display: grid;
          place-items: center;
          font-size: 20px;
        }

        .gestion-side-link {
          color: rgba(255,255,255,.75);
          text-decoration: none;
        }
        .gestion-side-link:hover {
          color: #fff;
          background: rgba(255,255,255,.08);
        }
        .gestion-side-link.active {
          background: #f8f9fa;
          color: #111;
          font-weight: 600;
        }

        .gestion-side-section {
          background: transparent;
          border: 0;
          color: rgba(255,255,255,.75);
          text-align: left;
          user-select: none;
        }
        .gestion-side-section:hover {
          color: #fff;
          background: rgba(255,255,255,.08);
        }
        .gestion-side-section.active {
          background: #f8f9fa;
          color: #111;
          font-weight: 600;
        }

        .gestion-logout-btn {
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          color: rgba(255,255,255,.85);
          text-align: left;
        }
        .gestion-logout-btn:hover {
          background: rgba(255,255,255,.10);
          color: #fff;
        }
      `}</style>
    </>
  );
}
