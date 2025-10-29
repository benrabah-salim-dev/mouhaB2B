// src/components/FicheMouvement/useFicheMouvement.js
import { useContext, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";

/** ========= Helpers: dates / heures ========= **/

const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

const safeDate = (v) => {
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};
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
  const m = String(dOrFraction || "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/** ========= Normalisation ========== **/
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeDA = (val) => {
  if (!val) return "";
  const v = String(val).trim().toUpperCase();
  if (["D", "DEPART", "DEPARTURE", "S", "SALIDA", "P", "PARTENZA"].includes(v)) return "D";
  if (["A", "ARRIVEE", "ARRIVAL", "LLEGADA", "L"].includes(v)) return "A";
  return "";
};

/** ========= Champs cibles & mapping ========= **/
export const TARGET_FIELDS = [
  { key: "date", label: "Date" },
  { key: "horaires", label: "Horaires" },
  { key: "provenance", label: "Provenance" },
  { key: "destination", label: "Destination" },
  { key: "da", label: "DEPART/ARRIVER" },
  { key: "num_vol", label: "N° Vol" },
  { key: "client_to", label: "Client / TO" },
  { key: "hotel", label: "Hotel" },
  { key: "ref", label: "REF" },
  { key: "titulaire", label: "Titulaire" },
  { key: "pax", label: "Pax" },
  { key: "adulte", label: "Adulte" },
  { key: "enfants", label: "Enfants" },
  { key: "bb_gratuit", label: "BB/GRATUIT" },
  { key: "observation", label: "Observation" },
  { key: "ville", label: "Ville" },
  { key: "code_postal", label: "code postal" },
];

// Par défaut, on coche les requis “métier” habituels.
// Tu peux modifier ce preset ; l’UI permet de les cocher/décocher.
const DEFAULT_REQUIRED = {
  date: true,
  horaires: true,
  provenance: false,
  destination: false,
  da: true,
  num_vol: true,
  client_to: true,
  hotel: true,
  ref: true,
  titulaire: true,
  pax: true,
  adulte: false,
  enfants: false,
  bb_gratuit: false,
  observation: false,
  ville: false,
  code_postal: false,
};

function autoDetectMapping(headers) {
  const H = headers.map((h) => ({ raw: h, n: norm(h) }));
  const pick = (preds) => H.find(({ n }) => preds.some((p) => n.includes(p)))?.raw || "";

  return {
    date: pick(["date", "fecha", "jour", "dia"]),
    horaires: pick(["heure", "horaire", "time", "hora", "h/v", "h v"]),
    provenance: pick(["provenance", "origine", "origin", "from", "org"]),
    destination: pick(["destination", "dest", "to", "dst"]),
    da: pick(["depart", "arrive", "d a", "d/a", "llegada", "salida", "d a", "l s", "ls", "d/a"]),
    num_vol: pick(["vol", "flight", "n vol", "n° vol", "vuelo", "nº vol"]),
    client_to: pick(["client to", "to", "tour oper", "t o", "t.o", "client / to", "client/ to"]),
    hotel: pick(["hotel", "hôtel"]),
    ref: pick(["ref", "reference", "référence", "ntra.ref", "ref t.o.", "ref to"]),
    titulaire: pick(["titulaire", "titular", "voyageur", "passager", "client", "nom", "tetulaire"]),
    pax: pick(["pax", "personnes", "passagers", "qt pax", "passengers"]),
    adulte: pick(["adulte", "adultes", "adults", "adultos"]),
    enfants: pick(["enfant", "enfants", "kids", "child", "children", "niños", "ninos"]),
    bb_gratuit: pick(["bb", "bebe", "gratuit", "infant", "baby"]),
    observation: pick(["observ", "comment", "remark", "notes"]),
    ville: pick(["ville", "city", "ciudad", "zone"]),
    code_postal: pick(["code postal", "postal", "zip"]),
  };
}

/** ========= Fichier ========= **/
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
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", blankrows: false });
  const headers = Object.keys(rows[0] || {});
  return { headers, rows, filename: file.name || "" };
}

/** ========= Normalisation ligne ========= **/
function normalizeRow(raw, map) {
  const g = (k) => {
    const hdr = map?.[k];
    return hdr ? raw[hdr] : "";
  };

  // Date indépendante (on ne la colle pas à l’heure)
  let dateStr = g("date");
  if (dateStr instanceof Date) dateStr = toYMD(dateStr);
  else if (typeof dateStr === "number") dateStr = toYMD(fromExcelDate(dateStr) || new Date(NaN));
  else {
    const d = safeDate(dateStr);
    dateStr = d ? toYMD(d) : String(dateStr || "");
  }

  // Heure seule HH:mm
  let heureStr = g("horaires");
  if (heureStr instanceof Date || typeof heureStr === "number") heureStr = toHM(heureStr);
  else heureStr = toHM(heureStr) || String(heureStr || "");

  const da = normalizeDA(g("da"));

  const pax = Number(g("pax") || 0) || 0;
  const adulte = Number(g("adulte") || 0) || 0;
  const enfants = Number(g("enfants") || 0) || 0;
  const bb = Number(g("bb_gratuit") || 0) || 0;

  return {
    date: dateStr,
    horaires: heureStr,
    provenance: String(g("provenance") || "").trim(),
    destination: String(g("destination") || "").trim(),
    da,
    num_vol: String(g("num_vol") || "").trim(),
    client_to: String(g("client_to") || "").trim(),
    hotel: String(g("hotel") || "").trim(),
    ref: String(g("ref") || "").trim(),
    titulaire: String(g("titulaire") || "").trim(),
    pax,
    adulte,
    enfants,
    bb_gratuit: bb,
    observation: String(g("observation") || "").trim(),
    ville: String(g("ville") || "").trim(),
    code_postal: String(g("code_postal") || "").trim(),
  };
}

/** ========= Validation ========= **/
function validateRow(row, requiredMap) {
  const msgs = [];

  TARGET_FIELDS.forEach(({ key, label }) => {
    if (requiredMap?.[key]) {
      const v = row[key];
      const empty =
        v === null || v === undefined || String(v).trim() === "" || (typeof v === "number" && isNaN(v));
      if (empty) msgs.push(`${label} manquant(e)`);
    }
  });

  if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) msgs.push("Date invalide (YYYY-MM-DD)");
  if (row.horaires && !/^\d{2}:\d{2}$/.test(row.horaires)) msgs.push("Horaires invalide (HH:mm)");
  if (row.da && !["A", "D"].includes(row.da)) msgs.push("DEPART/ARRIVER invalide (A ou D)");

  ["pax", "adulte", "enfants", "bb_gratuit"].forEach((k) => {
    if (String(row[k] ?? "").trim() !== "") {
      const n = Number(row[k]);
      if (!Number.isFinite(n) || n < 0) msgs.push(`${k} invalide (nombre ≥ 0)`);
    }
  });

  return msgs;
}

