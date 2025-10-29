// src/components/FicheMouvement/FicheMouvement.jsx
import React, { useMemo, useState } from "react";
import "./ficheMouvement.css";
import { useFicheMouvement } from "./useFicheMouvement";
import { Link } from "react-router-dom";

export default function FicheMouvement() {
  const vm = useFicheMouvement();
  const {
    msg, loading, currentAgenceId,
    selectedFile, headers,
    headerMap, setHeaderMap,
    requiredMap, setRequiredMap,
    TARGET_FIELDS,
    mappedPreview, validationErrors, emptyRowIdxs,
    lastValidatedRows,
    onFile, runValidation, saveAll, clearAll,
  } = vm;

  const [showErrors, setShowErrors] = useState(false);
  const [ignoreErrors, setIgnoreErrors] = useState(false);

  const blocking = validationErrors.length > 0 && !ignoreErrors;

  const onSelectMap = (targetKey, headerName) => {
    const next = { ...(headerMap || {}) };
    const prevKey = Object.entries(next).find(([k, v]) => v === headerName)?.[0];
    if (prevKey && prevKey !== targetKey) delete next[prevKey];
    if (headerName) next[targetKey] = headerName;
    else delete next[targetKey];
    setHeaderMap(next);
  };

  const toggleRequired = (key, checked) => {
    setRequiredMap((prev) => ({ ...(prev || {}), [key]: !!checked }));
  };

  const errorRows = useMemo(() => {
    if (!Array.isArray(validationErrors) || !validationErrors.length) return [];
    return validationErrors.map(({ index, messages }) => {
      const row = lastValidatedRows?.[index] || {};
      return {
        index,
        messages,
        date: row.date || "",
        heure: row.horaires || "",
        to: row.client_to || "",
        vol: row.num_vol || "",
        titulaire: row.titulaire || "",
        ville: row.ville || "",
      };
    });
  }, [validationErrors, lastValidatedRows]);

  const exportErrorsCSV = () => {
    const headersCsv = ["Ligne", "Erreurs", "Date", "Heure", "TO", "Vol", "Titulaire", "Ville"];
    const lines = [headersCsv.join(";")];
    errorRows.forEach((r) => {
      const fields = [
        (r.index + 1).toString(),
        (r.messages || []).join(" | ").replace(/[\r\n]+/g, " "),
        r.date, r.heure, r.to, r.vol, r.titulaire, r.ville,
      ];
      lines.push(fields.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "erreurs_import_dossiers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fm-page">
      <div className="fm-wrap">
        <header className="fm-top sticky">
          <div className="fm-top-left">
            <h2 className="fm-title m-0">Importer des dossiers — Mapping & Validation</h2>
            {msg ? <div className="fm-msg mt-2">{msg}</div> : null}
          </div>
          <div className="fm-actions">
            {currentAgenceId ? (
              <Link className="btn btn-outline-secondary btn-sm" to={`/agence/${currentAgenceId}/dashboard`}>
                ← Dashboard
              </Link>
            ) : null}

            <label className="btn btn-dark btn-sm m-0 ms-2">
              Importer Excel
              <input type="file" accept=".xls,.xlsx,.csv" onChange={onFile} hidden disabled={loading} />
            </label>

            <button type="button" className="btn btn-outline-danger btn-sm ms-2" onClick={clearAll}>
              🧹 Vider
            </button>

            <div className="fm-sep" />

            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              disabled={!selectedFile || loading}
              onClick={runValidation}
              title="Vérifie les données selon les champs cochés 'Requis'"
            >
              ✅ Valider
            </button>

            <button
              type="button"
              className={`btn btn-sm ${blocking ? "btn-outline-success" : "btn-success"}`}
              disabled={!selectedFile || loading || false /* on n'empêche plus si erreurs */}
              onClick={saveAll}
              title={
                validationErrors.length && !ignoreErrors
                  ? "Des erreurs existent. Cochez 'Ignorer les erreurs' pour enregistrer les lignes valides."
                  : "Enregistrer toutes les lignes valides"
              }
            >
              💾 Enregistrer tout
            </button>
          </div>
        </header>

        {/* Bandeau erreurs + switch "ignorer" */}
        {validationErrors.length > 0 && (
          <div className="mt-3 d-flex flex-wrap align-items-center gap-3">
            <button className="btn btn-danger btn-sm" onClick={() => setShowErrors(true)}>
              Voir les {validationErrors.length} erreur(s) détectée(s)
            </button>
            <button className="btn btn-outline-danger btn-sm" onClick={exportErrorsCSV}>
              Exporter les erreurs (CSV)
            </button>
            <div className="form-check ms-2">
              <input
                id="ignore-errors"
                type="checkbox"
                className="form-check-input"
                checked={ignoreErrors}
                onChange={(e) => setIgnoreErrors(e.target.checked)}
              />
              <label htmlFor="ignore-errors" className="form-check-label">
                Ignorer les erreurs et enregistrer uniquement les lignes valides
              </label>
            </div>
          </div>
        )}

        {/* ======= TABLEAU DE MAPPING ======= */}
        {selectedFile ? (
          <div className="card mt-3">
            <div className="card-header">
              <strong>Mapping des champs</strong>
              <div className="small text-muted">
                Ligne 1 : champs standards • Ligne 2 : choisissez la colonne du fichier • Ligne 3 : cochez “Requis”
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-bordered table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    {TARGET_FIELDS.map((f) => (
                      <th key={f.key} className="text-center align-middle">{f.label}</th>
                    ))}
                  </tr>
                  <tr>
                    {TARGET_FIELDS.map((f) => (
                      <th key={`sel-${f.key}`}>
                        <select
                          className="form-select form-select-sm"
                          value={headerMap[f.key] || ""}
                          onChange={(e) => onSelectMap(f.key, e.target.value)}
                        >
                          <option value="">— (aucun) —</option>
                          {headers.map((h) => (
                            <option key={`${f.key}-${h}`} value={h}>{h}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {TARGET_FIELDS.map((f) => (
                      <th key={`req-${f.key}`} className="text-center">
                        <div className="form-check d-inline-flex align-items-center gap-1">
                          <input
                            id={`req-${f.key}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={!!requiredMap[f.key]}
                            onChange={(e) => toggleRequired(f.key, e.target.checked)}
                          />
                          <label htmlFor={`req-${f.key}`} className="form-check-label">Requis</label>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {mappedPreview.length ? (
                    mappedPreview.map((row, i) => (
                      <tr key={`prev-${i}`}>
                        {TARGET_FIELDS.map((f) => (
                          <td key={`prev-${i}-${f.key}`}>{String(row[f.key] ?? "")}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={TARGET_FIELDS.length} className="text-muted text-center">Aperçu indisponible.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {emptyRowIdxs.length > 0 && (
              <div className="p-2">
                <div className="alert alert-warning mb-0">
                  {emptyRowIdxs.length} ligne(s) vide(s) seront ignorées à l’enregistrement.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="alert alert-secondary mt-3">
            Importez un fichier Excel pour commencer le mapping.
          </div>
        )}

        {/* ===== MODAL ERREURS ===== */}
        {showErrors && (
          <div className="fm-modal-backdrop" onClick={() => setShowErrors(false)}>
            <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="fm-modal-header">
                <strong>{validationErrors.length} ligne(s) en anomalie</strong>
                <div className="d-flex gap-2">
                  <button className="btn btn-outline-danger btn-sm" onClick={exportErrorsCSV}>Exporter CSV</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowErrors(false)}>Fermer</button>
                </div>
              </div>
              <div className="fm-modal-body">
                <div className="table-responsive" style={{ maxHeight: 420 }}>
                  <table className="table table-sm table-striped table-bordered mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 80 }}>Ligne</th>
                        <th>Erreurs</th>
                        <th>Date</th>
                        <th>Heure</th>
                        <th>TO</th>
                        <th>N° Vol</th>
                        <th>Titulaire</th>
                        <th>Ville</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationErrors.map(({ index, messages }) => {
                        const row = lastValidatedRows?.[index] || {};
                        return (
                          <tr key={`err-row-${index}`}>
                            <td>{index + 1}</td>
                            <td>{messages.join(" ; ")}</td>
                            <td>{row.date || ""}</td>
                            <td>{row.horaires || ""}</td>
                            <td>{row.client_to || ""}</td>
                            <td>{row.num_vol || ""}</td>
                            <td>{row.titulaire || ""}</td>
                            <td>{row.ville || ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="fm-modal-footer text-muted small">
                Coche “Ignorer les erreurs” pour enregistrer uniquement les lignes valides.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
