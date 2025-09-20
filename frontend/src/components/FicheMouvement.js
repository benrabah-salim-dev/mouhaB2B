// src/components/FicheMouvement.js
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api";
import Sidebar from "../Sidebar";
import { AuthContext } from "../context/AuthContext";
import { useContext } from "react";


/* =========================================================
   Helpers
========================================================= */

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
  if (["D", "DEPART", "DEPARTURE", "S", "SALIDA", "P", "PARTENZA"].includes(v)) return "D";
  if (["A", "ARRIVEE", "ARRIVAL", "LLEGADA", "L"].includes(v)) return "A";
  return null;
};
const deriveType = (d) => {
  if (!d || typeof d !== "object") return null;
  const hasDepart = !!d.heure_depart;
  const hasArrivee = !!d.heure_arrivee;
  if (hasDepart && !hasArrivee) return "D";
  if (!hasDepart && hasArrivee) return "A";
  return normalizeDA(d._type || d.type || d.da);
};
const labelType = (t) => (t === "D" ? "Départ" : t === "A" ? "Arrivée" : "");
const getDateKey = (d) => {
  if (!d || typeof d !== "object") return "";
  const dtStr = d.heure_depart || d.heure_arrivee;
  if (!dtStr) return "";
  const dt = safeDate(dtStr);
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
const normalizeRows = (rows) =>
  rows.map((d) => {
    const _type = deriveType(d);
    const _to = d?._to ?? pickTO(d);
    const _ref_to = d?._ref_to ?? pickRefTO(d);
    return { ...d, _type, _to, _ref_to };
  });

const formatShortTime = (iso) => {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const getFlightNo = (d, t) => {
  if (!d) return "";
  if (t === "A") return d.num_vol_arrivee || d.num_vol || d.vol || "";
  if (t === "D") return d.num_vol_retour || d.num_vol || d.vol || "";
  return d.num_vol_arrivee || d.num_vol_retour || d.num_vol || d.vol || "";
};
const getFlightTime = (d, t) => {
  if (t === "A") return d.heure_arrivee || "";
  if (t === "D") return d.heure_depart || "";
  return d.heure_arrivee || d.heure_depart || "";
};
const getPaxForType = (d, t) => {
  if (t === "A") return Number(d.nombre_personnes_arrivee || 0);
  if (t === "D") return Number(d.nombre_personnes_retour || 0);
  return Number(d.nombre_personnes_arrivee || 0) + Number(d.nombre_personnes_retour || 0);
};
const formatRefFromDateKey = (dateKey) => (dateKey ? `M_${dateKey}` : null);
const pickObservation = (d) =>
  String(
    d.observation ??
      d.observations ??
      d.observ ??
      d.remarque ??
      d.note ??
      d.notes ??
      ""
  ).trim();

/* =========================================================
   Composants UI simples
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
    <button
      type="button"
      className={`fm-chip ${active ? "is-active" : ""}`}
      onClick={onClick}
      title={title || ""}
    >
      {children}
    </button>
  );
}

/* =========================================================
   Page
========================================================= */
export default function FicheMouvement() {
  const navigate = useNavigate();
  const params = useParams();
  const { user: ctxUser, logout } = useContext(AuthContext) || {}; // 🔹 Récupère user & logout du contexte

  // Agence courante : URL > userData
  const localUser = JSON.parse(localStorage.getItem("userData") || "{}");
  const user = ctxUser || localUser; // 🔹 Si pas dans le contexte, prend localStorage
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

  // UI
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [movementName, setMovementName] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("fr");
  const [languages, setLanguages] = useState([]);
  const tCode = typeSel === "arrivee" ? "A" : typeSel === "depart" ? "D" : null;

  // Langues
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
        // pas bloquant
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload import
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRows(parsed.map((d) => ({ ...d, _type: deriveType(d), _to: d._to ?? pickTO(d), _ref_to: d._ref_to ?? pickRefTO(d) })));
          setMsg(`Import rechargé (${parsed.length}) pour l'agence ${currentAgenceId || "—"}.`);
        }
      } catch {}
    }
  }, [LS_KEY, currentAgenceId]);

  // Import fichier
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

    const formData = new FormData();
    formData.append("file", file);
    formData.append("agence", currentAgenceId);
    formData.append("langue", selectedLanguage);

    try {
      const res = await api.post("importer-dossier/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const list = Array.isArray(res.data?.dossiers) ? res.data.dossiers : [];
      const normalized = normalizeRows(list);
      localStorage.setItem(LS_KEY, JSON.stringify(normalized));
      setRows(normalized);
      const total = normalized.length;
      const crees = res.data?.dossiers_crees?.length || 0;
      const maj = res.data?.dossiers_mis_a_jour?.length || 0;
      setMsg(total ? `Import OK — ${crees} créé(s), ${maj} MAJ, total ${total}.` : "Aucune ligne exploitable.");
    } catch (err) {
      setMsg("Erreur lors de l'importation.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const clearImport = () => {
    localStorage.removeItem(LS_KEY);
    setRows([]);
    setTypeSel(null);
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setMsg("Import local vidé.");
  };

  /* =========================
     Options simples & lisibles
  ========================= */
  const dateOptions = useMemo(() => {
    if (!rows.length) return [];
    const set = new Set();
    (tCode ? rows.filter((r) => r._type === tCode) : rows).forEach((r) => {
      const dk = getDateKey(r);
      if (dk) set.add(dk);
    });
    return Array.from(set).sort();
  }, [rows, tCode]);

  const airportOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel) return [];
    const set = new Set();
    rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .forEach((r) => {
        const val = tCode === "D" ? (r.aeroport_depart || "").trim() : (r.aeroport_arrivee || "").trim();
        if (val) set.add(val);
      });
    return Array.from(set).sort();
  }, [rows, tCode, dateSel]);

  const flightOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel) return [];
    const map = new Map(); // flight -> {times:Set, pax,count}
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
        const entry = map.get(flight) || { flight, times: new Set(), pax: 0, count: 0 };
        if (tm) entry.times.add(formatShortTime(tm));
        entry.pax += pax;
        entry.count += 1;
        map.set(flight, entry);
      });
    return Array.from(map.values())
      .map((x) => ({ ...x, times: Array.from(x.times).sort() }))
      .sort((a, b) => b.pax - a.pax);
  }, [rows, tCode, dateSel, airportSel]);

  const toOptions = useMemo(() => {
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
    const map = new Map(); // to -> {pax,count}
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
    if (!rows.length || !tCode || !dateSel || !airportSel || flightsSel.length === 0) return [];
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

    const map = new Map(); // ville -> {hotels:Set, pax,count}
    filtered.forEach((r) => {
      const ville = (r.ville || "").toString().trim() || "—";
      const hotel =
        (typeof r.hotel_nom === "string" && r.hotel_nom) ||
        (typeof r.hotel_name === "string" && r.hotel_name) ||
        (typeof r.hotel === "string" && r.hotel) ||
        (r.hotel && r.hotel.nom) ||
        "";
      const pax = getPaxForType(r, tCode);
      const entry = map.get(ville) || { ville, hotels: new Set(), pax: 0, count: 0 };
      if (hotel) entry.hotels.add(hotel);
      entry.pax += pax;
      entry.count += 1;
      map.set(ville, entry);
    });

    return Array.from(map.values())
      .sort((a, b) => b.pax - a.pax)
      .map((v) => ({ ...v, hotels: Array.from(v.hotels) }));
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel]);

  // Dossiers effectivement sélectionnés par filtres (auto)
  const selectedRecords = useMemo(() => {
    if (!tCode || !dateSel || !airportSel) return [];
    let filtered = rows
      .filter((r) => r._type === tCode)
      .filter((r) => getDateKey(r) === dateSel)
      .filter((r) =>
        tCode === "D"
          ? (r.aeroport_depart || "").trim() === airportSel
          : (r.aeroport_arrivee || "").trim() === airportSel
      );
    if (flightsSel.length > 0) {
      filtered = filtered.filter((r) => flightsSel.includes(getFlightNo(r, tCode) || "—"));
    }
    if (tosSel.length > 0) {
      const st = new Set(tosSel);
      filtered = filtered.filter((r) => r._to && st.has(r._to));
    }
    if (villesSel.length > 0) {
      const sv = new Set(villesSel.map((x) => String(x).trim()));
      filtered = filtered.filter((r) => sv.has((r.ville || "").toString().trim() || "—"));
    }
    return filtered;
  }, [rows, tCode, dateSel, airportSel, flightsSel, tosSel, villesSel]);
  const selectedCount = selectedRecords.length;
  const selectedPax = useMemo(
    () => selectedRecords.reduce((acc, r) => acc + getPaxForType(r, tCode), 0),
    [selectedRecords, tCode]
  );

  const selectionObservations = useMemo(() => {
    const out = [];
    selectedRecords.forEach((d) => {
      const obs = pickObservation(d);
      if (obs) out.push({ ref: d.reference || "—", obs });
    });
    return out;
  }, [selectedRecords]);

  /* Create */
  const onCreate = async () => {
    setMsg("");
    if (!currentAgenceId) {
      setMsg("Agence inconnue. Ouvrez via /agence/:agence_id/fiche-mouvement.");
      return;
    }
    if (!tCode || !dateSel || !airportSel) {
      setMsg("Complétez Type, Date et Aéroport.");
      return;
    }
    if (selectedCount === 0) {
      setMsg("Aucun dossier correspondant.");
      return;
    }

    const payload = {
      agence: currentAgenceId,
      name: movementName || null,
      type: tCode,
      date: dateSel,
      aeroport: airportSel,
      dossier_ids: selectedRecords.map((r) => r.id).filter(Boolean),
      reference: formatRefFromDateKey(dateSel),
      tour_operateurs: Array.from(new Set(selectedRecords.map((r) => r._to).filter(Boolean))),
      villes: Array.from(new Set(selectedRecords.map((r) => (r.ville || "").trim() || "—").filter(Boolean))),
    };

    try {
      setCreating(true);
      await api.post("creer-fiche-mouvement/", payload);
      navigate(`/agence/${currentAgenceId}/fiches-mouvement`, { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data || {};
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
     UI — One page, hyper clair
  ========================================================= */
  return (
    
    <div className="fm-wrap">
      <header className="fm-top">
        <div className="fm-top-left">
          <h2>Fiche de mouvement</h2>
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

      <div className="fm-body">
        {/* Colonne Filtres */}
        <div className="fm-col fm-col-left">
          {/* Type */}
          <Section title="Type">
            <div className="fm-row chips">
              <Chip
                active={typeSel === "arrivee"}
                onClick={() => {
                  setTypeSel("arrivee");
                  setDateSel(""); setAirportSel(""); setFlightsSel([]); setTosSel([]); setVillesSel([]);
                }}
              >
                Arrivées
              </Chip>
              <Chip
                active={typeSel === "depart"}
                onClick={() => {
                  setTypeSel("depart");
                  setDateSel(""); setAirportSel(""); setFlightsSel([]); setTosSel([]); setVillesSel([]);
                }}
              >
                Départs
              </Chip>
            </div>
          </Section>

          {/* Date */}
          <Section
            title="Date du vol"
            disabled={!typeSel || dateOptions.length === 0}
            right={
              dateSel ? <span className="fm-badge">{dateSel}</span> : <span className="text-muted small">Choisir…</span>
            }
          >
            <select
              className="form-select"
              value={dateSel}
              onChange={(e) => {
                setDateSel(e.target.value);
                setAirportSel(""); setFlightsSel([]); setTosSel([]); setVillesSel([]);
              }}
              disabled={!typeSel || !dateOptions.length}
            >
              <option value="">— Sélectionner une date —</option>
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Section>

          {/* Aéroport */}
          <Section
            title={typeSel === "depart" ? "Aéroport de départ" : "Aéroport d’arrivée"}
            disabled={!dateSel || airportOptions.length === 0}
            right={
              airportSel ? (
                <span className="fm-badge">{airportSel}</span>
              ) : (
                <span className="text-muted small">Choisir…</span>
              )
            }
          >
            <select
              className="form-select"
              value={airportSel}
              onChange={(e) => {
                setAirportSel(e.target.value);
                setFlightsSel([]); setTosSel([]); setVillesSel([]);
              }}
              disabled={!dateSel || !airportOptions.length}
            >
              <option value="">— Sélectionner —</option>
              {airportOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Section>

          {/* Vols */}
          <Section title="Vols" disabled={!airportSel || flightOptions.length === 0}>
            <div className="fm-row chips-wrap">
              {airportSel && flightOptions.length === 0 && (
                <div className="text-muted small">Aucun vol trouvé.</div>
              )}
              {flightOptions.map((f) => {
                const act = flightsSel.includes(f.flight);
                const times = f.times.join(" / ");
                return (
                  <Chip
                    key={f.flight}
                    active={act}
                    onClick={() =>
                      setFlightsSel((prev) =>
                        prev.includes(f.flight) ? prev.filter((x) => x !== f.flight) : [...prev, f.flight]
                      )
                    }
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

          {/* T.O. */}
          <Section title="Tour opérateur" disabled={flightsSel.length === 0 || toOptions.length === 0}>
            <div className="fm-row chips-wrap">
              {flightsSel.length === 0 && <div className="text-muted small">Choisissez d’abord un vol.</div>}
              {flightsSel.length > 0 && toOptions.length === 0 && (
                <div className="text-muted small">Aucun T.O. pour ces vols.</div>
              )}
              {toOptions.map((t) => {
                const act = tosSel.includes(t.to);
                return (
                  <Chip
                    key={t.to}
                    active={act}
                    onClick={() =>
                      setTosSel((prev) => (prev.includes(t.to) ? prev.filter((x) => x !== t.to) : [...prev, t.to]))
                    }
                    title={`${t.count} dossiers • ${t.pax} pax`}
                  >
                    <strong>{t.to}</strong>
                    <span className="fm-chip-pill">{t.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* Villes & Hôtels */}
          <Section title="Villes & hôtels" disabled={tosSel.length === 0 || villeOptions.length === 0}>
            <div className="fm-city-list">
              {tosSel.length === 0 && <div className="text-muted small">Sélectionnez d’abord un T.O.</div>}
              {tosSel.length > 0 && villeOptions.length === 0 && (
                <div className="text-muted small">Aucune ville pour ce filtre.</div>
              )}
              {villeOptions.map((v) => {
                const checked = villesSel.includes(v.ville);
                const hotelsShort = v.hotels.slice(0, 3).join(", ");
                const more = v.hotels.length > 3 ? ` +${v.hotels.length - 3}` : "";
                return (
                  <label key={v.ville} className={`fm-city ${checked ? "is-checked" : ""}`} title={v.hotels.join(", ")}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={checked}
                      onChange={() =>
                        setVillesSel((prev) =>
                          prev.includes(v.ville) ? prev.filter((x) => x !== v.ville) : [...prev, v.ville]
                        )
                      }
                    />
                    <div className="fm-city-main">
                      <div className="fm-city-title">
                        <strong>{v.ville}</strong>
                        <span className="fm-city-hotels">{v.hotels.length ? ` — ${hotelsShort}${more}` : ""}</span>
                      </div>
                      <div className="fm-city-right">
                        <span className="fm-chip-pill">{v.pax} pax</span>
                        <span className="fm-chip-pill">{v.count} dossiers</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Section>
        </div>

        {/* Colonne Résumé */}
        <div className="fm-col fm-col-right">
          <div className="fm-summary">
            <div className="fm-summary-title">Résumé</div>
            <div className="fm-summary-row">
              <span>Type</span>
              <b>{tCode ? labelType(tCode) : "—"}</b>
            </div>
            <div className="fm-summary-row">
              <span>Date</span>
              <b>{dateSel || "—"}</b>
            </div>
            <div className="fm-summary-row">
              <span>Aéroport</span>
              <b>{airportSel || "—"}</b>
            </div>
            <div className="fm-summary-row">
              <span>Vol(s)</span>
              <b>{flightsSel.length || 0}</b>
            </div>
            <div className="fm-summary-row">
              <span>T.O.</span>
              <b>{tosSel.length || 0}</b>
            </div>
            <div className="fm-summary-row">
              <span>Villes</span>
              <b>{villesSel.length || 0}</b>
            </div>
            <div className="fm-summary-sep" />
            <div className="fm-summary-kpi">
              <div className="kpi">
                <div className="kpi-num">{selectedCount}</div>
                <div className="kpi-label">dossiers</div>
              </div>
              <div className="kpi">
                <div className="kpi-num">{selectedPax}</div>
                <div className="kpi-label">pax</div>
              </div>
            </div>
            <div className="fm-summary-input">
              <label>Nom de la fiche</label>
              <input
                className="form-control"
                placeholder={
                  tCode && dateSel && airportSel
                    ? `${labelType(tCode)} ${airportSel} ${dateSel}`
                    : "Ex: Arrivées TUN 2025-08-31"
                }
                value={movementName}
                onChange={(e) => setMovementName(e.target.value)}
              />
            </div>
            <button
              className="btn btn-success w-100"
              onClick={onCreate}
              disabled={creating || selectedCount === 0}
              title={selectedCount === 0 ? "Aucun dossier pour ces filtres" : "Créer la fiche"}
            >
              {creating ? "Création..." : `Créer la fiche (${selectedCount})`}
            </button>
          </div>

          {!!selectionObservations.length && (
            <div className="fm-observ">
              <div className="fm-observ-title">Observations</div>
              <div className="fm-observ-list">
                {selectionObservations.slice(0, 6).map((o, i) => (
                  <div key={i} className="fm-observ-item">
                    <b>{o.ref}</b> — {o.obs}
                  </div>
                ))}
                {selectionObservations.length > 6 && (
                  <div className="fm-observ-more">+ {selectionObservations.length - 6} autre(s)…</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Styles — one page, clean, sans scroll global */}
      <style>{`
        .fm-wrap{ height:100vh; display:flex; flex-direction:column; background:#f7f8fa; color:#0f172a; overflow:hidden; }
        .fm-top{ display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:#fff; border-bottom:1px solid #e5e7eb; }
        .fm-top h2{ margin:0; font-size:18px; font-weight:800; }
        .fm-msg{ font-size:12px; color:#475569; margin-top:4px; }
        .fm-top-left{ display:flex; flex-direction:column; }
        .fm-actions{ display:flex; align-items:center; gap:8px; }
        .fm-sep{ width:1px; height:20px; background:#e5e7eb; margin:0 4px; }

        .fm-body{ flex:1; display:grid; grid-template-columns: 3fr 2fr; gap:12px; padding:12px 16px; overflow:hidden; }
        .fm-col{ min-width:0; display:flex; flex-direction:column; gap:12px; overflow:auto; }
        .fm-col-left{ padding-right:2px; }
        .fm-col-right{ padding-left:2px; }

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

        .fm-city-list{ display:flex; flex-direction:column; gap:8px; }
        .fm-city{ border:1px solid #e5e7eb; border-radius:10px; padding:8px 10px; display:flex; gap:10px; align-items:flex-start; background:#fff; }
        .fm-city.is-checked{ border-color:#0ea5e9; box-shadow:0 0 0 2px rgba(14,165,233,.15) inset; }
        .fm-city-main{ display:flex; align-items:center; justify-content:space-between; width:100%; gap:8px; }
        .fm-city-title{ font-size:13px; display:flex; align-items:center; gap:6px; }
        .fm-city-hotels{ color:#64748b; }
        .fm-city-right{ display:flex; align-items:center; gap:6px; }

        .fm-summary{ background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:10px; }
        .fm-summary-title{ font-weight:800; font-size:14px; }
        .fm-summary-row{ display:flex; align-items:center; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px dashed #eef2f7; }
        .fm-summary-row:last-of-type{ border-bottom:none; }
        .fm-summary-sep{ height:1px; background:#eef2f7; }
        .fm-summary-kpi{ display:flex; gap:12px; }
        .kpi{ flex:1; text-align:center; background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:10px; }
        .kpi-num{ font-size:22px; font-weight:800; }
        .kpi-label{ font-size:12px; color:#64748b; }

        .fm-summary-input label{ font-size:12px; color:#475569; margin-bottom:4px; display:block; }
        .fm-observ{ margin-top:12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; padding:10px; }
        .fm-observ-title{ font-weight:800; font-size:13px; color:#9a3412; margin-bottom:6px; }
        .fm-observ-list{ display:flex; flex-direction:column; gap:6px; font-size:12px; color:#7c2d12; }
        .fm-observ-item b{ margin-right:6px; }

        /* Responsive */
        @media (max-width: 1100px){
          .fm-body{ grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
