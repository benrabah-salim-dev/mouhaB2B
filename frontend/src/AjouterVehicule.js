import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

const AjouterVehicule = () => {
  const { agence_id } = useParams();  // On récupère l'ID de l'agence depuis l'URL
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;

  const [type, setType] = useState('');
  const [marque, setMarque] = useState('');
  const [model, setModel] = useState('');
  const [capacite, setCapacite] = useState('');
  const [annee, setAnnee] = useState('');
  const [immatriculation, setImmatriculation] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Vérification pour s'assurer que 'agence_id' est bien défini
    if (!agence_id) {
      setError('L\'ID de l\'agence est manquant.');
      return;
    }

    try {
      const newVehicule = {
        type,
        marque,
        model,
        capacite,
        annee,
        immatriculation,
        agence: agence_id,  // On inclut l'ID de l'agence ici
      };

      const response = await axios.post(`${API_URL}/api/vehicules/`, newVehicule);
      navigate(`/agence/${agence_id}/ressources`); // Redirige vers la page des ressources de l'agence après ajout
    } catch (err) {
      console.error(err);
      setError('Erreur lors de l\'ajout du véhicule.');
    }
  };

  return (
    <div className="container mt-4">
      <h2>Ajouter un véhicule</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="type" className="form-label">Type</label>
          <select
            id="type"
            className="form-control"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          >
            <option value="">Choisir un type</option>
            <option value="bus">Bus</option>
            <option value="minibus">Minibus</option>
            <option value="MICROBUS">Microbus</option>
            <option value="4x4">4X4</option>
          </select>
        </div>

        <div className="mb-3">
          <label htmlFor="marque" className="form-label">Marque</label>
          <input
            type="text"
            id="marque"
            className="form-control"
            value={marque}
            onChange={(e) => setMarque(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label htmlFor="model" className="form-label">Modèle</label>
          <input
            type="text"
            id="model"
            className="form-control"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label htmlFor="capacite" className="form-label">Capacité</label>
          <input
            type="number"
            id="capacite"
            className="form-control"
            value={capacite}
            onChange={(e) => setCapacite(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label htmlFor="annee" className="form-label">Année</label>
          <input
            type="number"
            id="annee"
            className="form-control"
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label htmlFor="immatriculation" className="form-label">Numéro d'immatriculation</label>
          <input
            type="text"
            id="immatriculation"
            className="form-control"
            value={immatriculation}
            onChange={(e) => setImmatriculation(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary">Ajouter le véhicule</button>
      </form>
    </div>
  );
};

export default AjouterVehicule;
