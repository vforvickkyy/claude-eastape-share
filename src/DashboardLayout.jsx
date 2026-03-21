import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  SquaresFour, HardDrive, Clock, Trash, CaretDown, SignOut, List, X,
  UserCircle, CurrencyInr, FolderOpen, CaretRight, Gear, Question,
  Scales, CloudArrowUp, Plus, Briefcase,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { projectsApi, userApi } from "./lib/api";

export default function DashboardLayout({ children, title }) {
  const { user, logout, loading } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [dropOpen,      setDropOpen]      = useState(false);
  const [sideOpen,      setSideOpen]      = useState(false);
  const [projectsOpen,  setProjectsOpen]  = useState(true);
  const [settOpen,      setSettOpen]      = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const [username,       setUsername]      = useState(null);
  const menuRef = useRef(null);
  const settRef = useRef(null);

  // Fetch recent projects and username for sidebar
  useEffect(() => {
    if (!user) return;
    projectsApi.list({ limit: 5 }).then(d => setRecentProjects(d.projects || [])).catch(() => {});
    userApi.getProfile().then(d => setUsername(d.username || null)).catch(() => {});
  }, [user]);

  useEffect(() => {
    function outside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setDropOpen(false);
      if (settRef.current && !settRef.current.contains(e.target)) setSettOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  async function handleLogout() {
    setDropOpen(false);
    setSettOpen(false);
    await logout();
    navigate("/");
  }

  const displayName = user?.user_metadata?.full_name || user?.email || "";
  const avatarUrl   = user?.user_metadata?.avatar_url;
  const initial     = displayName.charAt(0).toUpperCase();

  const isProjectRoute = location.pathname.startsWith("/projects");

  return (
    <div className="db-wrap">
      {/* ── Sidebar ── */}
      <aside className={`db-sidebar ${sideOpen ? "open" : ""}`}>
        <div className="db-logo">
          <Link to="/" className="logo-link"><LogoSlot /></Link>
          <button className="db-sidebar-close" onClick={() => setSideOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <nav className="db-nav">
          {/* Dashboard */}
          <NavLink
            to="/"
            end
            className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
            onClick={() => setSideOpen(false)}
          >
            <SquaresFour size={18} weight="duotone" />
            <span>Dashboard</span>
          </NavLink>

          {/* Drive */}
          <NavLink
            to="/drive"
            className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
            onClick={() => setSideOpen(false)}
          >
            <HardDrive size={18} weight="duotone" />
            <span>Drive</span>
          </NavLink>

          {/* Projects section */}
          <div className="db-nav-section">
            <div className="db-nav-section-header-row">
              <button
                className="db-nav-section-header"
                onClick={() => setProjectsOpen(o => !o)}
              >
                <Briefcase size={15} weight="duotone" />
                <span>Projects</span>
                <CaretRight
                  size={11}
                  weight="bold"
                  className={`db-nav-caret ${projectsOpen ? "open" : ""}`}
                />
              </button>
              <button
                className="db-nav-section-action"
                title="New Project"
                onClick={() => { setSideOpen(false); navigate("/projects?new=1"); }}
              >
                <Plus size={13} weight="bold" />
              </button>
            </div>
            {projectsOpen && (
              <div className="db-nav-sub">
                <NavLink
                  to="/projects"
                  end
                  className={({ isActive }) => `db-nav-item db-nav-item-sub ${isActive && !isProjectRoute ? "active" : location.pathname === "/projects" ? "active" : ""}`}
                  onClick={() => setSideOpen(false)}
                >
                  <FolderOpen size={15} weight="duotone" />
                  <span>All Projects</span>
                </NavLink>
                {recentProjects.map(p => (
                  <NavLink
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className={({ isActive }) => `db-nav-item db-nav-item-sub db-nav-project ${isActive ? "active" : ""}`}
                    onClick={() => setSideOpen(false)}
                    title={p.name}
                  >
                    <span
                      className="db-nav-project-dot"
                      style={{ background: p.color || "#6366f1" }}
                    />
                    <span className="db-nav-project-name">{p.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Trash */}
          <NavLink
            to="/trash"
            className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
            onClick={() => setSideOpen(false)}
          >
            <Trash size={18} weight="duotone" />
            <span>Trash</span>
          </NavLink>

          {/* Recent */}
          <NavLink
            to="/recent"
            className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
            onClick={() => setSideOpen(false)}
          >
            <Clock size={18} weight="duotone" />
            <span>Recent</span>
          </NavLink>
        </nav>

        {/* ── Sidebar footer: settings button ── */}
        <div className="db-sidebar-footer" ref={settRef}>
          {settOpen && (
            <div className="db-settings-menu">
              <button
                className="db-settings-item"
                onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/plans"); }}
              >
                <CurrencyInr size={14} weight="duotone" />
                Manage Plan
              </button>
              <button
                className="db-settings-item"
                onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/profile"); }}
              >
                <UserCircle size={14} weight="duotone" />
                Profile Settings
              </button>
              <div className="db-settings-divider" />
              <button
                className="db-settings-item"
                onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/privacy"); }}
              >
                <Scales size={14} weight="duotone" />
                Privacy Policy
              </button>
              <button
                className="db-settings-item"
                onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/terms"); }}
              >
                <Scales size={14} weight="duotone" />
                Terms of Service
              </button>
              <div className="db-settings-divider" />
              <button
                className="db-settings-item"
                onClick={() => { setSettOpen(false); window.open("mailto:support@eastape.com", "_blank"); }}
              >
                <Question size={14} weight="duotone" />
                Help
              </button>
              <div className="db-settings-divider" />
              <button className="db-settings-item db-settings-logout" onClick={handleLogout}>
                <SignOut size={14} weight="duotone" />
                Log out
              </button>
            </div>
          )}
          <button
            className="db-settings-trigger"
            onClick={() => setSettOpen(o => !o)}
            title="Settings"
          >
            <div className="db-settings-avatar">
              {avatarUrl
                ? <img src={avatarUrl} alt={initial} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                : <span>{initial}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
              <span className="db-settings-name">{displayName}</span>
              {username
                ? <span style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1 }}>@{username}</span>
                : <span style={{ fontSize: 11, color: "var(--accent)", lineHeight: 1, opacity: 0.8 }} onClick={e => { e.stopPropagation(); navigate("/profile"); }}>Set username →</span>
              }
            </div>
            <Gear size={15} weight="duotone" style={{ marginLeft: "auto", opacity: 0.5, flexShrink: 0 }} />
          </button>
        </div>
      </aside>

      {sideOpen && <div className="db-overlay" onClick={() => setSideOpen(false)} />}

      {/* ── Main area ── */}
      <div className="db-main">
        <header className="db-topbar">
          <button className="db-menu-btn" onClick={() => setSideOpen(true)}>
            <List size={20} />
          </button>
          <h1 className="db-page-title">{title}</h1>

          {!loading && user && (
            <div className="user-menu" ref={menuRef} style={{ marginLeft: "auto" }}>
              <button
                className="user-menu-trigger"
                onClick={() => setDropOpen(o => !o)}
                type="button"
              >
                <div className="user-avatar">
                  {avatarUrl
                    ? <img src={avatarUrl} alt={displayName} />
                    : <span>{initial}</span>}
                </div>
                <span className="user-name">{displayName}</span>
                <CaretDown size={11} weight="bold" className={`caret ${dropOpen ? "open" : ""}`} />
              </button>
              {dropOpen && (
                <div className="user-dropdown">
                  <div className="dropdown-info">
                    {username && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)" }}>@{username}</span>}
                    <span className="dropdown-email">{user.email}</span>
                  </div>
                  <button
                    className="dropdown-item"
                    onClick={() => { setDropOpen(false); navigate("/plans"); }}
                    type="button"
                  >
                    <CurrencyInr size={13} weight="bold" />
                    Manage Plan
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { setDropOpen(false); navigate("/profile"); }}
                    type="button"
                  >
                    <UserCircle size={13} weight="bold" />
                    Profile Settings
                  </button>
                  <button className="dropdown-item logout-item" onClick={handleLogout} type="button">
                    <SignOut size={13} weight="bold" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        <main className="db-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function LogoSlot() {
  const [hasLogo, setHasLogo] = React.useState(true);
  return hasLogo ? (
    <img src="/logo.png" alt="Eastape" className="logo-img" onError={() => setHasLogo(false)} />
  ) : (
    <div className="logo-text-fallback"><span className="logo-dot" />Eastape</div>
  );
}
