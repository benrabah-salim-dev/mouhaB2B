// src/components/GestionSMEKS/AgencesList.jsx
import React, { useEffect, useState } from "react";
import api from "../../api/client";

export default function AgencesList() {
  const [agences, setAgences] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAgences = async () => {
    setLoading(true);
    try {
      const res = await api.get("/agences/");
      const data = Array.isArray(res.data) ? res.data : res.data.results || [];
      // tri alphabétique par nom
      data.sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
      setAgences(data);
    } catch (err) {
      console.error("Erreur lors du chargement des agences", err);
      alert("Impossible de charger la liste des agences.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgences();
  }, []);

  return (
    <div className="agences-wrapper">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Agences</h2>
        <span className="badge bg-dark text-light">
          {agences.length} agence{agences.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th style={{ width: "70px" }}>ID</th>
              <th>Nom</th>
              <th>Pays</th>
              <th>Email agence</th>
              <th>Téléphone</th>
              <th>Contact principal</th>
              <th>Email contact</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-4">
                  Chargement des agences…
                </td>
              </tr>
            )}

            {!loading && agences.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-4 text-muted">
                  Aucune agence créée pour le moment.
                </td>
              </tr>
            )}

            {!loading &&
              agences.map((ag) => (
                <tr key={ag.id}>
                  <td>
                    <code>#{ag.id}</code>
                  </td>
                  <td>{ag.nom || "—"}</td>
                  <td>{ag.pays || "—"}</td>
                  <td>{ag.email || "—"}</td>
                  <td>{ag.telephone || "—"}</td>
                  <td>
                    {ag.rep_prenom || ag.rep_nom
                      ? `${ag.rep_prenom || ""} ${ag.rep_nom || ""}`.trim()
                      : "—"}
                  </td>
                  <td>{ag.rep_email || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .agences-wrapper {
          font-size: 0.92rem;
        }
        .table > :not(caption) > * > * {
          padding-top: 0.45rem;
          padding-bottom: 0.45rem;
        }
      `}</style>
    </div>
  );
}
