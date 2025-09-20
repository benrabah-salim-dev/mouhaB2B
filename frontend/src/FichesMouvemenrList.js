// src/pages/FichesMouvementList.js
import React, { useEffect, useMemo, useState } from "react";
import api from "./api";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

const getUser = () => JSON.parse(localStorage.getItem("userData") || "{}");
const asArray = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
const fmtHour = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

function BadgeType({ t }) {
  const label = t === "A" ? "Arrivée" : t === "D" ? "Départ" : "—";
  const cls = t === "A" ? "bg-success" : t === "D" ? "bg-primary" : "bg-secondary";
  return <span className={`badge ${cls}`}>{label}</span>;
}

function Modal({ title, children, onClose }) {
  return createPortal(
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
    </div>,
    document.body
  );
}

/**
 * 3 modes:
 *  - my_fleet  : véhicule + chauffeur (tous deux REQUIS)
 *  - rentout   : location véhicule public + chauffeur de MON agence (chauffeur REQUIS)
 *  - rideshare : réservation de places (pas de chauffeur)
 */
function ModalAssignResources({ mission, onClose, onConfirm }) {
  const { agence_id: myAgenceId } = getUser();
  const [mode, setMode] = useState("my_fleet"); // "my_fleet" | "rentout" | "rideshare"

  // filtres communs
  const [hideMine, setHideMine] = useState(true);
  const [typeVehicule, setTypeVehicule] = useState("");
  const [capaciteMin, setCapaciteMin] = useState("");

  // rideshare uniquement
  const [destination, setDestination] = useState("");
  const [seatsMin, setSeatsMin] = useState("");

  // ma flotte / rentout (chauffeur requis)
  const [vehicules, setVehicules] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [vehicule, setVehicule] = useState("");
  const [chauffeur, setChauffeur] = useState(""); // <- utilisé pour my_fleet ET rentout

  // public resources
  const [rentoutOffers, setRentoutOffers] = useState([]);
  const [rideshareOffers, setRideshareOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [rideshareSeats, setRideshareSeats] = useState("");

  // Fenêtre temporelle (pour rideshare)
  const date_debut = useMemo(() => (mission?.date_debut ? new Date(mission.date_debut) : null), [mission]);
  const date_fin = useMemo(() => (mission?.date_fin ? new Date(mission.date_fin) : null), [mission]);
  const iso = (d) => (d ? new Date(d).toISOString().slice(0, 16) : ""); // YYYY-MM-DDTHH:mm

  // --- loaders ---
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
    // on charge aussi les chauffeurs pour que RENTOUT puisse les utiliser
    await loadChauffeurs();
  };

  const normalizeRentout = (items) =>
    (Array.isArray(items) ? items : []).map((r) => {
      const veh = r.vehicule || {
        id: r.id,
        type: r.type,
        marque: r.marque,
        model: r.model,
        immatriculation: r.immatriculation,
        capacite: r.capacite,
        agence_nom: r.agence_nom,
      };
      return {
        id: veh.id ?? r.id, // utilisé comme vehiculeId
        agence_nom: r.agence_nom || veh.agence_nom || r.agence?.nom,
        vehicule: veh,
        origin: "",
        destination: "",
        start: "",
        end: "",
        price: r.price,
        currency: r.currency,
      };
    });

  const normalizeRideshare = (items) => (Array.isArray(items) ? items : []);

  const loadPublicResources = async () => {
    const params = {};
    // filtres communs
    if (typeVehicule) params.type = typeVehicule;
    if (capaciteMin) params.min_capacity = capaciteMin;
    if (hideMine && myAgenceId) params.exclude_agence = myAgenceId;

    // rideshare: dates + destination + seats_min
    if (mode === "rideshare") {
      if (date_debut && date_fin) {
        params.date_debut = iso(date_debut);
        params.date_fin = iso(date_fin);
      }
      if (destination) params.destination = destination;
      if (seatsMin) params.seats_min = seatsMin;
    }

    const { data } = await api.get("public/resources/search/", { params });
    setRentoutOffers(normalizeRentout(data?.rentout));
    setRideshareOffers(normalizeRideshare(data?.rideshare));
  };

  // charge selon le mode / filtres
  useEffect(() => {
    (async () => {
      try {
        if (mode === "my_fleet") {
          await loadMyFleet();
        } else if (mode === "rentout") {
          // pour rentout, on a besoin au moins de la liste des chauffeurs de MON agence
          await loadChauffeurs();
          await loadPublicResources();
        } else {
          // rideshare
          await loadPublicResources();
        }
      } catch (e) {
        console.error("Erreur chargement ressources", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typeVehicule, capaciteMin, destination, seatsMin, hideMine, mission?.id]);

  // --- UI ---
  const renderModeFilters = () => (
    <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
      <div className="btn-group" role="group" aria-label="Mode ressource">
        <button
          className={`btn btn-sm ${mode === "my_fleet" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setMode("my_fleet")}
        >
          Ma flotte
        </button>
        <button
          className={`btn btn-sm ${mode === "rentout" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setMode("rentout")}
        >
          Rentout
        </button>
        <button
          className={`btn btn-sm ${mode === "rideshare" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setMode("rideshare")}
        >
          Rideshare
        </button>
      </div>

      <div className="ms-2">
        <label className="form-label m-0">Type</label>
        <select
          className="form-select form-select-sm"
          value={typeVehicule}
          onChange={(e) => setTypeVehicule(e.target.value)}
        >
          <option value="">Tous</option>
          <option value="bus">Bus</option>
          <option value="minibus">Minibus</option>
          <option value="MICROBUS">Microbus</option>
          <option value="4x4">4x4</option>
        </select>
      </div>

      <div>
        <label className="form-label m-0">Capacité min</label>
        <input
          type="number"
          className="form-control form-control-sm"
          value={capaciteMin}
          onChange={(e) => setCapaciteMin(e.target.value)}
          placeholder="ex: 10"
          min={0}
        />
      </div>

      {mode === "rideshare" && (
        <>
          <div>
            <label className="form-label m-0">Destination</label>
            <input
              className="form-control form-select-sm"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="ex: TUN"
            />
          </div>
          <div>
            <label className="form-label m-0">Places min</label>
            <input
              type="number"
              className="form-control form-select-sm"
              value={seatsMin}
              onChange={(e) => setSeatsMin(e.target.value)}
              placeholder="ex: 5"
              min={0}
            />
          </div>
        </>
      )}

      {mode !== "my_fleet" && (
        <div className="form-check ms-2">
          <input
            id="hideMine"
            type="checkbox"
            className="form-check-input"
            checked={hideMine}
            onChange={(e) => setHideMine(e.target.checked)}
          />
          <label htmlFor="hideMine" className="form-check-label">
            Masquer mon agence
          </label>
        </div>
      )}
    </div>
  );

  const renderMyFleet = () => (
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
        <button
          className="btn btn-primary"
          onClick={() => onConfirm({ mode: "my_fleet", vehicule, chauffeur })}
          disabled={!vehicule || !chauffeur}
        >
          ✅ Confirmer (ma flotte)
        </button>
      </div>
    </>
  );

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
                <td>
                  {veh.marque} {veh.model} ({veh.immatriculation}) — {veh.capacite} pl.
                </td>
                {isRideShare && <td>{fmtHour(start)}</td>}
                {isRideShare && <td>{fmtHour(end)}</td>}
                {isRideShare && <td>{o.origin || "—"}</td>}
                {isRideShare && <td>{o.destination || o.trajet || "—"}</td>}
                {isRideShare && (
                  <td>
                    <span className="badge bg-info">{seatsAvail}</span>
                  </td>
                )}
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

  const renderRentout = () => (
    <>
      {/* Sélection CHAUFFEUR (requis) */}
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
        <button
          className="btn btn-primary"
          onClick={() => onConfirm({ mode: "rentout", offer_id: selectedOfferId, chauffeur })}
          disabled={!selectedOfferId || !chauffeur}
        >
          ✅ Choisir cette offre
        </button>
      </div>
    </>
  );

  const renderRideshare = () => (
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
        <button
          className="btn btn-primary"
          onClick={() =>
            onConfirm({ mode: "rideshare", offer_id: selectedOfferId, seats: Number(rideshareSeats || 0) })
          }
          disabled={!selectedOfferId || Number(rideshareSeats || 0) <= 0}
        >
          ✅ Réserver ces places
        </button>
      </div>
    </>
  );

  return (
    <Modal title="Choisir des ressources" onClose={onClose}>
      <div className="mb-2 text-muted">
        {mode === "rentout" ? (
          <small>
            Le mode <b>Rentout</b> n’utilise pas de dates ni de destination.
            Vous devez choisir un <b>chauffeur</b> de votre agence.
          </small>
        ) : mode === "rideshare" ? (
          <small>Le mode <b>Rideshare</b> utilise la fenêtre de la mission et peut filtrer par destination (pas de chauffeur requis).</small>
        ) : (
          <small>Le mode <b>Ma flotte</b> requiert un véhicule et un chauffeur de votre agence.</small>
        )}
      </div>

      {renderModeFilters()}
      {mode === "my_fleet" && renderMyFleet()}
      {mode === "rentout" && renderRentout()}
      {mode === "rideshare" && renderRideshare()}
    </Modal>
  );
}

function FichesMouvementList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMission, setSelectedMission] = useState(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("fiches-mouvement-list/");
      setItems(asArray(data));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleAssignConfirm = async (payload) => {
    try {
      if (!selectedMission) return;

      if (payload.mode === "my_fleet") {
        const response = await api.post(
          `missions/${selectedMission.id}/generate-om/`,
          { vehicule: payload.vehicule, chauffeur: payload.chauffeur },
          { responseType: "blob" }
        );
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `ordre_mission_${selectedMission.id}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setItems((prev) =>
          prev.map((i) => (i.id === selectedMission.id ? { ...i, ordre_mission_genere: true } : i))
        );
      }

      if (payload.mode === "rentout") {
        const vehiculeId = payload.offer_id; // normalisé = id du véhicule
        const resp = await api.post(
          `missions/${selectedMission.id}/generate-om/`,
          { vehicule: vehiculeId, chauffeur: payload.chauffeur },
          { responseType: "blob" }
        );
        const url = window.URL.createObjectURL(new Blob([resp.data]));
        const a = document.createElement("a");
        a.href = url;
        a.setAttribute("download", `ordre_mission_${selectedMission.id}.pdf`);
        document.body.appendChild(a);
        a.click();
        a.remove();

        setItems((prev) =>
          prev.map((i) => (i.id === selectedMission.id ? { ...i, ordre_mission_genere: true } : i))
        );
      }

      if (payload.mode === "rideshare") {
        const { offer_id, seats } = payload;
        await api.post(`offers/${offer_id}/book-seats/`, { seats });
        alert(`Rideshare confirmé: ${seats} place(s) réservées sur l'offre #${offer_id}.`);
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'opération.");
    } finally {
      setSelectedMission(null);
    }
  };

  const deleteOM = async (mission) => {
    try {
      await api.post(`missions/${mission.id}/unlock-om/`);
      setItems((prev) =>
        prev.map((i) => (i.id === mission.id ? { ...i, ordre_mission_genere: false } : i))
      );
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between mb-3">
        <h2>📋 Fiches de mouvement</h2>
        <button className="btn btn-outline-primary" onClick={() => navigate("/fiche-mouvement")}>
          ↩ Retour aux dossiers
        </button>
      </div>

      <div className="table-responsive">
        <table className="table table-striped align-middle">
          <thead className="table-light">
            <tr>
              <th>Réf.</th>
              <th>Type</th>
              <th>Aéroport</th>
              <th>Début</th>
              <th>Fin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const d1 = new Date(it.date_debut);
              const d2 = it.date_fin ? new Date(it.date_fin) : new Date(d1.getTime() + 2 * 60 * 60 * 1000);
              const isLocked = it.ordre_mission_genere;

              return (
                <tr key={it.id} className={isLocked ? "table-secondary opacity-75" : ""}>
                  <td>{it.reference}</td>
                  <td><BadgeType t={it.type} /></td>
                  <td>{it.aeroport}</td>
                  <td>{fmtHour(d1)}</td>
                  <td>{fmtHour(d2)}</td>
                  <td>
                    {!isLocked ? (
                      <button className="btn btn-sm btn-success" onClick={() => setSelectedMission(it)}>
                        📄 Choisir ressources
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => deleteOM(it)}>
                        ❌ Supprimer OM
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedMission && (
        <ModalAssignResources
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
          onConfirm={handleAssignConfirm}
        />
      )}
    </div>
  );
}

export default FichesMouvementList;
