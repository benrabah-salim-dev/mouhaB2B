// src/components/Missions/TransfertNouvelle.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import api from "../../api";

/* ================= Helpers ================= */



function getVehiculeZoneLabel(v) {
  if (!v) return "";

  // ✅ priorité: vraie zone calculée depuis missions (si ton API l'ajoute)
  const z1 = (v?.next_mission_zone ?? "").toString().trim();
  if (z1) return z1;

  const z2 = (v?.last_mission_zone ?? "").toString().trim();
  if (z2) return z2;

  // ✅ fallback: "real_state.location" (vu dans ton JSON)
  const z3 = (v?.real_state?.location ?? "").toString().trim();
  if (z3) return z3;

  // ✅ fallback: "location" direct (vu dans ton JSON)
  const z4 = (v?.location ?? "").toString().trim();
  if (z4) return z4;

  // ✅ fallback: champ adresse si tu veux
  const z5 = (v?.adresse ?? "").toString().trim();
  if (z5) return z5;

  // Si ton API renvoie un objet zone
  const zObj = v?.zone_obj || v?.zone_fk || v?.zoneObject || null;
  if (zObj && typeof zObj === "object") {
    return (
      (zObj.nom || zObj.name || zObj.label || zObj.code || "").toString().trim() || ""
    );
  }

  return "";
}



