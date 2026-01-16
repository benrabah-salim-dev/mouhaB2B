// src/layout/FournisseurLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import SidebarFournisseur from "../SidebarFournisseur";
import TopBar from "../components/TopBar";

export default function FournisseurLayout() {
  return (
    <div className="app-root d-flex flex-column" style={{ minHeight: "100vh" }}>
      {/* Topbar commun, mais avec l'espace "fournisseur" actif */}
      <TopBar activeSpace="fournisseur" />

      <div className="d-flex flex-grow-1">
        <SidebarFournisseur />

        <main className="flex-grow-1 p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
