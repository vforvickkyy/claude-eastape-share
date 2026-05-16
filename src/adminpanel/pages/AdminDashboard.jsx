import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, CreditCard, FolderOpen, HardDrive, ChatCircle,
  UserCircle, Export, ClipboardText, Wrench, CheckCircle, X,
  TrendUp, TrendDown, Monitor, ArrowRight, Database, ShieldCheck,
  CloudArrowUp, FilmStrip, Timer, Chats, Trash, SignIn,
  Lightning, CalendarBlank, ArrowsClockwise, File, VideoCamera,
  Warning,
} from "@phosphor-icons/react";

/* ── Auth helpers ─────────────────────────────────────────── */
function getAuth() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token, userId: s.user?.id };
}
async function apiFetch(path, opts = {}) {
  const { token } = getAuth();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function getRestHeaders() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { Authorization: `Bearer ${s.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;

/* ── Formatters ──────────────────────────────────────────── */
function fmtBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + " KB";
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + " MB";
  return (b / 1024 ** 3).toFixed(2) + " GB";
}
function fmtMinutes(min) {
  if (!min) return "0 min";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 1440) return `${(min / 60).toFixed(1)} hrs`;
  return `${(min / 60 / 24).toFixed(1)} days`;
}
function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Avatar ──────────────────────────────────────────────── */
function Avatar({ name, avatarUrl, size = 30 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  const COLORS = ["#7c3aed","#2563eb","#059669","#dc2626","#d97706","#0891b2","#db2777","#65a30d"];
  const bg = COLORS[initial.charCodeAt(0) % COLORS.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
      {initial}
    </div>
  );
}

/* ── Toast ───────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
      style={{ position: "fixed", bottom: 24, right: 24, background: type === "error" ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.1)", border: `1px solid ${type === "error" ? "rgba(248,113,113,0.3)" : "rgba(74,222,128,0.25)"}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: type === "error" ? "#f87171" : "#4ade80", zIndex: 999, display: "flex", alignItems: "center", gap: 8, maxWidth: 320 }}>
      <CheckCircle size={15} weight="bold" /> {message}
    </motion.div>
  );
}

