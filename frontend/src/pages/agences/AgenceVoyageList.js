import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate , Link} from 'react-router-dom';
import Navbar from '../../components/Navbar';


function AgenceVoyageList() {
  const [agences, setAgences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/agences/')
      .then(response => {
        setAgences(response.data);
        setLoading(false);
      })
      .catch(err => {
        setError('Erreur lors du chargement des agences');
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Chargement...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <>
          <Navbar />
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Liste des agences</h2>
        <button 
          className="btn btn-primary"
          onClick={() => navigate('/ajouter-agence')}
        >
          + Ajouter une agence
        </button>
      </div>

      {agences.length === 0 ? (
        <p>Aucune agence trouvée.</p>
      ) : (
        <ul className="list-group">
          {agences.map(agence => (
            <li 
              key={agence.id} 
              className="list-group-item d-flex justify-content-between align-items-center"
            >
<Link to={`/agence/${agence.id}/dashboard`} className="text-decoration-none fw-bold">
  {agence.nom}
</Link>
              <div>
                <button 
                  className="btn btn-info btn-sm me-2"
                  onClick={() => navigate(`/agence/${agence.id}/buses`)}
                >
                  Voir les bus
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/agence/${agence.id}/chauffeurs`)}
                >
                  Voir les chauffeurs
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
    </>

  );
}

export default AgenceVoyageList;
