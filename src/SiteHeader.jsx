import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { CaretDown, SignOut, UserCircle } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";

export default function SiteHeader({ extra }) {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/");
  }

  const displayName = user?.user_metadata?.full_name || user?.email || "";
  const avatarUrl   = user?.user_metadata?.avatar_url;
  const initial     = displayName.charAt(0).toUpperCase();

  return (
    <header className="site-header">
      <Link to="/" className="logo-link"><LogoSlot /></Link>

      {/* Dashboard nav links — only shown when logged in */}
      {!loading && user && (
        <nav className="header-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}>Dashboard</NavLink>
          <NavLink to="/my-files"  className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}>My Files</NavLink>
          <NavLink to="/recent"    className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}>Recent</NavLink>
          <NavLink to="/trash"     className={({ isActive }) => `header-nav-link ${isActive ? "active" : ""}`}>Trash</NavLink>
        </nav>
      )}

      <div className="header-right">
        {extra}

        {!loading && (
          user ? (
            <div className="user-menu" ref={menuRef}>
              <button className="user-menu-trigger" onClick={() => setOpen(o => !o)} type="button">
                <div className="user-avatar">
                  {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{initial}</span>}
                </div>
                <span className="user-name">{displayName}</span>
                <CaretDown size={11} weight="bold" className={`caret ${open ? "open" : ""}`} />
              </button>
              {open && (
                <div className="user-dropdown">
                  <div className="dropdown-info">
                    <span className="dropdown-email">{user.email}</span>
                  </div>
                  <button
                    className="dropdown-item"
                    onClick={() => { setOpen(false); navigate("/profile"); }}
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
          ) : (
            <div className="auth-buttons">
              <Link to="/login" className="btn-ghost">Login</Link>
              <Link to="/signup" className="btn-primary-sm">Sign Up</Link>
            </div>
          )
        )}
      </div>
    </header>
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
