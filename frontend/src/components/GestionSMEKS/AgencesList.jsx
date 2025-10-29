// src/pages/AgencesList.jsx
import React from "react";

export default function AgencesList() {
  return (
    <>
      {/* Barre d’actions */}
      <div className="d-flex align-items-center gap-2 mb-2">
        <div className="input-group input-group-sm" style={{maxWidth: 320}}>
          <span className="input-group-text">🔍</span>
          <input className="form-control" placeholder="Rechercher..." />
          <button className="btn btn-outline-secondary">Go</button>
        </div>

        <div className="dropdown">
          <button className="btn btn-outline-secondary btn-sm dropdown-toggle" data-bs-toggle="dropdown">
            Actions
          </button>
          <ul className="dropdown-menu">
            <li><button className="dropdown-item">Exporter</button></li>
            <li><button className="dropdown-item">Importer</button></li>
          </ul>
        </div>

        <button className="btn btn-warning btn-sm ms-auto">Ajouter</button>
      </div>

      {/* Tableau */}
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th style={{width: 32}}></th>
              <th>Code</th>
              <th>Raison sociale</th>
              <th>Adresse</th>
              <th>Ville</th>
              <th>Email</th>
              <th>Créé le</th>
              <th>Statut</th>
              <th>Type</th>
              <th>Telph Urg Client</th>
            </tr>
          </thead>
          <tbody>
            {/* données à mapper ici */}
          </tbody>
        </table>
      </div>
    </>
  );
}
