import React, { useMemo, useState } from "react";
import "./PlanningGrid.css";

// Helpers
const pad2 = (n) => String(n).padStart(2, "0");
const fmtHM = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;

// Convert "HH:MM" => minutes from 00:00
const hmToMins = (hm) => {
  const [h, m] = (hm || "00:00").split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
};

export default function PlanningGrid() {
  // Vue journée (tu pourras faire semaine après)
  const [dayStart, setDayStart] = useState(0);      // 00:00
  const [dayEnd, setDayEnd] = useState(24 * 60);    // 24:00

  // ✅ Resources (groups)
  const resources = useMemo(
    () => [
      { id: "v-1", title: "BUS 185TU8512", type: "vehicule" },
      { id: "v-2", title: "BUS 210TU2022", type: "vehicule" },
      { id: "c-1", title: "CHAUFFEUR Ali Ben Salah", type: "chauffeur" },
    ],
    []
  );

  // ✅ Items (occupations)
  // start/end en "HH:MM" => pas de calcul auto (comme tu veux)
  const items = useMemo(
    () => [
      { id: 11, resourceId: "v-1", title: "M-1203 (LH1312)", start: "08:00", end: "11:00" },
      { id: 12, resourceId: "v-2", title: "M-1204 (LH85)", start: "14:00", end: "18:00" },
      { id: 13, resourceId: "c-1", title: "M-1204 Chauffeur", start: "14:00", end: "18:00" },
    ],
    []
  );

  // Grille: carreaux = 30 min
  const step = 30; // minutes
  const totalMins = dayEnd - dayStart;
  const cols = Math.floor(totalMins / step);

  const colLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i <= cols; i++) {
      const mins = dayStart + i * step;
      // label toutes les 2 heures
      if (mins % 120 === 0) labels.push({ i, text: fmtHM(mins) });
    }
    return labels;
  }, [cols, dayStart]);

  // Position item en % sur la largeur
  const toLeftWidth = (startHM, endHM) => {
    const s = Math.max(dayStart, hmToMins(startHM));
    const e = Math.min(dayEnd, hmToMins(endHM));
    const left = ((s - dayStart) / totalMins) * 100;
    const width = Math.max(0, ((e - s) / totalMins) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <div className="pg-card">
      <div className="pg-header">
        <div>
          <div className="pg-title">Planning (sans licence)</div>
          <div className="pg-sub">Vue journée – carreaux 30 min</div>
        </div>

        <div className="pg-controls">
          <button className="pg-btn" onClick={() => { setDayStart(0); setDayEnd(24 * 60); }}>
            00:00 → 24:00
          </button>
          <button className="pg-btn" onClick={() => { setDayStart(6 * 60); setDayEnd(22 * 60); }}>
            06:00 → 22:00
          </button>
        </div>
      </div>

      <div className="pg-root">
        {/* Header timeline */}
        <div className="pg-top-left" />
        <div className="pg-top-right">
          <div className="pg-timebar">
            {colLabels.map((x) => (
              <div key={x.i} className="pg-time-label" style={{ left: `${(x.i / cols) * 100}%` }}>
                {x.text}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="pg-left">
          {resources.map((r) => (
            <div key={r.id} className="pg-row-label">
              <div className={`pg-pill ${r.type}`}>{r.type === "vehicule" ? "BUS" : "CH"}</div>
              <div className="pg-row-text">{r.title}</div>
            </div>
          ))}
        </div>

        <div className="pg-right">
          {resources.map((r) => {
            const rItems = items.filter((it) => it.resourceId === r.id);

            return (
              <div key={r.id} className="pg-row">
                {/* Grid background */}
                <div
                  className="pg-grid"
                  style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                >
                  {Array.from({ length: cols }).map((_, i) => (
                    <div key={i} className="pg-cell" />
                  ))}
                </div>

                {/* Items */}
                <div className="pg-items-layer">
                  {rItems.map((it) => {
                    const pos = toLeftWidth(it.start, it.end);
                    return (
                      <div
                        key={it.id}
                        className="pg-item"
                        style={pos}
                        title={`${it.title} (${it.start} → ${it.end})`}
                      >
                        <span className="pg-item-title">{it.title}</span>
                        <span className="pg-item-time">{it.start} → {it.end}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
