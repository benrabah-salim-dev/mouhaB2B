import React from "react";

/* Libellés */
export const labelType = (t) => (t === "D" ? "Départ" : t === "A" ? "Arrivée" : "");

/* ===========================
   PERSISTENCE (RESTORE)
   =========================== */

/**
 * Clé unique sessionStorage (par agence et type si tu veux)
 * -> on met un préfixe stable + agence_id pour éviter les collisions.
 */
export const fmCreateStorageKey = (agenceId) =>
  `fm:create:state:${String(agenceId || "unknown")}`;

export function saveFmCreateState(agenceId, stateObj) {
  try {
    const key = fmCreateStorageKey(agenceId);
    sessionStorage.setItem(
      key,
      JSON.stringify({
        _ts: Date.now(),
        ...stateObj,
      })
    );
  } catch (e) {
    // ignore
  }
}

export function loadFmCreateState(agenceId) {
  try {
    const key = fmCreateStorageKey(agenceId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function clearFmCreateState(agenceId) {
  try {
    const key = fmCreateStorageKey(agenceId);
    sessionStorage.removeItem(key);
  } catch (e) {
    // ignore
  }
}

/* ===========================
   UI Components
   =========================== */

export function Section({ title, disabled, children, right, className = "" }) {
  return (
    <div className={`fm-sec ${disabled ? "is-disabled" : ""} ${className}`}>
      <div className="fm-sec-head">
        <h3>{title}</h3>
        {right}
      </div>
      <div className="fm-sec-body">{children}</div>
      {disabled && <div className="fm-sec-mask" />}
    </div>
  );
}

export function Chip({ active, children, onClick, title }) {
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

export function TopSummaryBar({
  tCode,
  dateSel,
  airportSel,
  flightsSel,
  tosSel,
  villesSel,
  hotelsSel,
  selectedCount,
  selectedPax,
  movementName,
  setMovementName,
  onCreate,
  creating,
}) {
  const joinFull = (arr = []) => arr.map((s) => String(s || "").trim()).filter(Boolean);
  const titleJoin = (arr) => joinFull(arr).join(", ");

  const KV = ({ label, value, title }) => (
    <div className="kv">
      <div className="kv-label">{label}</div>
      <div className="kv-value" title={title}>
        {value || "—"}
      </div>
    </div>
  );

  return (
    <div className="fm-top-summary improved">
      <div className="fm-top-summary-grid">
        <KV label="Type" value={tCode ? labelType(tCode) : "—"} />
        <KV label="Date" value={dateSel} />
        <KV label="Aéroport" value={airportSel} />
        <KV label="Vols" value={joinFull(flightsSel).join(" · ")} title={titleJoin(flightsSel)} />
        <KV label="TO" value={joinFull(tosSel).join(" · ")} title={titleJoin(tosSel)} />
        <KV label="Zones" value={joinFull(villesSel).join(" · ")} title={titleJoin(villesSel)} />
        <KV label="Hôtels" value={joinFull(hotelsSel).join(" · ")} title={titleJoin(hotelsSel)} />

        <div className="kv kpi">
          <div className="kpi-pair">
            <div className="kpi-num" aria-label="dossiers">
              {selectedCount}
            </div>
            <div className="kpi-label">dossiers</div>
          </div>
          <div className="kpi-sep" />
          <div className="kpi-pair">
            <div className="kpi-num" aria-label="pax">
              {selectedPax}
            </div>
            <div className="kpi-label">pax</div>
          </div>
        </div>
      </div>

      <div className="fm-top-summary-actions">
        <input
          className="form-control form-control-sm"
          placeholder={
            tCode && dateSel && airportSel
              ? `${labelType(tCode)} ${airportSel} ${dateSel}`
              : "Nom de la fiche (optionnel)"
          }
          value={movementName}
          onChange={(e) => setMovementName(e.target.value)}
        />
        <button className="btn btn-success btn-sm" onClick={onCreate} disabled={creating || !selectedCount}>
          {creating ? "Création..." : `Créer (${selectedCount})`}
        </button>
      </div>
    </div>
  );
}
