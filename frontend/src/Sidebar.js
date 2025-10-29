// src/components/Sidebar.js
import React, { useState, useMemo, useEffect, useId, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FaUsers, FaCar, FaSignOutAlt, FaHome, FaSyncAlt, FaMapMarkedAlt,
  FaPlaneDeparture, FaPlaneArrival, FaTasks, FaChevronDown, FaExchangeAlt,
  FaShuttleVan, FaBars, FaFolderOpen, FaCreditCard, FaArchive, FaClock, FaTimes
} from "react-icons/fa";

/* ================= Helpers ================= */
function usePersistentState(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}
function handleSectionKey(e, onToggle) {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
}

function SidebarLink({ to, icon, children, extraClass, end, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        "d-flex align-items-center gap-2 px-3 py-2 rounded sidebar-link " +
        (extraClass ? extraClass + " " : "") + (isActive ? "active" : "")
      }
      title={collapsed ? (typeof children === "string" ? children : "") : undefined}
      style={{ textDecoration: "none" }}
    >
      <span className="sidebar-icon">{icon}</span>
      {!collapsed && <span className="text-truncate">{children}</span>}
    </NavLink>
  );
}
function SectionHeader({ label, icon, active, open, onToggle, collapsed, controlId }) {
  return (
    <div
      role="button" tabIndex={0}
      aria-expanded={open} aria-controls={controlId}
      onClick={onToggle} onKeyDown={(e)=>handleSectionKey(e,onToggle)}
      className={`d-flex align-items-center justify-content-between px-3 py-2 rounded sidebar-section ${active ? "active":""}`}
      title={collapsed ? label : undefined}
    >
      <span className="d-flex align-items-center gap-2">
        <span className="sidebar-icon">{icon}</span>
        {!collapsed && <span className="text-truncate">{label}</span>}
      </span>
      {!collapsed && <FaChevronDown className="chev" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />}
    </div>
  );
}

