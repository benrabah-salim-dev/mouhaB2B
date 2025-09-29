// src/components/FicheMouvementList/AssignResourcesModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../../api";

/* mini modal interne */
const Modal = ({ title, children, onClose }) => (
  <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,.35)" }}>
    <div className="modal-dialog modal-xl">
      <div className="modal-content">
        <div className="modal-header">
          <h5 className="modal-title m-0">{title}</h5>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  </div>
);

const getUser = () => JSON.parse(localStorage.getItem("userData") || "{}");
const asArray = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
const fmtHour = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
const isoLocal = (d) => (d ? new Date(d).toISOString().slice(0, 16) : "");

export default function AssignResourcesModal({ mission, onClose, onCompleted }) {
  // NOTE: ici "mission" est en réalité la FICHE côté liste (id, type, aeroport, date_debut, date_fin…)
  const fiche = mission || {};
  const { agence_id: myAgenceId } = getUser();

  const [mode, setMode] = useState("my_fleet"); // my_fleet | rentout | rideshare
  const [trajet, setTrajet] = useState(fiche.aeroport || "");

  // filtres communs
  const [hideMine, setHideMine] = useState(true);
  const [typeVehicule, setTypeVehicule] = useState("");
  const [capaciteMin, setCapaciteMin] = useState("");

  // rideshare only
  const [destination, setDestination] = useState("");
  const [seatsMin, setSeatsMin] = useState("");

  // my_fleet / rentout
  const [vehicules, setVehicules] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [vehicule, setVehicule] = useState("");
  const [chauffeur, setChauffeur] = useState("");

  // public
  const [rentoutOffers, setRentoutOffers] = useState([]);
  const [rideshareOffers, setRideshareOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [rideshareSeats, setRideshareSeats] = useState("");

  // fenêtre temporelle (rideshare)
  const date_debut = useMemo(() => (fiche?.date_debut ? new Date(fiche.date_debut) : null), [fiche]);
  const date_fin = useMemo(() => (fiche?.date_fin ? new Date(fiche.date_fin) : null), [fiche]);

  // loaders
  const loadChauffeurs = async () => {
    const c = await api.get("chauffeurs/", { params: { agence: myAgenceId, disponible: true } });
    setChauffeurs(asArray(c.data));
  };

  const loadMyFleet = async () => {
    const params = { agence: myAgenceId, disponible: true };
    if (typeVehicule) params.type = typeVehicule;
    if (capaciteMin) params.capacite_min = capaciteMin;
    const v = await api.get("vehicules/", { params });
    setVehicules(asArray(v.data));
    await loadChauffeurs();
  };

  const normalizeRentout = (items) =>
    (Array.isArray(items) ? items : []).map((r) => {
      const veh = r.vehicule || {
        id: r.id, type: r.type, marque: r.marque, model: r.model,
        immatriculation: r.immatriculation, capacite: r.capacite, agence_nom: r.agence_nom,
      };
      return {
        id: veh.id ?? r.id,
        agence_nom: r.agence_nom || veh.agence_nom || r.agence?.nom,
        vehicule: veh, origin: "", destination: "", start: "", end: "",
        price: r.price, currency: r.currency,
      };
    });

  const normalizeRideshare = (items) => (Array.isArray(items) ? items : []);

  const loadPublicResources = async () => {
    const params = {};
    if (typeVehicule) params.type = typeVehicule;
    if (capaciteMin) params.min_capacity = capaciteMin;
    if (hideMine && myAgenceId) params.exclude_agence = myAgenceId;
    if (mode === "rideshare") {
      if (date_debut && date_fin) {
        params.date_debut = isoLocal(date_debut);
        params.date_fin = isoLocal(date_fin);
      }
      if (destination) params.destination = destination;
      if (seatsMin) params.seats_min = seatsMin;
    }
    const { data } = await api.get("public/resources/search/", { params });
    setRentoutOffers(normalizeRentout(data?.rentout));
    setRideshareOffers(normalizeRideshare(data?.rideshare));
  };

  useEffect(() => {
    (async () => {
      try {
        if (mode === "my_fleet") await loadMyFleet();
        else if (mode === "rentout") { await loadChauffeurs(); await loadPublicResources(); }
        else await loadPublicResources();
      } catch (e) { console.error("Erreur chargement ressources", e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typeVehicule, capaciteMin, destination, seatsMin, hideMine, fiche?.id]);

  // ====== CONFIRMS ======

  // → back unifié: POST /fiches-mouvement/<id>/assign-resources/
  //    Body: { vehicule_id?, chauffeur_id?, trajet? }
  const confirmAssign = async (vehiculeId, chauffeurId) => {
    try {
      await api.post(`fiches-mouvement/${fiche.id}/assign-resources/`, {
        vehicule_id: vehiculeId || null,
        chauffeur_id: chauffeurId || null,
        trajet: (trajet || "").trim(),
      });
      alert("Ressources affectées et missions créées avec succès.");
      onCompleted?.();
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.detail || e?.response?.data?.error || "Erreur lors de l’affectation.");
    }
  };

  const confirmMyFleet = async () => {
    if (!vehicule || !chauffeur) { alert("Sélectionnez un véhicule et un chauffeur."); return; }
    await confirmAssign(vehicule, chauffeur);
  };

  const confirmRentout = async () => {
    if (!selectedOfferId) { alert("Sélectionnez une offre Rentout."); return; }
    if (!chauffeur) { alert("Sélectionnez un chauffeur de votre agence."); return; }
    // ici selectedOfferId correspond au véhicule loué
    await confirmAssign(selectedOfferId, chauffeur);
  };

  const confirmRideshare = async () => {
    try {
      const seats = Number(rideshareSeats || 0);
      if (!selectedOfferId || seats <= 0) { alert("Sélectionnez une offre et un nombre de places."); return; }
      await api.post(`offers/${selectedOfferId}/book-seats/`, { seats });
      // on peut AUSSI créer les missions sans OM (pas de véhicule/driver)
      await confirmAssign(null, null);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la réservation rideshare.");
    }
  };

  // ====== UI Tables ======
  const renderOffersTable = (offers, isRideShare) => (
    <div className="table-responsive">
      <table className="table table-hover align-middle">
        <thead className="table-light">
          <tr>
            <th>#</th>
            <th>Agence</th>
            <th>Véhicule</th>
            {isRideShare && <th>Début</th>}
            {isRideShare && <th>Fin</th>}
            {isRideShare && <th>Origine</th>}
            {isRideShare && <th>Destination</th>}
            {isRideShare && <th>Places dispo</th>}
            <th>Tarif</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {offers.map((o) => {
            const veh = o.vehicule || {};
            const start = o.start ? new Date(o.start) : o.date_depart ? new Date(o.date_depart) : null;
            const end = o.end ? new Date(o.end) : o.date_retour ? new Date(o.date_retour) : null;
            const selectable = !isRideShare || (o.seats_available ?? o.places_disponibles ?? 0) > 0;
            const seatsAvail = o.seats_available ?? o.places_disponibles ?? "";
            return (
              <tr key={o.id} className={!selectable ? "opacity-50" : ""}>
                <td>{o.id}</td>
                <td>{o.agence_nom || "—"}</td>
                <td>{veh.marque} {veh.model} ({veh.immatriculation}) — {veh.capacite} pl.</td>
                {isRideShare && <td>{fmtHour(start)}</td>}
                {isRideShare && <td>{fmtHour(end)}</td>}
                {isRideShare && <td>{o.origin || "—"}</td>}
                {isRideShare && <td>{o.destination || o.trajet || "—"}</td>}
                {isRideShare && <td><span className="badge bg-info">{seatsAvail}</span></td>}
                <td>{o.price ? `${o.price} ${o.currency || ""}` : "—"}</td>
                <td className="text-end">
                  <input
                    type="radio"
                    name={`offer-${isRideShare ? "ride" : "rent"}`}
                    value={o.id}
                    disabled={!selectable}
                    checked={String(selectedOfferId) === String(o.id)}
                    onChange={() => setSelectedOfferId(o.id)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <Modal title="Choisir des ressources" onClose={onClose}>
      <div className="mb-2 text-muted">
        {mode === "rentout" ? (
          <small>Le mode <b>Rentout</b> n’utilise pas de dates ni de destination. Chauffeur requis.</small>
        ) : mode === "rideshare" ? (
          <small>Le mode <b>Rideshare</b> utilise la fenêtre de la fiche et peut filtrer par destination (pas de chauffeur requis).</small>
        ) : (
          <small>Le mode <b>Ma flotte</b> requiert un véhicule et un chauffeur de votre agence.</small>
        )}
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div className="btn-group" role="group" aria-label="Mode ressource">
          <button className={`btn btn-sm ${mode === "my_fleet" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setMode("my_fleet")}>Ma flotte</button>
          <button className={`btn btn-sm ${mode === "rentout" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setMode("rentout")}>Rentout</button>
          <button className={`btn btn-sm ${mode === "rideshare" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setMode("rideshare")}>Rideshare</button>
        </div>

        <div className="ms-2">
          <label className="form-label m-0">Type</label>
          <select className="form-select form-select-sm" value={typeVehicule} onChange={(e) => setTypeVehicule(e.target.value)}>
            <option value="">Tous</option>
            <option value="bus">Bus</option>
            <option value="minibus">Minibus</option>
            <option value="MICROBUS">Microbus</option>
            <option value="4x4">4x4</option>
          </select>
        </div>

        <div>
          <label className="form-label m-0">Capacité min</label>
          <input type="number" className="form-control form-select-sm" value={capaciteMin} onChange={(e) => setCapaciteMin(e.target.value)} placeholder="ex: 10" min={0} />
        </div>

        {mode === "rideshare" && (
          <>
            <div>
              <label className="form-label m-0">Destination</label>
              <input className="form-control form-select-sm" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="ex: TUN" />
            </div>
            <div>
              <label className="form-label m-0">Places min</label>
              <input type="number" className="form-control form-select-sm" value={seatsMin} onChange={(e) => setSeatsMin(e.target.value)} placeholder="ex: 5" min={0}/>
            </div>
          </>
        )}

        {mode !== "my_fleet" && (
          <div className="form-check ms-2">
            <input id="hideMine" type="checkbox" className="form-check-input" checked={hideMine} onChange={(e) => setHideMine(e.target.checked)} />
            <label htmlFor="hideMine" className="form-check-label">Masquer mon agence</label>
          </div>
        )}
      </div>

      {/* Trajet libre (facultatif) */}
      <div className="mb-3">
        <label className="form-label">Trajet</label>
        <input
          className="form-control"
          placeholder="ex: TUN → Hammamet / Ramassage hôtels…"
          value={trajet}
          onChange={(e) => setTrajet(e.target.value)}
        />
      </div>

      {mode === "my_fleet" && (
        <>
          <div className="row">
            <div className="col-md-6">
              <label className="form-label">🚘 Véhicule</label>
              <select className="form-select" value={vehicule} onChange={(e) => setVehicule(e.target.value)}>
                <option value="">-- Sélectionner un véhicule --</option>
                {vehicules.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.marque} {v.model ?? v.modele} ({v.immatriculation}) — {v.capacite} places
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">👤 Chauffeur</label>
              <select className="form-select" value={chauffeur} onChange={(e) => setChauffeur(e.target.value)}>
                <option value="">-- Sélectionner un chauffeur --</option>
                {chauffeurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} {c.prenom} {c.cin ? `(${c.cin})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-end mt-3">
            <button className="btn btn-secondary me-2" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmMyFleet} disabled={!vehicule || !chauffeur}>
              ✅ Confirmer (ma flotte)
            </button>
          </div>
        </>
      )}

      {mode === "rentout" && (
        <>
          <div className="row mb-3">
            <div className="col-md-6">
              <label className="form-label">👤 Chauffeur (mon agence) *</label>
              <select className="form-select" value={chauffeur} onChange={(e) => setChauffeur(e.target.value)}>
                <option value="">-- Sélectionner un chauffeur --</option>
                {chauffeurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} {c.prenom} {c.cin ? `(${c.cin})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {renderOffersTable(rentoutOffers, false)}

          <div className="text-end mt-3">
            <button className="btn btn-secondary me-2" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmRentout} disabled={!selectedOfferId || !chauffeur}>
              ✅ Choisir cette offre
            </button>
          </div>
        </>
      )}

      {mode === "rideshare" && (
        <>
          {renderOffersTable(rideshareOffers, true)}
          <div className="d-flex justify-content-end align-items-center gap-2 mt-2">
            <label className="form-label m-0">Places à réserver</label>
            <input
              type="number"
              className="form-control"
              value={rideshareSeats}
              onChange={(e) => setRideshareSeats(e.target.value)}
              placeholder="ex: 5"
              min={1}
              style={{ width: 120 }}
            />
          </div>
          <div className="text-end mt-3">
            <button className="btn btn-secondary me-2" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmRideshare} disabled={!selectedOfferId || Number(rideshareSeats || 0) <= 0}>
              ✅ Réserver ces places
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
