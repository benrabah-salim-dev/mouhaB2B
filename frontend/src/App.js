// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import AgenceVoyageList from './AgenceVoyageList';
import AjouterAgence from './AjouterAgence';
import ModifierAgence from './ModifierAgence';
import BusList from './BusList';
import ChauffeurList from './ChauffeurList';
import AjouterBus from './AjouterBus';
import AjouterChauffeur from './AjouterChauffeur.js';
import DashboardAgence from './DashboardAgence';
import AjouterDossier from './AjouterDossier';
import AjouterOrdreMission from './AjouterOrdreMission';
import ImporterDossier from './ImporterDossier';
import DossiersTable from './components/DossiersTable';
import FicheMouvement from './components/FicheMouvement';
import LoginPage from './components/Login';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <Router>
      <Routes>
        {/* Routes publiques */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Routes privées */}
        <Route path="/dashboard/superadmin" element={<DashboardAgence />} />
        <Route path="/agence/:agence_id/dashboard" element={<DashboardAgence />} />

        <Route path="/agence-liste" element={<AgenceVoyageList />} />
        <Route path="/ajouter-agence" element={<AjouterAgence />} />
        <Route path="/modifier-agence/:agence_id" element={<ModifierAgence />} />
        <Route path="/agence/:agence_id/buses" element={<BusList />} />
        <Route path="/agence/:agence_id/chauffeurs" element={<ChauffeurList />} />
        <Route path="/ajouter-chauffeur/:agence_id" element={<AjouterChauffeur />} />
        <Route path="/ajouter-bus/:agence_id" element={<AjouterBus />} />

        <Route path="/ajouter-dossier/:agence_id" element={<AjouterDossier />} />

        <Route path="/mission/:mission_id/ajouter-ordre" element={<AjouterOrdreMission />} />
        <Route path="/DossierTable" element={<DossiersTable />} />
        <Route path="/FicheMouvement" element={<FicheMouvement />} />
        <Route path="/importer-dossier/:agence_id" element={<ImporterDossier />} />
      </Routes>
    </Router>
  );
}

export default App;
