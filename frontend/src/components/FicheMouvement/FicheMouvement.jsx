// FRONTEND: FicheMouvement.jsx (v3.2)
// ========================
import React from "react";
import "./ficheMouvement.css";
import { useFicheMouvement } from "./useFicheMouvement";
import { Section, Chip } from "./ui"; // TopSummaryBar retiré (non utilisé)
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

    // filters & options (➡️ DROITE)
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

  // Helpers (string | object)
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

  const getDateLabel = (opt) =>
    typeof opt === "string" ? opt : opt?.label || opt?.value || opt?.date || "—";
  const getDateCount = (opt) =>
    typeof opt === "object" ? opt.count ?? opt.total ?? opt.nb ?? opt.pax : undefined;
  const getAirportLabel = (opt) =>
    typeof opt === "string" ? opt : opt?.label || opt?.value || opt?.airport || "—";
  const getAirportCount = (opt) =>
    typeof opt === "object" ? opt.count ?? opt.total ?? opt.nb ?? opt.pax : undefined;

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
  const onFlightsChange = (e) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setFlightsSel(values);
  };

  // === helper local pour préparer l'étape "Ordre des hôtels"
  const getHotelLabel = (r) =>
    (typeof r.hotel_nom === "string" && r.hotel_nom) ||
    (typeof r.hotel_name === "string" && r.hotel_name) ||
    (typeof r.hotel === "string" && r.hotel) ||
    (r.hotel && r.hotel.nom) ||
    "(Sans hôtel)";

  const goToHotelOrder = () => {
    if (!tCode || !dateSel || !airportSel || flightsSel.length === 0) return;

    const rows = (Array.isArray(vm.filteredRecords) ? vm.filteredRecords : [])
      .filter((r) => r?.id && vm.selectedDossierIds.has(r.id));

    // groupage par hôtel: {hotel, pax, dossier_ids[]}
    const map = new Map();
    rows.forEach((r) => {
      const hotel = getHotelLabel(r);
      const pax =
        (tCode === "A"
          ? Number(r.nombre_personnes_arrivee || 0)
          : tCode === "D"
          ? Number(r.nombre_personnes_retour || 0)
          : 0) || 0;
      const entry = map.get(hotel) || { hotel, pax: 0, dossier_ids: [] };
      entry.pax += pax;
      entry.dossier_ids.push(r.id);
      map.set(hotel, entry);
    });

    const hotels = Array.from(map.values()).sort((a, b) => b.pax - a.pax);

    const payload = {
      agence: vm.currentAgenceId || "",
      name: vm.movementName || "",
      type: tCode,                 // "A" ou "D"
      date: dateSel,               // "YYYY-MM-DD"
      aeroport: airportSel,
      vols: flightsSel,            // info utile pour la fiche
      filters: {
        tos: vm.tosSel,
        villes: vm.villesSel,
        hotels: vm.hotelsSel,
      },
      hotels,                      // [{hotel, pax, dossier_ids[]}]
    };

    const path = vm.currentAgenceId
      ? `/agence/${vm.currentAgenceId}/fiche-mouvement/ordre`
      : `/fiche-mouvement/ordre`;

    vm.navigate(path, { state: payload });
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
                onChange={vm.onFile}
                hidden
                disabled={loading}
              />
            </label>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={vm.clearImport}
            >
              🧹 Vider
            </button>

            {/* —— Étape suivante : ordre des hôtels —— */}
            <div className="fm-sep" />
            <button
  type="button"
  className="btn btn-success btn-sm"
  disabled={
    !tCode ||
    !dateSel ||
    !airportSel ||
    flightsSel.length === 0 ||
    vm.filteredRecords.length === 0
  }
  onClick={() => {
    // on regroupe par hôtel ce qui est présentement visible (après filtres)
    const map = new Map();
    vm.filteredRecords.forEach((r) => {
      const hotel =
        (typeof r.hotel_nom === "string" && r.hotel_nom) ||
        (typeof r.hotel_name === "string" && r.hotel_name) ||
        (typeof r.hotel === "string" && r.hotel) ||
        (r.hotel && r.hotel.nom) ||
        "(Sans hôtel)";
      const key = String(hotel).trim();
      const pax =
        tCode === "A"
          ? Number(r.nombre_personnes_arrivee || 0)
          : Number(r.nombre_personnes_retour || 0);
      const entry = map.get(key) || { hotel: key, pax: 0, dossier_ids: [] };
      entry.pax += pax;
      if (r.id != null) entry.dossier_ids.push(r.id);
      map.set(key, entry);
    });

    const hotelsPayload = Array.from(map.values()).sort((a, b) => b.pax - a.pax);

    const state = {
      agence: vm.currentAgenceId,
      type: vm.tCode,
      date: vm.dateSel,
      aeroport: vm.airportSel,
      vols: vm.flightsSel,
      reference: `M_${vm.dateSel}`,
      tour_operateurs: vm.tosSel,
      villes: vm.villesSel,
      hotelsPayload,
    };

    // vers la page d'ordre
    vm.navigate(
      vm.currentAgenceId
        ? `/agence/${vm.currentAgenceId}/fiche-mouvement/ordre`
        : "/fiche-mouvement/ordre",
      { state }
    );
  }}
>
  Étape suivante : Ordre des hôtels →
</button>
          </div>
        </header>

        {/* ====== BODY: GAUCHE (grand tableau) / DROITE (sidebar choix) ====== */}
        <div className="fm-body twocol">
          {/* GAUCHE : GRAND TABLEAU SYNTHÈSE + DÉTAILS (collés) */}
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
                        const maxLen = Math.max(
                          toOptions.length,
                          villeOptions.length,
                          hotelOptions.length
                        );
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
                                    {toPax !== null && (
                                      <span className="badge bg-secondary">{toPax} pax</span>
                                    )}
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
                                          ? vm.setVillesSel(
                                              Array.from(new Set([...vm.villesSel, vLabel]))
                                            )
                                          : vm.setVillesSel(
                                              vm.villesSel.filter((k) => k !== vLabel)
                                            )
                                      }
                                      aria-label={`Sélectionner zone ${vLabel}`}
                                    />
                                    <strong>{vLabel}</strong>
                                    {vPax !== null && (
                                      <span className="badge bg-secondary">{vPax} pax</span>
                                    )}
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
                                          ? vm.setHotelsSel(
                                              Array.from(new Set([...vm.hotelsSel, hLabel]))
                                            )
                                          : vm.setHotelsSel(vm.hotelsSel.filter((k) => k !== hLabel))
                                      }
                                      aria-label={`Sélectionner hôtel ${hLabel}`}
                                    />
                                    <strong>{hLabel}</strong>
                                    {hPax !== null && (
                                      <span className="badge bg-secondary">{hPax} pax</span>
                                    )}
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

            {/* ===== DÉTAILS (collé sous la synthèse) ===== */}
            {showRightPane && (tosSel.length + villesSel.length + hotelsSel.length > 0) && (
              <Section title="Détails des dossiers (visibles)" className="stack stack-bottom">
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 36 }}>
                          {(() => {
                            const rowsVis = (Array.isArray(vm.filteredRecords)
                              ? vm.filteredRecords
                              : []
                            ).filter((r) => r && r.id);
                            const allChecked =
                              rowsVis.length > 0 &&
                              rowsVis.every((r) => vm.selectedDossierIds.has(r.id));
                            const toggleAll = (checked) => {
                              const next = new Set(vm.selectedDossierIds);
                              if (checked) rowsVis.forEach((r) => next.add(r.id));
                              else rowsVis.forEach((r) => next.delete(r.id));
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
                      {(() => {
                        const rowsVis = Array.isArray(vm.filteredRecords) ? vm.filteredRecords : [];
                        if (!rowsVis.length) {
                          return (
                            <tr>
                              <td colSpan={5} className="text-center text-muted py-4">
                                Aucune ligne à afficher pour cette sélection.
                              </td>
                            </tr>
                          );
                        }
                        return rowsVis.map((r, i) => {
                          const checked = r?.id ? vm.selectedDossierIds.has(r.id) : false;
                          const onToggle = (val) => {
                            const next = new Set(vm.selectedDossierIds);
                            if (!r?.id) return;
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
                              <td>{vm.getPaxDisplay(r, tCode)}</td>
                              <td>{(r.observation && String(r.observation).trim()) || ""}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>

          {/* DROITE : SIDEBAR CHOIX (Type → Date → Aéroport → Vols) */}
          <aside className="fm-col-right sidebar">
            <Section title="Type de mouvement">
              <div className="fm-type-inline">
                <Chip
                  active={vm.typeSel === "arrivee"}
                  onClick={() => {
                    vm.setTypeSel("arrivee");
                    resetDownstream();
                  }}
                  title="Arrivées"
                >
                  Arrivées
                </Chip>
                <Chip
                  active={vm.typeSel === "depart"}
                  onClick={() => {
                    vm.setTypeSel("depart");
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
                  {vm.dateOptions.map((d) => {
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
              <Section
                title={vm.typeSel === "depart" ? "Aéroport de départ" : "Aéroport d’arrivée"}
              >
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
                  {vm.airportOptions.map((a) => {
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
              <Section title="Vols (multi-sélection)">
                <select
                  multiple
                  size={Math.min(10, Math.max(4, vm.flightOptions.length))}
                  className="form-select form-select-sm"
                  value={flightsSel}
                  onChange={onFlightsChange}
                  style={{ maxHeight: "16rem" }}
                  aria-label="Choisir les vols"
                >
                  {vm.flightOptions.map((f) => {
                    const parts = [
                      f.flight || "—",
                      f.times?.length ? f.times.join(" / ") : null,
                      typeof f.pax === "number" ? `${f.pax} pax` : null,
                    ].filter(Boolean);
                    return (
                      <option key={`fl-${f.flight}`} value={f.flight}>
                        {parts.join(" • ")}
                      </option>
                    );
                  })}
                </select>
                <div className="small text-muted mt-1">
                  Astuce: CTRL/Cmd+clic pour multi-sélectionner.
                </div>
              </Section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
