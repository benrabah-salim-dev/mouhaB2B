import React, { useEffect, useState , useContext} from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function DossiersTable() {
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDossiers, setSelectedDossiers] = useState([]);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  

  const [filterType, setFilterType] = useState('all');
  const [filterAeroport, setFilterAeroport] = useState('');
  const [filterVille, setFilterVille] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const dossiersPerPage = 10;
  const API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    if (!user) {
      setError("Utilisateur non connecté.");
      setLoading(false);
      return;
    }

    // Construire URL selon rôle
    let url = `${API_URL}/api/dossiers/`;
    if (user.role !== 'superadmin' && user.agence_id) {
      url += `?agence=${user.agence_id}`;
    }

    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Erreur lors de la récupération des dossiers');
        return response.json();
      })
      .then(data => {
        setDossiers(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [user, API_URL]);




  const toggleSelect = (ref) => {
    setSelectedDossiers(prev =>
      prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]
    );
  };

  const filteredDossiers = dossiers.filter(dossier => {
    if (filterType === 'arrivee' && dossier.heure_arrivee === null) return false;
    if (filterType === 'depart' && dossier.heure_depart === null) return false;

    if (filterAeroport.trim() !== '') {
      const aeroArr = dossier.aeroport_arrivee?.toLowerCase() || '';
      const aeroDep = dossier.aeroport_depart?.toLowerCase() || '';
      if (!aeroArr.includes(filterAeroport.toLowerCase()) && !aeroDep.includes(filterAeroport.toLowerCase())) {
        return false;
      }
    }

    if (filterVille.trim() !== '') {
      const ville = dossier.ville?.toLowerCase() || '';
      if (!ville.includes(filterVille.toLowerCase())) return false;
    }

    return true;
  });

  const indexOfLast = currentPage * dossiersPerPage;
  const indexOfFirst = indexOfLast - dossiersPerPage;
  const currentDossiers = filteredDossiers.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredDossiers.length / dossiersPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const navigateToMouvementForm = () => {
    navigate('/fiche-mouvement', { state: { selectedDossiers } });
  };

  if (loading) return <p className="text-center mt-4">Chargement des dossiers...</p>;
  if (error) return <p className="text-danger text-center mt-4">Erreur: {error}</p>;

  return (
    <div className="container mt-4">
      <h2 className="mb-4 text-center">Liste des Dossiers</h2>

      <div className="row mb-3 justify-content-center g-3">
        <div className="col-auto">
          <label htmlFor="filterType" className="form-label">Filtrer par type</label>
          <select id="filterType" className="form-select" value={filterType} onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}>
            <option value="all">Tous</option>
            <option value="arrivee">Arrivées</option>
            <option value="depart">Départs</option>
          </select>
        </div>
        <div className="col-auto">
          <label htmlFor="filterAeroport" className="form-label">Filtrer par Aéroport</label>
          <input id="filterAeroport" type="text" className="form-control" placeholder="Tapez un aéroport" value={filterAeroport} onChange={e => { setFilterAeroport(e.target.value); setCurrentPage(1); }} />
        </div>
        <div className="col-auto">
          <label htmlFor="filterVille" className="form-label">Filtrer par Ville</label>
          <input id="filterVille" type="text" className="form-control" placeholder="Tapez une ville" value={filterVille} onChange={e => { setFilterVille(e.target.value); setCurrentPage(1); }} />
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-striped table-bordered table-hover align-middle">
          <thead className="table-dark">
            <tr>
              <th>Sélection</th>
              <th>Référence</th>
              <th>Aéroport Arrivée</th>
              <th>Heure Arrivée</th>
              <th>Hôtel</th>
              <th>Emplacement</th>
              <th>Nombre Personnes Arrivée</th>
              <th>Nom Réservation</th>
              <th>Aéroport Départ</th>
              <th>Heure Départ</th>
              <th>Num Vol Retour</th>
              <th>Nombre Personnes Retour</th>
            </tr>
          </thead>
          <tbody>
            {currentDossiers.length === 0 ? (
              <tr><td colSpan="12" className="text-center">Aucun dossier trouvé</td></tr>
            ) : (
              currentDossiers.map(dossier => (
                <tr key={dossier.reference}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedDossiers.includes(dossier.reference)}
                      onChange={() => toggleSelect(dossier.reference)}
                    />
                  </td>
                  <td>{dossier.reference}</td>
                  <td>{dossier.aeroport_arrivee}</td>
                  <td>{dossier.heure_arrivee ? new Date(dossier.heure_arrivee).toLocaleString() : ''}</td>
                  <td>{dossier.hotel_nom}</td>
                  <td>{dossier.ville}</td>
                  <td>{dossier.nombre_personnes_arrivee}</td>
                  <td>{dossier.nom_reservation}</td>
                  <td>{dossier.aeroport_depart}</td>
                  <td>{dossier.heure_depart ? new Date(dossier.heure_depart).toLocaleString() : ''}</td>
                  <td>{dossier.num_vol_retour}</td>
                  <td>{dossier.nombre_personnes_retour}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pagination">
        <ul className="pagination justify-content-center">
          {[...Array(totalPages)].map((_, i) => {
            const pageNum = i + 1;
            return (
              <li key={pageNum} className={`page-item ${pageNum === currentPage ? 'active' : ''}`}>
                <button className="page-link" onClick={() => paginate(pageNum)}>
                  {pageNum}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {selectedDossiers.length > 0 && (
        <div className="text-center mt-4">
          <button className="btn btn-primary" onClick={navigateToMouvementForm}>
            Créer une Fiche de Mouvement ({selectedDossiers.length})
          </button>
        </div>
      )}
    </div>
  );
}

export default DossiersTable;
