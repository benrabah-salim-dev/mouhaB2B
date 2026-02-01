// src/AjouterBus.js

import React, { useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';

const AjouterBus = () => {
  const { agence_id } = useParams();
  const navigate = useNavigate();

  const [immatriculation, setImmatriculation] = useState('');
  const [marque, setMarque] = useState('');
  const [capacite, setCapacite] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const busData = { immatriculation, marque, capacite, agence: agence_id };

    axios.post('http://127.0.0.1:8000/api/buses/', busData)
      .then(response => {
        setSuccess(true);
        setError(null);
        setTimeout(() => {
          navigate(`/agence/${agence_id}/buses`);
        }, 2000);
      })
      .catch(error => {
        if (error.response && error.response.data) {
          setError(JSON.stringify(error.response.data));
        } else {
          setError('Erreur lors de l\'ajout du bus. Veuillez réessayer.');
        }
        setSuccess(false);
      });
  };

  return (
    <div className="container mt-5">
      <h2 className="mb-4">Ajouter un Bus à l'agence</h2>

      {success && (
        <div className="alert alert-success" role="alert">
          Le bus a été ajouté avec succès !
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Immatriculation</label>
          <input
            type="text"
            className="form-control"
            value={immatriculation}
            onChange={(e) => setImmatriculation(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Marque</label>
          <input
            type="text"
            className="form-control"
            value={marque}
            onChange={(e) => setMarque(e.target.value)}
            required
            placeholder="Exemple: Mercedes, Volvo"
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Capacité</label>
          <input
            type="number"
            className="form-control"
            value={capacite}
            onChange={(e) => setCapacite(e.target.value)}
            required
          />
        </div>

        <div className="mb-4">
          <button type="submit" className="btn btn-primary w-100">
            Ajouter le Bus
          </button>
        </div>

        <div className="text-center">
          <Link to={`/agence/${agence_id}/buses`} className="btn btn-secondary">
            Retour à la Liste des Buses
          </Link>
        </div>
      </form>
    </div>
  );
};

export default AjouterBus;
