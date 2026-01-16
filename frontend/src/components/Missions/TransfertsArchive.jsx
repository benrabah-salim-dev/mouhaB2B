// src/components/Missions/TransfertsArchive.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEdit,
  FaDownload,
  FaSearch,
  FaFilter,
  FaPlaneArrival,
  FaPlaneDeparture,
  FaCar,
  FaUser,
  FaMapMarkerAlt,
  FaSpinner,
  FaArchive,
} from "react-icons/fa";
import api from "../../api";

// --- PDF ---
async function handleDownloadPdf(missionId, numeroVol, dateMission) {
  try {
    const res = await api.get(`/missions/${missionId}/pdf/`, { responseType: "blob" });
    const blob = new Blob([res.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const dateStr = (dateMission || "").slice(0, 10);
    const filename = `OM_${missionId}_${dateStr}${numeroVol ? "_" + numeroVol : ""}.pdf`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    alert("Erreur lors du téléchargement du PDF.");
  }
}

// --- Dates / formats ---
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtTime = (hhmm) => {
  if (!hhmm) return "—";
  const s = String(hhmm).replace(":", "");
  return s.length === 4 ? `${s.slice(0, 2)}h${s.slice(2)}` : s;
};

const TypeBadge = ({ type }) => {
  const isArr = (type || "").toLowerCase() === "arrivee";
  return (
    <span
      className={`badge rounded-pill d-inline-flex align-items-center gap-2 px-3 py-2 ${
        isArr
          ? "bg-success-subtle text-success border border-success"
          : "bg-primary-subtle text-primary border border-primary"
      }`}
    >
      {isArr ? <FaPlaneArrival /> : <FaPlaneDeparture />}
      {isArr ? "Arrivée" : "Départ"}
    </span>
  );
};

// --- Archive logic ---
const ARCHIVE_DELAY_MIN = 120;

function getEndDateTime(m) {
  // 1) meilleur cas: backend renvoie un ISO
  if (m?.date_heure_fin) return new Date(m.date_heure_fin);

  // 2) fallback: reconstruire depuis date + horaires/heure_vol
  const d = (m?.date || "").slice(0, 10);
  const t = (m?.horaires || m?.heure_vol || "00:00").slice(0, 5);
  if (!d) return null;
  return new Date(`${d}T${t}:00`);
}

function isArchived(m) {
  const endDt = getEndDateTime(m);
  if (!endDt) return false;
  const deadline = new Date(endDt.getTime() + ARCHIVE_DELAY_MIN * 60 * 1000);
  return new Date() >= deadline;
}

export default function TransfertsArchive() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [missions, setMissions] = useState([]);

  const [q, setQ] = useState("");
  const [typeMission, setTypeMission] = useState("all");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/missions/", { params: { type: "T" } });
        setMissions(Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []);
      } catch (e) {
        setMissions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return missions.filter((m) => {
      // ✅ ici = seulement archives
      if (!isArchived(m)) return false;

      const txt = `${m?.aeroport} ${m?.numero_vol} ${m?.vehicule} ${m?.chauffeur}`.toLowerCase();
      if (q && !txt.includes(q.toLowerCase())) return false;

      if (typeMission !== "all") {
        const isArr = String(m?.kind || "").toLowerCase() === "arrivee";
        if (typeMission === "arrivee" && !isArr) return false;
        if (typeMission === "depart" && isArr) return false;
      }

      const md = (m?.date || "").slice(0, 10);
      if (dateMin && md < dateMin) return false;
      if (dateMax && md > dateMax) return false;

      return true;
    });
  }, [missions, q, typeMission, dateMin, dateMax]);

  return (
    <div className="page-content p-4 bg-light min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
            <FaArchive className="text-muted" /> Archives Transferts
          </h2>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-0 small">
              <li className="breadcrumb-item text-muted">Missions</li>
              <li className="breadcrumb-item active">Archive</li>
            </ol>
          </nav>
        </div>

        <button
          className="btn btn-outline-secondary d-flex align-items-center gap-2 shadow-sm px-4 py-2"
          onClick={() => nav("/missions/transferts")}
        >
          Retour aux transferts
        </button>
      </div>

      <div className="row g-4">
        <div className="col-lg-3">
          <div className="card border-0 shadow-sm rounded-4 p-3">
            <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
              <FaFilter className="text-primary" /> Filtres
            </h6>

            <div className="mb-3">
              <label className="form-label small text-muted fw-bold">RECHERCHE</label>
              <div className="input-group border rounded-3 overflow-hidden">
                <span className="input-group-text bg-white border-0">
                  <FaSearch className="text-muted" />
                </span>
                <input
                  className="form-control border-0 ps-0"
                  placeholder="Vol, chauffeur..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small text-muted fw-bold">DATES</label>
              <input
                type="date"
                className="form-control mb-2"
                value={dateMin}
                onChange={(e) => setDateMin(e.target.value)}
              />
              <input
                type="date"
                className="form-control"
                value={dateMax}
                onChange={(e) => setDateMax(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label small text-muted fw-bold">TYPE *</label>
              {["all", "depart", "arrivee"].map((t) => (
                <div className="form-check" key={t}>
                  <input
                    className="form-check-input"
                    type="radio"
                    name="typeMArchive"
                    id={`arch_${t}`}
                    checked={typeMission === t}
                    onChange={() => setTypeMission(t)}
                  />
                  <label className="form-check-label text-capitalize" htmlFor={`arch_${t}`}>
                    {t === "all" ? "Tous" : t}
                  </label>
                </div>
              ))}
            </div>

            <div className="small text-muted mt-3">
              Une mission passe en archive quand <br />
              <span className="fw-semibold">fin + 120 min</span> est dépassée.
            </div>
          </div>
        </div>

        <div className="col-lg-9">
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4 border-0 text-muted small py-3" style={{ width: 120 }}>
                      ACTIONS
                    </th>
                    <th className="border-0 text-muted small py-3">DATE & HEURE</th>
                    <th className="border-0 text-muted small py-3">FLUX</th>
                    <th className="border-0 text-muted small py-3">AÉROPORT / VOL</th>
                    <th className="border-0 text-muted small py-3">LOGISTIQUE</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="text-center py-5">
                        <FaSpinner className="fa-spin text-primary fs-3" />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m) => (
                      <tr key={m.id} className="border-bottom">
                        <td className="ps-4">
                          <div className="d-flex gap-2">
                            {/* tu peux choisir de désactiver l'edit en archive si tu veux */}
                            <button
                              className="btn btn-sm btn-outline-secondary border-0"
                              onClick={() => nav(`/missions/${m.id}`)}
                              title="Ouvrir"
                            >
                              <FaEdit />
                            </button>
                            <button
                              className="btn btn-sm btn-outline-primary border-0"
                              onClick={() => handleDownloadPdf(m.id, m.numero_vol, m.date)}
                              title="Télécharger PDF"
                            >
                              <FaDownload />
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="fw-bold">{fmtDate(m.date)}</div>
                          <div className="text-muted small">{fmtTime(m.horaires || m.heure_vol)}</div>
                        </td>

                        <td>
                          <TypeBadge type={m.kind} />
                        </td>

                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <FaMapMarkerAlt className="text-danger small" />
                            <span className="fw-medium">{m.aeroport || "—"}</span>
                          </div>
                          <div className="text-muted small ps-4">{m.numero_vol || "No Vol"}</div>
                        </td>

                        <td>
                          <div className="small mb-1 text-dark">
                            <FaCar className="me-2 text-muted" />
                            {m.vehicule || "—"}
                          </div>
                          <div className="small text-muted">
                            <FaUser className="me-2 text-muted" />
                            {m.chauffeur || "—"}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}

                  {!loading && filtered.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-5 text-muted">
                        Aucune mission archivée
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="small text-muted mt-3">
            Astuce: tu peux toujours télécharger l’OM depuis l’archive.
          </div>
        </div>
      </div>
    </div>
  );
}
