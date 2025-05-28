import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';

const DashboardAgence = () => {
  const { agence_id } = useParams();
  const [agence, setAgence] = useState(null);
  const [dossiers, setDossiers] = useState([]);
  const [loadingAgence, setLoadingAgence] = useState(true);
  const [loadingDossiers, setLoadingDossiers] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Récupérer les infos de l'agence
  useEffect(() => {
    axios.get(`http://127.0.0.1:8000/api/agences/${agence_id}/`)
      .then(res => {
        setAgence(res.data);
        setLoadingAgence(false);
      })
      .catch(() => {
        setError('Erreur lors du chargement de l\'agence');
        setLoadingAgence(false);
      });
  }, [agence_id]);

  // Récupérer les dossiers liés à l'agence
  useEffect(() => {
    axios.get(`http://127.0.0.1:8000/api/dossiers/?agence=${agence_id}`)
      .then(res => {
        setDossiers(res.data);
        setLoadingDossiers(false);
      })
      .catch(() => {
        setError('Erreur lors du chargement des dossiers');
        setLoadingDossiers(false);
      });
  }, [agence_id]);

  if (loadingAgence || loadingDossiers) return <p>Chargement en cours...</p>;
  if (error) return <p style={{color:'red'}}>{error}</p>;

  return (
    <div className="container mt-4">
      <h2>Dashboard de l'agence : {agence ? agence.nom : agence_id}</h2>
      
      <div className="mb-3 d-flex gap-2">
        <button 
          className="btn btn-primary"
          onClick={() => navigate(`/ajouter-dossier/${agence_id}`)}
        >
          + Ajouter un dossier
        </button>
        <button
          className="btn btn-success"
          onClick={() => navigate(`/importer-dossier/${agence_id}`)}
        >
          Importer un dossier
        </button>
  <button
    className="btn btn-warning"
    onClick={() => navigate(`/agence/${agence_id}/ordres-mission`)}
  >
    Ordres de mission
  </button>
      </div>
  
      {dossiers.length === 0 ? (
        <p>Aucun dossier trouvé.</p>
      ) : (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Nom réservation</th>
              <th>Nombre personnes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dossiers.map(dossier => (
              <tr key={dossier.id}>
                <td>{dossier.reference}</td>
                <td>{dossier.nom_reservation}</td>
                <td>{dossier.nombre_personnes_arrivee}</td>
                <td>
                  <Link 
                    className="btn btn-sm btn-info me-2"
                    to={`/dossier/${dossier.id}`}
                  >
                    Voir / Modifier
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
  
      <button className="btn btn-secondary mt-3" onClick={() => navigate('/')}>
        Retour à la liste des agences
      </button>
    </div>
  );
};

export default DashboardAgence;
