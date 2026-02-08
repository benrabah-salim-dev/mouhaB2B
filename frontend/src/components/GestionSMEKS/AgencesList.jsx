import React, { useEffect, useState } from "react";
import api from "../../api/client";

export default function AgencesList() {
  const [agences, setAgences] = useState([]);
  const [loading, setLoading] = useState(false);

  const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && String(v).trim() !== "") || "";

  const fetchAgences = async () => {
    setLoading(true);
    try {
      const res = await api.get("/agences/");
      const data = Array.isArray(res.data) ? res.data : res.data.results || [];

      // tri alphabétique par "nom" (fallback)
      data.sort((a, b) => {
        const an = pick(a.nom, a.legal_name, a.name).toLowerCase();
        const bn = pick(b.nom, b.legal_name, b.name).toLowerCase();
        return an.localeCompare(bn);
      });

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
              agences.map((ag) => {
                const id = ag.id ?? ag.pk;

                // ✅ champs "agence" (selon ton modèle actuel)
                const nom = pick(ag.nom, ag.legal_name, ag.raison_sociale);
                const pays = pick(ag.pays, ag.company_country);
                const emailAgence = pick(ag.email, ag.company_email);
                const telephone = pick(ag.telephone, ag.company_phone);

                // ✅ contact principal
                const contactNom = pick(
                  `${pick(ag.rep_prenom)} ${pick(ag.rep_nom)}`.trim(),
                  ag.contact_principal
                );

                const emailContact = pick(ag.rep_email, ag.email_contact);

                return (
                  <tr key={id ?? Math.random()}>
                    <td>
                      <code>#{id ?? "—"}</code>
                    </td>
                    <td>{nom || "—"}</td>
                    <td>{pays || "—"}</td>
                    <td>{emailAgence || "—"}</td>
                    <td>{telephone || "—"}</td>
                    <td>{contactNom || "—"}</td>
                    <td>{emailContact || "—"}</td>
                  </tr>
                );
              })}
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
