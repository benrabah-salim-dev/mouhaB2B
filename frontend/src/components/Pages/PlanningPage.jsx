import React, { useState } from "react";
import PlanningCalendar from "../Planning/PlanningCalendar";

export default function PlanningPage() {
  const [mode, setMode] = useState("vehicules");

  return (
    <div className="container py-3">
      <div className="d-flex gap-2 mb-3">
        <button
          className={`btn ${mode === "vehicules" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setMode("vehicules")}
        >
          Véhicules
        </button>
        <button
          className={`btn ${mode === "chauffeurs" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setMode("chauffeurs")}
        >
          Chauffeurs
        </button>
      </div>

      <PlanningCalendar mode={mode} />
    </div>
  );
}
