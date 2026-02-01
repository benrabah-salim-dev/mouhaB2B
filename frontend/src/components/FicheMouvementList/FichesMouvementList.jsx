// src/components/FicheMouvementList/FichesMouvementList.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import api from "../../api/client";
import "./fichesList.css";

/* ================= Helpers ================= */
const DEPART_TYPES = new Set(["D", "S"]);
const ARRIVEE_TYPES = new Set(["A", "L"]);

const BadgeType = ({ t }) => {
  const tt = (t || "").trim().toUpperCase();
  const isArr = tt === "A" || tt === "L";
  const isDep = tt === "D" || tt === "S";
  const label = isArr ? "Arrivée" : isDep ? "Départ" : tt || "—";
  const cls = isArr ? "bg-success" : isDep ? "bg-primary" : "bg-secondary";
  return <span className={`badge ${cls}`}>{label}</span>;
};

const toggleSet = (setFn, v) =>
  setFn((prev) => {
    const n = new Set(prev);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  });

// ✅ SINGLE selection inside a Set (always 0 or 1)
const toggleSingleSet = (setFn, v) =>
  setFn((prev) => {
    const n = new Set();
    if (!prev.has(v)) n.add(v); // if already selected -> becomes empty
    return n;
  });

function usePageKind() {
  const { pathname } = useLocation();
  const p = (pathname || "").toLowerCase();
  if (p.includes("mes-departs")) return "depart";
  if (p.includes("mes-arrivees")) return "arrivee";
  return null;
}

function sumPax(list) {
  return list.reduce((acc, it) => acc + (Number(it.pax) || 0), 0);
}

function isoToday() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// normalise "1400" -> "14:00", "14:00" -> "14:00"
function normalizeHv(v) {
  const hv = (v || "").toString().trim();
  if (/^\d{4}$/.test(hv)) return hv.slice(0, 2) + ":" + hv.slice(2);
  if (/^\d{2}:\d{2}$/.test(hv)) return hv;
  if (/^\d{2}:\d{2}:\d{2}$/.test(hv)) return hv.slice(0, 5);
  return "";
}

/**
 * ✅ Fix affichage CLIENT/TO (évite "dtype: object", "Name:", etc.)
 * On reçoit parfois un "repr" multi-lignes type pandas Series.
 */
function normalizeClientTO(v) {
  if (v == null) return "—";

  // if it’s a real object (rare), try common props
  if (typeof v === "object") {
    const maybe =
      v?.client_to ??
      v?.t_o ??
      v?.to ??
      v?.name ??
      (typeof v.toString === "function" ? v.toString() : "");
    return normalizeClientTO(maybe);
  }

  let s = String(v);

  // remove obvious pandas leftovers even if inline
  s = s.replace(/\s*dtype:\s*\w+/gi, "");
  s = s.replace(/\s*Name:\s*[^,]+/gi, "");
  s = s.replace(/\s*Series\s*/gi, "");

  // if multiline: keep meaningful lines only
  const lines = s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.toLowerCase() !== "t_o")
    .filter((x) => !/^name\s*:/i.test(x))
    .filter((x) => !/^dtype\s*:/i.test(x));

  const cleaned = (lines.length ? lines.join(" ") : s).replace(/\s+/g, " ").trim();
  return cleaned || "—";
}

/* ===== UI helpers (group lists: avoid truncation, keep pax readable) ===== */
function GroupItem({ id, checked, onToggle, title, pax, fallbackTitle = "—" }) {
  const safeTitle = (title || "").toString().trim() || fallbackTitle;
  return (
    <div className="form-check fm-group-item">
      <input
        id={id}
        type="checkbox"
        className="form-check-input fm-group-check"
        checked={checked}
        onChange={onToggle}
      />
      <label htmlFor={id} className="fm-group-label" title={safeTitle}>
        <span className="fm-group-text">{safeTitle}</span>
        <span className="badge bg-light text-dark fm-group-pax">
          PAX : {Number(pax) || 0}
        </span>
      </label>
    </div>
  );
}

