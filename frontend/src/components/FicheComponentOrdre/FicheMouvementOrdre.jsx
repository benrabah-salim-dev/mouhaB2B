// FRONTEND: FicheMouvementOrdre.jsx (tri par heure_fin ; heure_fin auto = heure vol + 4h)
// =======================================================================================
import React from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import api from "../../api";
import "./FicheMouvementOrdre.css";

function addMinutesToHHMM(hhmm, minutes) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return "";
  const [hh, mm] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return "";
  const total = hh * 60 + mm + (Number(minutes) || 0);
  const H = Math.floor((total % (24 * 60) + (24 * 60)) % (24 * 60) / 60); // wrap 24h
  const M = ((total % 60) + 60) % 60;
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

function parseHHMMtoMinOrInf(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return Number.POSITIVE_INFINITY;
  const [hh, mm] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return Number.POSITIVE_INFINITY;
  return hh * 60 + mm;
}

export default function FicheMouvementOrdre() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  // Données transmises depuis la page précédente
  const state = location.state || {};
  const {
    agence,
    type,           // "A" | "D"
    date,
    aeroport,
    vols = [],
    // NOUVEAU: tableau [{flight:"BJ815", time:"10:05"}] pour afficher l’heure du vol
    flightTimes = [],
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

  React.useEffect(() => {
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

  // Nettoyage/mémo des heures de vols
  const cleanedFlightTimes = React.useMemo(() => {
    return Array.isArray(flightTimes)
      ? flightTimes
          .map((ft) => ({
            flight: String(ft?.flight || "").trim(),
            time: (ft?.time && String(ft.time).trim()) || null,
          }))
          .filter((ft) => ft.flight)
      : [];
  }, [flightTimes]);

  // Map vol -> heure (HH:MM) pour init auto des heures fin
  const flightTimeMap = React.useMemo(() => {
    const m = new Map();
    cleanedFlightTimes.forEach((ft) => {
      if (ft.flight && ft.time) m.set(ft.flight, ft.time);
    });
    return m;
  }, [cleanedFlightTimes]);

  // État local: on ajoute heure_vol + heure_fin (auto = heure_vol + 240 min)
  const [items, setItems] = React.useState(() => {
    return hotelsPayload.map((h, i) => {
      // essaye de déduire l’heure de vol: on prend la 1re heure dispo des vols sélectionnés
      let baseTime = "";
      for (const v of vols) {
        const t = flightTimeMap.get(v);
        if (t) {
          baseTime = t;
          break;
        }
      }
      const heureFinAuto = baseTime ? addMinutesToHHMM(baseTime, 240) : ""; // 4h
      return {
        id: `h_${i}_${String(h.hotel || "").trim()}`,
        hotel: h.hotel,
        pax: Number(h.pax || 0),
        dossier_ids: Array.isArray(h.dossier_ids) ? h.dossier_ids : [],
        // affichage: on veut voir l’heure du vol ET laisser éditer l’heure fin
        heure_vol: baseTime || "",
        heure_fin: heureFinAuto, // modifiable
      };
    });
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const totalPax = React.useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.pax) || 0), 0),
    [items]
  );

  // tri par heure_fin (vides en bas)
  const sortedItems = React.useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const da = parseHHMMtoMinOrInf(a.heure_fin);
      const db = parseHHMMtoMinOrInf(b.heure_fin);
      if (da !== db) return da - db; // plus tôt en premier
      return String(a.hotel || "").localeCompare(String(b.hotel || ""));
    });
    return arr;
  }, [items]);

  const setHeureFinById = (id, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, heure_fin: value } : it)));
  };

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
        // on garde l'heure_fin telle qu’éditée
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

              {/* Vols + heure du vol (si connue) */}
              <div className="small">
                <b>Vols :</b>{" "}
                {cleanedFlightTimes.length > 0
                  ? cleanedFlightTimes
                      .map((ft) =>
                        ft.time
                          ? `${ft.flight} — ${ft.time}`
                          : `${ft.flight} — (heure inconnue)`
                      )
                      .join(", ")
                  : (Array.isArray(vols) ? vols.join(", ") : "—")}
              </div>

              <div className="small text-muted mt-1">
                L’ordre est déterminé par l’<b>heure fin</b> (plus tôt en premier).  
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
                  <th>Vol (heure)</th>
                  <th style={{ width: 160 }}>Heure fin</th>
                  <th style={{ width: 120, textAlign: "right" }}>Pax</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
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
                      <td>
                        {/* Affiche le(s) vol(s) + première heure connue */}
                        {vols && vols.length ? (
                          <span>
                            {vols
                              .map((v) => {
                                const t = flightTimeMap.get(v);
                                return t ? `${v} • ${t}` : `${v} • (—)`;
                              })
                              .join(", ")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <input
                          type="time"
                          className="form-control form-control-sm"
                          value={it.heure_fin || ""}
                          onChange={(e) => setHeureFinById(it.id, e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>{Number(it.pax || 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {sortedItems.length ? (
                <tfoot>
                  <tr>
                    <th colSpan={4} className="text-end">Total pax</th>
                    <th style={{ textAlign: "right" }}>{totalPax}</th>
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
