import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const AjouterAgence = () => {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [tourOperateurs, setTourOperateurs] = useState([]);
  const [tourOperateurId, setTourOperateurId] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';
  

  useEffect(() => {
    axios.get(`${API_URL}/api/tour-operateurs/`)
      .then((res) => setTourOperateurs(res.data))
      .catch((err) => {
        console.error('Erreur chargement tour-opérateurs :', err);
        setError('Erreur lors du chargement des tour-opérateurs.');
      });
  },[]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const agenceData = {
      nom,
      email,
      adresse,
      telephone,
      tour_operateur: tourOperateurId || null
    };

    axios.post(`${API_URL}/api/agences/`, agenceData)
      .then(() => {
        navigate('/dashboard/superadmin');
      })
      .catch((err) => {
        console.error('Erreur lors de l\'ajout de l\'agence:', err);
        setError('Une erreur est survenue lors de l\'ajout. Veuillez réessayer.');
      });
  };
  

  return (
    <div className="container mt-5" style={{ maxWidth: '500px' }}>
      <h2>Ajouter une Agence de Voyage</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label>Nom</label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="form-control"
          />
        </div>
        <div className="mb-3">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="form-control"
          />
        </div>
        <div className="mb-3">
          <label>Adresse</label>
          <input
            type="text"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            required
            className="form-control"
          />
        </div>
        <div className="mb-3">
          <label>Téléphone</label>
          <input
            type="text"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            required
            className="form-control"
          />
        </div>
        <div className="mb-3">
          <label>Tour Opérateur</label>
          <select
      className="form-control"
      value={tourOperateurId}
      onChange={(e) => setTourOperateurId(e.target.value)}
    >
      <option value="">-- Sélectionner --</option>
      <option value="">None</option>

      {tourOperateurs.map((op) => (
        <option key={op.id} value={op.id}>
          {op.nom}
        </option>
      ))}
    </select>
        </div>

        <button type="submit" className="btn btn-primary">Ajouter</button>
      </form>
    </div>
  );
};

export default AjouterAgence;
