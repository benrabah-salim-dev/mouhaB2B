import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import Navbar from './components/Navbar';

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
  const [selectedDossiers, setSelectedDossiers] = useState([]);
  const [data, setData] = useState(null);

  const [filters, setFilters] = useState({
    reference: '',
    nom_reservation: '',
    ville: '',
    aeroport_arrivee: '',
    num_vol_arrivee: '',
  });

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setError("Utilisateur non connecté.");
        setLoading(false);
        return;
      }

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
        const agenceRes = await axios.get(`${API_URL}/api/agences/${agence_id}/`);
        setAgence(agenceRes.data);

        // Récupérer les dossiers associés à l'agence
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/api/dossiers/');
        setData(response.data);
      } catch (error) {
        console.error("Erreur lors de la récupération des données:", error);
      }
    };
    fetchData();
  }, []);

  const toggleSelect = (ref) => {
    setSelectedDossiers(prev =>
      prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]
    );
  };

  const filteredDossiers = dossiers.filter((dossier) => {
    return (
      dossier.reference.toLowerCase().includes(filters.reference.toLowerCase()) &&
      dossier.nom_reservation.toLowerCase().includes(filters.nom_reservation.toLowerCase()) &&
      dossier.ville.toLowerCase().includes(filters.ville.toLowerCase()) &&
      dossier.aeroport_arrivee.toLowerCase().includes(filters.aeroport_arrivee.toLowerCase()) &&
      dossier.num_vol_arrivee.toLowerCase().includes(filters.num_vol_arrivee.toLowerCase())
    );
  });

  if (loading) return <p>Chargement en cours...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

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

        {/* Filtres */}
        <div className="mb-3 d-flex gap-2">
          <input
            type="text"
            name="reference"
            value={filters.reference}
            onChange={handleFilterChange}
            className="form-control"
            placeholder="Filtrer par Référence"
          />
          <input
            type="text"
            name="nom_reservation"
            value={filters.nom_reservation}
            onChange={handleFilterChange}
            className="form-control"
            placeholder="Filtrer par Nom Réservation"
          />
          <input
            type="text"
            name="ville"
            value={filters.ville}
            onChange={handleFilterChange}
            className="form-control"
            placeholder="Filtrer par Ville"
          />
          <input
            type="text"
            name="aeroport_arrivee"
            value={filters.aeroport_arrivee}
            onChange={handleFilterChange}
            className="form-control"
            placeholder="Filtrer par Aéroport Arrivée"
          />
          <input
            type="text"
            name="num_vol_arrivee"
            value={filters.num_vol_arrivee}
            onChange={handleFilterChange}
            className="form-control"
            placeholder="Filtrer par Num Vol Arrivée"
          />
        </div>

        {filteredDossiers.length === 0 ? (
          <p>Aucun dossier trouvé.</p>
        ) : (
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Sélectionner</th>
                <th>Référence</th>
                <th>Nom réservation</th>
                <th>Ville</th>
                <th>Aéroport Arrivée</th>
                <th>Aéroport Depart</th>
                <th>Num Vol Arrivée</th>
                <th>Heure Arrivée</th>
                <th>Heure Départ</th>
                <th>Nombre Personnes Arrivée</th>
                <th>Num Vol Retour</th>
                <th>Nombre Personnes Retour</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDossiers.map((dossier) => (
                <tr key={dossier.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedDossiers.includes(dossier.reference)}
                      onChange={() => toggleSelect(dossier.reference)}
                    />
                  </td>
                  <td>{dossier.reference}</td>
                  <td>{dossier.nom_reservation}</td>
                  <td>{dossier.ville || 'Non spécifiée'}</td>
                  <td>{dossier.aeroport_arrivee}</td>
                  <td>{dossier.aeroport_depart}</td>
                  <td>{dossier.num_vol_arrivee}</td>
                  <td>{dossier.heure_arrivee ? new Date(dossier.heure_arrivee).toLocaleString() : ''}</td>
                  <td>{dossier.heure_depart ? new Date(dossier.heure_depart).toLocaleString() : ''}</td>
                  <td>{dossier.nombre_personnes_arrivee}</td>
                  <td>{dossier.num_vol_retour}</td>
                  <td>{dossier.nombre_personnes_retour}</td>
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

        {selectedDossiers.length > 0 && (
          <div className="mt-3">
            <button
              className="btn btn-primary"
              onClick={() => navigate('/FicheMouvement', { state: { selectedDossiers } })}
            >
              Créer une fiche de mouvement
            </button>
          </div>
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