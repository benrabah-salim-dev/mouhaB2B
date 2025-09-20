import React from "react";

export default function Unauthorized() {
  return (
    <div className="container mt-5">
      <h3>Accès non autorisé</h3>
      <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
    </div>
  );
}
