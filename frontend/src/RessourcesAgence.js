// src/pages/AgenceRessourcesHub.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "./api";

/**
 * AgenceRessourcesHub — version UI/UX pro
 */

export default function AgenceRessourcesHub() {
  const navigate = useNavigate();
  const { agence_id } = useParams();

  // ---- État des stats
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vehStats, setVehStats] = useState({ total: 0, dispo: 0 });
  const [chfStats, setChfStats] = useState({ total: 0, dispo: 0 });
  const lastUpdateRef = useRef(null);

  const prefersReducedMotion = useMemo(
    () =>
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // Helpers
  const extractRows = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    const maybe =
      payload && typeof payload === "object"
        ? Object.values(payload).find(Array.isArray)
        : null;
    return Array.isArray(maybe) ? maybe : [];
  };
  const extractCount = (payload, rows) =>
    Number.isFinite(payload?.count) ? Number(payload.count) : rows.length;

  // si vos objets portent bien une propriété de disponibilité ; sinon, on n’affiche pas la chip “disponibles”
  const isDispo = (o) =>
    o?.disponibilite ??
    o?.disponibilité ??
    o?.disponible ??
    o?.available ??
    false;

  const fetchStats = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { agence: agence_id };

      // ⚠️ IMPORTANT : on utilise api.get("vehicules/") et pas axios.get(`${API_URL}/api/vehicules/`)
      const [vRes, cRes] = await Promise.all([
        api.get(`vehicules/`, { params }),
        api.get(`chauffeurs/`, { params }),
      ]);

      // Véhicules
      const vRows = extractRows(vRes.data);
      const vCount = extractCount(vRes.data, vRows);
      const vDispo = Number.isFinite(vRes.data?.count)
        ? null // si DRF pagine, on ne calcule pas la dispo (nécessiterait d’agréger toutes les pages)
        : vRows.filter(isDispo).length;

      // Chauffeurs
      const cRows = extractRows(cRes.data);
      const cCount = extractCount(cRes.data, cRows);
      const cDispo = Number.isFinite(cRes.data?.count) ? null : cRows.filter(isDispo).length;

      setVehStats({ total: vCount, dispo: vDispo ?? undefined });
      setChfStats({ total: cCount, dispo: cDispo ?? undefined });
      lastUpdateRef.current = new Date();
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
          e?.message ||
          "Erreur de chargement des statistiques."
      );
      setVehStats({ total: 0, dispo: 0 });
      setChfStats({ total: 0, dispo: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!agence_id) return;
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agence_id]);

  // Cartes
  const cards = [
    {
      key: "vehicules",
      emoji: "🚌",
      title: "Véhicules",
      subtitle: "Lister, associer, importer",
      img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1600&auto=format&fit=crop",
      stats: vehStats,
      onClick: () => navigate(`/agence/${agence_id}/ressources/vehicules`),
      actions: [
        {
          label: "Voir",
          onClick: () => navigate(`/agence/${agence_id}/ressources/vehicules`),
        },
        {
          label: "Importer",
          variant: "outline-light",
          onClick: () => navigate(`/importer-vehicules/${agence_id}`),
        },
      ],
    },
    {
      key: "chauffeurs",
      emoji: "🧑\u200d✈️",
      title: "Chauffeurs",
      subtitle: "Lister, associer, importer",
      img: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=1600&auto=format&fit=crop",
      stats: chfStats,
      onClick: () => navigate(`/agence/${agence_id}/ressources/chauffeurs`),
      actions: [
        {
          label: "Voir",
          onClick: () => navigate(`/agence/${agence_id}/ressources/chauffeurs`),
        },
        {
          label: "Importer",
          variant: "outline-light",
          onClick: () => navigate(`/importer-chauffeurs/${agence_id}`),
        },
      ],
    },
  ];

  // Effet tilt (subtil, désactivé si reduced-motion)
  const handleMouseMove = (e) => {
    if (prefersReducedMotion) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;
    const maxRotate = 8;
    const rotY = ((x - midX) / midX) * maxRotate;
    const rotX = -((y - midY) / midY) * maxRotate;
    card.style.transform = `perspective(1100px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px)`;
  };
  const resetTilt = (e) => {
    if (prefersReducedMotion) return;
    e.currentTarget.style.transform = "";
  };

  const fmtTime = (d) =>
    d
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(d)
      : "—";

  return (
    <>
      <style>{`
        .hub-container { max-width: 1200px; margin: 40px auto; padding: 0 16px; }
        .hub-header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom: 12px; }
        .hub-title { margin: 0; font-weight: 800; letter-spacing: .2px; }
        .hub-sub { color: #6b7280; }
        .hub-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 22px; }

        .card3d { position: relative; border: 1px solid #e5e7eb; border-radius: 18px; min-height: 220px; width: 100%; text-align: left; background: #0b1020; cursor: pointer; overflow: hidden; box-shadow: 0 14px 32px rgba(0,0,0,.16); transition: transform 180ms ease, box-shadow 220ms ease; will-change: transform; }
        .card3d:hover { box-shadow: 0 24px 54px rgba(0,0,0,.22); }
        .card3d__bg { position: absolute; inset: 0; background-size: cover; background-position: center; transform: scale(1.03); filter: saturate(.95) contrast(1.05) brightness(.95); }
        .card3d__gradient { position: absolute; inset: 0; background: radial-gradient(130% 150% at 10% 8%, rgba(15,23,42,.15) 0%, rgba(15,23,42,.55) 50%, rgba(2,6,23,.88) 100%), linear-gradient(0deg, rgba(2,6,23,.28), rgba(2,6,23,.28)); }
        .card3d__gloss { position: absolute; inset: -40% -40%; background: radial-gradient(circle at 30% -10%, rgba(255,255,255,.22), rgba(255,255,255,0) 45%); mix-blend-mode: screen; transform: rotate(8deg); }
        .card3d__content { position: relative; z-index: 2; color: #e5e7eb; padding: 22px; display: flex; flex-direction: column; gap: 8px; height: 100%; }
        .card3d__emoji { font-size: 40px; line-height: 1; text-shadow: 0 3px 10px rgba(0,0,0,.35); }
        .card3d__title { font-size: 22px; font-weight: 800; letter-spacing: .2px; color: #f1f5f9; text-shadow: 0 2px 8px rgba(0,0,0,.35); }
        .card3d__subtitle { color: #cbd5e1; font-size: 14px; }

        .card3d__stats { margin-top: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .chip { display:inline-flex; align-items:center; gap:6px; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; border:1px solid rgba(255,255,255,.18); background: rgba(15,23,42,.35); color:#e5e7eb; }
        .chip--accent { background: rgba(16,185,129,.22); border-color: rgba(16,185,129,.45); color: #d1fae5; }
        .chip--warn { background: rgba(234,179,8,.22); border-color: rgba(234,179,8,.45); color: #fef3c7; }

        .card3d__topright { position:absolute; right: 12px; top: 12px; display:flex; gap:8px; z-index:2; }
        .btn-mini { padding: 6px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; color:#0b1020; background: #e5e7eb; border: 0; }
        .btn-mini:hover { filter: brightness(.95); }
        .btn-mini--ghost { background: transparent; color: #e5e7eb; border:1px solid rgba(255,255,255,.25); }

        .card3d::after { content: ""; position: absolute; inset: 1px; border-radius: 16px; pointer-events: none; background: linear-gradient(120deg, rgba(99,102,241,.24), rgba(14,165,233,.24), rgba(16,185,129,.24)); opacity: 0; transition: opacity 180ms ease; }
        .card3d:hover::after { opacity: 1; }

        .skeleton { background: linear-gradient(90deg, #111827 25%, #1f2937 37%, #111827 63%); background-size: 400% 100%; animation: shimmer 1.2s ease-in-out infinite; border-radius: 10px; height: 180px; }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

        @media (prefers-reduced-motion: reduce) {
          .card3d, .card3d::after { transition: none; }
        }
      `}</style>

      <div className="hub-container">
        <div className="hub-header">
          <div>
            <h2 className="hub-title">Ressources de l’agence</h2>
            <div className="hub-sub">
              Gérer vos ressources : listes, associations, import Excel.
              {lastUpdateRef.current && (
                <span className="ms-2 text-muted">
                  • Dernière mise à jour : {fmtTime(lastUpdateRef.current)}
                </span>
              )}
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={fetchStats}>
              Actualiser
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <div className="hub-grid" role="list">
          {loading ? (
            <>
              <div className="skeleton" aria-hidden />
              <div className="skeleton" aria-hidden />
            </>
          ) : (
            cards.map((c) => (
              <button
                key={c.key}
                className="card3d"
                role="listitem"
                onMouseMove={handleMouseMove}
                onMouseLeave={resetTilt}
                onClick={c.onClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    c.onClick();
                  }
                }}
                aria-label={`${c.title}. ${c.subtitle}. ${c.stats.total} éléments${
                  typeof c.stats.dispo === "number"
                    ? `, ${c.stats.dispo} disponibles`
                    : ""
                }. Ouvrir.`}
              >
                <div
                  className="card3d__bg"
                  style={{ backgroundImage: `url(${c.img})` }}
                />
                <div className="card3d__gradient" />
                <div className="card3d__gloss" />

                <div
                  className="card3d__topright"
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.actions?.map((a, i) => (
                    <button
                      key={i}
                      className={`btn-mini ${
                        a.variant === "outline-light" ? "btn-mini--ghost" : ""
                      }`}
                      onClick={a.onClick}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                <div className="card3d__content">
                  <div className="card3d__emoji" aria-hidden>
                    {c.emoji}
                  </div>
                  <div className="card3d__title">{c.title}</div>
                  <div className="card3d__subtitle">{c.subtitle}</div>

                  <div className="card3d__stats" aria-hidden>
                    <span className="chip chip--accent">
                      {c.stats.total} au total
                    </span>
                    {typeof c.stats.dispo === "number" && (
                      <span className="chip chip--warn">
                        {c.stats.dispo} disponibles
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
