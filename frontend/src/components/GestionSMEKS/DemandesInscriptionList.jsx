import React, { useEffect, useState } from "react";
import api from "../../api/client";

export default function DemandesInscriptionList() {
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDemandes = async () => {
    setLoading(true);
    try {
      const res = await api.get("/agences/demandes-inscription/");
      const all = Array.isArray(res.data) ? res.data : res.data.results || [];

      // ❌ On ne garde PAS les demandes validées
      const filtered = all.filter((d) => d.statut !== "validee");

      // tri du plus récent au plus ancien
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setDemandes(filtered);
    } catch (err) {
      console.error("Erreur lors du chargement des demandes", err);
      alert("Impossible de charger les demandes d’inscription.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDemandes();
  }, []);

  const handleDecision = async (demandeId, decision) => {
    if (!demandeId) {
      alert("Impossible de traiter : identifiant de la demande manquant.");
      return;
    }

    const label = decision === "approve" ? "accepter" : "refuser";
    const ok = window.confirm(`Confirmer que vous voulez ${label} cette demande ?`);
    if (!ok) return;

    try {
      await api.post(`/agences/demandes-inscription/${demandeId}/decide/`, {
        decision,
      });
      await fetchDemandes();
    } catch (err) {
      console.error("Erreur lors du traitement de la décision", err);
      const detail = err?.response?.data?.detail || "Erreur inconnue côté serveur.";
      alert(`Erreur lors du traitement : ${detail}`);
    }
  };

  const formatDate = (value) => {
    if (!value) return "—";
    try {
      const d = new Date(value);
      return d.toLocaleString("fr-FR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  };

  const total = demandes.length;

  return (
    <div className="demandes-wrapper">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">Demandes d’inscription agences</h2>
        <span className="badge bg-dark text-light">
          {total} demande{total > 1 ? "s" : ""} en attente / à traiter
        </span>
      </div>

      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th style={{ width: "70px" }}>N°</th>
              <th>Agence</th>
              <th>Contact</th>
              <th>Email</th>
              <th style={{ width: "220px" }}>Date de la demande</th>
              <th style={{ width: "160px" }}>Statut</th>
              <th style={{ width: "220px" }}>Documents</th>
              <th style={{ width: "220px" }} className="text-end">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="text-center py-4">
                  Chargement des demandes…
                </td>
              </tr>
            )}

            {!loading && demandes.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-4 text-muted">
                  Aucune demande en attente actuellement.
                </td>
              </tr>
            )}

            {!loading &&
              demandes.map((demande) => {
                // ✅ ID robuste (backend-safe)
                const demandeId =
                  demande.demande_numero ??
                  demande.id ??
                  demande.pk ??
                  null;

                return (
                  <tr key={demandeId ?? Math.random()}>
                    <td>
                      <code>#{demandeId ?? "—"}</code>
                    </td>

                    <td>{demande.legal_name || "—"}</td>

                    <td>
                      {demande.rep_prenom} {demande.rep_nom}
                    </td>

                    <td>
                      {demande.company_email || demande.rep_email || "—"}
                    </td>

                    <td>{formatDate(demande.created_at)}</td>

                    <td>
                      <span
                        className={
                          "badge rounded-pill " +
                          (demande.statut === "refusee"
                            ? "bg-danger-subtle text-danger"
                            : "bg-warning-subtle text-warning-emphasis")
                        }
                      >
                        {demande.statut || "en_attente"}
                      </span>
                    </td>

                    {/* Documents */}
                    <td>
                      {!demande.rne_doc_file && !demande.patente_doc_file ? (
                        <span className="text-muted small">
                          Aucun document
                        </span>
                      ) : (
                        <div className="d-flex flex-column gap-1">
                          {demande.rne_doc_file && (
                            <a
                              href={demande.rne_doc_file}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-primary"
                            >
                              Voir RNE
                            </a>
                          )}
                          {demande.patente_doc_file && (
                            <a
                              href={demande.patente_doc_file}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-secondary"
                            >
                              Voir patente
                            </a>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-success me-2"
                        disabled={!demandeId}
                        onClick={() =>
                          handleDecision(demandeId, "approve")
                        }
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={!demandeId}
                        onClick={() =>
                          handleDecision(demandeId, "decline")
                        }
                      >
                        Refuser
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <style>{`
        .demandes-wrapper {
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