/* ── Range Bar ───────────────────────────────────────────── */
const RANGES = [
  { value: "24h", label: "24 Hours" },
  { value: "7d",  label: "7 Days"   },
  { value: "30d", label: "30 Days"  },
  { value: "90d", label: "90 Days"  },
  { value: "custom", label: "Custom" },
];
function RangeBar({ range, onRange, customFrom, customTo, onCustomFrom, onCustomTo }) {
  return (
    <div className="dash-range-bar">
      <CalendarBlank size={14} weight="duotone" style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
      <div className="dash-range-pills">
        {RANGES.map(r => (
          <button key={r.value} className={`dash-range-pill${range === r.value ? " active" : ""}`} onClick={() => onRange(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="dash-range-custom">
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)} className="dash-range-date" />
          <span style={{ color: "var(--admin-text-muted)", fontSize: 12 }}>to</span>
          <input type="date" value={customTo} onChange={e => onCustomTo(e.target.value)} className="dash-range-date" />
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ───────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, sub2, color = "#7c3aed", trend, loading, badge }) {
  return (
    <motion.div className="dash-stat-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ "--stat-color": color }}>
      <div className="dash-stat-top-bar" style={{ background: color }} />
      <div className="dash-stat-header">
        <div className="dash-stat-icon" style={{ background: color + "22", color }}>
          {React.cloneElement(icon, { size: 18, weight: "duotone" })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          {badge && (
            <span className="dash-stat-badge" style={{ background: color + "22", color, border: `1px solid ${color}44` }}>
              {badge}
            </span>
          )}
          {trend !== undefined && trend !== null && (
            <div className={`dash-stat-trend ${trend >= 0 ? "up" : "down"}`}>
              {trend >= 0 ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
      </div>
      {loading ? (
        <div className="dash-stat-skeleton" />
      ) : (
        <div className="dash-stat-body">
          <div className="dash-stat-value">{value}</div>
          <div className="dash-stat-label">{label}</div>
          {sub  && <div className="dash-stat-sub">{sub}</div>}
          {sub2 && <div className="dash-stat-sub" style={{ marginTop: 1 }}>{sub2}</div>}
        </div>
      )}
    </motion.div>
  );
}

/* ── Storage bar ─────────────────────────────────────────── */
function StorageBar({ pct }) {
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden", minWidth: 80 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s" }} />
    </div>
  );
}

/* ── Activity Icon ───────────────────────────────────────── */
function ActivityDot({ type }) {
  const map = {
    signup:         { icon: <SignIn   size={13} weight="bold" />, color: "#22c55e", bg: "rgba(34,197,94,0.15)"    },
    project_create: { icon: <FolderOpen size={13} weight="bold" />, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    delete:         { icon: <Trash    size={13} weight="bold" />, color: "#ef4444", bg: "rgba(239,68,68,0.15)"    },
    admin:          { icon: <ShieldCheck size={13} weight="bold" />, color: "#f97316", bg: "rgba(249,115,22,0.15)"},
  };
  const m = map[type] || map.admin;
  return (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {m.icon}
    </div>
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
    setLoading(true); setError("");
    try {
      await apiFetch("/admin-create-user", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      onSuccess?.("User invited: " + email);
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally { setLoading(false); }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        style={{ background: "var(--admin-card)", border: "1px solid var(--admin-border)", borderRadius: 14, padding: 24, width: 400, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-text)" }}>Invite User</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--admin-text-dim)", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--admin-text-dim)", display: "block", marginBottom: 6 }}>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" required
              style={{ width: "100%", background: "var(--admin-bg)", border: "1px solid var(--admin-border)", borderRadius: 8, padding: "9px 12px", color: "var(--admin-text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          {error && <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="admin-action-btn" disabled={loading}>Cancel</button>
            <button type="submit" className="admin-action-btn primary" disabled={loading} style={{ minWidth: 100, justifyContent: "center", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ── Action tile ─────────────────────────────────────────── */
function ActionTile({ icon, label, desc, onClick, loading, active, color = "var(--admin-accent)" }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ background: active ? "rgba(249,115,22,0.1)" : "var(--admin-bg)", border: `1px solid ${active ? "rgba(249,115,22,0.35)" : "var(--admin-border)"}`, borderRadius: 10, padding: "14px 12px", cursor: loading ? "wait" : "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, textAlign: "left", transition: "all 0.15s", opacity: loading ? 0.6 : 1, width: "100%" }}
      onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = "rgba(249,115,22,0.06)"; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active ? "rgba(249,115,22,0.35)" : "var(--admin-border)"; e.currentTarget.style.background = active ? "rgba(249,115,22,0.1)" : "var(--admin-bg)"; }}
    >
      <span style={{ color: active ? "var(--admin-accent)" : "var(--admin-text-dim)" }}>{React.cloneElement(icon, { size: 20, weight: "duotone" })}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: active ? "var(--admin-accent)" : "var(--admin-text)", marginBottom: 2 }}>{loading ? "Loading…" : label}</div>
        <div style={{ fontSize: 11, color: "var(--admin-text-muted)" }}>{desc}</div>
      </div>
    </button>
  );
}

/* ── Plan distribution pills ─────────────────────────────── */
function PlanPills({ distribution, freeUsers }) {
  const PLAN_COLORS = { Free: "#64748b", Pro: "#7c3aed", Business: "#f59e0b", Enterprise: "#06b6d4" };
  const entries = [
    ...(freeUsers > 0 ? [["Free", freeUsers]] : []),
    ...Object.entries(distribution || {}),
  ];
  if (entries.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
      {entries.map(([name, count]) => {
        const c = PLAN_COLORS[name] || "#6366f1";
        return (
          <span key={name} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: c + "22", color: c, border: `1px solid ${c}33` }}>
            {name} {count}
          </span>
        );
      })}
    </div>
  );
}

/* ── Range label helper ──────────────────────────────────── */
function rangeLabel(range) {
  const map = { "24h": "last 24h", "7d": "last 7d", "30d": "last 30d", "90d": "last 90d", "custom": "in range" };
  return map[range] || "in period";
}

/* ── Main Dashboard ──────────────────────────────────────── */
export default function AdminDashboard() {
  const navigate = useNavigate();

  const [stats,            setStats]            = useState(null);
  const [platformActivity, setPlatformActivity] = useState([]);
  const [recentSignups,    setRecentSignups]    = useState([]);
  const [topUsers,         setTopUsers]         = useState([]);
  const [loading,          setLoading]          = useState(true);

  const [range,       setRange]       = useState("30d");
  const [customFrom,  setCustomFrom]  = useState("");
  const [customTo,    setCustomTo]    = useState("");

  const [maintenanceMode,    setMaintenanceMode]    = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [showAddUser,        setShowAddUser]        = useState(false);
  const [toast,              setToast]              = useState(null);

  function showToast(msg, type = "success") { setToast({ message: msg, type, id: Date.now() }); }

  /* ── Load ─────────────────────────────────────────────── */
  const load = useCallback(async (r, cf, ct) => {
    setLoading(true);
    let qs = `?range=${r}`;
    if (r === "custom" && cf && ct) qs = `?range=custom&from=${cf}&to=${ct}`;
    try {
      const [dashData, maintData] = await Promise.all([
        apiFetch(`/admin-dashboard-stats${qs}`),
        fetch(`${BASE}/rest/v1/platform_settings?key=eq.maintenance_mode&select=value`, { headers: getRestHeaders() })
          .then(r => r.json()).catch(() => []),
      ]);
      if (dashData.stats)                     setStats(dashData.stats);
      if (Array.isArray(dashData.platform_activity)) setPlatformActivity(dashData.platform_activity);
      if (Array.isArray(dashData.recent_signups))    setRecentSignups(dashData.recent_signups);
      if (Array.isArray(dashData.top_users_by_storage)) setTopUsers(dashData.top_users_by_storage);
      if (Array.isArray(maintData) && maintData.length > 0)
        setMaintenanceMode(maintData[0]?.value === true || maintData[0]?.value === "true");
    } catch (err) {
      console.error("Dashboard error:", err);
      showToast("Failed to load dashboard data", "error");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (range !== "custom") {
      load(range, "", "");
    } else if (customFrom && customTo && customTo >= customFrom) {
      load(range, customFrom, customTo);
    }
  }, [range, customFrom, customTo, load]);

  /* ── Maintenance toggle ──────────────────────────────── */
  async function toggleMaintenance() {
    setMaintenanceLoading(true);
    try {
      const newVal = !maintenanceMode;
      await fetch(`${BASE}/rest/v1/platform_settings?key=eq.maintenance_mode`, {
        method: "PATCH",
        headers: { ...getRestHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({ value: newVal }),
      });
      setMaintenanceMode(newVal);
      showToast(`Maintenance mode ${newVal ? "enabled" : "disabled"}`);
    } catch { showToast("Failed to update", "error"); }
    finally { setMaintenanceLoading(false); }
  }

  /* ── Export ──────────────────────────────────────────── */
  async function handleExport() {
    try {
      const { token } = getAuth();
      const res = await fetch(`${BASE}/functions/v1/admin-export-users`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      showToast("Export downloaded");
    } catch { showToast("Export failed", "error"); }
  }

  /* ── Derived ─────────────────────────────────────────── */
  const s  = stats || {};
  const rl = rangeLabel(range);
  const cfTotal = (s.cf_ready || 0) + (s.cf_processing || 0) + (s.cf_failed || 0);

  const statCards = [
    {
      icon: <Users />, label: "Total Users", color: "#7c3aed",
      value: (s.total_users || 0).toLocaleString(),
      sub: `${(s.new_users_in_range || 0).toLocaleString()} new ${rl}`,
      sub2: `${s.suspended_users || 0} suspended`,
      trend: s.growth_rate,
      badge: (s.total_users || 0) > 0 ? `${s.active_plans || 0} paid` : undefined,
      extra: <PlanPills distribution={s.plan_distribution} freeUsers={s.free_users} />,
    },
    {
      icon: <HardDrive />, label: "Total Storage", color: "#dc2626",
      value: fmtBytes(s.storage_bytes),
      sub: `Drive: ${fmtBytes(s.drive_storage_bytes)}`,
      sub2: `Media: ${fmtBytes(s.media_storage_bytes)}`,
    },
    {
      icon: <File />, label: "Files on Wasabi", color: "#0891b2",
      value: ((s.total_drive_files || 0) + (s.total_project_media || 0)).toLocaleString(),
      sub: `Drive: ${(s.total_drive_files || 0).toLocaleString()} files`,
      sub2: `Media: ${(s.total_project_media || 0).toLocaleString()} files`,
    },
    {
      icon: <FolderOpen />, label: "Total Projects", color: "#d97706",
      value: (s.total_projects || 0).toLocaleString(),
      sub: `${(s.new_projects_in_range || 0).toLocaleString()} new ${rl}`,
    },
    {
      icon: <Chats />, label: "Total Comments", color: "#6366f1",
      value: (s.total_comments || 0).toLocaleString(),
      sub: `${(s.new_comments_in_range || 0).toLocaleString()} new ${rl}`,
    },
    {
      icon: <VideoCamera />, label: "CF Stream Videos", color: "#8b5cf6",
      value: cfTotal.toLocaleString(),
      sub: `Ready: ${(s.cf_ready || 0).toLocaleString()} · Processing: ${(s.cf_processing || 0).toLocaleString()}`,
      sub2: s.cf_failed > 0 ? `Failed: ${s.cf_failed}` : undefined,
      badge: s.cf_failed > 0 ? `${s.cf_failed} failed` : undefined,
    },
    {
      icon: <CloudArrowUp />, label: "CF Minutes Stored", color: "#06b6d4",
      value: fmtMinutes(s.cf_minutes_stored),
      sub: s.cf_minutes_stored > 0 ? `≈ ${Math.round(s.cf_minutes_stored / 60)} hours total` : "No data yet",
    },
    {
      icon: <Timer />, label: "CF Minutes Streamed", color: "#10b981",
      value: fmtMinutes(s.cf_minutes_streamed),
      sub: `${rl}`,
    },
  ];

  return (
    <div>
      {/* ── Page header ───────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="admin-page-title">Dashboard</div>
          <div className="admin-page-sub" style={{ marginBottom: 0 }}>Platform overview and health metrics.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="admin-action-btn" onClick={() => load(range, customFrom, customTo)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <ArrowsClockwise size={13} weight="bold" /> Refresh
          </button>
          <button className="admin-action-btn primary" onClick={() => setShowAddUser(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <UserPlus size={15} weight="bold" /> Invite User
          </button>
        </div>
      </div>

      {/* ── Range bar ─────────────────────────────────── */}
      <RangeBar
        range={range} onRange={setRange}
        customFrom={customFrom} customTo={customTo}
        onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}
      />

      {/* ── Stats grid ────────────────────────────────── */}
      <div className="dash-stats-grid">
        {statCards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <StatCard {...c} loading={loading} />
            {c.extra && !loading && <div style={{ marginTop: -8, padding: "0 4px 4px" }}>{c.extra}</div>}
          </motion.div>
        ))}
      </div>

      {/* ── CF Stream status bar ──────────────────────── */}
      {!loading && cfTotal > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: "var(--admin-card)", border: "1px solid var(--admin-border)", borderRadius: 12, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Monitor size={14} weight="duotone" style={{ color: "var(--admin-accent)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--admin-text)", letterSpacing: "0.04em" }}>CLOUDFLARE STREAM</span>
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            {[
              { label: "Ready",      value: s.cf_ready      || 0, color: "#22c55e" },
              { label: "Processing", value: s.cf_processing || 0, color: "#f59e0b" },
              { label: "Failed",     value: s.cf_failed     || 0, color: "#ef4444" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: item.color }} />
                <span style={{ fontSize: 12, color: "var(--admin-text)", fontWeight: 600 }}>{item.value.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: "var(--admin-text-dim)" }}>{item.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginLeft: "auto" }}>
            {cfTotal > 0 && (
              <div style={{ height: 7, borderRadius: 4, overflow: "hidden", display: "flex", width: 100, background: "rgba(255,255,255,0.06)" }}>
                {[{ c: "#22c55e", v: s.cf_ready }, { c: "#f59e0b", v: s.cf_processing }, { c: "#ef4444", v: s.cf_failed }]
                  .filter(x => x.v > 0)
                  .map((x, i) => <div key={i} style={{ height: "100%", width: `${(x.v / cfTotal) * 100}%`, background: x.c }} />)}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── 2-col: Activity + Quick Actions ───────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, marginBottom: 20, alignItems: "start" }}>

        {/* Activity Feed */}
        <div className="admin-section">
          <div className="admin-section-title">
            <span>Platform Activity</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--admin-text-muted)" }}>{rl}</span>
              <button className="admin-action-btn" onClick={() => navigate("/adminpanel/audit")}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11 }}>
                Full log <ArrowRight size={11} />
              </button>
            </div>
          </div>
          <div style={{ padding: "0" }}>
            {loading ? (
              <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--admin-border)", animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 13, borderRadius: 4, background: "var(--admin-border)", animation: "pulse 1.5s ease-in-out infinite", width: `${40 + i * 9}%` }} />
                  </div>
                ))}
              </div>
            ) : platformActivity.length === 0 ? (
              <div className="admin-empty">No activity in this period.</div>
            ) : (
              <div>
                {platformActivity.map((entry, i) => (
                  <div key={entry.id} className="dash-activity-row" style={{ borderBottom: i < platformActivity.length - 1 ? "1px solid var(--admin-border)" : "none" }}>
                    <ActivityDot type={entry.type} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--admin-text)", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600 }}>{entry.actor_name}</span>{" "}
                        <span style={{ color: "var(--admin-text-dim)" }}>{entry.description}</span>
                        {entry.detail && (
                          <span style={{ color: "var(--admin-text-muted)" }}>{" "}· {entry.detail}</span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--admin-text-muted)", flexShrink: 0 }}>{timeAgo(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="admin-section">
          <div className="admin-section-title">Quick Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 16px 16px" }}>
            <ActionTile icon={<UserCircle />}   label="Invite User"  desc="Send magic link"    onClick={() => setShowAddUser(true)} />
            <ActionTile icon={<Wrench />}        label={maintenanceMode ? "Disable Maint." : "Maintenance"} desc={maintenanceMode ? "Currently ON" : "Take offline"} onClick={toggleMaintenance} loading={maintenanceLoading} active={maintenanceMode} />
            <ActionTile icon={<Export />}        label="Export CSV"   desc="All users data"    onClick={handleExport} />
            <ActionTile icon={<ClipboardText />} label="Audit Log"    desc="Admin actions"     onClick={() => navigate("/adminpanel/audit")} />
            <ActionTile icon={<HardDrive />}     label="Storage"      desc="Usage by user"     onClick={() => navigate("/adminpanel/storage")} />
            <ActionTile icon={<Database />}      label="Database"     desc="Browse tables"     onClick={() => navigate("/adminpanel/database")} />
          </div>
        </div>
      </div>

      {/* ── Recent Signups ────────────────────────────── */}
      {(recentSignups.length > 0 || loading) && (
        <div className="admin-section" style={{ marginBottom: 20 }}>
          <div className="admin-section-title">
            <span>Recent Signups</span>
            <button className="admin-action-btn" onClick={() => navigate("/adminpanel/users")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11 }}>
              View all <ArrowRight size={11} />
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4].map(c => (
                      <td key={c}><div style={{ height: 13, borderRadius: 4, background: "var(--admin-border)", animation: "pulse 1.5s ease-in-out infinite", width: `${50 + Math.random() * 40}%` }} /></td>
                    ))}
                  </tr>
                )) : recentSignups.length === 0 ? (
                  <tr><td colSpan={4}><div className="admin-empty">No signups in this period.</div></td></tr>
                ) : recentSignups.map(u => {
                  const plan = (u.user_plans || []).find(p => p.is_active);
                  const planName = plan?.plans?.name || "Free";
                  return (
                    <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => navigate("/adminpanel/users")}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={u.full_name || u.email} avatarUrl={u.avatar_url} size={28} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-text)" }}>{u.full_name || "—"}</div>
                            <div style={{ fontSize: 11, color: "var(--admin-text-muted)" }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: planName === "Free" ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.15)", color: planName === "Free" ? "var(--admin-text-dim)" : "#a78bfa", fontWeight: 600 }}>
                          {planName}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--admin-text-dim)" }}>{fmtDate(u.created_at)}</td>
                      <td>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: u.is_suspended ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.1)", color: u.is_suspended ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                          {u.is_suspended ? "Suspended" : "Active"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Top Users by Storage ──────────────────────── */}
      {topUsers.length > 0 && (
        <motion.div className="admin-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 20 }}>
          <div className="admin-section-title">
            <span>Top Users by Storage</span>
            <button className="admin-action-btn" onClick={() => navigate("/adminpanel/storage")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11 }}>
              Full report <ArrowRight size={11} />
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr><th>User</th><th>Plan</th><th>Drive</th><th>Media</th><th>Total</th><th>Usage</th></tr>
              </thead>
              <tbody>
                {topUsers.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <Avatar name={u.full_name || u.email} avatarUrl={u.avatar_url} size={26} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-text)" }}>{u.full_name || "—"}</div>
                          <div style={{ fontSize: 11, color: "var(--admin-text-muted)" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: u.plan_name === "Free" ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.15)", color: u.plan_name === "Free" ? "var(--admin-text-dim)" : "#a78bfa", fontWeight: 600 }}>
                        {u.plan_name}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--admin-text-dim)" }}>{fmtBytes(u.drive_bytes)}</td>
                    <td style={{ fontSize: 12, color: "var(--admin-text-dim)" }}>{fmtBytes(u.media_bytes)}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text)" }}>{fmtBytes(u.total_bytes)}</td>
                    <td style={{ minWidth: 100 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <StorageBar pct={u.pct} />
                        <span style={{ fontSize: 11, color: u.pct >= 90 ? "#ef4444" : u.pct >= 70 ? "#f59e0b" : "var(--admin-text-dim)", fontWeight: u.pct >= 70 ? 600 : 400, minWidth: 28, textAlign: "right" }}>{u.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── Modals + Toast ────────────────────────────── */}
      <AnimatePresence>
        {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onSuccess={msg => showToast(msg)} />}
      </AnimatePresence>
      <AnimatePresence>
        {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}
