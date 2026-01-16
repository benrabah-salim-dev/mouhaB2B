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
    ignoreErrors, setIgnoreErrors,
    TARGET_FIELDS,
    mappedPreview, validationErrors, emptyRowIdxs,
    lastValidatedRows,
    onFile, runValidation, saveAll, clearAll,
  } = vm;

  const [showErrors, setShowErrors] = useState(false);

  const hasBlockingErrors = Array.isArray(validationErrors)
    && validationErrors.some((e) => e?.level === "error");
  const blocking = hasBlockingErrors && !ignoreErrors;

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
    return validationErrors.map(({ index, level, messages }) => {
      const row = lastValidatedRows?.[index] || {};
      return {
        index, level, messages,
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
    const headersCsv = ["Ligne", "Type", "Erreurs", "Date", "Heure", "TO", "Vol", "Titulaire", "Ville"];
    const lines = [headersCsv.join(";")];
    errorRows.forEach((r) => {
      const fields = [
        (r.index + 1).toString(), r.level || "error",
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
      <header className="fm-top">
        <div className="fm-top-left">
          <h2 className="fm-title">Importation Dossiers</h2>
          {msg && <div className="fm-msg small text-primary fw-bold">{msg}</div>}
        </div>

        <div className="fm-actions">
          <label className="btn btn-dark btn-sm m-0">
            📁 Importer Excel
            <input type="file" accept=".xls,.xlsx,.csv" onChange={onFile} hidden disabled={loading} />
          </label>
          <button className="btn btn-outline-danger btn-sm" onClick={clearAll}>Vider</button>
          
          <div className="fm-sep" />

          <button className="btn btn-outline-primary btn-sm" disabled={!selectedFile || loading} onClick={runValidation}>
            ✅ Valider
          </button>
          <button className={`btn btn-sm ${blocking ? "btn-outline-success" : "btn-success"}`} onClick={saveAll} disabled={!selectedFile || loading}>
            💾 Enregistrer tout
          </button>
        </div>
      </header>

      <div className="fm-wrap mt-3">
        <div className="fm-body twocol">
          <div className="fm-col-left">
            {selectedFile ? (
              <div className="fm-sec">
                <div className="fm-sec-head">
                  <h3>Configuration du Mapping</h3>
                  {validationErrors.length > 0 && (
                    <span className="badge bg-danger cursor-pointer" onClick={() => setShowErrors(true)}>
                      {validationErrors.length} Anomalies
                    </span>
                  )}
                </div>
                
                <div className="fm-preview">
                  <table className="table table-bordered table-sm mb-0">
                    <thead>
                      <tr>
                        {TARGET_FIELDS.map((f) => (
                          <th key={f.key} className="fm-head-label-optimized">{f.label}</th>
                        ))}
                      </tr>
                      <tr className="bg-white">
                        {TARGET_FIELDS.map((f) => (
                          <th key={`sel-${f.key}`} className="p-1">
                            <select
                              className="form-select fm-map-select-compact"
                              value={headerMap[f.key] || ""}
                              onChange={(e) => onSelectMap(f.key, e.target.value)}
                            >
                              <option value="">— Ignorer —</option>
                              {headers.map((h) => (
                                <option key={`${f.key}-${h}`} value={h}>{h}</option>
                              ))}
                            </select>
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-white">
                        {TARGET_FIELDS.map((f) => (
                          <th key={`req-${f.key}`} className="text-center py-1">
                            <div className="d-flex flex-column align-items-center">
                              <input
                                type="checkbox"
                                className="form-check-input m-0"
                                checked={!!requiredMap[f.key]}
                                onChange={(e) => toggleRequired(f.key, e.target.checked)}
                              />
                              <span className="x-small-tag">REQUIS</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mappedPreview.map((row, i) => (
                        <tr key={i}>
                          {TARGET_FIELDS.map((f) => (
                            <td key={f.key}>{String(row[f.key] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-3 border-top bg-light">
                   <div className="form-check form-switch">
                      <input 
                        className="form-check-input" 
                        type="checkbox" 
                        id="ignore-errors" 
                        checked={ignoreErrors}
                        onChange={(e) => setIgnoreErrors(e.target.checked)}
                      />
                      <label className="form-check-label fw-bold small" htmlFor="ignore-errors">
                        Ignorer les erreurs bloquantes (enregistrer uniquement les lignes valides)
                      </label>
                   </div>
                </div>
              </div>
            ) : (
              <div className="fm-sec p-5 text-center text-muted">
                <p>Veuillez sélectionner un fichier Excel pour configurer le mapping.</p>
              </div>
            )}
          </div>

          <aside className="fm-col-right sidebar">
            <div className="fm-sec">
              <div className="fm-sec-head"><h3>Instructions</h3></div>
              <div className="fm-sec-body small text-muted">
                <ol className="ps-3 mb-0">
                  <li><strong>Importez</strong> votre fichier.</li>
                  <li><strong>Mappez</strong> les colonnes.</li>
                  <li><strong>Cochez</strong> les champs obligatoires.</li>
                  <li><strong>Validez</strong> puis enregistrez.</li>
                </ol>
              </div>
            </div>

            {errorRows.length > 0 && (
              <button className="btn btn-outline-danger btn-sm w-100 mb-2" onClick={exportErrorsCSV}>
                Exporter les anomalies CSV
              </button>
            )}
          </aside>
        </div>
      </div>

      {/* MODAL ANOMALIES */}
      {showErrors && (
        <div className="fm-modal-backdrop" onClick={() => setShowErrors(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header bg-danger text-white">
              <h5 className="mb-0">Détails des {validationErrors.length} anomalies</h5>
              <button className="btn-close btn-close-white" onClick={() => setShowErrors(false)}></button>
            </div>
            <div className="fm-modal-body">
              <table className="table table-sm table-striped table-hover mb-0">
                <thead className="table-light sticky-top">
                  <tr className="small">
                    <th>Ligne</th>
                    <th>Type</th>
                    <th>Messages</th>
                    <th>Vol</th>
                    <th>Titulaire</th>
                  </tr>
                </thead>
                <tbody className="small">
                  {errorRows.map((r, idx) => (
                    <tr key={idx}>
                      <td className="fw-bold">{r.index + 1}</td>
                      <td>
                        <span className={`badge ${r.level === "warn" ? "bg-warning text-dark" : "bg-danger"}`}>
                          {r.level}
                        </span>
                      </td>
                      <td className="text-danger">{r.messages.join(" ; ")}</td>
                      <td>{r.vol}</td>
                      <td>{r.titulaire}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fm-modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowErrors(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}