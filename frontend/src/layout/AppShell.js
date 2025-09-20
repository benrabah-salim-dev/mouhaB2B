import React, { useMemo, useState, useContext } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import styles from "./AppShell.module.css";

export default function AppShell() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { agence_id: agenceParam } = useParams();

  const isSuperAdmin = user?.role === "superadmin";
  const agence_id = isSuperAdmin ? agenceParam : user?.agence_id;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const links = useMemo(
    () => [
      { to: `/`, label: "Accueil", icon: "🏠" },
      { to: `/ajouter-dossier/${agence_id}`, label: "Ajouter dossier", icon: "➕" },
      { to: `/importer-dossier/${agence_id}`, label: "Importer dossiers", icon: "📥" },
      { to: `/agence/${agence_id}/ordres-mission`, label: "Ordres de mission", icon: "📄" },
      { to: `/agence/${agence_id}/ressources`, label: "Ressources", icon: "🧰" },
      { to: `/FicheMouvement/${agence_id}`, label: "Fiches mouvement", icon: "🛫" },
    ],
    [agence_id]
  );

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`}>
      <header className={styles.topbar}>
        <button className={styles.burger} aria-label="Menu" onClick={() => setSidebarOpen(true)}>☰</button>
        <div className={styles.brand} onClick={() => navigate("/")}>
          <span>✈️</span><span>Dashboard Agence</span>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => location.reload()}>Rafraîchir</button>
          <button className="btn btn-sm btn-danger" onClick={() => navigate("/login")}>Déconnexion</button>
        </div>
      </header>

      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sideHeader}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div className={styles.avatar}>🏢</div>
            <div>
              <div className={styles.metaName}>{user?.agence_name || "Mon Agence"}</div>
              <div className={styles.metaRole}>{isSuperAdmin ? "Super Admin" : "Admin Agence"}</div>
            </div>
          </div>
          <button className={styles.collapseBtn} onClick={() => setCollapsed(c => !c)} title={collapsed ? "Déplier" : "Réduire"}>{collapsed ? "»" : "«"}</button>
        </div>

        <nav className={styles.nav}>
          {links.map(l => (
            <NavLink key={l.to} to={l.to} className={({isActive}) => `${styles.link} ${isActive ? styles.linkActive : ""}`} onClick={() => setSidebarOpen(false)}>
              <span className={styles.linkIcon}>{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}><small>© {new Date().getFullYear()} — Agence</small></div>
      </aside>

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
