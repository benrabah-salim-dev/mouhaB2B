// src/components/GestionSMEKS/GestionLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import SidebarGestion from "./SidebarGestion";

const SIDEBAR_OPEN = 220;   // largeur en px quand ouvert
const SIDEBAR_CLOSED = 64;  // largeur en px quand fermé

export default function GestionLayout() {
  return (
    <div className="gestion-layout-root">
      {/* Sidebar gestion (à gauche) */}
      <SidebarGestion />

      {/* Contenu principal */}
      <main className="gestion-main">
        <header className="gestion-header">
          <h1 className="gestion-title">Espace gestion</h1>
          <p className="gestion-subtitle">
            Administration des agences et des demandes d’inscription.
          </p>
        </header>

        <section className="gestion-content">
          <Outlet />
        </section>
      </main>

      <style>{`
        .gestion-layout-root {
          display: flex;
          min-height: 100vh;
          background: #0b1120;
          color: #0f172a;
        }

        .gestion-main {
          flex: 1;
          margin-left: ${SIDEBAR_OPEN}px;
          padding: 16px 20px;
          background: #f3f4f6;
          transition: margin-left .2s ease;
        }

        /* Quand le sidebar gestion est replié */
        body.gestion-sidebar-collapsed .gestion-main {
          margin-left: ${SIDEBAR_CLOSED}px;
        }

        .gestion-header {
          margin-bottom: 16px;
        }

        .gestion-title {
          font-size: 1.4rem;
          font-weight: 700;
          margin: 0;
          color: #111827;
        }

        .gestion-subtitle {
          margin: 4px 0 0;
          font-size: 0.9rem;
          color: #6b7280;
        }

        .gestion-content {
          background: #ffffff;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 10px 25px rgba(15,23,42,0.08);
        }

        @media (max-width: 768px) {
          .gestion-main {
            margin-left: ${SIDEBAR_CLOSED}px;
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
}
