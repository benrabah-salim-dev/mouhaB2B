import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';

function FicheMouvementForm() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const selectedDossiers = state?.selectedDossiers || [];

  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [vehicules, setVehicules] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [vehiculeId, setVehiculeId] = useState('');
  const [chauffeurId, setChauffeurId] = useState('');
  const [message, setMessage] = useState('');

  const API_URL = process.env.REACT_APP_API_URL;

  // Étapes du trajet 
  const [etapes, setEtapes] = useState(['', '']); // Minimum départ + arrivée

  const handleEtapeChange = (index, value) => {
    const newEtapes = [...etapes];
    newEtapes[index] = value;
    setEtapes(newEtapes);
  };

  const ajouterEtape = () => setEtapes([...etapes, '']);

  const trajetFinal = etapes.filter(e => e.trim() !== '').join(' ➝ ');

  useEffect(() => {
    axios.get('{API_URL}/api/vehicules/')
      .then(res => setVehicules(res.data))
      .catch(err => console.error("Erreur véhicules :", err));

    axios.get('{API_URL}/api/chauffeurs/')
      .then(res => setChauffeurs(res.data))
      .catch(err => console.error("Erreur chauffeurs :", err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!trajetFinal || !dateDebut || !dateFin || !vehiculeId || !chauffeurId || selectedDossiers.length === 0) {
      setMessage('Veuillez remplir tous les champs et sélectionner au moins un dossier.');
      return;
    }

    try {
        
        await
         axios.post(
            '{API_URL}/api/creer-fiche-mouvement/',
            JSON.stringify({
              dossier_references: selectedDossiers,
              trajet: trajetFinal,
              date_debut: dateDebut,
              date_fin: dateFin,
              bus_id: vehiculeId,
              chauffeur_id: chauffeurId
            }),
            {
              headers: {
                'Content-Type': 'application/json; charset=utf-8'
              }
            }
          );
          
          
          

      setMessage('Fiche de mouvement créée avec succès.');
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setMessage("Erreur lors de la création de la fiche.");
      console.error(err);
    }
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-3">Créer une Fiche de Mouvement</h2>

      {message && <div className="alert alert-info">{message}</div>}

      <div className="mb-3">
        <strong>Dossiers sélectionnés :</strong>
        <ul>
          {selectedDossiers.map(ref => (
            <li key={ref}>{ref} / {}</li>
          ))}
        </ul>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label>Trajet</label>
          {etapes.map((etape, index) => (
            <input
              key={index}
              type="text"
              className="form-control mb-1"
              placeholder={`Étape ${index + 1}`}
              value={etape}
              onChange={e => handleEtapeChange(index, e.target.value)}
              required={index < 2} // départ et arrivée obligatoires
            />
          ))}
          <button type="button" className="btn btn-sm btn-secondary mt-2" onClick={ajouterEtape}>
            Ajouter une étape
          </button>
        </div>

        <div className="mb-3">
          <label>Date Début</label>
          <input type="datetime-local" className="form-control" value={dateDebut} onChange={e => setDateDebut(e.target.value)} required />
        </div>

        <div className="mb-3">
          <label>Date Fin</label>
          <input type="datetime-local" className="form-control" value={dateFin} onChange={e => setDateFin(e.target.value)} required />
        </div>

        <div className="mb-3">
          <label>Véhicule</label>
          <select className="form-select" value={vehiculeId} onChange={e => setVehiculeId(e.target.value)} required>
            <option value="">-- Choisir un véhicule --</option>
            {vehicules.map(v => (
              <option key={v.id} value={v.id}>{v.type} {v.marque} {v.model} ({v.immatriculation})</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label>Chauffeur</label>
          <select className="form-select" value={chauffeurId} onChange={e => setChauffeurId(e.target.value)} required>
            <option value="">-- Choisir un chauffeur --</option>
            {chauffeurs.map(c => (
              <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-success">Créer l'ordre de mission</button>
      </form>
    </div>
  );
}

export default FicheMouvementForm;
