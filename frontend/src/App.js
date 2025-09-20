// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

import ProtectedRoute from "./components/ProtectedRoute";
import { AuthContext } from "./context/AuthContext";

// Pages existantes
import AgenceVoyageList from "./AgenceVoyageList";
import AjouterAgence from "./AjouterAgence";
import ModifierAgence from "./ModifierAgence";
import BusList from "./BusList";
import ChauffeurList from "./ChauffeurList";
import AjouterBus from "./AjouterBus";
import AjouterChauffeur from "./AjouterChauffeur";
import DashboardAgence from "./DashboardAgence";
import AjouterDossier from "./AjouterDossier";
import AjouterOrdreMission from "./AjouterOrdreMission";
import ImporterDossier from "./ImporterDossier";
import DossiersTable from "./components/DossiersTable";
import LoginPage from "./components/Login";
import HotelList from "./HotelList";
import AgenceRessourcesHub from "./RessourcesAgence";
import AjouterVehicule from "./AjouterVehicule";
import RessourcesVehicules from "./RessourcesVehicules";
import RessourcesChauffeurs from "./RessourcesChauffeurs";
import FichesMouvementList from "./FichesMouvemenrList";
import OrdresMissionList from "./OrdresMissionList";
import FicheMouvement from "./components/FicheMouvement/FicheMouvement";


/* --------- Redirections “intelligentes” par agence --------- */
function AgencyResolve({ segment }) {
  // segment: 'fiche-mouvement' | 'fiches-mouvement' | 'dossiers' etc.
  const ctx = React.useContext(AuthContext);
  const agenceId = ctx?.user?.agence_id ?? null;
  const role = (ctx?.user?.role || "").toLowerCase();

  // pas logué → login
  if (!ctx?.user) return <Navigate to="/login" replace />;

  // si l’utilisateur est admin d’agence : on connait son agence
  if (agenceId) return <Navigate to={`/agence/${agenceId}/${segment}`} replace />;

  // superadmin sans agence dans l’URL → renvoi vers dashboard superadmin
  if (role === "superadmin") return <Navigate to="/dashboard/superadmin" replace />;

  // fallback
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* === Routes publiques === */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* === Routes privées protégées === */}
      <Route element={<ProtectedRoute />}>
        {/* Dashboards */}
        <Route path="/dashboard/superadmin" element={<DashboardAgence />} />
        <Route path="/agence/:agence_id/dashboard" element={<DashboardAgence />} />

        {/* Fiches mouvement LISTE (avec et sans agence_id) */}
        <Route path="/agence/:agence_id/fiches-mouvement" element={<FichesMouvementList />} />
        <Route path="/fiches-mouvement" element={<AgencyResolve segment="fiches-mouvement" />} />
                <Route path="/ordres-mission" element={<OrdresMissionList />} />

        {/* Fiche mouvement CREATION (avec et sans agence_id) */}
        <Route path="/agence/:agence_id/fiche-mouvement" element={<FicheMouvement />} />
        <Route path="/fiche-mouvement" element={<AgencyResolve segment="fiche-mouvement" />} />

        {/* Hub + ressources agence */}
        <Route element={<ProtectedRoute checkAgence={true} />}>
          <Route path="/agence/:agence_id/ressources" element={<AgenceRessourcesHub />} />
          <Route path="/agence/:agence_id/ressources/vehicules" element={<RessourcesVehicules />} />
          <Route path="/agence/:agence_id/ressources/chauffeurs" element={<RessourcesChauffeurs />} />
        </Route>

        {/* CRUD Agences (superadmin only) */}
        <Route element={<ProtectedRoute requiredRole="superadmin" />}>
          <Route path="/agence-liste" element={<AgenceVoyageList />} />
          <Route path="/ajouter-agence" element={<AjouterAgence />} />
          <Route path="/modifier-agence/:agence_id" element={<ModifierAgence />} />
        </Route>

        {/* Ressources internes agence */}
        <Route path="/agence/:agence_id/buses" element={<BusList />} />
        <Route path="/agence/:agence_id/chauffeurs" element={<ChauffeurList />} />
        <Route path="/ajouter-chauffeur/:agence_id" element={<AjouterChauffeur />} />
        <Route path="/ajouter-bus/:agence_id" element={<AjouterBus />} />
        <Route path="/agence/:agence_id/ajouter-vehicule" element={<AjouterVehicule />} />
        <Route path="/agence/:agence_id/ajouter-chauffeur" element={<AjouterChauffeur />} />

        {/* Dossiers / missions */}
        <Route path="/ajouter-dossier/:agence_id" element={<AjouterDossier />} />
        <Route path="/mission/:mission_id/ajouter-ordre" element={<AjouterOrdreMission />} />
        <Route path="/agence/:agence_id/dossiers" element={<DossiersTable />} />
        <Route path="/importer-dossier/:agence_id" element={<ImporterDossier />} />

        {/* Hotels */}
        <Route path="/hotels" element={<HotelList />} />
      </Route>

      {/* 404 → on redirige intelligemment selon le rôle si connecté */}
      <Route path="*" element={<Navigate to="/fiches-mouvement" replace />} />
    </Routes>
  );
}
