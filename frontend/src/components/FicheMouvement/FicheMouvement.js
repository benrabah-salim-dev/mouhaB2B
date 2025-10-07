import React, { useEffect, useMemo } from "react";
import "./ficheMouvement.css";
import { useFicheMouvement } from "./useFicheMouvement";
import { Section, Chip, TopSummaryBar } from "./ui";
import { Link } from "react-router-dom";

export default function FicheMouvement() {
  const vm = useFicheMouvement();

  const {
    currentAgenceId,
    navigate,
    msg,
    creating,
    movementName,
    setMovementName,
    selectedLanguage,
    setSelectedLanguage,
    languages,
    loading,

    // filters & options
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

    dateOptions,
    airportOptions,
    flightOptions,
    toOptions,
    villeOptions,
    hotelOptions,

    // derived
    tCode,
    selectedCount,
    selectedPax,
    obsCount,

    // data & selection
    groupedByHotel,
    selectedDossierIds,
    setSelectedDossierIds,

    // actions
    onFile,
    clearImport,
    onCreate,

    // utils
    getPaxDisplay,
    rowKeyOf,
  } = vm;

  const canShowDate = !!typeSel && dateOptions.length > 0;
  const canShowAirport = canShowDate && !!dateSel && airportOptions.length > 0;
  const canShowFlights =
    canShowAirport && !!airportSel && flightOptions.length > 0;
  const showRightPane = !!dateSel && !!airportSel && flightsSel.length > 0;

  const resetDownstream = () => {
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
    setSelectedDossierIds(new Set());
  };

  // Helpers d’affichage (supporte string | object)
  const getDateLabel = (opt) =>
    typeof opt === "string"
      ? opt
      : opt?.label || opt?.value || opt?.date || "—";
  const getDateCount = (opt) =>
    typeof opt === "object"
      ? opt.count ?? opt.total ?? opt.nb ?? opt.pax
      : undefined;

  const getAirportLabel = (opt) =>
    typeof opt === "string"
      ? opt
      : opt?.label || opt?.value || opt?.airport || "—";
  const getAirportCount = (opt) =>
    typeof opt === "object"
      ? opt.count ?? opt.total ?? opt.nb ?? opt.pax
      : undefined;

  const isAirportActive = (opt) => airportSel === getAirportLabel(opt);
  const isDateActive = (opt) => dateSel === getDateLabel(opt);

  const onSelectDate = (opt) => {
    const label = getDateLabel(opt);
    setDateSel(label);
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
    setSelectedDossierIds(new Set());
  };

  const onToggleAirport = (opt) => {
    const label = getAirportLabel(opt);
    const next = airportSel === label ? "" : label;
    setAirportSel(next);
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
    setSelectedDossierIds(new Set());
  };

  const onToggleFlight = (f) => {
    setFlightsSel((prev) =>
      prev.includes(f.flight)
        ? prev.filter((x) => x !== f.flight)
        : [...prev, f.flight]
    );
    setSelectedDossierIds(new Set());
  };

  /* ======= NOUVEAU : handlers Select ======= */
  const onDateChange = (e) => {
    const val = e.target.value || "";
    if (!val) {
      resetDownstream();
      return;
    }
    onSelectDate(val);
  };

  const onAirportChange = (e) => {
    const val = e.target.value || "";
    if (!val) {
      setAirportSel("");
      setFlightsSel([]);
      setTosSel([]);
      setVillesSel([]);
      setHotelsSel([]);
      setSelectedDossierIds(new Set());
      return;
    }
    onToggleAirport(val);
  };

  const onFlightsChange = (e) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setFlightsSel(values);
    setSelectedDossierIds(new Set());
  };

  /* ==================== Tableau présélectionné (pane droite) ==================== */

  // helpers pour extraire la clé d'un item (string | object)
  const toKey = (o) =>
    typeof o === "string" ? o : o?.to ?? o?.label ?? o?.value ?? "";
  const villeKey = (o) =>
    typeof o === "string" ? o : o?.ville ?? o?.label ?? o?.value ?? "";
  const hotelKey = (o) =>
    typeof o === "string" ? o : o?.hotel ?? o?.label ?? o?.value ?? "";

  // pré-sélectionner tout quand le panneau droit devient visible
  useEffect(() => {
    if (!showRightPane) return;
    if (!tosSel.length && toOptions.length) setTosSel(toOptions.map(toKey));
    if (!villesSel.length && villeOptions.length)
      setVillesSel(villeOptions.map(villeKey));
    if (!hotelsSel.length && hotelOptions.length)
      setHotelsSel(hotelOptions.map(hotelKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRightPane, toOptions, villeOptions, hotelOptions]);

  // "tout sélectionné ?" par colonne
  const allTOSelected = useMemo(
    () => toOptions.length > 0 && tosSel.length === toOptions.length,
    [toOptions, tosSel]
  );
  const allVillesSelected = useMemo(
    () => villeOptions.length > 0 && villesSel.length === villeOptions.length,
    [villeOptions, villesSel]
  );
  const allHotelsSelected = useMemo(
    () => hotelOptions.length > 0 && hotelsSel.length === hotelOptions.length,
    [hotelOptions, hotelsSel]
  );

  // toggles master
  const setAllTO = (checked) => setTosSel(checked ? toOptions.map(toKey) : []);
  const setAllVilles = (checked) =>
    setVillesSel(checked ? villeOptions.map(villeKey) : []);
  const setAllHotels = (checked) =>
    setHotelsSel(checked ? hotelOptions.map(hotelKey) : []);

  // toggles unitaires
  const toggleOneTO = (key, checked) =>
    setTosSel((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)
    );
  const toggleOneVille = (key, checked) =>
    setVillesSel((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)
    );
  const toggleOneHotel = (key, checked) =>
    setHotelsSel((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)
    );

  return (
    <div className="fm-page">
      <div className="fm-wrap">
        <header className="fm-top sticky">
          {/* LEFT: Titre puis Type */}
          <div className="fm-top-left">
            <h2 className="fm-title m-0">Fiche de mouvement</h2>

            <div className="fm-type-inline">
              <Chip
                active={typeSel === "arrivee"}
                onClick={() => {
                  setTypeSel("arrivee");
                  resetDownstream();
                }}
                title="Créer/paramétrer une fiche d'Arrivée"
              >
                Arrivées
              </Chip>
              <Chip
                active={typeSel === "depart"}
                onClick={() => {
                  setTypeSel("depart");
                  resetDownstream();
                }}
                title="Créer/paramétrer une fiche de Départ"
              >
                Départs
              </Chip>
            </div>

            {msg ? <div className="fm-msg">{msg}</div> : null}
          </div>

          {/* RIGHT: actions */}
          <div className="fm-actions">
            {currentAgenceId ? (
              <Link
                className="btn btn-outline-secondary btn-sm"
                to={`/agence/${currentAgenceId}/dashboard`}
              >
                ← Dashboard
              </Link>
            ) : null}

            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() =>
                currentAgenceId
                  ? navigate(`/agence/${currentAgenceId}/fiches-mouvement`)
                  : navigate("/fiches-mouvement")
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
              <input
                type="file"
                accept=".xls,.xlsx"
                onChange={onFile}
                hidden
                disabled={loading}
              />
            </label>

            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={clearImport}
            >
              🧹 Vider
            </button>
          </div>
        </header>

        {/* Résumé */}

        {/* ====== BODY: 2 colonnes ====== */}
        <div className="fm-body twocol">
          {/* ===== Colonne gauche : Date / Aéroport / Vols ===== */}
          <div className="fm-col-left">
            {/* DATE => Select compact */}
            {canShowDate && (
              <Section title="">
                <div className="d-flex gap-2 align-items-center">
                  <select
                    className="form-select form-select-sm"
                    value={dateSel}
                    onChange={onDateChange}
                    title="Choisir une date"
                  >
                    <option value="">DATE</option>
                    {dateOptions.map((d) => {
                      const label = getDateLabel(d);
                      const count = getDateCount(d);
                      return (
                        <option key={label} value={label}>
                          {typeof count === "number" ? `${count} • ` : ""}
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </Section>
            )}

            {/* AÉROPORT => Select compact */}
            {canShowAirport && (
              <Section
                title={
                  typeSel === "depart"
                    ? "Aéroport de départ"
                    : "Aéroport d’arrivée"
                }
              >
                <div className="d-flex gap-2 align-items-center">
                  <select
                    className="form-select form-select-sm"
                    value={airportSel}
                    onChange={onAirportChange}
                    title="Choisir un aéroport"
                  >
                    <option value="">— Sélectionner —</option>
                    {airportOptions.map((a) => {
                      const label = getAirportLabel(a);
                      const count = getAirportCount(a);
                      return (
                        <option key={label} value={label}>
                          {typeof count === "number" ? `${count} • ` : ""}
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </Section>
            )}

            {/* VOLS => Multi-select compact (sans scroll) */}
            {canShowFlights && (
              <Section title="Vols (multi-sélection)">
                <select
                  multiple
                  size={Math.min(6, Math.max(3, flightOptions.length))}
                  className="form-select form-select-sm"
                  value={flightsSel}
                  onChange={onFlightsChange}
                  title="Sélectionner un ou plusieurs vols"
                  style={{ maxHeight: "12rem" }}
                >
                  {flightOptions.map((f) => {
                    const labelParts = [
                      f.flight || "—",
                      f.times?.length ? f.times.join(" / ") : null,
                      typeof f.pax === "number" ? `${f.pax} pax` : null,
                    ].filter(Boolean);
                    return (
                      <option key={f.flight} value={f.flight}>
                        {labelParts.join(" • ")}
                      </option>
                    );
                  })}
                </select>
                <div className="small text-muted mt-1">
                  Astuce: CTRL/Cmd+clic pour multi-sélectionner.
                </div>
              </Section>
            )}
          </div>

          {/* ===== Colonne droite : Tableau TO / Zones / Hôtels ===== */}
          <div className={`fm-col-right ${showRightPane ? "" : "is-disabled"}`}>
            <Section
              title="Synthèse"
              right={
                !showRightPane ? (
                  <span className="text-muted small">
                    Choisir une date, un aéroport et au moins un vol
                  </span>
                ) : null
              }
            >
              {!showRightPane ? (
                <div className="alert alert-info m-0">
                  Sélectionnez successivement une <b>date</b>, un{" "}
                  <b>aéroport</b> puis au moins <b>un vol</b> pour afficher la
                  synthèse.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped align-middle">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: "33%" }}>
                          <div className="d-flex align-items-center gap-2">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={allTOSelected}
                              onChange={(e) => setAllTO(e.target.checked)}
                              aria-label="Tout sélectionner T.O"
                            />
                            <span>T.O</span>
                            <span className="badge bg-secondary">
                              {toOptions.length}
                            </span>
                          </div>
                        </th>
                        <th style={{ width: "33%" }}>
                          <div className="d-flex align-items-center gap-2">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={allVillesSelected}
                              onChange={(e) => setAllVilles(e.target.checked)}
                              aria-label="Tout sélectionner Zones"
                            />
                            <span>Zone (villes)</span>
                            <span className="badge bg-secondary">
                              {villeOptions.length}
                            </span>
                          </div>
                        </th>
                        <th style={{ width: "34%" }}>
                          <div className="d-flex align-items-center gap-2">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={allHotelsSelected}
                              onChange={(e) => setAllHotels(e.target.checked)}
                              aria-label="Tout sélectionner Hôtels"
                            />
                            <span>Hôtels (pax)</span>
                            <span className="badge bg-secondary">
                              {hotelOptions.length}
                            </span>
                          </div>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {(() => {
                        const maxLen = Math.max(
                          toOptions.length,
                          villeOptions.length,
                          hotelOptions.length
                        );
                        if (maxLen === 0) {
                          return (
                            <tr>
                              <td
                                colSpan={3}
                                className="text-center text-muted py-4"
                              >
                                Aucune donnée disponible pour cette sélection.
                              </td>
                            </tr>
                          );
                        }

                        return Array.from({ length: maxLen }).map((_, i) => {
                          const to = toOptions[i];
                          const ville = villeOptions[i];
                          const hotel = hotelOptions[i];

                          const toLabel = to ? to.to ?? to.label ?? to : null;
                          const toPax =
                            typeof to?.pax === "number" ? to.pax : null;
                          const toK = to ? toKey(to) : null;
                          const toChecked = toK ? tosSel.includes(toK) : false;

                          const vLabel = ville
                            ? ville.ville ?? ville.label ?? ville
                            : null;
                          const vPax =
                            typeof ville?.pax === "number" ? ville.pax : null;
                          const vK = ville ? villeKey(ville) : null;
                          const vChecked = vK ? villesSel.includes(vK) : false;

                          const hLabel = hotel
                            ? hotel.hotel ?? hotel.label ?? hotel
                            : null;
                          const hPax =
                            typeof hotel?.pax === "number" ? hotel.pax : null;
                          const hK = hotel ? hotelKey(hotel) : null;
                          const hChecked = hK ? hotelsSel.includes(hK) : false;

                          return (
                            <tr key={i}>
                              {/* T.O */}
                              <td>
                                {to ? (
                                  <label className="d-flex align-items-center gap-2 m-0">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={toChecked}
                                      onChange={(e) =>
                                        toggleOneTO(toK, e.target.checked)
                                      }
                                    />
                                    <span>
                                      <strong>{toLabel}</strong>
                                    </span>
                                    {toPax !== null && (
                                      <span className="badge bg-secondary">
                                        {toPax} pax
                                      </span>
                                    )}
                                  </label>
                                ) : (
                                  "—"
                                )}
                              </td>

                              {/* Zone */}
                              <td>
                                {ville ? (
                                  <label className="d-flex align-items-center gap-2 m-0">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={vChecked}
                                      onChange={(e) =>
                                        toggleOneVille(vK, e.target.checked)
                                      }
                                    />
                                    <span>
                                      <strong>{vLabel}</strong>
                                    </span>
                                    {vPax !== null && (
                                      <span className="badge bg-secondary">
                                        {vPax} pax
                                      </span>
                                    )}
                                  </label>
                                ) : (
                                  "—"
                                )}
                              </td>

                              {/* Hôtel */}
                              <td>
                                {hotel ? (
                                  <label className="d-flex align-items-center gap-2 m-0">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={hChecked}
                                      onChange={(e) =>
                                        toggleOneHotel(hK, e.target.checked)
                                      }
                                    />
                                    <span>
                                      <strong>{hLabel}</strong>
                                    </span>
                                    {hPax !== null && (
                                      <span className="badge bg-secondary">
                                        {hPax} pax
                                      </span>
                                    )}
                                  </label>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
