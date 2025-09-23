import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import AssignResourcesModal from "./AssignResourcesModal";
import { fmtHour } from "./utils";
import "./fichesList.css";

/* UI bricoles très courtes */
const BadgeType = ({ t }) => {
  const label = t === "A" ? "Arrivée" : t === "D" ? "Départ" : "—";
  const cls = t === "A" ? "bg-success" : t === "D" ? "bg-primary" : "bg-secondary";
  return <span className={`badge ${cls}`}>{label}</span>;
};

const ObservationCell = ({ text = "", max = 60, onOpen }) => {
  if (!text) return <>—</>;
  const isLong = text.length > max;
  const preview = isLong ? text.slice(0, max).trimEnd() + "…" : text;
  return (
    <div className="d-flex align-items-center gap-2">
      <div className="text-truncate" style={{ maxWidth: 260 }}>{preview}</div>
      {isLong && (
        <button className="btn btn-sm btn-outline-warning" onClick={() => onOpen(text)} title="Lire la suite">
          Lire la suite
        </button>
      )}
    </div>
  );
};

const PortalModal = ({ title, children, onClose }) => (
  <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,.35)" }}>
    <div className="modal-dialog modal-lg">
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

const asArray = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

export default function FichesMouvementList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMission, setSelectedMission] = useState(null);
  const [obsFullText, setObsFullText] = useState(null);
  

  // NOUVELLE RÈGLE: Début = date_debut telle quelle (pas d’offset +60)
  const END_OFFSET_MIN = 180; // Fin = Début + 3h

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("fiches-mouvement-list/");
      setItems(asArray(data));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);



  // helpers (en haut du fichier si tu veux)
const isNextDay = (start, end) => {
  if (!start || !end) return false;
  const s = new Date(start);
  const e = new Date(end);
  return (
    e.getFullYear() !== s.getFullYear() ||
    e.getMonth() !== s.getMonth() ||
    e.getDate() !== s.getDate()
  );
};



  // Déverrouiller / retirer le PDF OM
  const deleteOM = async (mission) => {
    try {
      await api.post(`missions/${mission.id}/unlock-om/`);
      setItems((prev) => prev.map((i) => (i.id === mission.id ? { ...i, ordre_mission_genere: false } : i)));
    } catch (e) { console.error(e); }
  };

  // Suppression d’une fiche (sans POST /delete/)
  const deleteFiche = async (fiche) => {
    if (!window.confirm(`Supprimer la fiche ${fiche.reference} ?`)) return;

    const tryDelete = async (url) => {
      try {
        await api.delete(url);
        return true;
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401) {
          alert("Session expirée — veuillez vous reconnecter.");
          return false;
        }
        if (status === 404) return false; // on essaie l’autre endpoint
        throw e; // autre erreur: remonte
      }
    };

    try {
      // 1) endpoint DRF classique / detail
      let ok = await tryDelete(`fiches-mouvement/${fiche.id}/`);
      // 2) fallback si l’autre route accepte aussi DELETE
      if (!ok) ok = await tryDelete(`fiches-mouvement-list/${fiche.id}/`);

      if (!ok) {
        alert("Impossible de supprimer la fiche (endpoint introuvable ou session expirée).");
        return;
      }

      setItems((prev) => prev.filter((x) => x.id !== fiche.id));
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        e?.message ||
        "Suppression impossible.";
      alert(detail);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 className="m-0">📋 Fiches de mouvement</h2>
        <button className="btn btn-outline-primary" onClick={() => navigate("/fiche-mouvement")}>
          ↩ Retour
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
              <th>Hôtel</th>
              <th>Pax</th>
              <th>Clients</th>
              <th>Observation</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.map((it) => {
              // Début = tel que reçu
              const startDisplayed = it.date_debut ? new Date(it.date_debut) : null;
              // Fin = Début + 3h
              const END_OFFSET_MIN = 180;
const endDisplayed = startDisplayed
  ? new Date(startDisplayed.getTime() + END_OFFSET_MIN * 60 * 1000)
  : null;

  const endIsNextDay = isNextDay(startDisplayed, endDisplayed);

              const isLocked = it.ordre_mission_genere;

              return (
                <tr key={it.id} className={isLocked ? "table-secondary opacity-75" : ""}>
                  <td>{it.reference}</td>
                  <td><BadgeType t={it.type} /></td>
                  <td>{it.aeroport}</td>
                  <td>{fmtHour(startDisplayed)}</td>
                  <td>
  {fmtHour(endDisplayed)}
  {endIsNextDay && (
    <span className="badge bg-warning text-dark ms-1" title="Le vol termine le lendemain">
      +1j
    </span>
  )}
</td>

                  <td>{it.hotel || "—"}</td>
                  <td>{it.pax ?? "—"}</td>
                  <td>{it.clients || "—"}</td>
                  <td><ObservationCell text={it.observation} max={60} onOpen={setObsFullText} /></td>
                  <td className="text-end">
                    <div className="btn-group">
                      {!isLocked ? (
                        <button className="btn btn-sm btn-success" onClick={() => setSelectedMission(it)}>
                          📄 Choisir ressources
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => deleteOM(it)}>
                          ❌ Supprimer OM
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => deleteFiche(it)}
                        title="Supprimer la fiche"
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {loading && (
              <tr><td colSpan={10} className="text-center py-4">Chargement…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Observation */}
      {obsFullText && (
        <PortalModal title="Observation complète" onClose={() => setObsFullText(null)}>
          <div className="alert alert-warning">
            <strong>Attention :</strong> contenu long — vérifiez les détails avant validation.
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{obsFullText}</div>
          <div className="text-end mt-3">
            <button className="btn btn-warning" onClick={() => setObsFullText(null)}>Fermer</button>
          </div>
        </PortalModal>
      )}

      {/* Modal Affectation */}
      {selectedMission && (
        <AssignResourcesModal
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
          onCompleted={() => {
            fetchList();
            setSelectedMission(null);
          }}
        />
      )}
    </div>
  );
}
