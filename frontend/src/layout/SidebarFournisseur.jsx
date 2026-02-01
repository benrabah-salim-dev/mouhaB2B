// src/ui/SidebarFournisseur.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { FaTachometerAlt, FaEuroSign } from "react-icons/fa";

const SIDEBAR_WIDTH = 230;

export default function SidebarFournisseur() {
  return (
    <aside
      className="bg-dark text-light"
      style={{ width: SIDEBAR_WIDTH, minHeight: "100%" }}
    >
      <div className="p-3 border-bottom border-secondary">
        <div className="fw-bold">Espace fournisseur</div>
        <div className="small text-muted">Gestion du matériel</div>
      </div>

      <nav className="nav flex-column p-2">
        <NavLink
          to="/fournisseur"
          end
          className={({ isActive }) =>
            "nav-link d-flex align-items-center gap-2 text-light " +
            (isActive ? "active fw-semibold" : "text-opacity-75")
          }
        >
          <FaTachometerAlt />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/fournisseur/tarifs"
          className={({ isActive }) =>
            "nav-link d-flex align-items-center gap-2 text-light " +
            (isActive ? "active fw-semibold" : "text-opacity-75")
          }
        >
          <FaEuroSign />
          <span>Gestion des tarifs</span>
        </NavLink>
      </nav>
    </aside>
  );
}
