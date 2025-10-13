// src/components/FicheMouvement/useFicheMouvement.js
import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";

/** ========= Excel date/heure helpers ========= **/

function toHHMM(any) {
  if (any instanceof Date && !isNaN(any.getTime())) {
    const hh = String(any.getHours()).padStart(2, "0");
    const mm = String(any.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  if (typeof any === "number") {
    // fraction Excel (0..1) → HH:mm
    const minutes = Math.round(any * 24 * 60);
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const d = safeDate(any);
  if (d) return toHHMM(d);
  // dernier recours : tenter HH:mm déjà présent en texte
  const m = String(any || "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return m ? `${m[1].padStart(2,"0")}:${m[2]}` : "";
}


const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));
function fromExcelDate(n) {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const ms = Math.round(n * 86400000);
  return new Date(EXCEL_EPOCH.getTime() + ms);
}
function toYMD(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toHM(dOrFraction) {
  if (dOrFraction instanceof Date) {
    const hh = String(dOrFraction.getHours()).padStart(2, "0");
    const mm = String(dOrFraction.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  if (typeof dOrFraction === "number" && dOrFraction >= 0 && dOrFraction < 1) {
    const minutes = Math.round(dOrFraction * 24 * 60);
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  return "";
}
const safeDate = (v) => {
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/** ========= Normalisation & dérivés ========= **/
const normalizeDA = (val) => {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (["D", "DEPART", "DEPARTURE", "S", "SALIDA", "P", "PARTENZA"].includes(v)) return "D";
  if (["A", "ARRIVEE", "ARRIVAL", "LLEGADA", "L"].includes(v)) return "A";
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
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const pickTO = (d) => {
  if (!d || typeof d !== "object") return "";
  if (d._to) return String(d._to).trim();
  const to =
    d.tour_operateur ??
    d.to ??
    d.t_o ??
    d.TO ??
    d["T.O."] ??
    d["CLIENT/ TO"] ??
    d["Client / TO"] ??
    d.client_to ??
    "";
  return String(to || "").trim();
};
const pickRefTO = (d) => {
  if (!d || typeof d !== "object") return "";
  if (d._ref_to) return String(d._ref_to).trim();
  const rto =
    d.ref_to ?? d.ref_t_o ?? d["Ref.T.O."] ?? d.reference_to ?? d["REF T.O"] ?? d["Ref TO"] ?? d["Ntra.Ref"] ?? "";
  return String(rto || "").trim();
};
const getFlightNo = (d, t) => {
  if (!d) return "";
  if (t === "A") return d.num_vol_arrivee || d.num_vol || d.vol || d["N° VOL"] || "";
  if (t === "D") return d.num_vol_retour || d.num_vol || d.vol || d["N° VOL"] || "";
  return d.num_vol_arrivee || d.num_vol_retour || d.num_vol || d.vol || d["N° VOL"] || "";
};
const getFlightTime = (d, t) =>
  t === "A" ? d.heure_arrivee || "" : t === "D" ? d.heure_depart || "" : d.heure_arrivee || d.heure_depart || "";
const getPaxForType = (d, t) =>
  t === "A"
    ? Number(d.nombre_personnes_arrivee || d.pax || 0)
    : t === "D"
    ? Number(d.nombre_personnes_retour || d.pax || 0)
    : Number(d.nombre_personnes_arrivee || 0) + Number(d.nombre_personnes_retour || 0);
export const getPaxDisplay = (d, t) => `${getPaxForType(d, t)} pax`;
const formatRefFromDateKey = (dateKey) => (dateKey ? `M_${dateKey}` : null);
const normalizeRows = (rows) =>
  rows.map((d) => ({
    ...d,
    _type: deriveType(d),
    _to: d?._to ?? pickTO(d),
    _ref_to: d?._ref_to ?? pickRefTO(d),
  }));
export const rowKeyOf = (r, i) => String(r?.id ?? r?.reference ?? `row_${i}`);

/** ========= Mapping manuel ========= **/
export const TARGET_FIELDS = [
  { key: "date", label: "Date *" },
  { key: "heure", label: "Heure *" },
  { key: "type", label: "D/A (optionnel)" }, // si manquant on choisira type après
  { key: "aeroport_arrivee", label: "Aéroport Arrivée" },
  { key: "aeroport_depart", label: "Aéroport Départ" },
  { key: "num_vol", label: "N° Vol *" },
  { key: "client_to", label: "Client / TO *" },
  { key: "ville", label: "Ville/Zone" },
  { key: "hotel", label: "Hôtel *" },
  { key: "pax", label: "PAX *" },
  { key: "client", label: "Client (Nom complet)" },
  { key: "observation", label: "Observation" },
];

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function autoDetectMapping(headers) {
  const H = headers.map((h) => ({ raw: h, n: norm(h) }));
  const pick = (preds) => {
    const hit = H.find(({ n }) => preds.some((p) => n.includes(p)));
    return hit?.raw || "";
  };
  return {
    date: pick(["date", "dia", "fecha"]),
    heure: pick(["hora", "heure", "horaires", "time"]),
    type: pick(["d a", "d/a", "l/s", "depart", "arrivee", "salida", "llegada"]),
    aeroport_arrivee: pick(["arriv", "arrivee", "dst", "destination"]),
    aeroport_depart: pick(["dep", "depart", "org", "origine", "origin"]),
    num_vol: pick(["n vol", "vol", "vuelo", "flight"]),
    client_to: pick(["client / to", "client to", "t o", "t.o", "to", "tour oper"]),
    ville: pick(["ville", "ciudad", "zone"]),
    hotel: pick(["hotel"]),
    pax: pick(["pax", "adultes", "enfants"]),
    client: pick(["titulaire", "titular", "nom", "voyageur", "client", "passager"]),
    observation: pick(["observ", "comment"]),
  };
}

function applyMappingToRows(allRows, mapping) {
  // On renomme/compose un objet normalisé minimum > sera re-parsé par backend ensuite
  return allRows.map((r) => {
    const g = (k) => {
      const hdr = mapping[k];
      return hdr ? r[hdr] : "";
    };
    // conversions date/heure
    let dateStr = g("date");
    if (dateStr instanceof Date) dateStr = toYMD(dateStr);
    else if (typeof dateStr === "number") dateStr = toYMD(fromExcelDate(dateStr) || new Date(NaN));
    else {
      const dt = safeDate(dateStr);
      dateStr = dt ? toYMD(dt) : String(dateStr || "");
    }

    let heureStr = g("heure");
    if (heureStr instanceof Date) heureStr = toHM(heureStr);
    else if (typeof heureStr === "number") heureStr = toHM(heureStr);
    else heureStr = String(heureStr || "");

    const da = normalizeDA(g("type"));
    const aeroport_arrivee = String(g("aeroport_arrivee") || "").trim();
    const aeroport_depart = String(g("aeroport_depart") || "").trim();
    const num_vol = String(g("num_vol") || "").trim();
    const client_to = String(g("client_to") || "").trim();
    const ville = String(g("ville") || "").trim();
    const hotel = String(g("hotel") || "").trim();
    const client = String(g("client") || "").trim();
    const observation = String(g("observation") || "").trim();
    const pax = Number(g("pax") || 0) || 0;

    // On pose heure_arrivee/heure_depart en fonction du type si connu (sinon backend tranchera)
    const out = {
      date: dateStr,
      heure_brut: heureStr,
      _type: da,
      aeroport_arrivee,
      aeroport_depart,
      num_vol,
      _to: client_to,
      ville,
      hotel,
      client,
      observation,
      pax,
    };
    if (da === "A") {
      out.heure_arrivee = `${dateStr} ${heureStr}`.trim();
      out.nombre_personnes_arrivee = pax;
    } else if (da === "D") {
      out.heure_depart = `${dateStr} ${heureStr}`.trim();
      out.nombre_personnes_retour = pax;
    } else {
      // inconnu : on conserve l'heure brute
      out.heure = `${dateStr} ${heureStr}`.trim();
    }
    return out;
  });
}

/** ========= Parseur local pour l’aperçu ========= **/
async function parseExcelFile(file) {
  const buf = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
  } catch {
    throw new Error("Impossible de lire ce fichier (XLS/XLSX).");
  }
  if (!wb.SheetNames?.length) throw new Error("Classeur vide.");
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Première feuille introuvable.");

  let rows = XLSX.utils.sheet_to_json(ws, { defval: "", blankrows: false });
  const headers = Object.keys(rows[0] || {});

  // correction date/heure visible (sans altérer les clés)
  const dateCols = headers.filter((h) => /^(date|dia|fecha)/i.test(h));
  const timeCols = headers.filter((h) => /^(hora|heure|horaires|time)/i.test(h));
  const visRows = rows.slice(0, 10).map((r) => {
    const out = { ...r };
    dateCols.forEach((h) => {
      const v = out[h];
      if (v instanceof Date) out[h] = toYMD(v);
      else if (typeof v === "number") out[h] = toYMD(fromExcelDate(v) || new Date(NaN)) || String(v);
      else {
        const d = safeDate(v);
        out[h] = d ? toYMD(d) : String(v || "");
      }
    });
    timeCols.forEach((h) => {
      const v = out[h];
      if (v instanceof Date) out[h] = toHM(v);
      else if (typeof v === "number") out[h] = toHM(v);
      else out[h] = String(v || "");
    });
    return out;
  });

  return { headers, rowsTop10: visRows, allRows: rows };
}

/** ================= Hook principal ================= **/
export function useFicheMouvement() {
  const navigate = useNavigate();
  const params = useParams();
  const { user: ctxUser } = useContext(AuthContext) || {};
  const user = ctxUser || null;
  const currentAgenceId = params.agence_id || user?.agence_id || "";

  // Données métier
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

  const [msg, setMsg] = useState("Importez un fichier pour commencer.");
  const [creating, setCreating] = useState(false);
  const [movementName, setMovementName] = useState("");
  const [loading, setLoading] = useState(false);

  // langues
  const [selectedLanguage, setSelectedLanguage] = useState("fr");
  const [languages, setLanguages] = useState([]);

  // Aperçu + mapping
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewError, setPreviewError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [headerMap, setHeaderMap] = useState({}); // {fieldKey: headerName}
  const [hasImported, setHasImported] = useState(false);

  const tCode = typeSel === "arrivee" ? "A" : typeSel === "depart" ? "D" : null;
  const toggleObs = (key) =>
    setOpenObs((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

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
      } catch {
        setLanguages([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Options (calculées depuis rows) */
  const dateOptions = useMemo(() => {
    if (!rows.length) return [];
    const map = new Map();
    const src = tCode ? rows.filter((r) => r._type === tCode) : rows;
    src.forEach((r) => {
      const dk = getDateKey(r);
      if (!dk) return;
      const entry = map.get(dk) || { label: dk, count: 0 };
      entry.count += 1;
      map.set(dk, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, tCode]);

  const airportOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel) return [];
    const map = new Map();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .forEach((r) => {
        const val = tCode === "D" ? (r.aeroport_depart || "").trim() : (r.aeroport_arrivee || "").trim();
        if (!val) return;
        const entry = map.get(val) || { label: val, count: 0 };
        entry.count += 1;
        map.set(val, entry);
      });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [rows, tCode, dateSel]);

const flightOptions = useMemo(() => {
  if (!rows.length || !tCode || !dateSel || !airportSel) return [];
  const map = new Map();

  rows
    .filter((r) => r._type === tCode)
    .filter((r) => getDateKey(r) === dateSel)
    .filter((r) =>
      tCode === "D"
        ? (r.aeroport_depart || "").trim() === airportSel
        : (r.aeroport_arrivee || "").trim() === airportSel
    )
    .forEach((r) => {
      const flight = getFlightNo(r, tCode) || "—";
      const rawTime = getFlightTime(r, tCode);
      const time = toHHMM(rawTime); // ← un seul horaire normalisé
      const pax = getPaxForType(r, tCode);

      const entry =
        map.get(flight) ||
        { flight, timeCounts: new Map(), pax: 0, count: 0 };
      if (time) {
        entry.timeCounts.set(time, (entry.timeCounts.get(time) || 0) + 1);
      }
      entry.pax += pax;
      entry.count += 1;
      map.set(flight, entry);
    });

  // choisir l’horaire majoritaire pour chaque vol
  const opts = Array.from(map.values()).map((e) => {
    let bestTime = "";
    let bestCount = -1;
    e.timeCounts.forEach((cnt, t) => {
      if (cnt > bestCount || (cnt === bestCount && t < bestTime)) {
        bestCount = cnt;
        bestTime = t;
      }
    });
    return { flight: e.flight, time: bestTime, pax: e.pax, count: e.count };
  });

  return opts.sort((a, b) => b.pax - a.pax || a.flight.localeCompare(b.flight));
}, [rows, tCode, dateSel, airportSel]);



  const toOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    const map = new Map();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel
      )
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"))
      .forEach((r) => {
        const to = r._to || "";
        if (!to) return;
        const pax = getPaxForType(r, tCode);
        const entry = map.get(to) || { to, pax: 0, count: 0 };
        entry.pax += pax;
        entry.count += 1;
        map.set(to, entry);
      });
    return Array.from(map.values()).sort((a, b) => b.pax - a.pax);
  }, [rows, tCode, dateSel, airportSel, flightsSel]);

  const villeOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel
      )
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }
    const map = new Map();
    filtered.forEach((r) => {
      const ville = (r.ville || "").toString().trim() || "—";
      const pax = getPaxForType(r, tCode);
      const entry = map.get(ville) || { ville, pax: 0, count: 0 };
      entry.pax += pax;
      entry.count += 1;
      map.set(ville, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.pax - a.pax);
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel]);

  const hotelOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel
      )
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }
    if (villesSel.length > 0) {
      const sv = new Set(villesSel.map((x) => String(x).trim()));
      filtered = filtered.filter((r) => sv.has((r.ville || "").toString().trim() || "—"));
    }
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
      entry.pax += pax;
      entry.count += 1;
      map.set(hotel, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.pax - a.pax);
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel, villesSel]);

  /* Auto-sélections */
  useEffect(() => {
    if (!tCode) return;
    if (!dateSel && dateOptions.length === 1) setDateSel(dateOptions[0].label);
  }, [tCode, dateSel, dateOptions]);
  useEffect(() => {
    if (!dateSel) return;
    if (!airportSel && airportOptions.length === 1) setAirportSel(airportOptions[0].label);
  }, [dateSel, airportSel, airportOptions]);
  useEffect(() => {
    if (!airportSel) return;
    if (flightsSel.length === 0 && flightOptions.length === 1) setFlightsSel([flightOptions[0].flight]);
  }, [airportSel, flightsSel.length, flightOptions]);
  useEffect(() => {
    if (!flightsSel.length) return;
    if (!tosSel.length && toOptions.length === 1) setTosSel([toOptions[0].to]);
  }, [flightsSel.length, tosSel.length, toOptions]);
  useEffect(() => {
    if (!tosSel.length) return;
    if (!villesSel.length && villeOptions.length === 1) setVillesSel([villeOptions[0].ville]);
  }, [tosSel.length, villesSel.length, villeOptions]);
  useEffect(() => {
    if (!villesSel.length) return;
    if (!hotelsSel.length && hotelOptions.length === 1) setHotelsSel([hotelOptions[0].hotel]);
  }, [villesSel.length, hotelsSel.length, hotelOptions]);

  /* Filtrage */
  const filteredRecords = useMemo(() => {
    if (!tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D" ? (r.aeroport_depart || "").trim() === airportSel : (r.aeroport_arrivee || "").trim() === airportSel
      )
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));

    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }
    if (villesSel.length > 0) {
      const sv = new Set(villesSel.map((x) => String(x).trim()));
      filtered = filtered.filter((r) => sv.has((r.ville || "").toString().trim() || "—"));
    }
    if (hotelsSel.length > 0) {
      const sh = new Set(hotelsSel.map((x) => String(x).trim()));
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

  useEffect(() => {
    const next = new Set(filteredRecords.map((r) => r.id).filter(Boolean));
    setSelectedDossierIds(next);
  }, [filteredRecords]);

  const selectedCount = useMemo(() => Array.from(selectedDossierIds).length, [selectedDossierIds]);
  const selectedRows = useMemo(
    () => filteredRecords.filter((r) => selectedDossierIds.has(r.id)),
    [filteredRecords, selectedDossierIds]
  );
  const selectedPax = useMemo(
    () => selectedRows.reduce((acc, r) => acc + getPaxForType(r, tCode), 0),
    [selectedRows, tCode]
  );
  const obsCount = useMemo(
    () => selectedRows.reduce((acc, r) => acc + (r.observation && String(r.observation).trim() ? 1 : 0), 0),
    [selectedRows]
  );

  /** ========== Import: étape 1 (choix fichier) → Aperçu + auto-mapping ========== **/
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setMsg("");
    setTypeSel(null);
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
    setSelectedDossierIds(new Set());
    setOpenObs(new Set());
    setPreviewOpen(false);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewError("");

    try {
      setLoading(true);
      setParsing(true);
      const { headers, rowsTop10 } = await parseExcelFile(file);
      setPreviewHeaders(headers);
      setPreviewRows(rowsTop10);
      setHeaderMap(autoDetectMapping(headers)); // auto
      setPreviewOpen(true);
    } catch (err) {
      setPreviewOpen(false);
      setPreviewHeaders([]);
      setPreviewRows([]);
      setPreviewError("");
      const m = err?.message || "Impossible de lire ce fichier (XLS/XLSX).";
      setMsg(m);
    } finally {
      setParsing(false);
      setLoading(false);
      if (e?.target) e.target.value = "";
    }
  };

  /** ========== Import: étape 2 (confirmer) — auto ou avec mapping ========== **/
  const confirmImport = async (mode = "auto") => {
    if (!selectedFile) return;
    try {
      setLoading(true);
      setMsg("");
      const form = new FormData();
      form.append("file", selectedFile);
      if (currentAgenceId) form.append("agence", currentAgenceId);
      form.append("langue", selectedLanguage || "fr");
      if (mode === "manual") form.append("mapping", JSON.stringify(headerMap || {}));

      // On envoie au backend (source de vérité)
      const res = await api.post("importer-dossier/", form, { headers: { "Content-Type": "multipart/form-data" } });

      // On alimente le front avec la réponse
      const listRaw =
        (Array.isArray(res.data?.dossiers) && res.data.dossiers) ||
        [].concat(res.data?.dossiers_crees || [], res.data?.dossiers_mis_a_jour || []);

      let list = Array.isArray(listRaw) ? listRaw : [];

      // Si backend ignore "mapping", on applique le mapping localement pour que l’UI marche
      if (mode === "manual" && (!list.length || typeof list[0] !== "object")) {
        const parsed = await parseExcelFile(selectedFile);
        list = applyMappingToRows(parsed.allRows || [], headerMap || {});
      }

      const normalized = normalizeRows(list);
      setRows(normalized);
      setHasImported(true);

      const total = normalized.length;
      const crees = res.data?.dossiers_crees?.length || 0;
      const maj = res.data?.dossiers_mis_a_jour?.length || 0;
      setMsg(`Import OK — ${crees} créé(s), ${maj} MAJ, total ${total}.`);
      setPreviewOpen(false);
    } catch (err) {
      const m =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "Erreur lors de l'importation.";
      setMsg(m);
    } finally {
      setLoading(false);
    }
  };

  const cancelPreview = () => {
    setPreviewOpen(false);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewError("");
    setSelectedFile(null);
  };

  const clearImport = () => {
    setRows([]);
    setTypeSel(null);
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
    setSelectedDossierIds(new Set());
    setOpenObs(new Set());
    setHasImported(false);
    cancelPreview();
    setMsg("Importez un fichier pour commencer.");
  };

  /** ========== Création fiche ========== **/
  const onCreate = async () => {
    setMsg("");
    if (!currentAgenceId) {
      setMsg("Agence inconnue.");
      return;
    }
    if (!tCode || !dateSel || !airportSel) {
      setMsg("Complétez Type, Date et Aéroport.");
      return;
    }
    if (selectedCount === 0) {
      setMsg("Aucun dossier sélectionné.");
      return;
    }

    const selRows = filteredRecords.filter((r) => selectedDossierIds.has(r.id));
    const payload = {
      agence: currentAgenceId,
      name: (movementName || "").trim(),
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
      setMsg("Fiche créée.");
      navigate(`/agence/${currentAgenceId}/fiches-mouvement`, { replace: true });
    } catch (err) {
      const m = err?.response?.data?.detail || err?.response?.data?.error || "Erreur lors de la création.";
      setMsg(m);
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
    loading,
    selectedLanguage, setSelectedLanguage,
    languages: Array.isArray(languages) ? languages : [],
    hasImported,

    // aperçu + mapping
    previewOpen, previewHeaders, previewRows, previewError, parsing,
    selectedFile,
    headerMap, setHeaderMap,
    TARGET_FIELDS,

    // dérivés
    tCode,
    dateOptions, airportOptions, flightOptions,
    toOptions, villeOptions, hotelOptions,
    filteredRecords,
    selectedCount, selectedPax, obsCount,

    // actions
    onFile,
    confirmImport,
    cancelPreview,
    clearImport,
    onCreate,

    // utils
    getPaxDisplay,
    rowKeyOf,
    currentAgenceId,
    navigate,
  };
}
