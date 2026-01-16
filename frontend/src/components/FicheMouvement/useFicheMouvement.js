// src/components/FicheMouvement/useFicheMouvement.js
import { useContext, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";

/** ========= Helpers: nombres ========= **/
function parseIntLoose(v) {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  s = s.replace(/,/g, "."); // virgule -> point
  const m = s.match(/[-+]?\d*\.?\d+/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** ========= Helpers: dates / heures ========= **/
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
  const m = String(dOrFraction || "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/**
 * Normalise en YYYY-MM-DD.
 * Gère :
 *  - Date JS
 *  - serial Excel (number)
 *  - "YYYY-MM-DD"
 *  - "DD/MM/YYYY" ou "DD-MM-YYYY"
 */
function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return "";

  if (value instanceof Date) return toYMD(value);

  if (typeof value === "number") {
    const d = fromExcelDate(value);
    return d ? toYMD(d) : "";
  }

  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  // dernier fallback : Date() (attention: dépend de l'implémentation)
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : toYMD(d);
}

/** ========= Normalisation texte ========= **/
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

/** ========= Champs cibles ========= **/
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

const NON_BLOCKING_REQUIRED = new Set(["observation"]);

function autoDetectMapping(headers) {
  const H = headers.map((h) => ({ raw: h, n: norm(h) }));
  const pick = (preds) => H.find(({ n }) => preds.some((p) => n.includes(p)))?.raw || "";

  return {
    date: pick(["date", "fecha", "jour", "dia"]),
    horaires: pick(["heure", "horaire", "time", "hora", "h/v", "h v"]),
    provenance: pick(["provenance", "origine", "origin", "from", "org"]),
    destination: pick(["destination", "dest", "to", "dst"]),
    da: pick(["depart", "arrive", "d a", "d/a", "llegada", "salida", "l s", "ls"]),
    num_vol: pick(["vol", "flight", "n vol", "n° vol", "vuelo", "nº vol"]),
    client_to: pick(["client to", "tour oper", "t o", "t.o", "client / to", "client/ to"]),
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

/** ========= Parse fichier ========= **/
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

  const dateStr = normalizeDate(g("date"));

  let heureStr = g("horaires");
  if (heureStr instanceof Date || typeof heureStr === "number") heureStr = toHM(heureStr);
  else heureStr = toHM(heureStr) || String(heureStr || "");

  const da = normalizeDA(g("da"));

  const paxRaw = parseIntLoose(g("pax"));
  const adulte = parseIntLoose(g("adulte"));
  const enfants = parseIntLoose(g("enfants"));
  const bb = parseIntLoose(g("bb_gratuit"));

  const pax = paxRaw > 0 ? paxRaw : adulte + enfants + bb;

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
  const errors = [];
  const warns = [];

  TARGET_FIELDS.forEach(({ key, label }) => {
    if (!requiredMap?.[key]) return;

    const v = row[key];
    const empty =
      v === null ||
      v === undefined ||
      String(v).trim() === "" ||
      (typeof v === "number" && isNaN(v));

    if (empty) {
      const msg = `${label} manquant(e)`;
      if (NON_BLOCKING_REQUIRED.has(key)) warns.push(msg);
      else errors.push(msg);
    }
  });

  // formats (bloquants)
  if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) errors.push("Date invalide (YYYY-MM-DD)");
  if (row.horaires && !/^\d{2}:\d{2}$/.test(row.horaires)) errors.push("Horaires invalide (HH:mm)");
  if (row.da && !["A", "D"].includes(row.da)) errors.push("DEPART/ARRIVER invalide (A ou D)");

  ["pax", "adulte", "enfants", "bb_gratuit"].forEach((k) => {
    if (String(row[k] ?? "").trim() !== "") {
      const n = Number(row[k]);
      if (!Number.isFinite(n) || n < 0) errors.push(`${k} invalide (nombre ≥ 0)`);
    }
  });

  return { errors, warns };
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
  // ✅ maintenant: [{ index, level: "error"|"warn", messages: [] }]
  const [validationErrors, setValidationErrors] = useState([]);
  const [emptyRowIdxs, setEmptyRowIdxs] = useState([]);

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

    const issues = [];
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

      const { errors, warns } = validateRow(row, requiredMap);

      if (errors.length) issues.push({ index: i, level: "error", messages: errors });
      if (warns.length) issues.push({ index: i, level: "warn", messages: warns });
    });

    setValidationErrors(issues);
    setEmptyRowIdxs(empties);

    const nbErrors = issues.filter((x) => x.level === "error").length;
    const nbWarns = issues.filter((x) => x.level === "warn").length;

    if (nbErrors === 0 && nbWarns === 0) {
      const info = [];
      if (empties.length) info.push(`${empties.length} ligne(s) vide(s) ignorée(s)`);
      setMsg(`Validation OK — aucune anomalie. ${info.join(" • ")}`);
    } else {
      setMsg(
        `Anomalies détectées : ${nbErrors} erreur(s)${nbWarns ? ` • ${nbWarns} warning(s)` : ""}${
          empties.length ? ` • ${empties.length} vide(s) ignorée(s)` : ""
        }.`
      );
    }
  };

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

      // 1) (ré)validation locale si besoin
      let mapped = lastValidatedRows;
      let issues = validationErrors;
      let empties = emptyRowIdxs;

      if (!mapped.length) {
        mapped = allRows.map((r) => normalizeRow(r, headerMap));
        const tmpIssues = [];
        const tmpEmpty = [];

        mapped.forEach((row, i) => {
          const allEmpty = TARGET_FIELDS.every(({ key }) => {
            const v = row[key];
            return v === null || v === undefined || String(v).trim() === "";
          });
          if (allEmpty) {
            tmpEmpty.push(i);
            return;
          }
          const { errors, warns } = validateRow(row, requiredMap);
          if (errors.length) tmpIssues.push({ index: i, level: "error", messages: errors });
          if (warns.length) tmpIssues.push({ index: i, level: "warn", messages: warns });
        });

        issues = tmpIssues;
        empties = tmpEmpty;

        setValidationErrors(tmpIssues);
        setEmptyRowIdxs(tmpEmpty);
        setLastValidatedRows(mapped);
      }

      // 2) Sélection des lignes à envoyer (logique locale)
      const empty = new Set(empties);
      let toSend = mapped
        .map((row, __idx) => ({ ...row, __idx }))
        .filter((r) => !empty.has(r.__idx));

      // ✅ filtre uniquement les erreurs bloquantes (pas les warn)
      if (!ignoreErrors) {
        const bad = new Set(issues.filter((e) => e.level === "error").map((e) => e.index));
        toSend = toSend.filter((r) => !bad.has(r.__idx));
      }

      toSend = toSend.map(({ __idx, ...rest }) => ({
        ...rest,
        observation: rest.observation ? String(rest.observation).trim() : "",
      }));

      if (!toSend.length) {
        setMsg("Aucune ligne à enregistrer (toutes vides ou invalides).");
        return;
      }

      // 3) Payload vers backend (actuel: FormData + fichier)
      const requiredKeysArray = Object.entries(requiredMap)
        .filter(([_, isReq]) => !!isReq)
        .map(([k]) => k);

      const form = new FormData();
      form.append("file", selectedFile);
      form.append("agence", String(currentAgenceId));
      form.append("mapping", JSON.stringify(headerMap));
      form.append("required_fields", JSON.stringify(requiredKeysArray));
      form.append("ignore_errors", ignoreErrors ? "true" : "false");
      form.append("filename", filename || selectedFile.name || "");
      form.append("total_rows_client", String(initialTotalRef.current || toSend.length));

      // ✅ (Option future) si tu veux passer aussi les lignes déjà clean (backend peut choisir d'utiliser ça)
      // form.append("rows_json", JSON.stringify(toSend));

      // 4) Appel API (timeout augmenté)
      const res = await api.post("/importer-dossier/", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 10 * 60 * 1000, // ✅ 10 minutes
      });

      // 5) Feedback
      const created = Number(res?.data?.created_count ?? res?.data?.created ?? 0);
      const updated = Number(res?.data?.updated_count ?? res?.data?.updated ?? 0);

      const nbErr = (issues || []).filter((x) => x.level === "error").length;
      const nbWarn = (issues || []).filter((x) => x.level === "warn").length;

      setMsg(
        `Enregistrement terminé — ${created} créé(s), ${updated} mis à jour. ` +
          `${toSend.length} ligne(s) envoyées. ` +
          `${empties.length} vide(s) ignorée(s). ` +
          `${
            ignoreErrors
              ? `${nbErr} erreur(s) + ${nbWarn} warning(s) envoyés.`
              : `${nbErr} erreur(s) bloquantes ignorée(s), ${nbWarn} warning(s) non bloquants.`
          }`
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
    msg,
    loading,
    currentAgenceId,

    selectedFile,
    filename,
    headers,
    allRows,

    headerMap,
    setHeaderMap,
    requiredMap,
    setRequiredMap,
    ignoreErrors,
    setIgnoreErrors,
    TARGET_FIELDS,

    mappedPreview,
    validationErrors,
    emptyRowIdxs,
    lastValidatedRows,

    onFile,
    runValidation,
    saveAll,
    clearAll,
  };
}
