import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

const AjouterChauffeur = () => {
  const { agence_id } = useParams(); // Récupère l'ID de l'agence depuis l'URL
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [cin, setCin] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const newChauffeur = {
        nom,
        prenom,
        cin,
        agence: agence_id, // Envoie l'ID de l'agence
      };

      const response = await axios.post(`${API_URL}/api/chauffeurs/`, newChauffeur);
      navigate(`/agence/${agence_id}/ressources`); // Redirige vers la page des ressources de l'agence
    } catch (err) {
      console.error(err);
      setError('Erreur lors de l\'ajout du chauffeur.');
    }
  };

  return (
    <div className="container mt-4">
      <h2>Ajouter un chauffeur</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="nom" className="form-label">Nom</label>
          <input
            type="text"
            id="nom"
            className="form-control"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label htmlFor="prenom" className="form-label">Prénom</label>
          <input
            type="text"
            id="prenom"
            className="form-control"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label htmlFor="cin" className="form-label">CIN</label>
          <input
            type="text"
            id="cin"
            className="form-control"
            value={cin}
            onChange={(e) => setCin(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary">Ajouter le chauffeur</button>
      </form>
    </div>
  );
};

export default AjouterChauffeur;
