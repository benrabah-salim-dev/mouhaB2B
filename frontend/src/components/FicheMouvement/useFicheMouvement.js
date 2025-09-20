// useFicheMouvement.js
import { useState, useEffect, useMemo } from "react";
import {
  deriveType,
  pickTO,
  pickRefTO,
  pickRef,
  getDateKeyForType,
  getAirportForType,
  getFlightNo,
  getFlightTime,
  getPaxForType,
  pickObservation,
  formatRefFromDateKey,
  EMPTY_ZONE_LABEL,
} from "./ui";
import api from "../../api";
import { useParams, useNavigate } from "react-router-dom";

export default function useFicheMouvement() {
  const params = useParams();
  const navigate = useNavigate();

  const localUser = JSON.parse(localStorage.getItem("userData") || "{}");
  const currentAgenceId = params.agence_id || localUser?.agence_id || "";
  const LS_KEY = currentAgenceId ? `dossiersImportes:${currentAgenceId}` : "dossiersImportes";

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [typeSel, setTypeSel] = useState(null);
  const [dateSel, setDateSel] = useState("");
  const [airportSel, setAirportSel] = useState("");
  const [zoneSel, setZoneSel] = useState("");
  const [hotelsSel, setHotelsSel] = useState([]);

  const [flightsSel, setFlightsSel] = useState([]);
  const [tosSel, setTosSel] = useState([]);
  const [villesSel, setVillesSel] = useState([]);
  const [movementName, setMovementName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  const [selectedLanguage, setSelectedLanguage] = useState("fr");
  const [languages, setLanguages] = useState([]);

  const tCode = typeSel === "arrivee" ? "A" : typeSel === "depart" ? "D" : null;

  // ---------- Mémoire de filtres par type (A/D) ----------
  const MEM_KEY = currentAgenceId ? `fm:filters:${currentAgenceId}` : "fm:filters";
  const [memory, setMemory] = useState(() => {
    try {
      const m = JSON.parse(localStorage.getItem(MEM_KEY) || "{}");
      return { A: m.A || {}, D: m.D || {} };
    } catch {
      return { A: {}, D: {} };
    }
  });
  useEffect(() => {
    localStorage.setItem(MEM_KEY, JSON.stringify(memory));
  }, [memory, MEM_KEY]);

  // restaurer filtres quand on change de type
  useEffect(() => {
    if (!tCode) return;
    const m = memory[tCode] || {};
    setDateSel(m.dateSel || "");
    setAirportSel(m.airportSel || "");
    setFlightsSel(Array.isArray(m.flightsSel) ? m.flightsSel : []);
    setTosSel(Array.isArray(m.tosSel) ? m.tosSel : []);
    setZoneSel(m.zoneSel || "");
    setHotelsSel(Array.isArray(m.hotelsSel) ? m.hotelsSel : []);
  }, [tCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // setters enveloppés qui mettent à jour la mémoire
  const setDateSelM = (v) => {
    setDateSel(v);
    if (tCode) {
      setMemory((m) => ({
        ...m,
        [tCode]: { ...m[tCode], dateSel: v, airportSel: "", flightsSel: [], tosSel: [], zoneSel: "", hotelsSel: [] },
      }));
    }
  };
  const setAirportSelM = (v) => {
    setAirportSel(v);
    if (tCode) {
      setMemory((m) => ({
        ...m,
        [tCode]: { ...m[tCode], airportSel: v, flightsSel: [], tosSel: [], zoneSel: "", hotelsSel: [] },
      }));
    }
  };
  const setFlightsSelM = (vs) => {
    setFlightsSel(vs);
    if (tCode) {
      setMemory((m) => ({
        ...m,
        [tCode]: { ...m[tCode], flightsSel: vs, tosSel: [], zoneSel: "", hotelsSel: [] },
      }));
    }
  };
  const setTosSelM = (vs) => {
    setTosSel(vs);
    if (tCode) {
      setMemory((m) => ({
        ...m,
        [tCode]: { ...m[tCode], tosSel: vs, zoneSel: "", hotelsSel: [] },
      }));
    }
  };
  // toggle zone : re-cliquer désélectionne
  const setZoneSelM = (valOrUpdater) => {
    const v =
      typeof valOrUpdater === "function" ? valOrUpdater(zoneSel) : valOrUpdater;
    const next = v === zoneSel ? "" : v;
    setZoneSel(next);
    if (tCode) {
      setMemory((m) => ({
        ...m,
        [tCode]: { ...m[tCode], zoneSel: next, hotelsSel: [] },
      }));
    }
  };
  const setHotelsSelM = (vs) => {
    setHotelsSel(vs);
    if (tCode) {
      setMemory((m) => ({
        ...m,
        [tCode]: { ...m[tCode], hotelsSel: vs },
      }));
    }
  };

  // Charger les langues
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("languages/");
        const langs = Array.isArray(res.data) ? res.data : [];
        setLanguages(langs);
        if (langs.length && !langs.find((l) => l.code === selectedLanguage)) {
          setSelectedLanguage(langs[0].code);
        }
      } catch (e) {
        console.error("Erreur chargement langues", e);
      }
    })();
  }, [selectedLanguage]);

  // Charger données importées depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const normalized = parsed.map((d) => ({
            ...d,
            _type: deriveType(d),
            _to: d._to ?? pickTO(d),
            _ref_to: d._ref_to ?? pickRefTO(d),
          }));
          setRows(normalized);
          setMsg(`Import rechargé (${normalized.length}) pour l'agence ${currentAgenceId || "—"}`);
        }
      } catch {}
    }
  }, [LS_KEY, currentAgenceId]);

  // Import fichier (⚠️ ne pas effacer typeSel)
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMsg("");

    // reset des filtres (mais on garde typeSel)
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setZoneSel("");
    setHotelsSel([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("agence", currentAgenceId);
    formData.append("langue", selectedLanguage);

    try {
      const res = await api.post("importer-dossier/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const list = Array.isArray(res.data?.dossiers) ? res.data.dossiers : [];
      const normalized = list.map((d) => ({
        ...d,
        _type: deriveType(d),
        _to: pickTO(d),
        _ref_to: pickRefTO(d),
      }));
      localStorage.setItem(LS_KEY, JSON.stringify(normalized));
      setRows(normalized);
      setMsg(`Import OK — ${list.length} lignes chargées`);
    } catch (err) {
      setMsg("Erreur lors de l'importation.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // Vider l'import
  const clearImport = () => {
    localStorage.removeItem(LS_KEY);
    setRows([]);
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setZoneSel("");
    setHotelsSel([]);
    setMsg("Import local vidé.");
  };

  // =========================
  // Options progressives
  // =========================

  // Dates
  const dateOptions = useMemo(() => {
    if (!rows.length || !tCode) return [];
    const set = new Set();
    rows.forEach((r) => {
      const dk = getDateKeyForType(r, tCode);
      if (dk) set.add(dk);
    });
    return Array.from(set).sort();
  }, [rows, tCode]);

  // Aéroports
  const airportOptions = useMemo(() => {
    if (!rows.length || !dateSel || !tCode) return [];
    const map = new Map();
    rows
      .filter((r) => getDateKeyForType(r, tCode) === dateSel)
      .forEach((r) => {
        const apt = getAirportForType(r, tCode);
        if (!apt) return;
        const pax = getPaxForType(r, tCode || deriveType(r));
        const entry = map.get(apt) || { airport: apt, pax: 0, count: 0 };
        entry.pax += pax;
        entry.count += 1;
        map.set(apt, entry);
      });
    return Array.from(map.values()).sort((a, b) => b.pax - a.pax);
  }, [rows, dateSel, tCode]);

  // Vols
  const flightOptions = useMemo(() => {
    if (!rows.length || !dateSel || !airportSel || !tCode) return [];
    const map = new Map();
    rows
      .filter((r) => getDateKeyForType(r, tCode) === dateSel)
      .filter((r) => getAirportForType(r, tCode) === airportSel)
      .forEach((r) => {
        const flight = getFlightNo(r, tCode) || "—";
        const tm = getFlightTime(r, tCode);
        const pax = getPaxForType(r, tCode);
        const entry = map.get(flight) || { flight, time: null, pax: 0, count: 0 };
        if (!entry.time || (tm && tm < entry.time)) entry.time = tm;
        entry.pax += pax;
        entry.count += 1;
        map.set(flight, entry);
      });
    return Array.from(map.values())
      .map((f) => ({
        ...f,
        time: f.time ? new Date(f.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null,
      }))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [rows, dateSel, airportSel, tCode]);

  // T.O.
  const toOptions = useMemo(() => {
    if (!rows.length || !dateSel || !airportSel || flightsSel.length === 0 || !tCode) return [];
    const map = new Map();
    rows
      .filter((r) => getDateKeyForType(r, tCode) === dateSel)
      .filter((r) => getAirportForType(r, tCode) === airportSel)
      .filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"))
      .forEach((r) => {
        let to = (r._to || pickTO(r) || "").trim();
        if (!to) to = "(Sans TO)";
        const pax = getPaxForType(r, tCode);
        const entry = map.get(to) || { to, pax: 0, count: 0 };
        entry.pax += pax;
        entry.count += 1;
        map.set(to, entry);
      });
    return Array.from(map.values()).sort((a, b) => b.pax - a.pax);
  }, [rows, dateSel, airportSel, flightsSel, tCode]);

  // Zones + hôtels agrégés
  const zoneOptions = useMemo(() => {
    if (!rows.length || !dateSel || !airportSel || (flightsSel.length === 0 && tosSel.length === 0) || !tCode)
      return [];
    const map = new Map();
    const flightSet = new Set(flightsSel);
    const toSet = new Set(tosSel);

    rows
      .filter((r) => getDateKeyForType(r, tCode) === dateSel)
      .filter((r) => getAirportForType(r, tCode) === airportSel)
      .filter((r) => (flightSet.size === 0 ? true : flightSet.has(getFlightNo(r, tCode) || "—")))
      .filter((r) => {
        if (toSet.size === 0) return true;
        let to = (r._to || pickTO(r) || "").trim();
        if (!to) to = "(Sans TO)";
        return toSet.has(to);
      })
      .forEach((r) => {
        const rawVille = (r.ville || "").toString().trim();
        const zoneLabel = rawVille || EMPTY_ZONE_LABEL;
        const hotelName = (r.hotel || "").toString().trim();
        const pax = getPaxForType(r, tCode);

        const entry = map.get(zoneLabel) || { zone: zoneLabel, pax: 0, count: 0, hotels: new Map() };
        entry.pax += pax;
        entry.count += 1;

        if (hotelName) {
          const h = entry.hotels.get(hotelName) || { hotel: hotelName, pax: 0, count: 0 };
          h.pax += pax;
          h.count += 1;
          entry.hotels.set(hotelName, h);
        }

        map.set(zoneLabel, entry);
      });

    return Array.from(map.values())
      .sort((a, b) => b.pax - a.pax)
      .map((z) => ({ ...z, hotels: Array.from(z.hotels.values()) }));
  }, [rows, dateSel, airportSel, flightsSel, tosSel, tCode]);

  const hotelOptions = useMemo(() => {
    if (!zoneSel) return [];
    const zone = zoneOptions.find((z) => z.zone === zoneSel);
    if (!zone) return [];
    return [...zone.hotels].sort((a, b) => b.pax - a.pax);
  }, [zoneSel, zoneOptions]);

  // =========================
  // Sélection courante
  // =========================
  const selectedRecords = useMemo(() => {
    let filtered = rows;

    if (tCode && dateSel) {
      filtered = filtered.filter((r) => getDateKeyForType(r, tCode) === dateSel);
    }

    if (tCode) {
      filtered = filtered.filter((r) => deriveType(r) === tCode);
    }

    if (airportSel) {
      filtered = filtered.filter((r) => getAirportForType(r, tCode) === airportSel);
    }

    if (flightsSel.length > 0) {
      const fset = new Set(flightsSel);
      filtered = filtered.filter((r) => fset.has(getFlightNo(r, tCode) || "—"));
    }

    if (tosSel.length > 0) {
      const toSet = new Set(tosSel);
      filtered = filtered.filter((r) => {
        const to = (r._to || pickTO(r) || "(Sans TO)").trim();
        return toSet.has(to);
      });
    }

    if (zoneSel) {
      // zone vide = EMPTY_ZONE_LABEL ("Zones -")
      filtered = filtered.filter((r) => {
        const v = (r.ville || "").toString().trim();
        return v === zoneSel || (!v && zoneSel === EMPTY_ZONE_LABEL);
      });
    }

    if (hotelsSel.length > 0) {
      const hset = new Set(hotelsSel.map((h) => (h || "").toString().trim()));
      filtered = filtered.filter((r) => hset.has((r.hotel || "").toString().trim()));
    }

    return filtered;
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel, zoneSel, hotelsSel]);

  const selectedCount = selectedRecords.length;
  const selectedPax = useMemo(
    () => selectedRecords.reduce((acc, r) => acc + getPaxForType(r, tCode || deriveType(r)), 0),
    [selectedRecords, tCode]
  );

  // Observations (globales & par hôtel)
  const selectionObservations = useMemo(() => {
    const out = [];
    selectedRecords.forEach((d) => {
      const obs = (pickObservation(d) || "").trim();
      if (obs) out.push({ ref: pickRef(d), obs });
    });
    return out;
  }, [selectedRecords]);

  const hotelObservations = useMemo(() => {
    const groups = {};
    selectedRecords.forEach((d) => {
      const hotel = (d.hotel || "").toString().trim() || "(Sans hôtel)";
      const obs = (pickObservation(d) || "").trim();
      if (!obs) return;
      if (!groups[hotel]) groups[hotel] = [];
      groups[hotel].push({
        ref: pickRef(d),
        pax: getPaxForType(d, tCode || deriveType(d)),
        obs,
      });
    });
    return groups;
  }, [selectedRecords, tCode]);

  const hotelObservationsFiltered = useMemo(() => {
    if (!hotelsSel.length) return {};
    const groups = {};
    selectedRecords.forEach((d) => {
      const hotel = (d.hotel || "").toString().trim() || "(Sans hôtel)";
      if (!hotelsSel.includes(hotel)) return;
      const obs = (pickObservation(d) || "").trim();
      if (!obs) return;
      if (!groups[hotel]) groups[hotel] = [];
      groups[hotel].push({
        ref: pickRef(d),
        pax: getPaxForType(d, tCode || deriveType(d)),
        obs,
      });
    });
    return groups;
  }, [selectedRecords, hotelsSel, tCode]);

  // Création de la fiche — inclut observations
  const onCreate = async () => {
    setMsg("");
    if (!currentAgenceId || !dateSel || !airportSel || selectedCount === 0) {
      setMsg("Données manquantes pour créer la fiche.");
      return;
    }

    const tourOperateurs = Array.from(
      new Set(
        selectedRecords.map((r) => {
          let to = (r._to || pickTO(r) || "").trim();
          return to || "(Sans TO)";
        })
      )
    );

    const payload = {
      agence: currentAgenceId,
      name: movementName || null,
      type: tCode,
      date: dateSel,
      aeroport_list: [airportSel],
      aeroport: airportSel,
      dossier_ids: selectedRecords.map((r) => r.id).filter(Boolean),
      reference: formatRefFromDateKey(dateSel),
      tour_operateurs: tourOperateurs,
      villes: Array.from(
        new Set(selectedRecords.map((r) => (r.ville || "").trim() || "—").filter(Boolean))
      ),
      // ⬇️ NOUVEAU : on transmet les observations
      observations: selectionObservations, // [{ref, obs}]
      observations_par_hotel: (hotelsSel.length > 0 ? hotelObservationsFiltered : hotelObservations) || {},
      filtres: {
        zone: zoneSel || null,
        hotels: hotelsSel,
        vols: flightsSel,
        tos: tosSel,
      },
    };

    try {
      setCreating(true);
      await api.post("creer-fiche-mouvement/", payload);
      navigate(`/agence/${currentAgenceId}/fiches-mouvement`, { replace: true });
    } catch (err) {
      setMsg("Erreur lors de la création de la fiche.");
    } finally {
      setCreating(false);
    }
  };

  return {
    state: {
      rows,
      msg,
      currentAgenceId,
      typeSel,
      dateSel,
      airportSel,
      flightsSel,
      tosSel,
      villesSel,
      zoneSel,
      hotelsSel,
      selectedCount,
      selectedPax,
      movementName,
      creating,
      selectedLanguage,
      languages,
      loading,
    },
    actions: {
      // on garde les mêmes noms qu’avant → aucun changement à faire côté page
      setTypeSel,
      setDateSel: setDateSelM,
      setAirportSel: setAirportSelM,
      setFlightsSel: setFlightsSelM,
      setTosSel: setTosSelM,
      setVillesSel,
      setZoneSel: setZoneSelM, // contient le toggle off
      setHotelsSel: setHotelsSelM,
      setMovementName,
      setSelectedLanguage,
      onCreate,
      onFile,
      clearImport,
    },
    options: { dateOptions, airportOptions, flightOptions, toOptions, zoneOptions, hotelOptions },
    selectionObservations,
    hotelObservations,
    hotelObservationsFiltered,
  };
}