function formatDateTimeDisplay(iso) {
  if (!iso) return "—";
  // ex "2025-12-19T05:00" -> "2025-12-19 05:00"
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.replace("T", " ").slice(0, 16);

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${Y}-${M}-${D} ${h}:${m}`;
  }
  return s.replace("T", " ");
}

function formatWindowDisplay(startIso, endIso) {
  return `${formatDateTimeDisplay(startIso)} → ${formatDateTimeDisplay(endIso)}`;
}

function hhmm(s) {
  if (!s) return "";
  s = String(s);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{4}$/.test(s)) return s.slice(0, 2) + ":" + s.slice(2);
  const m = s.match(/(\d{2}):(\d{2})(?::\d{2})?/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const H = String(d.getHours()).padStart(2, "0");
    const M = String(d.getMinutes()).padStart(2, "0");
    return `${H}:${M}`;
  }
  return "";
}

function hhmmToMin(s) {
  const t = hhmm(s);
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [H, M] = t.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(H) || Number.isNaN(M)) return null;
  return H * 60 + M;
}

function minToHHMM(min) {
  if (min == null || !Number.isFinite(min)) return "";
  let m = Math.round(min);
  m = ((m % 1440) + 1440) % 1440;
  const H = String(Math.floor(m / 60)).padStart(2, "0");
  const M = String(m % 60).padStart(2, "0");
  return `${H}:${M}`;
}

function addMinutes(h, deltaMin) {
  const base = hhmmToMin(h);
  if (base == null) return "";
  return minToHHMM(base + (deltaMin || 0));
}

const fmtDate = (d) => (d || "").slice(0, 10);
const safeStr = (v) => (v == null ? "" : String(v)).trim();

const badgeType = (t) => {
  const a = (t || "").toUpperCase() === "A";
  return (
    <span className={`badge ${a ? "bg-success" : "bg-primary"}`} style={{ fontWeight: 500 }}>
      {a ? "Arrivée" : "Départ"}
    </span>
  );
};

const getHotelLabel = (r) => {
  if (!r) return "";
  if (Array.isArray(r.hotels) && r.hotels.length) return safeStr(r.hotels[0]);
  const hObj = (r.hotel && typeof r.hotel === "object" ? r.hotel : null) || r.hotel_obj || r.hotel_fk;
  if (hObj) return safeStr(hObj.nom || hObj.name || hObj.label || hObj.code);
  const raw = r.hotel_nom || r.hotel_name || r.hotel_label || r.hotel || "";
  if (typeof raw === "number") return "";
  if (/^\d+$/.test(String(raw).trim())) return "";
  return safeStr(raw);
};

const getAirportLabel = (r) => {
  if (!r) return "";
  const aeroObj = r.aeroport || r.airport;
  if (aeroObj && typeof aeroObj === "object") return (aeroObj.code || aeroObj.nom || aeroObj.name || "").trim();
  return (
    r.aeroport ||
    r.airport ||
    r.aeroport_code ||
    r.aeroport_nom ||
    (r.type === "D" ? r.provenance : r.destination) ||
    r.provenance ||
    r.destination ||
    ""
  ).trim();
};

function getTimesFromHotelSchedule(row) {
  const sched = Array.isArray(row?.hotel_schedule) ? row.hotel_schedule : [];
  const item = sched.length && typeof sched[0] === "object" ? sched[0] : null;

  const heureVol = hhmm(item?.heure_vol) || hhmm(row?.heure_vol) || hhmm(row?.horaires) || hhmm(row?.heure) || "";
  const type = (row?.type || "").toUpperCase();

  if (type === "A") {
    const depotStored = hhmm(item?.heure_depot) || "";
    if (depotStored) return { heureVol, heureEst: depotStored };

    const aeroportStored = hhmm(item?.heure_aeroport) || "";
    const routeMin =
      typeof item?.route_minutes === "number"
        ? item.route_minutes
        : item?.route_minutes != null
          ? Number(item.route_minutes)
          : 120;
    const calc = addMinutes(addMinutes(heureVol, 60), routeMin) || "";
    return { heureVol, heureEst: aeroportStored || calc || "" };
  }

  if (type === "D") {
    const pickupStored = hhmm(item?.heure_pickup) || "";
    if (pickupStored) return { heureVol, heureEst: pickupStored };

    const airportStored = hhmm(item?.heure_aeroport) || "";
    const airportMin =
      typeof item?.airport_minutes === "number"
        ? item.airport_minutes
        : item?.airport_minutes != null
          ? Number(item.airport_minutes)
          : 120;
    const airportTime = airportStored || addMinutes(heureVol, -airportMin) || "";

    const pickupMin =
      typeof item?.pickup_minutes === "number"
        ? item.pickup_minutes
        : item?.pickup_minutes != null
          ? Number(item.pickup_minutes)
          : 0;
    const pickupCalc = pickupMin ? addMinutes(airportTime, -pickupMin) : airportTime;
    return { heureVol, heureEst: pickupCalc || "" };
  }

  return { heureVol, heureEst: "" };
}

/** construit un ISO "YYYY-MM-DDTHH:MM" */
function toIso(dateStr, timeStr) {
  const d = fmtDate(dateStr);
  const t = hhmm(timeStr) || "00:00";
  return d ? `${d}T${t}` : "";
}

/** calc une fenêtre mission approx sur base des fiches sélectionnées */
function computeMissionWindow(sel) {
  if (!sel?.length) return { startIso: "", endIso: "" };

  const baseDate = fmtDate(sel[0].date);
  const type = (sel[0]?.type || "").toUpperCase();

  // helper : récupère toutes les heures utiles (pickup/depot/vol) dans les fiches
  const pickups = [];
  const depots = [];
  const vols = [];

  for (const r of sel) {
    const sched = Array.isArray(r?.hotel_schedule) ? r.hotel_schedule : [];
    for (const it of sched) {
      if (!it || typeof it !== "object") continue;

      const hp = hhmm(it.heure_pickup);
      const hd = hhmm(it.heure_depot);
      const hv = hhmm(it.heure_vol) || hhmm(r.heure_vol) || hhmm(r.horaires) || hhmm(r.heure);

      if (hp) pickups.push(hp);
      if (hd) depots.push(hd);
      if (hv) vols.push(hv);
    }

    // fallback si pas de sched
    const hv2 = hhmm(r.heure_vol) || hhmm(r.horaires) || hhmm(r.heure);
    if (hv2) vols.push(hv2);
  }

  const minOf = (arr) => {
    let best = null;
    for (const t of arr) {
      const m = hhmmToMin(t);
      if (m == null) continue;
      if (best == null || m < best) best = m;
    }
    return best;
  };

  const maxOf = (arr) => {
    let best = null;
    for (const t of arr) {
      const m = hhmmToMin(t);
      if (m == null) continue;
      if (best == null || m > best) best = m;
    }
    return best;
  };

  const volMin = minOf(vols); // en général même vol partout
  if (volMin == null) return { startIso: "", endIso: "" };

  // ===== ARRIVÉE =====
  if (type === "A") {
    // start = h.vol
    const startMin = volMin;

    // end = dernier dépôt (sinon fallback = h.vol + 1h)
    const lastDepotMin = maxOf(depots);
    const endMin = lastDepotMin != null ? lastDepotMin : (volMin + 60);

    return {
      startIso: toIso(baseDate, minToHHMM(startMin)),
      endIso: toIso(baseDate, minToHHMM(endMin)),
    };
  }

  // ===== DÉPART =====
  if (type === "D") {
    // end = h.vol - 2h
    const endMin = volMin - 120;

    // start = premier pickup (sinon fallback = end)
    const firstPickupMin = minOf(pickups);
    const startMin = firstPickupMin != null ? firstPickupMin : endMin;

    return {
      startIso: toIso(baseDate, minToHHMM(startMin)),
      endIso: toIso(baseDate, minToHHMM(endMin)),
    };
  }

  // fallback neutre
  return {
    startIso: toIso(baseDate, minToHHMM(volMin)),
    endIso: toIso(baseDate, minToHHMM(volMin)),
  };
}

/* ====== Normalisation Véhicule (pour affichage + filtre) ====== */
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
  return v?.adresse_actuelle || v?.adresse || v?.position_actuelle || v?.current_address || "";
}

/* ====== Dernière / Prochaine mission (affichage) ====== */
function getLastMissionAddress(v) {
  return (
    (v?.last_mission_address || "").trim() ||
    (v?.last_mission_location || "").trim() ||
    (v?.last_mission_city || "").trim() ||
    (v?.last_mission_zone || "").trim() ||
    ""
  );
}

function getLastDriverLabel(v) {
  const d =
    v?.last_driver ||
    v?.last_chauffeur ||
    v?.last_mission_driver ||
    v?.last_mission_chauffeur ||
    v?.last_driver_obj ||
    v?.last_chauffeur_obj ||
    null;

  if (d && typeof d === "object") {
    const full = `${(d.prenom || "").trim()} ${(d.nom || "").trim()}`.trim();
    return full || (d.name || d.full_name || d.label || "").trim() || "—";
  }

  return (
    (v?.last_driver_name || "").trim() ||
    (v?.last_chauffeur_name || "").trim() ||
    (v?.last_mission_driver_name || "").trim() ||
    (v?.last_mission_chauffeur_name || "").trim() ||
    "—"
  );
}

function getLastMissionDisplay(v) {
  const end = formatDateTimeDisplay(v?.last_mission_end || v?.last_mission_end_at || v?.last_end);
  const addr = getLastMissionAddress(v) || "—";
  if (end === "—" && addr === "—") return "—";
  return `${end} — ${addr}`;
}


function getNextMissionAddress(v) {
  return (
    (v?.next_mission_address || "").trim() ||
    (v?.next_mission_location || "").trim() ||
    (v?.next_mission_city || "").trim() ||
    (v?.next_mission_zone || "").trim() ||
    ""
  );
}

function getNextMissionDisplay(v) {
  const start = formatDateTimeDisplay(v?.next_mission_start || v?.next_mission_start_at || v?.next_start);
  const addr = getNextMissionAddress(v) || "—";
  if (start === "—" && addr === "—") return "—";
  return `${start} — ${addr}`;
}

/* ================= Hôtel Cell ================= */
/* ================= Hôtel Cell ================= */
function HotelCell({ row, maxWidth = 360 }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  const hotels = Array.isArray(row?.hotels)
    ? row.hotels.map((x) => (x == null ? "" : String(x).trim())).filter(Boolean)
    : [];
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 });

  const computePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(380, Math.max(280, r.width + 260));
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, r.right - width));
    const top = Math.min(window.innerHeight - 220, r.bottom + 8);
    setPos({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    computePos();
    const onResize = () => computePos();
    const onScroll = () => computePos();
    const onDocClick = (e) => {
      if (!btnRef.current) return;
      if (!btnRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  if (!hotels.length) return <span>—</span>;
  if (hotels.length === 1) return <span className="text-truncate d-inline-block" style={{ maxWidth }}>{hotels[0]}</span>;

  const first = hotels[0];
  const restCount = hotels.length - 1;

  return (
    <>
      <span className="d-inline-flex align-items-center gap-2" style={{ maxWidth }}>
        <span className="text-truncate d-inline-block" style={{ maxWidth: maxWidth - 110 }}>{first}</span>
        <button
          ref={btnRef}
          type="button"
          className="btn btn-sm btn-outline-secondary"
          style={{ padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 500 }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          Voir +{restCount}
        </button>
      </span>

      {open &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
            className="bg-white border rounded shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Liste des hôtels ({hotels.length})
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={{ transform: "scale(0.85)" }}
              />
            </div>

            <div style={{ maxHeight: 240, overflow: "auto" }}>
              {hotels.map((h, i) => (
                <div key={i} className="px-3 py-2 border-top" style={{ fontSize: 14 }}>
                  {h}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/* ================= Modal flotte (MA FLOTTE) ================= */
function FleetModal({ open, onClose, onConfirm, agenceId, context }) {
  const [step, setStep] = useState("vehicles");
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState(new Set());

  useEffect(() => {
    if (open) {
      setStep("vehicles");
      setSelectedVehicleId(null);
      setSelectedDriverIds(new Set());
    }
  }, [open]);

  // ✅ véhicules filtrés par disponibilité (fenêtre) + agence
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setVehiclesLoading(true);
        const { data } = await api.get("/vehicules/", {
          params: {
            agence: agenceId,
            debut: context?.date_heure_debut || undefined,
            fin: context?.date_heure_fin || undefined,
          },
        });
        const arr = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        setVehicles(arr);
      } catch (e) {
        console.error(e);
        setVehicles([]);
      } finally {
        setVehiclesLoading(false);
      }
    })();
  }, [open, agenceId, context?.date_heure_debut, context?.date_heure_fin]);

  useEffect(() => {
    if (!open || step !== "drivers") return;
    (async () => {
      try {
        setDriversLoading(true);
        const { data } = await api.get("/chauffeurs/", {
          params: {
            agence: agenceId,
            statut: "dispo",
            date_debut: context?.date_heure_debut || undefined,
            date_fin: context?.date_heure_fin || undefined,
            debut: context?.date_heure_debut || undefined,
            fin: context?.date_heure_fin || undefined,
          },
        });
        const arr = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        setDrivers(arr);
      } catch (e) {
        console.error(e);
        setDrivers([]);
      } finally {
        setDriversLoading(false);
      }
    })();
  }, [open, step, agenceId, context?.date_heure_debut, context?.date_heure_fin]);

  // ✅ filtre capacité uniquement (plus PRO + simple)
  const filteredVehicles = useMemo(() => {
    const paxNeed = Number(context?.paxTotal) || 0;
    return vehicles.filter((v) => {
      const cap = getVehiculeCapacite(v);
      if (paxNeed <= 0) return true;
      if (cap == null) return false;
      return cap >= paxNeed;
    });
  }, [vehicles, context?.paxTotal]);

  const goNextStep = () => {
    if (!selectedVehicleId) return alert("Sélectionne un véhicule.");
    setStep("drivers");
  };

  const toggleDriver = (id) => {
    setSelectedDriverIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else {
        if (n.size >= 2) return alert("Max 2 chauffeurs."), n;
        n.add(id);
      }
      return n;
    });
  };

  const confirm = () => {
    if (!selectedVehicleId) return alert("Aucun véhicule sélectionné.");
    if (selectedDriverIds.size < 1) return alert("Choisis au moins 1 chauffeur.");

    const chosenVehicle = vehicles.find((v) => v.id === selectedVehicleId) || null;
    const chosenDrivers = drivers.filter((d) => selectedDriverIds.has(d.id));

    onConfirm({ vehicule: chosenVehicle, chauffeurs: chosenDrivers });
  };

  if (!open) return null;

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      role="dialog"
      style={{
        background: "rgba(0,0,0,0.35)",
        paddingTop: 56,
        paddingBottom: 24,
      }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-xl modal-dialog-centered"
        role="document"
        style={{ marginTop: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content" style={{ fontSize: 15 }}>
          <div className="modal-header">
            <h5 className="modal-title" style={{ fontWeight: 600 }}>
              {step === "vehicles" ? "Ma flotte — véhicule" : "Choisir 1 ou 2 chauffeurs"}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body">
            {/* Fenêtre mission (Pax supprimé) */}
            <div className="border rounded p-3 mb-3" style={{ background: "#f8f9fa" }}>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span style={{ fontWeight: 600 }}>Fenêtre mission</span>
                <span className="badge bg-white text-dark border" style={{ fontWeight: 500, fontSize: 13 }}>
                  {formatWindowDisplay(context?.date_heure_debut, context?.date_heure_fin)}
                </span>
              </div>
            </div>

            {step === "vehicles" && (
              <>
                <div className="border rounded" style={{ maxHeight: 460, overflow: "auto" }}>
                  <table className="table table-hover align-middle mb-0" style={{ fontSize: 15 }}>
                    <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                      <tr>
                        <th style={{ width: 42 }}></th>

                        <th style={{ width: 140 }}>Année / Capacité</th>

                        <th style={{ width: 150 }}>Immatriculation</th>
                        <th style={{ width: 160 }}>Adresse actuelle</th>
                        <th style={{ width: 220 }}>Last mission</th>
                        <th style={{ width: 220 }}>Next mission</th>

                      </tr>
                    </thead>
                    <tbody>
                      {vehiclesLoading && (
                        <tr>
                          <td colSpan={10} className="text-center py-4">
                            Chargement…
                          </td>
                        </tr>
                      )}

                      {!vehiclesLoading &&
                        filteredVehicles.map((v) => {
                       const cap = getVehiculeCapacite(v);
const an = getVehiculeAnnee(v);
const addr = getVehiculeAdresseActuelle(v);

// ✅ zone pour affichage (prochaine mission)
const zoneLabel = getVehiculeZoneLabel(v) || "—";

// ✅ next start: ton API n'a pas next_mission_start -> on prend real_state.available_from
const nextStart = formatDateTimeDisplay(
  v?.next_mission_start ||
  v?.next_mission_start_at ||
  v?.next_start ||
  v?.real_state?.available_from ||   // ✅ ton JSON
  null
);

// ✅ last end: ton API a last_mission_end parfois, sinon null
const lastEnd = formatDateTimeDisplay(
  v?.last_mission_end ||
  v?.last_mission_end_at ||
  v?.last_end ||
  null
);

// ✅ last zone: si pas dispo, on réutilise la zoneLabel
const lastZone =
  (v?.last_mission_zone || "").trim() ||
  (v?.last_zone || "").trim() ||
  zoneLabel;

                          const nextZone =
  (v?.next_mission_zone || "").trim() ||
  getVehiculeZoneLabel(v) ||
  "—";

                      


                          

                          const isSel = selectedVehicleId === v.id;

                          return (
                            <tr
                              key={v.id}
                              className={isSel ? "table-active" : ""}
                              onClick={() => setSelectedVehicleId(v.id)}
                              style={{ cursor: "pointer" }}
                            >
                              <td>
                                <input
                                  type="radio"
                                  className="form-check-input"
                                  checked={isSel}
                                  onChange={() => setSelectedVehicleId(v.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>

                              
                              <td>
                                <span className="badge bg-primary" style={{ fontWeight: 500, fontSize: 13 }}>
                                   {an ?? "—"} / {cap ?? "—"} 
                                </span>
                              </td>


                              <td>
                                <code style={{ fontSize: 14 }}>{v.immatriculation || "—"}</code>
                              </td>

                              <td className="text-truncate" title={addr || ""}>
                                {addr || "—"}
                              </td>

<td>
  <div style={{ fontSize: 12, color: "#6c757d" }}>Fin dernière mission</div>
  <div style={{ fontWeight: 600 }}>{lastEnd} / {lastZone || "—"}</div>
</td>

<td>
  <div style={{ fontSize: 12, color: "#6c757d" }}>Début prochaine mission</div>
  <div style={{ fontWeight: 600 }}>{nextStart} / {zoneLabel}</div>
</td>

                            </tr>
                          );
                        })}

                      {!vehiclesLoading && !filteredVehicles.length && (
                        <tr>
                          <td colSpan={10} className="text-center text-muted py-4">
                            Aucun véhicule disponible (capacité suffisante + dispo sur la fenêtre)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {step === "drivers" && (
              <>
                <div className="mb-2" style={{ fontSize: 15 }}>
                  <span style={{ fontWeight: 600 }}>Véhicule sélectionné :</span>{" "}
                  {vehicles.find((v) => v.id === selectedVehicleId)?.immatriculation || "—"}
                </div>
                <div className="text-muted mb-2" style={{ fontSize: 13 }}>
                  Sélectionne 1 ou 2 chauffeurs.
                </div>

                <div className="border rounded" style={{ maxHeight: 420, overflow: "auto" }}>
                  <table className="table table-hover align-middle mb-0" style={{ fontSize: 15 }}>
                    <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                      <tr>
                        <th style={{ width: 42 }}></th>
                        <th>Nom</th>
                        <th>Prénom</th>
                        <th>Téléphone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driversLoading && (
                        <tr>
                          <td colSpan={4} className="text-center py-4">
                            Chargement…
                          </td>
                        </tr>
                      )}

                      {!driversLoading &&
                        drivers.map((c) => (
                          <tr
                            key={c.id}
                            className={selectedDriverIds.has(c.id) ? "table-active" : ""}
                            onClick={() => toggleDriver(c.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={selectedDriverIds.has(c.id)}
                                onChange={() => toggleDriver(c.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td>{c.nom || "—"}</td>
                            <td>{c.prenom || "—"}</td>
                            <td>{c.telephone || c.tel || "—"}</td>
                          </tr>
                        ))}

                      {!driversLoading && !drivers.length && (
                        <tr>
                          <td colSpan={4} className="text-center text-muted py-4">
                            Aucun chauffeur disponible
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            {step === "vehicles" ? (
              <>
                <button className="btn btn-outline-secondary" onClick={onClose}>
                  Fermer
                </button>
                <button
                  className="btn btn-primary"
                  onClick={goNextStep}
                  disabled={!filteredVehicles.length || !selectedVehicleId}
                >
                  Suivant : chauffeurs
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-outline-secondary" onClick={() => setStep("vehicles")}>
                  ← Retour véhicule
                </button>
                <button className="btn btn-primary" onClick={confirm} disabled={selectedDriverIds.size === 0}>
                  Valider véhicule + chauffeur(s)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= RENTOÛT ================= */
function RentoutModal({ open, onClose, onConfirm, agenceId, hasSelection, context }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [sortMode, setSortMode] = useState("price");

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setQ("");
    setSortMode("price");

    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/rentout/available-vehicles/", {
          params: {
            aeroport: context?.aeroport || "",
            zone: context?.zone || "",
            pax: context?.paxTotal || 0,
            hotel: context?.hotel || "",
            heure: context?.heureIso || "",
          },
        });
        const arr = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        setVehicles(arr);
      } catch (e) {
        console.error(e);
        setVehicles([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, agenceId, context]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let arr = vehicles;

    if (qq) {
      arr = arr.filter((v) => {
        const hay = `${v.agence || ""} ${v.type || ""} ${v.marque || ""} ${v.modele || ""} ${(
          v.annee_mise_en_circulation ?? v.annee ?? ""
        ).toString()} ${v.immatriculation || ""} ${(v.adresse || v.position_actuelle || "").toString()}`.toLowerCase();
        return hay.includes(qq);
      });
    }

    const copy = [...arr];
    if (sortMode === "price") {
      copy.sort((a, b) => {
        const ta = typeof a.tarif === "number" ? a.tarif : Number.MAX_SAFE_INTEGER;
        const tb = typeof b.tarif === "number" ? b.tarif : Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        const da = typeof a.distance_km === "number" ? a.distance_km : Number.MAX_SAFE_INTEGER;
        const db = typeof b.distance_km === "number" ? b.distance_km : Number.MAX_SAFE_INTEGER;
        return da - db;
      });
    } else {
      copy.sort((a, b) => {
        const da = typeof a.distance_km === "number" ? a.distance_km : Number.MAX_SAFE_INTEGER;
        const db = typeof b.distance_km === "number" ? b.distance_km : Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        const ta = typeof a.tarif === "number" ? a.tarif : Number.MAX_SAFE_INTEGER;
        const tb = typeof b.tarif === "number" ? b.tarif : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
    }
    return copy;
  }, [vehicles, q, sortMode]);

  const confirm = () => {
    if (!hasSelection) return alert("Sélectionne d'abord au moins une fiche à transférer.");
    const chosen = vehicles.find((v) => v.id === selectedId);
    if (!chosen) return alert("Sélectionne un véhicule pour la demande de rentout.");
    onConfirm(chosen);
  };

  if (!open) return null;

  return (
    <div
      className="modal d-block"
      tabIndex="-1"
      role="dialog"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-lg" role="document" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content" style={{ fontSize: 15 }}>
          <div className="modal-header">
            <h5 className="modal-title" style={{ fontWeight: 600 }}>
              RENTOÛT — Véhicules disponibles
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body">
            <p className="text-muted" style={{ fontSize: 13 }}>
              Liste des véhicules mis en location par les autres agences (véhicule + chauffeur).
            </p>

            <div className="d-flex align-items-center mb-3">
              <div className="input-group">
                <span className="input-group-text">🔎</span>
                <input
                  className="form-control"
                  placeholder="Rechercher (agence, véhicule, adresse)…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button className="btn btn-outline-secondary" onClick={() => setQ("")}>
                  Effacer
                </button>
              </div>

              <div className="btn-group ms-2">
                <button
                  type="button"
                  className={"btn btn-sm " + (sortMode === "price" ? "btn-primary" : "btn-outline-secondary")}
                  onClick={() => setSortMode("price")}
                >
                  Prix
                </button>
                <button
                  type="button"
                  className={"btn btn-sm " + (sortMode === "distance" ? "btn-primary" : "btn-outline-secondary")}
                  onClick={() => setSortMode("distance")}
                >
                  Distance
                </button>
              </div>
            </div>

            <div className="table-responsive" style={{ maxHeight: 380, overflow: "auto" }}>
              <table className="table table-hover align-middle mb-0" style={{ fontSize: 15 }}>
                <thead className="table-light">
                  <tr>
                    <th></th>
                    <th>Marque</th>
                    <th>Modèle</th>
                    <th>Type</th>
                    <th>Capacité</th>
                    <th>Année</th>
                    <th>Tarif</th>
                    <th>Distance</th>
                    <th>Hôtel</th>
                    <th>Adresse</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={10} className="text-center py-4">
                        Chargement…
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    filtered.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <input
                            type="radio"
                            name="vehicule"
                            value={v.id}
                            checked={selectedId === v.id}
                            onChange={() => setSelectedId(v.id)}
                          />
                        </td>
                        <td>{v.marque || "—"}</td>
                        <td>{v.modele || "—"}</td>
                        <td>{v.type || "—"}</td>
                        <td>{v.capacite ?? "—"}</td>
                        <td>{v.annee ?? v.annee_mise_en_circulation ?? "—"}</td>
                        <td>{v.tarif != null ? `${v.tarif} ${v.devise || ""}` : "—"}</td>
                        <td>{typeof v.distance_km === "number" ? `${v.distance_km.toFixed(1)} km` : "—"}</td>
                        <td>{v.hotel_client || context?.hotel || "—"}</td>
                        <td>{v.adresse || v.position_actuelle || "—"}</td>
                      </tr>
                    ))}

                  {!loading && !filtered.length && (
                    <tr>
                      <td colSpan={10} className="text-center text-muted py-4">
                        Aucun véhicule disponible pour ce contexte.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-outline-secondary" onClick={onClose}>
              Fermer
            </button>
            <button className="btn btn-primary" onClick={confirm}>
              Envoyer la demande de rentout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Composant principal ================= */
export default function TransfertNouvelle() {
  const nav = useNavigate();
  const { agence_id } = useParams();
  const [sp] = useSearchParams();
  const { state } = useLocation();
  const dateQuery = sp.get("date") || "";

  const [loading, setLoading] = useState(false);
  const [fiches, setFiches] = useState([]);
  const [selected, setSelected] = useState(new Set());

  // modal flotte
  const [fleetOpen, setFleetOpen] = useState(false);
  const [fleetContext, setFleetContext] = useState(null);

  // modal rentout
  const [rentoutOpen, setRentoutOpen] = useState(false);
  const [rentoutContext, setRentoutContext] = useState(null);

  /* ====== Filtres ====== */
  const [search, setSearch] = useState("");
  const [fDate, setFDate] = useState(new Set());
  const [fType, setFType] = useState(new Set());
  const [fAero, setFAero] = useState(new Set());
  const [fZone, setFZone] = useState(new Set());
  const [paxMin, setPaxMin] = useState("");
  const [paxMax, setPaxMax] = useState("");

  const toggleSet = (setFn, v) =>
    setFn((prev) => {
      const n = new Set(prev);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });

  const clearAllFilters = () => {
    setSearch("");
    setFDate(new Set());
    setFType(new Set());
    setFAero(new Set());
    setFZone(new Set());
    setPaxMin("");
    setPaxMax("");
  };

  /* ====== Chargement des fiches ====== */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const params = { agence: agence_id || undefined, date: dateQuery || undefined, mission__isnull: true };
        const { data } = await api.get("/fiches-mouvement/", { params });
        const arr = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        setFiches(arr);
      } catch (e) {
        console.error(e);
        setFiches([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [agence_id, dateQuery]);

  // ✅ Pré-sélection si on vient du recap
  useEffect(() => {
    const ids = state?.fiche_ids;
    if (!ids || !Array.isArray(ids) || !ids.length) return;
    setSelected(new Set(ids));
  }, [state]);

  /* ====== Options + compteurs ====== */
  const { dateOpts, typeOpts, aeroOpts, zoneOpts } = useMemo(() => {
    const dateMap = new Map();
    const typeMap = new Map();
    const aeroMap = new Map();
    const zoneMap = new Map();

    for (const r of fiches) {
      const d = fmtDate(r.date) || "—";
      dateMap.set(d, (dateMap.get(d) || 0) + 1);

      const t = (r.type || "").toUpperCase();
      if (t) typeMap.set(t, (typeMap.get(t) || 0) + 1);

      const a = getAirportLabel(r);
      if (a) aeroMap.set(a, (aeroMap.get(a) || 0) + 1);

      const z = (r.zone || r.ville || "").trim();
      if (z) zoneMap.set(z, (zoneMap.get(z) || 0) + 1);
    }

    const toList = (m) => [...m.entries()].map(([value, count]) => ({ value, count }));

    return {
      dateOpts: toList(dateMap).sort((a, b) => a.value.localeCompare(b.value)),
      typeOpts: [
        { value: "A", label: "Arrivée", count: typeMap.get("A") || 0 },
        { value: "D", label: "Départ", count: typeMap.get("D") || 0 },
      ],
      aeroOpts: toList(aeroMap).sort((a, b) => a.value.localeCompare(b.value)),
      zoneOpts: toList(zoneMap).sort((a, b) => a.value.localeCompare(b.value)),
    };
  }, [fiches]);

  /* ====== Application des filtres ====== */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fiches.filter((r) => {
      if (q) {
        const hay = `${r.numero_vol || ""} ${getHotelLabel(r) || ""} ${r.client_to || ""} ${r.ville || ""} ${
          r.titulaire || ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fDate.size && !fDate.has(fmtDate(r.date))) return false;
      if (fType.size && !fType.has((r.type || "").toUpperCase())) return false;
      const a = getAirportLabel(r);
      if (fAero.size && !fAero.has(a)) return false;
      const z = (r.zone || r.ville || "").trim();
      if (fZone.size && !fZone.has(z)) return false;
      const p = Number(r.pax) || 0;
      if (paxMin !== "" && p < paxMin) return false;
      if (paxMax !== "" && p > paxMax) return false;
      return true;
    });
  }, [fiches, search, fDate, fType, fAero, fZone, paxMin, paxMax]);

  /* ====== Sélection ====== */
  const allInView = useMemo(() => filtered.length > 0 && filtered.every((f) => selected.has(f.id)), [filtered, selected]);
  const headerCheckRef = useRef(null);
  const someInView = useMemo(() => filtered.length > 0 && filtered.some((f) => selected.has(f.id)), [filtered, selected]);

  useEffect(() => {
    if (!headerCheckRef.current) return;
    headerCheckRef.current.indeterminate = !allInView && someInView;
  }, [allInView, someInView]);

  const selectAllInView = (checked) => {
    setSelected((prev) => {
      if (checked) return new Set([...prev, ...filtered.map((f) => f.id)]);
      const n = new Set(prev);
      for (const f of filtered) n.delete(f.id);
      return n;
    });
  };

  const toggle = (id) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const hasSelection = filtered.some((r) => selected.has(r.id));

  /* ====== Corbeille ====== */
  const revertOneToDossier = async (id) => {
    if (!window.confirm("Mettre cette fiche à la corbeille (revient en dossier) ?")) return;

    setLoading(true);
    try {
      await api.post(`/fiches-mouvement/${id}/revert-to-dossier/`);
      setFiches((prev) => prev.filter((x) => x.id !== id));
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } catch (e) {
      console.error(e);
      alert("Erreur corbeille: " + (e?.response?.data ? JSON.stringify(e.response.data) : e.message));
    } finally {
      setLoading(false);
    }
  };

  /* ====== Création mission unique ====== */
  const createMissionUnique = async (chosenVehicule = null, chosenChauffeurs = null, missionWindow = null) => {
    const sel = filtered.filter((r) => selected.has(r.id));
    if (!sel.length) return alert("Sélectionne au moins une fiche.");

    setLoading(true);
    try {
      const first = sel[0];

      const computedWindow = missionWindow || computeMissionWindow(sel);

      const payload = {
        fiche_ids: Array.from(new Set(sel.map((r) => r.id))),
        type: "T",
        date: fmtDate(first.date),
        heure: hhmm(first.heure_vol || first.horaires || first.heure || ""),
        numero_vol: first.numero_vol || "",
        aeroport: getAirportLabel(first) || "",
        hotel: getHotelLabel(first) || "",

        date_heure_debut: computedWindow?.startIso || null,
        date_heure_fin: computedWindow?.endIso || null,

        vehicule_id: chosenVehicule?.id || null,
        chauffeur_ids: Array.isArray(chosenChauffeurs) ? chosenChauffeurs.map((c) => c.id) : [],
      };

      await api.post("/fiches-mouvement/to-mission/", payload);
      nav(`/missions/transferts`);
    } catch (e) {
      console.error(e);
      alert("Erreur: " + (e?.response?.data ? JSON.stringify(e.response.data) : e.message));
    } finally {
      setLoading(false);
    }
  };

  /* ====== MA FLOTTE ====== */
  const openFleet = () => {
    const sel = filtered.filter((r) => selected.has(r.id));
    if (!sel.length) return alert("Sélectionne au moins une fiche avant de choisir la flotte.");

    const first = sel[0];
    const type = (first.type || "").toUpperCase();
    const aeroportLabel = getAirportLabel(first);
    const hotelLabel = getHotelLabel(first);

    let missionStart = "";
    let missionEnd = "";

    if (type === "A") {
      missionStart = aeroportLabel || "";
      missionEnd = hotelLabel || "";
    } else if (type === "D") {
      missionStart = hotelLabel || "";
      missionEnd = aeroportLabel || "";
    } else {
      missionStart = aeroportLabel || hotelLabel || "";
      missionEnd = hotelLabel || aeroportLabel || "";
    }

    const window = computeMissionWindow(sel);
    const paxTotal = sel.reduce((sum, r) => sum + (Number(r.pax) || 0), 0);

    setFleetContext({
      missionStart,
      missionEnd,
      type,
      date_heure_debut: window.startIso,
      date_heure_fin: window.endIso,
      paxTotal,
    });
    setFleetOpen(true);
  };

  const confirmFleet = ({ vehicule, chauffeurs }) => {
    const sel = filtered.filter((r) => selected.has(r.id));
    const window = computeMissionWindow(sel);
    setFleetOpen(false);
    createMissionUnique(vehicule, chauffeurs, window);
  };

  /* ====== RENTOÛT ====== */
  const openRentout = () => {
    const sel = filtered.filter((r) => selected.has(r.id));
    if (!sel.length) return alert("Sélectionne au moins une fiche avant de créer un rentout.");

    const first = sel[0];
    const dateStr = fmtDate(first.date);
    const heureStr = hhmm(first.horaires || first.heure_vol || first.heure) || "00:00";
    const heureIso = dateStr ? `${dateStr}T${heureStr}` : "";

    const zoneText = (first.zone || first.ville || "").trim() || null;
    const zoneId = first.zone_fk?.id || first.zone_id || (typeof first.zone === "object" ? first.zone.id : null) || null;

    setRentoutContext({
      zone: zoneText,
      type: (first.type || "").toUpperCase(),
      aeroport: getAirportLabel(first),
      hotel: getHotelLabel(first),
      zoneId,
      paxTotal: sel.reduce((sum, r) => sum + (Number(r.pax) || 0), 0),
      heureIso,
    });

    setRentoutOpen(true);
  };

  const confirmRentout = async (vehicule) => {
    const sel = filtered.filter((r) => selected.has(r.id));
    if (!sel.length) return alert("Sélectionne au moins une fiche.");

    setLoading(true);
    try {
      const payload = {
        vehicule: vehicule.id,
        fiche_ids: Array.from(new Set(sel.map((r) => r.id))),
        date_debut: fmtDate(sel[0].date),
        date_fin: fmtDate(sel[sel.length - 1].date || sel[0].date),
      };

      await api.post("/rentout/requests/", payload);

      setRentoutOpen(false);
      alert("Demande de rentout envoyée à l'agence propriétaire.");
    } catch (e) {
      console.error(e);
      alert("Erreur rentout: " + (e?.response?.data ? JSON.stringify(e.response.data) : e.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", overflowX: "hidden", fontSize: 15 }}>
      <div className="container-fluid py-3" style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div className="d-flex justify-content-between align-items-start align-items-md-center mb-3 flex-wrap gap-2">
          <div>
            <nav aria-label="breadcrumb">
              <ol className="breadcrumb mb-1">
                <li className="breadcrumb-item">Missions</li>
                <li className="breadcrumb-item">
                  <span role="button" onClick={() => nav(`/missions/transferts`)}>
                    Mes transferts
                  </span>
                </li>
                <li className="breadcrumb-item active" aria-current="page">
                  Détails
                </li>
              </ol>
            </nav>
            <h5 className="m-0" style={{ fontWeight: 600 }}>
              Fiches mouvement
            </h5>
          </div>

          <div className="d-flex gap-2 flex-wrap justify-content-end">
            <button className="btn btn-outline-secondary" onClick={() => nav(-1)} disabled={loading}>
              Annuler
            </button>

            <button className="btn btn-dark" onClick={openFleet} disabled={loading || selected.size === 0}>
              MA FLOTTE
            </button>
            <button className="btn btn-outline-secondary" onClick={openRentout} disabled={loading || selected.size === 0}>
              RENTOÛT
            </button>
            <button className="btn btn-success" onClick={() => createMissionUnique()} disabled={loading || selected.size === 0}>
              RIDESHARE
            </button>
          </div>
        </div>

        <div className="d-flex flex-column flex-lg-row">
          <div className="flex-grow-1 pe-lg-3">
            <div className="card">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: 15 }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 42 }}>
                        <input
                          ref={headerCheckRef}
                          type="checkbox"
                          className="form-check-input"
                          checked={!!allInView}
                          onChange={(e) => selectAllInView(e.target.checked)}
                          title="Tout sélectionner (filtre courant)"
                        />
                      </th>
                      <th>Date</th>
                      <th>Heures</th>
                      <th>Aéroport</th>
                      <th>Hôtel</th>
                      <th>Type</th>
                      <th style={{ width: 60 }} className="text-center">
                        Actions
                      </th>
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
                      filtered.map((r) => {
                        const { heureVol, heureEst } = getTimesFromHotelSchedule(r);

                        return (
                          <tr
                            key={r.id}
                            className={selected.has(r.id) ? "table-active" : ""}
                            onClick={() => toggle(r.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={selected.has(r.id)}
                                onChange={() => toggle(r.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>

                            <td style={{ fontWeight: 600 }}>{fmtDate(r.date) || "—"}</td>

                            <td style={{ minWidth: 140 }}>
                              <div style={{ fontSize: 12, color: "#6c757d" }}>Vol : {heureVol || "—"}</div>
                              <div style={{ fontWeight: 600 }}>Estimé : {heureEst || "—"}</div>
                            </td>

                            <td>{getAirportLabel(r) || "—"}</td>

                            <td className="text-truncate" style={{ maxWidth: 380 }}>
                              <HotelCell row={r} maxWidth={380} />
                            </td>

                            <td>{badgeType(r.type)}</td>

                            <td className="text-center">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                title="Mettre à la corbeille (revient en dossier)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  revertOneToDossier(r.id);
                                }}
                                disabled={loading}
                                style={{ borderRadius: 999, padding: "2px 10px", fontWeight: 500 }}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                    {!loading && !filtered.length && (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          Aucune fiche
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ===== Panneau filtres ===== */}
          <aside className="border-start ps-3 ms-lg-3 mt-3 mt-lg-0" style={{ minWidth: 260, maxWidth: 340 }}>
            <div className="mb-3">
              <div className="input-group">
                <span className="input-group-text">🔎</span>
                <input className="form-control" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button className="btn btn-outline-secondary" onClick={() => setSearch("")}>
                  Go
                </button>
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="m-0" style={{ fontWeight: 600 }}>
                Filtres
              </h6>
              <button className="btn btn-sm btn-link" onClick={clearAllFilters} style={{ fontWeight: 500 }}>
                Réinitialiser
              </button>
            </div>

            {/* Date Vol */}
            <div className="mb-3">
              <div style={{ fontWeight: 600 }} className="mb-1">
                Date Vol
              </div>
              <div className="border rounded p-2" style={{ maxHeight: 160, overflow: "auto", fontSize: 14 }}>
                {dateOpts.map((opt) => (
                  <label key={opt.value} className="d-flex justify-content-between mb-1">
                    <span>
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={fDate.has(opt.value)}
                        onChange={() => toggleSet(setFDate, opt.value)}
                      />
                      {opt.value}
                    </span>
                    <span className="badge bg-light text-dark" style={{ fontWeight: 500 }}>
                      {opt.count}
                    </span>
                  </label>
                ))}
                {!dateOpts.length && <div className="text-muted small">—</div>}
              </div>
            </div>

            {/* Type */}
            <div className="mb-3">
              <div style={{ fontWeight: 600 }} className="mb-1">
                Type
              </div>
              <div className="border rounded p-2" style={{ fontSize: 14 }}>
                {typeOpts.map((opt) => (
                  <label key={opt.value} className="d-flex justify-content-between mb-1">
                    <span>
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={fType.has(opt.value)}
                        onChange={() => toggleSet(setFType, opt.value)}
                      />
                      {opt.label}
                    </span>
                    <span className="badge bg-light text-dark" style={{ fontWeight: 500 }}>
                      {opt.count}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Aéroport */}
            <div className="mb-3">
              <div style={{ fontWeight: 600 }} className="mb-1">
                Aéroport
              </div>
              <div className="border rounded p-2" style={{ maxHeight: 160, overflow: "auto", fontSize: 14 }}>
                {aeroOpts.map((opt) => (
                  <label key={opt.value} className="d-flex justify-content-between mb-1">
                    <span>
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={fAero.has(opt.value)}
                        onChange={() => toggleSet(setFAero, opt.value)}
                      />
                      {opt.value}
                    </span>
                    <span className="badge bg-light text-dark" style={{ fontWeight: 500 }}>
                      {opt.count}
                    </span>
                  </label>
                ))}
                {!aeroOpts.length && <div className="text-muted small">—</div>}
              </div>
            </div>
          </aside>
        </div>

        <FleetModal
          open={fleetOpen}
          onClose={() => setFleetOpen(false)}
          onConfirm={confirmFleet}
          agenceId={agence_id}
          context={fleetContext}
        />

        <RentoutModal
          open={rentoutOpen}
          onClose={() => setRentoutOpen(false)}
          onConfirm={confirmRentout}
          agenceId={agence_id}
          hasSelection={hasSelection}
          context={rentoutContext}
        />
      </div>
    </div>
  );
}
