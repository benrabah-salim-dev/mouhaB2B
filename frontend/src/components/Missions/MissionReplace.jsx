// src/components/Missions/MissionEdit.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaDownload,
  FaTimes,
  FaExchangeAlt,
  FaCar,
  FaUser,
  FaSearch,
} from "react-icons/fa";
import api from "../../api";

/* =========================
   Utils
========================= */
function pad(n) {
  return String(n).padStart(2, "0");
}

function toISOFromDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const t = (timeStr || "00:00").slice(0, 5);
  return `${dateStr.slice(0, 10)}T${t}`;
}

function addMinutesISO(iso, mins) {
  if (!iso) return null;
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatDateTimeDisplay(iso) {
  if (!iso) return "—";
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.replace("T", " ").slice(0, 16);
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    return `${Y}-${M}-${D} ${h}:${m}`;
  }
  return s.replace("T", " ");
}

function downloadFilename(mission) {
  const dateStr = (mission?.date || "").slice(0, 10);
  const num = mission?.numero_vol ? "_" + mission.numero_vol : "";
  return `OM_${mission?.id}_${dateStr}${num}.pdf`;
}

async function downloadMissionPdf(missionId, numeroVol, dateMission) {
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
}

/* =========================
   Helpers Véhicule / Chauffeur
========================= */
function getVehiculeCapacite(v) {
  const c = v?.capacite ?? v?.capacity ?? v?.nb_places ?? v?.places ?? v?.seat_count ?? null;
  const n = c == null ? null : Number(c);
  return Number.isFinite(n) ? n : null;
}
function getVehiculeAnnee(v) {
  const y = v?.annee_mise_en_circulation ?? v?.annee ?? v?.year ?? null;
  const n = y == null ? null : Number(y);
  return Number.isFinite(n) ? n : null;
}
function getVehiculeAdresseActuelle(v) {
  return (v?.adresse_actuelle || v?.adresse || v?.position_actuelle || v?.current_address || "").toString().trim();
}
function getVehiculeZoneLabel(v) {
  if (!v) return "";

  const z1 = (v?.next_mission_zone ?? "").toString().trim();
  if (z1) return z1;

  const z2 = (v?.last_mission_zone ?? "").toString().trim();
  if (z2) return z2;

  const z3 = (v?.real_state?.location ?? "").toString().trim();
  if (z3) return z3;

  const z4 = (v?.location ?? "").toString().trim();
  if (z4) return z4;

  const z5 = (v?.adresse ?? "").toString().trim();
  if (z5) return z5;

  const zObj = v?.zone_obj || v?.zone_fk || v?.zoneObject || null;
  if (zObj && typeof zObj === "object") {
    return (zObj.nom || zObj.name || zObj.label || zObj.code || "").toString().trim() || "";
  }
  return "";
}

function getLastMissionAddressVeh(v) {
  return (
    (v?.last_mission_address || "").trim() ||
    (v?.last_mission_location || "").trim() ||
    (v?.last_mission_city || "").trim() ||
    (v?.last_mission_zone || "").trim() ||
    ""
  );
}
function getNextMissionAddressVeh(v) {
  return (
    (v?.next_mission_address || "").trim() ||
    (v?.next_mission_location || "").trim() ||
    (v?.next_mission_city || "").trim() ||
    (v?.next_mission_zone || "").trim() ||
    ""
  );
}
function getLastMissionDisplayVeh(v) {
  const end = formatDateTimeDisplay(v?.last_mission_end || v?.last_mission_end_at || v?.last_end);
  const addr = getLastMissionAddressVeh(v) || "—";
  if (end === "—" && addr === "—") return "—";
  return `${end} — ${addr}`;
}
function getNextMissionDisplayVeh(v) {
  const start = formatDateTimeDisplay(
    v?.next_mission_start ||
      v?.next_mission_start_at ||
      v?.next_start ||
      v?.real_state?.available_from ||
      null
  );
  const addr = getNextMissionAddressVeh(v) || getVehiculeZoneLabel(v) || "—";
  if (start === "—" && addr === "—") return "—";
  return `${start} — ${addr}`;
}

