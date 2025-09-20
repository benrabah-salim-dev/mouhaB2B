// src/AjouterDossier.js

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';

const AjouterDossier = () => {
  const { agence_id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // États pour chaque champ
  const [reference, setReference] = useState('');
  const [pays, setPays] = useState('');
  const [aeroportArrivee, setAeroportArrivee] = useState('');
  const [numVolArrivee, setNumVolArrivee] = useState('');
  const [heureArrivee, setHeureArrivee] = useState('');
  const [hotelId, setHotelId] = useState('');
  const [nombrePersonnesArrivee, setNombrePersonnesArrivee] = useState('');
  const [nomReservation, setNomReservation] = useState('');
  const [aeroportDepart, setAeroportDepart] = useState('');
  const [heureDepart, setHeureDepart] = useState('');
  const [numVolRetour, setNumVolRetour] = useState('');
  const [nombrePersonnesRetour, setNombrePersonnesRetour] = useState('');

  const [hotels, setHotels] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Charger la liste des hôtels
  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/hotels/')
      .then(res => setHotels(res.data))
      .catch(() => setHotels([]));
  }, []);

  // Préremplir le formulaire si les données sont passées via la navigation (import ou édition)
  useEffect(() => {
    if (location.state?.dossier) {
      const d = location.state.dossier;
      setReference(d.reference || '');
      setPays(d.pays || '');
      setAeroportArrivee(d.aeroport_arrivee || '');
      setNumVolArrivee(d.num_vol_arrivee || '');
      setHeureArrivee(d.heure_arrivee ? d.heure_arrivee.slice(0,16) : ''); // tronquer le datetime string
      setHotelId(d.hotel || '');
      setNombrePersonnesArrivee(d.nombre_personnes_arrivee || '');
      setNomReservation(d.nom_reservation || '');
      setAeroportDepart(d.aeroport_depart || '');
      setHeureDepart(d.heure_depart ? d.heure_depart.slice(0,16) : '');
      setNumVolRetour(d.num_vol_retour || '');
      setNombrePersonnesRetour(d.nombre_personnes_retour || '');
    }
  }, [location.state]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const dossierData = {
      reference,
      agence: agence_id,
      pays,
      aeroport_arrivee: aeroportArrivee,
      num_vol_arrivee: numVolArrivee,
      heure_arrivee: heureArrivee,
      hotel: hotelId,
      nombre_personnes_arrivee: nombrePersonnesArrivee,
      nom_reservation: nomReservation,
      aeroport_depart: aeroportDepart,
      heure_depart: heureDepart,
      num_vol_retour: numVolRetour,
      nombre_personnes_retour: nombrePersonnesRetour,
      touristes: [],  // Ajouter ce champ obligatoire, même vide    
      };

    axios.post('http://127.0.0.1:8000/api/dossiers/', dossierData)
      .then(() => {
        setSuccess(true);
        setError(null);
        setTimeout(() => navigate(`/agence/${agence_id}/dashboard`), 2000);
      })
      .catch(() => {
        setError("Erreur lors de l'ajout du dossier. Veuillez vérifier les champs.");
        setSuccess(false);
      });
  };

  return (
    <div className="container mt-5">
      <h2 className="mb-4">Ajouter un Dossier à l'agence</h2>

      {success && <div className="alert alert-success">Dossier ajouté avec succès !</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>

        <div className="mb-3">
          <label className="form-label">Référence du dossier</label>
          <input
            type="text"
            className="form-control"
            value={reference}
            onChange={e => setReference(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Pays</label>
          <input
            type="text"
            className="form-control"
            value={pays}
            onChange={e => setPays(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Aéroport d'arrivée</label>
          <input
            type="text"
            className="form-control"
            value={aeroportArrivee}
            onChange={e => setAeroportArrivee(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Numéro de vol arrivée</label>
          <input
            type="text"
            className="form-control"
            value={numVolArrivee}
            onChange={e => setNumVolArrivee(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Heure d'arrivée</label>
          <input
            type="datetime-local"
            className="form-control"
            value={heureArrivee}
            onChange={e => setHeureArrivee(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Hôtel</label>
          <select 
            className="form-select" 
            value={hotelId} 
            onChange={e => setHotelId(e.target.value)} 
            required
          >
            <option value="">-- Sélectionner un hôtel --</option>
            {hotels.map(hotel => (
              <option key={hotel.id} value={hotel.id}>{hotel.nom}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label">Nombre de personnes à l'arrivée</label>
          <input
            type="number"
            className="form-control"
            value={nombrePersonnesArrivee}
            onChange={e => setNombrePersonnesArrivee(e.target.value)}
            required
            min={1}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Nom de la réservation</label>
          <input
            type="text"
            className="form-control"
            value={nomReservation}
            onChange={e => setNomReservation(e.target.value)}
            required
          />
        </div>

        <hr />

        <div className="mb-3">
          <label className="form-label">Aéroport de départ (retour)</label>
          <input
            type="text"
            className="form-control"
            value={aeroportDepart}
            onChange={e => setAeroportDepart(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Heure de départ (retour)</label>
          <input
            type="datetime-local"
            className="form-control"
            value={heureDepart}
            onChange={e => setHeureDepart(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Numéro de vol retour</label>
          <input
            type="text"
            className="form-control"
            value={numVolRetour}
            onChange={e => setNumVolRetour(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Nombre de personnes au retour</label>
          <input
            type="number"
            className="form-control"
            value={nombrePersonnesRetour}
            onChange={e => setNombrePersonnesRetour(e.target.value)}
            required
            min={1}
          />
        </div>

        <button type="submit" className="btn btn-primary w-100 mb-3">Ajouter le dossier</button>

        <Link to={`/agence/${agence_id}/dashboard`} className="btn btn-secondary w-100">
          Retour au tableau de bord
        </Link>

      </form>
    </div>
  );
};

export default AjouterDossier;
