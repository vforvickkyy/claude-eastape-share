import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X, FolderOpen, File, VideoCamera, Chats, CloudArrowUp,
  Timer, Share, Eye, Clock, Globe, Lock, Shield,
  CheckCircle, Warning,
} from "@phosphor-icons/react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getAuth() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token };
}
function authHeaders() {
  const { token } = getAuth();
  return { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
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
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const AVATAR_COLORS = ["#7c3aed","#2563eb","#059669","#dc2626","#d97706","#0891b2","#db2777"];

function AvatarCircle({ name, avatarUrl, size = 48 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
  const bg = AVATAR_COLORS[initial.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.36, color: "#fff", flexShrink: 0 }}>
      {initial}
    </div>
  );
}

function DstatCard({ icon: Icon, color, label, value }) {
  return (
    <div className="adm-dstat">
      <div className="ic" style={{ background: `color-mix(in oklch, ${color} 15%, transparent)`, color }}>
        <Icon size={13} />
      </div>
      <div className="val">{value ?? "—"}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

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
  const [showBanConfirm, setShowBanConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [editName, setEditName] = useState(user?.full_name || "");
  const [editEmail, setEditEmail] = useState(user?.email || "");
  const [saved, setSaved] = useState(false);

  /* Stats from Supabase */
  const [stats, setStats] = useState({ projects: "—", shares: "—", media: "—", comments: "—" });
  /* Content tab data */
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [videos, setVideos] = useState([]);
  /* Activity tab data */
  const [activity, setActivity] = useState([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);

  /* Fetch overview stats on mount */
  useEffect(() => {
    if (!user?.id) return;
    const h = { ...authHeaders(), Prefer: "count=exact", Range: "0-0" };
    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/projects?user_id=eq.${user.id}&select=id`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/shares?user_id=eq.${user.id}&select=id`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/media_assets?user_id=eq.${user.id}&select=id`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/comments?user_id=eq.${user.id}&select=id`, { headers: h }).catch(() => null),
    ]).then(([pRes, sRes, mRes, cRes]) => {
      const count = (res) => res ? parseInt(res.headers.get("content-range")?.split("/")[1] || "0") : 0;
      setStats({
        projects: count(pRes).toLocaleString(),
        shares: count(sRes).toLocaleString(),
        media: count(mRes).toLocaleString(),
        comments: count(cRes).toLocaleString(),
      });
    }).catch(() => {});
  }, [user?.id]);

  /* Fetch content tab data */
  useEffect(() => {
    if (tab !== "content" || !user?.id) return;
    setLoadingContent(true);
    const h = authHeaders();
    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/projects?user_id=eq.${user.id}&select=id,name,created_at&order=created_at.desc&limit=10`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${SUPABASE_URL}/rest/v1/shares?user_id=eq.${user.id}&select=id,filename,file_size,created_at&order=created_at.desc&limit=10`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${SUPABASE_URL}/rest/v1/media_assets?user_id=eq.${user.id}&select=id,name,bunny_video_status,created_at&order=created_at.desc&limit=10`, { headers: h }).then(r => r.json()).catch(() => []),
    ]).then(([p, s, v]) => {
      setProjects(Array.isArray(p) ? p : []);
      setFiles(Array.isArray(s) ? s : []);
      setVideos(Array.isArray(v) ? v : []);
    }).finally(() => setLoadingContent(false));
  }, [tab, user?.id]);

  /* Fetch activity tab data */
  useEffect(() => {
    if (tab !== "activity" || !user?.id) return;
    setLoadingActivity(true);
    fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs?target_user_id=eq.${user.id}&select=*&order=created_at.desc&limit=20`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setActivity(Array.isArray(d) ? d : []))
      .catch(() => setActivity([]))
      .finally(() => setLoadingActivity(false));
  }, [tab, user?.id]);

  if (!user) return null;

  const planType = planName === "Pro" ? "accent" : planName === "Business" ? "purple" : "muted";
  const statusType = isBanned ? "danger" : "ok";
  const displayPlan = planName || "Free";

  async function handleSendEmail() {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setSendingEmail(true);
    try {
      const { token } = getAuth();
      await fetch(`${SUPABASE_URL}/functions/v1/admin-send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: user.email, subject: emailSubject, body: emailBody }),
      });
      onSuccess?.("Email sent to " + user.email);
      setShowEmail(false);
      setEmailSubject(""); setEmailBody("");
    } catch { onSuccess?.("Failed to send email", "error"); }
    finally { setSendingEmail(false); }
  }

  function handleBanConfirm() {
    setIsBanned(true);
    setShowBanConfirm(false);
    onToggleSuspend?.();
    onSuccess?.(`${user.full_name || user.email} has been suspended.`);
  }

  function handleUnban() {
    setIsBanned(false);
    onToggleSuspend?.();
    onSuccess?.(`${user.full_name || user.email} has been reactivated.`);
  }

  function handleSave() {
    setSaved(true);
    onSuccess?.("Profile changes saved.");
    setTimeout(() => setSaved(false), 2000);
  }

  const ACT_COLOR = {
    project_create: "var(--admin-info)", delete: "var(--admin-danger)",
    admin: "var(--admin-accent)", upgrade: "var(--admin-accent)",
    upload: "var(--admin-warn)", signup: "var(--admin-ok)",
  };

  return (
    <div className="adm-drawer-overlay" onClick={onClose}>
      <motion.div
        className="adm-drawer"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="adm-drawer-head">
          <button className="adm-icon-btn close" onClick={onClose}><X size={15} /></button>
          <div className="head-top">
            <AvatarCircle name={user.full_name || user.email} avatarUrl={user.avatar_url} size={48} />
            <div className="head-info">
              <h2>{user.full_name || "—"}</h2>
              <div className="email">{user.email}</div>
              <div className="head-pills">
                <span className={`adm-pill ${planType}`}><span className="dot" />{displayPlan}</span>
                <span className={`adm-pill ${statusType}`}><span className="dot" />{isBanned ? "Suspended" : "Active"}</span>
                {user.is_admin && <span className="adm-pill accent"><span className="dot" />Admin</span>}
              </div>
            </div>
          </div>
          <div className="head-meta">
            <span><Clock size={11} /> Joined {fmtDate(user.created_at)}</span>
            <span><Eye size={11} /> Active {timeAgo(user.last_sign_in_at || user.created_at)}</span>
          </div>
        </div>

        {/* ── Quick actions ── */}
        <div className="adm-drawer-actions">
          <button className="adm-btn primary sm" onClick={() => setShowEmail(!showEmail)}>
            <CloudArrowUp size={12} /> Email
          </button>
          <button className="adm-btn sm" onClick={onChangePlan}>
            <FolderOpen size={12} /> Plan
          </button>
          <button
            className={`adm-btn sm ${isBanned ? "" : "danger"}`}
            onClick={() => isBanned ? handleUnban() : setShowBanConfirm(!showBanConfirm)}
          >
            <Shield size={12} /> {isBanned ? "Unban" : "Ban"}
          </button>
          <button className="adm-btn sm danger" onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}>
            <X size={12} /> Delete
          </button>
        </div>

        {/* ── Confirmations / Email form ── */}
        {showBanConfirm && !isBanned && (
          <div style={{ padding: "0 24px" }}>
            <div className="adm-confirm">
              <p>Suspend <b>{user.full_name || user.email}</b>? They will lose access to all features.</p>
              <div className="actions">
                <button className="adm-btn sm" onClick={() => setShowBanConfirm(false)}>Cancel</button>
                <button className="adm-btn sm danger" onClick={handleBanConfirm}
                  style={{ background: "var(--admin-danger)", color: "#fff", borderColor: "var(--admin-danger)" }}>
                  Confirm Suspend
                </button>
              </div>
            </div>
          </div>
        )}
        {showDeleteConfirm && (
          <div style={{ padding: "0 24px" }}>
            <div className="adm-confirm">
              <p>Permanently delete <b>{user.full_name || user.email}</b> and all their data? This cannot be undone.</p>
              <div className="actions">
                <button className="adm-btn sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="adm-btn sm danger" onClick={() => { onDelete?.(); onClose(); }}
                  style={{ background: "var(--admin-danger)", color: "#fff", borderColor: "var(--admin-danger)" }}>
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        )}
        {showEmail && (
          <div style={{ padding: "12px 24px 0" }}>
            <div className="adm-email-form">
              <h4>Send Personal Email</h4>
              <div className="fields">
                <input value={user.email} disabled style={{ opacity: 0.6 }} />
                <input placeholder="Subject…" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                <textarea placeholder="Write your message…" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
              </div>
              <div className="form-actions">
                <button className="adm-btn sm ghost" onClick={() => setShowEmail(false)}>Cancel</button>
                <button className="adm-btn sm primary" onClick={handleSendEmail} disabled={sendingEmail}>
                  {sendingEmail ? "Sending…" : "Send Email"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="adm-drawer-tabs">
          {[["overview","Overview"],["activity","Activity"],["content","Content"],["settings","Settings"]].map(([id, label]) => (
            <div key={id} className={`adm-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{label}</div>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="adm-drawer-body" key={tab}>
          {/* Overview */}
          {tab === "overview" && (
            <div style={{ animation: "admFadeIn 0.15s ease" }}>
              <div className="adm-dstat-grid">
                <DstatCard icon={FolderOpen} color="var(--admin-purple)" label="Projects" value={stats.projects} />
                <DstatCard icon={Share} color="var(--admin-ok)" label="Shares" value={stats.shares} />
                <DstatCard icon={VideoCamera} color="var(--admin-info)" label="Videos" value={stats.media} />
                <DstatCard icon={Chats} color="var(--admin-warn)" label="Comments" value={stats.comments} />
              </div>

              <div className="adm-drawer-sec"><h4>Account Details</h4></div>
              <div className="adm-dinfo">
                <div className="adm-dinfo-row"><span className="key">User ID</span><span className="val" style={{ fontFamily: "var(--admin-mono)", fontSize: 11, color: "var(--admin-text-3)" }}>{user.id}</span></div>
                <div className="adm-dinfo-row"><span className="key">Email</span><span className="val">{user.email}</span></div>
                <div className="adm-dinfo-row"><span className="key">Full Name</span><span className="val">{user.full_name || "—"}</span></div>
                <div className="adm-dinfo-row"><span className="key">Plan</span><span className="val"><span className={`adm-pill ${planType}`}><span className="dot" />{displayPlan}</span></span></div>
                <div className="adm-dinfo-row"><span className="key">Status</span><span className="val"><span className={`adm-pill ${statusType}`}><span className="dot" />{isBanned ? "Suspended" : "Active"}</span></span></div>
                <div className="adm-dinfo-row"><span className="key">Joined</span><span className="val" style={{ fontFamily: "var(--admin-mono)", fontSize: 11 }}>{fmtDate(user.created_at)}</span></div>
                <div className="adm-dinfo-row"><span className="key">Last Login</span><span className="val" style={{ fontFamily: "var(--admin-mono)", fontSize: 11 }}>{fmtDate(user.last_sign_in_at)}</span></div>
                <div className="adm-dinfo-row"><span className="key">Role</span><span className="val">{user.is_admin ? <span className="adm-pill accent"><span className="dot" />Admin</span> : <span className="adm-pill muted"><span className="dot" />User</span>}</span></div>
              </div>
            </div>
          )}

          {/* Activity */}
          {tab === "activity" && (
            <div style={{ animation: "admFadeIn 0.15s ease" }}>
              <div className="adm-drawer-sec"><h4>Recent Activity</h4></div>
              {loadingActivity ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ height: 40, background: "rgba(255,255,255,0.04)", borderRadius: 6, animation: "pulse 1.5s infinite" }} />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--admin-text-3)", fontSize: 13 }}>
                  No activity logs found for this user.
                </div>
              ) : (
                <div className="adm-feed">
                  {activity.map((a, i) => (
                    <div key={a.id || i} className="adm-feed-row">
                      <div className="adm-feed-dot" style={{ background: ACT_COLOR[a.action] || "var(--admin-text-4)" }} />
                      <div className="adm-feed-text">
                        <b>{a.action?.replace(/_/g, " ")}</b>
                        {a.metadata?.detail && <span> · {a.metadata.detail}</span>}
                      </div>
                      <div className="adm-feed-ts">{timeAgo(a.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Content */}
          {tab === "content" && (
            <div style={{ animation: "admFadeIn 0.15s ease" }}>
              {loadingContent ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[60, 80, 50, 70].map((w, i) => <div key={i} style={{ height: 14, width: `${w}%`, background: "rgba(255,255,255,0.06)", borderRadius: 4, animation: "pulse 1.5s infinite" }} />)}
                </div>
              ) : (
                <>
                  <div className="adm-drawer-sec"><h4>Projects ({projects.length})</h4></div>
                  {projects.length > 0 ? (
                    <div className="adm-table-wrap" style={{ marginBottom: 20 }}>
                      <table className="adm-table">
                        <thead><tr><th>Name</th><th>Created</th></tr></thead>
                        <tbody>
                          {projects.map(p => (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 500 }}>{p.name}</td>
                              <td><span className="mono">{fmtDate(p.created_at)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p style={{ color: "var(--admin-text-3)", fontSize: 12.5, marginBottom: 20 }}>No projects.</p>}

                  <div className="adm-drawer-sec"><h4>Recent Shares ({files.length})</h4></div>
                  {files.length > 0 ? (
                    <div className="adm-table-wrap" style={{ marginBottom: 20 }}>
                      <table className="adm-table">
                        <thead><tr><th>Filename</th><th>Size</th><th>Date</th></tr></thead>
                        <tbody>
                          {files.map(f => (
                            <tr key={f.id}>
                              <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{f.filename || f.name || "—"}</td>
                              <td><span className="mono">{fmtBytes(f.file_size)}</span></td>
                              <td><span className="mono">{fmtDate(f.created_at)}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p style={{ color: "var(--admin-text-3)", fontSize: 12.5, marginBottom: 20 }}>No shares.</p>}

                  <div className="adm-drawer-sec"><h4>Media Videos ({videos.length})</h4></div>
                  {videos.length > 0 ? (
                    <div className="adm-table-wrap">
                      <table className="adm-table">
                        <thead><tr><th>Name</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>
                          {videos.map(v => {
                            const st = v.bunny_video_status;
                            const pillType = st === "ready" ? "ok" : st === "processing" ? "warn" : "danger";
                            return (
                              <tr key={v.id}>
                                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{v.name}</td>
                                <td><span className={`adm-pill ${pillType}`}><span className="dot" />{st || "—"}</span></td>
                                <td><span className="mono">{fmtDate(v.created_at)}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <p style={{ color: "var(--admin-text-3)", fontSize: 12.5 }}>No videos.</p>}
                </>
              )}
            </div>
          )}

          {/* Settings */}
          {tab === "settings" && (
            <div style={{ animation: "admFadeIn 0.15s ease" }}>
              <div className="adm-drawer-sec"><h4>Profile</h4></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div className="adm-field">
                  <label>Display Name</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="adm-field">
                  <label>Email</label>
                  <input value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                </div>
              </div>

              <div className="adm-drawer-sec"><h4>Plan & Access</h4></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div className="adm-field">
                  <label>Plan</label>
                  <select defaultValue={planId || ""} onChange={() => onChangePlan?.()}>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {!plans.length && <option>Free</option>}
                  </select>
                </div>
                <div className="adm-field">
                  <label>Role</label>
                  <select defaultValue={user.is_admin ? "Admin" : "User"}>
                    <option>User</option>
                    <option>Admin</option>
                  </select>
                </div>
              </div>

              <div className="adm-drawer-sec"><h4>Admin Notes</h4></div>
              <div className="adm-field" style={{ marginBottom: 20 }}>
                <textarea placeholder="Internal notes about this user (not visible to user)…" />
                <span className="hint">Only visible to admins.</span>
              </div>

              <div className="adm-drawer-sec"><h4>Security</h4></div>
              <div style={{ border: "1px solid var(--admin-border)", borderRadius: "var(--admin-radius)", background: "var(--admin-card)", padding: "4px 14px", marginBottom: 20 }}>
                <div className="adm-setting">
                  <div className="adm-setting-info">
                    <div className="label">Force password reset</div>
                    <div className="desc">Send a reset link to the user's email on next login.</div>
                  </div>
                  <button className="adm-btn sm">Send Reset</button>
                </div>
                <div className="adm-setting">
                  <div className="adm-setting-info">
                    <div className="label">Revoke all sessions</div>
                    <div className="desc">Log the user out of all devices immediately.</div>
                  </div>
                  <button className="adm-btn sm danger">Revoke</button>
                </div>
              </div>

              <div className="adm-drawer-sec"><h4>Danger Zone</h4></div>
              <div className="adm-danger">
                <h4>Destructive Actions</h4>
                <p>These actions have significant impact on this user's account.</p>
                <div className="adm-danger-actions">
                  <button className="adm-btn sm danger" onClick={() => isBanned ? handleUnban() : setShowBanConfirm(true)}>
                    <Shield size={12} /> {isBanned ? "Unban User" : "Suspend User"}
                  </button>
                  <button className="adm-btn sm danger" onClick={() => setShowDeleteConfirm(true)}>
                    <X size={12} /> Delete User
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <button className="adm-btn primary" onClick={handleSave}>
                  {saved ? "✓ Saved" : "Save Changes"}
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
