// src/App.js
import React from "react";
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import ProtectedRoute from "./components/ProtectedRoute";
import { AuthContext } from "./context/AuthContext";
import AppLayout from "./layout/AppLayout";

// ====== Module Gestion ======
import GestionLayout from "./components/GestionSMEKS/GestionLayout";
import GestionDashboard from "./components/GestionSMEKS/GestionDashboard";
import AgencesList from "./components/GestionSMEKS/AgencesList";
import DemandesInscriptionList from "./components/GestionSMEKS/DemandesInscriptionList";
import ZonesPage from "./components/GestionSMEKS/Zones/ZonePage"; 

// ====== Pages existantes (espace agence) ======
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
import FicheMouvementRecap from "./components/FicheComponentOrdre/FicheMouvementRecap";
import TransfertsList from "./components/Missions/TransfertsList";
import TransfertNouvelle from "./components/Missions/TransfertNouvelle";
import FicheMouvementCreate from "./components/FicheMouvement/FicheMouvementCreate";
import ExcursionsPage from "./components/Excursions/ExcursionPage";
import PlanningPage from "./components/Pages/PlanningPage";
import PlanningGrid from "./components/Planning/PlanningGrid";
import MissionEdit from "./components/Missions/MissionEdit";
import TransfertsArchive from "./components/Missions/TransfertsArchive";
import MissionReplace from "./components/Missions/MissionReplace";
import SuiviMissions from "./components/GestionSMEKS/SuiviMissionsOM";
// ====== Espace fournisseur ======
import FournisseurTarifs from "./components/Fournisseur/FournisseurTarifs";

// Wizard d’inscription publique
import InscriptionAgenceWizard from "./components/Inscription";
import PlanningTimeline from "./components/Planning/PlanningTimeline";

/* --------- Redirections “intelligentes” par agence --------- */
function AgencyResolve({ segment }) {
  const ctx = React.useContext(AuthContext);
  const user = ctx?.user;
  const refreshing = !!ctx?.refreshing;

  if (refreshing) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = (user.role || "").toLowerCase();
  const agenceId = user.agence_id ?? null;

  // superadmin : redirigé vers l’espace gestion
  if (role === "superadmin") {
    return <Navigate to="/gestion/agences/demandes" replace />;
  }

  // admin d’agence : on insère l’ID agence dans l’URL
  if (agenceId) {
    return <Navigate to={`/agence/${agenceId}/${segment}`} replace />;
  }

  return <Navigate to="/login" replace />;
}

