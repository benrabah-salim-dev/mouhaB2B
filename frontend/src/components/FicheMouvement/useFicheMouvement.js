// frontend/src/components/FicheMouvement/useFicheMouvement.js
import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api";
import { AuthContext } from "../../context/AuthContext";

/** ================= Helpers ================= **/
const safeDate = (v) => {
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};
const normalizeDA = (val) => {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (["D", "DEPART", "DEPARTURE", "S", "SALIDA", "P", "PARTENZA"].includes(v))
    return "D";
  if (["A", "ARRIVEE", "ARRIVAL", "LLEGADA", "L"].includes(v)) return "A";
  return null;
};
const deriveType = (d) => {
  if (!d || typeof d !== "object") return null;
  const hasDepart = !!d.heure_depart,
    hasArrivee = !!d.heure_arrivee;
  if (hasDepart && !hasArrivee) return "D";
  if (!hasDepart && hasArrivee) return "A";
  return normalizeDA(d._type || d.type || d.da);
};
const getDateKey = (d) => {
  if (!d || typeof d !== "object") return "";
  const dtStr = d.heure_depart || d.heure_arrivee;
  const dt = dtStr ? safeDate(dtStr) : null;
  if (!dt) return "";
  const y = dt.getFullYear(),
    m = String(dt.getMonth() + 1).padStart(2, "0"),
    day = String(dt.getDate()).padStart(2, "0");
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
    d.client_to ??
    "";
  return String(to || "").trim();
};
const pickRefTO = (d) => {
  if (!d || typeof d !== "object") return "";
  if (d._ref_to) return String(d._ref_to).trim();
  const rto =
    d.ref_to ??
    d.ref_t_o ??
    d["Ref.T.O."] ??
    d.reference_to ??
    d["REF T.O"] ??
    d["Ref TO"] ??
    d["Ntra.Ref"] ??
    "";
  return String(rto || "").trim();
};
const getFlightNo = (d, t) => {
  if (!d) return "";
  if (t === "A") return d.num_vol_arrivee || d.num_vol || d.vol || "";
  if (t === "D") return d.num_vol_retour || d.num_vol || d.vol || "";
  return d.num_vol_arrivee || d.num_vol_retour || d.num_vol || d.vol || "";
};
const getFlightTime = (d, t) =>
  t === "A"
    ? d.heure_arrivee || ""
    : t === "D"
    ? d.heure_depart || ""
    : d.heure_arrivee || d.heure_depart || "";
const getPaxForType = (d, t) =>
  t === "A"
    ? Number(d.nombre_personnes_arrivee || 0)
    : t === "D"
    ? Number(d.nombre_personnes_retour || 0)
    : Number(d.nombre_personnes_arrivee || 0) +
      Number(d.nombre_personnes_retour || 0);
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

