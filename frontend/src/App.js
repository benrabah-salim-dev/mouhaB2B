// src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import AgenceVoyageList from './AgenceVoyageList';
import AjouterAgence from './AjouterAgence';
import ModifierAgence from './ModifierAgence';
import BusList from './BusList';  // Route pour les bus
import ChauffeurList from './ChauffeurList';  // Route pour les chauffeurs
import AjouterBus from './AjouterBus';
import AjouterChauffeur from './AjouterChauffeur';
import DashboardAgence from './DashboardAgence';
import AjouterDossier from './AjouterDossier';   // <-- Import du composant ajouté
import OrdresMissionList from './OrdreMissionList';
import AjouterOrdreMission from './AjouterOrdreMission';
import ImporterDossier from './ImporterDossier';
import DossiersTable from './components/DossiersTable';
import FicheMouvement from './components/FicheMouvement';


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AgenceVoyageList />} />
        <Route path="/ajouter-agence" element={<AjouterAgence />} />
        <Route path="/modifier-agence/:agence_id" element={<ModifierAgence />} />
        <Route path="/agence/:agence_id/buses" element={<BusList />} />
        <Route path="/agence/:agence_id/chauffeurs" element={<ChauffeurList />} />
        <Route path="/ajouter-chauffeur/:agence_id" element={<AjouterChauffeur />} />
        <Route path="/ajouter-bus/:agence_id" element={<AjouterBus />} />
        <Route path="/agence/:agence_id/dashboard" element={<DashboardAgence />} />
        <Route path="/ajouter-dossier/:agence_id" element={<AjouterDossier />} />  
        <Route path="/agence/:agence_id/ordres-mission" element={<OrdresMissionList />} />
        <Route path="/mission/:mission_id/ajouter-ordre" element={<AjouterOrdreMission />} />
        <Route path="/importer-dossier/:agence_id" element={<ImporterDossier />} />
        <Route path="/DossierTable" element={<DossiersTable />} />
        <Route path="/FicheMouvement" element={<FicheMouvement />} />



      </Routes>
    </Router>
  );
}

export default App;
