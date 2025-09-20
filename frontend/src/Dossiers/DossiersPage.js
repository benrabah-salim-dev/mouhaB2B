// src/components/DossiersTable.jsx
import React, { useEffect, useMemo, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import { AuthContext } from "../context/AuthContext";

function fmtDateTime(s) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const extractRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  const maybe =
    payload && typeof payload === "object"
      ? Object.values(payload).find(Array.isArray)
      : null;
  return Array.isArray(maybe) ? maybe : [];
};
const extractCount = (payload, rows) =>
  Number.isFinite(payload?.count) ? Number(payload.count) : rows.length;

export default function DossiersTable() {
  const { agence_id: param } = useParams();
  const { user } = useContext(AuthContext) || {};
  const navigate = useNavigate();

  const agenceId = param || user?.agence_id || null;

  const [dossiers, setDossiers] = useState([]);
  const [count, setCount] = useState(0);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      if (!agenceId) throw new Error("Aucune agence");
      let all = [];
      let nextUrl = `dossiers/?agence=${agenceId}`;
      let lastPayload = null;

      while (nextUrl) {
        const { data } = await api.get(nextUrl);
        lastPayload = data;
        const rows = extractRows(data);
        all = all.concat(rows);
        nextUrl = data?.next ? data.next.replace(/^.*\/api\//, "") : null;
      }

      setRaw(lastPayload);
      setDossiers(all);
      setCount(extractCount(lastPayload, all));
    } catch (e) {
      const detail =
        e?.response?.data?.detail || e?.message || "Erreur inconnue";
      setError(`Erreur lors du chargement des dossiers: ${detail}`);
      setDossiers([]);
      setCount(0);
      setRaw(e?.response?.data || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agenceId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenceId]);

  const sorted = useMemo(() => {
    return [...dossiers].sort((a, b) =>
      String(a?.reference || "").localeCompare(String(b?.reference || ""), "fr", {
        sensitivity: "base",
      })
    );
  }, [dossiers]);

  return (
    <div className="container my-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="fw-bold mb-0">Dossiers</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
            ← Retour
          </button>
          <button className="btn btn-outline-dark" onClick={fetchAll} disabled={loading}>
            {loading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      </div>

      <div className="alert alert-secondary d-flex flex-wrap justify-content-between">
        <span>
          Agence ID : <strong>{agenceId || "—"}</strong>
        </span>
        <span>
          Total : <strong>{count}</strong>
        </span>
        <span>
          Affichés : <strong>{sorted.length}</strong>
        </span>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <p>Chargement…</p>}

      {!loading && !error && (
        <>
          {sorted.length === 0 ? (
            <div className="alert alert-warning">
              Aucun dossier trouvé.
              {raw && (
                <details className="mt-2">
                  <summary>Voir la réponse brute</summary>
                  <pre className="mt-2 bg-light p-2 small rounded" style={{ maxHeight: 240, overflow: "auto" }}>
                    {JSON.stringify(raw, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Référence</th>
                    <th>Nom réservation</th>
                    <th>Ville</th>
                    <th>Aéroport Arrivée</th>
                    <th>Vol Arrivée</th>
                    <th>Heure Arrivée</th>
                    <th>Heure Départ</th>
                    <th className="text-end">PAX Arr.</th>
                    <th className="text-end">PAX Ret.</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d) => (
                    <tr key={d.id || d.reference}>
                      <td>{d.reference || "—"}</td>
                      <td>{d.nom_reservation || "—"}</td>
                      <td>{d.ville || "—"}</td>
                      <td>{d.aeroport_arrivee || "—"}</td>
                      <td>{d.num_vol_arrivee || "—"}</td>
                      <td>{fmtDateTime(d.heure_arrivee)}</td>
                      <td>{fmtDateTime(d.heure_depart)}</td>
                      <td className="text-end">
                        {d.nombre_personnes_arrivee ?? "—"}
                      </td>
                      <td className="text-end">
                        {d.nombre_personnes_retour ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
