// src/components/FicheComponentOrdre/FicheMouvementRecap.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";

/* ===== Utils Date ===== */
function pad(n) {
  return n.toString().padStart(2, "0");
}
function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function parseMetaDate(meta) {
  if (meta?.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date)) return new Date(`${meta.date}T00:00:00`);
  return new Date();
}
function hhmmFromDate(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
function normalizeHeureVol(v) {
  const s = (v ?? "").toString().trim();
  if (!s) return "";
  if (/^\d{4}$/.test(s)) return s.slice(0, 2) + ":" + s.slice(2);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  const h = s.match(/^(\d{2})[hH](\d{2})$/);
  if (h) return `${h[1]}:${h[2]}`;
  const iso = s.match(/(\d{2}):(\d{2})(?::\d{2})?/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return hhmmFromDate(d);
  return "";
}
function parseHeureVol(meta, items) {
  const fromMeta = normalizeHeureVol(meta?.heure_vol);
  if (fromMeta) return fromMeta;
  const row = items?.find?.((r) => r?.horaires || r?.heure_vol || r?.heure);
  return (
    normalizeHeureVol(row?.horaires) ||
    normalizeHeureVol(row?.heure_vol) ||
    normalizeHeureVol(row?.heure) ||
    ""
  );
}
function addMinutes(d, minutes) {
  const r = new Date(d);
  r.setMinutes(r.getMinutes() + minutes);
  return r;
}
function fromHHMMToDate(hhmm, meta) {
  const base = parseMetaDate(meta);
  const m = (hhmm || "").match(/^(\d{2}):(\d{2})$/);
  if (m) base.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  else base.setHours(0, 0, 0, 0);
  return base;
}
function kindLabel(kind) {
  if (kind === "depart") return "Départ";
  if (kind === "arrivee") return "Arrivée";
  return "Fiche";
}
function kindBadgeClass(kind) {
  if (kind === "depart") return "bg-primary";
  if (kind === "arrivee") return "bg-success";
  return "bg-secondary";
}

function toMinuteKey(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return "";
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}

/* ============ API helpers ============ */

async function postHotelScheduleWithOptionalRemark(id, payload) {
  try {
    return await api.post(`/fiches-mouvement/${id}/hotel-schedule/`, payload);
  } catch (e1) {
    const status = e1?.response?.status;
    const data = e1?.response?.data;
    const msg = typeof data === "string" ? data : JSON.stringify(data || {});
    const looksLikeUnknownField =
      msg.toLowerCase().includes("remarque") ||
      msg.toLowerCase().includes("unknown") ||
      msg.toLowerCase().includes("unexpected") ||
      msg.toLowerCase().includes("field");

    if (status === 400 && looksLikeUnknownField) {
      const { remarque, ...withoutRemark } = payload || {};
      return await api.post(`/fiches-mouvement/${id}/hotel-schedule/`, withoutRemark);
    }
    throw e1;
  }
}

export default function FicheMouvementRecap() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { agence_id } = useParams();

  useEffect(() => {
    if (!state?.items?.length) navigate(-1);
  }, [state, navigate]);

  const items = state?.items || [];
  const rawMeta = state?.meta || {};
  const dossierIdsFromMeta = Array.isArray(rawMeta.dossier_ids) ? rawMeta.dossier_ids : [];

  const [ficheIds, setFicheIds] = useState(
    Array.isArray(rawMeta.fiche_ids) ? rawMeta.fiche_ids : []
  );
  const resolvedFicheId = ficheIds?.[0] ?? null;

  const [loadedVol, setLoadedVol] = useState(null);
  const [loadingVol, setLoadingVol] = useState(false);
  const [saving, setSaving] = useState(false);

  const [remarque, setRemarque] = useState("");

  useEffect(() => {
    if (!resolvedFicheId) return;
    (async () => {
      try {
        setLoadingVol(true);
        const { data } = await api.get(`/fiches-mouvement/${resolvedFicheId}/`);
        setLoadedVol(data || {});
              
        setRemarque((data?.remarque || "").toString()); // ✅ important
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingVol(false);
      }
    })();
  }, [resolvedFicheId]);

  const kind = rawMeta.kind || loadedVol?.kind || null;

  const rawHoraire =
    (loadedVol && (loadedVol.horaires ?? loadedVol.heure_vol ?? loadedVol.heure)) ?? null;

  const computedHeureVol = normalizeHeureVol(rawHoraire) || parseHeureVol(rawMeta, items) || "";
  const computedNumeroVol =
    (loadedVol?.numero_vol || "").trim() || (rawMeta?.numero_vol || "").trim() || "";
  const computedAeroport =
    (kind === "depart" ? loadedVol?.provenance || "" : loadedVol?.destination || "") ||
    rawMeta?.aeroport ||
    "";

  const meta = {
    numero_vol: computedNumeroVol,
    heure_vol: computedHeureVol,
    aeroport: computedAeroport,
    date: rawMeta.date || loadedVol?.date || isoToday(),
    kind,
    fiche_ids: ficheIds,
    fiche_id: resolvedFicheId,
    agence_id: rawMeta.agence_id ?? agence_id ?? null,
    dossier_ids: dossierIdsFromMeta,

    returnTo: state?.returnTo || null,
    restoreFilters: state?.restoreFilters || null,
  };

  const baseDay = useMemo(() => {
    const d = parseMetaDate(meta);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [meta.date]);

  const hotelRows = useMemo(() => {
    const hs = loadedVol?.hotel_schedule;
    if (Array.isArray(hs) && hs.length) {
      return hs.map((x) => ({
        hotel: (x.hotel || "—").trim(),
        pax: Number(x.pax) || 0,
      }));
    }

    const map = new Map();
    for (const it of items) {
      const h = (it.hotel || "—").trim();
      const pax = Number(it.pax) || 0;
      map.set(h, (map.get(h) || 0) + pax);
    }
    return Array.from(map.entries()).map(([hotel, pax]) => ({ hotel, pax }));
  }, [items, loadedVol?.hotel_schedule]);


  const hasSingleHotel = useMemo(() => hotelRows.length === 1, [hotelRows.length]);

  const paxTotal = useMemo(
    () => hotelRows.reduce((a, r) => a + (Number(r.pax) || 0), 0),
    [hotelRows]
  );

  const [endByHotel, setEndByHotel] = useState({});

  // ✅ baseline par hôtel (heure initiale estimée à la minute)
  const [baselineByHotel, setBaselineByHotel] = useState({});
  // ✅ hotels réellement modifiés (diff ≥ 1 minute)
  const [changedHotels, setChangedHotels] = useState(() => new Set());

  useEffect(() => {
    const init = {};
    const baseLine = {};
    if (!hotelRows.length) {
      setEndByHotel(init);
      setBaselineByHotel(baseLine);
      setChangedHotels(new Set());
      return;
    }

    const hv = normalizeHeureVol(meta.heure_vol);
    if (!hv) {
      setEndByHotel(init);
      setBaselineByHotel(baseLine);
      setChangedHotels(new Set());
      return;
    }

    const [H, M] = hv.split(":").map(Number);
    const base = parseMetaDate(meta);
    base.setHours(H, M, 0, 0);

    const deltaMinutes = kind === "depart" ? -180 : 180;
    const estimated = addMinutes(base, deltaMinutes);

    for (const row of hotelRows) {
      init[row.hotel] = new Date(estimated);
      baseLine[row.hotel] = toMinuteKey(estimated); // baseline minute
    }

    setEndByHotel(init);
    setBaselineByHotel(baseLine);
    setChangedHotels(new Set()); // reset
  }, [hotelRows, meta.heure_vol, meta.date, kind]);

  const handleEndChange = (hotel, valueHHMM) => {
    const nextDate = fromHHMMToDate(valueHHMM, meta);

    setEndByHotel((p) => ({ ...p, [hotel]: nextDate }));

    const nextKey = toMinuteKey(nextDate);
    const baseKey = (baselineByHotel?.[hotel] || "").trim();

    setChangedHotels((prev) => {
      const n = new Set(prev);
      // ✅ must be different at least 1 minute (minute-key diff)
      if (nextKey && baseKey && nextKey !== baseKey) n.add(hotel);
      else n.delete(hotel);
      return n;
    });
  };

  const buildHotelSchedule = () =>
    hotelRows.map((r) => {
      const hhmm = endByHotel[r.hotel] ? hhmmFromDate(endByHotel[r.hotel]) : null;
      return {
        hotel: r.hotel,
        pax: Number(r.pax) || 0,
        heure_depot: hhmm,
        override_time: hhmm,
        heure_fin_estimee: hhmm,
      };
    });

  const ensureFichesCreated = async () => {
    if (Array.isArray(ficheIds) && ficheIds.length) return ficheIds;

    const dossier_ids = (meta.dossier_ids?.length ? meta.dossier_ids : []).filter(Boolean);
    if (!dossier_ids.length) throw new Error("Aucun dossier_ids fourni pour créer les fiches.");

    const body = {
      agence: Number(meta.agence_id),
      dossier_ids,
      kind: meta.kind,
      date: meta.date,
      numero_vol: meta.numero_vol,
      aeroport: meta.aeroport,
      remarque: (remarque || "").trim(), // ✅ AJOUT
    };

    const { data } = await api.post("/dossiers/to-fiche/", body);
    const created = data?.fiche_ids || [];
    if (!created.length) throw new Error("Création fiches: aucun fiche_id retourné.");
    setFicheIds(created);
    return created;
  };

  const allHotelsHaveTime = useMemo(() => {
    if (!hotelRows.length) return false;
    return hotelRows.every((r) => {
      const d = endByHotel[r.hotel];
      if (!d) return false;
      const hh = hhmmFromDate(d);
      return /^\d{2}:\d{2}$/.test(hh);
    });
  }, [hotelRows, endByHotel]);

  // ✅ strict: must be DIFFERENT vs baseline for every hotel
  const allHotelsChanged = useMemo(() => {
  if (!hotelRows.length) return false;

  // ✅ 1 seul hôtel => pas besoin de modifier l'heure
  if (hotelRows.length === 1) return true;

  // ✅ 2+ hôtels => on garde la règle stricte
  return changedHotels.size === hotelRows.length;
}, [changedHotels, hotelRows.length]);


  const canSave = allHotelsHaveTime && allHotelsChanged && !loadingVol && !saving;

  const save = async () => {
    try {
      setSaving(true);

      if (!allHotelsHaveTime) {
        alert("Merci de renseigner une heure pour chaque hôtel.");
        return;
      }
      if (!allHotelsChanged) {
      alert(
        hotelRows.length === 1
          ? "Merci de renseigner l’heure de l’hôtel."
          : "Merci de modifier l’horaire de chaque hôtel (différent d’au moins 1 minute)."
      );
      return;
    }


      const ids = await ensureFichesCreated();
      const schedule = buildHotelSchedule();

      const successes = [];
      const failures = [];

      for (const id of ids) {
        try {
          await postHotelScheduleWithOptionalRemark(id, {
            hotel_schedule: schedule,
            remarque: (remarque ?? "").toString(),

          });
          successes.push(id);
        } catch (e) {
          console.error("update fiche error", id, e?.response?.data || e.message);
          failures.push({ id, error: e?.response?.data || e.message });
        }
      }

      if (failures.length && successes.length) {
        alert(
          `Certaines fiches ont été mises à jour (${successes.length}), mais ${failures.length} ont échoué.\n` +
            JSON.stringify(failures.slice(0, 3))
        );
        return;
      }
      if (failures.length && !successes.length) {
        alert(`Aucune fiche mise à jour.\n${JSON.stringify(failures.slice(0, 3))}`);
        return;
      }

      const fallback =
        meta.kind === "arrivee"
          ? `/agence/${meta.agence_id}/mes-arrivees`
          : `/agence/${meta.agence_id}/mes-departs`;

      const returnTo = meta.returnTo || fallback;

      navigate(returnTo, {
        replace: true,
        state: {
          restoreFilters: meta.restoreFilters || null,
          fromRecap: true,
          fiche_ids: ids,
          agence_id: meta.agence_id,
        },
      });
    } catch (e) {
      console.error(e);
      alert(e?.message || "Erreur lors de la finalisation.");
    } finally {
      setSaving(false);
    }
  };

  const dayDiffFromBase = (d) => {
    if (!d) return 0;
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const diffMs = x.getTime() - baseDay.getTime();
    return Math.round(diffMs / (24 * 60 * 60 * 1000));
  };

  const title = `${kind === "depart" ? "🛫" : kind === "arrivee" ? "🛬" : "📋"} Récapitulatif — ${kindLabel(
    kind
  )}`;

  return (
    <div className="container py-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button
  className="btn btn-outline-secondary"
  onClick={() => {
    if (meta?.returnTo) {
      navigate(meta.returnTo, {
        replace: true,
        state: { restoreFilters: meta.restoreFilters || null },
      });
    } else {
      navigate(-1);
    }
  }}
>
  ← Retour
</button>


        <div className="d-flex align-items-center gap-2">
          <span className={`badge ${kindBadgeClass(kind)} px-3 py-2`}>{kindLabel(kind)}</span>
          <button className="btn btn-success" onClick={save} disabled={!canSave}>
            {saving ? "Enregistrement…" : "Enregistrer et continuer ➔"}
          </button>
        </div>
      </div>

      <h3 className="mb-3">{title}</h3>

      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-center">
            <div className="col-12 col-md-3">
              <div className="text-muted small">Date</div>
              <div className="fw-bold fs-5">{meta.date || "—"}</div>
            </div>

            <div className="col-12 col-md-3">
              <div className="text-muted small">N° Vol</div>
              <div className="fw-bold fs-5">{meta.numero_vol || "—"}</div>
            </div>

            <div className="col-12 col-md-2">
              <div className="text-muted small">Heure vol</div>
              <div className="fw-bold fs-5">{meta.heure_vol || "—"}</div>
            </div>

            <div className="col-12 col-md-2">
              <div className="text-muted small">
                {kind === "depart" ? "Aéroport (provenance)" : "Aéroport (destination)"}
              </div>
              <div className="fw-bold fs-5">{meta.aeroport || "—"}</div>
            </div>

            <div className="col-12 col-md-2 text-md-end">
              <div className="text-muted small">PAX Total</div>
              <div className="fw-bold fs-2">{paxTotal}</div>
            </div>
          </div>

          {loadingVol && <div className="text-muted small mt-2">Chargement des infos vol…</div>}

          {!allHotelsChanged && hotelRows.length > 1 && (
            <div className="text-danger small mt-3">
              ⚠️ Pour continuer : l’heure de chaque hôtel doit être <b>différente</b> de l’heure initiale (au moins 1 minute).
            </div>
          )}

        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-striped align-middle">
          <thead className="table-light">
            <tr>
              <th>Hôtel</th>
              <th style={{ width: 120 }}>PAX</th>
              <th style={{ width: 320 }}>
                {kind === "depart"
                  ? "Heure de départ de l'hôtel (estimée)"
                  : "Heure d'arrivée à l'hôtel (estimée)"}
              </th>
            </tr>
          </thead>
          <tbody>
            {hotelRows.map((r) => {
              const end = endByHotel[r.hotel];
              const diffDays = dayDiffFromBase(end);
              const badge = diffDays !== 0 ? `${diffDays > 0 ? "+" : ""}${diffDays}j` : null;

              const baseKey = (baselineByHotel?.[r.hotel] || "").trim();
              const curKey = end ? toMinuteKey(end) : "";
              const isChanged = baseKey && curKey && baseKey !== curKey;

              return (
                <tr key={r.hotel}>
                  <td>{r.hotel}</td>
                  <td className="fw-bold">{r.pax}</td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <input
                        type="time"
                        className="form-control"
                        value={end ? hhmmFromDate(end) : ""}
                        onChange={(e) => handleEndChange(r.hotel, e.target.value)}
                      />
                      {badge && <span className="text-danger fw-bold small">{badge}</span>}
                     {hotelRows.length > 1 && !isChanged && (
                      <span className="badge bg-warning text-dark">À modifier</span>
                    )}

                    </div>
                    
                  </td>
                </tr>
              );
            })}
            {!hotelRows.length && (
              <tr>
                <td colSpan={3} className="text-center text-muted py-4">
                  Aucune donnée
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Remarque (after hotel list) */}
      <div className="card mt-3">
        <div className="card-body">
          <div className="fw-bold mb-2">Remarque</div>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Ajouter une remarque…"
            value={remarque}
            onChange={(e) => setRemarque(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
