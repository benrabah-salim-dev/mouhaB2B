// src/components/FicheMouvementList/FichesMouvementList.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import api from "../../api";
import AssignResourcesModal from "./AssignResourcesModal";
import { fmtHour } from "./utils";
import "./fichesList.css";

/* Badges */
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

/** Détecte le mode selon l'URL courante */
function useFicheMode() {
  const location = useLocation();
  const path = location.pathname.toLowerCase();
  if (path.includes("mes-departs")) return "D";
  if (path.includes("mes-arrivees")) return "A";
  return null;
}

export default function FichesMouvementList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { agenceId } = useParams();
  const mode = useFicheMode(); // "D" | "A" | null

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMission, setSelectedMission] = useState(null);
  const [obsFullText, setObsFullText] = useState(null);

  const END_OFFSET_MIN = 180;

  const title = useMemo(() => {
    if (mode === "D") return "🛫 Mes départs";
    if (mode === "A") return "🛬 Mes arrivées";
    return "📋 Fiches de mouvement";
  }, [mode]);

  const emptyMsg = useMemo(() => {
    if (mode === "D") return "Aucun départ trouvé.";
    if (mode === "A") return "Aucune arrivée trouvée.";
    return "Aucune fiche trouvée.";
  }, [mode]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        mode === "D" || mode === "A"
          ? `fiches-mouvement-list/?type=${mode}`
          : `fiches-mouvement-list/`;

      const { data } = await api.get(url);
      let arr = asArray(data);
      if (mode === "D") arr = arr.filter(it => it?.type === "D");
      if (mode === "A") arr = arr.filter(it => it?.type === "A");
      setItems(arr);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { fetchList(); }, [fetchList]);

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

  const deleteFiche = async (fiche) => {
    if (!window.confirm(`Supprimer la fiche ${fiche.reference} ?`)) return;
    try {
      await api.delete(`fiches-mouvement/${fiche.id}/`);
      await fetchList();
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
      {/* HEADER + boutons d'action */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 className="m-0">{title}</h2>

        <div className="d-flex flex-wrap gap-2">
          {/* Bouton retour */}
          <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
            ↩ Retour
          </button>

          {/* Actualiser */}
          <button className="btn btn-outline-primary" onClick={fetchList} disabled={loading}>
            {loading ? "Actualisation…" : "Actualiser"}
          </button>

          {/* Créer une fiche (générique) + split pour départ/arrivée */}
          <div className="btn-group">
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/agence/${agenceId}/fiche-mouvement`)}
              title="Créer une nouvelle fiche de mouvement"
            >
              + Créer une fiche de mouvement
            </button>
  
          </div>
        </div>
      </div>

      {/* TABLEAU */}
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
              const startDisplayed = it.date_debut ? new Date(it.date_debut) : null;
              const endDisplayed = startDisplayed
                ? new Date(startDisplayed.getTime() + END_OFFSET_MIN * 60 * 1000)
                : null;
              const endIsNextDay = isNextDay(startDisplayed, endDisplayed);

              return (
                <tr key={it.id}>
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
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => setSelectedMission(it)}
                        title="Choisir les ressources (ma flotte / rentout / rideshare)"
                      >
                        📄 Choisir ressources
                      </button>
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
            {!loading && !items.length && (
              <tr><td colSpan={10} className="text-center text-muted py-4">{emptyMsg}</td></tr>
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
