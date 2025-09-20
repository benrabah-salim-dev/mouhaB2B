// src/components/ImporterDossier.js
import React, { useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const ImporterDossier = () => {
  const { agence_id } = useParams();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dossiersImportes, setDossiersImportes] = useState([]);
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setMessage('Veuillez choisir un fichier Excel.');
      return;
    }
    setLoading(true);
    setMessage('');
    setDossiersImportes([]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('agence', agence_id); // Nous envoyons l'ID de l'agence pour l'associer

    try {
      const response = await axios.post(`${API_URL}/importer-dossier/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Vérifier si les dossiers sont bien importés
      if (response.data.dossiers_crees) {
        setDossiersImportes(response.data.dossiers_crees);
        setMessage('Importation réussie !');
      } else {
        setMessage('Aucun dossier importé.');
      }
    } catch (error) {
      setMessage('Erreur lors de l\'importation.');
      console.error('Erreur importation:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <h2>Importer un fichier Excel pour les dossiers</h2>
      {message && <div className="alert alert-info">{message}</div>}

      <form onSubmit={handleUpload}>
        <div className="mb-3">
          <input type="file" accept=".xls,.xlsx" onChange={handleFileChange} className="form-control" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Importation...' : 'Importer'}
        </button>
      </form>

      {dossiersImportes.length > 0 && (
        <>
          <h3 className="mt-4">Dossiers importés</h3>
          <table className="table table-bordered">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Pays</th>
                <th>Nom Réservation</th>
                <th>Nombre personnes arrivée</th>
                <th>Aéroport arrivée</th>
                <th>Aéroport départ</th>
                {/* Ajoute d'autres colonnes si besoin */}
              </tr>
            </thead>
            <tbody>
              {dossiersImportes.map(dossier => (
                <tr key={dossier.id}>
                  <td>{dossier.reference}</td>
                  <td>{dossier.pays}</td>
                  <td>{dossier.nom_reservation}</td>
                  <td>{dossier.nombre_personnes_arrivee}</td>
                  <td>{dossier.aeroport_arrivee}</td>
                  <td>{dossier.aeroport_depart}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-secondary" onClick={() => navigate(`/dashboard/${agence_id}`)}>
            Retour au dashboard
          </button>
        </>
      )}
    </div>
  );
};

export default ImporterDossier;