/* ================= Rail droit (cascading) ================= */
function RightRail({
  dateOptions,
  aeroOptions,
  volOptions,
  selDates,
  setSelDates,
  selAero,
  setSelAero,
  selVols,
  setSelVols,
  loading,
  pageKind,
}) {
  const showAero = selDates.size > 0;
  const showVols = showAero && selAero.size > 0;

  const clearDates = () => setSelDates(new Set());
  const clearAero = () => setSelAero(new Set());
  const clearVols = () => setSelVols(new Set());

  const aeroLabel =
    pageKind === "depart" ? "Aéroports (provenance)" : "Aéroports (destination)";

  return (
    <aside className="fm-right-rail">
      {/* Dates (✅ SINGLE) */}
      <div className="mb-3">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <label className="form-label m-0">Date</label>
          <button className="btn btn-link btn-sm p-0" onClick={clearDates} disabled={loading}>
            Clear
          </button>
        </div>
        <div className="border rounded p-2" style={{ maxHeight: 180, overflow: "auto" }}>
          {dateOptions.length ? (
            dateOptions.map((d) => (
              <label key={d.date || "-"} className="d-flex justify-content-between mb-1">
                <span>
                  <input
                    type="checkbox"
                    className="form-check-input me-2"
                    checked={selDates.has(d.date)}
                    onChange={() => toggleSingleSet(setSelDates, d.date)}
                    disabled={loading}
                  />
                  {d.date || "—"}
                </span>
                <span className="badge bg-light text-dark">{d.count} fiches</span>
              </label>
            ))
          ) : (
            <div className="text-muted small">—</div>
          )}
        </div>
      </div>

      {/* Aéroports (✅ SINGLE) */}
      {showAero && (
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <label className="form-label m-0">{aeroLabel}</label>
            <button className="btn btn-link btn-sm p-0" onClick={clearAero} disabled={loading}>
              Clear
            </button>
          </div>
          <div className="border rounded p-2" style={{ maxHeight: 180, overflow: "auto" }}>
            {aeroOptions.length ? (
              aeroOptions.map((a) => (
                <label key={a.aeroport || "-"} className="d-flex justify-content-between mb-1">
                  <span>
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      checked={selAero.has(a.aeroport)}
                      onChange={() => toggleSingleSet(setSelAero, a.aeroport)}
                      disabled={loading}
                    />
                    {a.aeroport}
                  </span>
                  <span className="badge bg-light text-dark">{a.count} fiches</span>
                </label>
              ))
            ) : (
              <div className="text-muted small">—</div>
            )}
          </div>
        </div>
      )}

      {/* Vols (✅ MULTI 1 ou *) */}
      {showVols && (
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <label className="form-label m-0">Vols</label>
            <button className="btn btn-link btn-sm p-0" onClick={clearVols} disabled={loading}>
              Clear
            </button>
          </div>
          <div className="border rounded p-2" style={{ maxHeight: 180, overflow: "auto" }}>
            {volOptions.length ? (
              volOptions.map((v) => (
                <label key={v.numero_vol || "-"} className="d-flex justify-content-between mb-1">
                  <span>
                    <input
                      type="checkbox"
                      className="form-check-input me-2"
                      checked={selVols.has(v.numero_vol)}
                      onChange={() => toggleSet(setSelVols, v.numero_vol)}
                      disabled={loading}
                    />
                    {v.label}
                  </span>
                  <span className="badge bg-light text-dark">{v.pax} PAX</span>
                </label>
              ))
            ) : (
              <div className="text-muted small">—</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/* ================= Page principale ================= */
export default function FichesMouvementList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { agence_id } = useParams();
  const pageKind = usePageKind(); // 'depart' | 'arrivee' | null

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Groupes haut (multi-choix) - affichage conditionnel (voir plus bas)
  const [selTOs, setSelTOs] = useState(new Set());
  const [selZones, setSelZones] = useState(new Set()); // ✅ zone = single via handler
  const [selHotels, setSelHotels] = useState(new Set());
  const [selObs, setSelObs] = useState(new Set());

  // Filtres cascade
  const [selDates, setSelDates] = useState(new Set()); // ✅ single
  const [selAero, setSelAero] = useState(new Set()); // ✅ single
  const [selVols, setSelVols] = useState(new Set()); // multi

  const hasAllRightFilters = useMemo(
    () => selDates.size > 0 && selAero.size > 0 && selVols.size > 0,
    [selDates, selAero, selVols]
  );

  // ✅ étapes d’affichage demandées
  const showTopTO = hasAllRightFilters; // après vols
  const showTopZones = showTopTO && selTOs.size > 0; // après sélection TO
  const showTopHotels = showTopZones && selZones.size > 0; // après sélection zone
  const showTable = showTopHotels && selHotels.size > 0; // après hôtels

  // Table sélection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleRow = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // ------ Select All (sur la vue filtrée) ------
  const headerCheckRef = useRef(null);

  const selectAllInFiltered = (checked, currentFiltered) => {
    setSelectedIds(() => {
      const n = new Set();
      if (checked) {
        for (const it of currentFiltered) n.add(it.id);
      }
      return n;
    });
  };

  const fetchList = useCallback(async () => {
    if (!agence_id || !pageKind) return;
    setLoading(true);
    try {
      const { data } = await api.get("dossiers/to-fiche/", {
        params: { agence: agence_id, kind: pageKind },
      });
      const arr = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : [];
      setItems(arr);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [agence_id, pageKind]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const activeTypeSet = useMemo(() => {
    if (pageKind === "depart") return DEPART_TYPES;
    if (pageKind === "arrivee") return ARRIVEE_TYPES;
    return new Set();
  }, [pageKind]);

  const pageItems = useMemo(() => {
    if (!activeTypeSet.size) return items;
    return items.filter((i) => activeTypeSet.has((i.type || "").trim().toUpperCase()));
  }, [items, activeTypeSet]);

  // ===== Options et filtres en cascade =====

  const dateOptions = useMemo(() => {
    const map = new Map();
    for (const it of pageItems) {
      if (!it.date) continue;
      map.set(it.date, (map.get(it.date) || 0) + 1);
    }
    return [...map.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [pageItems]);

  const itemsAfterDate = useMemo(() => {
    if (!selDates.size) return [];
    return pageItems.filter((i) => selDates.has(i.date || ""));
  }, [pageItems, selDates]);

  const aeroOptions = useMemo(() => {
    const map = new Map();
    for (const it of itemsAfterDate) {
      const code = pageKind === "depart" ? it.provenance || "" : it.destination || "";
      if (!code) continue;
      map.set(code, (map.get(code) || 0) + 1);
    }
    return [...map.entries()]
      .map(([aeroport, count]) => ({ aeroport, count }))
      .sort((a, b) => a.aeroport.localeCompare(b.aeroport));
  }, [itemsAfterDate, pageKind]);

  const itemsAfterAero = useMemo(() => {
    if (!selAero.size) return [];
    const check = (it) => {
      const code = pageKind === "depart" ? it.provenance || "" : it.destination || "";
      return selAero.has(code);
    };
    return itemsAfterDate.filter(check);
  }, [itemsAfterDate, selAero, pageKind]);

  const volOptions = useMemo(() => {
    const m = new Map();
    for (const it of itemsAfterAero) {
      const num = (it.numero_vol || "").trim();
      if (!num) continue;

      const h = normalizeHv(it.horaires);
      if (!m.has(num)) {
        m.set(num, { pax: 0, heure: h });
      }

      const o = m.get(num);
      o.pax += Number(it.pax) || 0;

      if (h && (!o.heure || h < o.heure)) {
        o.heure = h;
      }
    }

    return [...m.entries()]
      .map(([numero_vol, { pax, heure }]) => ({
        numero_vol,
        pax,
        heure,
        label: heure ? `${numero_vol} — ${heure}` : numero_vol,
      }))
      .sort((a, b) => {
        if (!a.heure) return 1;
        if (!b.heure) return -1;
        return a.heure.localeCompare(b.heure);
      });
  }, [itemsAfterAero]);

  const itemsAfterVol = useMemo(() => {
    if (!selVols.size) return [];
    const set = selVols;
    return itemsAfterAero.filter((i) => set.has((i.numero_vol || "").trim()));
  }, [itemsAfterAero, selVols]);

  // ✅ Step: TO filter comes FIRST for zones/hotels cascade
  const itemsAfterTO = useMemo(() => {
    if (!hasAllRightFilters) return [];
    if (!selTOs.size) return itemsAfterVol;
    return itemsAfterVol.filter((i) => selTOs.has(normalizeClientTO(i.client_to)));
  }, [itemsAfterVol, selTOs, hasAllRightFilters]);

  // Groups
  const toGroups = useMemo(() => {
    if (!showTopTO) return [];
    const m = new Map();
    for (const it of itemsAfterVol) {
      const key = normalizeClientTO(it.client_to);
      m.set(key, (m.get(key) || 0) + (Number(it.pax) || 0));
    }
    return [...m.entries()]
      .map(([name, pax]) => ({ name, pax }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [itemsAfterVol, showTopTO]);

  const zoneGroups = useMemo(() => {
    if (!showTopZones) return [];
    const m = new Map();
    for (const it of itemsAfterTO) {
      const zid = it.zone_id != null ? String(it.zone_id) : "";
      if (!zid) continue;
      const zn = (it.zone_nom || "").trim() || "—";
      const prev = m.get(zid) || { id: zid, name: zn, pax: 0 };
      prev.pax += Number(it.pax) || 0;
      if (zn && zn !== "—") prev.name = zn;
      m.set(zid, prev);
    }
    return [...m.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [itemsAfterTO, showTopZones]);

  const itemsAfterZone = useMemo(() => {
    if (!showTopZones || !selZones.size) return [];
    const zid = Array.from(selZones)[0];
    return itemsAfterTO.filter((i) => String(i.zone_id ?? "") === zid);
  }, [itemsAfterTO, selZones, showTopZones]);

  const hotelGroups = useMemo(() => {
    if (!showTopHotels) return [];
    const m = new Map();
    for (const it of itemsAfterZone) {
      const key = it.hotel || "—";
      m.set(key, (m.get(key) || 0) + (Number(it.pax) || 0));
    }
    return [...m.entries()]
      .map(([name, pax]) => ({ name, pax }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsAfterZone, showTopHotels]);

  const obsGroups = useMemo(() => {
    if (!showTopTO) return [];
    const m = new Map();
    for (const it of itemsAfterVol) {
      const o = (it.observation || "").trim() || "—";
      m.set(o, (m.get(o) || 0) + (Number(it.pax) || 0));
    }
    return [...m.entries()]
      .map(([name, pax]) => ({ name, pax }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsAfterVol, showTopTO]);

  const filtered = useMemo(() => {
    if (!showTable) return [];

    return itemsAfterZone.filter((i) => {
      if (selHotels.size && !selHotels.has(i.hotel || "—")) return false;

      const obsKey = (i.observation || "").trim() || "—";
      if (selObs.size && !selObs.has(obsKey)) return false;

      return true;
    });
  }, [itemsAfterZone, selHotels, selObs, showTable]);

  // ===== Resets (cascade) =====
  const resetAfterDate = () => {
    setSelAero(new Set());
    setSelVols(new Set());
    setSelTOs(new Set());
    setSelZones(new Set());
    setSelHotels(new Set());
    setSelObs(new Set());
    setSelectedIds(new Set());
  };

  const resetAfterAero = () => {
    setSelVols(new Set());
    setSelTOs(new Set());
    setSelZones(new Set());
    setSelHotels(new Set());
    setSelObs(new Set());
    setSelectedIds(new Set());
  };

  const resetAfterVols = () => {
    setSelTOs(new Set());
    setSelZones(new Set());
    setSelHotels(new Set());
    setSelObs(new Set());
    setSelectedIds(new Set());
  };

  const resetAfterTO = () => {
    setSelZones(new Set());
    setSelHotels(new Set());
    setSelectedIds(new Set());
  };

  const resetAfterZone = () => {
    setSelHotels(new Set());
    setSelectedIds(new Set());
  };

  // ===== Restore / cascade guards =====
  const isRestoringRef = useRef(false);
  const skipCascadeOnceRef = useRef(false);

  const setKey = useCallback((s) => Array.from(s || []).join("|"), []);
  const prevDatesKeyRef = useRef("");
  const prevAeroKeyRef = useRef("");
  const prevVolsKeyRef = useRef("");

  // ✅ sessionStorage key (solide même avec remount/back/refresh)
  const storageKey = useMemo(() => {
    if (!agence_id || !pageKind) return null;
    return `fm_filters_${agence_id}_${pageKind}`;
  }, [agence_id, pageKind]);

const applyRestore = useCallback(
  (restore) => {
    if (!restore) return false;

    isRestoringRef.current = true;
    skipCascadeOnceRef.current = true;

    // ✅ trim to avoid "TGB " mismatch
    const sDates = new Set((restore.selDates || []).map((x) => String(x).trim()).filter(Boolean));
    const sAero  = new Set((restore.selAero  || []).map((x) => String(x).trim()).filter(Boolean));
    const sVols  = new Set((restore.selVols  || []).map((x) => String(x).trim()).filter(Boolean));

    const sTOs    = new Set((restore.selTOs    || []).map((x) => String(x).trim()).filter(Boolean));
    const sZones  = new Set((restore.selZones  || []).map((x) => String(x).trim()).filter(Boolean));
    const sHotels = new Set((restore.selHotels || []).map((x) => String(x).trim()).filter(Boolean));
    const sObs    = new Set((restore.selObs    || []).map((x) => String(x).trim()).filter(Boolean));

    // ✅ Step 1: Date first
    setSelDates(sDates);

    // sync prev keys NOW (avoid date reset)
    prevDatesKeyRef.current = setKey(sDates);

    // ✅ Step 2: Aero after 1 tick
    setTimeout(() => {
      setSelAero(sAero);
      prevAeroKeyRef.current = setKey(sAero);

      // ✅ Step 3: Vols after another tick
      setTimeout(() => {
        setSelVols(sVols);
        prevVolsKeyRef.current = setKey(sVols);

        // restore other top filters (optional but you already want it)
        setSelTOs(sTOs);
        setSelZones(sZones);
        setSelHotels(sHotels);
        setSelObs(sObs);

        // ✅ release guards after everything is applied
        setTimeout(() => {
          isRestoringRef.current = false;
          skipCascadeOnceRef.current = false;
        }, 0);
      }, 0);
    }, 0);

    return true;
  },
  [setKey]
);


  // ✅ Restore from navigate(state.restoreFilters) OR sessionStorage fallback
  useEffect(() => {
    // 1) priorité : restoreFilters via navigation state
    const restoreFromNav = location?.state?.restoreFilters;
    if (restoreFromNav) {
      // sauvegarde aussi en sessionStorage (sécurité)
      if (storageKey) {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(restoreFromNav));
        } catch (e) {
          // ignore
        }
      }

      applyRestore(restoreFromNav);

      // clean navigation state
      navigate(`${location.pathname}${location.search || ""}`, { replace: true, state: {} });
      return;
    }

    // 2) fallback sessionStorage (cas: navigate(-1), remount, refresh)
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // si on a déjà des filtres actifs, on ne force pas
      const hasSomeAlready = selDates.size || selAero.size || selVols.size;
      if (hasSomeAlready) return;
      applyRestore(parsed);
    } catch (e) {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.state?.restoreFilters, storageKey]);

  // ✅ When date changes -> reset downstream (but NOT during restore)
  useEffect(() => {
    const key = setKey(selDates);

    if (skipCascadeOnceRef.current || isRestoringRef.current) {
      prevDatesKeyRef.current = key;
      return;
    }

    if (prevDatesKeyRef.current === "" && key === "") {
      prevDatesKeyRef.current = key;
      return;
    }

    if (!selDates.size) {
      resetAfterDate();
      prevDatesKeyRef.current = key;
      return;
    }

    if (key !== prevDatesKeyRef.current) {
      resetAfterDate();
    }

    prevDatesKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDates, setKey]);

  // ✅ When aero changes -> reset downstream (but NOT during restore)
  useEffect(() => {
    const key = setKey(selAero);

    if (skipCascadeOnceRef.current || isRestoringRef.current) {
      prevAeroKeyRef.current = key;
      return;
    }

    if (prevAeroKeyRef.current === "" && key === "") {
      prevAeroKeyRef.current = key;
      return;
    }

    if (!selAero.size) {
      resetAfterAero();
      prevAeroKeyRef.current = key;
      return;
    }

    if (key !== prevAeroKeyRef.current) {
      resetAfterAero();
    }

    prevAeroKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selAero, setKey]);

  // ✅ When vols change -> reset downstream (but NOT during restore)
  useEffect(() => {
    const key = setKey(selVols);

    if (skipCascadeOnceRef.current || isRestoringRef.current) {
      prevVolsKeyRef.current = key;
      return;
    }

    if (prevVolsKeyRef.current === "" && key === "") {
      prevVolsKeyRef.current = key;
      return;
    }

    if (!selVols.size) {
      resetAfterVols();
      prevVolsKeyRef.current = key;
      return;
    }

    if (key !== prevVolsKeyRef.current) {
      resetAfterVols();
    }

    prevVolsKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selVols, setKey]);

  // ✅ Enforce: Zone = 1 seule (single) + reset hotels
  const onToggleZoneSingle = (zid) => {
    setSelZones((prev) => {
      const n = new Set();
      if (!prev.has(zid)) n.add(zid);
      return n;
    });
    resetAfterZone();
  };

  // ✅ When TO changes -> reset zone/hotels (but NOT during restore)
  useEffect(() => {
    if (skipCascadeOnceRef.current || isRestoringRef.current) return;
    resetAfterTO();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKey(selTOs)]);

  // ✅ Auto-select ALL rows in table (always)
  useEffect(() => {
    if (!filtered.length) {
      setSelectedIds(new Set());
      return;
    }
    const n = new Set();
    for (const it of filtered) n.add(it.id);
    setSelectedIds(n);
  }, [filtered]);

  const allInViewSelected = useMemo(() => {
    if (!filtered.length) return false;
    return filtered.every((it) => selectedIds.has(it.id));
  }, [filtered, selectedIds]);

  const someInViewSelected = useMemo(() => {
    if (!filtered.length) return false;
    return filtered.some((it) => selectedIds.has(it.id));
  }, [filtered, selectedIds]);

  useEffect(() => {
    if (!headerCheckRef.current) return;
    headerCheckRef.current.indeterminate = !allInViewSelected && someInViewSelected;
  }, [allInViewSelected, someInViewSelected]);

  const selectedRows = useMemo(
    () => filtered.filter((it) => selectedIds.has(it.id)),
    [filtered, selectedIds]
  );
  const canProceed = selectedRows.length > 0;

  const paxTotalSelected = useMemo(() => sumPax(selectedRows), [selectedRows]);

  const metaNumeroVol = useMemo(() => {
    if (selVols.size === 1) return Array.from(selVols)[0];
    const found = selectedRows.find((r) => (r.numero_vol || "").trim());
    return found?.numero_vol || "";
  }, [selVols, selectedRows]);

  const metaAeroport = useMemo(() => {
    const pick = (r) => (pageKind === "depart" ? r.provenance || "" : r.destination || "");
    const found = selectedRows.find((r) => pick(r));
    return found ? pick(found) : "";
  }, [selectedRows, pageKind]);

  const metaDate = useMemo(() => {
    const dates = selectedRows.map((r) => r.date).filter(Boolean).sort();
    return dates[0] || isoToday();
  }, [selectedRows]);

  // ✅ IMPORTANT : on ne crée PAS de fiches ici.
  const onNext = async () => {
    if (!canProceed) return;

    // ✅ Sauvegarde filtre (pour retour stable même si history/state saute)
    const snapshot = {
      selDates: Array.from(selDates),
      selAero: Array.from(selAero),
      selVols: Array.from(selVols),
      selTOs: Array.from(selTOs),
      selZones: Array.from(selZones),
      selHotels: Array.from(selHotels),
      selObs: Array.from(selObs),
    };
    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
      } catch (e) {
        // ignore
      }
    }

    const dossierIds = selectedRows
      .map((r) => r.dossier_id || r.id_dossier || r.dossier || null)
      .filter(Boolean);

    navigate(`/agence/${agence_id}/fiche-mouvement/ordre`, {
      state: {
        items: selectedRows,
        meta: {
          numero_vol: metaNumeroVol,
          heure_vol: normalizeHv(selectedRows[0]?.horaires) || "",
          aeroport: metaAeroport,
          date: metaDate,
          kind: pageKind,
          fiche_ids: [],
          agence_id,
          dossier_ids: dossierIds,
        },

        // ✅ retour exact vers la liste
        returnTo: `${location.pathname}${location.search || ""}`,

        // ✅ restore des filtres step-by-step
        restoreFilters: snapshot,
      },
    });
  };

  const title =
    pageKind === "depart"
      ? "🛫 Mes départs"
      : pageKind === "arrivee"
      ? "🛬 Mes arrivées"
      : "📋 Fiches de mouvement";

  const emptyMsg =
    pageKind === "depart"
      ? "Aucun départ trouvé."
      : pageKind === "arrivee"
      ? "Aucune arrivée trouvée."
      : "Aucune fiche trouvée.";

  return (
    <div className="fm-shell">
      <style>{`
        .fm-group-item{display:flex;align-items:flex-start;margin-bottom:8px}
        .fm-group-check{margin-top:4px}
        .fm-group-label{
          display:flex; align-items:flex-start; justify-content:space-between;
          gap:10px; width:100%; min-width:0; cursor:pointer;
        }
        .fm-group-text{
          flex:1 1 auto; min-width:0;
          white-space:normal; overflow:visible; text-overflow:clip;
          word-break:break-word; line-height:1.15;
        }
        .fm-group-pax{flex:0 0 auto; white-space:nowrap}
      `}</style>

      <main className="fm-main">
        <div className="d-flex justify-content-end align-items-center mb-3">
          <div className="d-flex gap-2">
            {pageKind && (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() =>
                  navigate(`/agence/${agence_id}/fiche-mouvement/nouveau?kind=${pageKind}`)
                }
              >
                Nouvelle Fiche de mouvement Manuelle
              </button>
            )}

            <button
              className="btn btn-primary"
              onClick={onNext}
              disabled={!canProceed}
              title={!canProceed ? "Sélectionne au moins une ligne" : ""}
            >
              Suivant
            </button>
          </div>
        </div>

        <h2 className="mb-2">{title}</h2>

        {/* Groupes haut (AFFICHAGE CONDITIONNEL EXACT) */}
        <div className="row g-3 mb-3">
          {/* CLIENT/TO : après vols */}
          {showTopTO && (
            <div className="col-md-3">
              <div className="card h-100">
                <div className="card-header fw-bold">CLIENT/TO</div>
                <div className="card-body p-3" style={{ maxHeight: 220, overflow: "auto" }}>
                  {toGroups.length ? (
                    toGroups.map((g) => (
                      <GroupItem
                        key={`to_${g.name}`}
                        id={`to_${g.name}`}
                        checked={selTOs.has(g.name)}
                        onToggle={() => toggleSet(setSelTOs, g.name)}
                        title={g.name}
                        pax={g.pax}
                      />
                    ))
                  ) : (
                    <div className="text-muted small">—</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ZONES : après sélection TO */}
          {showTopZones && (
            <div className="col-md-3">
              <div className="card h-100">
                <div className="card-header fw-bold">ZONES</div>
                <div className="card-body p-3" style={{ maxHeight: 220, overflow: "auto" }}>
                  {zoneGroups.length ? (
                    zoneGroups.map((g) => {
                      const zid = String(g.id);
                      return (
                        <GroupItem
                          key={`zone_${zid}`}
                          id={`zone_${zid}`}
                          checked={selZones.has(zid)}
                          onToggle={() => onToggleZoneSingle(zid)} // ✅ SINGLE zone
                          title={g.name}
                          pax={g.pax}
                        />
                      );
                    })
                  ) : (
                    <div className="text-muted small">—</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* HÔTELS : après sélection ZONE */}
          {showTopHotels && (
            <div className="col-md-3">
              <div className="card h-100">
                <div className="card-header fw-bold">HÔTELS</div>
                <div className="card-body p-3" style={{ maxHeight: 220, overflow: "auto" }}>
                  {hotelGroups.length ? (
                    hotelGroups.map((g) => (
                      <GroupItem
                        key={`hotel_${g.name}`}
                        id={`hotel_${g.name}`}
                        checked={selHotels.has(g.name)}
                        onToggle={() => toggleSet(setSelHotels, g.name)}
                        title={g.name}
                        pax={g.pax}
                      />
                    ))
                  ) : (
                    <div className="text-muted small">—</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* OBSERVATION : après vols */}
          {showTopTO && (
            <div className="col-md-3">
              <div className="card h-100">
                <div className="card-header fw-bold">OBSERVATION</div>
                <div className="card-body p-3" style={{ maxHeight: 220, overflow: "auto" }}>
                  {obsGroups.length ? (
                    obsGroups.map((g) => (
                      <GroupItem
                        key={`obs_${g.name}`}
                        id={`obs_${g.name}`}
                        checked={selObs.has(g.name)}
                        onToggle={() => toggleSet(setSelObs, g.name)}
                        title={g.name}
                        pax={g.pax}
                      />
                    ))
                  ) : (
                    <div className="text-muted small">—</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ✅ Table seulement après HÔTELS */}
        {showTable && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="m-0">Liste des fiches</h5>
              <div className="fw-bold">PAX Total : {paxTotalSelected}</div>
            </div>

            <div className="table-responsive">
              <table className="table table-striped table-hover align-middle">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 44 }}>
                      <input
                        ref={headerCheckRef}
                        type="checkbox"
                        className="form-check-input"
                        checked={allInViewSelected}
                        onChange={(e) => selectAllInFiltered(e.target.checked, filtered)}
                        title="Tout sélectionner (filtre courant)"
                      />
                    </th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Hôtel</th>
                    <th>Titulaire</th>
                    <th>Observation</th>
                    <th>Pax</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading &&
                    filtered.map((it) => {
                      const displayHotel = it.hotel || it.zone_nom || it.titulaire || "—";
                      return (
                        <tr
                          key={it.id}
                          className={selectedIds.has(it.id) ? "table-active" : ""}
                          onClick={() => toggleRow(it.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={selectedIds.has(it.id)}
                              onChange={() => toggleRow(it.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td>
                            <BadgeType t={it.type} />
                          </td>
                          <td>{it.date || "—"}</td>
                          <td title={displayHotel}>{displayHotel}</td>
                          <td title={it.titulaire || "—"}>{it.titulaire || "—"}</td>
                          <td title={(it.observation || "").trim() || "—"}>
                            {(it.observation || "").trim() || "—"}
                          </td>
                          <td>{it.pax ?? "—"}</td>
                        </tr>
                      );
                    })}
                  {loading && (
                    <tr>
                      <td colSpan={7} className="text-center py-4">
                        Chargement…
                      </td>
                    </tr>
                  )}
                  {!loading && !filtered.length && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        {emptyMsg}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* si pas encore au step hôtel -> message simple */}
        {!showTable && (
          <div className="text-muted small mt-2">
            {!hasAllRightFilters
              ? "Sélectionne d'abord : Date → Aéroport → Vol(s)."
              : selTOs.size === 0
              ? "Sélectionne un CLIENT/TO pour afficher les zones."
              : selZones.size === 0
              ? "Sélectionne une zone pour afficher les hôtels."
              : "Sélectionne au moins un hôtel pour afficher la liste."}
          </div>
        )}
      </main>

      <RightRail
        dateOptions={dateOptions}
        aeroOptions={aeroOptions}
        volOptions={volOptions}
        selDates={selDates}
        setSelDates={setSelDates}
        selAero={selAero}
        setSelAero={setSelAero}
        selVols={selVols}
        setSelVols={setSelVols}
        loading={loading}
        pageKind={pageKind}
      />
    </div>
  );
}
