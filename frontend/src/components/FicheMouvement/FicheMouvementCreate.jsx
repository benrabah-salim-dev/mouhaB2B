// src/components/FicheMouvementCreate.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { FaPlus, FaTrash, FaPlaneArrival, FaPlaneDeparture, FaHotel, FaUsers, FaInfoCircle } from "react-icons/fa";

// Utilitaire Date
const isoToday = () => new Date().toISOString().split('T')[0];

// ====== Autocomplete Google Places ======
function HotelAutocompleteInput({ value, onChange, required, className, error, label, onPlaceSelected }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!window.google?.maps?.places || !inputRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["establishment"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place) return;
      const name = place.name || "";
      onChange({ target: { value: name } });
      if (onPlaceSelected) onPlaceSelected(place);
    });

    return () => {
      window.google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [onChange, onPlaceSelected]);

  return (
    <div className="w-100">
      {label && <label className="form-label fw-bold small">{label}</label>}
      <input
        ref={inputRef}
        type="text"
        className={`${className} ${error ? "is-invalid" : ""}`}
        value={value}
        onChange={onChange}
        required={required}
        placeholder="Rechercher un hôtel..."
      />
      {error && <div className="invalid-feedback">{error}</div>}
    </div>
  );
}

const EXTRA_FIELDS_CONFIG = [
  { key: "adulte", label: "Adultes", type: "number", col: "1" },
  { key: "enfants", label: "Enfants", type: "number", col: "1" },
  { key: "bebe", label: "Bébés", type: "number", col: "1" },
  { key: "ville", label: "Ville", type: "text", col: "3" },
  { key: "code_postal", label: "CP", type: "text", col: "2" },
  { key: "observation", label: "Observation", type: "text", col: "4" },
];

