// FRONTEND: FicheMouvementOrdre.jsx (ordre = tri par heure_fin)
// =============================================================
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import api from "../../api";
import "./FicheMouvementOrdre.css";

export default function FicheMouvementOrdre() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  // 1) lecture des données transmises depuis la page précédente
  const state = location.state || {};
  const {
    agence,
    type, // "A" | "D"
    date,
    aeroport,
    vols = [],
    reference,
    tour_operateurs = [],
    villes = [],
    hotelsPayload = [],
  } = state;

  const currentAgenceId = params.agence_id || agence || "";

  const isStateValid =
    currentAgenceId &&
    (type === "A" || type === "D") &&
    date &&
    aeroport &&
    Array.isArray(vols) &&
    vols.length > 0 &&
    Array.isArray(hotelsPayload);

  useEffect(() => {
    if (!isStateValid) {
      navigate(
        currentAgenceId
          ? `/agence/${currentAgenceId}/fiche-mouvement`
          : "/fiche-mouvement",
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStateValid]);

  // 2) état local: on ajoute un id stable par ligne pour éditer l'heure facilement
  const [items, setItems] = useState(() =>
    hotelsPayload.map((h, i) => ({
      id: `h_${i}_${String(h.hotel || "").trim()}`,
      hotel: h.hotel,
      pax: Number(h.pax || 0),
      dossier_ids: Array.isArray(h.dossier_ids) ? h.dossier_ids : [],
      heure_fin: "", // HH:MM (saisie utilisateur)
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const totalPax = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.pax) || 0), 0),
    [items]
  );

  // 3) tri par heure_fin (les vides en bas)
  const parseHHMM = (s) => {
    if (!s || typeof s !== "string") return Number.POSITIVE_INFINITY;
    const [hh, mm] = s.split(":");
    const H = parseInt(hh, 10);
    const M = parseInt(mm, 10);
    if (Number.isNaN(H) || Number.isNaN(M)) return Number.POSITIVE_INFINITY;
    return H * 60 + M;
  };

  const sortedItems = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const da = parseHHMM(a.heure_fin);
      const db = parseHHMM(b.heure_fin);
      if (da !== db) return da - db; // plus tôt en premier ; vides tout en bas
      // tie-breaker stable: par nom d'hôtel
      return String(a.hotel || "").localeCompare(String(b.hotel || ""));
    });
    return arr;
  }, [items]);

  const setHeureFinById = (id, value) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, heure_fin: value } : it));
      return next;
    });
  };

  // 4) Création → on envoie l'ordre calculé par le tri
  const onCreate = async () => {
    setMsg("");
    if (!isStateValid) return;

    const payload = {
      agence: currentAgenceId,
      type,
      date,
      aeroport,
      vols,
      reference: reference || `M_${date}`,
      tour_operateurs,
      villes,
      hotels: sortedItems.map((it, idx) => ({
        hotel: it.hotel,
        ordre: idx + 1,
        pax: Number(it.pax || 0),
        heure_fin: it.heure_fin || null,
        dossier_ids: it.dossier_ids,
      })),
    };

    try {
      setSubmitting(true);
      await api.post("creer-fiche-mouvement/", payload);
      navigate(
        currentAgenceId
          ? `/agence/${currentAgenceId}/fiches-mouvement`
          : "/fiches-mouvement",
        { replace: true }
      );
    } catch (err) {
      const m =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "Erreur lors de la création.";
      setMsg(m);
    } finally {
      setSubmitting(false);
    }
  };

  // 5) rendu
  return (
    <div className="fm-ordre-page">
      <div className="fm-ordre-wrap">
        <header className="fm-ordre-top">
          <div className="left">
            <h2 className="title m-0">Ordre des hôtels</h2>
            <div className="sub">
              <span className="badge bg-secondary me-2">
                {type === "A" ? "Arrivées" : "Départs"}
              </span>
              <span className="me-2">{date}</span>
              <span className="me-2">{aeroport}</span>
              <span className="text-muted">
                Vols: {vols && vols.length ? vols.join(", ") : "—"}
              </span>
              <div className="small text-muted mt-1">
                L’ordre est déterminé automatiquement par l’<b>heure fin</b> (la plus tôt en premier).  
                Les lignes sans heure restent en bas.
              </div>
              {msg ? <div className="text-danger small mt-1">{msg}</div> : null}
            </div>
          </div>
          <div className="right">
            {currentAgenceId ? (
              <Link
                className="btn btn-outline-secondary btn-sm"
                to={`/agence/${currentAgenceId}/fiche-mouvement`}
              >
                ← Retour
              </Link>
            ) : (
              <Link className="btn btn-outline-secondary btn-sm" to="/fiche-mouvement">
                ← Retour
              </Link>
            )}
            <Link
              className="btn btn-outline-primary btn-sm ms-2"
              to={
                currentAgenceId
                  ? `/agence/${currentAgenceId}/fiches-mouvement`
                  : "/fiches-mouvement"
              }
            >
              ↪ Fiches
            </Link>
            <button
              type="button"
              className="btn btn-success btn-sm ms-2"
              onClick={onCreate}
              disabled={submitting || !sortedItems.length}
              title="Créer la fiche de mouvement"
            >
              {submitting ? "Création..." : "Créer la fiche de mouvement"}
            </button>
          </div>
        </header>

        <section className="fm-ordre-sec">
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 120 }}>Ordre</th>
                  <th>Hôtel</th>
                  <th style={{ width: 120, textAlign: "right" }}>Pax</th>
                  <th style={{ width: 160 }}>Heure fin</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">
                      Aucun hôtel à afficher.
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((it, idx) => (
                    <tr key={it.id}>
                      <td>
                        <span className="badge bg-dark">{idx + 1}</span>
                      </td>
                      <td>
                        <strong>{it.hotel}</strong>
                        {Array.isArray(it.dossier_ids) && it.dossier_ids.length ? (
                          <div className="small text-muted">
                            {it.dossier_ids.length} dossier(s)
                          </div>
                        ) : null}
                      </td>
                      <td style={{ textAlign: "right" }}>{Number(it.pax || 0)}</td>
                      <td>
                        <input
                          type="time"
                          className="form-control form-control-sm"
                          value={it.heure_fin || ""}
                          onChange={(e) => setHeureFinById(it.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {sortedItems.length ? (
                <tfoot>
                  <tr>
                    <th colSpan={2} className="text-end">Total pax</th>
                    <th style={{ textAlign: "right" }}>{totalPax}</th>
                    <th></th>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
