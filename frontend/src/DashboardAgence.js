import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import Navbar from './components/Navbar';
import AgenceVoyageList from './AgenceVoyageList';

const DashboardAgence = () => {
  const { user } = useContext(AuthContext);
  const { agence_id: agenceParam } = useParams();
  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL;

  const isSuperAdmin = user?.role === 'superadmin';
  const agence_id = isSuperAdmin ? agenceParam : user?.agence_id;

  const [agence, setAgence] = useState(null);
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setError("Utilisateur non connecté.");
        setLoading(false);
        return;
      }

      // Cas superadmin sans agence sélectionnée → pas de fetch ici
      if (isSuperAdmin && !agenceParam) {
        setLoading(false);
        return;
      }

      if (!agence_id) {
        setError("Aucune agence sélectionnée.");
        setLoading(false);
        return;
      }

      try {
        // Si superadmin, on récupère les infos de l'agence spécifique, sinon on récupère uniquement les dossiers de l'agence de l'admin
        const agenceRes = await axios.get(`${API_URL}/api/agences/${agence_id}/`);
        setAgence(agenceRes.data);

        // Filtrage des dossiers uniquement pour l'agence concernée
        const dossiersRes = await axios.get(`${API_URL}/api/dossiers/?agence=${agence_id}`);
        setDossiers(dossiersRes.data);
      } catch (err) {
        console.error(err);
        setError("Erreur lors du chargement des données.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, agenceParam, agence_id, API_URL, isSuperAdmin]);

  // === AFFICHAGE ===

  if (loading) return <p>Chargement en cours...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  //  Affichage global pour le Superadmin
  if (isSuperAdmin && !agenceParam) {
    return (
      <>
        <Navbar />
        <div className="container mt-4">
          <AgenceVoyageList />
        </div>
      </>
    );
  }

  //  Dashboard de l’agence spécifique
  return (
    <>
      <Navbar />
      <div className="container mt-4">
        <h2>Dashboard de l'agence : {agence?.nom || agence_id}</h2>

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
              {dossiers.map((dossier) => (
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

        {isSuperAdmin && (
          <button
            className="btn btn-secondary mt-3"
            onClick={() => navigate('/dashboard/superadmin')}
          >
            Retour à la liste des agences
          </button>
        )}
      </div>
    </>
  );
};

export default DashboardAgence;
