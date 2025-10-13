// src/components/FicheMouvement/FicheMouvement.jsx
import React from "react";
import "./ficheMouvement.css";
import { useFicheMouvement } from "./useFicheMouvement";
import { Section, Chip } from "./ui";
import { Link } from "react-router-dom";

export default function FicheMouvement() {
  const vm = useFicheMouvement();

  const {
    currentAgenceId,
    navigate,
    msg,
    selectedLanguage,
    setSelectedLanguage,
    languages,
    loading,

    // filters & options
    typeSel, setTypeSel,
    dateSel, setDateSel,
    airportSel, setAirportSel,
    flightsSel, setFlightsSel,

    tosSel, setTosSel,
    villesSel, setVillesSel,
    hotelsSel, setHotelsSel,

    dateOptions,
    airportOptions,
    flightOptions,
    toOptions,
    villeOptions,
    hotelOptions,

    // derived
    tCode,

    // preview + mapping
    previewOpen, previewHeaders, previewRows, parsing,
    headerMap, setHeaderMap, TARGET_FIELDS,
    confirmImport, cancelPreview,
  } = vm;

  const canShowDate = !!typeSel && dateOptions.length > 0;
  const canShowAirport = canShowDate && !!dateSel && airportOptions.length > 0;
  const canShowFlights = canShowAirport && !!airportSel && flightOptions.length > 0;
  const showRightPane = !!dateSel && !!airportSel && flightsSel.length > 0;

  const resetDownstream = () => {
    setDateSel("");
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
  };

  const getHotel = (r) =>
    (typeof r.hotel_nom === "string" && r.hotel_nom) ||
    (typeof r.hotel_name === "string" && r.hotel_name) ||
    (typeof r.hotel === "string" && r.hotel) ||
    (r.hotel && r.hotel.nom) ||
    "(Sans hôtel)";

  const getVoyageur = (r) => {
    const last =
      r.nom_voyageur ||
      r.nom_client ||
      r.nom_passager ||
      r.nom ||
      r.last_name ||
      (r.client && (r.client.nom || r.client.name)) ||
      (r.passager && (r.passager.nom || r.passager.name)) ||
      r.client_name ||
      r.passenger_last ||
      "";
    const first =
      r.prenom_voyageur ||
      r.prenom_client ||
      r.prenom_passager ||
      r.prenom ||
      r.first_name ||
      (r.client && (r.client.prenom || r.client.first)) ||
      (r.passager && (r.passager.prenom || r.passager.first)) ||
      r.passenger_first ||
      "";
    const single =
      r.name ||
      r.client ||
      r["Nom Voyageur"] ||
      r["Voyageur"] ||
      r["Client"] ||
      r.passager ||
      r.passenger_name ||
      "";
    const full = [String(last).trim(), String(first).trim()].filter(Boolean).join(" ");
    return (full || String(single).trim() || "—").trim();
  };

  const paxOf = (r) =>
    tCode === "A"
      ? Number(r?.nombre_personnes_arrivee || 0)
      : tCode === "D"
      ? Number(r?.nombre_personnes_retour || 0)
      : 0;

  const getDateLabel = (opt) => (typeof opt === "string" ? opt : opt?.label || opt?.value || opt?.date || "—");
  const getDateCount = (opt) => (typeof opt === "object" ? opt.count ?? opt.total ?? opt.nb ?? opt.pax : undefined);
  const getAirportLabel = (opt) => (typeof opt === "string" ? opt : opt?.label || opt?.value || opt?.airport || "—");
  const getAirportCount = (opt) => (typeof opt === "object" ? opt.count ?? opt.total ?? opt.nb ?? opt.pax : undefined);

  const onSelectDate = (opt) => {
    const label = getDateLabel(opt);
    setDateSel(label);
    setAirportSel("");
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
  };
  const onToggleAirport = (opt) => {
    const label = getAirportLabel(opt);
    const next = airportSel === label ? "" : label;
    setAirportSel(next);
    setFlightsSel([]);
    setTosSel([]);
    setVillesSel([]);
    setHotelsSel([]);
  };

  const goToOrdre = () => {
    if (!tCode || !dateSel || !airportSel || flightsSel.length === 0 || (vm.filteredRecords || []).length === 0) return;

    // 1) Lignes sélectionnées (2e tableau)
    const selectedRows = (Array.isArray(vm.filteredRecords) ? vm.filteredRecords : [])
      .filter((r) => r?.id && vm.selectedDossierIds.has(r.id));

    if (selectedRows.length === 0) return;

    // 2) Total PAX du 2e tableau (sélection)
    const totalSelectedPax = selectedRows.reduce((acc, r) => acc + paxOf(r), 0);

    // 3) Heures des vols sélectionnés (une seule heure/vol)
    const selectedSet = new Set(flightsSel);
    const flightTimes = (flightOptions || [])
      .filter((f) => selectedSet.has(f.flight))
      .map((f) => {
        const time =
          (f.time && String(f.time).trim()) ||
          (Array.isArray(f.times) && f.times.length
            ? Array.from(new Set(f.times)).sort()[0]
            : null);
        return { flight: f.flight, time: time || null };
      });

    // 4) Groupage par hôtel sur les lignes sélectionnées
    const map = new Map();
    selectedRows.forEach((r) => {
      const hotel =
        (typeof r.hotel_nom === "string" && r.hotel_nom) ||
        (typeof r.hotel_name === "string" && r.hotel_name) ||
        (typeof r.hotel === "string" && r.hotel) ||
        (r.hotel && r.hotel.nom) ||
        "(Sans hôtel)";
      const key = String(hotel).trim();
      const entry = map.get(key) || { hotel: key, pax: 0, dossier_ids: [] };
      entry.pax += paxOf(r);
      entry.dossier_ids.push(r.id);
      map.set(key, entry);
    });
    const hotelsPayload = Array.from(map.values()).sort((a, b) => b.pax - a.pax);

    // 5) Navigation avec state complet
    const state = {
      agence: currentAgenceId,
      type: tCode,
      date: dateSel,
      aeroport: airportSel,
      vols: flightsSel,
      flightTimes,               // [{flight, time}]
      reference: `M_${dateSel}`,
      tour_operateurs: tosSel,
      villes: villesSel,
      hotelsPayload,             // groupé sur la sélection
      totalSelectedPax,          // total du 2e tableau
    };

    navigate(
      currentAgenceId ? `/agence/${currentAgenceId}/fiche-mouvement/ordre` : "/fiche-mouvement/ordre",
      { state }
    );
  };

  return (
    <div className="fm-page">
      <div className="fm-wrap">
        <header className="fm-top sticky">
          <div className="fm-top-left">
            <h2 className="fm-title m-0">Fiche de mouvement</h2>
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
              {(languages || []).length ? (
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
              <input type="file" accept=".xls,.xlsx" onChange={vm.onFile} hidden disabled={loading} />
            </label>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={vm.clearImport}>
              🧹 Vider
            </button>

            <div className="fm-sep" />
            <button
              type="button"
              className="btn btn-success btn-sm"
              disabled={!tCode || !dateSel || !airportSel || flightsSel.length === 0 || (vm.filteredRecords || []).length === 0}
              onClick={goToOrdre}
            >
              Étape suivante : Ordre des hôtels →
            </button>
          </div>
        </header>

        {/* ======= APERÇU IMPORT + MAPPING ======= */}
        {previewOpen && (
          <div className="card mt-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Aperçu (Top-10 lignes)</strong>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={cancelPreview}>
                  Annuler
                </button>
                <button className="btn btn-sm btn-primary" disabled={parsing} onClick={() => confirmImport("auto")}>
                  {parsing ? "Analyse…" : "Importer (auto)"}
                </button>
                <button className="btn btn-sm btn-success" disabled={parsing} onClick={() => confirmImport("manual")}>
                  {parsing ? "Analyse…" : "Importer avec ce mapping"}
                </button>
              </div>
            </div>

            {/* Barre de mapping (dans l’en-tête, pas de 2ème entête) */}
            <div className="card-body py-2">
              <div className="row g-2">
                {TARGET_FIELDS.map((f) => (
                  <div className="col-6 col-md-3" key={f.key}>
                    <label className="form-label mb-1 small">{f.label}</label>
                    <select
                      className="form-select form-select-sm"
                      value={headerMap?.[f.key] || ""}
                      onChange={(e) => setHeaderMap({ ...(headerMap || {}), [f.key]: e.target.value })}
                    >
                      <option value="">(auto)</option>
                      {previewHeaders.map((h) => (
                        <option key={`${f.key}-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="table-responsive" style={{ maxHeight: 360, overflow: "auto" }}>
              <table className="table table-sm table-striped table-bordered mb-0">
                <thead className="table-light">
                  <tr>
                    {previewHeaders.length ? (
                      previewHeaders.map((h, i) => <th key={`h-${i}`}>{String(h)}</th>)
                    ) : (
                      <th>(aucune colonne)</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length ? (
                    previewRows.map((row, rIdx) => (
                      <tr key={`r-${rIdx}`}>
                        {previewHeaders.map((h, cIdx) => (
                          <td key={`c-${rIdx}-${cIdx}`}>{String(row?.[h] ?? "").trim()}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={previewHeaders.length || 1} className="text-center text-muted">
                        Aucune donnée lisible.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="small text-muted p-2">Seules les 10 premières lignes sont affichées.</div>
            </div>
          </div>
        )}

        {/* ====== BODY: GAUCHE / DROITE ====== */}
        <div className="fm-body twocol">
          {/* GAUCHE */}
          <div className="fm-col-left">
            <Section
              title="Synthèse"
              className="stack stack-top"
              right={
                !showRightPane ? (
                  <span className="text-muted small">
                    Choisissez d'abord le type, la date, l'aéroport et les vols à droite
                  </span>
                ) : null
              }
            >
              {!showRightPane ? (
                <div className="alert alert-info m-0">
                  À droite : sélectionnez <b>Type</b> → <b>Date</b> → <b>Aéroport</b> → <b>Vol(s)</b>.
                </div>
              ) : (
                <div className="table-responsive fm-table-lg">
                  <table className="table table-striped table-hover align-middle fm-table-synth">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: "34%" }}>T.O</th>
                        <th style={{ width: "33%" }}>Zone (villes)</th>
                        <th style={{ width: "33%" }}>Hôtels (pax)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const maxLen = Math.max(toOptions.length, villeOptions.length, hotelOptions.length);
                        if (maxLen === 0) {
                          return (
                            <tr>
                              <td colSpan={3} className="text-center text-muted py-5">
                                Aucune donnée pour cette sélection.
                              </td>
                            </tr>
                          );
                        }
                        return Array.from({ length: maxLen }).map((_, i) => {
                          const to = toOptions[i];
                          const ville = villeOptions[i];
                          const hotel = hotelOptions[i];

                          const toLabel = to ? to.to ?? to.label ?? to : null;
                          const vLabel = ville ? ville.ville ?? ville.label ?? ville : null;
                          const hLabel = hotel ? hotel.hotel ?? hotel.label ?? hotel : null;

                          const toPax = typeof to?.pax === "number" ? to.pax : null;
                          const vPax = typeof ville?.pax === "number" ? ville.pax : null;
                          const hPax = typeof hotel?.pax === "number" ? hotel.pax : null;

                          return (
                            <tr key={`syn-${i}`}>
                              <td>
                                {to ? (
                                  <div className="rowline">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={vm.tosSel.includes(to.to)}
                                      onChange={(e) =>
                                        e.target.checked
                                          ? vm.setTosSel(Array.from(new Set([...vm.tosSel, to.to])))
                                          : vm.setTosSel(vm.tosSel.filter((k) => k !== to.to))
                                      }
                                      aria-label={`Sélectionner TO ${toLabel}`}
                                    />
                                    <strong>{toLabel}</strong>
                                    {toPax !== null && <span className="badge bg-secondary">{toPax} pax</span>}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {ville ? (
                                  <div className="rowline">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={vm.villesSel.includes(vLabel)}
                                      onChange={(e) =>
                                        e.target.checked
                                          ? vm.setVillesSel(Array.from(new Set([...vm.villesSel, vLabel])))
                                          : vm.setVillesSel(vm.villesSel.filter((k) => k !== vLabel))
                                      }
                                      aria-label={`Sélectionner zone ${vLabel}`}
                                    />
                                    <strong>{vLabel}</strong>
                                    {vPax !== null && <span className="badge bg-secondary">{vPax} pax</span>}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {hotel ? (
                                  <div className="rowline">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={vm.hotelsSel.includes(hLabel)}
                                      onChange={(e) =>
                                        e.target.checked
                                          ? vm.setHotelsSel(Array.from(new Set([...vm.hotelsSel, hLabel])))
                                          : vm.setHotelsSel(vm.hotelsSel.filter((k) => k !== hLabel))
                                      }
                                      aria-label={`Sélectionner hôtel ${hLabel}`}
                                    />
                                    <strong>{hLabel}</strong>
                                    {hPax !== null && <span className="badge bg-secondary">{hPax} pax</span>}
                                  </div>
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

            {/* ===== DÉTAILS ===== */}
            {showRightPane && (tosSel.length + villesSel.length + hotelsSel.length > 0) && (
              <Section title="Détails des dossiers (visibles)" className="stack stack-bottom">
                {(() => {
                  const rowsVis = Array.isArray(vm.filteredRecords) ? vm.filteredRecords : [];

                  const selectedPax = rowsVis.reduce(
                    (acc, r) => (!r?.id || !vm.selectedDossierIds.has(r.id) ? acc : acc + paxOf(r)),
                    0
                  );

                  return (
                    <>
                      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                        <span className="badge bg-primary">PAX sélectionnés : {selectedPax}</span>
                      </div>

                      <div className="table-responsive">
                        <table className="table table-hover align-middle">
                          <thead className="table-light">
                            <tr>
                              <th style={{ width: 36 }}>
                                {(() => {
                                  const allCheckable = rowsVis.filter((r) => r && r.id);
                                  const allChecked =
                                    allCheckable.length > 0 &&
                                    allCheckable.every((r) => vm.selectedDossierIds.has(r.id));
                                  const toggleAll = (checked) => {
                                    const next = new Set(vm.selectedDossierIds);
                                    allCheckable.forEach((r) => {
                                      if (checked) next.add(r.id);
                                      else next.delete(r.id);
                                    });
                                    vm.setSelectedDossierIds(next);
                                  };
                                  return (
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      aria-label="Tout sélectionner (détails)"
                                      checked={allChecked}
                                      onChange={(e) => toggleAll(e.target.checked)}
                                    />
                                  );
                                })()}
                              </th>
                              <th>Hôtel</th>
                              <th>Nom client</th>
                              <th style={{ width: 80 }}>Pax</th>
                              <th>Observations</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rowsVis.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-center text-muted py-4">
                                  Aucune ligne à afficher pour cette sélection.
                                </td>
                              </tr>
                            ) : (
                              rowsVis.map((r, i) => {
                                const checked = r?.id ? vm.selectedDossierIds.has(r.id) : false;
                                const onToggle = (val) => {
                                  if (!r?.id) return;
                                  const next = new Set(vm.selectedDossierIds);
                                  if (val) next.add(r.id);
                                  else next.delete(r.id);
                                  vm.setSelectedDossierIds(next);
                                };

                                return (
                                  <tr key={vm.rowKeyOf(r, i)}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        className="form-check-input"
                                        aria-label="Sélectionner ligne détails"
                                        checked={checked}
                                        onChange={(e) => onToggle(e.target.checked)}
                                      />
                                    </td>
                                    <td>{getHotel(r)}</td>
                                    <td>{getVoyageur(r)}</td>
                                    <td>{paxOf(r)} pax</td>
                                    <td>{(r.observation && String(r.observation).trim()) || ""}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </Section>
            )}
          </div>

          {/* DROITE */}
          <aside className="fm-col-right sidebar">
            <Section title="Type de mouvement">
              <div className="fm-type-inline">
                <Chip
                  active={typeSel === "arrivee"}
                  onClick={() => {
                    setTypeSel("arrivee");
                    resetDownstream();
                  }}
                  title="Arrivées"
                >
                  Arrivées
                </Chip>
                <Chip
                  active={typeSel === "depart"}
                  onClick={() => {
                    setTypeSel("depart");
                    resetDownstream();
                  }}
                  title="Départs"
                >
                  Départs
                </Chip>
              </div>
            </Section>

            {canShowDate && (
              <Section title="Date du vol">
                <select
                  className="form-select form-select-sm"
                  value={dateSel}
                  onChange={(e) => {
                    const v = e.target.value || "";
                    v ? onSelectDate(v) : resetDownstream();
                  }}
                  aria-label="Choisir la date"
                >
                  <option value="">— Sélectionner —</option>
                  {dateOptions.map((d) => {
                    const label = getDateLabel(d);
                    const count = getDateCount(d);
                    return (
                      <option key={label} value={label}>
                        {label}
                        {typeof count === "number" ? ` • ${count}` : ""}
                      </option>
                    );
                  })}
                </select>
              </Section>
            )}

            {canShowAirport && (
              <Section title={typeSel === "depart" ? "Aéroport de départ" : "Aéroport d’arrivée"}>
                <select
                  className="form-select form-select-sm"
                  value={airportSel}
                  onChange={(e) => {
                    const v = e.target.value || "";
                    v ? onToggleAirport(v) : onToggleAirport(airportSel);
                  }}
                  aria-label="Choisir l'aéroport"
                >
                  <option value="">— Sélectionner —</option>
                  {airportOptions.map((a) => {
                    const label = getAirportLabel(a);
                    const count = getAirportCount(a);
                    return (
                      <option key={label} value={label}>
                        {label}
                        {typeof count === "number" ? ` • ${count}` : ""}
                      </option>
                    );
                  })}
                </select>
              </Section>
            )}

            {canShowFlights && (
              <Section title="Vols (cases à cocher)">
                <div className="fm-flights">
                  {/* Tout sélectionner */}
                  {(() => {
                    const allIds = flightOptions.map((f) => f.flight);
                    const allChecked =
                      allIds.length > 0 && allIds.every((id) => flightsSel.includes(id));
                    const toggleAll = (checked) => {
                      setFlightsSel(checked ? allIds : []);
                    };
                    return (
                      <div className="form-check mb-2">
                        <input
                          id="flights-select-all"
                          type="checkbox"
                          className="form-check-input"
                          checked={allChecked}
                          onChange={(e) => toggleAll(e.target.checked)}
                        />
                        <label htmlFor="flights-select-all" className="form-check-label">
                          Tout sélectionner ({allIds.length})
                        </label>
                      </div>
                    );
                  })()}

                  {/* Liste des vols */}
                  <div className="fm-flight-list">
                    {flightOptions.length === 0 ? (
                      <div className="text-muted small">Aucun vol pour cette sélection.</div>
                    ) : (
                      flightOptions.map((f) => {
                        const hour =
                          (f.time && String(f.time).trim()) ||
                          (Array.isArray(f.times) && f.times.length
                            ? Array.from(new Set(f.times)).sort()[0]
                            : null);
                        const labelParts = [
                          f.flight || "—",
                          hour ? hour : null,
                          typeof f.pax === "number" ? `${f.pax} pax` : null,
                        ].filter(Boolean);
                        const label = labelParts.join(" • ");
                        const checked = flightsSel.includes(f.flight);
                        const toggleOne = (isChecked) => {
                          const next = new Set(flightsSel);
                          if (isChecked) next.add(f.flight);
                          else next.delete(f.flight);
                          setFlightsSel(Array.from(next));
                        };
                        const cid = `fl-${f.flight}`;
                        return (
                          <div className="form-check fm-flight-item" key={f.flight}>
                            <input
                              id={cid}
                              type="checkbox"
                              className="form-check-input"
                              checked={checked}
                              onChange={(e) => toggleOne(e.target.checked)}
                            />
                            <label htmlFor={cid} className="form-check-label">
                              {label}
                            </label>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="small text-muted mt-2">
                    Astuce : utilisez “Tout sélectionner” puis décochez au besoin.
                  </div>
                </div>
              </Section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