/* ================= Main ================= */
const Sidebar = ({
  agenceId,
  onRefresh,
  refreshing,
  onLogout,
  agenceNom,
  role,
  currentSpace = "agence", // "agence" | "fournisseur" | "client" | "succursale"
}) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = usePersistentState("sidebar:collapsed", false);

  // applique/retire la classe sur <body> pour gérer la largeur responsive
  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
  }, [collapsed]);

  // ====== ROUTE-AWARE (pour l'espace agence) ======
  const fmActive = useMemo(() => {
    if (!agenceId) return false;
    const base = `/agence/${agenceId}`;
    return (
      location.pathname.startsWith(`${base}/fiches-mouvement`) ||
      location.pathname.startsWith(`${base}/mes-departs`) ||
      location.pathname.startsWith(`${base}/mes-arrivees`) ||
      location.pathname.startsWith(`${base}/fiche-mouvement`)
    );
  }, [location.pathname, agenceId]);

  const missionsActive = useMemo(() => {
    if (!agenceId) return false;
    const base = `/agence/${agenceId}/missions`;
    return (
      location.pathname.startsWith(base) ||
      location.pathname.startsWith(`/agence/${agenceId}/missions/transferts`) ||
      location.pathname.startsWith(`/agence/${agenceId}/missions/excursions`) ||
      location.pathname.startsWith(`/agence/${agenceId}/missions/navettes`)
    );
  }, [location.pathname, agenceId]);

  // ====== STATES d'ouverture PAR ESPACE ======
  const [openFM, setOpenFM] = usePersistentState(`sidebar:${currentSpace}:openFM`, fmActive);
  const [openMissions, setOpenMissions] = usePersistentState(`sidebar:${currentSpace}:openMissions`, missionsActive);

  // 👉 Fix “il faut cliquer pour charger” :
  // si la route correspond, on force l’ouverture de la section concernée
  useEffect(() => {
    if (fmActive && !openFM) setOpenFM(true);
  }, [fmActive, openFM, setOpenFM]);
  useEffect(() => {
    if (missionsActive && !openMissions) setOpenMissions(true);
  }, [missionsActive, openMissions, setOpenMissions]);

  // Menu Fournisseur : ses propres sections (réservations, financements, suivi)
  const [openResa, setOpenResa] = usePersistentState(`sidebar:${currentSpace}:openResa`, true);
  const [openFin, setOpenFin] = usePersistentState(`sidebar:${currentSpace}:openFin`, true);
  const [openSuivi, setOpenSuivi] = usePersistentState(`sidebar:${currentSpace}:openSuivi`, true);

  // visibilité des enfants (ne pas changer l'état quand collapsed)
  const showFMChildren = !collapsed && openFM;
  const showMissionsChildren = !collapsed && openMissions;
  const showResaChildren = !collapsed && openResa;
  const showFinChildren = !collapsed && openFin;
  const showSuiviChildren = !collapsed && openSuivi;

  const fmId = useId();
  const missionsId = useId();
  const resaId = useId();
  const finId = useId();
  const suiviId = useId();

  const toggleCollapsed = useCallback(() => setCollapsed(v=>!v), [setCollapsed]);

  // ====== Rendus de menus ======
  const renderAgenceMenu = () => (
    <>
      <SidebarLink to={`/agence/${agenceId || ""}/ressources`} icon={<FaUsers />} collapsed={collapsed}>
        Ressources
      </SidebarLink>

      <SectionHeader
        label="Fiches de mouvement" icon={<FaCar />} active={fmActive} open={openFM}
        onToggle={()=>setOpenFM(v=>!v)} collapsed={collapsed} controlId={fmId}
      />
      <div id={fmId} hidden={!showFMChildren}>
        <SidebarLink to={`/agence/${agenceId || ""}/mes-departs`} icon={<FaPlaneDeparture />} extraClass="ps-4 small" end collapsed={collapsed}>
          Mes départs
        </SidebarLink>
        <SidebarLink to={`/agence/${agenceId || ""}/mes-arrivees`} icon={<FaPlaneArrival />} extraClass="ps-4 small" end collapsed={collapsed}>
          Mes arrivées
        </SidebarLink>
        <SidebarLink to={`/agence/${agenceId || ""}/fiche-mouvement`} icon={<FaCar />} extraClass="ps-4 small" end collapsed={collapsed}>
          Créer fiche de mouvement
        </SidebarLink>
      </div>

      <SectionHeader
        label="Mes missions" icon={<FaTasks />} active={missionsActive} open={openMissions}
        onToggle={()=>setOpenMissions(v=>!v)} collapsed={collapsed} controlId={missionsId}
      />
      <div id={missionsId} hidden={!showMissionsChildren}>
        <SidebarLink to={`/agence/${agenceId || ""}/missions/transferts`} icon={<FaExchangeAlt />} extraClass="ps-4 small" end collapsed={collapsed}>
          Mes transferts
        </SidebarLink>
        <SidebarLink to={`/agence/${agenceId || ""}/missions/excursions`} icon={<FaMapMarkedAlt />} extraClass="ps-4 small" end collapsed={collapsed}>
          Mes excursions
        </SidebarLink>
        <SidebarLink to={`/agence/${agenceId || ""}/missions/navettes`} icon={<FaShuttleVan />} extraClass="ps-4 small" end collapsed={collapsed}>
          Mes navettes
        </SidebarLink>
      </div>

      <SidebarLink to={`/ordres-mission`} icon={<FaCar />} end collapsed={collapsed}>
        Ordres de Mission
      </SidebarLink>
    </>
  );

  const renderFournisseurMenu = () => (
    <>
      {/* Mes réservations */}
      <SectionHeader
        label="Mes réservations" icon={<FaFolderOpen />} active={false} open={openResa}
        onToggle={()=>setOpenResa(v=>!v)} collapsed={collapsed} controlId={resaId}
      />
      <div id={resaId} hidden={!showResaChildren}>
        <SidebarLink to={`/fournisseur/mes-commandes`} icon={<FaCar />} extraClass="ps-4 small" end collapsed={collapsed}>
          Mes commandes
        </SidebarLink>
        <SidebarLink to={`/fournisseur/annuler-commande`} icon={<FaExchangeAlt />} extraClass="ps-4 small" end collapsed={collapsed}>
          Annuler une commande
        </SidebarLink>
      </div>

      {/* Financements */}
      <SectionHeader
        label="Financements" icon={<FaCreditCard />} active={false} open={openFin}
        onToggle={()=>setOpenFin(v=>!v)} collapsed={collapsed} controlId={finId}
      />
      <div id={finId} hidden={!showFinChildren}>
        <SidebarLink to={`/fournisseur/gestion-tarifs`} icon={<FaMapMarkedAlt />} extraClass="ps-4 small" end collapsed={collapsed}>
          Gestion des tarifs
        </SidebarLink>
        <SidebarLink to={`/fournisseur/paiements-banques`} icon={<FaPlaneArrival />} extraClass="ps-4 small" end collapsed={collapsed}>
          Paiements et banques
        </SidebarLink>
      </div>

      {/* Suivi des transactions */}
      <SectionHeader
        label="Suivi des transactions" icon={<FaTasks />} active={false} open={openSuivi}
        onToggle={()=>setOpenSuivi(v=>!v)} collapsed={collapsed} controlId={suiviId}
      />
      <div id={suiviId} hidden={!showSuiviChildren}>
        <SidebarLink to={`/fournisseur/transactions/archive`} icon={<FaArchive />} extraClass="ps-4 small" end collapsed={collapsed}>
          Archive
        </SidebarLink>
        <SidebarLink to={`/fournisseur/transactions/en-cours`} icon={<FaClock />} extraClass="ps-4 small" end collapsed={collapsed}>
          En cours
        </SidebarLink>
        <SidebarLink to={`/fournisseur/transactions/a-venir`} icon={<FaClock />} extraClass="ps-4 small" end collapsed={collapsed}>
          À venir
        </SidebarLink>
      </div>
    </>
  );

  const renderClientMenu = () => (
    <>
      <SidebarLink to={`/espace/client/dashboard`} icon={<FaUsers />} collapsed={collapsed}>
        Accueil client
      </SidebarLink>
      {/* Ajouter sections client si besoin */}
    </>
  );

  const renderSuccursaleMenu = () => (
    <>
      <SidebarLink to={`/espace/succursale/dashboard`} icon={<FaUsers />} collapsed={collapsed}>
        Accueil succursale
      </SidebarLink>
      {/* Ajouter sections succursale si besoin */}
    </>
  );

  const renderBySpace = () => {
    switch (currentSpace) {
      case "fournisseur": return renderFournisseurMenu();
      case "client": return renderClientMenu();
      case "succursale": return renderSuccursaleMenu();
      case "agence":
      default: return renderAgenceMenu();
    }
  };

  return (
    <>
      {/* Burger / Close */}
      <button
        type="button"
        aria-label={collapsed ? "Ouvrir le menu" : "Replier le menu"}
        aria-pressed={!collapsed}
        onClick={toggleCollapsed}
        className="btn btn-dark sidebar-burger"
        title={collapsed ? "Ouvrir le menu" : "Replier le menu"}
      >
        {collapsed ? <FaBars /> : <FaTimes />}
      </button>

      <aside className="sidebar-root text-white">
        {/* Header */}
        <div className="d-flex align-items-center gap-2 mb-3">
          <div className="brand-icon" title={collapsed ? (agenceNom || "Mon Agence") : undefined}>
            <FaHome />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="fw-bold text-truncate">{agenceNom || "Mon Agence"}</div>
              <div className="text-white-50 small text-truncate">
                {role === "superadmin" ? "Super Admin" : "Admin Agence"}
              </div>
            </div>
          )}
        </div>

        {/* Menu dynamique par espace */}
        <nav className="mt-2 d-grid gap-2">
          {renderBySpace()}
        </nav>

        {/* Bas */}
        <div className="mt-auto d-grid gap-2">
          <button
            className="btn btn-outline-light d-flex align-items-center justify-content-center gap-2"
            onClick={onRefresh}
            disabled={refreshing}
            title={collapsed ? "Actualiser" : undefined}
          >
            <FaSyncAlt /> {!collapsed && (refreshing ? "Actualisation…" : "Actualiser")}
          </button>
          <button
            className="btn btn-danger d-flex align-items-center justify-content-center gap-2"
            onClick={onLogout}
            title={collapsed ? "Déconnexion" : undefined}
          >
            <FaSignOutAlt /> {!collapsed && "Déconnexion"}
          </button>
        </div>
      </aside>

      <style>{`
        :root{
          --sidebar-w-open: 270px;
          --sidebar-w-closed: 64px;
          --sidebar-bg: linear-gradient(180deg, #0f172a 0%, #111827 40%, #0b1020 100%);
          --sidebar-border: 1px solid rgba(255,255,255,.08);
        }
        body{ --app-left: var(--sidebar-w-open); }
        body.sidebar-collapsed{ --app-left: var(--sidebar-w-closed); }

        .sidebar-burger{
          position: fixed; top: 12px; left: 12px; z-index: 1100;
          width: 38px; height: 38px; padding: 0; border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0,0,0,.25);
          display: grid; place-items: center;
        }
        .sidebar-root{
          position: fixed; inset: 0 auto 0 0; height: 100vh;
          width: var(--app-left);
          background: var(--sidebar-bg); border-right: var(--sidebar-border);
          padding: 12px; display: flex; flex-direction: column; gap: 8px;
          transition: width .2s ease; z-index: 1090;
        }
        .brand-icon{
          width: 36px; height: 36px; border-radius: 50%;
          display: grid; place-items: center; background: rgba(255,255,255,.08); color: #fff;
        }
        .sidebar-icon{ width: 20px; display: inline-flex; justify-content: center; opacity: .95; }
        .sidebar-link{ color: rgba(255,255,255,.55); }
        .sidebar-link:hover{ color: #fff !important; background: rgba(255,255,255,.08); }
        .sidebar-link.active{ background: #f8f9fa; color: #111 !important; font-weight: 600; }
        .sidebar-section{ color: rgba(255,255,255,.55); user-select: none; }
        .sidebar-section:hover{ color: #fff; background: rgba(255,255,255,.08); }
        .sidebar-section.active{ background: #f8f9fa; color: #111; font-weight: 600; }
        .sidebar-section .chev{ transition: transform .2s ease, opacity .2s ease; opacity: .85; }
      `}</style>
    </>
  );
};

export default Sidebar;
