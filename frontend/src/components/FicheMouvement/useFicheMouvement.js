import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";

/** ================= Helpers ================= **/
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
const getFlightNo = (d, t) => {
  if (!d) return "";
  if (t === "A") return d.num_vol_arrivee || d.num_vol || d.vol || "";
  if (t === "D") return d.num_vol_retour || d.num_vol || d.vol || "";
  return d.num_vol_arrivee || d.num_vol_retour || d.num_vol || d.vol || "";
};
const getFlightTime = (d, t) => (t === "A" ? d.heure_arrivee || "" : t === "D" ? d.heure_depart || "" : d.heure_arrivee || d.heure_depart || "");
const getPaxForType = (d, t) => (t === "A" ? Number(d.nombre_personnes_arrivee || 0) : t === "D" ? Number(d.nombre_personnes_retour || 0) : Number(d.nombre_personnes_arrivee || 0) + Number(d.nombre_personnes_retour || 0));
const getPaxDisplay = (d, t) => `${getPaxForType(d, t)} pax`;
const formatRefFromDateKey = (dateKey) => (dateKey ? `M_${dateKey}` : null);
const normalizeRows = (rows) => rows.map((d) => ({ ...d, _type: deriveType(d), _to: d?._to ?? pickTO(d), _ref_to: d?._ref_to ?? pickRefTO(d) }));
const rowKeyOf = (r, i) => String(r?.id ?? r?.reference ?? `row_${i}`);