function chauffeurFullName(c) {
  const full = `${(c?.prenom || "").trim()} ${(c?.nom || "").trim()}`.trim();
  return full || `Chauffeur #${c?.id ?? "—"}`;
}
function chauffeurLastBusLabel(c) {
  // Support futur si tu ajoutes côté API
  const obj =
    c?.dernier_bus_obj ||
    c?.dernier_vehicule_obj ||
    c?.last_vehicle_obj ||
    c?.last_bus_obj ||
    c?.last_vehicule_obj ||
    null;

  if (obj && typeof obj === "object") {
    return (
      (obj.immatriculation || "").trim() ||
      (obj.label || obj.name || "").trim() ||
      (obj.marque ? `${obj.marque} ${obj.modele || ""}`.trim() : "").trim() ||
      `#${obj.id ?? "—"}`
    );
  }

  return (
    (c?.dernier_bus || "").toString().trim() ||
    (c?.dernier_vehicule || "").toString().trim() ||
    (c?.last_vehicle || "").toString().trim() ||
    (c?.last_bus || "").toString().trim() ||
    (c?.last_vehicule || "").toString().trim() ||
    "—"
  );
}

function safeId(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/* =========================
   Modal Véhicule (table)
========================= */
function SelectVehiculeModal({ show, onClose, agenceId, debutISO, finISO, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [vehicules, setVehicules] = useState([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!show) return;
    setQ("");
    setSelectedId(null);

    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/vehicules/", {
          params: { agence: agenceId, debut: debutISO, fin: finISO },
        });
        const arr = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        setVehicules(arr);
      } catch (e) {
        console.error(e);
        setVehicules([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [show, agenceId, debutISO, finISO]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return vehicules;

    return vehicules.filter((v) => {
      const hay = `${v?.immatriculation || ""} ${v?.marque || ""} ${v?.modele || ""} ${getVehiculeZoneLabel(v) || ""} ${
        v?.real_state?.location || ""
      } ${getVehiculeAdresseActuelle(v) || ""} ${getLastMissionAddressVeh(v) || ""} ${getNextMissionAddressVeh(v) || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [vehicules, q]);

  const selectedVehiculeObj = useMemo(
    () => filtered.find((v) => v.id === selectedId) || vehicules.find((v) => v.id === selectedId) || null,
    [filtered, vehicules, selectedId]
  );

  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div className="modal d-block" tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-xl modal-dialog-centered" role="document">
          <div className="modal-content border-0 rounded-4 shadow" style={{ fontSize: 15 }}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold">Choisir un nouveau véhicule</h5>
              <button className="btn btn-sm btn-light" onClick={onClose} aria-label="Close">
                <FaTimes />
              </button>
            </div>

            <div className="modal-body">
              <div className="border rounded p-3 mb-3" style={{ background: "#f8f9fa" }}>
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span style={{ fontWeight: 600 }}>Fenêtre</span>
                  <span className="badge bg-white text-dark border" style={{ fontWeight: 500, fontSize: 13 }}>
                    {formatDateTimeDisplay(debutISO)} → {formatDateTimeDisplay(finISO)}
                  </span>
                </div>
              </div>

              <div className="d-flex align-items-center mb-3">
                <div className="input-group">
                  <span className="input-group-text bg-white">
                    <FaSearch />
                  </span>
                  <input
                    className="form-control"
                    placeholder="Rechercher véhicule (immat, marque, zone, adresse, last/next...)"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <button className="btn btn-outline-secondary" onClick={() => setQ("")}>
                    Effacer
                  </button>
                </div>
              </div>

              <div className="border rounded" style={{ maxHeight: 520, overflow: "auto" }}>
                <table className="table table-hover align-middle mb-0" style={{ fontSize: 15 }}>
                  <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 42 }}></th>
                      <th style={{ width: 150 }}>Année / Capacité</th>
                      <th style={{ width: 160 }}>Immatriculation</th>
                      <th style={{ width: 210 }}>Adresse actuelle</th>
                      <th style={{ width: 260 }}>Last mission</th>
                      <th style={{ width: 260 }}>Next mission</th>
                      <th style={{ width: 200 }}>Dernier chauffeur</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={7} className="text-center py-4">
                          Chargement…
                        </td>
                      </tr>
                    )}

                    {!loading &&
                      filtered.map((v) => {
                        const isSel = selectedId === v.id;
                        const cap = getVehiculeCapacite(v);
                        const an = getVehiculeAnnee(v);
                        const addr = getVehiculeAdresseActuelle(v) || v?.real_state?.location || "";
                        const last = getLastMissionDisplayVeh(v);
                        const next = getNextMissionDisplayVeh(v);

                        const d = v?.dernier_chauffeur;
                        const lastDriver =
                          d && typeof d === "object"
                            ? `${(d.prenom || "").trim()} ${(d.nom || "").trim()}`.trim() || `#${d.id ?? "—"}`
                            : "—";

                        return (
                          <tr
                            key={v.id}
                            className={isSel ? "table-active" : ""}
                            onClick={() => setSelectedId(v.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <input
                                type="radio"
                                className="form-check-input"
                                checked={isSel}
                                onChange={() => setSelectedId(v.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>

                            <td>
                              <span className="badge bg-primary" style={{ fontWeight: 500, fontSize: 13 }}>
                                {an ?? "—"} / {cap ?? "—"}
                              </span>
                            </td>

                            <td>
                              <code style={{ fontSize: 14 }}>{v?.immatriculation || "—"}</code>
                            </td>

                            <td className="text-truncate" title={addr || ""} style={{ maxWidth: 210 }}>
                              {addr || "—"}
                            </td>

                            <td>
                              <div style={{ fontSize: 12, color: "#6c757d" }}>Fin — Adresse</div>
                              <div style={{ fontWeight: 600 }}>{last}</div>
                            </td>

                            <td>
                              <div style={{ fontSize: 12, color: "#6c757d" }}>Début — Adresse</div>
                              <div style={{ fontWeight: 600 }}>{next}</div>
                            </td>

                            <td className="text-truncate" title={lastDriver} style={{ maxWidth: 200 }}>
                              {lastDriver || "—"}
                            </td>
                          </tr>
                        );
                      })}

                    {!loading && !filtered.length && (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          Aucun véhicule disponible sur cette fenêtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline-secondary" onClick={onClose}>
                Annuler
              </button>
              <button className="btn btn-primary" disabled={!selectedVehiculeObj} onClick={() => onConfirm(selectedVehiculeObj)}>
                Confirmer véhicule
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================
   Modal Chauffeur (table)
========================= */
function SelectChauffeurModal({ show, onClose, agenceId, debutISO, finISO, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!show) return;
    setQ("");
    setSelectedId(null);

    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/chauffeurs/", {
          params: { agence: agenceId, debut: debutISO, fin: finISO },
        });
        const arr = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        setChauffeurs(arr);
      } catch (e) {
        console.error(e);
        setChauffeurs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [show, agenceId, debutISO, finISO]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return chauffeurs;

    return chauffeurs.filter((c) => {
      const loc = (c?.real_state?.location || c?.adresse || "").toString();
      const lastBus = chauffeurLastBusLabel(c);
      const hay = `${c?.nom || ""} ${c?.prenom || ""} ${c?.telephone || ""} ${c?.tel || ""} ${loc} ${lastBus}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [chauffeurs, q]);

  const selectedChauffeurObj = useMemo(
    () => filtered.find((c) => c.id === selectedId) || chauffeurs.find((c) => c.id === selectedId) || null,
    [filtered, chauffeurs, selectedId]
  );

  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div className="modal d-block" tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-xl modal-dialog-centered" role="document">
          <div className="modal-content border-0 rounded-4 shadow" style={{ fontSize: 15 }}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold">Choisir un nouveau chauffeur</h5>
              <button className="btn btn-sm btn-light" onClick={onClose} aria-label="Close">
                <FaTimes />
              </button>
            </div>

            <div className="modal-body">
              <div className="border rounded p-3 mb-3" style={{ background: "#f8f9fa" }}>
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span style={{ fontWeight: 600 }}>Fenêtre</span>
                  <span className="badge bg-white text-dark border" style={{ fontWeight: 500, fontSize: 13 }}>
                    {formatDateTimeDisplay(debutISO)} → {formatDateTimeDisplay(finISO)}
                  </span>
                </div>
              </div>

              <div className="d-flex align-items-center mb-3">
                <div className="input-group">
                  <span className="input-group-text bg-white">
                    <FaSearch />
                  </span>
                  <input
                    className="form-control"
                    placeholder="Rechercher chauffeur (nom, prénom, adresse, dernier bus...)"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <button className="btn btn-outline-secondary" onClick={() => setQ("")}>
                    Effacer
                  </button>
                </div>
              </div>

              <div className="border rounded" style={{ maxHeight: 520, overflow: "auto" }}>
                <table className="table table-hover align-middle mb-0" style={{ fontSize: 15 }}>
                  <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 42 }}></th>
                      <th style={{ width: 180 }}>Nom</th>
                      <th style={{ width: 180 }}>Prénom</th>
                      <th style={{ width: 170 }}>Téléphone</th>
                      <th style={{ width: 260 }}>Localisation</th>
                      <th style={{ width: 220 }}>Disponible depuis</th>
                      <th style={{ width: 220 }}>Occupé à partir de</th>
                      <th style={{ width: 220 }}>Dernier bus</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={8} className="text-center py-4">
                          Chargement…
                        </td>
                      </tr>
                    )}

                    {!loading &&
                      filtered.map((c) => {
                        const isSel = selectedId === c.id;
                        const loc = (c?.real_state?.location || c?.adresse || "").toString().trim() || "—";
                        const from = formatDateTimeDisplay(c?.real_state?.available_from);
                        const until = formatDateTimeDisplay(c?.real_state?.available_until);
                        const lastBus = chauffeurLastBusLabel(c);

                        return (
                          <tr
                            key={c.id}
                            className={isSel ? "table-active" : ""}
                            onClick={() => setSelectedId(c.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <input
                                type="radio"
                                className="form-check-input"
                                checked={isSel}
                                onChange={() => setSelectedId(c.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td>{c?.nom || "—"}</td>
                            <td>{c?.prenom || "—"}</td>
                            <td>{c?.telephone || c?.tel || "—"}</td>
                            <td className="text-truncate" title={loc} style={{ maxWidth: 260 }}>
                              {loc}
                            </td>
                            <td>{from}</td>
                            <td>{until}</td>
                            <td className="text-truncate" title={lastBus} style={{ maxWidth: 220 }}>
                              {lastBus}
                            </td>
                          </tr>
                        );
                      })}

                    {!loading && !filtered.length && (
                      <tr>
                        <td colSpan={8} className="text-center text-muted py-4">
                          Aucun chauffeur disponible sur cette fenêtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="small text-muted mt-2">
                Note: ton endpoint <code>/chauffeurs/</code> renvoie <code>real_state</code>. Le “Dernier bus” s’affichera si tu ajoutes un champ
                (ex: <code>dernier_bus</code>) côté API.
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline-secondary" onClick={onClose}>
                Annuler
              </button>
              <button className="btn btn-primary" disabled={!selectedChauffeurObj} onClick={() => onConfirm(selectedChauffeurObj)}>
                Confirmer chauffeur
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================
   Page Mission Edit
========================= */
export default function MissionEdit() {
  const nav = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(false);
  const [mission, setMission] = useState(null);
  const [error, setError] = useState("");

  // ✅ infos complètes "anciennes ressources" (fetch via /vehicules/<id>/ + /chauffeurs/<id>/)
  const [oldVehObj, setOldVehObj] = useState(null);
  const [oldChObj, setOldChObj] = useState(null);

  const [vehModalOpen, setVehModalOpen] = useState(false);
  const [chModalOpen, setChModalOpen] = useState(false);

  const [newVehicule, setNewVehicule] = useState(null);
  const [newChauffeur, setNewChauffeur] = useState(null);

  const [saving, setSaving] = useState(false);

  // fenêtre dispo
  const debutISO = useMemo(() => {
    if (!mission) return null;

    const d1 = mission?.date_heure_debut;
    if (d1) return String(d1).replace("Z", "").slice(0, 16);

    const d = (mission.date || "").slice(0, 10);
    const t = (mission.horaires || mission.heure_vol || "").toString().slice(0, 5);
    return toISOFromDateTime(d, t);
  }, [mission]);

  const finISO = useMemo(() => {
    if (!mission) return null;

    const f1 = mission?.date_heure_fin;
    if (f1) return String(f1).replace("Z", "").slice(0, 16);

    return addMinutesISO(debutISO, 180);
  }, [mission, debutISO]);

  const agenceId = useMemo(() => mission?.agence_id || mission?.agence || null, [mission]);

  // load mission
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const { data } = await api.get(`/missions/${id}/`);
        setMission(data);
      } catch (e) {
        setError("Impossible de charger la mission.");
        setMission(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ✅ charger anciennes ressources (si IDs disponibles)
  useEffect(() => {
    if (!mission) return;

    const vehId =
      safeId(mission?.vehicule_id) ||
      safeId(mission?.vehicule?.id) ||
      safeId(mission?.vehicule_obj?.id) ||
      safeId(mission?.ressource?.vehicule_id) ||
      safeId(mission?.mission_ressource?.vehicule_id) ||
      null;

    const chId =
      safeId(mission?.chauffeur_id) ||
      safeId(mission?.chauffeur?.id) ||
      safeId(mission?.chauffeur_obj?.id) ||
      safeId(mission?.ressource?.chauffeur_id) ||
      safeId(mission?.mission_ressource?.chauffeur_id) ||
      null;

    // si pas d'id, on ne peut pas deviner capacité/adresse/zone -> ça restera via strings mission.*
    (async () => {
      try {
        setOldVehObj(null);
        setOldChObj(null);

        if (vehId) {
          const { data } = await api.get(`/vehicules/${vehId}/`);
          setOldVehObj(data);
        }
      } catch (e) {
        console.warn("Old vehicule fetch failed:", e);
        setOldVehObj(null);
      }
      try {
        if (chId) {
          const { data } = await api.get(`/chauffeurs/${chId}/`);
          setOldChObj(data);
        }
      } catch (e) {
        console.warn("Old chauffeur fetch failed:", e);
        setOldChObj(null);
      }
    })();
  }, [mission]);

  async function handleDownload() {
    try {
      await downloadMissionPdf(mission.id, mission.numero_vol, mission.date);
    } catch {
      alert("Erreur lors du téléchargement du PDF.");
    }
  }

  async function handleCancelOm() {
    if (!window.confirm("Annuler l'ordre de mission ?")) return;
    try {
      setSaving(true);
      await api.post(`/missions/${mission.id}/cancel-om/`);
      const { data } = await api.get(`/missions/${mission.id}/`);
      setMission(data);
      setNewVehicule(null);
      setNewChauffeur(null);
      alert("Ordre de mission annulé.");
    } catch {
      alert("Erreur lors de l'annulation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReplaceOm() {
    if (!newVehicule && !newChauffeur) {
      alert("Sélectionne au moins un véhicule ou un chauffeur.");
      return;
    }
    try {
      setSaving(true);
      const res = await api.post(
        `/missions/${mission.id}/replace-om/`,
        {
          vehicule: newVehicule?.id || null,
          chauffeur: newChauffeur?.id || null,
        },
        { responseType: "blob" }
      );

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const filename = downloadFilename(mission);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const { data } = await api.get(`/missions/${mission.id}/`);
      setMission(data);

      // refresh anciennes ressources
      setOldVehObj(null);
      setOldChObj(null);

      alert("Ordre de mission remplacé (PDF régénéré).");
    } catch {
      alert("Erreur lors du remplacement OM.");
    } finally {
      setSaving(false);
    }
  }

  // --- Fallback strings depuis mission (si pas d'objets détaillés)
  const oldVehiculeLabel = mission?.vehicule || mission?.vehicule_label || "—";
  const oldChauffeurLabel = mission?.chauffeur || mission?.chauffeur_label || "—";

  // --- Anciennes ressources (affichage avec priorités: oldVehObj/oldChObj puis mission.*)
  const oldVehCap = oldVehObj ? getVehiculeCapacite(oldVehObj) ?? "—" : (mission?.vehicule_capacite ?? mission?.vehicule_capacity ?? "—");
  const oldVehAdr =
    oldVehObj
      ? (getVehiculeAdresseActuelle(oldVehObj) || oldVehObj?.real_state?.location || oldVehObj?.adresse || "—")
      : (mission?.vehicule_adresse ?? mission?.vehicule_address ?? mission?.vehicule_location ?? "—");
  const oldVehZone =
    oldVehObj
      ? (getVehiculeZoneLabel(oldVehObj) || "—")
      : (mission?.vehicule_zone ?? mission?.vehicule_zone_label ?? mission?.zone ?? "—");

  const oldChAdr =
    oldChObj
      ? (oldChObj?.real_state?.location || oldChObj?.adresse || "—")
      : (mission?.chauffeur_adresse ?? mission?.chauffeur_address ?? mission?.chauffeur_location ?? "—");
  const oldChZone =
    oldChObj
      ? ((oldChObj?.zone || oldChObj?.zone_label || oldChObj?.real_state?.location || "").toString().trim() || "—")
      : (mission?.chauffeur_zone ?? mission?.chauffeur_zone_label ?? "—");
  const oldChLastBus =
    (oldChObj ? chauffeurLastBusLabel(oldChObj) : null) ||
    mission?.chauffeur_dernier_bus ||
    mission?.chauffeur_last_bus ||
    mission?.chauffeur_last_vehicle ||
    mission?.chauffeur_last_vehicule ||
    "—";

  if (loading) {
    return (
      <div className="page-content p-4 bg-light min-vh-100">
        <div className="text-muted">Chargement...</div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="page-content p-4 bg-light min-vh-100">
        <button className="btn btn-outline-secondary mb-3" onClick={() => nav(-1)}>
          <FaArrowLeft className="me-2" /> Retour
        </button>
        <div className="alert alert-danger">{error || "Mission introuvable."}</div>
      </div>
    );
  }

  return (
    <div className="page-content p-4 bg-light min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => nav(-1)}>
          <FaArrowLeft className="me-2" /> Retour
        </button>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary" onClick={handleDownload} disabled={saving}>
            <FaDownload className="me-2" /> Télécharger OM
          </button>
          <button className="btn btn-outline-danger" onClick={handleCancelOm} disabled={saving}>
            <FaTimes className="me-2" /> Annuler OM
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 p-4 mb-4">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
          <div>
            <h4 className="fw-bold mb-1">Mission #{mission.id}</h4>
            <div className="text-muted small">
              {mission.date?.slice(0, 10)} • {String(mission.horaires || mission.heure_vol || "—").slice(0, 5)} • Vol:{" "}
              {mission.numero_vol || "—"} • Aéroport: {mission.aeroport || "—"}
            </div>
            <div className="text-muted small">
              Fenêtre mission: <code>{formatDateTimeDisplay(debutISO)}</code> → <code>{formatDateTimeDisplay(finISO)}</code>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <h5 className="fw-bold mb-3">Anciennes ressources (actuelles)</h5>

          <div className="row g-3">
            <div className="col-md-6">
              <div className="p-3 bg-white rounded-4 border">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <FaCar /> <span className="fw-bold">Véhicule</span>
                </div>
                <div className="small">
                  <div className="mb-1">
                    <b>Véhicule :</b> {oldVehiculeLabel}
                  </div>
                  <div className="mb-1">
                    <b>Capacité :</b> {oldVehCap}
                  </div>
                  <div className="mb-1">
                    <b>Adresse :</b> {oldVehAdr}
                  </div>
                  <div className="mb-1">
                    <b>Zone :</b> {oldVehZone}
                  </div>
                  {/* bonus si on a l'objet complet */}
                  {oldVehObj && (
                    <>
                      <div className="mb-1">
                        <b>Last mission :</b> {getLastMissionDisplayVeh(oldVehObj)}
                      </div>
                      <div className="mb-1">
                        <b>Next mission :</b> {getNextMissionDisplayVeh(oldVehObj)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="col-md-6">
              <div className="p-3 bg-white rounded-4 border">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <FaUser /> <span className="fw-bold">Chauffeur</span>
                </div>
                <div className="small">
                  <div className="mb-1">
                    <b>Chauffeur :</b> {oldChauffeurLabel}
                  </div>
                  <div className="mb-1">
                    <b>Adresse :</b> {oldChAdr}
                  </div>
                  <div className="mb-1">
                    <b>Zone :</b> {oldChZone}
                  </div>
                  <div className="mb-1">
                    <b>Dernier bus :</b> {oldChLastBus}
                  </div>
                  {oldChObj?.real_state && (
                    <>
                      <div className="mb-1">
                        <b>Disponible depuis :</b> {formatDateTimeDisplay(oldChObj.real_state.available_from)}
                      </div>
                      <div className="mb-1">
                        <b>Occupé à partir de :</b> {formatDateTimeDisplay(oldChObj.real_state.available_until)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Nouvelles ressources (avec 2 boutons séparés) */}
          <div className="mt-4 p-3 bg-light rounded-4 border">
            <div className="fw-bold mb-2">Nouvelles ressources (sélection)</div>

            <div className="row g-3">
              <div className="col-md-6">
                <div className="p-3 bg-white rounded-4 border h-100">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <FaCar /> <span className="fw-bold">Véhicule</span>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => setVehModalOpen(true)} disabled={!debutISO || !finISO}>
                      <FaExchangeAlt className="me-2" /> Choisir véhicule
                    </button>
                  </div>

                  <div className="small">
                    <div className="mb-1">
                      <b>Sélection :</b>{" "}
                      {newVehicule
                        ? `${newVehicule.immatriculation || `#${newVehicule.id}`} • ${newVehicule.marque || ""} ${newVehicule.modele || ""}`.trim()
                        : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Année / Capacité :</b>{" "}
                      {newVehicule ? `${getVehiculeAnnee(newVehicule) ?? "—"} / ${getVehiculeCapacite(newVehicule) ?? "—"}` : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Adresse actuelle :</b>{" "}
                      {newVehicule ? (getVehiculeAdresseActuelle(newVehicule) || newVehicule?.real_state?.location || "—") : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Last mission :</b> {newVehicule ? getLastMissionDisplayVeh(newVehicule) : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Next mission :</b> {newVehicule ? getNextMissionDisplayVeh(newVehicule) : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="p-3 bg-white rounded-4 border h-100">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <FaUser /> <span className="fw-bold">Chauffeur</span>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => setChModalOpen(true)} disabled={!debutISO || !finISO}>
                      <FaExchangeAlt className="me-2" /> Choisir chauffeur
                    </button>
                  </div>

                  <div className="small">
                    <div className="mb-1">
                      <b>Sélection :</b> {newChauffeur ? chauffeurFullName(newChauffeur) : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Téléphone :</b> {newChauffeur ? (newChauffeur.telephone || newChauffeur.tel || "—") : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Adresse actuelle :</b> {newChauffeur ? (newChauffeur?.real_state?.location || newChauffeur?.adresse || "—") : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Disponible depuis :</b> {newChauffeur ? formatDateTimeDisplay(newChauffeur?.real_state?.available_from) : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Occupé à partir de :</b> {newChauffeur ? formatDateTimeDisplay(newChauffeur?.real_state?.available_until) : "—"}
                    </div>
                    <div className="mb-1">
                      <b>Dernier bus :</b> {newChauffeur ? chauffeurLastBusLabel(newChauffeur) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Remplacer OM */}
            <div className="d-flex justify-content-end mt-3">
              <button className="btn btn-success" onClick={handleReplaceOm} disabled={saving}>
                <FaExchangeAlt className="me-2" /> Remplacer OM (PDF régénéré)
              </button>
            </div>

            <div className="small text-muted mt-2">
              Créneau dispo utilisé : <code>{formatDateTimeDisplay(debutISO)}</code> → <code>{formatDateTimeDisplay(finISO)}</code>
            </div>

            {/* Alerte si le backend mission ne fournit pas les ids => impossible d'enrichir anciennes ressources */}
            {!oldVehObj && !safeId(mission?.vehicule_id) && (
              <div className="small text-muted mt-2">
                ⚠️ Pour afficher Capacité/Adresse/Zone des <b>anciennes</b> ressources, il faut que <code>/missions/{mission.id}/</code> renvoie
                <code>vehicule_id</code> et <code>chauffeur_id</code> (ou un objet avec <code>id</code>).
              </div>
            )}
          </div>
        </div>
      </div>

      <SelectVehiculeModal
        show={vehModalOpen}
        onClose={() => setVehModalOpen(false)}
        agenceId={agenceId}
        debutISO={debutISO}
        finISO={finISO}
        onConfirm={(veh) => {
          setNewVehicule(veh || null);
          setVehModalOpen(false);
        }}
      />

      <SelectChauffeurModal
        show={chModalOpen}
        onClose={() => setChModalOpen(false)}
        agenceId={agenceId}
        debutISO={debutISO}
        finISO={finISO}
        onConfirm={(ch) => {
          setNewChauffeur(ch || null);
          setChModalOpen(false);
        }}
      />
    </div>
  );
}
