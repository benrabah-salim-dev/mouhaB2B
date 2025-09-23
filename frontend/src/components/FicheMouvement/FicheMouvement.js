import React from "react";
import "./ficheMouvement.css";
import { useFicheMouvement } from "./useFicheMouvement";
import { Section, Chip, TopSummaryBar } from "./ui";
import { Link } from "react-router-dom";

export default function FicheMouvement() {
  const vm = useFicheMouvement();
  const {
    currentAgenceId, navigate,
    msg, creating, movementName, setMovementName,
    selectedLanguage, setSelectedLanguage, languages, loading,
    // filters & options
    typeSel, setTypeSel, dateSel, setDateSel, airportSel, setAirportSel,
    flightsSel, setFlightsSel, tosSel, setTosSel, villesSel, setVillesSel, hotelsSel, setHotelsSel,
    dateOptions, airportOptions, flightOptions, toOptions, villeOptions, hotelOptions,
    // derived
    tCode, selectedCount, selectedPax, obsCount,
    // data & selection
    groupedByHotel, selectedDossierIds, setSelectedDossierIds,
    // actions
    onFile, clearImport, onCreate,
    // utils
    getPaxDisplay, rowKeyOf,
  } = vm;

  return (
    <div className="fm-page">
      <div className="fm-wrap">
        <header className="fm-top sticky">
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

        {/* Résumé */}
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
          obsCount={obsCount}
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

          {/* AÉROPORT */}
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
                      const next = act ? "" : a;
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
          <Section title="Vols" disabled={!airportSel || vm.flightOptions.length === 0}>
            <div className="fm-row chips-wrap">
              {airportSel && vm.flightOptions.length === 0 && <div className="text-muted small">Aucun vol trouvé.</div>}
              {vm.flightOptions.map((f) => {
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
          <Section title="Tour opérateur" disabled={flightsSel.length === 0 || vm.toOptions.length === 0}>
            <div className="fm-row chips-wrap">
              {flightsSel.length === 0 && <div className="text-muted small">Choisissez d’abord un vol.</div>}
              {flightsSel.length > 0 && vm.toOptions.length === 0 && <div className="text-muted small">Aucun T.O. pour ces vols.</div>}
              {vm.toOptions.map((t) => {
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

          {/* ZONES */}
          <Section title="Zones (villes)" disabled={tosSel.length === 0 || vm.villeOptions.length === 0}>
            {tosSel.length === 0 && <div className="text-muted small">Sélectionnez d’abord un T.O.</div>}
            <div className="fm-row chips-wrap">
              {vm.villeOptions.map((v) => {
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

          {/* HÔTELS */}
          <Section title="Hôtels" disabled={vm.villeOptions.length === 0 || (villesSel.length === 0 && vm.hotelOptions.length === 0)}>
            {villesSel.length === 0 && <div className="text-muted small">Sélectionnez d’abord au moins une zone.</div>}
            <div className="fm-row chips-wrap">
              {vm.hotelOptions.map((h) => {
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

          {/* PAX PAR HÔTEL */}
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
                      {list.map((r, i) => {
                        const checked = selectedDossierIds.has(r.id);
                        const hasObs = !!(r.observation && String(r.observation).trim());
                        const k = rowKeyOf(r, i);
                        const isOpen = vm.openObs.has(k);
                        return (
                          <label key={r.id || `${k}`} className={`fm-passenger ${checked ? "is-checked" : ""}`}>
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
                              <div className="fm-passenger-name fm-passenger-name--resa">
                                <span className="fm-resa-name">{(r.nom_reservation || "").trim() || "—"}</span>
                                <span className="fm-resa-pax">{getPaxDisplay(r, tCode)}</span>

                                {hasObs ? (
                                  <button
                                    type="button"
                                    className={`fm-resa-caret ${isOpen ? "is-open" : ""}`}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); vm.toggleObs(k); }}
                                    aria-expanded={isOpen}
                                    aria-label={isOpen ? "Masquer l'observation" : "Afficher l'observation"}
                                    title={isOpen ? "Masquer l'observation" : "Afficher l'observation"}
                                  >
                                    <span className="warn-icon" aria-hidden="true">⚠️</span>
                                  </button>
                                ) : null}
                              </div>

                              {hasObs && isOpen ? (
                                <div className="fm-obs-panel">
                                  {String(r.observation).trim()}
                                </div>
                              ) : null}
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
    </div>
  );
}
