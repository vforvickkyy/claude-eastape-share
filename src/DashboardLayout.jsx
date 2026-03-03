import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  CloudArrowUp, FolderOpen, Clock, Trash, CaretDown, SignOut, List, X, UserCircle, CurrencyInr,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";

const NAV = [
  { to: "/dashboard",  icon: <CloudArrowUp  size={18} weight="duotone" />, label: "Dashboard" },
  { to: "/my-files",   icon: <FolderOpen    size={18} weight="duotone" />, label: "My Files"  },
  { to: "/recent",     icon: <Clock         size={18} weight="duotone" />, label: "Recent"     },
  { to: "/trash",      icon: <Trash         size={18} weight="duotone" />, label: "Trash"      },
  { to: "/plans",      icon: <CurrencyInr   size={18} weight="duotone" />, label: "Plans"      },
];

export default function DashboardLayout({ children, title }) {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [dropOpen, setDropOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function outside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setDropOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  async function handleLogout() {
    setDropOpen(false);
    await logout();
    navigate("/");
  }

  const displayName = user?.user_metadata?.full_name || user?.email || "";
  const avatarUrl   = user?.user_metadata?.avatar_url;
  const initial     = displayName.charAt(0).toUpperCase();

  return (
    <div className="db-wrap">
      {/* ── Sidebar ── */}
      <aside className={`db-sidebar ${sideOpen ? "open" : ""}`}>
        <div className="db-logo">
          <LogoSlot />
          <button className="db-sidebar-close" onClick={() => setSideOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <Link to="/" className="db-new-btn">
          <CloudArrowUp size={16} weight="bold" />
          New Upload
        </Link>

        <nav className="db-nav">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
              onClick={() => setSideOpen(false)}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Profile link at bottom of sidebar */}
        <div className="db-sidebar-footer">
          <NavLink
            to="/profile"
            className={({ isActive }) => `db-nav-item ${isActive ? "active" : ""}`}
            onClick={() => setSideOpen(false)}
          >
            <UserCircle size={18} weight="duotone" />
            <span>Profile Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* Sidebar overlay on mobile */}
      {sideOpen && <div className="db-overlay" onClick={() => setSideOpen(false)} />}

      {/* ── Main area ── */}
      <div className="db-main">
        {/* Top bar */}
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
                  {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{initial}</span>}
                </div>
                <span className="user-name">{displayName}</span>
                <CaretDown size={11} weight="bold" className={`caret ${dropOpen ? "open" : ""}`} />
              </button>
              {dropOpen && (
                <div className="user-dropdown">
                  <div className="dropdown-info">
                    <span className="dropdown-email">{user.email}</span>
                  </div>
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
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Page content */}
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
    <img src="/logo.png" alt="Eastape Share" className="logo-img" onError={() => setHasLogo(false)} />
  ) : (
    <div className="logo-text-fallback"><span className="logo-dot" />Eastape Share</div>
  );
}
