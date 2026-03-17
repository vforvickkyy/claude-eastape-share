import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users,
  UserPlus,
  CreditCard,
  File,
  VideoCamera,
  FolderOpen,
  HardDrive,
  ChatCircle,
  UserCircle,
  Lightning,
  Export,
  ClipboardText,
  Wrench,
  CheckCircle,
  X,
} from "@phosphor-icons/react";
import AdminStatsCard from "../components/AdminStatsCard";
import { StatusBadge } from "../components/AdminBadge";
import AdminModal from "../components/AdminModal";

/* ── Auth helpers ─────────────────────────────────────────── */
function getAuth() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token, userId: s.user?.id };
}

async function apiFetch(path, opts = {}) {
  const { token } = getAuth();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`,
    {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* Fallback REST helpers for maintenance toggle / export */
function getRestHeaders() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    Authorization: `Bearer ${s.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;

/* ── Time-ago helper ─────────────────────────────────────── */
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Format date ─────────────────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Avatar initials ─────────────────────────────────────── */
function Avatar({ name, avatarUrl, size = 32 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

/* ── Toast ───────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background:
          type === "error"
            ? "rgba(248,113,113,0.15)"
            : "rgba(74,222,128,0.12)",
        border: `1px solid ${
          type === "error"
            ? "rgba(248,113,113,0.3)"
            : "rgba(74,222,128,0.25)"
        }`,
        borderRadius: "10px",
        padding: "12px 16px",
        fontSize: "13px",
        color: type === "error" ? "#f87171" : "#4ade80",
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        maxWidth: "320px",
      }}
    >
      <CheckCircle size={16} weight="bold" />
      {message}
    </motion.div>
  );
}

/* ── Add User Modal ──────────────────────────────────────── */
function AddUserModal({ onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const headers = getRestHeaders();
      const res = await fetch(`${BASE}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${
            import.meta.env.VITE_SUPABASE_SERVICE_KEY || getAuth().token
          }`,
        },
        body: JSON.stringify({ email: email.trim(), email_confirm: false }),
      });
      if (!res.ok) throw new Error("Failed to invite user");
      onSuccess?.("Magic link sent to " + email);
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminModal title="Add User" onClose={onClose} maxWidth="420px">
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <div>
          <label
            style={{
              fontSize: "12px",
              color: "var(--t3)",
              display: "block",
              marginBottom: "6px",
            }}
          >
            Email address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            style={{
              width: "100%",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "9px 12px",
              color: "var(--t1)",
              fontSize: "13px",
              outline: "none",
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--admin-accent)")
            }
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
        {error && (
          <p style={{ fontSize: "12px", color: "#f87171" }}>{error}</p>
        )}
        <div
          style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="admin-action-btn"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="admin-action-btn primary"
            disabled={loading}
            style={{
              opacity: loading ? 0.7 : 1,
              minWidth: "100px",
              justifyContent: "center",
            }}
          >
            {loading ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}

/* ── Main component ──────────────────────────────────────── */
export default function AdminDashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    total_users: 0,
    new_today: 0,
    active_plans: 0,
    total_files: 0,
    total_videos: 0,
    total_projects: 0,
    total_comments: 0,
    storage_bytes: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const [recentUsers, setRecentUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [recentActivity, setRecentActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const [showAddUser, setShowAddUser] = useState(false);
  const [toast, setToast] = useState(null);

  /* ── Fetch all dashboard data ─────────────────────────── */
  useEffect(() => {
    async function loadDashboard() {
      setStatsLoading(true);
      setUsersLoading(true);
      setActivityLoading(true);
      try {
        const data = await apiFetch("/admin-dashboard-stats");

        if (data.stats) setStats(data.stats);
        if (Array.isArray(data.recent_users)) {
          setRecentUsers(data.recent_users);
        }
        if (Array.isArray(data.recent_activity)) {
          setRecentActivity(data.recent_activity);
        }
      } catch (err) {
        console.error("Dashboard stats error:", err);
      } finally {
        setStatsLoading(false);
        setUsersLoading(false);
        setActivityLoading(false);
      }
    }
    loadDashboard();
  }, []);

  /* ── Fetch maintenance mode ──────────────────────────── */
  useEffect(() => {
    async function loadMaintenanceMode() {
      try {
        const headers = getRestHeaders();
        const res = await fetch(
          `${BASE}/rest/v1/platform_settings?key=eq.maintenance_mode&select=value`,
          { headers }
        );
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMaintenanceMode(
            data[0]?.value === true || data[0]?.value === "true"
          );
        }
      } catch {}
    }
    loadMaintenanceMode();
  }, []);

  /* ── Toggle maintenance mode ─────────────────────────── */
  async function toggleMaintenanceMode() {
    setMaintenanceLoading(true);
    try {
      const headers = getRestHeaders();
      const newValue = !maintenanceMode;
      await fetch(
        `${BASE}/rest/v1/platform_settings?key=eq.maintenance_mode`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({ value: newValue }),
        }
      );
      setMaintenanceMode(newValue);
      showToast(`Maintenance mode ${newValue ? "enabled" : "disabled"}`);
    } catch {
      showToast("Failed to update maintenance mode", "error");
    } finally {
      setMaintenanceLoading(false);
    }
  }

  /* ── Export users ────────────────────────────────────── */
  async function handleExportUsers() {
    try {
      const { token } = getAuth();
      const res = await fetch(`${BASE}/functions/v1/admin-export-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eastape-users-${
        new Date().toISOString().split("T")[0]
      }.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Export downloaded");
    } catch {
      showToast("Export failed", "error");
    }
  }

  function showToast(message, type = "success") {
    setToast({ message, type, id: Date.now() });
  }

  /* ── Storage display ─────────────────────────────────── */
  const GB = 1024 * 1024 * 1024;
  const storageBytes = stats.storage_bytes || 0;
  const storageDisplay =
    storageBytes >= GB
      ? (storageBytes / GB).toFixed(2) + " GB"
      : (storageBytes / 1024 / 1024).toFixed(1) + " MB";

  /* ── Stats card definitions ──────────────────────────── */
  const statCards = [
    {
      label: "Total Users",
      value: (stats.total_users || 0).toLocaleString(),
      icon: <Users size={18} weight="duotone" />,
    },
    {
      label: "New Today",
      value: (stats.new_today || 0).toLocaleString(),
      icon: <UserPlus size={18} weight="duotone" />,
    },
    {
      label: "Active Plans",
      value: (stats.active_plans || 0).toLocaleString(),
      icon: <CreditCard size={18} weight="duotone" />,
    },
    {
      label: "Total Files",
      value: (stats.total_files || 0).toLocaleString(),
      icon: <File size={18} weight="duotone" />,
    },
    {
      label: "Total Videos",
      value: (stats.total_videos || 0).toLocaleString(),
      icon: <VideoCamera size={18} weight="duotone" />,
    },
    {
      label: "Total Projects",
      value: (stats.total_projects || 0).toLocaleString(),
      icon: <FolderOpen size={18} weight="duotone" />,
    },
    {
      label: "Storage Used",
      value: storageDisplay,
      icon: <HardDrive size={18} weight="duotone" />,
    },
    {
      label: "Total Comments",
      value: (stats.total_comments || 0).toLocaleString(),
      icon: <ChatCircle size={18} weight="duotone" />,
    },
  ];

  /* ── Quick actions ───────────────────────────────────── */
  const quickActions = [
    {
      label: "Add User",
      desc: "Invite via magic link",
      icon: <UserCircle size={20} weight="duotone" />,
      onClick: () => setShowAddUser(true),
    },
    {
      label: maintenanceMode ? "Disable Maintenance" : "Maintenance Mode",
      desc: maintenanceMode
        ? "Platform is in maintenance"
        : "Take platform offline",
      icon: <Wrench size={20} weight="duotone" />,
      onClick: toggleMaintenanceMode,
      loading: maintenanceLoading,
      active: maintenanceMode,
    },
    {
      label: "Export Users",
      desc: "Download CSV of all users",
      icon: <Export size={20} weight="duotone" />,
      onClick: handleExportUsers,
    },
    {
      label: "View Audit Log",
      desc: "Browse all admin actions",
      icon: <ClipboardText size={20} weight="duotone" />,
      onClick: () => navigate("/adminpanel/audit"),
    },
  ];

  return (
    <div>
      {/* ── Page header ────────────────────────────────── */}
      <div className="admin-page-title">Dashboard</div>
      <div className="admin-page-sub">
        Overview of platform activity and health.
      </div>

      {/* ── Stats grid (8 cards, 4 columns) ────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        {statsLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="admin-stats-skeleton" />
            ))
          : statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: i * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <AdminStatsCard
                  icon={card.icon}
                  label={card.label}
                  value={card.value}
                  trend={card.trend}
                />
              </motion.div>
            ))}
      </div>

      {/* ── Two-column layout ──────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "20px",
          marginBottom: "20px",
          alignItems: "start",
        }}
      >
        {/* LEFT: Recent Signups */}
        <div className="admin-section">
          <div className="admin-section-title">
            <span>Recent Signups</span>
            <span
              style={{
                fontSize: "12px",
                color: "var(--t3)",
                fontWeight: 400,
              }}
            >
              Last 10 users
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="admin-table-skeleton">
                        {[1, 2, 3].map((c) => (
                          <td key={c}>
                            <span
                              className="admin-table-skeleton-row"
                              style={{ width: `${60 + Math.random() * 30}%` }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  : recentUsers.length === 0
                  ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="admin-empty">No users yet.</div>
                      </td>
                    </tr>
                  )
                  : recentUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <Avatar
                              name={user.full_name || user.email}
                              avatarUrl={user.avatar_url}
                              size={28}
                            />
                            <div>
                              <div
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  color: "var(--t1)",
                                }}
                              >
                                {user.full_name || "—"}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--t3)",
                                }}
                              >
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            fontSize: "12px",
                            color: "var(--t2)",
                          }}
                        >
                          {formatDate(user.created_at)}
                        </td>
                        <td>
                          <StatusBadge
                            status={
                              user.is_suspended ? "suspended" : "active"
                            }
                          />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Quick Actions */}
        <div className="admin-section">
          <div className="admin-section-title">Quick Actions</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              padding: "16px",
            }}
          >
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                disabled={action.loading}
                style={{
                  background: action.active
                    ? "rgba(249,115,22,0.12)"
                    : "var(--bg)",
                  border: `1px solid ${
                    action.active
                      ? "rgba(249,115,22,0.3)"
                      : "var(--border)"
                  }`,
                  borderRadius: "10px",
                  padding: "14px 12px",
                  cursor: action.loading ? "wait" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "8px",
                  textAlign: "left",
                  transition: "all 0.15s",
                  opacity: action.loading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!action.loading) {
                    e.currentTarget.style.borderColor = "var(--admin-accent)";
                    e.currentTarget.style.background =
                      "rgba(249,115,22,0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = action.active
                    ? "rgba(249,115,22,0.3)"
                    : "var(--border)";
                  e.currentTarget.style.background = action.active
                    ? "rgba(249,115,22,0.12)"
                    : "var(--bg)";
                }}
              >
                <span
                  style={{
                    color: action.active
                      ? "var(--admin-accent)"
                      : "var(--t2)",
                  }}
                >
                  {action.icon}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: action.active
                        ? "var(--admin-accent)"
                        : "var(--t1)",
                      marginBottom: "2px",
                    }}
                  >
                    {action.loading ? "Loading…" : action.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--t3)" }}>
                    {action.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Activity ────────────────────────────── */}
      <div className="admin-section">
        <div className="admin-section-title">
          <span>Recent Activity</span>
          <span
            style={{
              fontSize: "12px",
              color: "var(--t3)",
              fontWeight: 400,
            }}
          >
            Last 20 actions
          </span>
        </div>
        <div className="admin-section-body">
          {activityLoading ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: "14px",
                    borderRadius: "4px",
                    background: "var(--hover)",
                    animation: "pulse 1.5s ease-in-out infinite",
                    width: `${50 + Math.random() * 40}%`,
                  }}
                />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="admin-empty">No activity yet.</div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "0" }}
            >
              {recentActivity.map((entry, i) => (
                <div
                  key={entry.id ?? i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "10px 0",
                    borderBottom:
                      i < recentActivity.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "var(--admin-accent-bg)",
                      color: "var(--admin-accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {(
                      entry.profiles?.full_name ||
                      entry.action ||
                      "A"
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", color: "var(--t1)" }}>
                      <span style={{ fontWeight: 500 }}>
                        {entry.profiles?.full_name || "Admin"}
                      </span>{" "}
                      <span style={{ color: "var(--t2)" }}>
                        {entry.action}
                      </span>
                      {entry.target_type && (
                        <span style={{ color: "var(--t3)" }}>
                          {" "}
                          on {entry.target_type}
                        </span>
                      )}
                    </div>
                    {entry.metadata &&
                      Object.keys(entry.metadata).length > 0 && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--t3)",
                            marginTop: "2px",
                          }}
                        >
                          {JSON.stringify(entry.metadata).slice(0, 80)}
                        </div>
                      )}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--t3)",
                      flexShrink: 0,
                    }}
                  >
                    {timeAgo(entry.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add User Modal ─────────────────────────────── */}
      <AnimatePresence>
        {showAddUser && (
          <AddUserModal
            onClose={() => setShowAddUser(false)}
            onSuccess={(msg) => showToast(msg)}
          />
        )}
      </AnimatePresence>

      {/* ── Toast ──────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDone={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
