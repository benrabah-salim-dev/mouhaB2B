// src/pages/AgenceRessourcesHub.jsx
import React from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function AgenceRessourcesHub() {
  const navigate = useNavigate();
  const { agence_id } = useParams();

  const cards = [
    {
      key: "vehicules",
      emoji: "🚌",
      title: "Véhicules",
      subtitle: "Lister, ajouter et importer",
      img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1600&auto=format&fit=crop",
      onClick: () => navigate(`/agence/${agence_id}/ressources/vehicules`),
    },
    {
      key: "chauffeurs",
      emoji: "🧑‍✈️",
      title: "Chauffeurs",
      subtitle: "Lister, ajouter et importer",
      img: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=1600&auto=format&fit=crop",
      onClick: () => navigate(`/agence/${agence_id}/ressources/chauffeurs`),
    },
  ];

  // Effet tilt (3D) : calcul de l'angle en fonction de la position de la souris
  const handleMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left; // x dans la carte
    const y = e.clientY - rect.top;  // y dans la carte
    const midX = rect.width / 2;
    const midY = rect.height / 2;

    const maxRotate = 10; // degrés
    const rotY = ((x - midX) / midX) * maxRotate; // gauche/droite
    const rotX = -((y - midY) / midY) * maxRotate; // haut/bas

    card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px)`;
  };

  const resetTilt = (e) => {
    const card = e.currentTarget;
    card.style.transform = "";
  };

  return (
    <>
      {/* Styles internes (peuvent aller dans App.css si tu préfères) */}
      <style>{`
        .hub-container {
          max-width: 1080px;
          margin: 48px auto;
          padding: 0 16px;
        }
        .hub-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
        }
        .card3d {
          position: relative;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          min-height: 180px;
          width: 100%;
          text-align: left;
          background: #0b1020;
          cursor: pointer;
          overflow: hidden;
          box-shadow: 0 15px 35px rgba(0,0,0,0.18);
          transition: transform 180ms ease, box-shadow 200ms ease;
          will-change: transform;
        }
        .card3d:hover {
          box-shadow: 0 25px 60px rgba(0,0,0,0.25);
        }
        .card3d__bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          filter: saturate(0.9) contrast(1.05) brightness(0.9);
          transform: scale(1.03);
        }
        .card3d__gradient {
          position: absolute;
          inset: 0;
          background: radial-gradient(120% 140% at 10% 10%, rgba(15,23,42,0.2) 0%, rgba(15,23,42,0.6) 50%, rgba(2,6,23,0.9) 100%),
                      linear-gradient(0deg, rgba(2,6,23,0.35), rgba(2,6,23,0.35));
        }
        .card3d__gloss {
          position: absolute;
          inset: -40% -40%;
          background: radial-gradient(circle at 30% -10%, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%);
          mix-blend-mode: screen;
          transform: rotate(8deg);
        }
        .card3d__content {
          position: relative;
          z-index: 2;
          color: #e5e7eb;
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .card3d__emoji {
          font-size: 42px;
          line-height: 1;
          margin-bottom: 6px;
          text-shadow: 0 3px 10px rgba(0,0,0,0.35);
        }
        .card3d__title {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.2px;
          color: #f1f5f9;
          text-shadow: 0 2px 8px rgba(0,0,0,0.35);
        }
        .card3d__subtitle {
          color: #cbd5e1;
          font-size: 14px;
        }

        /* petit effet de bord lumineux au survol */
        .card3d::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 18px;
          pointer-events: none;
          background: linear-gradient(120deg, rgba(99,102,241,0.25), rgba(14,165,233,0.25), rgba(16,185,129,0.25));
          opacity: 0;
          transition: opacity 180ms ease;
        }
        .card3d:hover::after {
          opacity: 1;
        }
      `}</style>

      <div className="hub-container">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2>Ressources de l’agence</h2>
        </div>
        <p style={{ color: "#6b7280", marginBottom: 24 }}>
          Choisissez un module pour gérer vos ressources (liste, ajout, import Excel).
        </p>

        <div className="hub-grid">
          {cards.map((c) => (
            <button
              key={c.key}
              className="card3d"
              onMouseMove={handleMouseMove}
              onMouseLeave={resetTilt}
              onClick={c.onClick}
            >
              <div
                className="card3d__bg"
                style={{ backgroundImage: `url(${c.img})` }}
              />
              <div className="card3d__gradient" />
              <div className="card3d__gloss" />
              <div className="card3d__content">
                <div className="card3d__emoji">{c.emoji}</div>
                <div className="card3d__title">{c.title}</div>
                <div className="card3d__subtitle">{c.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