export default function FicheMouvementCreate() {
  const { agence_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const kind = location.state?.kind || new URLSearchParams(location.search).get("kind") || "depart";
  const isArrivee = kind === "arrivee";

  const [form, setForm] = useState({
    date: isoToday(),
    horaires: "",
    numero_vol: "",
    aeroport: "",
    client_to: "",
  });

  const [clients, setClients] = useState([
    { hotel: "", titulaire: "", pax: 1, extra: { adulte: "", enfants: "", bebe: "", observation: "", ville: "", code_postal: "" } },
  ]);

  const [extraFields, setExtraFields] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const remainingExtraFields = EXTRA_FIELDS_CONFIG.filter(f => !extraFields.includes(f.key));

  // --- Handlers ---
  const handleFormChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const updateClient = (index, data) => {
    setClients(prev => prev.map((c, i) => i === index ? { ...c, ...data } : c));
  };

  const handlePlaceSelected = (index, place) => {
    const comps = place.address_components || [];
    const getPart = (type) => comps.find(c => c.types.includes(type))?.long_name || "";
    
    const ville = getPart("locality") || getPart("administrative_area_level_1");
    const cp = getPart("postal_code");

    const newExtra = { ...clients[index].extra };
    if (ville) newExtra.ville = ville;
    if (cp) newExtra.code_postal = cp;

    updateClient(index, { extra: newExtra });

    // Auto-active les colonnes si elles contiennent des données
    setExtraFields(prev => {
      const next = [...prev];
      if (ville && !next.includes("ville")) next.push("ville");
      if (cp && !next.includes("code_postal")) next.push("code_postal");
      return next;
    });
  };

  const addClientLine = () => {
    const lastHotel = clients[clients.length - 1]?.hotel || "";
    setClients([...clients, { 
      hotel: lastHotel, 
      titulaire: "", 
      pax: 1, 
      extra: { adulte: "", enfants: "", bebe: "", observation: "", ville: "", code_postal: "" } 
    }]);
  };

  const validate = () => {
    const e = {};
    if (!form.date) e.date = "Obligatoire";
    if (!form.horaires) e.horaires = "Obligatoire";
    if (!form.numero_vol.trim()) e.numero_vol = "Requis";
    if (!form.aeroport.trim()) e.aeroport = "Requis";
    if (!form.client_to.trim()) e.client_to = "Requis";
    if (!clients[0].hotel.trim()) e.hotel = "L'hôtel est requis";
    if (!clients[0].titulaire.trim()) e.titulaire = "Le nom est requis";
    
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    try {
      const totals = clients.reduce((acc, c) => {
        acc.adulte += parseInt(c.extra.adulte || 0);
        acc.enfants += parseInt(c.extra.enfants || 0);
        acc.bebe += parseInt(c.extra.bebe || 0);
        if (!acc.ville) acc.ville = c.extra.ville;
        if (!acc.code_postal) acc.code_postal = c.extra.code_postal;
        if (!acc.observation) acc.observation = c.extra.observation;
        return acc;
      }, { adulte: 0, enfants: 0, bebe: 0, ville: "", code_postal: "", observation: "" });

      const payload = {
        agence: Number(agence_id),
        type: isArrivee ? "A" : "D",
        ...form,
        hotel: clients[0].hotel,
        titulaire: clients[0].titulaire,
        pax: Number(clients[0].pax) || 1,
        ...totals,
        [isArrivee ? "destination" : "provenance"]: form.aeroport
      };

      await api.post("fiches-mouvement/create-simple/", payload);
      navigate(`/agence/${agence_id}/fiches-mouvement/mes-${kind}s`);
    } catch (err) {
      alert(err?.response?.data?.detail || "Erreur technique");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center gap-3 mb-4">
        <div className={`p-3 rounded-circle bg-opacity-10 ${isArrivee ? 'bg-success text-success' : 'bg-primary text-primary'}`}>
          {isArrivee ? <FaPlaneArrival size={24} /> : <FaPlaneDeparture size={24} />}
        </div>
        <div>
          <h2 className="mb-0 fw-bold">{isArrivee ? "Arrivée" : "Départ"}</h2>
          <p className="text-muted mb-0">Création d'une nouvelle fiche de mouvement</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* SECTION 1: VOL */}
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 15 }}>
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-2 mb-3 text-secondary">
              <FaInfoCircle /> <h5 className="mb-0 fw-bold text-uppercase small">Détails du vol</h5>
            </div>
            <div className="row g-3">
              <div className="col-md-2">
                <label className="form-label small fw-bold">Date</label>
                <input type="date" className={`form-control ${errors.date ? "is-invalid" : ""}`} value={form.date} onChange={handleFormChange("date")} />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-bold">Heure</label>
                <input type="time" className={`form-control ${errors.horaires ? "is-invalid" : ""}`} value={form.horaires} onChange={handleFormChange("horaires")} />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-bold">N° Vol</label>
                <input type="text" className={`form-control ${errors.numero_vol ? "is-invalid" : ""}`} value={form.numero_vol} onChange={handleFormChange("numero_vol")} placeholder="ex: TU712" />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-bold">{isArrivee ? "Provenance" : "Destination"}</label>
                <input type="text" className={`form-control ${errors.aeroport ? "is-invalid" : ""}`} value={form.aeroport} onChange={handleFormChange("aeroport")} placeholder="Aéroport..." />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-bold">Client TO</label>
                <input type="text" className={`form-control ${errors.client_to ? "is-invalid" : ""}`} value={form.client_to} onChange={handleFormChange("client_to")} placeholder="Nom du TO..." />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: CLIENTS & HOTELS */}
        <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: 15 }}>
          <div className="card-body p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center gap-2 text-secondary">
                <FaHotel /> <h5 className="mb-0 fw-bold text-uppercase small">Hôtels & Passagers</h5>
              </div>
              <button type="button" className="btn btn-sm btn-outline-primary rounded-pill px-3" onClick={addClientLine}>
                <FaPlus className="me-1" /> Ajouter une ligne
              </button>
            </div>

            <div className="table-responsive">
              <table className="table table-borderless align-middle">
                <thead>
                  <tr className="text-muted small">
                    <th style={{ minWidth: 250 }}>Hôtel</th>
                    <th style={{ minWidth: 200 }}>Titulaire / Client</th>
                    <th style={{ width: 100 }}>PAX</th>
                    {extraFields.map(key => (
                      <th key={key} style={{ minWidth: 100 }}>
                        {EXTRA_FIELDS_CONFIG.find(f => f.key === key)?.label}
                      </th>
                    ))}
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, idx) => (
                    <tr key={idx} className="border-bottom">
                      <td>
                        <HotelAutocompleteInput
                          value={c.hotel}
                          onChange={(e) => updateClient(idx, { hotel: e.target.value })}
                          onPlaceSelected={(p) => handlePlaceSelected(idx, p)}
                          error={idx === 0 ? errors.hotel : null}
                          className="form-control form-control-sm"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className={`form-control form-control-sm ${idx === 0 && errors.titulaire ? "is-invalid" : ""}`}
                          value={c.titulaire}
                          onChange={(e) => updateClient(idx, { titulaire: e.target.value })}
                          placeholder="Nom..."
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="form-control form-control-sm"
                          value={c.pax}
                          onChange={(e) => updateClient(idx, { pax: e.target.value })}
                        />
                      </td>
                      {extraFields.map(key => (
                        <td key={key}>
                          <input
                            type={EXTRA_FIELDS_CONFIG.find(f => f.key === key).type}
                            className="form-control form-control-sm"
                            value={c.extra[key]}
                            onChange={(e) => {
                              const nextExtra = { ...c.extra, [key]: e.target.value };
                              updateClient(idx, { extra: nextExtra });
                            }}
                          />
                        </td>
                      ))}
                      <td>
                        {idx > 0 && (
                          <button type="button" className="btn btn-link text-danger p-0" onClick={() => setClients(clients.filter((_, i) => i !== idx))}>
                            <FaTrash />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3">
              <p className="small fw-bold text-muted mb-2">Colonnes optionnelles :</p>
              <div className="d-flex flex-wrap gap-2">
                {remainingExtraFields.map(f => (
                  <button key={f.key} type="button" className="btn btn-xs btn-light border text-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setExtraFields([...extraFields, f.key])}>
                    + {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="d-flex justify-content-between align-items-center">
          <button type="button" className="btn btn-link text-secondary text-decoration-none" onClick={() => navigate(-1)}>
            Annuler
          </button>
          <button type="submit" className={`btn btn-lg px-5 rounded-pill shadow ${isArrivee ? 'btn-success' : 'btn-primary'}`} disabled={saving}>
            {saving ? (
              <><span className="spinner-border spinner-border-sm me-2" /> Création...</>
            ) : (
              "Créer la fiche"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}