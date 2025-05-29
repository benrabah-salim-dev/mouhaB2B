import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const ChauffeurList = () => {
  const { agence_id } = useParams();
  const [chauffeurs, setChauffeurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    axios.get(`${API_URL}/api/chauffeurs/?agence=${agence_id}`)
      .then(res => {
        setChauffeurs(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError('Erreur lors du chargement des chauffeurs');
        setLoading(false);
      });
  }, [agence_id]);

  if (loading) return <p>Chargement des chauffeurs...</p>;
  if (error) return <p style={{color:'red'}}>{error}</p>;

  return (
    <div className="container mt-4">
      <h2>Chauffeurs de l'agence {agence_id}</h2>
      <button 
  className="btn btn-primary mb-3" 
  onClick={() => navigate(`/ajouter-chauffeur/${agence_id}`)}
>
  + Ajouter un Chauffeur
</button>

      {chauffeurs.length === 0 ? (
        <p>Aucun chauffeur trouvé.</p>
      ) : (
        <ul className="list-group">
          {chauffeurs.map(chauffeur => (
            <li key={chauffeur.id} className="list-group-item">
              {chauffeur.prenom} {chauffeur.nom} (CIN : {chauffeur.cin})
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-secondary mt-3" onClick={() => navigate('/')}>
        Retour à la liste des agences
      </button>
    </div>
  );
};

export default ChauffeurList;
