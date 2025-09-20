// src/OrdresMissionList.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';

const OrdresMissionList = () => {
  const { agence_id } = useParams();
  const [ordres, setOrdres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;


  useEffect(() => {
    // Attention, il faut que ton API accepte ce filtre agence_id
    axios.get(`{API_URL}/api/ordres_mission/?agence=${agence_id}`)
      .then(res => {
        setOrdres(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError('Erreur lors du chargement des ordres de mission');
        setLoading(false);
      });
  }, [agence_id]);

  if (loading) return <p>Chargement des ordres de mission...</p>;
  if (error) return <p style={{color:'red'}}>{error}</p>;

  return (
    <div className="container mt-4">
      <h2>Ordres de mission de l'agence</h2>
      {ordres.length === 0 ? (
        <p>Aucun ordre de mission trouvé.</p>
      ) : (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Mission</th>
              <th>Bus</th>
              <th>Chauffeur</th>
              <th>Date départ</th>
              <th>Date retour</th>
              <th>Trajet</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ordres.map(ordre => (
              <tr key={ordre.id}>
                <td>{ordre.reference}</td>
                <td>{ordre.mission_reference}</td>
                <td>{ordre.bus_immatriculation}</td>
                <td>{ordre.chauffeur_nom}</td>
                <td>{new Date(ordre.date_depart).toLocaleDateString()}</td>
                <td>{new Date(ordre.date_retour).toLocaleDateString()}</td>
                <td>{ordre.trajet}</td>
                <td>
                <a
                 className="btn btn-sm btn-primary"
                 href={`{API_URL}/api/ordre-mission/${ordre.id}/pdf/`}
                 target="_blank"
                rel="noopener noreferrer"
                >
                PDF
                </a>

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn btn-secondary mt-3" onClick={() => navigate()}>
        Retour au Dashboard
      </button>
    </div>
  );
};

export default OrdresMissionList;
