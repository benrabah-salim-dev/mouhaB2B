// src/components/Sidebar.js
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FaUsers, FaCar, FaSyncAlt, FaMapMarkedAlt,FaCog,
  FaPlaneDeparture, FaPlaneArrival, FaTasks, FaChevronDown,
  FaExchangeAlt, FaShuttleVan, FaBars, FaArchive, FaTimes, FaCloudUploadAlt, FaSignOutAlt
} from "react-icons/fa";

/* ================= Helpers ================= */
function usePersistentState(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

function SidebarLink({ to, icon, children, extraClass, end, collapsed }) {
  return (
    <NavLink
      to={to} end={end}
      className={({ isActive }) => 
        `d-flex align-items-center gap-3 px-3 py-2 rounded-3 sidebar-link transition-all ${extraClass || ""} ${isActive ? "active shadow-sm" : ""}`
      }
      title={collapsed ? (typeof children === "string" ? children : "") : undefined}
    >
      <span className="sidebar-icon fs-5">{icon}</span>
      {!collapsed && <span className="text-truncate fw-medium">{children}</span>}
    </NavLink>
  );
}

function SectionHeader({ label, icon, active, open, onToggle, collapsed }) {
  return (
    <div
      role="button"
      onClick={onToggle}
      className={`d-flex align-items-center justify-content-between px-3 py-2 rounded-3 sidebar-section transition-all ${active ? "active shadow-sm" : ""}`}
    >
      <span className="d-flex align-items-center gap-3">
        <span className="sidebar-icon fs-5">{icon}</span>
        {!collapsed && <span className="text-truncate fw-medium">{label}</span>}
      </span>
      {!collapsed && (
        <FaChevronDown className="chev" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: '0.3s', fontSize: '10px' }} />
      )}
    </div>
  );
}

