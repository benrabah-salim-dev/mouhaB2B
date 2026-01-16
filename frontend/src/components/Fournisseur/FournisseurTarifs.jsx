// src/components/Fournisseur/FournisseurTarifs.jsx
import React, { useEffect, useState } from "react";
import api from "../../api";

function currencySymbol(code) {
  if (!code) return "د.ت";
  const c = code.toUpperCase();
  switch (c) {
    case "EUR":
      return "€";
    case "USD":
      return "$";
    case "TND":
      return "د.ت";
    case "MAD":
      return "DH";
    case "GBP":
      return "£";
    default:
      return c;
  }
}

// Colonnes fixes (types de véhicule)
const VEHICLE_COLUMNS = [
  { key: "rideshare", label: "RIDESHARE" },
  { key: "bus", label: "BUS" },
  { key: "minibus", label: "MINIBUS" },
  { key: "microbus", label: "MICROBUS" },
  { key: "fourx4", label: "4x4" },
  { key: "autre", label: "Autre" },
];

const DEFAULT_DEVISE_SYMBOL = currencySymbol("TND");

// Liste fixe des aéroports tunisiens
const AEROPORTS_TN = [
  { code: "TUN", label: "Tunis-Carthage (TUN)" },
  { code: "MIR", label: "Monastir Habib Bourguiba (MIR)" },
  { code: "NBE", label: "Enfidha-Hammamet (NBE)" },
  { code: "DJE", label: "Djerba-Zarzis (DJE)" },
  { code: "SFA", label: "Sfax-Thyna (SFA)" },
  { code: "TOE", label: "Tozeur-Nefta (TOE)" },
  { code: "GAF", label: "Gafsa (GAF)" },
  { code: "TBJ", label: "Tabarka-Aïn Draham (TBJ)" },
];

