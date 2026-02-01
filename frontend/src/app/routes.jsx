// src/app/routes.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "../components/ProtectedRoute";
import { AuthContext } from "../auth/AuthContext";
import AppShell from "./shells/AppShell";

// ====== Module Gestion ======
import GestionLayout from "../components/GestionSMEKS/GestionLayout";
import GestionDashboard from "../components/GestionSMEKS/GestionDashboard";
import AgencesList from "../components/GestionSMEKS/AgencesList";
import DemandesInscriptionList from "../components/GestionSMEKS/DemandesInscriptionList";
import ZonesPage from "../components/GestionSMEKS/Zones/ZonePage";
import SuiviMissions from "../components/GestionSMEKS/SuiviMissionsOM";

// ====== Pages existantes (espace agence) ======
import AgenceVoyageList from "../pages/agences/AgenceVoyageList";
import AjouterAgence from "../pages/agences/AjouterAgence";
import ModifierAgence from "../pages/agences/ModifierAgence";
import BusList from "../pages/ressources/BusList";
import ChauffeurList from "../pages/ressources/ChauffeurList";
import AjouterBus from "../pages/ressources/AjouterBus";
import AjouterChauffeur from "../pages/ressources/AjouterChauffeur";
import DashboardAgence from "../pages/agences/DashboardAgence";
import AjouterDossier from "../pages/dossiers/AjouterDossier";
import AjouterOrdreMission from "../pages/missions/AjouterOrdreMission";
import ImporterDossier from "../pages/dossiers/ImporterDossier";
import LoginPage from "../pages/LoginPage";
import HotelList from "../pages/hotels/HotelList";
import AgenceRessourcesHub from "../pages/ressources/RessourcesAgence";
import AjouterVehicule from "../pages/ressources/AjouterVehicule";
import RessourcesVehicules from "../pages/ressources/RessourcesVehicules";
import RessourcesChauffeurs from "../pages/ressources/RessourcesChauffeurs";
import FichesMouvementList from "../components/FicheMouvementList/FichesMouvementList";
import OrdresMissionList from "../pages/missions/OrdresMissionList";
import FicheMouvement from "../components/FicheMouvement/FicheMouvement";
import FicheMouvementRecap from "../components/FicheComponentOrdre/FicheMouvementRecap";
import TransfertsList from "../components/Missions/TransfertsList";
import TransfertNouvelle from "../components/Missions/TransfertNouvelle";
import FicheMouvementCreate from "../components/FicheMouvement/FicheMouvementCreate";
import ExcursionsPage from "../components/Excursions/ExcursionPage";
import PlanningPage from "../components/Pages/PlanningPage";
import PlanningGrid from "../components/Planning/PlanningGrid";
import MissionEdit from "../components/Missions/MissionEdit";
import TransfertsArchive from "../components/Missions/TransfertsArchive";
import MissionReplace from "../components/Missions/MissionReplace";

// ====== Espace fournisseur ======
import FournisseurTarifs from "../components/Fournisseur/FournisseurTarifs";

// Wizard public
import InscriptionAgenceWizard from "../components/Inscription";

/* --------- Redirections “intelligentes” par agence --------- */
function AgencyResolve({ segment }) {
  const ctx = React.useContext(AuthContext);
  const user = ctx?.user;
  const refreshing = !!ctx?.refreshing;

  if (refreshing) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = (user.role || "").toLowerCase();
  const agenceId = user.agence_id ?? null;

  if (role === "superadmin") return <Navigate to="/gestion/agences/demandes" replace />;
  if (agenceId) return <Navigate to={`/agence/${agenceId}/${segment}`} replace />;

  return <Navigate to="/login" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/inscription-agence" element={<InscriptionAgenceWizard />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* AGENCE + FOURNISSEUR (privé) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard/superadmin" element={<DashboardAgence />} />
          <Route path="/agence/:agence_id/dashboard" element={<DashboardAgence />} />

          {/* Fiches mouvement */}
          <Route path="/agence/:agence_id/fiches-mouvement" element={<FichesMouvementList />} />
          <Route path="/fiches-mouvement" element={<AgencyResolve segment="fiches-mouvement" />} />
          <Route path="/agence/:agence_id/mes-departs" element={<FichesMouvementList />} />
          <Route path="/agence/:agence_id/mes-arrivees" element={<FichesMouvementList />} />

          {/* Missions / OM */}
          <Route path="/missions/transferts" element={<TransfertsList />} />
          <Route path="/missions/transferts/archive" element={<TransfertsArchive />} />
          <Route path="/missions/nouvelle" element={<TransfertNouvelle />} />
          <Route path="/missions/:id" element={<MissionEdit />} />
          <Route path="/missions/:id/replace" element={<MissionReplace />} />
          <Route path="/ordres-mission" element={<OrdresMissionList />} />

          {/* Fiche mouvement + ordre + création */}
          <Route path="/agence/:agence_id/fiche-mouvement" element={<FicheMouvement />} />
          <Route path="/fiche-mouvement" element={<AgencyResolve segment="fiche-mouvement" />} />
          <Route path="/agence/:agence_id/fiche-mouvement/ordre" element={<FicheMouvementRecap />} />
          <Route path="/fiche-mouvement/ordre" element={<AgencyResolve segment="fiche-mouvement/ordre" />} />
          <Route path="/agence/:agence_id/fiche-mouvement/nouveau" element={<FicheMouvementCreate />} />

          {/* Excursions / Planning */}
          <Route path="/excursions" element={<ExcursionsPage />} />
          <Route path="/agence/:agence_id/planning" element={<PlanningPage />} />
          <Route path="/agence/:agence_id/planningTest" element={<PlanningGrid />} />
          <Route path="/planning" element={<AgencyResolve segment="planning" />} />

          {/* Hub ressources (agence) */}
          <Route element={<ProtectedRoute checkAgence={true} />}>
            <Route path="/agence/:agence_id/ressources" element={<AgenceRessourcesHub />} />
            <Route path="/agence/:agence_id/ressources/vehicules" element={<RessourcesVehicules />} />
            <Route path="/agence/:agence_id/ressources/chauffeurs" element={<RessourcesChauffeurs />} />
          </Route>

          {/* CRUD agences (superadmin) */}
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

          {/* Dossiers */}
          <Route path="/ajouter-dossier/:agence_id" element={<AjouterDossier />} />
          <Route path="/mission/:mission_id/ajouter-ordre" element={<AjouterOrdreMission />} />
          <Route path="/importer-dossier/:agence_id" element={<ImporterDossier />} />

          {/* Hotels */}
          <Route path="/hotels" element={<HotelList />} />

          {/* Fournisseur */}
          <Route path="/fournisseur/tarifs" element={<FournisseurTarifs />} />
        </Route>
      </Route>

      {/* GESTION (superadmin) */}
      <Route element={<ProtectedRoute requiredRole="superadmin" />}>
        <Route element={<GestionLayout />}>
          <Route path="/gestion" element={<GestionDashboard />} />
          <Route path="/gestion/agences" element={<AgencesList />} />
          <Route path="/gestion/suivi/missions-om" element={<SuiviMissions />} />
          <Route path="/gestion/agences/demandes" element={<DemandesInscriptionList />} />
          <Route path="/gestion/agences/zonage" element={<ZonesPage />} />
        </Route>
      </Route>

      {/* fallback */}
      <Route
        path="*"
        element={
          <ProtectedRoute requiredRole="superadmin">
            <Navigate to="/gestion/agences/demandes" replace />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