/** ================= Hook ================= **/
export function useFicheMouvement() {
  const navigate = useNavigate();
  const params = useParams();
  const { user: ctxUser } = useContext(AuthContext) || {};
  const user = ctxUser || null;
  const currentAgenceId = params.agence_id || user?.agence_id || "";

  /* État local — aucune lecture/écriture localStorage, aucune requête “liste” auto */
  const [rows, setRows] = useState([]); // <— UNIQUEMENT alimenté par l’import
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
  const [selectedLanguage, setSelectedLanguage] = useState("fr");
  const [languages, setLanguages] = useState([]);
  const [hasImported, setHasImported] = useState(false); // flag pour UI

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
        if (langs.length && !langs.find((l) => l.code === selectedLanguage))
          setSelectedLanguage(langs[0].code);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ======= PLUS AUCUN FETCH AUTO =======
   *  On n'appelle PAS /dossiers-importables/.
   *  La source de vérité = la réponse de /importer-dossier/.
   */

  /* Options dépendantes (calculées à partir de rows) */
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
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [rows, tCode]);

  const airportOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel) return [];
    const map = new Map();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .forEach((r) => {
        const val =
          tCode === "D"
            ? (r.aeroport_depart || "").trim()
            : (r.aeroport_arrivee || "").trim();
        if (!val) return;
        const entry = map.get(val) || { label: val, count: 0 };
        entry.count += 1;
        map.set(val, entry);
      });
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label)
    );
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
        const tm = getFlightTime(r, tCode);
        const pax = getPaxForType(r, tCode);
        const entry = map.get(flight) || {
          flight,
          times: new Set(),
          pax: 0,
          count: 0,
        };
        if (tm)
          entry.times.add(
            safeDate(tm)?.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        entry.pax += pax;
        entry.count += 1;
        map.set(flight, entry);
      });
    return Array.from(map.values())
      .map((x) => ({ ...x, times: Array.from(x.times).sort() }))
      .sort((a, b) => b.pax - a.pax);
  }, [rows, tCode, dateSel, airportSel]);

  const toOptions = useMemo(() => {
    if (
      !rows.length ||
      !tCode ||
      !dateSel ||
      !airportSel ||
      flightsSel.length === 0
    )
      return [];
    const map = new Map();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D"
          ? (r.aeroport_depart || "").trim() === airportSel
          : (r.aeroport_arrivee || "").trim() === airportSel
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
    if (
      !rows.length ||
      !tCode ||
      !dateSel ||
      !airportSel ||
      flightsSel.length === 0
    )
      return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D"
          ? (r.aeroport_depart || "").trim() === airportSel
          : (r.aeroport_arrivee || "").trim() === airportSel
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
    if (
      !rows.length ||
      !tCode ||
      !dateSel ||
      !airportSel ||
      flightsSel.length === 0
    )
      return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D"
          ? (r.aeroport_depart || "").trim() === airportSel
          : (r.aeroport_arrivee || "").trim() === airportSel
      )
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }
    if (villesSel.length > 0) {
      const sv = new Set(villesSel.map((x) => String(x).trim()));
      filtered = filtered.filter((r) =>
        sv.has((r.ville || "").toString().trim() || "—")
      );
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

  /* Auto-sélections basées sur rows (après import) */
  useEffect(() => {
    if (!tCode) return;
    if (!dateSel && dateOptions.length === 1) setDateSel(dateOptions[0].label);
  }, [tCode, dateSel, dateOptions]);
  useEffect(() => {
    if (!dateSel) return;
    if (!airportSel && airportOptions.length === 1)
      setAirportSel(airportOptions[0].label);
  }, [dateSel, airportSel, airportOptions]);
  useEffect(() => {
    if (!airportSel) return;
    if (flightsSel.length === 0 && flightOptions.length === 1)
      setFlightsSel([flightOptions[0].flight]);
  }, [airportSel, flightsSel.length, flightOptions]);
  useEffect(() => {
    if (!flightsSel.length) return;
    if (!tosSel.length && toOptions.length === 1) setTosSel([toOptions[0].to]);
  }, [flightsSel.length, tosSel.length, toOptions]);
  useEffect(() => {
    if (!tosSel.length) return;
    if (!villesSel.length && villeOptions.length === 1)
      setVillesSel([villeOptions[0].ville]);
  }, [tosSel.length, villesSel.length, villeOptions]);
  useEffect(() => {
    if (!villesSel.length) return;
    if (!hotelsSel.length && hotelOptions.length === 1)
      setHotelsSel([hotelOptions[0].hotel]);
  }, [villesSel.length, hotelsSel.length, hotelOptions]);

  /* Filtrage dossiers */
  const filteredRecords = useMemo(() => {
    if (!tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D"
          ? (r.aeroport_depart || "").trim() === airportSel
          : (r.aeroport_arrivee || "").trim() === airportSel
      )
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));

    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }
    if (villesSel.length > 0) {
      const sv = new Set(villesSel.map((x) => String(x).trim()));
      filtered = filtered.filter((r) =>
        sv.has((r.ville || "").toString().trim() || "—")
      );
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
  }, [
    rows,
    tCode,
    dateSel,
    airportSel,
    flightsSel,
    tosSel,
    villesSel,
    hotelsSel,
  ]);

  /* Pré-sélection visible */
  useEffect(() => {
    const next = new Set(filteredRecords.map((r) => r.id).filter(Boolean));
    setSelectedDossierIds(next);
  }, [filteredRecords]);

  /* KPIs + observations */
  const selectedCount = useMemo(
    () => Array.from(selectedDossierIds).length,
    [selectedDossierIds]
  );
  const selectedRows = useMemo(
    () => filteredRecords.filter((r) => selectedDossierIds.has(r.id)),
    [filteredRecords, selectedDossierIds]
  );
  const selectedPax = useMemo(
    () => selectedRows.reduce((acc, r) => acc + getPaxForType(r, tCode), 0),
    [selectedRows, tCode]
  );
  const obsCount = useMemo(
    () =>
      selectedRows.reduce(
        (acc, r) =>
          acc + (r.observation && String(r.observation).trim() ? 1 : 0),
        0
      ),
    [selectedRows]
  );

  /* Import fichier → on ALIMENTE rows depuis la réponse, SANS refetch ailleurs */
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMsg("");
    // reset filtres
    setTypeSel(null);
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
    setSelectedDossierIds(new Set());
    setOpenObs(new Set());
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (currentAgenceId) formData.append("agence", currentAgenceId);
      formData.append("langue", selectedLanguage);

      const res = await api.post("importer-dossier/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // on prend ce que le backend renvoie comme lignes “exploitables”
      const listRaw =
        (Array.isArray(res.data?.dossiers) && res.data.dossiers) ||
        // fallback : concat créés + MAJ si c’est ce que renvoie ton API
        [].concat(
          res.data?.dossiers_crees || [],
          res.data?.dossiers_mis_a_jour || []
        );

      const list = Array.isArray(listRaw) ? listRaw : [];
      const normalized = normalizeRows(list);
      setRows(normalized);
      setHasImported(true);

      const total = normalized.length;
      const crees = res.data?.dossiers_crees?.length || 0;
      const maj = res.data?.dossiers_mis_a_jour?.length || 0;

      setMsg(
        total
          ? `Import OK — ${crees} créé(s), ${maj} MAJ, total ${total}.`
          : "Import terminé, aucune ligne exploitable."
      );
    } catch (err) {
      const m =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "Erreur lors de l'importation.";
      setMsg(m);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
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
    setMsg("Importez un fichier pour commencer.");
  };

  /* Création */
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
      tour_operateurs: Array.from(
        new Set(selRows.map((r) => r._to).filter(Boolean))
      ),
      villes: Array.from(
        new Set(
          selRows.map((r) => (r.ville || "").trim() || "—").filter(Boolean)
        )
      ),
    };

    try {
      setCreating(true);
      await api.post("creer-fiche-mouvement/", payload);
      setMsg("Fiche créée.");
      navigate(`/agence/${currentAgenceId}/fiches-mouvement`, {
        replace: true,
      });
    } catch (err) {
      const m =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        "Erreur lors de la création.";
      setMsg(m);
    } finally {
      setCreating(false);
    }
  };

  return {
    // state exposé
    rows,
    setRows,
    typeSel,
    setTypeSel,
    dateSel,
    setDateSel,
    airportSel,
    setAirportSel,
    flightsSel,
    setFlightsSel,
    tosSel,
    setTosSel,
    villesSel,
    setVillesSel,
    hotelsSel,
    setHotelsSel,
    selectedDossierIds,
    setSelectedDossierIds,
    openObs,
    toggleObs,
    msg,
    setMsg,
    creating,
    movementName,
    setMovementName,
    loading,
    selectedLanguage,
    setSelectedLanguage,
    languages,
    hasImported,

    // dérivés
    tCode,
    dateOptions,
    airportOptions,
    flightOptions,
    toOptions,
    villeOptions,
    hotelOptions,
    filteredRecords,
    selectedCount,
    selectedPax,
    obsCount,

    // actions
    onFile,
    clearImport,
    onCreate,

    // utils
    getPaxDisplay,
    rowKeyOf,
    currentAgenceId,
    navigate,
  };
}