/** ========= Hook ========= **/
export function useFicheMouvement() {
  const { user: ctxUser } = useContext(AuthContext) || {};
  const user = ctxUser || null;

  const [msg, setMsg] = useState("Importez un fichier pour commencer.");
  const [loading, setLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState([]);
  const [allRows, setAllRows] = useState([]);

  const [headerMap, setHeaderMap] = useState({});
  const [requiredMap, setRequiredMap] = useState(DEFAULT_REQUIRED);
  const [ignoreErrors, setIgnoreErrors] = useState(false);

  const [mappedPreview, setMappedPreview] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]); // [{index, messages[]}]
  const [emptyRowIdxs, setEmptyRowIdxs] = useState([]); // index lignes vides

  const [lastValidatedRows, setLastValidatedRows] = useState([]);

  const currentAgenceId = user?.agence_id || null;
  const initialTotalRef = useRef(0);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setMsg("Fichier chargé. Configurez le mapping puis cliquez sur Valider.");

    try {
      setLoading(true);
      const { headers, rows, filename } = await parseExcelFile(file);
      setHeaders(headers);
      setAllRows(rows);
      setFilename(filename || file.name || "");
      initialTotalRef.current = rows.length;

      const auto = autoDetectMapping(headers);
      setHeaderMap(auto);

      setMappedPreview(rows.slice(0, 3).map((r) => normalizeRow(r, auto)));

      setValidationErrors([]);
      setEmptyRowIdxs([]);
      setLastValidatedRows([]);
    } catch (err) {
      setHeaders([]);
      setAllRows([]);
      setMsg(err?.message || "Impossible de lire ce fichier.");
    } finally {
      setLoading(false);
      if (e?.target) e.target.value = "";
    }
  };

  useEffect(() => {
    if (!allRows.length) {
      setMappedPreview([]);
      return;
    }
    setMappedPreview(allRows.slice(0, 3).map((r) => normalizeRow(r, headerMap)));
  }, [allRows, headerMap]);

  const runValidation = () => {
    if (!allRows.length) {
      setMsg("Aucun contenu à valider.");
      return;
    }
    const mapped = allRows.map((r) => normalizeRow(r, headerMap));
    setLastValidatedRows(mapped);

    const errors = [];
    const empties = [];

    mapped.forEach((row, i) => {
      const allEmpty = TARGET_FIELDS.every(({ key }) => {
        const v = row[key];
        return v === null || v === undefined || String(v).trim() === "";
      });
      if (allEmpty) {
        empties.push(i);
        return;
      }
      const msgs = validateRow(row, requiredMap);
      if (msgs.length) errors.push({ index: i, messages: msgs });
    });

    setValidationErrors(errors);
    setEmptyRowIdxs(empties);

    if (errors.length === 0) {
      const info = [];
      if (empties.length) info.push(`${empties.length} ligne(s) vide(s) ignorée(s)`);
      setMsg(`Validation OK — aucune erreur. ${info.join(" • ")}`);
    } else {
      setMsg(
        `Erreurs détectées : ${errors.length} ligne(s) en anomalie${
          empties.length ? ` • ${empties.length} vide(s) ignorée(s)` : ""
        }.`
      );
    }
  };

  /** Enregistrement :
   *  - si ignoreErrors === false : on envoie uniquement les lignes valides
   *  - si ignoreErrors === true  : on envoie toutes les lignes non vides (même en anomalie)
   *  Le backend recevra mapping, required_fields, ignore_errors
   */
  const saveAll = async () => {
    if (!selectedFile) {
      setMsg("Aucun fichier sélectionné.");
      return;
    }
    if (!currentAgenceId) {
      setMsg("Agence inconnue.");
      return;
    }

    try {
      setLoading(true);

      // 1) Calcul (ré)validation locale si besoin
      let mapped = lastValidatedRows;
      let errors = validationErrors;
      let empties = emptyRowIdxs;

      if (!mapped.length) {
        mapped = allRows.map((r) => normalizeRow(r, headerMap));
        const tmpErr = [];
        const tmpEmpty = [];
        mapped.forEach((row, i) => {
          const allEmpty = TARGET_FIELDS.every(({ key }) => {
            const v = row[key];
            return v === null || v === undefined || String(v).trim() === "";
          });
          if (allEmpty) {
            tmpEmpty.push(i);
          } else {
            const msgs = validateRow(row, requiredMap);
            if (msgs.length) tmpErr.push({ index: i, messages: msgs });
          }
        });
        errors = tmpErr;
        empties = tmpEmpty;
        setValidationErrors(tmpErr);
        setEmptyRowIdxs(tmpEmpty);
        setLastValidatedRows(mapped);
      }

      // 2) Sélection des lignes à envoyer
      const empty = new Set(empties);
      let toSend = mapped
        .map((row, __idx) => ({ ...row, __idx }))
        .filter((r) => !empty.has(r.__idx));

      if (!ignoreErrors) {
        const bad = new Set(errors.map((e) => e.index));
        toSend = toSend.filter((r) => !bad.has(r.__idx));
      }

      toSend = toSend.map(({ __idx, ...rest }) => rest);

      if (!toSend.length) {
        setMsg("Aucune ligne à enregistrer (toutes vides ou invalides).");
        return;
      }

      // 3) Construire le FormData attendu par le backend
      const requiredKeysArray = Object.entries(requiredMap)
        .filter(([_, isReq]) => !!isReq)
        .map(([k]) => k);

      const form = new FormData();
      form.append("file", selectedFile);
      form.append("agence", currentAgenceId);
      form.append("mapping", JSON.stringify(headerMap));               // { date: "DATE", horaires: "H/V", ... }
      form.append("required_fields", JSON.stringify(requiredKeysArray)); // ["date","horaires",...]
      form.append("ignore_errors", ignoreErrors ? "true" : "false");
      // (facultatif, utile au back si tu veux)
      form.append("filename", filename || selectedFile.name || "");
      form.append("total_rows_client", String(initialTotalRef.current || toSend.length));

      // 4) Appel API
      const res = await api.post("importer-dossier/", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // 5) Feedback
      const created = Number(res?.data?.created_count ?? res?.data?.created ?? 0);
      const updated = Number(res?.data?.updated_count ?? res?.data?.updated ?? 0);

      const ignoredCountLocal = ignoreErrors
        ? empties.length // on a quand même ignoré les totalement vides
        : (errors?.length || 0) + (empties?.length || 0);

      setMsg(
        `Enregistrement terminé — ${created} créé(s), ${updated} mis à jour. ` +
          `${toSend.length} ligne(s) envoyées, ${ignoredCountLocal} ignorée(s) côté client.`
      );
    } catch (err) {
      const m =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "Erreur lors de l’enregistrement.";
      setMsg(m);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setMsg("Importez un fichier pour commencer.");
    setLoading(false);
    setSelectedFile(null);
    setFilename("");
    setHeaders([]);
    setAllRows([]);
    setHeaderMap({});
    setRequiredMap(DEFAULT_REQUIRED);
    setIgnoreErrors(false);
    setMappedPreview([]);
    setValidationErrors([]);
    setEmptyRowIdxs([]);
    setLastValidatedRows([]);
  };

  return {
    // état & infos
    msg,
    loading,
    currentAgenceId,

    selectedFile,
    filename,
    headers,
    allRows,

    // mapping + requis + ignore
    headerMap,
    setHeaderMap,
    requiredMap,
    setRequiredMap,
    ignoreErrors,
    setIgnoreErrors,
    TARGET_FIELDS,

    // aperçu / erreurs
    mappedPreview,
    validationErrors,
    emptyRowIdxs,
    lastValidatedRows,

    // actions
    onFile,
    runValidation,
    saveAll,
    clearAll,
  };
}
