import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const RessourcesAgence = () => {
  const { agence_id } = useParams(); // On récupère l'ID de l'agence dans l'URL
  const navigate = useNavigate();
  const [vehicules, setVehicules] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    const fetchRessources = async () => {
      try {
        const vehiculesRes = await axios.get(`${API_URL}/api/vehicules/?agence=${agence_id}`);
        setVehicules(vehiculesRes.data);

        const chauffeursRes = await axios.get(`${API_URL}/api/chauffeurs/?agence=${agence_id}`);
        setChauffeurs(chauffeursRes.data);
      } catch (err) {
        setError('Erreur lors du chargement des ressources.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRessources();
  }, [agence_id, API_URL]);

  if (loading) return <p>Chargement des ressources...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div className="container mt-4">
      <h2>Ressources de l'agence</h2>


      <h3>Véhicules</h3>
      
      {/* Bouton pour ajouter un véhicule */}
      <button
  className="btn btn-primary"
  onClick={() => navigate(`/agence/${agence_id}/ajouter-vehicule`)} // Bouton pour ajouter un véhicule
>
  Ajouter un véhicule
</button>
      <table className="table table-striped">
        <thead>
          <tr>
            <th>Type</th>
            <th>Marque</th>
            <th>Model</th>
            <th>Capacité</th>
            <th>Année</th>
            <th>Numéro d'immatriculation</th>
            <th>Disponibilité</th>
          </tr>
        </thead>
        <tbody>
          {vehicules.map((vehicule) => (
            <tr key={vehicule.immatriculation}>
              <td>{vehicule.type}</td>
              <td>{vehicule.marque}</td>
              <td>{vehicule.model}</td>
              <td>{vehicule.capacite}</td>
              <td>{vehicule.annee}</td>
              <td>{vehicule.immatriculation}</td>
              <td>{vehicule.disponibilite ? 'Disponible' : 'Indisponible'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Chauffeurs</h3>
            {/* Bouton pour ajouter un chauffeur */}
            <button
  className="btn btn-success"
  onClick={() => navigate(`/agence/${agence_id}/ajouter-chauffeur`)} // Bouton pour ajouter un chauffeur
>
  Ajouter un chauffeur
</button>
      <table className="table table-striped">
        <thead>
          <tr>
            <th>CIN</th>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Disponibilité</th>
          </tr>
        </thead>
        <tbody>
          {chauffeurs.map((chauffeur) => (
            <tr key={chauffeur.id}>
             <td>{chauffeur.cin}</td>
              <td>{chauffeur.nom}</td>
              <td>{chauffeur.prenom}</td>
              <td>{chauffeur.disponible ? 'Disponible' : 'Indisponible'}</td>
            </tr>
          ))}
        </tbody>
      </table>


    </div>
  );
};

export default RessourcesAgence;
