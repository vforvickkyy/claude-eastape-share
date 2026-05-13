import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  SquaresFour, HardDrive, Trash, CaretDown, SignOut, List, X,
  UserCircle, CurrencyInr, Gear, Question, Scales,
  Plus, Briefcase, MagnifyingGlass, Eye, Users,
  SidebarSimple, FolderPlus, UploadSimple,
  FolderOpen, FilmSlate, Link as LinkIcon, UserPlus,
  House, ArrowSquareOut, Clock,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { projectsApi } from "./lib/api";

// ── New button modal ───────────────────────────────────────────────────────────
function NewModal({ open, anchorRect, onClose, navigate, fileInputRef, folderInputRef }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = e => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  if (!open || !anchorRect) return null;

  const items = [
    { icon: <FilmSlate size={14} weight="duotone" />, label: "Add new Project", kbd: "⌘⇧P",
      action: () => { navigate("/projects?new=1"); onClose(); } },
    { icon: <FolderPlus size={14} weight="duotone" />, label: "Create new folder", kbd: "⌘⌥N",
      action: () => { navigate("/drive?newFolder=1"); onClose(); } },
    { icon: <UploadSimple size={14} weight="duotone" />, label: "Upload files", kbd: "⌘U",
      action: () => { fileInputRef.current?.click(); onClose(); } },
    { icon: <FolderOpen size={14} weight="duotone" />, label: "Upload folder", kbd: null,
      action: () => { folderInputRef.current?.click(); onClose(); } },
  ];

  return createPortal(
    <div
      ref={ref}
      className="new-modal"
      style={{
        position: "fixed",
        top: anchorRect.bottom + 6,
        left: anchorRect.left,
        zIndex: 1200,
      }}
    >
      {items.map(it => (
        <button key={it.label} className="new-modal-item" onClick={it.action}>
          <span className="new-modal-icon">{it.icon}</span>
          <span className="new-modal-label">{it.label}</span>
          {it.kbd && <kbd className="new-modal-kbd">{it.kbd}</kbd>}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ── Command Palette ────────────────────────────────────────────────────────────
function CommandPalette({ open, onClose, navigate, recentProjects, fileInputRef }) {
  const [query, setQuery] = useState("");
  const [idx, setIdx]     = useState(0);
  const inputRef = useRef();

  useEffect(() => {
    if (open) { setQuery(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const QUICK_ACTIONS = [
    { icon: <UploadSimple size={14} weight="duotone" />, label: "Upload media", kbd: "⌘U",
      action: () => { fileInputRef.current?.click(); onClose(); } },
    { icon: <FilmSlate size={14} weight="duotone" />, label: "New project", kbd: "⌘⇧P",
      action: () => { navigate("/projects?new=1"); onClose(); } },
    { icon: <FolderPlus size={14} weight="duotone" />, label: "New folder", kbd: "⌘⌥N",
      action: () => { navigate("/drive?newFolder=1"); onClose(); } },
    { icon: <LinkIcon size={14} weight="duotone" />, label: "Create review link", kbd: "⌘⇧L",
      action: () => { navigate("/projects"); onClose(); } },
    { icon: <UserPlus size={14} weight="duotone" />, label: "Invite teammates", kbd: "⌘I",
      action: () => { navigate("/projects"); onClose(); } },
    { icon: <List size={14} weight="duotone" />, label: "Open Manage (shot list)", kbd: "⌘M",
      action: () => { navigate("/projects"); onClose(); } },
  ];

  const NAVIGATE = [
    { icon: <House size={14} weight="duotone" />, label: "Go to Home", kbd: "G H",
      action: () => { navigate("/"); onClose(); } },
    { icon: <HardDrive size={14} weight="duotone" />, label: "Go to Drive", kbd: "G D",
      action: () => { navigate("/drive"); onClose(); } },
    { icon: <Briefcase size={14} weight="duotone" />, label: "Go to Projects", kbd: "G P",
      action: () => { navigate("/projects"); onClose(); } },
    { icon: <Gear size={14} weight="duotone" />, label: "Go to Settings", kbd: "G S",
      action: () => { navigate("/profile"); onClose(); } },
  ];

  const RECENTS = recentProjects.slice(0, 3).map(p => ({
    icon: <FilmSlate size={14} weight="duotone" />,
    label: p.name,
    sub: "Project",
    action: () => { navigate(`/projects/${p.id}/files`); onClose(); },
  }));

  // Build flat list for keyboard nav
  const q = query.trim().toLowerCase();
  function matches(label) { return !q || label.toLowerCase().includes(q); }

  const sections = [];
  if (!q && RECENTS.length > 0) sections.push({ title: "RECENTS", items: RECENTS });
  const qActions = QUICK_ACTIONS.filter(i => matches(i.label));
  if (qActions.length) sections.push({ title: "QUICK ACTIONS", items: qActions });
  const navItems = NAVIGATE.filter(i => matches(i.label));
  if (navItems.length) sections.push({ title: "NAVIGATE", items: navItems });

  const flat = sections.flatMap(s => s.items);

  function handleKey(e) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, flat.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); flat[idx]?.action(); }
  }

  useEffect(() => { setIdx(0); }, [query]);

  if (!open) return null;

  let flatIdx = 0;

  return createPortal(
    <>
      <div className="cmd-overlay" onClick={onClose} />
      <div className="cmd-panel">
        {/* Search input */}
        <div className="cmd-search-row">
          <MagnifyingGlass size={15} className="cmd-search-icon" />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search files, projects, shots, comments…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
          />
          {query && (
            <button className="cmd-clear" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="cmd-results">
          {sections.length === 0 && (
            <p className="cmd-empty">No results for "{query}"</p>
          )}
          {sections.map(section => (
            <div key={section.title} className="cmd-section">
              <div className="cmd-section-title">{section.title}</div>
              {section.items.map(item => {
                const fi = flatIdx++;
                const isActive = fi === idx;
                return (
                  <button
                    key={item.label}
                    className={`cmd-item ${isActive ? "active" : ""}`}
                    onClick={item.action}
                    onMouseEnter={() => setIdx(fi)}
                  >
                    <span className="cmd-item-icon">{item.icon}</span>
                    <span className="cmd-item-label">
                      {item.label}
                      {item.sub && <span className="cmd-item-sub">{item.sub}</span>}
                    </span>
                    {item.kbd && <kbd className="cmd-item-kbd">{item.kbd}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="cmd-footer">
          <span><span className="cmd-key">↑↓</span> Navigate</span>
          <span><span className="cmd-key">↵</span> Select</span>
          <span><span className="cmd-key">ESC</span> Close</span>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── DashboardLayout ────────────────────────────────────────────────────────────
export default function DashboardLayout({ children, title, crumbs }) {
  const { user, logout, loading, profile } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [dropOpen,        setDropOpen]        = useState(false);
  const [sideOpen,        setSideOpen]        = useState(false);
  const [collapsed,       setCollapsed]       = useState(() => localStorage.getItem("db-sidebar-collapsed") === "1");
  const [settOpen,        setSettOpen]        = useState(false);
  const [settPos,         setSettPos]         = useState(null);
  const [projects,        setProjects]        = useState([]);
  const [username,        setUsername]        = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem("onboarding-banner-dismissed") === "1"
  );
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newModalRect, setNewModalRect] = useState(null);
  const [cmdOpen,      setCmdOpen]      = useState(false);

  const menuRef    = useRef(null);
  const settRef    = useRef(null);
  const triggerRef = useRef(null);
  const newBtnRef  = useRef(null);
  const fileInputRef   = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(() => { setUsername(profile?.username || null); }, [profile?.username]);
  useEffect(() => { localStorage.setItem("db-sidebar-collapsed", collapsed ? "1" : "0"); }, [collapsed]);

  useEffect(() => {
    if (!user) return;
    projectsApi.list().then(d => setProjects(d.projects || [])).catch(() => {});
  }, [user]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      // ⌘K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(o => !o);
        return;
      }
      // ESC → close modals
      if (e.key === "Escape") {
        setCmdOpen(false);
        setNewModalOpen(false);
        setDropOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function outside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setDropOpen(false);
      if (settRef.current && !settRef.current.contains(e.target)) {
        const menuEl = document.getElementById("db-settings-portal");
        if (!menuEl || !menuEl.contains(e.target)) setSettOpen(false);
      }
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  function openSettMenu() {
    if (!settOpen && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setSettPos({ bottom: window.innerHeight - r.top + 8, left: r.left, width: Math.max(200, r.width) });
    }
    setSettOpen(o => !o);
  }

  function handleNewBtn() {
    if (newBtnRef.current) {
      setNewModalRect(newBtnRef.current.getBoundingClientRect());
    }
    setNewModalOpen(o => !o);
  }

  function openSearch() {
    setCmdOpen(true);
  }

  async function handleLogout() {
    setDropOpen(false); setSettOpen(false);
    await logout();
    navigate("/");
  }

  const displayName = user?.user_metadata?.full_name || user?.email || "";
  const avatarUrl   = user?.user_metadata?.avatar_url;
  const initial     = displayName.charAt(0).toUpperCase();
  const breadcrumbs = crumbs || (title ? [title] : []);
  const projectCount = projects.length;

  const usedMb  = profile?.storage_used_mb  || 0;
  const limitMb = profile?.storage_limit_mb || 512000;
  const usedGb  = (usedMb  / 1024).toFixed(0) || "0";
  const limitGb = (limitMb / 1024).toFixed(0) || "500";
  const pct     = limitMb > 0 ? Math.min(100, Math.round((usedMb / limitMb) * 100)) : 0;
  const planLabel = profile?.plan ? profile.plan.toUpperCase() : "FREE";

  return (
    <div className="db-wrap">
      {/* ── Sidebar ── */}
      <aside className={`db-sidebar ${sideOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="db-sidebar-inner">

          {/* Brand */}
          <div className="db-logo">
            <img src="/favicon.ico" alt="" className="db-brand-favicon" />
            <img src="/logo.png" alt="Eastape Studio" className="db-brand-logo" onError={e => { e.target.style.display = "none"; }} />
            <button
              className="db-collapse-btn"
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <SidebarSimple size={16} weight="bold" />
            </button>
            <button className="db-sidebar-close" onClick={() => setSideOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {/* New button */}
          <button
            ref={newBtnRef}
            className="db-new-btn"
            onClick={handleNewBtn}
          >
            <Plus size={13} weight="bold" />
            <span>New</span>
            <kbd className="db-new-kbd">⌘N</kbd>
          </button>

          {/* Primary nav */}
          <nav className="db-nav">
            <NavLink to="/" end className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`} onClick={() => setSideOpen(false)}>
              <SquaresFour size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Home</span>
            </NavLink>

            <NavLink to="/drive" className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`} onClick={() => setSideOpen(false)}>
              <HardDrive size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Drive</span>
            </NavLink>

            <NavLink to="/projects" className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`} onClick={() => setSideOpen(false)}>
              <Briefcase size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Projects</span>
              {projectCount > 0 && (
                <span className="db-nav-badge">{projectCount}</span>
              )}
            </NavLink>

            <button className="db-nav-item" onClick={openSearch}>
              <MagnifyingGlass size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Search</span>
            </button>
          </nav>

          {/* Workspace section */}
          <div className="db-nav-section-label">Workspace</div>
          <nav className="db-nav">
            <NavLink to="/review" className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`} onClick={() => setSideOpen(false)}>
              <Eye size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Review</span>
            </NavLink>

            <NavLink to="/shared" className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`} onClick={() => setSideOpen(false)}>
              <Users size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Shared</span>
            </NavLink>

            <NavLink to="/trash" className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`} onClick={() => setSideOpen(false)}>
              <Trash size={15} weight="duotone" style={{ flexShrink: 0 }} />
              <span>Trash</span>
            </NavLink>
          </nav>

          <div className="db-nav-spacer" />

          {/* Storage bar */}
          <div className="db-storage">
            <div className="db-storage-header">
              <span className="db-storage-label">Storage</span>
              <span className="db-storage-nums">{usedGb} / {limitGb} GB</span>
            </div>
            <div className="db-storage-track">
              <div className="db-storage-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="db-storage-foot">{pct}% USED · {planLabel} PLAN</div>
          </div>

          {/* Footer user row */}
          <div className="db-sidebar-footer" ref={settRef}>
            <button className="db-settings-trigger" ref={triggerRef} onClick={openSettMenu} title="Settings">
              <div className="db-settings-avatar">
                {avatarUrl
                  ? <img src={avatarUrl} alt={initial} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  : <span>{initial}</span>}
              </div>
              <div className="db-settings-name" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{displayName}</span>
                {username
                  ? <span style={{ fontSize: 10.5, color: "var(--text-4)", lineHeight: 1 }}>@{username}</span>
                  : <span style={{ fontSize: 10.5, color: "var(--accent)", lineHeight: 1, opacity: 0.8 }}
                      onClick={e => { e.stopPropagation(); navigate("/profile"); }}>Set username →</span>
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

          <div className="db-topbar-breadcrumbs">
            {breadcrumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="sep">/</span>}
                <span className={i === breadcrumbs.length - 1 ? "current" : ""}>{c}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="db-topbar-spacer" />

          <button className="db-topbar-search" onClick={openSearch} type="button">
            <MagnifyingGlass size={13} style={{ color: "var(--text-4)", flexShrink: 0 }} />
            <span>Search files, projects…</span>
            <kbd>⌘K</kbd>
          </button>

          {!loading && user && (
            <div className="user-menu" ref={menuRef} style={{ marginLeft: 0 }}>
              <button className="user-menu-trigger" onClick={() => setDropOpen(o => !o)} type="button">
                <div className="user-avatar">
                  {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{initial}</span>}
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
                    <CurrencyInr size={13} weight="bold" /> Manage Plan
                  </button>
                  <button className="dropdown-item" onClick={() => { setDropOpen(false); navigate("/profile"); }} type="button">
                    <UserCircle size={13} weight="bold" /> Profile Settings
                  </button>
                  <button className="dropdown-item logout-item" onClick={handleLogout} type="button">
                    <SignOut size={13} weight="bold" /> Log out
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
            padding: "0 24px", height: 44, display: "flex", alignItems: "center", gap: 12, fontSize: 13,
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
            >✕</button>
          </div>
        )}

        <main className="db-content">
          {children}
        </main>
      </div>

      {/* Hidden file inputs for upload */}
      <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} />
      <input ref={folderInputRef} type="file" webkitdirectory="" style={{ display: "none" }} />

      {/* Settings menu portal */}
      {settOpen && settPos && createPortal(
        <div
          id="db-settings-portal"
          className="db-settings-menu"
          style={{ position: "fixed", bottom: settPos.bottom, left: settPos.left, width: settPos.width, zIndex: 1000 }}
        >
          <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/plans"); }}>
            <CurrencyInr size={13} weight="duotone" /> Manage Plan
          </button>
          <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/profile"); }}>
            <UserCircle size={13} weight="duotone" /> Profile Settings
          </button>
          <div className="db-settings-divider" />
          <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/privacy"); }}>
            <Scales size={13} weight="duotone" /> Privacy Policy
          </button>
          <button className="db-settings-item" onClick={() => { setSettOpen(false); setSideOpen(false); navigate("/terms"); }}>
            <Scales size={13} weight="duotone" /> Terms of Service
          </button>
          <div className="db-settings-divider" />
          <button className="db-settings-item" onClick={() => { setSettOpen(false); window.open("mailto:support@eastape.com", "_blank"); }}>
            <Question size={13} weight="duotone" /> Help
          </button>
          <div className="db-settings-divider" />
          <button className="db-settings-item db-settings-logout" onClick={handleLogout}>
            <SignOut size={13} weight="duotone" /> Log out
          </button>
        </div>,
        document.body
      )}

      {/* New modal portal */}
      <NewModal
        open={newModalOpen}
        anchorRect={newModalRect}
        onClose={() => setNewModalOpen(false)}
        navigate={navigate}
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
      />

      {/* Command palette */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        navigate={navigate}
        recentProjects={projects}
        fileInputRef={fileInputRef}
      />
    </div>
  );
}
