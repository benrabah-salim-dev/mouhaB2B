import React from "react";

/* =========================================================
   Helpers
========================================================= */

export function ObservationsByHotelFiltered({ grouped }) {
  const entries = grouped && typeof grouped === "object" ? Object.entries(grouped) : [];
  if (!entries.length) return null;

  return (
    <div className="fm-observ fm-observ-hotels">
      <div className="fm-observ-title">Observations des hôtels sélectionnés</div>
      {entries.map(([hotel, items]) => (
        <div className="fm-observ-hotel-block" key={hotel}>
          <div className="fm-observ-hotel-title">
            <b>{hotel}</b> <span className="fm-chip-pill">{items.length}</span>
          </div>
          <div className="fm-observ-list">
            {items.map((o, i) => (
              <div key={i} className="fm-observ-item">
                <b>{o.ref}</b> — {o.obs} <span className="pax-badge">{o.pax} pax</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


export const EMPTY_ZONE_LABEL = "Zones -"; // ✅ libellé pour ville vide

export const safeDate = (v) => {
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

export const normalizeDA = (val) => {
  if (!val) return null;
  const v = String(val).trim().toUpperCase();
  if (["D", "DEPART", "DEPARTURE", "S", "SALIDA", "P", "PARTENZA"].includes(v)) return "D";
  if (["A", "ARRIVEE", "ARRIVAL", "LLEGADA", "L"].includes(v)) return "A";
  return null;
};

export const deriveType = (d) => {
  if (!d || typeof d !== "object") return null;
  const hasDepart = !!d.heure_depart;
  const hasArrivee = !!d.heure_arrivee;
  if (hasDepart && !hasArrivee) return "D";
  if (!hasDepart && hasArrivee) return "A";
  return normalizeDA(d._type || d.type || d.da);
};

export const labelType = (t) => (t === "D" ? "Départ" : t === "A" ? "Arrivée" : "");

/** Date key selon type (A => heure_arrivee, D => heure_depart) */
export const getDateKey = (row) => getDateKeyForType(row, deriveType(row));

export const getDateKeyForType = (d, t) => {
  if (!d || !t) return "";
  const iso = t === "A" ? d.heure_arrivee : d.heure_depart;
  const dt = safeDate(iso);
  if (!dt) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Aéroport affiché (D => destination/arrivée, A => arrivée) */
export const getAirportForType = (d, t) => {
  if (!d || !t) return "";
  if (t === "A") return String(d.aeroport_arrivee || "").trim();
  if (t === "D") return String(d.aeroport_arrivee || d.aeroport_depart || "").trim();
  return String(d.aeroport_arrivee || d.aeroport_depart || "").trim();
};

export const pickTO = (d) => {
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

export const pickRef = (d) => {
  const val =
    d.reference ??
    d.ref ??
    d.num_dossier ??
    d.dossier ??
    d.booking_reference ??
    d["N° Dossier"] ??
    d["N dossier"] ??
    d["N_DOSSIER"] ??
    "";
  const s = String(val || "").trim();
  return s || "—";
};

export const pickRefTO = (d) => {
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

export const formatShortTime = (iso) => {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const getFlightNo = (d, t) => {
  if (!d) return "";
  if (t === "A") return d.num_vol_arrivee || d.num_vol || d.vol || "";
  if (t === "D") return d.num_vol_retour || d.num_vol || d.vol || "";
  return d.num_vol_arrivee || d.num_vol_retour || d.num_vol || d.vol || "";
};

export const getFlightTime = (d, t) => {
  if (t === "A") return d.heure_arrivee || "";
  if (t === "D") return d.heure_depart || "";
  return d.heure_arrivee || d.heure_depart || "";
};

export const getPaxForType = (d, t) => {
  if (t === "A") return Number(d.nombre_personnes_arrivee || 0);
  if (t === "D") return Number(d.nombre_personnes_retour || 0);
  return Number(d.nombre_personnes_arrivee || 0) + Number(d.nombre_personnes_retour || 0);
};

export const formatRefFromDateKey = (dateKey) => (dateKey ? `M_${dateKey}` : null);

export const pickObservation = (row) => {
  if (!row || typeof row !== "object") return "";
  const out = [];

  // clés "classiques"
  const fixed = [
    "observation","observations","observ","remarque","remarques",
    "note","notes","comment","comments","commentaire","commentaires"
  ];
  fixed.forEach(k => {
    const v = row[k];
    if (v != null && v !== "" && typeof v !== "object") {
      const s = String(v).trim();
      if (s) out.push(s);
    }
  });

  // détection dynamique: comment1, comment_2, obs3, observation_4, etc.
  for (const k of Object.keys(row)) {
    const lk = k.toLowerCase().replace(/[\s_]/g, "");
    if (/^(obs|observ|observation|comment|commentaire|remarque|note)s?\d*$/.test(lk)) {
      const v = row[k];
      if (v == null || v === "") continue;
      const s = Array.isArray(v) ? v.join(" ").trim() : String(v).trim();
      if (s && !out.includes(s)) out.push(s);
    }
  }

  return out.join(" | ");
};

/* =========================================================
   Composants UI
========================================================= */

export function Section({ title, disabled, children }) {
  return (
    <div className={`fm-sec ${disabled ? "is-disabled" : ""}`}>
      <div className="fm-sec-head">
        <h3>{title}</h3>
      </div>
      <div className="fm-sec-body">{children}</div>
      {disabled && <div className="fm-sec-mask" />}
    </div>
  );
}

export function Chip({ active, onClick, children, title }) {
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

export default function Dropdown({ options, value, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="fm-dropdown"
    >
      <option value="">-- Sélectionner --</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function Summary({
  typeSel, dateSel, airportSel, flightsSel, tosSel, villesSel,
  selectedCount, selectedPax, movementName, setMovementName, onCreate, creating
}) {
  return (
    <div className="fm-summary">
      <div className="fm-summary-title">Résumé</div>
      <div className="fm-summary-row"><span>Type</span><b>{typeSel || "—"}</b></div>
      <div className="fm-summary-row"><span>Date</span><b>{dateSel || "—"}</b></div>
      <div className="fm-summary-row"><span>Aéroport</span><b>{airportSel || "—"}</b></div>
      <div className="fm-summary-row"><span>Vol(s)</span><b>{flightsSel.length || 0}</b></div>
      <div className="fm-summary-row"><span>T.O.</span><b>{tosSel.length || 0}</b></div>
      <div className="fm-summary-row"><span>Villes</span><b>{villesSel.length || 0}</b></div>
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
          placeholder={typeSel && dateSel && airportSel ? `${typeSel} ${airportSel} ${dateSel}` : "Ex: Arrivées TUN 2025-08-31"}
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
  );
}

export function Observations({ list }) {
  if (!list.length) return null;
  return (
    <div className="fm-observ">
      <div className="fm-observ-title">Observations</div>
      <div className="fm-observ-list">
        {list.slice(0, 6).map((o, i) => (
          <div key={i} className="fm-observ-item">
            <b>{o.ref}</b> — {o.obs}
          </div>
        ))}
        {list.length > 6 && <div className="fm-observ-more">+ {list.length - 6} autre(s)…</div>}
      </div>
    </div>
  );
}
export function ObservationsByHotel({ grouped }) {
  const entries = grouped && typeof grouped === "object" ? Object.entries(grouped) : [];
  if (!entries.length) return null;

  return (
    <div className="fm-observ">
      <div className="fm-observ-title">Observations (par hôtel)</div>
      {entries.map(([hotel, items]) => (
        <div className="fm-observ-hotel-block" key={hotel || "(Sans hôtel)"}>
          <div className="fm-observ-hotel-title">
            <b>{hotel || "(Sans hôtel)"}</b>{" "}
            <span className="fm-chip-pill">{items.length}</span>
          </div>
          <div className="fm-observ-list">
            {items.slice(0, 6).map((o, i) => (
              <div key={i} className="fm-observ-item">
                <b>{o.ref}</b> — {o.obs}
              </div>
            ))}
            {items.length > 6 && (
              <div className="fm-observ-more">+ {items.length - 6} autre(s)…</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
