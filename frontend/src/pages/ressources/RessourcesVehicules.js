// src/RessourcesVehicules.js
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../api/client";

export default function RessourcesVehicules() {
  const { agence_id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [vehicules, setVehicules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [ignored, setIgnored] = useState([]);

  const [recentlyCreated, setRecentlyCreated] = useState(new Set());
  const [recentlyUpdated, setRecentlyUpdated] = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);

  const prevIdsRef = useRef(new Set());

  const extractRows = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (payload && typeof payload === "object") {
      const maybeArray = Object.values(payload).find(Array.isArray);
      if (Array.isArray(maybeArray)) return maybeArray;
    }
    return [];
  };

  const getKey = (v) => v?.immatriculation || v?.id;

  const followNextUrl = (next) => {
    if (!next) return null;
    if (next.startsWith("http")) return next;
    return next.replace(/^\/+/, "").replace(/^api\/+/, "");
  };

  const fetchVehicules = async () => {
    try {
      setLoading(true);
      setMsg("");
      let all = [];
      let nextUrl = `vehicules/?agence=${agence_id}`;

      while (nextUrl) {
        const { data } = await api.get(nextUrl);
        all = all.concat(extractRows(data));
        nextUrl = followNextUrl(data?.next || null);
      }

      const prevIds = prevIdsRef.current;
      const nowIds = new Set(all.map(getKey).filter(Boolean));
      const newSinceLastFetch = new Set([...nowIds].filter((id) => !prevIds.has(id)));

      if (!importing && newSinceLastFetch.size > 0) {
        setRecentlyCreated((old) => new Set([...old, ...newSinceLastFetch]));
      }

      prevIdsRef.current = nowIds;
      setVehicules(all);
    } catch (e) {
      console.error(e);
      setMsg("Erreur lors du chargement des véhicules.");
      setVehicules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agence_id) fetchVehicules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agence_id]);

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

  const handleImportVehicules = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMsg("");
    setIgnored([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("agence", agence_id);

    try {
      const res = await api.post(`importer-vehicules/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // === IMPORTANT : on colle à la réponse du backend ===
      // Backend renvoie : { detail, created, updated, errors }
      const createdCount = res.data?.created ?? 0;
      const updatedCount = res.data?.updated ?? 0;
      const errorsArr = res.data?.errors ?? [];

      setMsg(
        `Import véhicules : ${createdCount} créé(s), ${updatedCount} mis à jour, ${errorsArr.length} erreur(s).`
      );

      // On transforme les erreurs (simples strings) en objets pour l'affichage
      const ignoredArr = errorsArr.map((errMsg, idx) => ({
        ligne: idx + 1,
        raison: errMsg,
      }));
      setIgnored(ignoredArr);

      // On ne peut pas connaître précisément quelles immatriculations sont nouvelles
      // donc on se contente de recharger la liste et de marquer tout comme "rafraîchi"
      setRecentlyCreated(new Set());
      setRecentlyUpdated(new Set());

      e.target.value = null;
      await fetchVehicules();
    } catch (err) {
      console.error(err);
      setMsg("Erreur lors de l'import des véhicules.");
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteVehicule = async (vehiculeId) => {
    if (!vehiculeId) return;
    if (!window.confirm("Confirmer la suppression de ce véhicule ?")) return;

    try {
      setDeletingId(vehiculeId);
      await api.delete(`vehicules/${vehiculeId}/`);
      setVehicules((prev) => prev.filter((v) => String(v.id) !== String(vehiculeId)));
      setMsg("Véhicule supprimé.");
      setRecentlyCreated((prev) => {
        const next = new Set([...prev]);
        next.delete(vehiculeId);
        return next;
      });
      setRecentlyUpdated((prev) => {
        const next = new Set([...prev]);
        next.delete(vehiculeId);
        return next;
      });
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        "Erreur pendant la suppression.";
      alert(detail);
    } finally {
      setDeletingId(null);
    }
  };

  const clearMarks = () => {
    setRecentlyCreated(new Set());
    setRecentlyUpdated(new Set());
  };

  const rowClass = (v) => {
    const key = getKey(v);
    if (!key) return "";
    if (recentlyCreated.has(key)) return "table-success";
    if (recentlyUpdated.has(key)) return "table-warning";
    return "";
  };

  const safeKey = (v, idx) =>
    getKey(v) ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `row-${idx}`);

  const renderDisponibilite = (v) => {
    // Si on suit ce qu'on a fait côté backend :
    // - par défaut vehicule.statut = "disponible"
    // - quand une mission l'utilise : vehicule.statut = "occupe"
    const statut = (v.statut || "").toLowerCase();

    if (!statut || statut === "disponible") {
      return "Disponible";
    }
    if (statut === "occupe" || statut === "occupé" || statut === "indisponible") {
      return "Indisponible";
    }
    // fallback lisible si autre valeur
    return statut || "—";
  };

  return (
    <div className="container mt-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2>Véhicules de l’agence</h2>
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
            Total véhicules chargés : <strong>{vehicules.length}</strong>
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
          onChange={handleImportVehicules}
          disabled={importing}
        />
        {importing && <p className="mt-2">Import en cours…</p>}
        {msg && <div className="alert alert-info mt-2">{msg}</div>}
        {ignored.length > 0 && (
          <details className="mt-2">
            <summary>Lignes ignorées / erreurs ({ignored.length})</summary>
            <ul className="mt-2">
              {ignored.map((l, i) => (
                <li key={`${l.ligne}-${i}`}>
                  {l.ligne ? `Ligne ${l.ligne}: ` : ""}
                  {l.raison}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="mb-2 d-flex gap-2">
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/agence/${agence_id}/ajouter-vehicule`)}
        >
          Ajouter un véhicule
        </button>
      </div>

      {loading ? (
        <p>Chargement…</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-striped align-middle">
            <thead>
              <tr>
                <th>Type</th>
                <th>Marque</th>
                <th>Modèle</th>
                <th>Capacité</th>
                <th>Année</th>
                <th>Immatriculation</th>
                <th>Disponibilité</th>
                <th style={{ width: 120 }}>Statut</th>
                <th className="text-end" style={{ width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicules.map((v, idx) => (
                <tr key={safeKey(v, idx)} className={rowClass(v)}>
                  <td>{v.type}</td>
                  <td>{v.marque}</td>
                  <td>{v.model ?? v.modele}</td>
                  <td>{v.capacite ?? v.capacité}</td>
                  <td>{v.annee ?? v.année}</td>
                  <td>{v.immatriculation}</td>
                  <td>{renderDisponibilite(v)}</td>
                  <td>
                    {recentlyCreated.has(getKey(v)) && (
                      <span className="badge text-bg-success">Nouveau</span>
                    )}
                    {recentlyUpdated.has(getKey(v)) && (
                      <span className="badge text-bg-warning ms-1">MAJ</span>
                    )}
                  </td>
                  <td className="text-end">
                    <div className="btn-group">
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDeleteVehicule(v.id)}
                        disabled={deletingId === v.id}
                        title="Supprimer"
                      >
                        {deletingId === v.id ? "…" : "🗑️"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {vehicules.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center">
                    Aucun véhicule
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
