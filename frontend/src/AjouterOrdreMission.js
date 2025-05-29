import React, { useEffect, useState } from 'react';
import axios from 'axios';

const AjouterOrdreMission = ({ missionId, onSuccess }) => {
  const [busList, setBusList] = useState([]);
  const [chauffeurList, setChauffeurList] = useState([]);

  const [bus, setBus] = useState('');
  const [chauffeur, setChauffeur] = useState('');
  const [dateDepart, setDateDepart] = useState('');
  const [dateRetour, setDateRetour] = useState('');
  const [trajet, setTrajet] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const API_URL = process.env.REACT_APP_API_URL;


  useEffect(() => {
    axios.get('{API_URL}/api/buses/')
      .then(res => setBusList(res.data))
      .catch(() => setError("Erreur chargement des bus"));

    axios.get('{API_URL}/api/chauffeurs/')
      .then(res => setChauffeurList(res.data))
      .catch(() => setError("Erreur chargement des chauffeurs"));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!bus || !chauffeur || !dateDepart || !dateRetour) {
      setError("Tous les champs sont obligatoires");
      return;
    }

    const data = {
      mission: missionId,
      bus,
      chauffeur,
      date_depart: dateDepart,
      date_retour: dateRetour,
      trajet,
    };

    axios.post('{API_URL}/api/ordres_mission/', data)
      .then(() => {
        setSuccess(true);
        setError(null);
        if (onSuccess) onSuccess();
      })
      .catch(() => {
        setError("Erreur lors de la création de l'ordre de mission");
        setSuccess(false);
      });
  };

  return (
    <div>
      <h2>Créer un ordre de mission</h2>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">Ordre de mission créé avec succès !</div>}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label>Bus</label>
          <select value={bus} onChange={e => setBus(e.target.value)} required className="form-select">
            <option value="">-- Sélectionnez un bus --</option>
            {busList.map(b => (
              <option key={b.id} value={b.id}>{b.immatriculation} - {b.marque}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label>Chauffeur</label>
          <select value={chauffeur} onChange={e => setChauffeur(e.target.value)} required className="form-select">
            <option value="">-- Sélectionnez un chauffeur --</option>
            {chauffeurList.map(c => (
              <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label>Date de départ</label>
          <input
            type="datetime-local"
            value={dateDepart}
            onChange={e => setDateDepart(e.target.value)}
            required
            className="form-control"
          />
        </div>

        <div className="mb-3">
          <label>Date de retour</label>
          <input
            type="datetime-local"
            value={dateRetour}
            onChange={e => setDateRetour(e.target.value)}
            required
            className="form-control"
          />
        </div>

        <div className="mb-3">
          <label>Trajet (optionnel)</label>
          <input
            type="text"
            value={trajet}
            onChange={e => setTrajet(e.target.value)}
            placeholder="Ex : Paris - Lyon"
            className="form-control"
          />
        </div>

        <button type="submit" className="btn btn-primary">Créer</button>
      </form>
    </div>
  );
};

export default AjouterOrdreMission;