export function useFicheMouvement() {
  const navigate = useNavigate();
  const params = useParams();
  const { user: ctxUser } = useContext(AuthContext) || {};
  const localUser = JSON.parse(localStorage.getItem("userData") || "{}");
  const user = ctxUser || localUser;
  const currentAgenceId = params.agence_id || user?.agence_id || "";
  const LS_KEY = currentAgenceId ? `dossiersImportes:${currentAgenceId}` : "dossiersImportes";
  const FILTERS_KEY = currentAgenceId ? `ficheMvtFilters:${currentAgenceId}` : "ficheMvtFilters";

  /* State */
  const [rows, setRows] = useState([]);
  const [typeSel, setTypeSel] = useState(null);
  const [dateSel, setDateSel] = useState("");
  const [airportSel, setAirportSel] = useState("");
  const [flightsSel, setFlightsSel] = useState([]);
  const [tosSel, setTosSel] = useState([]);
  const [villesSel, setVillesSel] = useState([]);
  const [hotelsSel, setHotelsSel] = useState([]);
  const [selectedDossierIds, setSelectedDossierIds] = useState(() => new Set());
  const [openObs, setOpenObs] = useState(() => new Set());
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [movementName, setMovementName] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("fr");
  const [languages, setLanguages] = useState([]);

  const tCode = typeSel === "arrivee" ? "A" : typeSel === "depart" ? "D" : null;
  const toggleObs = (key) => setOpenObs(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });

  /* Langues */
  useEffect(() => {
    (async () => {
      try { const res = await api.get("languages/"); const langs = Array.isArray(res.data) ? res.data : [];
        setLanguages(langs);
        if (langs.length && !langs.find((l) => l.code === selectedLanguage)) setSelectedLanguage(langs[0].code);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Reload import */
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const normalized = normalizeRows(parsed);
        setRows(normalized);
        setMsg(`Import rechargé (${normalized.length}) pour l'agence ${currentAgenceId || "—"}.`);
      }
    } catch {}
  }, [LS_KEY, currentAgenceId]);

  /* Hydrate filtres sauvegardés */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved) return;
      if (saved.typeSel) setTypeSel(saved.typeSel);
      if (saved.dateSel) setDateSel(saved.dateSel);
      if (saved.airportSel) setAirportSel(saved.airportSel);
      if (Array.isArray(saved.flightsSel)) setFlightsSel(saved.flightsSel);
      if (Array.isArray(saved.tosSel)) setTosSel(saved.tosSel);
      if (Array.isArray(saved.villesSel)) setVillesSel(saved.villesSel);
      if (Array.isArray(saved.hotelsSel)) setHotelsSel(saved.hotelsSel);
      if (typeof saved.movementName === "string") setMovementName(saved.movementName);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FILTERS_KEY]);

  /* Sauvegarde filtres */
  useEffect(() => {
    const payload = { typeSel, dateSel, airportSel, flightsSel, tosSel, villesSel, hotelsSel, movementName };
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(payload)); } catch {}
  }, [typeSel, dateSel, airportSel, flightsSel, tosSel, villesSel, hotelsSel, movementName, FILTERS_KEY]);

  /* Options dépendantes */
  const dateOptions = useMemo(() => {
    if (!rows.length) return [];
    const set = new Set();
    (tCode ? rows.filter((r) => r._type === tCode) : rows).forEach((r) => { const dk = getDateKey(r); if (dk) set.add(dk); });
    return Array.from(set).sort();
  }, [rows, tCode]);

  const airportOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel) return [];
    const set = new Set();
    rows.filter((r) => r._type === tCode).filter((r) => getDateKey(r) === dateSel)
      .forEach((r) => { const val = tCode === "D" ? (r.aeroport_depart || "").trim() : (r.aeroport_arrivee || "").trim(); if (val) set.add(val); });
    return Array.from(set).sort();
  }, [rows, tCode, dateSel]);

  const flightOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel) return [];
    const map = new Map();
    rows.filter((r) => r._type === tCode).filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel))
      .forEach((r) => {
        const flight = getFlightNo(r, tCode) || "—";
        const tm = getFlightTime(r, tCode);
        const pax = getPaxForType(r, tCode);
        const entry = map.get(flight) || { flight, times: new Set(), pax: 0, count: 0 };
        if (tm) entry.times.add(safeDate(tm)?.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }));
        entry.pax += pax; entry.count += 1; map.set(flight, entry);
      });
    return Array.from(map.values()).map((x) => ({ ...x, times: Array.from(x.times).sort() })).sort((a,b)=>b.pax-a.pax);
  }, [rows, tCode, dateSel, airportSel]);

  const toOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    const map = new Map();
    rows.filter((r) => r._type === tCode).filter((r) => getDateKey(r) === dateSel)
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
    let filtered = rows.filter((r) => r._type === tCode).filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel))
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    if (tosSel.length > 0) { const st = new Set(tosSel); filtered = filtered.filter((r) => r._to && st.has(r._to)); }
    const map = new Map();
    filtered.forEach((r) => {
      const ville = (r.ville || "").toString().trim() || "—";
      const pax = getPaxForType(r, tCode);
      const entry = map.get(ville) || { ville, pax: 0, count: 0 };
      entry.pax += pax; entry.count += 1; map.set(ville, entry);
    });
    return Array.from(map.values()).sort((a,b)=>b.pax-a.pax);
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel]);

  const hotelOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    let filtered = rows.filter((r) => r._type === tCode).filter((r) => getDateKey(r) === dateSel)
      .filter((r) => (tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel))
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    if (tosSel.length > 0) { const st = new Set(tosSel); filtered = filtered.filter((r) => r._to && st.has(r._to)); }
    if (villesSel.length > 0) { const sv = new Set(villesSel.map((x)=>String(x).trim())); filtered = filtered.filter((r) => sv.has((r.ville || "").toString().trim() || "—")); }
    const map = new Map();
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

  /* Auto-sélections */
  useEffect(() => { if (!tCode) return; if (!dateSel && dateOptions.length === 1) setDateSel(dateOptions[0]); }, [tCode, dateOptions, dateSel]);
  useEffect(() => { if (!dateSel) return; if (!airportSel && airportOptions.length === 1) setAirportSel(airportOptions[0]); }, [dateSel, airportOptions, airportSel]);
  useEffect(() => { if (!airportSel) return; if (flightsSel.length === 0 && flightOptions.length === 1) setFlightsSel([flightOptions[0].flight]); }, [airportSel, flightOptions, flightsSel.length]);
  useEffect(() => { if (!flightsSel.length) return; if (!tosSel.length && toOptions.length === 1) setTosSel([toOptions[0].to]); }, [flightsSel.length, toOptions, tosSel.length]);
  useEffect(() => { if (!tosSel.length) return; if (!villesSel.length && villeOptions.length === 1) setVillesSel([villeOptions[0].ville]); }, [tosSel.length, villeOptions, villesSel.length]);
  useEffect(() => { if (!villesSel.length) return; if (!hotelsSel.length && hotelOptions.length === 1) setHotelsSel([hotelOptions[0].hotel]); }, [villesSel.length, hotelOptions, hotelsSel.length]);

  /* Filtrage dossiers */
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

  /* Sélection par défaut quand filtre change */
  useEffect(() => {
    const next = new Set(filteredRecords.map((r) => r.id).filter(Boolean));
    setSelectedDossierIds(next);
  }, [filteredRecords.map((r)=>r.id).join("|")]);

  /* Regroupement hôtel */
  const groupedByHotel = useMemo(() => {
    const map = new Map();
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

  /* KPIs + observations */
  const selectedCount = Array.from(selectedDossierIds).length;
  const selectedPax = useMemo(
    () => filteredRecords.filter((r) => selectedDossierIds.has(r.id)).reduce((acc, r) => acc + getPaxForType(r, tCode), 0),
    [filteredRecords, selectedDossierIds, tCode]
  );
  const selectedRows = useMemo(
    () => filteredRecords.filter((r) => selectedDossierIds.has(r.id)),
    [filteredRecords, selectedDossierIds]
  );
  const obsCount = useMemo(
    () => selectedRows.reduce((acc, r) => acc + (r.observation && String(r.observation).trim() ? 1 : 0), 0),
    [selectedRows]
  );

  /* Import fichier */
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setMsg("");
    setTypeSel(null); setDateSel(""); setAirportSel("");
    setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]);
    setSelectedDossierIds(new Set()); setOpenObs(new Set());
    try { localStorage.removeItem(FILTERS_KEY); } catch {}
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
      setLoading(false); e.target.value = "";
    }
  };

  const clearImport = () => {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(FILTERS_KEY);
    setRows([]);
    setTypeSel(null); setDateSel(""); setAirportSel("");
    setFlightsSel([]); setTosSel([]); setVillesSel([]); setHotelsSel([]);
    setSelectedDossierIds(new Set()); setOpenObs(new Set());
    setMsg("Import local vidé.");
  };

  /* Création + retrait des dossiers */
  const onCreate = async () => {
    setMsg("");
    if (!currentAgenceId) { setMsg("Agence inconnue. Ouvrez via /agence/:agence_id/fiche-mouvement."); return; }
    if (!tCode || !dateSel || !airportSel) { setMsg("Complétez Type, Date et Aéroport."); return; }
    if (selectedCount === 0) { setMsg("Aucun dossier sélectionné."); return; }

    const selRows = filteredRecords.filter((r) => selectedDossierIds.has(r.id));
    const payload = {
      agence: currentAgenceId,
      name: movementName || null,
      type: tCode,
      date: dateSel,
      aeroport: airportSel,
      dossier_ids: selRows.map((r) => r.id).filter(Boolean),
      reference: formatRefFromDateKey(dateSel),
      tour_operateurs: Array.from(new Set(selRows.map((r) => r._to).filter(Boolean))),
      villes: Array.from(new Set(selRows.map((r) => (r.ville || "").trim() || "—").filter(Boolean))),
    };

    try {
      setCreating(true);
      await api.post("creer-fiche-mouvement/", payload);

      // Retirer les dossiers créés
      const createdIds = new Set(selRows.map((r) => r.id).filter(Boolean));
      const remaining = rows.filter((r) => !createdIds.has(r.id));
      setRows(remaining);
      localStorage.setItem(LS_KEY, JSON.stringify(remaining));
      setMsg(`Fiche créée : ${selRows.length} dossier(s) retiré(s). Restant : ${remaining.length}.`);

      // Aller à la liste (les filtres restent sauvegardés)
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
            const createdIds = new Set(selRows.map((r) => r.id).filter(Boolean));
            const remaining = rows.filter((r) => !createdIds.has(r.id));
            setRows(remaining);
            localStorage.setItem(LS_KEY, JSON.stringify(remaining));
            navigate(`/agence/${currentAgenceId}/fiches-mouvement`, { replace: true });
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

  return {
    // state exposé
    rows, setRows,
    typeSel, setTypeSel,
    dateSel, setDateSel,
    airportSel, setAirportSel,
    flightsSel, setFlightsSel,
    tosSel, setTosSel,
    villesSel, setVillesSel,
    hotelsSel, setHotelsSel,
    selectedDossierIds, setSelectedDossierIds,
    openObs, toggleObs,
    msg, setMsg,
    creating, movementName, setMovementName,
    loading, selectedLanguage, setSelectedLanguage, languages,
    // dérivés
    tCode,
    dateOptions, airportOptions, flightOptions, toOptions, villeOptions, hotelOptions,
    filteredRecords, groupedByHotel,
    selectedCount, selectedPax, obsCount,
    // actions
    onFile, clearImport, onCreate,
    // utils
    getPaxDisplay, rowKeyOf,
    currentAgenceId, navigate
  };
}
