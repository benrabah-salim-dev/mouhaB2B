// src/components/FicheMouvement.js
import React, { useState, useEffect, useMemo, useContext } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api";
import { AuthContext } from "../context/AuthContext";

/* =========================================================
   Helpers
========================================================= */

const getPaxDisplay = (d, t) => `${getPaxForType(d, t)} pax`;

const rowKeyOf = (r, i) => String(r?.id ?? r?.reference ?? `row_${i}`);

const safeDate = (v) => { try { const d = new Date(v); return isNaN(d.getTime()) ? null : d; } catch { return null; } };
const normalizeDA = (val) => {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (["D","DEPART","DEPARTURE","S","SALIDA","P","PARTENZA"].includes(v)) return "D";
  if (["A","ARRIVEE","ARRIVAL","LLEGADA","L"].includes(v)) return "A";
  return null;
};
const deriveType = (d) => {
  if (!d || typeof d !== "object") return null;
  const hasDepart = !!d.heure_depart, hasArrivee = !!d.heure_arrivee;
  if (hasDepart && !hasArrivee) return "D";
  if (!hasDepart && hasArrivee) return "A";
  return normalizeDA(d._type || d.type || d.da);
};
const labelType = (t) => (t === "D" ? "Départ" : t === "A" ? "Arrivée" : "");
const getDateKey = (d) => {
  if (!d || typeof d !== "object") return "";
  const dtStr = d.heure_depart || d.heure_arrivee;
  const dt = dtStr ? safeDate(dtStr) : null;
  if (!dt) return "";
  const y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,"0"), day = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const pickTO = (d) => {
  if (!d || typeof d !== "object") return "";
  if (d._to) return String(d._to).trim();
  const to = d.tour_operateur ?? d.to ?? d.t_o ?? d.TO ?? d["T.O."] ?? d["CLIENT/ TO"] ?? d.client_to ?? "";
  return String(to || "").trim();
};
const pickRefTO = (d) => {
  if (!d || typeof d !== "object") return "";
  if (d._ref_to) return String(d._ref_to).trim();
  const rto = d.ref_to ?? d.ref_t_o ?? d["Ref.T.O."] ?? d.reference_to ?? d["REF T.O"] ?? d["Ref TO"] ?? d["Ntra.Ref"] ?? "";
  return String(rto || "").trim();
};
const formatShortTime = (iso) => { const d = safeDate(iso); return d ? d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : ""; };
const getFlightNo = (d, t) => {
  if (!d) return "";
  if (t === "A") return d.num_vol_arrivee || d.num_vol || d.vol || "";
  if (t === "D") return d.num_vol_retour || d.num_vol || d.vol || "";
  return d.num_vol_arrivee || d.num_vol_retour || d.num_vol || d.vol || "";
};
const getFlightTime = (d, t) => (t === "A" ? d.heure_arrivee || "" : t === "D" ? d.heure_depart || "" : d.heure_arrivee || d.heure_depart || "");
const getPaxForType = (d, t) => (t === "A" ? Number(d.nombre_personnes_arrivee || 0) : t === "D" ? Number(d.nombre_personnes_retour || 0) : Number(d.nombre_personnes_arrivee || 0) + Number(d.nombre_personnes_retour || 0));
const formatRefFromDateKey = (dateKey) => (dateKey ? `M_${dateKey}` : null);
const normalizeRows = (rows) => rows.map((d) => ({ ...d, _type: deriveType(d), _to: d?._to ?? pickTO(d), _ref_to: d?._ref_to ?? pickRefTO(d) }));