const Sidebar = ({ agenceId, onRefresh, refreshing, onLogout, currentSpace = "agence" }) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = usePersistentState("sidebar:collapsed", false);

  useLayoutEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    // Force le recalcul de la largeur sans scrollbar
    document.body.style.overflowX = "hidden";
  }, [collapsed]);

  const fmActive = useMemo(() => location.pathname.includes("fiche-mouvement") || location.pathname.includes("mes-departs") || location.pathname.includes("mes-arrivees"), [location]);
  const missionsActive = useMemo(() => location.pathname.includes("missions/"), [location]);

  const [openFM, setOpenFM] = usePersistentState(`sidebar:${currentSpace}:openFM`, fmActive);
  const [openMissions, setOpenMissions] = usePersistentState(`sidebar:${currentSpace}:openMissions`, missionsActive);

  const toggleCollapsed = useCallback(() => setCollapsed(v => !v), [setCollapsed]);

  const renderAgenceMenu = () => (
    <>
      <SidebarLink to={`/agence/${agenceId}/ressources`} icon={<FaUsers />} collapsed={collapsed}>Ressources</SidebarLink>
      
      <SectionHeader label="Fiches Mouvement" icon={<FaCar />} active={fmActive} open={openFM} onToggle={() => setOpenFM(!openFM)} collapsed={collapsed} />
      {(!collapsed && openFM) && (
        <div className="ps-3 d-grid gap-1 mt-1 animate-fadeIn">
          <SidebarLink to={`/agence/${agenceId}/mes-departs`} icon={<FaPlaneDeparture />} extraClass="small opacity-75" collapsed={collapsed}>Mes départs</SidebarLink>
          <SidebarLink to={`/agence/${agenceId}/mes-arrivees`} icon={<FaPlaneArrival />} extraClass="small opacity-75" collapsed={collapsed}>Mes arrivées</SidebarLink>
          <SidebarLink to={`/agence/${agenceId}/fiche-mouvement`} icon={<FaCloudUploadAlt />} extraClass="small opacity-75" collapsed={collapsed}>Importer dossiers</SidebarLink>
        </div>
      )}

      <SectionHeader label="Mes Missions" icon={<FaTasks />} active={missionsActive} open={openMissions} onToggle={() => setOpenMissions(!openMissions)} collapsed={collapsed} />
      {(!collapsed && openMissions) && (
        <div className="ps-3 d-grid gap-1 mt-1">
          <SidebarLink to="/missions/transferts" icon={<FaExchangeAlt />} extraClass="small opacity-75" collapsed={collapsed}>Transferts</SidebarLink>
          <SidebarLink
  to="/missions/transferts/archive"
  icon={<FaArchive />}
  extraClass="small opacity-75"
  collapsed={collapsed}
>
  Archives
</SidebarLink>

          <SidebarLink to="/excursions" icon={<FaMapMarkedAlt />} extraClass="small opacity-75" collapsed={collapsed}>Excursions</SidebarLink>
          <SidebarLink to={`/agence/${agenceId}/missions/navettes`} icon={<FaShuttleVan />} extraClass="small opacity-75" collapsed={collapsed}>Navettes</SidebarLink>
        </div>
        
      )}
    </>
  );

  return (
    <>
      <button onClick={toggleCollapsed} className="sidebar-burger">
        {collapsed ? <FaBars /> : <FaTimes />}
      </button>

      <aside className="sidebar-root">
        <div style={{ height: '70px' }}></div> {/* Espace pour le bouton burger */}

        <nav className="flex-fill d-grid gap-2 overflow-y-auto px-2 custom-scrollbar">
          {currentSpace === "agence" && renderAgenceMenu()}
            {/* ✅ Paramètres */}
<SidebarLink to={`/agence/${agenceId}/parametres`} icon={<FaCog />} collapsed={collapsed}>
  Paramètres
</SidebarLink>



        </nav>

        <div className="sidebar-footer">
          <button className="btn-footer" onClick={onRefresh} disabled={refreshing}>
            <FaSyncAlt className={refreshing ? 'fa-spin' : ''} /> {!collapsed && "Actualiser"}
          </button>
          <button className="btn-footer text-danger" onClick={onLogout}>
            <FaSignOutAlt /> {!collapsed && "Déconnexion"}
          </button>
        </div>
      </aside>

      <style>{`
        :root {
          --sidebar-w: 260px;
          --sidebar-w-collapsed: 75px;
          --app-left: var(--sidebar-w);
          --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        body.sidebar-collapsed { --app-left: var(--sidebar-w-collapsed); }
        body { overflow-x: hidden !important; }

        .sidebar-root {
          position: fixed; inset: 0 auto 0 0; width: var(--app-left);
          background: #0f172a; padding: 10px 0;
          display: flex; flex-direction: column; transition: var(--transition); z-index: 1040;
          border-right: 1px solid rgba(255,255,255,0.05);
        }

        .sidebar-burger {
          position: fixed; top: 15px; left: 20px; z-index: 1050;
          background: transparent; border: none; color: #94a3b8;
          width: 35px; height: 35px; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: var(--transition);
        }
        .sidebar-burger:hover { color: #fff; }

        .sidebar-link, .sidebar-section { 
          color: #94a3b8; padding: 10px 15px; text-decoration: none; font-size: 0.95rem;
          transition: var(--transition); cursor: pointer; border-radius: 8px;
        }
        .sidebar-link:hover, .sidebar-section:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .sidebar-link.active { background: #fff !important; color: #0f172a !important; font-weight: 600; }
        
        .sidebar-footer { border-top: 1px solid rgba(255,255,255,0.1); padding: 15px 10px; display: grid; gap: 5px; }
        .btn-footer { 
          background: transparent; border: none; color: #94a3b8; display: flex; align-items: center; 
          gap: 15px; padding: 10px 15px; border-radius: 8px; width: 100%; transition: 0.2s;
        }
        .btn-footer:hover { background: rgba(255,255,255,0.05); color: #fff; }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        
        .page-content { 
          margin-left: var(--app-left); 
          transition: var(--transition); 
          max-width: calc(100vw - var(--app-left));
        }
      `}</style>
    </>
  );
};

export default Sidebar;