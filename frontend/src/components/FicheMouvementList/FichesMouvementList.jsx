// src/components/FicheMouvementList/FichesMouvementList.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import api from "../../api";
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
  onResetAll,
  loading,
  pageKind,
}) {
  const showAero = selDates.size > 0;
  const showVols = showAero && selAero.size > 0;

  const clearDates = () => setSelDates(new Set());
  const clearAero = () => setSelAero(new Set());
  const clearVols = () => setSelVols(new Set());

  const aeroLabel =
    pageKind === "depart"
      ? "Aéroports (provenance)"
      : "Aéroports (destination)";

  return (
    <aside className="fm-right-rail">


      {/* Dates */}
      <div className="mb-3">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <label className="form-label m-0">Date</label>
          <button className="btn btn-link btn-sm p-0" onClick={clearDates}>
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
                    onChange={() => toggleSet(setSelDates, d.date)}
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

      {/* Aéroports */}
      {showAero && (
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <label className="form-label m-0">{aeroLabel}</label>
            <button className="btn btn-link btn-sm p-0" onClick={clearAero}>
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
                      onChange={() => toggleSet(setSelAero, a.aeroport)}
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

      {/* Vols */}
      {showVols && (
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <label className="form-label m-0">Vols</label>
            <button className="btn btn-link btn-sm p-0" onClick={clearVols}>
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
  const { agence_id } = useParams();
  const pageKind = usePageKind(); // 'depart' | 'arrivee' | null

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Groupes haut (multi-choix)
  const [selTOs, setSelTOs] = useState(new Set());
  const [selZones, setSelZones] = useState(new Set()); // stores zone_id as string
  const [selHotels, setSelHotels] = useState(new Set());
  const [selObs, setSelObs] = useState(new Set());

  // Filtres cascade
  const [selDates, setSelDates] = useState(new Set());
  const [selAero, setSelAero] = useState(new Set());
  const [selVols, setSelVols] = useState(new Set());

  const hasAllRightFilters = useMemo(
    () => selDates.size > 0 && selAero.size > 0 && selVols.size > 0,
    [selDates, selAero, selVols]
  );

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
    setSelectedIds((prev) => {
      if (checked) {
        const n = new Set(prev);
        for (const it of currentFiltered) n.add(it.id);
        return n;
      } else {
        const n = new Set(prev);
        for (const it of currentFiltered) n.delete(it.id);
        return n;
      }
    });
  };

  const fetchList = useCallback(async () => {
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
    return items.filter((i) =>
      activeTypeSet.has((i.type || "").trim().toUpperCase())
    );
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
      const code =
        pageKind === "depart" ? it.provenance || "" : it.destination || "";
      if (!code) continue;
      map.set(code, (map.get(code) || 0) + 1);
    }
    return [...map.entries()]
      .map(([aeroport, count]) => ({ aeroport, count }))
      .sort((a, b) => a.aeroport.localeCompare(b.aeroport));
  }, [itemsAfterDate, pageKind]);

  const itemsAfterAero = useMemo(() => {
    if (!selAero.size) return itemsAfterDate;
    const check = (it) => {
      const code =
        pageKind === "depart" ? it.provenance || "" : it.destination || "";
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
    if (!selVols.size) return itemsAfterAero;
    const set = selVols;
    return itemsAfterAero.filter((i) => set.has((i.numero_vol || "").trim()));
  }, [itemsAfterAero, selVols]);

  const filtered = useMemo(() => {
    if (!hasAllRightFilters) return [];

    return itemsAfterVol.filter((i) => {
      if (selTOs.size && !selTOs.has(i.client_to || "—")) return false;

      const zid = i.zone_id != null ? String(i.zone_id) : "—";
      if (selZones.size && !selZones.has(zid)) return false;

      if (selHotels.size && !selHotels.has(i.hotel || "—")) return false;

      const obsKey = (i.observation || "").trim() || "—";
      if (selObs.size && !selObs.has(obsKey)) return false;

      return true;
    });
  }, [itemsAfterVol, selTOs, selZones, selHotels, selObs, hasAllRightFilters]);

  const toGroups = useMemo(() => {
    const m = new Map();
    for (const it of itemsAfterVol) {
      const key = it.client_to || "—";
      m.set(key, (m.get(key) || 0) + (Number(it.pax) || 0));
    }
    return [...m.entries()]
      .map(([name, pax]) => ({ name, pax }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsAfterVol]);

  const zoneGroups = useMemo(() => {
    const m = new Map();
    for (const it of itemsAfterVol) {
      const zid = it.zone_id != null ? String(it.zone_id) : "";
      if (!zid) continue;
      const zn = (it.zone_nom || "").trim() || "—";
      const prev = m.get(zid) || { id: zid, name: zn, pax: 0 };
      prev.pax += Number(it.pax) || 0;
      if (zn && zn !== "—") prev.name = zn;
      m.set(zid, prev);
    }
    return [...m.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [itemsAfterVol]);

  const hotelGroups = useMemo(() => {
    const m = new Map();
    for (const it of itemsAfterVol) {
      const key = it.hotel || "—";
      m.set(key, (m.get(key) || 0) + (Number(it.pax) || 0));
    }
    return [...m.entries()]
      .map(([name, pax]) => ({ name, pax }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsAfterVol]);

  const obsGroups = useMemo(() => {
    const m = new Map();
    for (const it of itemsAfterVol) {
      const o = (it.observation || "").trim() || "—";
      m.set(o, (m.get(o) || 0) + (Number(it.pax) || 0));
    }
    return [...m.entries()]
      .map(([name, pax]) => ({ name, pax }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsAfterVol]);

  const resetTopGroups = () => {
    setSelTOs(new Set());
    setSelZones(new Set());
    setSelHotels(new Set());
    setSelObs(new Set());
  };
  const resetRight = () => {
    setSelDates(new Set());
    setSelAero(new Set());
    setSelVols(new Set());
  };
  const resetAll = () => {
    resetTopGroups();
    resetRight();
  };

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
    headerCheckRef.current.indeterminate =
      !allInViewSelected && someInViewSelected;
  }, [allInViewSelected, someInViewSelected]);

  useEffect(() => {
    if (!hasAllRightFilters || !filtered.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds((prev) => {
      if (prev.size > 0) return prev;
      const n = new Set();
      for (const it of filtered) n.add(it.id);
      return n;
    });
  }, [filtered, hasAllRightFilters]);

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
    const pick = (r) =>
      pageKind === "depart" ? r.provenance || "" : r.destination || "";
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
          fiche_ids: [], // ✅ on ne les a pas encore
          agence_id,
          dossier_ids: dossierIds, // ✅ on passe les dossiers pour créer plus tard
        },
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
            {/* <button className="btn btn-outline-secondary" onClick={resetAll} disabled={loading}>
              Réinitialiser
            </button> */}

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

        {/* Groupes haut */}
        <div className="row g-3 mb-3">
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
                        onToggle={() => toggleSet(setSelZones, zid)}
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
        </div>

        {/* Bandeau PAX Total basé sur la sélection */}
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h5 className="m-0">Liste des fiches</h5>
          <div className="fw-bold">PAX Total : {paxTotalSelected}</div>
        </div>

        {/* Tableau */}
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
                      <td><BadgeType t={it.type} /></td>
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
                  <td colSpan={7} className="text-center py-4">Chargement…</td>
                </tr>
              )}
              {!loading && !filtered.length && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">{emptyMsg}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
        onResetAll={resetAll}
        loading={loading}
        pageKind={pageKind}
      />
    </div>
  );
}
