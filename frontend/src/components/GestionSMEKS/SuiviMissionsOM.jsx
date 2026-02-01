// src/pages/gestion/SuiviMissions.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/client";

function fmtDT(s) {
  if (!s) return "";
  return String(s).slice(0, 19).replace("T", " ");
}

function prettyChanges(changes) {
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes).map(([k, v]) => {
    if (v && typeof v === "object" && ("from" in v || "to" in v)) {
      return { field: k, from: v?.from, to: v?.to };
    }
    // CREATE / DELETE => dict simple
    return { field: k, from: "", to: v };
  });
}


export default function SuiviMissions() {
  const [agences, setAgences] = useState([]);
  const [agenceId, setAgenceId] = useState("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [missions, setMissions] = useState([]);

  const [selectedMission, setSelectedMission] = useState(null);
  const [loadingOms, setLoadingOms] = useState(false);
  const [oms, setOms] = useState([]);

  // history
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyTitle, setHistoryTitle] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/agences/", { params: { page_size: 9999 } });
        const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        setAgences(list);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function fetchMissions() {
    setLoading(true);
    setSelectedMission(null);
    setOms([]);
    setHistory([]);
    setShowHistory(false);

    try {
      const res = await api.get("/gestion/suivi/missions/", {
        params: {
          agence_id: agenceId || undefined,
          q: q.trim() || undefined,
        },
      });
      setMissions(res.data?.results || []);
    } catch (e) {
      console.error(e);
      setMissions([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOms(mission) {
    setSelectedMission(mission);
    setLoadingOms(true);
    setOms([]);
    setHistory([]);
    setShowHistory(false);

    try {
      const res = await api.get(`/gestion/suivi/missions/${mission.id}/oms/`);
      setOms(res.data?.results || []);
    } catch (e) {
      console.error(e);
      setOms([]);
    } finally {
      setLoadingOms(false);
    }
  }

  async function fetchMissionHistory(mission) {
    if (!mission?.id) return;
    setLoadingHistory(true);
    setHistory([]);
    setShowHistory(true);
    setHistoryTitle(`Historique Mission #${mission.id} (${mission.reference})`);

    try {
      const res = await api.get(`/gestion/suivi/missions/${mission.id}/history/`);
      setHistory(res.data?.results || []);
    } catch (e) {
      console.error(e);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function fetchOmHistory(om) {
    if (!om?.id) return;
    setLoadingHistory(true);
    setHistory([]);
    setShowHistory(true);
    setHistoryTitle(`Historique OM #${om.id} (${om.reference})`);

    try {
      const res = await api.get(`/gestion/suivi/oms/${om.id}/history/`);
      setHistory(res.data?.results || []);
    } catch (e) {
      console.error(e);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  const hasSelected = !!selectedMission?.id;

  return (
    <div className="container-fluid py-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h3 className="mb-0">Suivi – Missions</h3>
          <div className="text-muted">Recherche par Agence + Mission ID / Référence</div>
        </div>
        <button className="btn btn-primary" onClick={fetchMissions} disabled={loading}>
          {loading ? "Chargement…" : "Rechercher"}
        </button>
      </div>

      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-2 align-items-center">
          <select
            className="form-select"
            style={{ maxWidth: 360 }}
            value={agenceId}
            onChange={(e) => setAgenceId(e.target.value)}
          >
            <option value="">Toutes les agences</option>
            {agences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom || `Agence #${a.id}`}
              </option>
            ))}
          </select>

          <input
            className="form-control"
            style={{ maxWidth: 420 }}
            placeholder="Mission ID (ex: 120) ou Référence (ex: M-20251231-0001)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchMissions()}
          />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <div className="card">
            <div className="card-header fw-semibold">
              Missions ({missions.length})
            </div>

            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 80 }}>ID</th>
                    <th>Référence</th>
                    <th>Agence</th>
                    <th>Date</th>
                    <th style={{ width: 190 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && missions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Aucun résultat.
                      </td>
                    </tr>
                  )}

                  {missions.map((m) => (
                    <tr key={m.id} className={selectedMission?.id === m.id ? "table-active" : ""}>
                      <td>{m.id}</td>
                      <td className="fw-semibold">{m.reference}</td>
                      <td>{m.agence_name || "-"}</td>
                      <td>{m.date} {m.horaires ? `(${String(m.horaires).slice(0,5)})` : ""}</td>
                      <td className="d-flex gap-2">
                        <button className="btn btn-sm btn-outline-dark" onClick={() => fetchOms(m)}>
                          Voir OM
                        </button>
                        <button className="btn btn-sm btn-outline-primary" onClick={() => fetchMissionHistory(m)}>
                          Historique
                        </button>
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-5">
          <div className="card">
            <div className="card-header fw-semibold d-flex justify-content-between align-items-center">
              <div>
                {selectedMission ? `OM – Mission #${selectedMission.id} (${selectedMission.reference})` : "OM"}
              </div>
              {hasSelected && (
                <button className="btn btn-sm btn-outline-primary" onClick={() => fetchMissionHistory(selectedMission)}>
                  Historique Mission
                </button>
              )}
            </div>

            <div className="card-body">
              {!selectedMission ? (
                <div className="text-muted">Sélectionne une mission pour afficher ses OM.</div>
              ) : loadingOms ? (
                <div className="text-muted">Chargement des OM…</div>
              ) : oms.length === 0 ? (
                <div className="text-muted">Aucun OM pour cette mission.</div>
              ) : (
                <div className="d-grid gap-2">
                  {oms.map((om) => (
                    <div key={om.id} className="border rounded p-2">
                      <div className="d-flex justify-content-between flex-wrap gap-2">
                        <div className="fw-semibold">
                          {om.reference} <span className="text-muted">v{om.version}</span>
                        </div>
                        <div className="text-muted small">{fmtDT(om.created_at)}</div>
                      </div>
                      <div className="text-muted small">
                        base: {om.base_reference} · par: {om.created_by || "-"}
                      </div>

                      <div className="d-flex gap-2 mt-2">
                        {om.pdf ? (
                          <a className="btn btn-sm btn-outline-primary" href={om.pdf} target="_blank" rel="noreferrer">
                            Ouvrir PDF
                          </a>
                        ) : (
                          <div className="text-muted small mt-1">Pas de PDF.</div>
                        )}
                        <button className="btn btn-sm btn-outline-dark" onClick={() => fetchOmHistory(om)}>
                          Historique OM
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {showHistory && (
            <div className="card mt-3">
              <div className="card-header fw-semibold d-flex justify-content-between align-items-center">
                <div>{historyTitle}</div>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowHistory(false)}>
                  Fermer
                </button>
              </div>

              <div className="card-body">
                {loadingHistory ? (
                  <div className="text-muted">Chargement historique…</div>
                ) : history.length === 0 ? (
                  <div className="text-muted">Aucun log.</div>
                ) : (
                  <div className="d-grid gap-2">
                    {history.map((h) => (
                      <div key={h.id} className="border rounded p-2">
                        <div className="d-flex justify-content-between flex-wrap gap-2">
                          <div className="fw-semibold">
                            {String(h.action).toUpperCase()}
                          </div>
                          <div className="text-muted small">{fmtDT(h.created_at)}</div>
                        </div>
                        <div className="text-muted small">par: {h.actor || "-"}</div>

                        <div className="mt-2">
                          {prettyChanges(h.changes).length === 0 ? (
                            <div className="text-muted small">Aucun détail.</div>
                          ) : (
                            <div className="table-responsive">
                              <table className="table table-sm mb-0">
                                <thead>
                                  <tr>
                                    <th>Champ</th>
                                    <th>Avant</th>
                                    <th>Après</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {prettyChanges(h.changes).map((c, idx) => (
                                    <tr key={idx}>
                                      <td className="fw-semibold">{c.field}</td>
                                      <td className="text-muted">{String(c.from ?? "")}</td>
                                      <td className="text-muted">{String(c.to ?? "")}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
