import React, { useMemo } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import {
  House, Users, CreditCard, HardDrive, VideoCamera, Database,
  ChartBar, ClipboardText, Gear, ShieldCheck, PlayCircle,
  SignOut, Bell, MagnifyingGlass, Envelope, Wrench, List,
} from "@phosphor-icons/react";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ to: "/adminpanel", label: "Dashboard", icon: House, end: true }],
  },
  {
    label: "Users",
    items: [
      { to: "/adminpanel/users", label: "All Users", icon: Users },
      { to: "/adminpanel/plans", label: "Plans & Billing", icon: CreditCard },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/adminpanel/storage", label: "Storage", icon: HardDrive },
      { to: "/adminpanel/media", label: "Media", icon: VideoCamera },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/adminpanel/database", label: "Database", icon: Database },
      { to: "/adminpanel/analytics", label: "Analytics", icon: ChartBar },
    ],
  },
  {
    label: "UI",
    items: [
      { to: "/adminpanel/ui/player", label: "Player Settings", icon: PlayCircle },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/adminpanel/audit", label: "Audit Logs", icon: ClipboardText },
      { to: "/adminpanel/settings", label: "Settings", icon: Gear },
      { to: "/adminpanel/admins", label: "Admins", icon: ShieldCheck },
    ],
  },
];

const PATH_CRUMBS = {
  "/adminpanel": "Dashboard",
  "/adminpanel/users": "All Users",
  "/adminpanel/plans": "Plans & Billing",
  "/adminpanel/storage": "Storage",
  "/adminpanel/media": "Media",
  "/adminpanel/database": "Database",
  "/adminpanel/analytics": "Analytics",
  "/adminpanel/ui/player": "Player Settings",
  "/adminpanel/audit": "Audit Logs",
  "/adminpanel/settings": "Settings",
  "/adminpanel/admins": "Admins",
};

export default function AdminLayout({ user }) {
  const displayName = user?.full_name || user?.email || "Admin";
  const initials = displayName.replace(/[^a-zA-Z ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "AD";
  const location = useLocation();

  const crumb = useMemo(() => {
    return PATH_CRUMBS[location.pathname] || "Admin";
  }, [location.pathname]);

  return (
    <div className="adm">
      {/* ── Sidebar ── */}
      <aside className="adm-side">
        {/* Brand */}
        <div className="adm-side-brand">
          <div className="adm-side-mark">E</div>
          <div className="adm-side-brand-text">
            <div className="name">Eastape<span className="badge">ADMIN</span></div>
          </div>
          <Link to="/dashboard" className="adm-side-exit" title="Exit admin">
            <SignOut size={14} />
          </Link>
        </div>

        {/* Navigation */}
        <div className="adm-side-nav">
          {NAV_SECTIONS.map(section => (
            <React.Fragment key={section.label}>
              <div className="adm-side-section">{section.label}</div>
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `adm-side-item${isActive ? " active" : ""}`}
                >
                  <span className="ic"><item.icon size={15} /></span>
                  <span>{item.label}</span>
                  {item.meta && <span className="meta">{item.meta}</span>}
                </NavLink>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="adm-qa">
          <div className="adm-qa-title">Quick Actions</div>
          <div className="adm-qa-grid">
            <NavLink to="/adminpanel/users" className="adm-qa-tile">
              <span className="ic"><Envelope size={13} /></span>
              <span>Invite</span>
            </NavLink>
            <NavLink to="/adminpanel/settings" className="adm-qa-tile">
              <span className="ic"><Wrench size={13} /></span>
              <span>Settings</span>
            </NavLink>
            <NavLink to="/adminpanel/audit" className="adm-qa-tile">
              <span className="ic"><List size={13} /></span>
              <span>Audit</span>
            </NavLink>
            <NavLink to="/adminpanel/storage" className="adm-qa-tile">
              <span className="ic"><HardDrive size={13} /></span>
              <span>Storage</span>
            </NavLink>
            <NavLink to="/adminpanel/database" className="adm-qa-tile">
              <span className="ic"><Database size={13} /></span>
              <span>Database</span>
            </NavLink>
            <NavLink to="/adminpanel/analytics" className="adm-qa-tile">
              <span className="ic"><ChartBar size={13} /></span>
              <span>Analytics</span>
            </NavLink>
          </div>
        </div>

        {/* Footer */}
        <div className="adm-side-footer">
          <div className="av">{initials}</div>
          <div className="info">
            <div className="name">{displayName}</div>
            <div className="role">SUPER ADMIN</div>
          </div>
          <button className="adm-icon-btn" title="Settings">
            <Gear size={14} />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="adm-main">
        {/* Topbar */}
        <div className="adm-top">
          <div className="adm-crumbs">
            <span>Admin</span>
            <span className="sep">/</span>
            <span className="current">{crumb}</span>
          </div>
          <div className="adm-top-spacer" />
          <div className="adm-top-search">
            <MagnifyingGlass size={14} />
            <span>Search admin…</span>
            <span className="kbd">⌘K</span>
          </div>
          <div className="adm-top-actions">
            <button className="adm-icon-btn" title="Notifications">
              <Bell size={15} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="adm-scroll" style={{ padding: "24px" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
