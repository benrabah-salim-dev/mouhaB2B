// src/pages/GestionDashboard.jsx
import React from "react";
import { Link } from "react-router-dom";
import { FaBuilding, FaBus, FaUserTie, FaBriefcase, FaUsers } from "react-icons/fa";

export default function GestionDashboard() {
  const counts = { agences: 3, flottes: 2, chauffeurs: 2, missions: 2, utilisateurs: 5 }; // remplace par ton fetch

  const cards = [
    { key: "agences", label: "Agences", value: counts.agences, icon: <FaBuilding/>, to: "/gestion/agences", className: "tile-c1" },
    { key: "flottes", label: "Flottes", value: counts.flottes, icon: <FaBus/>, to: "/gestion/flottes", className: "tile-c2" },
    { key: "chauffeurs", label: "Chauffeurs", value: counts.chauffeurs, icon: <FaUserTie/>, to: "/gestion/chauffeurs", className: "tile-c3" },
    { key: "missions", label: "Missions", value: counts.missions, icon: <FaBriefcase/>, to: "/gestion/missions", className: "tile-c4" },
    { key: "utilisateurs", label: "Utilisateurs", value: counts.utilisateurs, icon: <FaUsers/>, to: "/gestion/utilisateurs", className: "tile-c5" },
  ];

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="badge bg-warning text-dark rounded-pill d-inline-flex align-items-center gap-2 px-3 py-2">
          <span role="img" aria-label="home">🏠</span> Accueil
        </span>
      </div>

      <div className="row g-3">
        {cards.map(c => (
          <div key={c.key} className="col-12 col-sm-6 col-lg-4 col-xxl-3">
            <article className={`dash-tile ${c.className}`}>
              <div className="tile-icon">{c.icon}</div>
              <div className="tile-body">
                <div className="tile-label">{c.label}</div>
                <div className="tile-value">{c.value}</div>
              </div>
              <div className="tile-footer">
                <Link to={c.to} className="tile-link">Plus d’info</Link>
              </div>
            </article>
          </div>
        ))}
      </div>

      <style>{`
        .dash-tile{
          background:#1f2d3d; color:#fff; border-radius:14px; padding:18px 16px 12px;
          display:grid; grid-template-columns:64px 1fr; grid-template-rows:1fr auto;
          gap:8px 14px; min-height:120px; box-shadow:0 8px 24px rgba(0,0,0,.08);
        }
        .tile-icon{ width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:28px; }
        .tile-body{ display:flex; flex-direction:column; justify-content:center; }
        .tile-label{ font-size:.95rem; opacity:.9; }
        .tile-value{ font-weight:800; font-size:1.6rem; line-height:1.1; }
        .tile-footer{ grid-column:1 / -1; border-top:1px solid rgba(255,255,255,.18); margin-top:8px; padding-top:10px; }
        .tile-link{ color:#fff; text-decoration:none; font-weight:600; }
        .tile-link:hover{ text-decoration:underline; }
        .tile-c1{ background:linear-gradient(180deg,#1f3a53 0%, #1d3349 70%, #1a2d40 100%); }
        .tile-c2{ background:linear-gradient(180deg,#234560 0%, #203d55 70%, #1c354a 100%); }
        .tile-c3{ background:linear-gradient(180deg,#446f6d 0%, #3f6665 70%, #395c5b 100%); }
        .tile-c4{ background:linear-gradient(180deg,#6c76b5 0%, #6169a6 70%, #5a619a 100%); }
        .tile-c5{ background:linear-gradient(180deg,#9aa9db 0%, #8da0d6 70%, #8698cf 100%); }
        @media (max-width:576px){ .dash-tile{ grid-template-columns:56px 1fr; } .tile-icon{ width:56px;height:56px;font-size:24px; } }
      `}</style>
    </>
  );
}