// Heuristique affichage noms pax
const getPassengerLabel = (row, t) => {
  const candidates = [
    row.pax_names, row.passengers, row.passagers, row.noms, row.names, row.clients_list, row.clients, row.client_names, row.liste_noms
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (Array.isArray(c) && c.length) return c.join(", ");
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const pax = getPaxForType(row, t);
  if (pax > 1) return `PAX × ${pax}`;
  const nom = row.nom || row.last_name || "";
  const prenom = row.prenom || row.first_name || "";
  const full = `${prenom} ${nom}`.trim();
  return full || "PAX × 1";
};

// Format pour résumé : montre jusqu’à 3 noms puis +N
const summarizeList = (arr = []) => {
  const cleaned = arr.map((s) => String(s || "").trim()).filter(Boolean);
  if (!cleaned.length) return "—";
  if (cleaned.length <= 3) return cleaned.join(", ");
  return `${cleaned.slice(0, 3).join(", ")} +${cleaned.length - 3}`;
};

/* =========================================================
   Petits composants
========================================================= */
function Section({ title, disabled, children, right }) {
  return (
    <div className={`fm-sec ${disabled ? "is-disabled" : ""}`}>
      <div className="fm-sec-head">
        <h3>{title}</h3>
        {right}
      </div>
      <div className="fm-sec-body">{children}</div>
      {disabled && <div className="fm-sec-mask" />}
    </div>
  );
}
function Chip({ active, children, onClick, title }) {
  return (
    <button type="button" className={`fm-chip ${active ? "is-active" : ""}`} onClick={onClick} title={title || ""}>
      {children}
    </button>
  );
}
function TopSummaryBar({
  tCode, dateSel, airportSel, flightsSel, tosSel, villesSel, hotelsSel,
  selectedCount, selectedPax, movementName, setMovementName, onCreate, creating
}) {
  const joinFull = (arr=[]) => arr.map(s => String(s||"").trim()).filter(Boolean);
  const titleJoin = (arr) => joinFull(arr).join(", ");

  const KV = ({ label, value, title }) => (
    <div className="kv">
      <div className="kv-label">{label}</div>
      <div className="kv-value" title={title}>{value || "—"}</div>
    </div>
  );

  return (
    <div className="fm-top-summary improved">
      <div className="fm-top-summary-grid">
        <KV label="Type" value={tCode ? labelType(tCode) : "—"} />
        <KV label="Date" value={dateSel} />
        <KV label="Aéroport" value={airportSel} />

        <KV
          label="Vols"
          value={joinFull(flightsSel).join(" · ")}
          title={titleJoin(flightsSel)}
        />
        <KV
          label="TO"
          value={joinFull(tosSel).join(" · ")}
          title={titleJoin(tosSel)}
        />
        <KV
          label="Zones"
          value={joinFull(villesSel).join(" · ")}
          title={titleJoin(villesSel)}
        />
        <KV
          label="Hôtels"
          value={joinFull(hotelsSel).join(" · ")}
          title={titleJoin(hotelsSel)}
        />

        <div className="kv kpi">
          <div className="kpi-pair">
            <div className="kpi-num" aria-label="dossiers">{selectedCount}</div>
            <div className="kpi-label">dossiers</div>
          </div>
          <div className="kpi-sep" />
          <div className="kpi-pair">
            <div className="kpi-num" aria-label="pax">{selectedPax}</div>
            <div className="kpi-label">pax</div>
          </div>
        </div>
      </div>

      <div className="fm-top-summary-actions">
        <input
          className="form-control form-control-sm"
          placeholder={
            tCode && dateSel && airportSel
              ? `${labelType(tCode)} ${airportSel} ${dateSel}`
              : "Nom de la fiche (optionnel)"
          }
          value={movementName}
          onChange={(e) => setMovementName(e.target.value)}
        />
        <button className="btn btn-success btn-sm" onClick={onCreate} disabled={creating || !selectedCount}>
          {creating ? "Création..." : `Créer (${selectedCount})`}
        </button>
      </div>
    </div>
  );
}


/* =========================================================
   Page
========================================================= */
export default function FicheMouvement() {
  const navigate = useNavigate();
  const params = useParams();
  const { user: ctxUser } = useContext(AuthContext) || {};
  const localUser = JSON.parse(localStorage.getItem("userData") || "{}");
  const user = ctxUser || localUser;
  const currentAgenceId = params.agence_id || user?.agence_id || "";
  const LS_KEY = currentAgenceId ? `dossiersImportes:${currentAgenceId}` : "dossiersImportes";

  // Données importées
  const [rows, setRows] = useState([]);

  // Filtres
  const [typeSel, setTypeSel] = useState(null); // "arrivee" | "depart" | null
  const [dateSel, setDateSel] = useState("");
  const [airportSel, setAirportSel] = useState("");
  const [flightsSel, setFlightsSel] = useState([]); // multi
  const [tosSel, setTosSel] = useState([]); // multi
  const [villesSel, setVillesSel] = useState([]); // multi
  const [hotelsSel, setHotelsSel] = useState([]); // multi

  // Sélection fine des dossiers (pax)
  
  const [selectedDossierIds, setSelectedDossierIds] = useState(() => new Set());

const [openObs, setOpenObs] = useState(() => new Set());
const toggleObs = (key) => {
  setOpenObs(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
};


  // UI
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [movementName, setMovementName] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("fr");
  const [languages, setLanguages] = useState([]);

  const tCode = typeSel === "arrivee" ? "A" : typeSel === "depart" ? "D" : null;

  /* Langues */
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("languages/");
        const langs = Array.isArray(res.data) ? res.data : [];
        setLanguages(langs);
        if (langs.length && !langs.find((l) => l.code === selectedLanguage)) {
          setSelectedLanguage(langs[0].code);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Reload import */
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const normalized = normalizeRows(parsed);
          setRows(normalized);
          setMsg(`Import rechargé (${normalized.length}) pour l'agence ${currentAgenceId || "—"}.`);
        }
      } catch {}
    }
  }, [LS_KEY, currentAgenceId]);

  /* Import fichier */
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setMsg("");

    // reset
    setTypeSel(null); setDateSel(""); setAirportSel("");
    setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]);
    setSelectedDossierIds(new Set());

    const formData = new FormData();
    formData.append("file", file);
    formData.append("agence", currentAgenceId);
    formData.append("langue", selectedLanguage);

    try {
      const res = await api.post("importer-dossier/", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const list = Array.isArray(res.data?.dossiers) ? res.data.dossiers : [];
      const normalized = normalizeRows(list);
      localStorage.setItem(LS_KEY, JSON.stringify(normalized));
      setRows(normalized);

      const total = normalized.length, crees = res.data?.dossiers_crees?.length || 0, maj = res.data?.dossiers_mis_a_jour?.length || 0;
      setMsg(total ? `Import OK — ${crees} créé(s), ${maj} MAJ, total ${total}.` : "Aucune ligne exploitable.");
    } catch {
      setMsg("Erreur lors de l'importation.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const clearImport = () => {
    localStorage.removeItem(LS_KEY);
    setRows([]);
    setTypeSel(null); setDateSel(""); setAirportSel("");
    setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]);
    setSelectedDossierIds(new Set());
    setMsg("Import local vidé.");
  };

  /* =========================
     Options dépendantes
  ========================= */
  const dateOptions = useMemo(() => {
    if (!rows.length) return [];
    const set = new Set();
    (tCode ? rows.filter((r) => r._type === tCode) : rows).forEach((r) => { const dk = getDateKey(r); if (dk) set.add(dk); });
    return Array.from(set).sort();
  }, [rows, tCode]);

  const airportOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel) return [];
    const set = new Set();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .forEach((r) => { const val = tCode === "D" ? (r.aeroport_depart || "").trim() : (r.aeroport_arrivee || "").trim(); if (val) set.add(val); });
    return Array.from(set).sort();
  }, [rows, tCode, dateSel]);

  const flightOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel) return [];
    const map = new Map();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel))
      .forEach((r) => {
        const flight = getFlightNo(r, tCode) || "—";
        const tm = getFlightTime(r, tCode);
        const pax = getPaxForType(r, tCode);
        const entry = map.get(flight) || { flight, times: new Set(), pax: 0, count: 0 };
        if (tm) entry.times.add(formatShortTime(tm));
        entry.pax += pax; entry.count += 1; map.set(flight, entry);
      });
    return Array.from(map.values()).map((x) => ({ ...x, times: Array.from(x.times).sort() })).sort((a,b)=>b.pax-a.pax);
  }, [rows, tCode, dateSel, airportSel]);

  const toOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    const map = new Map();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel))
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"))
      .forEach((r) => {
        const to = r._to || ""; if (!to) return;
        const pax = getPaxForType(r, tCode);
        const entry = map.get(to) || { to, pax: 0, count: 0 };
        entry.pax += pax; entry.count += 1; map.set(to, entry);
      });
    return Array.from(map.values()).sort((a,b)=>b.pax-a.pax);
  }, [rows, tCode, dateSel, airportSel, flightsSel]);

  const villeOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel))
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));

    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }

    const map = new Map(); // ville -> {pax,count}
    filtered.forEach((r) => {
      const ville = (r.ville || "").toString().trim() || "—";
      const pax = getPaxForType(r, tCode);
      const entry = map.get(ville) || { ville, pax: 0, count: 0 };
      entry.pax += pax; entry.count += 1;
      map.set(ville, entry);
    });

    return Array.from(map.values()).sort((a,b)=>b.pax-a.pax);
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel]);

  const hotelOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel))
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }
    if (villesSel.length > 0) {
      const sv = new Set(villesSel.map((x)=>String(x).trim()));
      filtered = filtered.filter((r) => sv.has((r.ville || "").toString().trim() || "—"));
    }
    const map = new Map(); // hotel -> {pax,count}
    filtered.forEach((r) => {
      const hotel =
        (typeof r.hotel_nom === "string" && r.hotel_nom) ||
        (typeof r.hotel_name === "string" && r.hotel_name) ||
        (typeof r.hotel === "string" && r.hotel) ||
        (r.hotel && r.hotel.nom) ||
        "(Sans hôtel)";
      const pax = getPaxForType(r, tCode);
      const entry = map.get(hotel) || { hotel, pax: 0, count: 0 };
      entry.pax += pax; entry.count += 1; map.set(hotel, entry);
    });
    return Array.from(map.values()).sort((a,b)=>b.pax-a.pax);
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel, villesSel]);

  /* =========================
     Auto-sélections si 1 seule option
  ========================= */
  useEffect(() => { if (!tCode) return; if (!dateSel && dateOptions.length === 1) setDateSel(dateOptions[0]); }, [tCode, dateOptions, dateSel]);
  useEffect(() => { if (!dateSel) return; if (!airportSel && airportOptions.length === 1) setAirportSel(airportOptions[0]); }, [dateSel, airportOptions, airportSel]);
  useEffect(() => { if (!airportSel) return; if (flightsSel.length === 0 && flightOptions.length === 1) setFlightsSel([flightOptions[0].flight]); }, [airportSel, flightOptions, flightsSel.length]);
  useEffect(() => { if (flightsSel.length === 0) return; if (tosSel.length === 0 && toOptions.length === 1) setTosSel([toOptions[0].to]); }, [flightsSel.length, toOptions, tosSel.length]);
  useEffect(() => { if (tosSel.length === 0) return; if (villesSel.length === 0 && villeOptions.length === 1) setVillesSel([villeOptions[0].ville]); }, [tosSel.length, villeOptions, villesSel.length]);
  useEffect(() => { if (villesSel.length === 0) return; if (hotelsSel.length === 0 && hotelOptions.length === 1) setHotelsSel([hotelOptions[0].hotel]); }, [villesSel.length, hotelOptions, hotelsSel.length]);

  /* =========================
     Dossiers filtrés + regroupement par hôtel
  ========================= */
  const filteredRecords = useMemo(() => {
    if (!tCode || !dateSel || !airportSel) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel));
    if (flightsSel.length > 0) filtered = filtered.filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    if (tosSel.length > 0) { const st = new Set(tosSel); filtered = filtered.filter((r) => r._to && st.has(r._to)); }
    if (villesSel.length > 0) { const sv = new Set(villesSel.map((x)=>String(x).trim())); filtered = filtered.filter((r) => sv.has((r.ville || "").toString().trim() || "—")); }
    if (hotelsSel.length > 0) {
      const sh = new Set(hotelsSel.map((x)=>String(x).trim()));
      filtered = filtered.filter((r) => {
        const hotel =
          (typeof r.hotel_nom === "string" && r.hotel_nom) ||
          (typeof r.hotel_name === "string" && r.hotel_name) ||
          (typeof r.hotel === "string" && r.hotel) ||
          (r.hotel && r.hotel.nom) ||
          "(Sans hôtel)";
        return sh.has(String(hotel).trim());
      });
    }
    return filtered;
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel, villesSel, hotelsSel]);

  // Ids sélectionnés (par défaut, tout coché quand le filtre change)
  useEffect(() => {
    const next = new Set(filteredRecords.map((r) => r.id).filter(Boolean));
    setSelectedDossierIds(next);
  }, [filteredRecords.map((r)=>r.id).join("|")]);

  const groupedByHotel = useMemo(() => {
    const map = new Map(); // hotel -> array(rows)
    filteredRecords.forEach((r) => {
      const hotel =
        (typeof r.hotel_nom === "string" && r.hotel_nom) ||
        (typeof r.hotel_name === "string" && r.hotel_name) ||
        (typeof r.hotel === "string" && r.hotel) ||
        (r.hotel && r.hotel.nom) ||
        "(Sans hôtel)";
      const list = map.get(hotel) || [];
      list.push(r);
      map.set(hotel, list);
    });
    return Array.from(map.entries()).sort((a,b)=>b[1].length - a[1].length);
  }, [filteredRecords]);

  // KPIs sélection
  const selectedCount = Array.from(selectedDossierIds).length;
  const selectedPax = useMemo(
    () => filteredRecords.filter((r) => selectedDossierIds.has(r.id)).reduce((acc, r) => acc + getPaxForType(r, tCode), 0),
    [filteredRecords, selectedDossierIds, tCode]
  );

  /* Création */
  const onCreate = async () => {
    setMsg("");
    if (!currentAgenceId) { setMsg("Agence inconnue. Ouvrez via /agence/:agence_id/fiche-mouvement."); return; }
    if (!tCode || !dateSel || !airportSel) { setMsg("Complétez Type, Date et Aéroport."); return; }
    if (selectedCount === 0) { setMsg("Aucun dossier sélectionné."); return; }

    const selectedRows = filteredRecords.filter((r) => selectedDossierIds.has(r.id));
    const payload = {
      agence: currentAgenceId,
      name: movementName || null,
      type: tCode,
      date: dateSel,
      aeroport: airportSel,
      dossier_ids: selectedRows.map((r) => r.id).filter(Boolean),
      reference: formatRefFromDateKey(dateSel),
      tour_operateurs: Array.from(new Set(selectedRows.map((r) => r._to).filter(Boolean))),
      villes: Array.from(new Set(selectedRows.map((r) => (r.ville || "").trim() || "—").filter(Boolean))),
    };

    try {
      setCreating(true);
      await api.post("creer-fiche-mouvement/", payload);
      navigate(`/agence/${currentAgenceId}/fiches-mouvement`, { replace: true });
    } catch (err) {
      const status = err?.response?.status; const data = err?.response?.data || {};
      if (status === 409) {
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        const hint = suggestions.length ? `\nSuggestions: ${suggestions.join(", ")}` : "";
        const newRef = window.prompt((data.message || "Référence déjà utilisée.") + hint, payload.reference || "");
        if (newRef && newRef.trim()) {
          try {
            await api.post("creer-fiche-mouvement/", { ...payload, reference: newRef.trim() });
            navigate(`/agence/${currentAgenceId}/fiches-mouvement`, { replace: true });
            return;
          } catch (e2) {
            setMsg(e2?.response?.data?.detail || e2?.response?.data?.error || "Échec avec la nouvelle référence.");
          }
        } else {
          setMsg(data.message || "Opération annulée.");
        }
      } else {
        setMsg(data?.detail || data?.error || "Erreur lors de la création de la fiche de mouvement.");
      }
    } finally {
      setCreating(false);
    }
  };

  /* =========================================================
     UI — largeur contenue + résumé haut + choix + pax par hôtel
  ========================================================= */
  return (
    <div className="fm-page">
      <div className="fm-wrap">
        <header className="fm-top sticky">
          <div className="fm-top-left">
            <h2>Fiche de mouvement backup</h2>
            {msg ? <div className="fm-msg">{msg}</div> : null}
          </div>

          <div className="fm-actions">
            {currentAgenceId ? (
              <Link className="btn btn-outline-secondary btn-sm" to={`/agence/${currentAgenceId}/dashboard`}>
                ← Dashboard
              </Link>
            ) : null}
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() =>
                currentAgenceId ? navigate(`/agence/${currentAgenceId}/fiches-mouvement`) : navigate("/fiches-mouvement")
              }
            >
              ↪ Fiches
            </button>

            <div className="fm-sep" />

            <select
              className="form-select form-select-sm"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={loading}
              title="Langue fichier"
            >
              {languages.length ? (
                languages.map((lang) => (
                  <option key={lang.id ?? lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))
              ) : (
                <option value="">Langues…</option>
              )}
            </select>

            <label className="btn btn-dark btn-sm m-0">
              Importer Excel
              <input type="file" accept=".xls,.xlsx" onChange={onFile} hidden disabled={loading} />
            </label>

            <button type="button" className="btn btn-outline-danger btn-sm" onClick={clearImport}>
              🧹 Vider
            </button>
          </div>
        </header>

        {/* Résumé compact */}
        <TopSummaryBar
          tCode={tCode}
          dateSel={dateSel}
          airportSel={airportSel}
          flightsSel={flightsSel}
          tosSel={tosSel}
          villesSel={villesSel}
          hotelsSel={hotelsSel}
          selectedCount={selectedCount}
          selectedPax={selectedPax}
          movementName={movementName}
          setMovementName={setMovementName}
          onCreate={onCreate}
          creating={creating}
        />

        <div className="fm-body onecol">
          {/* TYPE */}
          <Section title="Type">
            <div className="fm-row chips">
              <Chip
                active={typeSel === "arrivee"}
                onClick={() => { setTypeSel("arrivee"); setDateSel(""); setAirportSel(""); setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]); setSelectedDossierIds(new Set()); }}
              >
                Arrivées
              </Chip>
              <Chip
                active={typeSel === "depart"}
                onClick={() => { setTypeSel("depart"); setDateSel(""); setAirportSel(""); setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]); setSelectedDossierIds(new Set()); }}
              >
                Départs
              </Chip>
            </div>
          </Section>

          {/* DATE */}
          <Section
            title="Date du vol"
            disabled={!typeSel || dateOptions.length === 0}
            right={dateSel ? <span className="fm-badge">{dateSel}</span> : <span className="text-muted small">Choisir…</span>}
          >
            <select
              className="form-select"
              value={dateSel}
              onChange={(e) => { setDateSel(e.target.value); setAirportSel(""); setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]); setSelectedDossierIds(new Set()); }}
              disabled={!typeSel || !dateOptions.length}
            >
              <option value="">— Sélectionner une date —</option>
              {dateOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Section>

          {/* AÉROPORT (chips au lieu de select) */}
          <Section
            title={typeSel === "depart" ? "Aéroport de départ" : "Aéroport d’arrivée"}
            disabled={!dateSel || airportOptions.length === 0}
          >
            <div className="fm-row chips-wrap">
              {airportSel && airportOptions.length === 0 && <div className="text-muted small">Aucun aéroport.</div>}
              {airportOptions.map((a) => {
                const act = airportSel === a;
                return (
                  <Chip
                    key={a}
                    active={act}
                    onClick={() => {
                      const next = act ? "" : a; // toggle
                      setAirportSel(next);
                      setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]); setSelectedDossierIds(new Set());
                    }}
                    title={a}
                  >
                    <strong>{a}</strong>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* VOLS */}
          <Section title="Vols" disabled={!airportSel || flightOptions.length === 0}>
            <div className="fm-row chips-wrap">
              {airportSel && flightOptions.length === 0 && <div className="text-muted small">Aucun vol trouvé.</div>}
              {flightOptions.map((f) => {
                const act = flightsSel.includes(f.flight);
                const times = f.times.join(" / ");
                return (
                  <Chip
                    key={f.flight}
                    active={act}
                    onClick={() => { setFlightsSel((prev) => prev.includes(f.flight) ? prev.filter((x) => x !== f.flight) : [...prev, f.flight]); setSelectedDossierIds(new Set()); }}
                    title={`${f.count} dossiers • ${f.pax} pax`}
                  >
                    <strong>{f.flight}</strong>
                    {times ? <span className="fm-chip-sub">{times}</span> : null}
                    <span className="fm-chip-pill">{f.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* TO */}
          <Section title="Tour opérateur" disabled={flightsSel.length === 0 || toOptions.length === 0}>
            <div className="fm-row chips-wrap">
              {flightsSel.length === 0 && <div className="text-muted small">Choisissez d’abord un vol.</div>}
              {flightsSel.length > 0 && toOptions.length === 0 && <div className="text-muted small">Aucun T.O. pour ces vols.</div>}
              {toOptions.map((t) => {
                const act = tosSel.includes(t.to);
                return (
                  <Chip
                    key={t.to}
                    active={act}
                    onClick={() => { setTosSel((prev) => prev.includes(t.to) ? prev.filter((x) => x !== t.to) : [...prev, t.to]); setSelectedDossierIds(new Set()); }}
                    title={`${t.count} dossiers • ${t.pax} pax`}
                  >
                    <strong>{t.to}</strong>
                    <span className="fm-chip-pill">{t.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* ZONES en chips (multi), sans noms d’hôtels dans le libellé */}
          <Section title="Zones (villes)" disabled={tosSel.length === 0 || villeOptions.length === 0}>
            {tosSel.length === 0 && <div className="text-muted small">Sélectionnez d’abord un T.O.</div>}
            <div className="fm-row chips-wrap">
              {villeOptions.map((v) => {
                const act = villesSel.includes(v.ville);
                return (
                  <Chip
                    key={v.ville}
                    active={act}
                    onClick={() => {
                      setVillesSel((prev) => prev.includes(v.ville) ? prev.filter((x) => x !== v.ville) : [...prev, v.ville]);
                      setSelectedDossierIds(new Set());
                    }}
                    title={`${v.count} dossiers • ${v.pax} pax`}
                  >
                    <strong>{v.ville}</strong>
                    <span className="fm-chip-pill">{v.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* HÔTELS (multi) */}
          <Section title="Hôtels" disabled={villeOptions.length === 0 || (villesSel.length === 0 && hotelOptions.length === 0)}>
            {villesSel.length === 0 && <div className="text-muted small">Sélectionnez d’abord au moins une zone.</div>}
            <div className="fm-row chips-wrap">
              {hotelOptions.map((h) => {
                const act = hotelsSel.includes(h.hotel);
                return (
                  <Chip
                    key={h.hotel}
                    active={act}
                    onClick={() => { setHotelsSel((prev) => prev.includes(h.hotel) ? prev.filter((x) => x !== h.hotel) : [...prev, h.hotel]); setSelectedDossierIds(new Set()); }}
                    title={`${h.count} dossiers • ${h.pax} pax`}
                  >
                    <strong>{h.hotel}</strong>
                    <span className="fm-chip-pill">{h.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* PAX PAR HÔTEL — sélection au niveau ligne/dossier */}
          {!!groupedByHotel.length && (
            <Section
              title="Pax par hôtel (sélection)"
              right={<span className="text-muted small">Coche/décoche pour inclure dans la fiche</span>}
            >
              <div className="fm-hotels-list">
                {groupedByHotel.map(([hotel, list]) => (
                  <div key={hotel} className="fm-hotel-block">
                    <div className="fm-hotel-head">
                      <b>{hotel}</b>
                      <span className="fm-chip-pill">{list.length} ligne(s)</span>
                    </div>
                    <div className="fm-hotel-body">
                      {list.map((r,i) => {
                        const checked = selectedDossierIds.has(r.id);
                        return (
                          <label key={r.id || Math.random()} className={`fm-passenger ${checked ? "is-checked" : ""}`}>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={checked}
                              onChange={() => {
                                setSelectedDossierIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(r.id)) next.delete(r.id);
                                  else next.add(r.id);
                                  return next;
                                });
                              }}
                            />
                            <div className="fm-passenger-main">
<div className="fm-passenger-main">
  <div className="fm-passenger-name fm-passenger-name--resa">
    {/* Nom de réservation + nb pax */}
    <span className="fm-resa-name">
      {(r.nom_reservation || "").trim() || "—"}
    </span>
    <span className="fm-resa-pax">{getPaxDisplay(r, tCode)}</span>

    {/* Triangle si observation */}
    { (r.observation && String(r.observation).trim()) ? (() => {
      const k = rowKeyOf(r, i);
      const isOpen = openObs.has(k);
      return (
        <button
  type="button"
  className={`fm-resa-caret ${isOpen ? "is-open" : ""}`}
  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleObs(k); }}
  aria-expanded={isOpen}
  aria-label={isOpen ? "Masquer l'observation" : "Afficher l'observation"}
  title={isOpen ? "Masquer l'observation" : "Afficher l'observation"}
>
  <span className="warn-icon" aria-hidden="true">⚠️</span>
</button>

      );
    })() : null }
  </div>

  {/* Panneau repliable */}
  { (r.observation && String(r.observation).trim()) ? (() => {
    const k = rowKeyOf(r, i);
    const isOpen = openObs.has(k);
    return isOpen ? (
      <div className="fm-obs-panel">
        {String(r.observation).trim()}
      </div>
    ) : null;
  })() : null }
</div>

</div>

                           
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Styles */}
      <style>{`
        /* Page centrée et largeur contenue */

        .fm-passenger-name--resa{
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
}
.fm-resa-name{ font-weight:700; }
.fm-resa-pax{
  font-size:12px; font-weight:700;
  background:#f1f5f9; border-radius:999px; padding:2px 6px;
}
.fm-resa-warning{
  display:inline-flex; align-items:center; justify-content:center;
  width:20px; height:20px; border-radius:999px;
  background:#FEF3C7; border:1px solid #FCD34D;
  cursor:help; line-height:1;
}

        .fm-page{ background:#f1f5f9; min-height:100vh; }
        .fm-wrap{ max-width:1120px; margin:0 auto; display:flex; flex-direction:column; background:transparent; }

        .fm-top{ display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:#fff; border-bottom:1px solid #e5e7eb; }
        .fm-top.sticky{ position:sticky; top:0; z-index:5; }
        .fm-top h2{ margin:0; font-size:18px; font-weight:800; }
        .fm-msg{ font-size:12px; color:#475569; margin-top:4px; }
        .fm-top-left{ display:flex; flex-direction:column; }
        .fm-actions{ display:flex; align-items:center; gap:8px; }
        .fm-sep{ width:1px; height:20px; background:#e5e7eb; margin:0 4px; }

        ./* Résumé haut – version lisible */
.fm-top-summary.improved{
  position: sticky; top: 56px; z-index: 4;
  background: #ffffff; border-bottom: 1px solid #e5e7eb;
  padding: 10px 16px; display: grid; grid-template-columns: 1fr auto; gap: 12px;
}

.fm-top-summary-grid{
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 8px;
}

/* Carte label/valeur */
.kv{
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 10px;
  min-height: 60px;
  display: flex; flex-direction: column; justify-content: center;
}
.kv-label{
  font-size: 11px; letter-spacing: .02em; text-transform: uppercase;
  color: #64748b; margin-bottom: 2px;
}
.kv-value{
  font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.25;
  word-break: break-word; white-space: normal; /* wrap propre pour longues valeurs */
}

/* KPI double bloc */
.kv.kpi{
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
  background: #f1f5f9;
}
.kpi-pair{ text-align: center; }
.kpi-num{ font-size: 20px; font-weight: 800; }
.kpi-label{ font-size: 11px; color: #64748b; margin-top: 2px; }
.kpi-sep{ width: 1px; height: 32px; background: #e5e7eb; }

/* Actions à droite */
.fm-top-summary-actions{
  display: flex; align-items: center; gap: 8px;
}

/* Responsive */
@media (max-width: 1100px){
  .fm-top-summary-grid{ grid-template-columns: repeat(3, minmax(0,1fr)); }
}
@media (max-width: 820px){
  .fm-top-summary{ grid-template-columns: 1fr; }
  .fm-top-summary-grid{ grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 560px){
  .fm-top-summary-grid{ grid-template-columns: 1fr; }
}


        .fm-body.onecol{ display:flex; flex-direction:column; gap:12px; padding:12px 16px; }

        .fm-sec{ position:relative; background:#fff; border:1px solid #e5e7eb; border-radius:12px; }
        .fm-sec-head{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px dashed #eef2f7; }
        .fm-sec-head h3{ margin:0; font-size:14px; font-weight:800; }
        .fm-badge{ background:#eef2ff; color:#3730a3; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:700; }
        .fm-sec-body{ padding:10px 12px; }
        .fm-sec.is-disabled{ opacity:.6; }
        .fm-sec-mask{ position:absolute; inset:0; border-radius:12px; background:transparent; pointer-events:auto; }

        .fm-row.chips{ display:flex; gap:8px; flex-wrap:wrap; }
        .fm-row.chips-wrap{ display:flex; gap:8px; flex-wrap:wrap; }

        .fm-chip{ border:1px solid #cbd5e1; background:#fff; border-radius:999px; padding:8px 12px; font-size:13px; font-weight:600; color:#0f172a; display:inline-flex; align-items:center; gap:8px; }
        .fm-chip:hover{ background:#f8fafc; }
        .fm-chip.is-active{ background:#0ea5e9; color:#fff; border-color:#0284c7; }
        .fm-chip-sub{ font-size:11px; opacity:.9; }
        .fm-chip-pill{ background:#f1f5f9; border-radius:999px; padding:2px 6px; font-size:11px; font-weight:700; }

        /* Pax par hôtel */
        .fm-hotels-list{ display:flex; flex-direction:column; gap:12px; }
        .fm-hotel-block{ border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
        .fm-hotel-head{ display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:#f8fafc; border-bottom:1px dashed #e5e7eb; }
        .fm-hotel-body{ display:flex; flex-direction:column; }
        .fm-passenger{ display:flex; gap:10px; padding:8px 10px; border-top:1px dashed #eef2f7; align-items:flex-start; }
        .fm-passenger:first-of-type{ border-top:none; }
        .fm-passenger.is-checked{ background:#fbfffe; }
        .fm-passenger-main{ display:flex; justify-content:space-between; width:100%; gap:8px; }
        .fm-passenger-name{ font-size:13px; font-weight:600; }
        .fm-passenger-meta{ display:flex; gap:6px; flex-wrap:wrap; }
        
        @media (max-width: 860px){
          .fm-top-summary-left{ max-width:100%; }
          .fm-top-summary .pill .truncate{ max-width:160px; }
        }
      `}</style>
    </div>
  );
}
