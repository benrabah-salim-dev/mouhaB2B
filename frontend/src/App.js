// src/App.js
import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import ProtectedRoute from "./components/ProtectedRoute";
import { AuthContext } from "./context/AuthContext";
import AppLayout from "./layout/AppLayout";

// ====== (NOUVEAU) Module Gestion ======
import GestionLayout from "./components/GestionSMEKS/GestionDashboard";
import GestionDashboard from "./components/GestionSMEKS/GestionDashboard";
import AgencesList from "./components/GestionSMEKS/AgencesList";
import AgencesNouvelleInscription from "./components/GestionSMEKS/AgencesNouvelleInscription";

// ====== Pages existantes ======
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
import FichesMouvementList from "./components/FicheMouvementList/FichesMouvementList";
import OrdresMissionList from "./OrdresMissionList";
import FicheMouvement from "./components/FicheMouvement/FicheMouvement";
import FicheMouvementOrdre from "./components/FicheComponentOrdre/FicheMouvementOrdre";

// 👉 NEW: wizard d’inscription (publique)
import InscriptionAgenceWizard from "./components/Inscription";

/* --------- Redirections “intelligentes” par agence --------- */
function AgencyResolve({ segment }) {
  const ctx = React.useContext(AuthContext);
  const user = ctx?.user;
  const agenceId = user?.agence_id ?? null;
  const role = (user?.role || "").toLowerCase();

  if (!user) return <Navigate to="/login" replace />;
  if (agenceId) return <Navigate to={`/agence/${agenceId}/${segment}`} replace />;
  if (role === "superadmin") return <Navigate to="/gestion" replace />; // superadmin → Gestion
  return <Navigate to="/login" replace />;
}

/* --------- Shell global (Sidebar + TopBar) des pages “agence” --------- */
function AppShell() {
  const ctx = React.useContext(AuthContext);
  const user = ctx?.user;

  const agenceId = user?.agence_id;
  const agenceNom = user?.agence_nom || "Mon Agence";
  const role = user?.role || "admin";
  const refreshing = !!ctx?.refreshing;
  const onRefresh = ctx?.onRefresh || (() => {});
  const onLogout = ctx?.logout || (() => {});

  return (
    <AppLayout
      agenceId={agenceId}
      agenceNom={agenceNom}
      role={role}
      onLogout={onLogout}
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      <Outlet />
    </AppLayout>
  );
}

export default function App() {
  return (
    <Routes>
      {/* === Routes publiques === */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/inscription-agence" element={<InscriptionAgenceWizard />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* === Routes privées protégées === */}
      <Route element={<ProtectedRoute />}>
        {/* ===== Bloc “AGENCE” existant (shell AppLayout) ===== */}
        <Route element={<AppShell />}>
          {/* Dashboards Agence / compat legacy */}
          <Route path="/dashboard/superadmin" element={<DashboardAgence />} />
          <Route path="/agence/:agence_id/dashboard" element={<DashboardAgence />} />

          {/* Fiches mouvement LISTE + raccourcis intelligents */}
          <Route path="/agence/:agence_id/fiches-mouvement" element={<FichesMouvementList />} />
          <Route path="/fiches-mouvement" element={<AgencyResolve segment="fiches-mouvement" />} />
          <Route path="/agence/:agence_id/mes-departs" element={<FichesMouvementList />} />
          <Route path="/agence/:agence_id/mes-arrivees" element={<FichesMouvementList />} />

          {/* Ordres de mission (global) */}
          <Route path="/ordres-mission" element={<OrdresMissionList />} />

          {/* Fiche mouvement CREATION + ORDRE */}
          <Route path="/agence/:agence_id/fiche-mouvement" element={<FicheMouvement />} />
          <Route path="/fiche-mouvement" element={<AgencyResolve segment="fiche-mouvement" />} />
          <Route path="/agence/:agence_id/fiche-mouvement/ordre" element={<FicheMouvementOrdre />} />
          <Route path="/fiche-mouvement/ordre" element={<FicheMouvementOrdre />} />

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

        {/* ===== Bloc “GESTION” (nouveau shell GestionLayout) ===== */}
        <Route element={<GestionLayout />}>
          <Route path="/gestion" element={<GestionDashboard />} />
          <Route path="/gestion/agences" element={<AgencesList />} />
          <Route path="/gestion/agences/nouvelle-inscription" element={<AgencesNouvelleInscription />} />
        </Route>
      </Route>

      {/* 404 → renvoi vers le nouveau Dashboard Gestion */}
      <Route path="*" element={<Navigate to="/gestion" replace />} />
    </Routes>
  );
}
