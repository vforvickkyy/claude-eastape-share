import React, { useState, useEffect } from "react";
import { NavLink, Link, Outlet } from "react-router-dom";
import {
  House,
  Users,
  CreditCard,
  HardDrive,
  VideoCamera,
  Database,
  ChartBar,
  ClipboardText,
  Gear,
  ShieldCheck,
  List,
  X,
  PlayCircle,
} from "@phosphor-icons/react";

/* ── Navigation structure ───────────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { to: "/adminpanel",            label: "Dashboard",   icon: <House         size={16} weight="duotone" />, end: true },
    ],
  },
  {
    label: "Users",
    items: [
      { to: "/adminpanel/users",      label: "All Users",   icon: <Users         size={16} weight="duotone" /> },
      { to: "/adminpanel/plans",      label: "Plans & Billing", icon: <CreditCard size={16} weight="duotone" /> },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/adminpanel/storage",    label: "Storage",     icon: <HardDrive     size={16} weight="duotone" /> },
      { to: "/adminpanel/media",      label: "Media",       icon: <VideoCamera   size={16} weight="duotone" /> },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/adminpanel/database",   label: "Database",    icon: <Database      size={16} weight="duotone" /> },
      { to: "/adminpanel/analytics",  label: "Analytics",   icon: <ChartBar      size={16} weight="duotone" /> },
    ],
  },
  {
    label: "UI",
    items: [
      { to: "/adminpanel/ui/player",  label: "Player Settings", icon: <PlayCircle size={16} weight="duotone" /> },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/adminpanel/audit",      label: "Audit Logs",  icon: <ClipboardText size={16} weight="duotone" /> },
      { to: "/adminpanel/settings",   label: "Settings",    icon: <Gear          size={16} weight="duotone" /> },
      { to: "/adminpanel/admins",     label: "Admins",      icon: <ShieldCheck   size={16} weight="duotone" /> },
    ],
  },
];

/* ── Logo slot ──────────────────────────────────────────────── */
function LogoSlot() {
  return (
    <span style={{
      fontFamily: "var(--font-display, sans-serif)",
      fontSize: "17px",
      fontWeight: 700,
      letterSpacing: "0.04em",
      color: "var(--t1)",
    }}>
      EASTAPE
    </span>
  );
}

/* ── Avatar initials helper ─────────────────────────────────── */
function Avatar({ name, avatarUrl, size = 32 }) {
  const initial = (name || "A").charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="admin-avatar"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="admin-avatar"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
        fontSize: size * 0.4,
      }}
    >
      {initial}
    </div>
  );
}

/**
 * AdminLayout — persistent sidebar (260px) + topbar layout.
 *
 * Props:
 *   user — admin user object with full_name and avatar_url
 */
export default function AdminLayout({ user }) {
  const displayName = user?.full_name || user?.email || "Admin";
  const avatarUrl   = user?.avatar_url;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* Close sidebar on route change on mobile */
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* ── Mobile backdrop ──────────────────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
            display: "none",
          }}
          className="admin-mobile-backdrop"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`admin-sidebar${sidebarOpen ? " open" : ""}`}
        style={{
          width: "260px",
          height: "100vh",
          overflowY: "auto",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          background: "var(--card)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div className="admin-sidebar-logo">
          <Link to="/" style={{ textDecoration: "none" }}>
            <LogoSlot />
          </Link>
          <span className="admin-badge">ADMIN</span>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, paddingBottom: "20px" }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="admin-nav-section">
              <div className="admin-nav-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `admin-nav-link${isActive ? " active" : ""}`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Sidebar footer — admin user info */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Avatar name={displayName} avatarUrl={avatarUrl} size={30} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--t1)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>
            <div style={{ fontSize: "10px", color: "var(--admin-accent)" }}>
              Administrator
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          height: "100vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Topbar */}
        <header
          className="admin-topbar"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          {/* Mobile hamburger button */}
          <button
            className="admin-hamburger"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
            style={{
              display: "none",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--t2)",
              padding: "4px",
              borderRadius: "6px",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {sidebarOpen ? <X size={20} /> : <List size={20} />}
          </button>

          {/* ADMIN badge */}
          <span
            style={{
              background: "linear-gradient(135deg, #ef4444, #f97316)",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: "5px",
              letterSpacing: "0.06em",
              flexShrink: 0,
            }}
          >
            ADMIN
          </span>

          {/* Spacer */}
          <div className="admin-topbar-title">Control Panel</div>

          {/* Current admin name */}
          <div
            style={{
              fontSize: "13px",
              color: "var(--t2)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Avatar name={displayName} avatarUrl={avatarUrl} size={26} />
            <span style={{ display: "none", fontSize: "13px" }}>{displayName}</span>
          </div>

          {/* Back to App */}
          <Link
            to="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--t2)",
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              textDecoration: "none",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--t1)";
              e.currentTarget.style.borderColor = "var(--border-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--t2)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            ← Back to App
          </Link>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: "24px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
