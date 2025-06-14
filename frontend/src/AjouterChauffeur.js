// src/AjouterChauffeur.js

import React, { useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';

const AjouterChauffeur = () => {
  const { agence_id } = useParams();
  const navigate = useNavigate();

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [cin, setCin] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const API_URL = process.env.REACT_APP_API_URL;


  const handleSubmit = (e) => {
    e.preventDefault();

    const chauffeurData = {
      nom,
      prenom,
      cin,
      agence: agence_id,
    };

    axios.post(`${API_URL}/api/chauffeurs/`, chauffeurData)
      .then(response => {
        setSuccess(true);
        setError(null);
        setTimeout(() => {
          navigate(`/agence/${agence_id}/chauffeurs`);
        }, 2000);
      })
      .catch(error => {
        if (error.response && error.response.data) {
          setError(JSON.stringify(error.response.data));
        } else {
          setError("Erreur lors de l'ajout du chauffeur. Veuillez réessayer.");
        }
        setSuccess(false);
      });
  };

  return (
    <div className="container mt-5">
      <h2 className="mb-4">Ajouter un Chauffeur à l'agence</h2>

      {success && (
        <div className="alert alert-success" role="alert">
          Le chauffeur a été ajouté avec succès !
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Nom</label>
          <input
            type="text"
            className="form-control"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Prénom</label>
          <input
            type="text"
            className="form-control"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">CIN</label>
          <input
            type="text"
            className="form-control"
            value={cin}
            onChange={(e) => setCin(e.target.value)}
            required
          />
        </div>

        <div className="mb-4">
          <button type="submit" className="btn btn-primary w-100">
            Ajouter le Chauffeur
          </button>
        </div>

        <div className="text-center">
          <Link to={`/agence/${agence_id}/chauffeurs`} className="btn btn-secondary">
            Retour à la Liste des Chauffeurs
          </Link>
        </div>
      </form>
    </div>
  );
};

export default AjouterChauffeur;