export default function FournisseurTarifs() {
  const [aeroport, setAeroport] = useState("");          // code aéroport
  const [rows, setRows] = useState([]);                  // lignes du tableau
  const [zonesOptions, setZonesOptions] = useState([]);  // toutes les zones
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingRowKey, setSavingRowKey] = useState(null);

  const canEdit = aeroport.trim().length > 0;

  // ---- Chargement des tarifs pour l'aéroport sélectionné ----
  const loadTarifs = async (aeroCode) => {
    if (!aeroCode) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.get(
        `fournisseur/vehicule-tarifs/?aeroport=${encodeURIComponent(
          aeroCode
        )}`
      );

      const data = res.data || {};
      const remoteRows = Array.isArray(data.rows) ? data.rows : [];
      const zones = Array.isArray(data.zones) ? data.zones : [];

      // Normaliser les lignes (string pour les inputs)
      const normRows = remoteRows.map((row, idx) => {
        const copy = {
          rowKey: row.zone_id || `remote-${idx}`,
          zone_id: row.zone_id,
          zone_name: row.zone_name,
        };
        VEHICLE_COLUMNS.forEach((col) => {
          const v = row[col.key];
          copy[col.key] =
            v === null || v === undefined ? "" : String(v);
        });
        return copy;
      });

      setRows(normRows);
      setZonesOptions(zones);
    } catch (err) {
      console.error("Erreur chargement tarifs véhicule par zone", err);
      setError("Impossible de charger les tarifs. Réessayez plus tard.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // charge automatiquement dès qu'on choisit un aéroport
  useEffect(() => {
    if (aeroport.trim()) {
      loadTarifs(aeroport.trim());
    } else {
      setRows([]);
    }
  }, [aeroport]);

  const handleCellChange = (rowKey, key) => (e) => {
    const value = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
    setRows((prev) =>
      prev.map((r) =>
        r.rowKey === rowKey ? { ...r, [key]: value } : r
      )
    );
  };

  const handleZoneChange = (rowKey) => (e) => {
    const zoneId = e.target.value;
    const zone = zonesOptions.find((z) => String(z.id) === String(zoneId));
    setRows((prev) =>
      prev.map((r) =>
        r.rowKey === rowKey
          ? {
              ...r,
              zone_id: zone ? zone.id : "",
              zone_name: zone ? zone.name : "",
            }
          : r
      )
    );
  };

  const handleSaveRow = async (row) => {
    if (!aeroport.trim()) {
      alert("Merci de choisir un aéroport avant d'enregistrer les tarifs.");
      return;
    }
    if (!row.zone_id) {
      alert("Merci de choisir une zone pour cette ligne.");
      return;
    }

    setSavingRowKey(row.rowKey);
    try {
      const tarifs = {};
      VEHICLE_COLUMNS.forEach((col) => {
        tarifs[col.key] = row[col.key];
      });

      await api.post("fournisseur/vehicule-tarifs/", {
        aeroport: aeroport.trim(),
        zone_id: row.zone_id,
        tarifs,
      });

      alert(
        `Tarifs mis à jour pour : ${aeroport.trim()} → ${
          row.zone_name || "zone inconnue"
        }`
      );
    } catch (err) {
      console.error("Erreur sauvegarde tarifs zone", err);
      alert("Erreur lors de la sauvegarde des tarifs pour cette zone.");
    } finally {
      setSavingRowKey(null);
    }
  };

  const addRow = () => {
    if (!zonesOptions.length) {
      alert(
        "Les zones ne sont pas encore chargées. Choisis d'abord un aéroport pour les charger."
      );
      return;
    }
    const newKey = `local-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    setRows((prev) => [
      ...prev,
      {
        rowKey: newKey,
        zone_id: "",
        zone_name: "",
        rideshare: "",
        bus: "",
        minibus: "",
        microbus: "",
        fourx4: "",
        autre: "",
      },
    ]);
  };

  return (
    <div className="app-page-fournisseur">
      <div
        className="container-xxl"
        style={{ maxWidth: 1200, margin: "0 auto" }}
      >
        <h2 className="mb-1">Tarifs véhicules par zone</h2>


        {/* ===== Sélection de l'aéroport ===== */}
        <div
          className="card mb-3 shadow-sm border-0"
          style={{ borderRadius: 16 }}
        >
          <div className="card-body">
            <div className="row g-3 align-items-end">
              <div className="col-md-6">
                <label className="form-label form-required">
                  Aéroport
                </label>
                <select
                  className="form-select"
                  value={aeroport}
                  onChange={(e) => setAeroport(e.target.value)}
                >
                  <option value="">— Sélectionner un aéroport —</option>
                  {AEROPORTS_TN.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <div className="form-text">
                  Le tableau se met à jour automatiquement quand tu
                  choisis un aéroport.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Tableau de tarifs ===== */}
        <div
          className="card shadow-sm border-0"
          style={{ borderRadius: 16 }}
        >
          <div className="card-body">
            {error && <div className="alert alert-danger">{error}</div>}

            {!canEdit ? (
              <div className="text-muted">
                Sélectionne un aéroport pour commencer.
              </div>
            ) : loading ? (
              <div className="text-muted small">
                Chargement des tarifs…
              </div>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={addRow}
                    disabled={loading}
                  >
                    + Ajouter une ligne (zone)
                  </button>
                </div>

                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 180 }}>Zone</th>
                        {VEHICLE_COLUMNS.map((col) => (
                          <th key={col.key} className="text-end">
                            {col.label} ({DEFAULT_DEVISE_SYMBOL})
                          </th>
                        ))}
                        <th style={{ width: 140 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={VEHICLE_COLUMNS.length + 2}
                            className="text-center text-muted"
                          >
                            Aucune ligne pour cet aéroport. Clique sur{" "}
                            <strong>“Ajouter une ligne (zone)”</strong>.
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, index) => (
                          <tr key={row.rowKey || index}>
                            <td>
                              <select
                                className="form-select form-select-sm"
                                value={row.zone_id || ""}
                                onChange={handleZoneChange(row.rowKey)}
                              >
                                <option value="">
                                  — Choisir une zone —
                                </option>
                                {zonesOptions.map((z) => (
                                  <option key={z.id} value={z.id}>
                                    {z.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {VEHICLE_COLUMNS.map((col) => (
                              <td key={col.key} className="text-end">
                                <input
                                  type="text"
                                  className="form-control form-control-sm text-end"
                                  value={row[col.key] ?? ""}
                                  onChange={handleCellChange(
                                    row.rowKey,
                                    col.key
                                  )}
                                />
                              </td>
                            ))}
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-success"
                                onClick={() => handleSaveRow(row)}
                                disabled={savingRowKey === row.rowKey}
                              >
                                {savingRowKey === row.rowKey
                                  ? "Enregistrement…"
                                  : "Enregistrer"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .app-page-fournisseur {
          padding: 1.25rem 0 2.5rem;
        }
        @media (max-width: 768px) {
          .app-page-fournisseur {
            padding: 0.75rem 0 2rem;
          }
        }
      `}</style>
    </div>
  );
}
