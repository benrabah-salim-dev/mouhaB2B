import React from "react";
import useFicheMouvement from "./useFicheMouvement";
import { Section, Chip, Summary, Observations, ObservationsByHotel } from "./ui";
import "./ficheMouvement.css";

export default function FicheMouvementPage() {
  const {
    state,
    actions,
    options = {},
    selectionObservations,
    hotelObservationsFiltered
  } = useFicheMouvement();

  const {
    msg, currentAgenceId, typeSel, dateSel, airportSel, flightsSel,
    tosSel, villesSel, zoneSel, hotelsSel, selectedCount, selectedPax,
    movementName, creating, selectedLanguage, languages
  } = state;

  const {
    setTypeSel, setDateSel, setAirportSel, setFlightsSel, setTosSel,
    setVillesSel, setZoneSel, setHotelsSel, setMovementName, setSelectedLanguage,
    onCreate, onFile, clearImport
  } = actions;

  const { dateOptions, airportOptions, flightOptions, toOptions, zoneOptions, hotelOptions } = options;
  const tCode = typeSel === "arrivee" ? "A" : typeSel === "depart" ? "D" : null;

  return (
    <div className="fm-wrap">
      <header className="fm-top">
        <div className="fm-top-left">
          <h2>Fiche de mouvement</h2>
          {msg && <div className="fm-msg">{msg}</div>}
        </div>
        <div className="fm-actions">
          {currentAgenceId && (
            <a
              href={`/agence/${currentAgenceId}/dashboard`}
              className="btn btn-outline-secondary btn-sm"
            >
              ← Dashboard
            </a>
          )}
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() =>
              currentAgenceId
                ? (window.location.href = `/agence/${currentAgenceId}/fiches-mouvement`)
                : (window.location.href = "/fiches-mouvement")
            }
          >
            ↪ Fiches
          </button>

          <div className="fm-sep" />
          <select
            className="form-select form-select-sm"
            value={selectedLanguage}
            onChange={e => setSelectedLanguage(e.target.value)}
          >
            {languages.length
              ? languages.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)
              : <option>Langues…</option>}
          </select>
          <label className="btn btn-dark btn-sm m-0">
            Importer Excel
            <input type="file" accept=".xls,.xlsx" onChange={onFile} hidden />
          </label>
          <button className="btn btn-outline-danger btn-sm" onClick={clearImport}>🧹 Vider</button>
        </div>
      </header>

      <div className="fm-body">
        {/* Colonne gauche : filtres */}
        <div className="fm-col fm-col-left">

          {/* Type */}
          <Section title="Type">
            <Chip active={typeSel === "arrivee"} onClick={() => setTypeSel("arrivee")}>Arrivées</Chip>
            <Chip active={typeSel === "depart"} onClick={() => setTypeSel("depart")}>Départs</Chip>
          </Section>

          {/* Date du vol */}
          <Section title="Date du vol" disabled={!tCode}>
            <select className="form-select" value={dateSel} onChange={e => setDateSel(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {dateOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Section>

          {/* Aéroport */}
          <Section title="Aéroport" disabled={!dateSel}>
            <div className="fm-row chips-wrap">
              {airportOptions.map(a => {
                const act = airportSel === a.airport;
                return (
                  <Chip
                    key={a.airport}
                    active={act}
                    onClick={() => setAirportSel(a.airport)}
                  >
                    {a.airport} <span className="fm-chip-pill">{a.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* Vols */}
          <Section title="Vols" disabled={!airportSel}>
            <div className="chips-wrap">
              {flightOptions.map(f => {
                const act = flightsSel.includes(f.flight);
                return (
                  <Chip
                    key={f.flight}
                    active={act}
                    onClick={() =>
                      setFlightsSel(prev =>
                        prev.includes(f.flight)
                          ? prev.filter(x => x !== f.flight)
                          : [...prev, f.flight]
                      )
                    }
                  >
                    {f.time && <span className="fm-flight-time">{f.time}</span>}
                    {f.flight} <span className="fm-chip-pill">{f.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* Tour opérateurs */}
          <Section title="Tour opérateurs" disabled={!flightsSel.length}>
            <div className="fm-row chips-wrap">
              {toOptions.map(t => {
                const act = tosSel.includes(t.to);
                return (
                  <Chip
                    key={t.to}
                    active={act}
                    onClick={() =>
                      setTosSel(prev =>
                        prev.includes(t.to)
                          ? prev.filter(x => x !== t.to)
                          : [...prev, t.to]
                      )
                    }
                  >
                    {t.to} <span className="fm-chip-pill">{t.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* Zones */}
          <Section title="Zones" disabled={!tosSel.length}>
            <div className="fm-row chips-wrap">
              {zoneOptions.map(z => {
                const act = zoneSel === z.zone;
                return (
                  <Chip
                    key={z.zone}
                    active={act}
                    onClick={() => setZoneSel(z.zone)}
                  >
                    {z.zone} <span className="fm-chip-pill">{z.pax} pax</span>
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* Hôtels */}
          {zoneSel && (
            <Section title={`Hôtels de ${zoneSel}`} disabled={!hotelOptions?.length}>
              <div className="fm-row chips-wrap">
                {hotelOptions.map(h => {
                  const name = typeof h === "string" ? h : h.hotel;
                  const pax = (typeof h === "object" && h?.pax != null) ? h.pax : null;
                  const act = hotelsSel.includes(name);
                  return (
                    <Chip
                      key={name || "(Sans hôtel)"}
                      active={act}
                      onClick={() =>
                        setHotelsSel(prev =>
                          prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
                        )
                      }
                    >
                      {name || "(Sans hôtel)"}{" "}
                      {pax !== null && <span className="fm-chip-pill">{pax} pax</span>}
                    </Chip>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        {/* Colonne droite : résumé et observations */}
        <div className="fm-col fm-col-right">
          <Summary
            typeSel={typeSel} dateSel={dateSel} airportSel={airportSel}
            flightsSel={flightsSel} tosSel={tosSel} villesSel={villesSel}
            selectedCount={selectedCount} selectedPax={selectedPax}
            movementName={movementName} setMovementName={setMovementName}
            onCreate={onCreate} creating={creating}
          />

          {/* Observations globales de la sélection */}
<Observations list={selectionObservations} />

{/* Observations pour les hôtels sélectionnés */}
{hotelsSel?.length > 0 ? (
  Object.keys(hotelObservationsFiltered).length > 0 ? (
    <ObservationsByHotel grouped={hotelObservationsFiltered} />
  ) : (
    <div className="fm-observ fm-observ-empty" style={{ marginTop: 12 }}>
      Sans observations pour les hôtels sélectionnés.
    </div>
  )
) : null}

        </div>
      </div>
    </div>
  );
}
