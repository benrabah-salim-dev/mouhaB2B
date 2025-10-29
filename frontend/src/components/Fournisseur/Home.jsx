import React, { useState } from "react";
import SimpleCalendar from "../calendar/SimpleCalendar";

export default function Home() {
  const [selected, setSelected] = useState(null);
  return (
    <div className="p-3">
      <h4 className="mb-3">Tableau de bord — Espace fournisseur</h4>
      <SimpleCalendar onSelectDate={setSelected} />
      {selected && (
        <div className="alert alert-info mt-3">
          Date sélectionnée : <strong>{selected.toLocaleDateString()}</strong>
        </div>
      )}
    </div>
  );
}
