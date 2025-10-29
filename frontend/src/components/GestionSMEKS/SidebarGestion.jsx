// src/ui/SidebarGestion.jsx
import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FaTachometerAlt, FaBuilding, FaChevronDown,
} from "react-icons/fa";

export default function SidebarGestion({ currentPath }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    JSON.parse(localStorage.getItem("sidebar:collapsed") || "false")
  );
  const [openGestion, setOpenGestion] = useState(
    currentPath.startsWith("/gestion")
  );

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    localStorage.setItem("sidebar:collapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (currentPath.startsWith("/gestion")) setOpenGestion(true);
  }, [currentPath]);

  return (
    <>
      {/* Burger */}
      <button
        type="button"
        aria-label={collapsed ? "Ouvrir le menu" : "Replier le menu"}
        onClick={() => setCollapsed(v => !v)}
        className="btn btn-dark sidebar-burger"
        title={collapsed ? "Ouvrir le menu" : "Replier le menu"}
      >
        {collapsed ? "☰" : "✕"}
      </button>

      <aside className="sidebar-root text-white">
        <div className="brand px-2 mb-3">
          <div className="brand-icon">🏢</div>
          {!collapsed && <div className="fw-bold mt-2">Gestion</div>}
        </div>

        <nav className="d-grid gap-1">
          <NavLink
            to="/gestion"
            end
            className={({ isActive }) =>
              "side-link d-flex align-items-center gap-2 px-3 py-2 rounded " +
              (isActive ? "active" : "")
            }
            title={collapsed ? "Dashboards" : undefined}
          >
            <FaTachometerAlt className="me-1" /> {!collapsed && "Dashboards"}
          </NavLink>

          {/* Section : Gestion des agences */}
          <button
            className={"side-section w-100 d-flex align-items-center justify-content-between px-3 py-2 rounded " + (openGestion ? "active" : "")}
            onClick={()=>setOpenGestion(v=>!v)}
            title={collapsed ? "Gestion des agences" : undefined}
          >
            <span className="d-flex align-items-center gap-2">
              <FaBuilding /> {!collapsed && "Gestion des agences"}
            </span>
            {!collapsed && <FaChevronDown style={{transform: openGestion ? "rotate(180deg)" : "none"}}/>}
          </button>

          {!collapsed && openGestion && (
            <div className="ps-4 d-grid gap-1">
              <NavLink
                to="/gestion/agences"
                className={({ isActive }) =>
                  "side-link small px-3 py-2 rounded " + (isActive ? "active" : "")
                }
              >
                Agences (tableau)
              </NavLink>
              <NavLink
                to="/gestion/agences/nouvelle-inscription"
                className={({ isActive }) =>
                  "side-link small px-3 py-2 rounded " + (isActive ? "active" : "")
                }
              >
                Nouvelle inscription
              </NavLink>
            </div>
          )}
        </nav>
      </aside>

      <style>{`
        .sidebar-burger{
          position: fixed; top: 12px; left: 12px; z-index: 1100;
          width: 38px; height: 38px; padding: 0; border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0,0,0,.25);
        }
        .sidebar-root{
          position: fixed; inset: 0 auto 0 0; height: 100vh;
          width: var(--sidebar-w-open);
          background: linear-gradient(180deg, #0f172a 0%, #111827 40%, #0b1020 100%);
          border-right: 1px solid rgba(255,255,255,.08);
          padding: 12px; display:flex; flex-direction:column; gap:8px; z-index:1090;
          transition: width .2s ease;
        }
        body.sidebar-collapsed .sidebar-root{ width: var(--sidebar-w-closed); }
        .brand-icon{
          width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,.1);
          display:grid; place-items:center; font-size: 20px;
        }
        .side-link{
          color: rgba(255,255,255,.75); text-decoration:none;
        }
        .side-link:hover{ color: #fff; background: rgba(255,255,255,.08); }
        .side-link.active{ background:#f8f9fa; color:#111; font-weight:600; }
        .side-section{
          background: transparent; border:0; color: rgba(255,255,255,.75);
          text-align: left; user-select: none;
        }
        .side-section:hover{ color:#fff; background: rgba(255,255,255,.08); }
        .side-section.active{ background:#f8f9fa; color:#111; font-weight:600; }
      `}</style>
    </>
  );
}
