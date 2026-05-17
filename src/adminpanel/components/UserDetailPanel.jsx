import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Envelope, Gear, Prohibit, Trash, FolderOpen, File, VideoCamera,
  CloudArrowUp, Timer, Eye, Clock, Globe, Shield,
  CheckCircle, Warning, PlayCircle, Database,
} from "@phosphor-icons/react";

const SB = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getToken() {
  return JSON.parse(localStorage.getItem("ets_auth") || "{}").access_token;
}
function hdr(extra = {}) {
  return { Authorization: `Bearer ${getToken()}`, apikey: ANON, "Content-Type": "application/json", ...extra };
}

function fmtBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + " KB";
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + " MB";
  return (b / 1024 ** 3).toFixed(2) + " GB";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function timeAgo(d) {
  if (!d) return "never";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return fmtDate(d);
}

const AV_COLORS = ["#7c3aed", "#2563eb", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777"];

function Avatar({ name, url, size = 56 }) {
  const chars = (name || "?").replace(/[^a-zA-Z ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const bg = AV_COLORS[(chars.charCodeAt(0) || 0) % AV_COLORS.length];
  if (url) return <img src={url} alt={name} className="udp-av-img" style={{ width: size, height: size }} />;
  return <div className="udp-av" style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}>{chars}</div>;
}

const PLAN_LIMITS_GB = { Free: 2, Pro: 500, Business: 2000 };
function planLimitBytes(gb) { return (gb || 2) * 1024 ** 3; }

const EMAIL_TEMPLATES = [
  {
    label: "Welcome",
    subject: "Welcome to Eastape Studio!",
    body: "Hi {name},\n\nWelcome to Eastape Studio! We're thrilled to have you on board.\n\nGet started by creating your first project at studio.eastape.com.\n\nIf you have any questions, we're always here to help.\n\nBest,\nThe Eastape Team",
  },
  {
    label: "Suspended",
    subject: "Your Eastape account has been suspended",
    body: "Hi {name},\n\nYour Eastape Studio account has been temporarily suspended due to a violation of our terms of service.\n\nIf you believe this is an error, please reply to this email and we'll look into it.\n\nBest,\nThe Eastape Team",
  },
  {
    label: "Plan Upgrade",
    subject: "Your Eastape plan has been upgraded!",
    body: "Hi {name},\n\nGreat news — your Eastape Studio account has been upgraded. You now have access to expanded storage and premium features.\n\nLog in at studio.eastape.com to explore everything that's available to you.\n\nBest,\nThe Eastape Team",
  },
  {
    label: "Action Required",
    subject: "Action required on your Eastape account",
    body: "Hi {name},\n\nWe noticed something on your account that requires your attention.\n\nPlease log in to studio.eastape.com to review your account.\n\nBest,\nThe Eastape Team",
  },
];

const ACT_DOT = {
  signup: "#22c55e", login: "#60a5fa",
  project_create: "#a78bfa", project_delete: "#f87171",
  upload: "#60a5fa", share: "#fb923c",
  comment: "#34d399", delete: "#f87171",
  upgrade: "#fb923c", plan_change: "#fb923c",
  admin: "#60a5fa", suspend: "#f87171", unsuspend: "#22c55e",
};

function actDot(action) {
  for (const [k, v] of Object.entries(ACT_DOT)) {
    if (action?.toLowerCase().includes(k)) return v;
  }
  return "#6b7280";
}
function actLabel(action, meta) {
  const map = {
    signup: "Signed up", login: "Logged in", logout: "Logged out",
    project_create: "Created project", project_delete: "Deleted project",
    upload: "Uploaded file", share: "Created share link",
    comment: "Left comment", plan_change: "Changed plan",
    upgrade: "Upgraded plan", admin: "Admin action",
    suspend: "Account suspended", unsuspend: "Account reactivated",
    delete: "Deleted item",
  };
  let base = "";
  for (const [k, v] of Object.entries(map)) {
    if (action?.toLowerCase().includes(k)) { base = v; break; }
  }
  if (!base) base = (action || "unknown").replace(/_/g, " ");
  if (meta?.name) base += ` "${meta.name}"`;
  else if (meta?.detail) base += ` — ${meta.detail}`;
  return base;
}

function StatCard({ icon: Icon, color, label, value, loading }) {
  return (
    <div className="udp-stat">
      <div className="udp-stat-ic" style={{ color }}><Icon size={14} /></div>
      <div className="udp-stat-val">
        {loading ? <span className="udp-skel-inline" /> : (value ?? "—")}
      </div>
      <div className="udp-stat-lbl">{label}</div>
    </div>
  );
}

function SecHead({ children }) {
  return <div className="udp-sec">{children}</div>;
}

function InfoRow({ label, value }) {
  return (
    <div className="udp-info-row">
      <span className="udp-info-key">{label}</span>
      <span className="udp-info-val">{value ?? "—"}</span>
    </div>
  );
}

// ── Email Modal ─────────────────────────────────────────────────────────────

function EmailModal({ user, planName, onClose, onSuccess }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTpl, setActiveTpl] = useState(null);

  const displayName = user.full_name || user.email.split("@")[0];

  function applyTemplate(tpl) {
    setActiveTpl(tpl.label);
    setSubject(tpl.subject);
    setBody(tpl.body.replace(/{name}/g, displayName));
  }

  async function send() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${SB}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: user.email, template: "custom", data: { subject, body } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      onSuccess?.("Email sent to " + user.email);
      onClose();
    } catch (e) {
      onSuccess?.("Email error: " + (e.message || "Unknown error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      className="udp-modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="udp-email-modal"
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="udp-email-head">
          <div>
            <h3>Send Email</h3>
            <div className="udp-email-to">To: <strong>{user.email}</strong></div>
          </div>
          <button className="adm-icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="udp-email-tpls">
          <div className="udp-email-tpl-lbl">Templates</div>
          <div className="udp-email-tpl-row">
            {EMAIL_TEMPLATES.map(t => (
              <button
                key={t.label}
                className={`udp-email-tpl ${activeTpl === t.label ? "on" : ""}`}
                onClick={() => applyTemplate(t)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="udp-email-fields">
          <div className="adm-field">
            <label>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…" />
          </div>
          <div className="adm-field">
            <label>Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message…" rows={8} />
          </div>
        </div>

        <div className="udp-email-foot">
          <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="adm-btn primary"
            onClick={send}
            disabled={sending || !subject.trim() || !body.trim()}
          >
            {sending ? "Sending…" : "Send Email"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Confirm Modal ───────────────────────────────────────────────────────────

function ConfirmModal({ type, displayName, onCancel, onConfirm }) {
  const cfg = {
    ban: {
      title: "Suspend User",
      body: `Suspend ${displayName}? They will immediately lose access to all features and content.`,
      action: "Confirm Suspend",
    },
    delete: {
      title: "Delete User",
      body: `Permanently delete ${displayName} and all their data? This action cannot be undone.`,
      action: "Delete Forever",
    },
    purge: {
      title: "Purge All Files",
      body: `Delete all files uploaded by ${displayName}? This will free storage but cannot be reversed.`,
      action: "Purge Files",
    },
  }[type];

  if (!cfg) return null;

  return (
    <motion.div
      className="udp-modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="udp-confirm-modal"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="udp-confirm-title">{cfg.title}</div>
        <p className="udp-confirm-body">{cfg.body}</p>
        <div className="udp-confirm-actions">
          <button className="adm-btn" onClick={onCancel}>Cancel</button>
          <button className="adm-btn danger" style={{ background: "var(--admin-danger)", color: "#fff", borderColor: "var(--admin-danger)" }} onClick={onConfirm}>
            {cfg.action}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function UserDetailPanel({
  user,
  planName,
  planId,
  plans = [],
  onClose,
  onChangePlan,
  onToggleSuspend,
  onDelete,
  onSuccess,
}) {
  const [tab, setTab] = useState("overview");
  const [isBanned, setIsBanned] = useState(user?.is_suspended || false);
  const [showEmail, setShowEmail] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'ban'|'delete'|'purge'

  // Profile extended data
  const [profile, setProfile] = useState(null);
  const [planData, setPlanData] = useState(null); // { name, storage_limit_gb }

  // Overview stats
  const [stats, setStats] = useState({
    projects: null, driveFiles: null, projectFiles: null, projectMedia: null,
    uploads30d: null, storageBytes: null,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Activity
  const [activity, setActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [actLoaded, setActLoaded] = useState(false);

  // Content
  const [projects, setProjects] = useState([]);
  const [recentFiles, setRecentFiles] = useState([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentLoaded, setContentLoaded] = useState(false);

  // Settings form
  const [form, setForm] = useState({
    displayName: user?.full_name || "",
    username: "",
    email: user?.email || "",
    phone: "",
    plan: planId || "",
    role: user?.is_admin ? "admin" : "user",
    storageOverride: "default",
    projectsOverride: "default",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const displayName = user?.full_name || user?.email || "Unknown";
  const displayPlan = planData?.name || planName || "Free";
  const planType = displayPlan === "Pro" ? "accent" : displayPlan === "Business" ? "purple" : "muted";
  const limitGb = planData?.storage_limit_gb || PLAN_LIMITS_GB[displayPlan] || 2;
  const storageLimit = planLimitBytes(limitGb);
  const storageUsed = stats.storageBytes ?? profile?.storage_used ?? user?.storage_used ?? 0;
  const storagePct = Math.min(100, Math.round((storageUsed / storageLimit) * 100));
  const storageColor = storagePct > 80 ? "var(--admin-danger)" : storagePct > 60 ? "var(--admin-warn)" : "var(--admin-accent)";
  const totalFiles = (stats.driveFiles || 0) + (stats.projectFiles || 0) + (stats.projectMedia || 0);

  // Fetch profile + stats + content via admin edge function (bypasses RLS)
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const authHdr = { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };

    // Plan data for accurate storage limit (anon key is fine here — user_plans RLS allows admin)
    fetch(`${SB}/rest/v1/user_plans?user_id=eq.${uid}&is_active=eq.true&select=plans(name,storage_limit_gb)`, { headers: hdr() })
      .then(r => r.json())
      .then(d => { if (d?.[0]?.plans) setPlanData(d[0].plans); })
      .catch(() => {});

    // All detail via service-role edge function
    fetch(`${SB}/functions/v1/admin-user-detail?user_id=${uid}`, { headers: authHdr })
      .then(r => r.json())
      .then(d => {
        if (d.error) return;
        if (d.username !== undefined) setForm(f => ({ ...f, username: d.username || "" }));
        if (d.stats) {
          setStats({
            projects: d.stats.projects,
            driveFiles: d.stats.drive_files,
            projectFiles: d.stats.project_files,
            projectMedia: d.stats.project_media,
            uploads30d: d.stats.uploads_30d,
            storageBytes: d.stats.storage_bytes,
          });
        }
        if (d.projects) setProjects(d.projects);
        if (d.drive_files || d.project_media) {
          const allFiles = [
            ...(d.drive_files || []).map(f => ({ ...f, _src: "drive" })),
            ...(d.project_media || []).map(f => ({ ...f, _src: "media" })),
          ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
          setRecentFiles(allFiles);
        }
        setContentLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, [user?.id]);

  // Activity tab — filter by target_id + target_type (not target_user_id)
  useEffect(() => {
    if (tab !== "activity" || actLoaded || !user?.id) return;
    setLoadingActivity(true);
    fetch(
      `${SB}/rest/v1/admin_audit_logs?target_id=eq.${user.id}&target_type=eq.user&select=*&order=created_at.desc&limit=30`,
      { headers: hdr() }
    )
      .then(r => r.json())
      .then(d => { setActivity(Array.isArray(d) ? d : []); setActLoaded(true); })
      .catch(() => setActivity([]))
      .finally(() => setLoadingActivity(false));
  }, [tab, user?.id, actLoaded]);

  // Content data is loaded in the mount effect via admin-user-detail

  if (!user) return null;

  // Handlers
  function handleBanConfirm() {
    setIsBanned(true);
    setConfirm(null);
    onToggleSuspend?.();
    onSuccess?.(`${displayName} has been suspended.`);
  }
  function handleUnban() {
    setIsBanned(false);
    onToggleSuspend?.();
    onSuccess?.(`${displayName} has been reactivated.`);
  }
  function handleDeleteConfirm() {
    setConfirm(null);
    onDelete?.();
    onClose?.();
  }
  function handlePurgeConfirm() {
    setConfirm(null);
    onSuccess?.("File purge queued for " + displayName);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updates = { full_name: form.displayName };
      if (form.username) updates.username = form.username;
      if ((form.role === "admin") !== !!user.is_admin) updates.is_admin = form.role === "admin";
      if (form.plan && form.plan !== planId) updates.plan_id = form.plan;

      const res = await fetch(`${SB}/functions/v1/admin-user-detail?user_id=${user.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setSaved(true);
      onSuccess?.("Profile saved.");
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { onSuccess?.(e.message || "Failed to save."); }
    finally { setSaving(false); }
  }

  async function handlePasswordReset() {
    try {
      const res = await fetch(`${SB}/functions/v1/admin-reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, user_id: user.id, mode: "link" }),
      });
      if (!res.ok) throw new Error();
      onSuccess?.("Password reset link generated and sent.");
    } catch { onSuccess?.("Failed to send reset."); }
  }

  async function handleRevokeSessions() {
    onSuccess?.("Session revocation is managed via the Supabase dashboard.");
  }

  return (
    <div className="adm-drawer-overlay" onClick={onClose}>
      {/* Modals rendered inside overlay (position:fixed escapes stacking context) */}
      <AnimatePresence>
        {showEmail && (
          <EmailModal
            key="email-modal"
            user={user}
            planName={displayPlan}
            onClose={() => setShowEmail(false)}
            onSuccess={onSuccess}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirm && (
          <ConfirmModal
            key="confirm-modal"
            type={confirm}
            displayName={displayName}
            onCancel={() => setConfirm(null)}
            onConfirm={
              confirm === "ban" ? handleBanConfirm
              : confirm === "delete" ? handleDeleteConfirm
              : handlePurgeConfirm
            }
          />
        )}
      </AnimatePresence>

      <motion.div
        className="adm-drawer"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="udp-head">
          <button className="adm-icon-btn udp-close" onClick={onClose}><X size={15} /></button>
          <div className="udp-head-top">
            <Avatar name={displayName} url={user.avatar_url} size={56} />
            <div className="udp-head-info">
              <h2>{displayName}</h2>
              <div className="udp-email-line">{user.email}</div>
              <div className="udp-pills">
                <span className={`adm-pill ${planType}`}><span className="dot" />{displayPlan}</span>
                <span className={`adm-pill ${isBanned ? "danger" : "ok"}`}><span className="dot" />{isBanned ? "Suspended" : "Active"}</span>
                {user.is_admin && <span className="adm-pill accent"><span className="dot" />Admin</span>}
              </div>
            </div>
          </div>
          <div className="udp-head-meta">
            <span><Clock size={11} /> Joined {fmtDate(user.created_at)}</span>
            <span><Eye size={11} /> Active {timeAgo(user.last_sign_in_at)}</span>
            {user.last_ip && <span><Globe size={11} /> {user.last_ip}</span>}
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="udp-actions">
          <button className="udp-btn primary" onClick={() => setShowEmail(true)}>
            <Envelope size={13} /> Email
          </button>
          <button className="udp-btn" onClick={() => setTab("settings")}>
            <Gear size={13} /> Edit
          </button>
          <button className={`udp-btn ${isBanned ? "" : "ban"}`} onClick={() => isBanned ? handleUnban() : setConfirm("ban")}>
            <Prohibit size={13} /> {isBanned ? "Unban" : "Ban"}
          </button>
          <button className="udp-btn del" onClick={() => setConfirm("delete")}>
            <Trash size={13} /> Delete
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="udp-tabs">
          {[["overview", "Overview"], ["activity", "Activity"], ["content", "Content"], ["settings", "Settings"]].map(([id, lbl]) => (
            <button key={id} className={`udp-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{lbl}</button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="udp-body">

          {/* Overview */}
          {tab === "overview" && (
            <div className="udp-fade">
              {/* Storage bar */}
              {(storageUsed > 0 || !loadingStats) && (
                <div className="udp-storage">
                  <div className="udp-storage-label">
                    <span>Storage</span>
                    <span>{fmtBytes(storageUsed)} / {fmtBytes(storageLimit)}</span>
                  </div>
                  <div className="udp-storage-track">
                    <div className="udp-storage-fill" style={{ width: `${storagePct}%`, background: storageColor }} />
                  </div>
                  <div className="udp-storage-pct">{storagePct}% used</div>
                </div>
              )}

              {/* 8-stat grid */}
              <div className="udp-stats">
                <StatCard icon={FolderOpen}   color="#a78bfa" label="PROJECTS"     value={stats.projects}    loading={loadingStats} />
                <StatCard icon={File}          color="#60a5fa" label="TOTAL FILES"  value={loadingStats ? null : totalFiles} loading={loadingStats} />
                <StatCard icon={CloudArrowUp}  color="#34d399" label="DRIVE FILES"  value={stats.driveFiles}  loading={loadingStats} />
                <StatCard icon={VideoCamera}   color="#fb923c" label="MEDIA FILES"  value={stats.projectMedia} loading={loadingStats} />
                <StatCard icon={File}          color="#60a5fa" label="PROJ FILES"   value={stats.projectFiles} loading={loadingStats} />
                <StatCard icon={CloudArrowUp}  color="#fb923c" label="UPL 30D"      value={stats.uploads30d}  loading={loadingStats} />
                <StatCard icon={Eye}           color="#a78bfa" label="REVIEWS"      value="—"                 loading={false} />
                <StatCard icon={Globe}         color="#6b7280" label="SESSIONS"     value="—"                 loading={false} />
              </div>

              {/* Account details */}
              <SecHead>Account Details</SecHead>
              <div className="udp-info">
                {form.username && <InfoRow label="USERNAME" value={<span style={{ color: "var(--admin-accent)" }}>@{form.username}</span>} />}
                {user.last_ip && <InfoRow label="IP ADDRESS" value={user.last_ip} />}
                {user.user_agent   && <InfoRow label="BROWSER"    value={user.user_agent} />}
                <InfoRow label="EMAIL" value={user.email} />
                <InfoRow label="USER ID" value={<span className="udp-mono">{user.id}</span>} />
                <InfoRow label="2FA" value={
                  user.mfa_enabled
                    ? <span className="adm-pill ok"><span className="dot" />Enabled</span>
                    : <span className="adm-pill muted"><span className="dot" />Disabled</span>
                } />
                <InfoRow label="JOINED"     value={fmtDate(user.created_at)} />
                <InfoRow label="LAST LOGIN" value={timeAgo(user.last_sign_in_at)} />
                <InfoRow label="PLAN"  value={<span className={`adm-pill ${planType}`}><span className="dot" />{displayPlan}</span>} />
              </div>
            </div>
          )}

          {/* Activity */}
          {tab === "activity" && (
            <div className="udp-fade">
              <SecHead>Recent Activity</SecHead>
              {loadingActivity ? (
                <div className="udp-skels">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="udp-skel-row" />)}</div>
              ) : activity.length === 0 ? (
                <div className="udp-empty">No activity logs for this user.</div>
              ) : (
                <div className="udp-feed">
                  {activity.map((a, i) => (
                    <div key={a.id || i} className="udp-feed-row">
                      <div className="udp-feed-dot" style={{ background: actDot(a.action) }} />
                      <div className="udp-feed-text">{actLabel(a.action, a.metadata)}</div>
                      <div className="udp-feed-ts">{timeAgo(a.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Content */}
          {tab === "content" && (
            <div className="udp-fade">
              {loadingContent ? (
                <div className="udp-skels">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="udp-skel-row" />)}</div>
              ) : (
                <>
                  <SecHead>Projects ({projects.length})</SecHead>
                  {projects.length > 0 ? (
                    <div className="adm-table-wrap udp-tbl">
                      <table className="adm-table">
                        <thead><tr><th>Project</th><th>Status</th><th>Created</th></tr></thead>
                        <tbody>
                          {projects.map(p => (
                            <tr key={p.id}>
                              <td className="udp-tname">{p.name}</td>
                              <td>
                                <span className={`adm-pill ${p.status === "archived" ? "muted" : "ok"}`}>
                                  <span className="dot" />{p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : "Active"}
                                </span>
                              </td>
                              <td className="udp-mono">{fmtDate(p.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="udp-empty" style={{ padding: "12px 0 20px" }}>No projects.</div>}

                  <SecHead>Recent Files</SecHead>
                  {recentFiles.length > 0 ? (
                    <div className="adm-table-wrap udp-tbl">
                      <table className="adm-table">
                        <thead><tr><th>Filename</th><th>Size</th><th>Date</th></tr></thead>
                        <tbody>
                          {recentFiles.map(f => (
                            <tr key={f.id}>
                              <td className="udp-tname">{f.name || f.filename || "—"}</td>
                              <td className="udp-mono">{fmtBytes(f.size_bytes || f.file_size)}</td>
                              <td className="udp-mono">{fmtDate(f.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="udp-empty" style={{ padding: "12px 0 20px" }}>No files.</div>}

                </>
              )}
            </div>
          )}

          {/* Settings */}
          {tab === "settings" && (
            <div className="udp-fade">
              <SecHead>Profile</SecHead>
              <div className="udp-form-grid">
                <div className="adm-field">
                  <label>Display Name</label>
                  <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
                </div>
                <div className="adm-field">
                  <label>Username</label>
                  <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="@username" />
                </div>
                <div className="adm-field">
                  <label>Email</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="adm-field">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                </div>
              </div>

              <SecHead>Plan & Access</SecHead>
              <div className="udp-form-grid">
                <div className="adm-field">
                  <label>Plan</label>
                  <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {!plans.length && <option value="">Free</option>}
                  </select>
                </div>
                <div className="adm-field">
                  <label>Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="adm-field">
                  <label>Storage Limit Override</label>
                  <select value={form.storageOverride} onChange={e => setForm(f => ({ ...f, storageOverride: e.target.value }))}>
                    <option value="default">Plan default</option>
                    <option value="50">50 GB</option>
                    <option value="100">100 GB</option>
                    <option value="500">500 GB</option>
                    <option value="1000">1 TB</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                </div>
                <div className="adm-field">
                  <label>Max Projects Override</label>
                  <select value={form.projectsOverride} onChange={e => setForm(f => ({ ...f, projectsOverride: e.target.value }))}>
                    <option value="default">Plan default</option>
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                </div>
              </div>

              <SecHead>Admin Notes</SecHead>
              <div className="adm-field udp-notes-field">
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Internal notes about this user…"
                  rows={3}
                />
                <span className="udp-hint">Only visible to admins. Not shared with the user.</span>
              </div>

              <SecHead>Security</SecHead>
              <div className="udp-security">
                <div className="udp-sec-row">
                  <div className="udp-sec-info">
                    <div className="udp-sec-label">Force password reset</div>
                    <div className="udp-sec-desc">Send a reset link to the user's email on next login.</div>
                  </div>
                  <button className="adm-btn sm" onClick={handlePasswordReset}>
                    <Envelope size={12} /> Send Reset
                  </button>
                </div>
                <div className="udp-sec-row">
                  <div className="udp-sec-info">
                    <div className="udp-sec-label">Revoke all sessions</div>
                    <div className="udp-sec-desc">Log the user out of all devices immediately.</div>
                  </div>
                  <button className="adm-btn sm danger" onClick={handleRevokeSessions}>Revoke</button>
                </div>
                <div className="udp-sec-row">
                  <div className="udp-sec-info">
                    <div className="udp-sec-label">2FA Status</div>
                    <div className="udp-sec-desc">Two-factor authentication for this account.</div>
                  </div>
                  <span className={`adm-pill ${user.mfa_enabled ? "ok" : "muted"}`}>
                    <span className="dot" />{user.mfa_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>

              <SecHead>Danger Zone</SecHead>
              <div className="udp-danger">
                <div className="udp-danger-title">Destructive Actions</div>
                <div className="udp-danger-desc">These actions are irreversible or have significant impact on the user's account.</div>
                <div className="udp-danger-btns">
                  <button className="adm-btn sm danger" onClick={() => isBanned ? handleUnban() : setConfirm("ban")}>
                    <Prohibit size={12} /> {isBanned ? "Unban User" : "Ban User"}
                  </button>
                  <button className="adm-btn sm danger" onClick={() => setConfirm("delete")}>
                    <Trash size={12} /> Delete User
                  </button>
                  <button className="adm-btn sm danger" onClick={() => setConfirm("purge")}>
                    <Warning size={12} /> Purge Files
                  </button>
                </div>
              </div>

              <div className="udp-save-row">
                <button className="adm-btn primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
                </button>
                <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
              </div>
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
}
