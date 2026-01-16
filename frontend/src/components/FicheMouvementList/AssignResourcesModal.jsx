import React, { useEffect, useMemo, useState, useCallback } from "react";
import api from "../../api";

/* --- Sous-composant Modal --- */
const Modal = ({ title, children, onClose }) => (
  <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,.5)", zIndex: 1050 }}>
    <div className="modal-dialog modal-xl modal-dialog-scrollable">
      <div className="modal-content">
        <div className="modal-header bg-light">
          <h5 className="modal-title m-0">{title}</h5>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  </div>
);

/* --- Helpers --- */
const getUser = () => JSON.parse(localStorage.getItem("userData") || "{}");
const asArray = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

export default function AssignResourcesModal({ mission, onClose, onCompleted }) {
  const fiche = mission || {};
  const { agence_id: myAgenceId } = getUser();

  // États principaux
  const [mode, setMode] = useState("my_fleet"); // my_fleet | rentout | rideshare
  const [loading, setLoading] = useState(false);

  // Formulaire Interne (Ma flotte)
  const [vehicules, setVehicules] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [selectedVehicule, setSelectedVehicule] = useState("");
  const [selectedChauffeur, setSelectedChauffeur] = useState("");

  // Formulaire Externe (Rentout / Rideshare)
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [seatsToBook, setSeatsToBook] = useState(fiche.pax || 1);

  // Filtres
  const [typeVehicule, setTypeVehicule] = useState("");

  /* --- Chargement des données --- */

  const loadMyFleet = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, cRes] = await Promise.all([
        api.get("vehicules/", { params: { agence: myAgenceId, disponible: true, type: typeVehicule } }),
        api.get("chauffeurs/", { params: { agence: myAgenceId, disponible: true } })
      ]);
      setVehicules(asArray(vRes.data));
      setChauffeurs(asArray(cRes.data));
    } catch (e) {
      console.error("Erreur chargement flotte", e);
    } finally {
      setLoading(false);
    }
  }, [myAgenceId, typeVehicule]);

  const loadExternalOffers = useCallback(async () => {
    setLoading(true);
    const endpoint = mode === "rentout" ? "offres-location/" : "offres-covoiturage/";
    try {
      const { data } = await api.get(endpoint, { 
        params: { 
          exclude_agence: myAgenceId,
          type: typeVehicule,
          date: fiche.date
        } 
      });
      setOffers(asArray(data));
    } catch (e) {
      console.error("Erreur chargement offres externes", e);
    } finally {
      setLoading(false);
    }
  }, [mode, myAgenceId, typeVehicule, fiche.date]);

  useEffect(() => {
    if (mode === "my_fleet") loadMyFleet();
    else loadExternalOffers();
  }, [mode, loadMyFleet, loadExternalOffers]);

  /* --- Soumission --- */
  const handleAssign = async () => {
    setLoading(true);
    try {
      let payload = { fiche_id: fiche.id, mode };

      if (mode === "my_fleet") {
        payload = { ...payload, vehicule_id: selectedVehicule, chauffeur_id: selectedChauffeur };
      } else {
        payload = { ...payload, offre_id: selectedOfferId, seats: seatsToBook };
      }

      await api.post(`fiches-mouvement/${fiche.id}/assigner/`, payload);
      onCompleted(); // Rafraîchir la liste parente
      onClose();
    } catch (e) {
      alert("Erreur lors de l'assignation. Vérifiez les disponibilités.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Assignation : ${fiche.numero_vol || "Fiche"} - ${fiche.date}`} onClose={onClose}>
      {/* Sélecteur de mode */}
      <div className="nav nav-pills nav-fill mb-4 p-2 bg-light rounded">
        <button 
          className={`nav-link ${mode === "my_fleet" ? "active" : ""}`}
          onClick={() => setMode("my_fleet")}
        >
          🚗 Ma Flotte
        </button>
        <button 
          className={`nav-link ${mode === "rentout" ? "active" : ""}`}
          onClick={() => setMode("rentout")}
        >
          🤝 Location (B2B)
        </button>
        <button 
          className={`nav-link ${mode === "rideshare" ? "active" : ""}`}
          onClick={() => setMode("rideshare")}
        >
          🚌 Covoiturage
        </button>
      </div>

      <div className="row">
        {/* Filtres communs */}
        <div className="col-md-3 border-end">
          <h6>Filtres</h6>
          <select 
            className="form-select mb-3" 
            value={typeVehicule} 
            onChange={(e) => setTypeVehicule(e.target.value)}
          >
            <option value="">Tous les types</option>
            <option value="BERLINE">Berline</option>
            <option value="VAN">Van</option>
            <option value="BUS">Bus</option>
          </select>
          <div className="alert alert-info small">
            <strong>Besoin :</strong> {fiche.pax} PAX
          </div>
        </div>

        {/* Contenu principal */}
        <div className="col-md-9">
          {loading ? (
            <div className="text-center py-5">Chargement...</div>
          ) : mode === "my_fleet" ? (
            <div className="row">
              <div className="col-md-6">
                <label className="form-label fw-bold">Véhicule</label>
                <div className="list-group">
                  {vehicules.map(v => (
                    <button
                      key={v.id}
                      className={`list-group-item list-group-item-action ${selectedVehicule === v.id ? "active" : ""}`}
                      onClick={() => setSelectedVehicule(v.id)}
                    >
                      {v.immatriculation} - {v.marque} ({v.capacite} places)
                    </button>
                  ))}
                  {vehicules.length === 0 && <div className="text-muted">Aucun véhicule disponible</div>}
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label fw-bold">Chauffeur</label>
                <div className="list-group">
                  {chauffeurs.map(c => (
                    <button
                      key={c.id}
                      className={`list-group-item list-group-item-action ${selectedChauffeur === c.id ? "active" : ""}`}
                      onClick={() => setSelectedChauffeur(c.id)}
                    >
                      {c.nom} {c.prenom}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Agence</th>
                    <th>Véhicule</th>
                    <th>Places</th>
                    <th>Prix</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map(o => (
                    <tr key={o.id} className={selectedOfferId === o.id ? "table-primary" : ""}>
                      <td>{o.agence_nom}</td>
                      <td>{o.vehicule_type}</td>
                      <td>{o.places_dispo}</td>
                      <td>{o.prix} €</td>
                      <td>
                        <button 
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => setSelectedOfferId(o.id)}
                        >
                          Choisir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="modal-footer mt-3">
        <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
        <button 
          className="btn btn-success" 
          disabled={loading || (!selectedVehicule && !selectedOfferId)}
          onClick={handleAssign}
        >
          Confirmer l'assignation
        </button>
      </div>
    </Modal>
  );
}