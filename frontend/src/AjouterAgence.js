import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const AjouterAgence = () => {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const agenceData = { nom, email, adresse, telephone };

    axios.post('http://127.0.0.1:8000/api/agences/', agenceData)
      .then(() => {
        navigate('/');  // Redirige vers la liste des agences après ajout
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
        <button type="submit" className="btn btn-primary">Ajouter</button>
      </form>
    </div>
  );
};

export default AjouterAgence;