/* --------- Shell global (Sidebar + TopBar) des pages protégées --------- */
function AppShell() {
  const ctx = React.useContext(AuthContext);
  const user = ctx?.user;

  const location = useLocation();
  const navigate = useNavigate();

  const agenceId = user?.agence_id || user?.profile?.agence || null;
  const agenceNom =
    user?.profile?.agence_nom || user?.agence_nom || "Mon Agence";

  const role = user?.profile?.role || user?.role || "admin";
  const refreshing = !!ctx?.refreshing;
  const onRefresh = ctx?.onRefresh || (() => {});
  const onLogout = ctx?.logout || (() => {});

  // 🔹 déduction de l'espace courant via l'URL
  const currentSpace = React.useMemo(() => {
    const p = location.pathname || "";
    if (p.startsWith("/fournisseur")) return "fournisseur";
    if (p.startsWith("/client")) return "client";
    if (p.startsWith("/succursale")) return "succursale";
    return "agence";
  }, [location.pathname]);

  // 🔹 changement d'espace depuis le TopBar
  const handleChangeSpace = (space) => {
    switch (space) {
      case "agence":
        if (agenceId) {
          navigate(`/agence/${agenceId}/dashboard`);
        } else {
          navigate("/dashboard/superadmin");
        }
        break;
      case "fournisseur":
        navigate("/fournisseur/tarifs");
        break;
      case "client":
        // placeholder pour plus tard
        navigate("/dashboard/superadmin");
        break;
      case "succursale":
        // placeholder pour plus tard
        navigate("/dashboard/superadmin");
        break;
      default:
        break;
    }
  };

  return (
    <AppLayout
      agenceId={agenceId}
      agenceNom={agenceNom}
      role={role}
      onLogout={onLogout}
      onRefresh={onRefresh}
      refreshing={refreshing}
      currentSpace={currentSpace}
      onChangeSpace={handleChangeSpace}
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

      {/* === Espace AGENCE + FOURNISSEUR (privé) === */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          {/* Dashboards Agence */}
          <Route path="/dashboard/superadmin" element={<DashboardAgence />} />
          <Route
            path="/agence/:agence_id/dashboard"
            element={<DashboardAgence />}
          />

          {/* Fiches mouvement LISTE + alias */}
          <Route
            path="/agence/:agence_id/fiches-mouvement"
            element={<FichesMouvementList />}
          />
          <Route
            path="/fiches-mouvement"
            element={<AgencyResolve segment="fiches-mouvement" />}
          />
          <Route
            path="/agence/:agence_id/mes-departs"
            element={<FichesMouvementList />}
          />
          <Route
            path="/agence/:agence_id/mes-arrivees"
            element={<FichesMouvementList />}
          />

          {/* Ordres de mission */}
          <Route path="/missions/transferts" element={<TransfertsList />} />
          <Route path="/missions/transferts/archive" element={<TransfertsArchive />} />
          <Route path="/missions/nouvelle" element={<TransfertNouvelle />} />
          <Route path="/missions/:id" element={<MissionEdit />} />
          <Route path="/missions/:id/replace" element={<MissionReplace />} />
<Route path="/ordres-mission" element={<OrdresMissionList />} />

          {/* Fiche mouvement + récap + création manuelle */}
          <Route
            path="/agence/:agence_id/fiche-mouvement"
            element={<FicheMouvement />}
          />
          <Route
            path="/fiche-mouvement"
            element={<AgencyResolve segment="fiche-mouvement" />}
          />
          <Route
            path="/agence/:agence_id/fiche-mouvement/ordre"
            element={<FicheMouvementRecap />}
          />
          <Route
            path="/fiche-mouvement/ordre"
            element={<AgencyResolve segment="fiche-mouvement/ordre" />}
          />
          <Route
            path="/agence/:agence_id/fiche-mouvement/nouveau"
            element={<FicheMouvementCreate />}
          />

                    <Route path="/excursions" element={<ExcursionsPage />} />
          <Route path="/agence/:agence_id/planning" element={<PlanningPage />} />
          <Route path="/agence/:agence_id/planningTest" element={<PlanningGrid />} />


          <Route path="/planning" element={<AgencyResolve segment="planning" />} />


          {/* Hub + ressources agence */}
          <Route element={<ProtectedRoute checkAgence={true} />}>
            <Route
              path="/agence/:agence_id/ressources"
              element={<AgenceRessourcesHub />}
            />
            <Route
              path="/agence/:agence_id/ressources/vehicules"
              element={<RessourcesVehicules />}
            />
            <Route
              path="/agence/:agence_id/ressources/chauffeurs"
              element={<RessourcesChauffeurs />}
            />
          </Route>

          {/* CRUD Agences (superadmin) */}
          <Route element={<ProtectedRoute requiredRole="superadmin" />}>
            <Route path="/agence-liste" element={<AgenceVoyageList />} />
            <Route path="/ajouter-agence" element={<AjouterAgence />} />
            <Route
              path="/modifier-agence/:agence_id"
              element={<ModifierAgence />}
            />
          </Route>

          {/* Ressources internes agence */}
          <Route path="/agence/:agence_id/buses" element={<BusList />} />
          <Route
            path="/agence/:agence_id/chauffeurs"
            element={<ChauffeurList />}
          />
          <Route
            path="/ajouter-chauffeur/:agence_id"
            element={<AjouterChauffeur />}
          />
          <Route
            path="/ajouter-bus/:agence_id"
            element={<AjouterBus />}
          />
          <Route
            path="/agence/:agence_id/ajouter-vehicule"
            element={<AjouterVehicule />}
          />
          <Route
            path="/agence/:agence_id/ajouter-chauffeur"
            element={<AjouterChauffeur />}
          />

          {/* Dossiers / missions */}
          <Route
            path="/ajouter-dossier/:agence_id"
            element={<AjouterDossier />}
          />
          <Route
            path="/mission/:mission_id/ajouter-ordre"
            element={<AjouterOrdreMission />}
          />
          <Route
            path="/agence/:agence_id/dossiers"
            element={<DossiersTable />}
          />
          <Route
            path="/importer-dossier/:agence_id"
            element={<ImporterDossier />}
          />

          {/* Hotels */}
          <Route path="/hotels" element={<HotelList />} />

          {/* === ESPACE FOURNISSEUR === */}
          <Route
            path="/fournisseur/tarifs"
            element={<FournisseurTarifs />}
          />
        </Route>
      </Route>

      {/* === Espace GESTION (superadmin) === */}
      <Route element={<ProtectedRoute requiredRole="superadmin" />}>
        <Route element={<GestionLayout />}>
          <Route path="/gestion" element={<GestionDashboard />} />
          <Route path="/gestion/agences" element={<AgencesList />} />
          <Route path="/gestion/suivi/missions-om" element={<SuiviMissions />} />
          <Route
            path="/gestion/agences/demandes"
            element={<DemandesInscriptionList />}
          />
          <Route
            path="/gestion/agences/zonage"
            element={<ZonesPage />}
          />
        </Route>
      </Route>

      {/* 404 → renvoi vers la gestion */}
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
