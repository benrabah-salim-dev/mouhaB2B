// src/DashboardAgence.js
import React, { useEffect, useMemo, useState, useContext } from "react";
import api from "./api";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { AuthContext } from "./context/AuthContext";
import { FaPlaneArrival, FaPlaneDeparture } from "react-icons/fa";
import Sidebar from "./Sidebar";

/* ----------------------------- Mini Charts ----------------------------- */

function MiniBarChart({ data = [], height = 120, barGap = 6, className = "" }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const barWidth = Math.max(
    8,
    Math.floor((280 - (data.length - 1) * barGap) / Math.max(1, data.length))
  );
  const totalWidth =
    data.length * barWidth + Math.max(0, data.length - 1) * barGap;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${totalWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label="Histogramme des dossiers sur la période"
    >
      <line
        x1="0"
        y1={height - 0.5}
        x2={totalWidth}
        y2={height - 0.5}
        stroke="#e5e7eb"
      />
      {data.map((d, i) => {
        const v = Number(d.value) || 0;
        const h = Math.round((v / max) * (height - 20));
        const x = i * (barWidth + barGap);
        const y = height - h;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y - 0.5}
              width={barWidth}
              height={h}
              rx="4"
              fill="#0ea5e9"
            />
            {h > 24 && (
              <text
                x={x + barWidth / 2}
                y={y - 6}
                fontSize="10"
                textAnchor="middle"
                fill="#111827"
              >
                {v}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function MiniDonut({
  value = 0,
  total = 1,
  size = 120,
  stroke = 14,
  color = "#10b981",
  label = "",
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, (value / Math.max(1, total)) * 100));
  const dash = (pct / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`Progression ${label}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          color: "#111827",
        }}
      >
        <div style={{ textAlign: "center", lineHeight: 1.1 }}>
          <div style={{ fontSize: 18 }}>{Math.round(pct)}%</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Main Component ----------------------------- */

const DashboardAgence = () => {
  const ctx = useContext(AuthContext);
  const { user, initialized, logout } = ctx || {};
  const { agence_id: agenceParam } = useParams();
  const navigate = useNavigate();

  const isSuperAdmin = user?.role === "superadmin";
  const agence_id = isSuperAdmin ? agenceParam : user?.agence_id;

  const [agence, setAgence] = useState(null);
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    if (!user) return;
    if (isSuperAdmin && !agenceParam) {
      setError("Aucune agence spécifiée pour le superadmin.");
      setLoading(false);
      return;
    }
    if (!agence_id) {
      setError("Aucune agence sélectionnée.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [agenceRes, dossiersRes] = await Promise.all([
        api.get(`agences/${agence_id}/`),
        api.get("dossiers/", { params: { agence: agence_id } }),
      ]);
      setAgence(agenceRes.data);
      const arr = Array.isArray(dossiersRes.data)
        ? dossiersRes.data
        : dossiersRes.data?.results || [];
      setDossiers(arr);
      setError(null);
    } catch (err) {
      console.error("Dashboard fetch error:", err?.response?.status, err?.response?.data || err?.message);
      if (err?.response?.status === 401) {
        logout?.(true);
        return;
      }
      setError("Erreur lors du chargement des données.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialized || !user) return;
    fetchData();
  }, [initialized, user, agenceParam, agence_id, isSuperAdmin]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  const kpis = useMemo(() => {
    const total = dossiers.length;
    let arr = 0;
    let dep = 0;
    let paxArr = 0;
    let paxDep = 0;

    const perDay = new Map();
    const perCity = new Map();

    dossiers.forEach((d) => {
      if (d.heure_arrivee) arr += 1;
      if (d.heure_depart) dep += 1;
      paxArr += Number(d.nombre_personnes_arrivee || 0);
      paxDep += Number(d.nombre_personnes_retour || 0);

      const dk = d.heure_arrivee || d.heure_depart;
      if (dk) {
        const dKey = new Date(dk).toISOString().slice(0, 10);
        perDay.set(dKey, (perDay.get(dKey) || 0) + 1);
      }

      const city = (d.ville || "").trim() || "—";
      perCity.set(city, (perCity.get(city) || 0) + 1);
    });

    const days = Array.from(perDay.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-7)
      .map(([label, value]) => ({ label, value }));

    const topCities = Array.from(perCity.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));

    return {
      total,
      arrivals: arr,
      departures: dep,
      paxTotal: paxArr + paxDep,
      days,
      topCities,
    };
  }, [dossiers]);

  if (!ctx) return <Navigate to="/login" replace />;
  if (!initialized) return <p className="m-4">Chargement en cours…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (error) return <p className="m-4 text-danger">{error}</p>;

  return (
    <div className="d-flex">
      <Sidebar
        agenceId={agence_id}
        agenceNom={agence?.nom}
        role={user?.role}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onLogout={() => logout(true)}
      />

      <main className="container-fluid" style={{ marginLeft: 270 }}>
        <header className="py-3 border-bottom d-flex align-items-center justify-content-between">
          <div>
            <h2 className="fw-bold mb-1">Tableau de bord</h2>
            <div className="text-muted">
              {agence?.nom || agence_id} • {kpis.total} dossier(s)
            </div>
          </div>
        </header>

        {/* KPIs */}
        <section className="row g-3 my-2">
          {/* KPI Cards */}
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm h-100">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <div className="text-muted small">Total dossiers</div>
                  <div className="fs-3 fw-bold">{kpis.total}</div>
                </div>
                <MiniDonut
                  value={kpis.total}
                  total={Math.max(kpis.total, 10)}
                  label="Total"
                  color="#6366f1"
                />
              </div>
            </div>
          </div>
          {/* Arrivées */}
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm h-100">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <div className="text-muted small d-flex align-items-center gap-1">
                    <FaPlaneArrival /> Arrivées
                  </div>
                  <div className="fs-3 fw-bold">{kpis.arrivals}</div>
                </div>
                <MiniDonut
                  value={kpis.arrivals}
                  total={Math.max(1, kpis.arrivals + kpis.departures)}
                  label="du total"
                  color="#22c55e"
                />
              </div>
            </div>
          </div>
          {/* Départs */}
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm h-100">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <div className="text-muted small d-flex align-items-center gap-1">
                    <FaPlaneDeparture /> Départs
                  </div>
                  <div className="fs-3 fw-bold">{kpis.departures}</div>
                </div>
                <MiniDonut
                  value={kpis.departures}
                  total={Math.max(1, kpis.arrivals + kpis.departures)}
                  label="du total"
                  color="#f59e0b"
                />
              </div>
            </div>
          </div>
          {/* PAX Total */}
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm h-100">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <div className="text-muted small">PAX total (A+R)</div>
                  <div className="fs-3 fw-bold">{kpis.paxTotal}</div>
                </div>
                <MiniDonut
                  value={kpis.paxTotal}
                  total={Math.max(kpis.paxTotal, 100)}
                  label="cap."
                  color="#0ea5e9"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Graphiques */}
        <section className="row g-3">
          <div className="col-lg-8">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h5 className="card-title mb-0">Activité récente (7 derniers jours)</h5>
                  <span className="text-muted small">
                    {kpis.days.length
                      ? `${kpis.days[0]?.label} → ${kpis.days[kpis.days.length - 1]?.label}`
                      : "—"}
                  </span>
                </div>
                <MiniBarChart data={kpis.days} />
                <div className="text-muted small mt-1">
                  Nombre de dossiers par jour (arrivées + départs).
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h5 className="card-title">Top villes</h5>
                {!kpis.topCities.length ? (
                  <div className="text-muted">Aucune donnée.</div>
                ) : (
                  <ul className="list-group list-group-flush">
                    {kpis.topCities.map((c) => (
                      <li
                        key={c.label}
                        className="list-group-item d-flex align-items-center justify-content-between"
                      >
                        <span>{c.label}</span>
                        <span className="badge bg-primary">{c.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default DashboardAgence;
