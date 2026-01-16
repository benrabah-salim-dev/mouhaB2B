import React, { useEffect, useMemo, useState, useContext } from "react";
import api from "./api";
import { useParams, Navigate } from "react-router-dom";
import { AuthContext } from "./context/AuthContext";
import { 
  Users, Calendar, MapPin, TrendingUp, 
  ArrowUpRight, ArrowDownRight, Activity, Ship, Plane, Navigation
} from "lucide-react";
import Sidebar from "./Sidebar";

// --- COMPOSANTS DE VISUALISATION ---

const StatCard = ({ title, value, icon, trend, up, color = "primary" }) => (
  <div className="col-md-3">
    <div className="card border-0 shadow-sm p-3 h-100">
      <div className="d-flex justify-content-between mb-2">
        <div className={`p-2 bg-${color} bg-opacity-10 rounded text-${color}`}>{icon}</div>
        {trend && (
          <span className={`small fw-bold ${up ? 'text-success' : 'text-danger'}`}>
            {up ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {trend}
          </span>
        )}
      </div>
      <div className="text-muted small fw-medium text-uppercase" style={{ fontSize: '0.75rem' }}>{title}</div>
      <div className="fs-3 fw-bold text-dark">{value}</div>
    </div>
  </div>
);

const PerformanceBar = ({ label, value, max, color = "#0d6efd" }) => (
  <div className="mb-3">
    <div className="d-flex justify-content-between align-items-center mb-1">
      <span className="fw-medium small text-dark">{label}</span>
      <span className="small text-muted">{value} dossiers</span>
    </div>
    <div className="progress" style={{ height: "8px", backgroundColor: "#f0f2f5" }}>
      <div 
        className="progress-bar" 
        style={{ 
          width: `${(value / max) * 100}%`, 
          backgroundColor: color,
          borderRadius: "4px" 
        }}
      />
    </div>
  </div>
);

// --- COMPOSANT PRINCIPAL ---

const DashboardAgence = () => {
  const { user, initialized, logout } = useContext(AuthContext) || {};
  const { agence_id: agenceParam } = useParams();
  const agence_id = user?.role === "superadmin" ? agenceParam : user?.agence_id;

  const [state, setState] = useState({
    agence: null,
    dossiers: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    if (!initialized || !user || !agence_id) return;

    const loadData = async () => {
      try {
        const [resAg, resDos] = await Promise.all([
          api.get(`agences/${agence_id}/`),
          api.get("dossiers/", { params: { agence: agence_id } })
        ]);
        setState({
          agence: resAg.data,
          dossiers: Array.isArray(resDos.data) ? resDos.data : resDos.data.results || [],
          loading: false,
          error: null
        });
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: "Erreur de chargement" }));
      }
    };
    loadData();
  }, [initialized, user, agence_id]);

  // --- LOGIQUE MÉTIER / KPI ---
  const kpis = useMemo(() => {
    const ds = state.dossiers;
    const total = ds.length;
    
    // 1. Répartition par Type de Mouvement (Basé sur ton model Dossier)
    const types = ds.reduce((acc, d) => {
      const t = d.type_mouvement || 'AUTRE';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    // 2. Top Villes (Destinations)
    const cities = ds.reduce((acc, d) => {
      if (d.ville) acc[d.ville] = (acc[d.ville] || 0) + 1;
      return acc;
    }, {});
    const topCities = Object.entries(cities).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const maxCity = Math.max(...Object.values(cities), 1);

    // 3. Calcul des passagers (PAX)
    const totalPax = ds.reduce((acc, d) => 
        acc + (Number(d.nombre_personnes_arrivee) || 0) + (Number(d.nombre_personnes_retour) || 0), 0);
    
    // 4. Missions vs Dossiers (Taux de transformation)
    const withMission = ds.filter(d => d.mission).length;
    const conversionRate = total > 0 ? Math.round((withMission / total) * 100) : 0;

    return { total, types, topCities, maxCity, totalPax, conversionRate };
  }, [state.dossiers]);

  if (state.loading) return <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div>;

  return (
    <div className="d-flex bg-light min-vh-100">
      <Sidebar agenceId={agence_id} role={user?.role} />

      <main className="p-4 w-100" style={{ marginLeft: 270 }}>
        {/* Header avec résumé rapide */}
        <div className="row align-items-center mb-4">
          <div className="col">
            <h2 className="fw-bold mb-1">Tableau de Bord Performance</h2>
            <p className="text-muted small">
              <MapPin size={14} className="me-1"/> {state.agence?.nom} • 
              <Calendar size={14} className="ms-2 me-1"/> {new Date().toLocaleDateString('fr-FR', {month: 'long', year: 'numeric'})}
            </p>
          </div>
          <div className="col-auto">
            <div className="bg-white p-2 px-3 rounded-pill shadow-sm border d-flex align-items-center">
              <div className="dot bg-success me-2" style={{width: 8, height: 8, borderRadius: '50%'}}></div>
              <span className="small fw-bold">Live: {kpis.total} Dossiers</span>
            </div>
          </div>
        </div>

        {/* Section 1: Top KPIs Métier */}
        <div className="row g-3 mb-4">
          <StatCard title="Volume Total" value={kpis.total} icon={<Activity size={20}/>} trend="+8%" up color="primary" />
          <StatCard title="Passagers" value={kpis.totalPax} icon={<Users size={20}/>} trend="+15%" up color="info" />
          <StatCard title="Transformés" value={`${kpis.conversionRate}%`} icon={<TrendingUp size={20}/>} trend="+2%" up color="success" />
          <StatCard title="En attente" value={kpis.total - (kpis.types['ARRIVEE'] || 0)} icon={<Navigation size={20}/>} color="warning" />
        </div>

        <div className="row g-4">
          {/* Section 2: Répartition des types de flux (Basé sur types_mouvement) */}
          <div className="col-lg-7">
            <div className="card border-0 shadow-sm p-4 h-100">
              <div className="d-flex justify-content-between align-items-start mb-4">
                <div>
                  <h5 className="fw-bold mb-1">Répartition des Flux</h5>
                  <p className="text-muted small">Analyse par type de trajet</p>
                </div>
                <div className="badge bg-primary bg-opacity-10 text-primary">Mensuel</div>
              </div>
              
              <div className="row text-center mt-2">
                <div className="col-4">
                  <div className="p-3 bg-light rounded-3">
                    <Plane className="text-primary mb-2" size={24}/>
                    <h4 className="fw-bold mb-0">{kpis.types['ARRIVEE'] || 0}</h4>
                    <span className="x-small text-muted text-uppercase">Arrivées</span>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-3 bg-light rounded-3">
                    <Ship className="text-info mb-2" size={24}/>
                    <h4 className="fw-bold mb-0">{kpis.types['DEPART'] || 0}</h4>
                    <span className="x-small text-muted text-uppercase">Départs</span>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-3 bg-light rounded-3">
                    <Navigation className="text-warning mb-2" size={24}/>
                    <h4 className="fw-bold mb-0">{kpis.types['INTER_HOTEL'] || 0}</h4>
                    <span className="x-small text-muted text-uppercase">Inter-Hôtels</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-top">
                <div className="d-flex justify-content-between align-items-center">
                  <span className="small text-muted">Efficacité de planification</span>
                  <span className="fw-bold text-success">Excellent (94%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Top Destinations (Villes) */}
          <div className="col-lg-5">
            <div className="card border-0 shadow-sm p-4 h-100">
              <h5 className="fw-bold mb-4">Top Destinations</h5>
              <div className="mt-2">
                {kpis.topCities.length > 0 ? kpis.topCities.map(([name, val]) => (
                  <PerformanceBar 
                    key={name} 
                    label={name} 
                    value={val} 
                    max={kpis.maxCity} 
                    color={name === kpis.topCities[0][0] ? "#0d6efd" : "#adb5bd"}
                  />
                )) : <p className="text-muted italic">Aucune donnée géographique</p>}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardAgence;