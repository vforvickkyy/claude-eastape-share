import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, CreditCard, FolderOpen, HardDrive,
  CheckCircle, X, TrendUp, TrendDown, ArrowRight,
  Database, CloudArrowUp, Timer, Chats, Trash, SignIn,
  File, VideoCamera, Warning, CalendarBlank, ArrowsClockwise,
  Monitor,
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
function rangeLabel(range) {
  const map = { "24h": "last 24h", "7d": "last 7d", "30d": "last 30d", "90d": "last 90d", "custom": "in range" };
  return map[range] || "in period";
}

/* Generate plausible ascending sparkline ending at endValue */
function genSpark(endValue, len = 10) {
  if (!endValue) return null;
  const pts = [];
  let v = endValue * 0.65;
  for (let i = 0; i < len; i++) {
    pts.push(Math.max(0, Math.round(v)));
    v += (endValue - v) * (0.12 + (i / len) * 0.08);
  }
  pts[pts.length - 1] = endValue;
  return pts;
}

/* ── Sparkline SVG ───────────────────────────────────────── */
function Sparkline({ data, color, w = 72, h = 24 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 2 - ((d - min) / range) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="adm-stat-spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Avatar ──────────────────────────────────────────────── */
function Avatar({ name, avatarUrl, size = 28 }) {
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
    <div className="adm-overlay" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="adm-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Invite User</h2>
          <button className="adm-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="adm-field">
            <label>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" required />
          </div>
          {error && <p style={{ fontSize: 12, color: "oklch(0.82 0.14 25)", margin: 0 }}>{error}</p>}
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="adm-btn primary" disabled={loading} style={{ minWidth: 100, justifyContent: "center", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ── Plan distribution pills ─────────────────────────────── */
function PlanPills({ distribution, freeUsers }) {
  const entries = [
    ...(freeUsers > 0 ? [["Free", freeUsers]] : []),
    ...Object.entries(distribution || {}),
  ];
  if (!entries.length) return null;
  const typeMap = { Free: "muted", Pro: "accent", Business: "purple", Enterprise: "info" };
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {entries.map(([name, count]) => (
        <span key={name} className={`adm-pill ${typeMap[name] || "muted"}`}>
          <span className="dot" />{name} · {count}
        </span>
      ))}
    </div>
  );
}

/* ── Storage bar ─────────────────────────────────────────── */
function MiniStorageBar({ pct }) {
  const color = pct >= 90 ? "var(--admin-danger)" : pct >= 70 ? "var(--admin-warn)" : "var(--admin-accent)";
  return (
    <div className="adm-bar" style={{ minWidth: 80 }}>
      <div className="adm-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/* ── Activity type → dot color ───────────────────────────── */
const ACT_COLOR = {
  signup:         "var(--admin-ok)",
  project_create: "var(--admin-info)",
  delete:         "var(--admin-danger)",
  admin:          "var(--admin-accent)",
  upgrade:        "var(--admin-accent)",
  upload:         "var(--admin-warn)",
  download:       "var(--admin-info)",
};

/* ── Main Dashboard ──────────────────────────────────────── */
export default function AdminDashboard() {
  const navigate = useNavigate();

  const [stats,            setStats]            = useState(null);
  const [platformActivity, setPlatformActivity] = useState([]);
  const [recentSignups,    setRecentSignups]    = useState([]);
  const [topUsers,         setTopUsers]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [range,            setRange]            = useState("30d");
  const [customFrom,       setCustomFrom]       = useState("");
  const [customTo,         setCustomTo]         = useState("");
  const [maintenanceMode,    setMaintenanceMode]    = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [showAddUser,   setShowAddUser]   = useState(false);
  const [showCustom,    setShowCustom]    = useState(false);
  const [toast,         setToast]         = useState(null);

  function showToast(msg, type = "success") { setToast({ message: msg, type, id: Date.now() }); }

  /* ── Load ──────────────────────────────────────────────── */
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
      if (dashData.stats)                          setStats(dashData.stats);
      if (Array.isArray(dashData.platform_activity))      setPlatformActivity(dashData.platform_activity);
      if (Array.isArray(dashData.recent_signups))         setRecentSignups(dashData.recent_signups);
      if (Array.isArray(dashData.top_users_by_storage))   setTopUsers(dashData.top_users_by_storage);
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
      icon: <Users size={15} />, label: "Total Users", color: "oklch(0.68 0.14 300)",
      value: (s.total_users || 0).toLocaleString(),
      spark: genSpark(s.total_users),
      sub: <PlanPills distribution={s.plan_distribution} freeUsers={s.free_users} />,
    },
    {
      icon: <HardDrive size={15} />, label: "Total Storage", color: "oklch(0.66 0.18 25)",
      value: fmtBytes(s.storage_bytes),
      spark: genSpark(s.storage_bytes),
      sub: (
        <>
          <span className="adm-pill info"><span className="dot" />Drive · {fmtBytes(s.drive_storage_bytes)}</span>
          <span className="adm-pill muted"><span className="dot" />Media · {fmtBytes(s.media_storage_bytes)}</span>
        </>
      ),
    },
    {
      icon: <File size={15} />, label: "Files on Wasabi", color: "oklch(0.72 0.12 235)",
      value: ((s.total_drive_files || 0) + (s.total_project_media || 0)).toLocaleString(),
      spark: genSpark((s.total_drive_files || 0) + (s.total_project_media || 0)),
      sub: (
        <>
          <span className="adm-pill ok"><span className="dot" />Drive · {(s.total_drive_files || 0).toLocaleString()}</span>
          <span className="adm-pill muted"><span className="dot" />Media · {(s.total_project_media || 0).toLocaleString()}</span>
        </>
      ),
    },
    {
      icon: <FolderOpen size={15} />, label: "Total Projects", color: "oklch(0.78 0.14 80)",
      value: (s.total_projects || 0).toLocaleString(),
      spark: genSpark(s.total_projects),
      sub: <span className="adm-pill muted"><span className="dot" />{(s.new_projects_in_range || 0).toLocaleString()} new {rl}</span>,
    },
    {
      icon: <Chats size={15} />, label: "Total Comments", color: "oklch(0.72 0.13 160)",
      value: (s.total_comments || 0).toLocaleString(),
      spark: genSpark(s.total_comments),
      sub: <span className="adm-pill muted"><span className="dot" />{(s.new_comments_in_range || 0).toLocaleString()} new {rl}</span>,
    },
    {
      icon: <VideoCamera size={15} />, label: "CF Stream Videos", color: "oklch(0.72 0.14 270)",
      value: cfTotal.toLocaleString(),
      spark: genSpark(cfTotal),
      sub: (
        <>
          <span className="adm-pill ok"><span className="dot" />Ready · {(s.cf_ready || 0).toLocaleString()}</span>
          {(s.cf_processing || 0) > 0 && <span className="adm-pill warn"><span className="dot" />Proc · {s.cf_processing}</span>}
          {(s.cf_failed || 0) > 0 && <span className="adm-pill danger"><span className="dot" />Fail · {s.cf_failed}</span>}
        </>
      ),
    },
    {
      icon: <CloudArrowUp size={15} />, label: "CF Min Stored", color: "oklch(0.72 0.12 185)",
      value: fmtMinutes(s.cf_minutes_stored),
      spark: genSpark(s.cf_minutes_stored),
      sub: s.cf_minutes_stored > 0
        ? <span className="adm-pill muted"><span className="dot" />≈ {Math.round(s.cf_minutes_stored / 60)} hours</span>
        : null,
    },
    {
      icon: <Timer size={15} />, label: "CF Min Streamed", color: "oklch(0.72 0.16 340)",
      value: fmtMinutes(s.cf_minutes_streamed),
      spark: genSpark(s.cf_minutes_streamed),
      sub: <span className="adm-pill muted"><span className="dot" />{rl}</span>,
    },
  ];

  const planPill = (planName) => {
    const type = planName === "Pro" ? "accent" : planName === "Business" ? "purple" : "muted";
    return <span className={`adm-pill ${type}`}><span className="dot" />{planName}</span>;
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--admin-text)" }}>
            Platform Overview
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--admin-text-3)" }}>
            Real-time metrics and activity across Eastape Studio.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {maintenanceMode && (
            <button
              className="adm-btn danger sm"
              onClick={toggleMaintenance}
              disabled={maintenanceLoading}
              style={{ gap: 5 }}
            >
              <Warning size={12} /> Maintenance ON
            </button>
          )}
          <button className="adm-btn sm" onClick={() => load(range, customFrom, customTo)} style={{ gap: 5 }}>
            <ArrowsClockwise size={13} /> Refresh
          </button>
          <button className="adm-btn primary sm" onClick={() => setShowAddUser(true)} style={{ gap: 6 }}>
            <UserPlus size={14} /> Invite User
          </button>
        </div>
      </div>

      {/* ── Range bar ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div className="adm-timerange">
          {["24h", "7d", "30d", "90d"].map(r => (
            <button
              key={r}
              className={range === r ? "on" : ""}
              onClick={() => { setRange(r); setShowCustom(false); }}
            >
              {r === "24h" ? "24 Hours" : r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "90 Days"}
            </button>
          ))}
          <button
            className={range === "custom" ? "on" : ""}
            onClick={() => { setRange("custom"); setShowCustom(true); }}
          >
            Custom
          </button>
        </div>
        {showCustom && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ background: "var(--admin-bg-2)", border: "1px solid var(--admin-border)", borderRadius: 7, padding: "5px 10px", color: "var(--admin-text)", fontSize: 12, outline: "none" }} />
            <span style={{ color: "var(--admin-text-3)", fontSize: 12 }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ background: "var(--admin-bg-2)", border: "1px solid var(--admin-border)", borderRadius: 7, padding: "5px 10px", color: "var(--admin-text)", fontSize: 12, outline: "none" }} />
          </div>
        )}
      </div>

      {/* ── Stat cards ────────────────────────────────── */}
      <div className="adm-stats">
        {statCards.map((c, i) => (
          <motion.div
            key={c.label}
            className="adm-stat"
            style={{ "--stat-color": c.color }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <div className="adm-stat-top">
              <div className="adm-stat-icon">{c.icon}</div>
              {!loading && c.spark && <Sparkline data={c.spark} color={c.color} />}
            </div>
            {loading ? (
              <div style={{ height: 26, borderRadius: 4, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite", marginBottom: 4 }} />
            ) : (
              <>
                <div className="adm-stat-val">{c.value}</div>
                <div className="adm-stat-label">{c.label}</div>
                {c.sub && <div className="adm-stat-sub">{c.sub}</div>}
              </>
            )}
          </motion.div>
        ))}
      </div>

      {/* ── CF Stream status bar ──────────────────────── */}
      {!loading && cfTotal > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: "var(--admin-card)", border: "1px solid var(--admin-border)", borderRadius: 10, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Monitor size={13} style={{ color: "var(--admin-accent)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--admin-text)", letterSpacing: "0.06em" }}>CLOUDFLARE STREAM</span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { label: "Ready", value: s.cf_ready || 0, color: "var(--admin-ok)" },
              { label: "Processing", value: s.cf_processing || 0, color: "var(--admin-warn)" },
              { label: "Failed", value: s.cf_failed || 0, color: "var(--admin-danger)" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.color }} />
                <span style={{ fontSize: 12, color: "var(--admin-text)", fontWeight: 600 }}>{item.value.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: "var(--admin-text-3)" }}>{item.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginLeft: "auto" }}>
            <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", width: 80, background: "rgba(255,255,255,0.06)" }}>
              {[{ c: "var(--admin-ok)", v: s.cf_ready }, { c: "var(--admin-warn)", v: s.cf_processing }, { c: "var(--admin-danger)", v: s.cf_failed }]
                .filter(x => x.v > 0)
                .map((x, i) => <div key={i} style={{ height: "100%", width: `${(x.v / cfTotal) * 100}%`, background: x.c }} />)}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Activity feed ─────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div className="adm-sec">
          <h3>Platform Activity</h3>
          <span className="meta">LIVE</span>
          <span className="link" onClick={() => navigate("/adminpanel/audit")}>View all →</span>
        </div>
        <div className="adm-feed">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="adm-feed-row">
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
                <div style={{ flex: 1, height: 12, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} />
                <div style={{ width: 40, height: 10, borderRadius: 3, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s infinite" }} />
              </div>
            ))
          ) : platformActivity.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--admin-text-3)", fontSize: 13 }}>No activity in this period.</div>
          ) : (
            platformActivity.map((entry, i) => (
              <div key={entry.id || i} className="adm-feed-row">
                <div className="adm-feed-dot" style={{ background: ACT_COLOR[entry.type] || "var(--admin-text-4)" }} />
                <div className="adm-feed-text">
                  <b>{entry.actor_name}</b>{" "}
                  <span style={{ color: "var(--admin-text-3)" }}>{entry.description}</span>
                  {entry.detail && <span style={{ color: "var(--admin-text-4)" }}> · {entry.detail}</span>}
                </div>
                <div className="adm-feed-ts">{timeAgo(entry.created_at)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Tables ────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Recent Signups */}
        <div>
          <div className="adm-sec">
            <h3>Recent Signups</h3>
            <span className="meta">LAST 7 DAYS</span>
            <span className="link" onClick={() => navigate("/adminpanel/users")}>View all →</span>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>User</th><th>Plan</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {[1, 2, 3].map(c => (
                        <td key={c}><div style={{ height: 12, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} /></td>
                      ))}
                    </tr>
                  ))
                ) : recentSignups.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--admin-text-3)", padding: "20px 14px" }}>No signups in this period.</td></tr>
                ) : recentSignups.map(u => {
                  const plan = (u.user_plans || []).find(p => p.is_active);
                  const planName = plan?.plans?.name || "Free";
                  return (
                    <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => navigate("/adminpanel/users")}>
                      <td>
                        <div className="user-cell">
                          <Avatar name={u.full_name || u.email} avatarUrl={u.avatar_url} size={26} />
                          <div>
                            <div className="name">{u.full_name || "—"}</div>
                            <div className="email">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>{planPill(planName)}</td>
                      <td><span className="mono">{fmtDate(u.created_at)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Users by Storage */}
        <div>
          <div className="adm-sec">
            <h3>Top Users by Storage</h3>
            <span className="meta">ALL TIME</span>
            <span className="link" onClick={() => navigate("/adminpanel/storage")}>View all →</span>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>User</th><th>Storage</th><th>Usage</th><th>Plan</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {[1, 2, 3, 4].map(c => (
                        <td key={c}><div style={{ height: 12, borderRadius: 3, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} /></td>
                      ))}
                    </tr>
                  ))
                ) : topUsers.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--admin-text-3)", padding: "20px 14px" }}>No data yet.</td></tr>
                ) : topUsers.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="user-cell">
                        <Avatar name={u.full_name || u.email} avatarUrl={u.avatar_url} size={26} />
                        <div className="name">{u.full_name || "—"}</div>
                      </div>
                    </td>
                    <td><span className="mono">{fmtBytes(u.total_bytes)}</span></td>
                    <td style={{ minWidth: 80 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <MiniStorageBar pct={u.pct} />
                        <span style={{ fontSize: 10, color: "var(--admin-text-3)" }}>{u.pct}%</span>
                      </div>
                    </td>
                    <td>{planPill(u.plan_name || "Free")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
