// src/RessourcesChauffeurs.jsx
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "./api";

export default function RessourcesChauffeurs() {
  const { agence_id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [chauffeurs, setChauffeurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [ignored, setIgnored] = useState([]);

  // marquage visuel
  const [recentlyCreated, setRecentlyCreated] = useState(new Set());
  const [recentlyUpdated, setRecentlyUpdated] = useState(new Set());

  // pour détecter les nouveaux éléments entre 2 fetch (hors import)
  const prevIdsRef = useRef(new Set());

  // Helpers
  const extractRows = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    if (payload && typeof payload === "object") {
      const maybe = Object.values(payload).find(Array.isArray);
      if (Array.isArray(maybe)) return maybe;
    }
    return [];
  };
  const followNextUrl = (next) => {
    if (!next) return null;
    // comme api a baseURL=/api/, si DRF renvoie /api/chauffeurs/?page=2 → on peut l’utiliser tel quel
    return next;
  };
  const getKey = (c) => c?.cin || c?.id;

  const fetchChauffeurs = async () => {
    try {
      setLoading(true);
      setMsg("");
      let all = [];
      // ✅ IMPORTANT : pas de /api en dur. On passe par `api` et on suit la pagination si besoin
      let url = `chauffeurs/?agence=${agence_id}`;
      while (url) {
        const { data } = await api.get(url);
        all = all.concat(extractRows(data));
        url = followNextUrl(data?.next || null);
      }

      // détection nouveaux vs état précédent
      const prev = prevIdsRef.current;
      const now = new Set(all.map(getKey).filter(Boolean));
      const newSinceLastFetch = new Set([...now].filter((id) => !prev.has(id)));
      if (!importing && newSinceLastFetch.size > 0) {
        setRecentlyCreated((old) => new Set([...old, ...newSinceLastFetch]));
      }
      prevIdsRef.current = now;

      setChauffeurs(all);
    } catch (e) {
      console.error(e);
      setMsg(
        e?.response?.status === 401
          ? "Session expirée. Merci de vous reconnecter."
          : "Erreur lors du chargement des chauffeurs."
      );
      setChauffeurs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agence_id) fetchChauffeurs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agence_id]);

  // si retour depuis une page "ajouter-chauffeur" avec ?created_id=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const createdId = params.get("created_id");
    if (createdId) {
      setRecentlyCreated((old) => new Set([...old, createdId]));
      const clean = new URL(window.location.href);
      clean.searchParams.delete("created_id");
      window.history.replaceState({}, "", clean.toString());
    }
  }, [location.search]);

  const handleImportChauffeurs = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMsg("");
    setIgnored([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("agence", agence_id);

    try {
      // ✅ endpoint côté backend: /api/importer-chauffeurs/ → ici juste "importer-chauffeurs/"
      const { data } = await api.post(`importer-chauffeurs/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const createdArr = data?.chauffeurs_crees || [];
      const updatedArr = data?.chauffeurs_mis_a_jour || [];
      const ignoredArr = data?.lignes_ignorees || [];

      setMsg(
        `Import chauffeurs : ${createdArr.length} créé(s), ${updatedArr.length} mis à jour, ${ignoredArr.length} ignoré(s).`
      );
      setIgnored(ignoredArr);

      const createdIds = new Set(createdArr.map((c) => c?.cin || c?.id).filter(Boolean));
      const updatedIds = new Set(updatedArr.map((c) => c?.cin || c?.id).filter(Boolean));
      setRecentlyCreated((prev) => new Set([...prev, ...createdIds]));
      setRecentlyUpdated((prev) => new Set([...prev, ...updatedIds]));

      e.target.value = null;
      await fetchChauffeurs();
    } catch (err) {
      console.error(err);
      setMsg("Erreur lors de l'import des chauffeurs.");
    } finally {
      setImporting(false);
    }
  };

  const clearMarks = () => {
    setRecentlyCreated(new Set());
    setRecentlyUpdated(new Set());
  };

  const rowClass = (c) => {
    const key = getKey(c);
    if (!key) return "";
    if (recentlyCreated.has(key)) return "table-success";
    if (recentlyUpdated.has(key)) return "table-warning";
    return "";
  };

  const safeKey = (c, idx) =>
    getKey(c) ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `row-${idx}`);

  return (
    <div className="container mt-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2>Chauffeurs de l’agence</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
            ← Retour
          </button>
          <button className="btn btn-outline-dark" onClick={clearMarks}>
            Effacer les marques
          </button>
        </div>
      </div>

      {!loading && (
        <div className="alert alert-secondary d-flex flex-wrap justify-content-between align-items-center">
          <span>
            Agence ID : <strong>{agence_id}</strong>
          </span>
          <span>
            Total chauffeurs chargés : <strong>{chauffeurs.length}</strong>
          </span>
          <span>
            <span className="badge text-bg-success me-2">Nouveau</span>
            <span className="badge text-bg-warning">MAJ</span>
          </span>
        </div>
      )}

      {/* Import */}
      <div className="mb-3">
        <label className="form-label">Importer un fichier Excel (.xls/.xlsx)</label>
        <input
          type="file"
          accept=".xls,.xlsx"
          className="form-control"
          onChange={handleImportChauffeurs}
          disabled={importing}
        />
        {importing && <p className="mt-2">Import en cours…</p>}
        {msg && <div className="alert alert-info mt-2">{msg}</div>}
        {ignored.length > 0 && (
          <details className="mt-2">
            <summary>Lignes ignorées ({ignored.length})</summary>
            <ul className="mt-2">
              {ignored.map((l, i) => (
                <li key={`${l.ligne}-${i}`}>
                  Ligne {l.ligne}: {l.raison}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Bouton Ajouter */}
      <div className="mb-2 d-flex gap-2">
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/agence/${agence_id}/ajouter-chauffeur`)}
        >
          Ajouter un chauffeur
        </button>
      </div>

      {/* Tableau */}
      {loading ? (
        <p>Chargement…</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-striped align-middle">
            <thead>
              <tr>
                <th>CIN</th>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Disponibilité</th>
                <th style={{ width: 120 }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(chauffeurs) && chauffeurs.length > 0 ? (
                chauffeurs.map((c, idx) => {
                  const key = getKey(c);
                  const isNew = key && recentlyCreated.has(key);
                  const isUpd = key && recentlyUpdated.has(key);
                  const dispo =
                    c?.disponibilite ??
                    c?.disponibilité ??
                    c?.disponible ??
                    c?.available ??
                    false;

                  return (
                    <tr key={safeKey(c, idx)} className={rowClass(c)}>
                      <td>{c.cin || "—"}</td>
                      <td>{c.nom || "—"}</td>
                      <td>{c.prenom || c.prénom || "—"}</td>
                      <td>{dispo ? "Disponible" : "Indisponible"}</td>
                      <td>
                        {isNew && (
                          <span className="badge text-bg-success">Nouveau</span>
                        )}
                        {isUpd && (
                          <span className="badge text-bg-warning ms-1">MAJ</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center">
                    Aucun chauffeur
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
