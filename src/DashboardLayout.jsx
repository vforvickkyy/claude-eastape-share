import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  SquaresFour, HardDrive, Clock, Trash, CaretDown, SignOut, List, X,
  UserCircle, CurrencyInr, FolderOpen, CaretRight, Gear, Question,
  Scales, CloudArrowUp, Plus, Briefcase, Sidebar,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { projectsApi } from "./lib/api";

export default function DashboardLayout({ children, title, crumbs }) {
  const { user, logout, loading, profile } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [dropOpen,      setDropOpen]      = useState(false);
  const [sideOpen,      setSideOpen]      = useState(false);
  const [collapsed,     setCollapsed]     = useState(false);
  const [projectsOpen,  setProjectsOpen]  = useState(true);
  const [settOpen,      setSettOpen]      = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const [username,       setUsername]      = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem("onboarding-banner-dismissed") === "1"
  );
  const menuRef = useRef(null);
  const settRef = useRef(null);

  useEffect(() => { setUsername(profile?.username || null); }, [profile?.username]);

  useEffect(() => {
    if (!user) return;
    projectsApi.list({ limit: 5 }).then(d => setRecentProjects(d.projects || [])).catch(() => {});
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

  // Build breadcrumb array for topbar
  const breadcrumbs = crumbs || (title ? [title] : []);

  return (
    <div className="db-wrap">
      {/* ── Sidebar ── */}
      <aside className={`db-sidebar ${sideOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="db-sidebar-inner">
          {/* Brand */}
          <div className="db-logo">
            <div className="db-brand-mark">E</div>
            <span className="db-brand-name">Eastape<span style={{ opacity: 0.5 }}> Studio</span></span>
            <button className="db-collapse-btn" onClick={() => setCollapsed(c => !c)} title="Collapse sidebar">
              <Sidebar size={13} />
            </button>
            <button className="db-sidebar-close" onClick={() => setSideOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {/* New button */}
          <button
            className="db-new-btn"
            onClick={() => { setSideOpen(false); navigate("/drive"); }}
          >
            <Plus size={13} weight="bold" />
            <span>New</span>
          </button>

          {/* Primary nav */}
          <nav className="db-nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
              onClick={() => setSideOpen(false)}
            >
              <SquaresFour size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Home</span>
            </NavLink>

            <NavLink
              to="/drive"
              className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
              onClick={() => setSideOpen(false)}
            >
              <HardDrive size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Drive</span>
            </NavLink>

            <NavLink
              to="/recent"
              className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
              onClick={() => setSideOpen(false)}
            >
              <Clock size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Recent</span>
            </NavLink>
          </nav>

          {/* Workspace section */}
          <div className="db-nav-section-label">Workspace</div>
          <nav className="db-nav">
            <div className="db-nav-section">
              <div className="db-nav-section-header-row">
                <button
                  className="db-nav-section-header db-nav-item"
                  style={{ flex: 1, textAlign: "left" }}
                  onClick={() => setProjectsOpen(o => !o)}
                >
                  <Briefcase size={15} weight="duotone" style={{ flexShrink: 0 }} />
                  <span>Projects</span>
                  <CaretRight
                    size={11}
                    weight="bold"
                    className={`db-nav-caret ${projectsOpen ? "open" : ""}`}
                    style={{ marginLeft: "auto", transition: "transform 0.18s", transform: projectsOpen ? "rotate(90deg)" : "rotate(0)" }}
                  />
                </button>
                <button
                  className="db-nav-section-action"
                  title="New Project"
                  onClick={() => { setSideOpen(false); navigate("/projects?new=1"); }}
                  style={{ padding: "4px 5px", background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", borderRadius: "var(--radius-sm)", flexShrink: 0 }}
                >
                  <Plus size={11} weight="bold" />
                </button>
              </div>
              {projectsOpen && (
                <div className="db-nav-sub">
                  <NavLink
                    to="/projects"
                    end
                    className={({ isActive }) => `db-nav-item db-nav-item-sub ${location.pathname === "/projects" ? "active" : ""}`}
                    onClick={() => setSideOpen(false)}
                    style={{ paddingLeft: 24 }}
                  >
                    <FolderOpen size={13} weight="duotone" style={{ flexShrink: 0 }} />
                    <span>All Projects</span>
                  </NavLink>
                  {recentProjects.map(p => (
                    <NavLink
                      key={p.id}
                      to={`/projects/${p.id}`}
                      className={({ isActive }) => `db-nav-item db-nav-item-sub db-nav-project ${isActive ? "active" : ""}`}
                      onClick={() => setSideOpen(false)}
                      title={p.name}
                      style={{ paddingLeft: 24 }}
                    >
                      <span
                        className="db-nav-project-dot"
                        style={{ width: 6, height: 6, borderRadius: "50%", background: p.color || "var(--accent)", flexShrink: 0 }}
                      />
                      <span className="db-nav-project-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            <NavLink
              to="/trash"
              className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
              onClick={() => setSideOpen(false)}
            >
              <Trash size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Trash</span>
            </NavLink>
          </nav>

          {/* Storage bar */}
          <div className="db-storage">
            <div className="db-storage-row">
              <span>Storage</span>
              <strong>{profile?.storage_used_mb ? `${(profile.storage_used_mb / 1024).toFixed(1)} GB` : "—"}</strong>
            </div>
            <div className="db-storage-track">
              <div className="db-storage-fill" style={{ width: profile?.storage_used_mb ? `${Math.min((profile.storage_used_mb / (profile.storage_limit_mb || 10240)) * 100, 100).toFixed(0)}%` : "0%" }} />
            </div>
            <div className="db-storage-foot">
              {profile?.plan ? `${profile.plan.toUpperCase()} PLAN` : "FREE PLAN"}
            </div>
          </div>

          {/* Footer user row */}
          <div className="db-sidebar-footer" ref={settRef}>
            {settOpen && (
              <div className="db-settings-menu">
                <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/plans"); }}>
                  <CurrencyInr size={13} weight="duotone" />
                  Manage Plan
                </button>
                <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/profile"); }}>
                  <UserCircle size={13} weight="duotone" />
                  Profile Settings
                </button>
                <div className="db-settings-divider" />
                <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/privacy"); }}>
                  <Scales size={13} weight="duotone" />
                  Privacy Policy
                </button>
                <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/terms"); }}>
                  <Scales size={13} weight="duotone" />
                  Terms of Service
                </button>
                <div className="db-settings-divider" />
                <button className="db-settings-item" onClick={() => { setSettOpen(false); window.open("mailto:support@eastape.com", "_blank"); }}>
                  <Question size={13} weight="duotone" />
                  Help
                </button>
                <div className="db-settings-divider" />
                <button className="db-settings-item db-settings-logout" onClick={handleLogout}>
                  <SignOut size={13} weight="duotone" />
                  Log out
                </button>
              </div>
            )}
            <button className="db-settings-trigger" onClick={() => setSettOpen(o => !o)} title="Settings">
              <div className="db-settings-avatar">
                {avatarUrl
                  ? <img src={avatarUrl} alt={initial} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  : <span>{initial}</span>}
              </div>
              <div className="db-settings-name" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{displayName}</span>
                {username
                  ? <span style={{ fontSize: 10.5, color: "var(--text-4)", lineHeight: 1 }}>@{username}</span>
                  : <span style={{ fontSize: 10.5, color: "var(--accent)", lineHeight: 1, opacity: 0.8 }} onClick={e => { e.stopPropagation(); navigate("/profile"); }}>Set username →</span>
                }
              </div>
              <Gear size={13} weight="duotone" style={{ marginLeft: "auto", opacity: 0.4, flexShrink: 0 }} />
            </button>
          </div>
        </div>
      </aside>

      {sideOpen && <div className="db-overlay" onClick={() => setSideOpen(false)} />}

      {/* ── Main area ── */}
      <div className="db-main">
        <header className="db-topbar">
          <button className="db-menu-btn" onClick={() => setSideOpen(true)}>
            <List size={18} />
          </button>

          {/* Breadcrumbs */}
          <div className="db-topbar-breadcrumbs">
            {breadcrumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="sep">/</span>}
                <span className={i === breadcrumbs.length - 1 ? "current" : ""}>{c}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="db-topbar-spacer" />

          {/* User menu */}
          {!loading && user && (
            <div className="user-menu" ref={menuRef} style={{ marginLeft: 0 }}>
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
                    {username && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>@{username}</span>}
                    <span className="dropdown-email">{user.email}</span>
                  </div>
                  <button className="dropdown-item" onClick={() => { setDropOpen(false); navigate("/plans"); }} type="button">
                    <CurrencyInr size={13} weight="bold" />
                    Manage Plan
                  </button>
                  <button className="dropdown-item" onClick={() => { setDropOpen(false); navigate("/profile"); }} type="button">
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

        {/* Onboarding banner */}
        {profile && !profile.onboarding_completed && (profile.onboarding_step ?? 0) > 0
          && !bannerDismissed && location.pathname !== "/onboarding" && (
          <div style={{
            background: "var(--accent-tint)", borderBottom: "1px solid var(--accent-soft)",
            padding: "0 24px", height: 44, display: "flex", alignItems: "center", gap: 12,
            fontSize: 13,
          }}>
            <span style={{ flex: 1, color: "var(--text-2)" }}>Complete your account setup</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: (profile.onboarding_step ?? 0) >= n ? "var(--accent)" : "var(--line-2)",
                }} />
              ))}
            </div>
            <button className="btn-primary-sm" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => navigate("/onboarding")}>
              Continue →
            </button>
            <button
              onClick={() => { sessionStorage.setItem("onboarding-banner-dismissed", "1"); setBannerDismissed(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
            >
              ✕
            </button>
          </div>
        )}

        <main className="db-content">
          {children}
        </main>
      </div>
    </div>
  );
}
