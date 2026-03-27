import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Trash, User, Buildings, EnvelopeSimple, Lock,
  CheckCircle, Warning, Eye, EyeSlash, FloppyDisk, At,
  Spinner, XCircle, Info, Bell,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { usePlan } from "./context/PlanContext";
import DashboardLayout from "./DashboardLayout";
import { userApiFetch, formatSize } from "./lib/userApi";
import { userApi } from "./lib/api";

/* ─── tiny helpers ─── */
function Section({ title, description, children }) {
  return (
    <div className="profile-section">
      <div className="profile-section-head">
        <h2 className="profile-section-title">{title}</h2>
        {description && <p className="profile-section-desc">{description}</p>}
      </div>
      <div className="profile-section-body">{children}</div>
    </div>
  );
}

function Field({ label, icon, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="form-input-wrap">
        <span className="form-icon">{icon}</span>
        {children}
      </div>
    </div>
  );
}

function Toast({ type, message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`profile-toast ${type}`}>
      {type === "success" ? <CheckCircle size={15} weight="fill" /> : <Warning size={15} weight="fill" />}
      {message}
    </div>
  );
}

/* ════════════════════════════════════════════ */
export default function ProfilePage() {
  const { user, loading: authLoading, profile: authProfile } = useAuth();
  const plan = usePlan();
  const navigate = useNavigate();

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const [profile, setProfile]             = useState(null);
  const [toast, setToast]                 = useState(null); // { type: "success"|"error", message }
  const [usernameBannerDismissed, setUsernameBannerDismissed] = useState(
    () => localStorage.getItem("username-banner-dismissed") === "1"
  );

  function notify(type, message) { setToast({ type, message }); }

  function dismissUsernameBanner() {
    localStorage.setItem("username-banner-dismissed", "1");
    setUsernameBannerDismissed(true);
  }

  const [notificationPrefs, setNotificationPrefs] = useState({
    comments: true, mentions: true, team_invites: true,
    status_changes: true, deadlines: true, file_uploads: false,
    shot_assigned: true, weekly_summary: false,
  });

  // Load fresh profile data from server (userApi uses proper async token)
  useEffect(() => {
    if (!user) return;
    userApi.getProfile()
      .then(d => {
        setProfile(d);
        if (d.email_notifications) setNotificationPrefs(d.email_notifications);
      })
      .catch(() => setProfile({
        email: user.email,
        name:  user.user_metadata?.full_name || "",
        company: user.user_metadata?.company || "",
        avatarUrl: user.user_metadata?.avatar_url || null,
        createdAt: user.created_at,
        username: null,
      }));
  }, [user]);

  if (!profile) return (
    <DashboardLayout title="Profile Settings">
      <div className="empty-state"><span className="spinner" /></div>
    </DashboardLayout>
  );

  const showUsernameBanner = profile && !profile.username && !usernameBannerDismissed && !authProfile?.username;

  return (
    <DashboardLayout title="Profile Settings">
      <div className="profile-wrap">
        {toast && (
          <Toast type={toast.type} message={toast.message} onDone={() => setToast(null)} />
        )}

        {showUsernameBanner && (
          <div className="username-banner">
            <Info size={16} weight="fill" />
            <span>Set a username so others can find and mention you — it only takes a second.</span>
            <button className="btn-primary-sm" style={{ marginLeft: "auto" }} onClick={() => {
              document.getElementById("username-field")?.focus();
            }}>Set Username</button>
            <button className="username-banner-close" onClick={dismissUsernameBanner} title="Dismiss">
              <XCircle size={16} />
            </button>
          </div>
        )}

        <AvatarSection
          profile={profile}
          onUpdate={updates => setProfile(p => ({ ...p, ...updates }))}
          notify={notify}
        />
        <PersonalInfoSection
          profile={profile}
          onUpdate={updates => setProfile(p => ({ ...p, ...updates }))}
          notify={notify}
        />
        <PlanStorageSection plan={plan} navigate={navigate} />
        <AccountSection profile={profile} />
        <NotificationsSection
          prefs={notificationPrefs}
          onChange={(key, val) => setNotificationPrefs(p => ({ ...p, [key]: val }))}
          notify={notify}
        />
        <PasswordSection notify={notify} />
        <DangerSection notify={notify} navigate={navigate} />
      </div>
    </DashboardLayout>
  );
}

/* ── Avatar section ─────────────────────────── */
function AvatarSection({ profile, onUpdate, notify }) {
  const fileRef   = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState(profile.avatarUrl);

  useEffect(() => { setPreview(profile.avatarUrl); }, [profile.avatarUrl]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { notify("error", "Image must be under 2 MB."); return; }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const base64 = await toBase64(file);
      const ext = file.name.split(".").pop().toLowerCase() || "jpg";
      const data = await userApiFetch("/api/user/avatar", {
        method: "POST",
        body: JSON.stringify({ base64, extension: ext }),
      });
      onUpdate({ avatarUrl: data.avatarUrl });
      notify("success", "Profile photo updated.");
    } catch (err) {
      notify("error", err.message || "Upload failed.");
      setPreview(profile.avatarUrl); // revert preview
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await userApiFetch("/api/user/avatar", { method: "DELETE" });
      setPreview(null);
      onUpdate({ avatarUrl: null });
      notify("success", "Profile photo removed.");
    } catch (err) {
      notify("error", err.message);
    } finally {
      setUploading(false);
    }
  }

  const displayName = profile.name || profile.email || "";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Section title="Profile Photo" description="Upload a photo to personalise your account. Max 2 MB.">
      <div className="avatar-row">
        <div className="avatar-lg">
          {preview
            ? <img src={preview} alt={displayName} className="avatar-img" />
            : <span className="avatar-initial-lg">{initial}</span>
          }
          {uploading && <div className="avatar-uploading"><span className="spinner" /></div>}
        </div>
        <div className="avatar-actions">
          <button className="btn-primary-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Camera size={14} /> {preview ? "Change Photo" : "Upload Photo"}
          </button>
          {preview && (
            <button className="btn-ghost danger-ghost" onClick={handleRemove} disabled={uploading}>
              <Trash size={14} /> Remove
            </button>
          )}
          <p className="avatar-hint">JPG, PNG, WebP or GIF</p>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={handleFile} />
      </div>
    </Section>
  );
}

/* ── Personal info section ──────────────────── */
function PersonalInfoSection({ profile, onUpdate, notify }) {
  const [name, setName]       = useState(profile.name || "");
  const [company, setCompany] = useState(profile.company || "");
  const [saving, setSaving]   = useState(false);

  // Username state
  const [username, setUsername]         = useState(profile.username || "");
  const [unameStatus, setUnameStatus]   = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid' | 'cooldown' | 'reserved'
  const [unameMsg, setUnameMsg]         = useState("");
  const [savingUname, setSavingUname]   = useState(false);
  const debounceRef = useRef(null);

  function handleUsernameChange(e) {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(val);
    setUnameStatus(null);
    setUnameMsg("");
    clearTimeout(debounceRef.current);
    if (!val) return;
    if (val.length < 3 || val.length > 20) {
      setUnameStatus("invalid");
      setUnameMsg("3–20 characters required.");
      return;
    }
    setUnameStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await userApi.checkUsername(val);
        if (res.available) { setUnameStatus("available"); setUnameMsg("Available!"); }
        else if (res.reason === "reserved") { setUnameStatus("reserved"); setUnameMsg("That username is reserved."); }
        else { setUnameStatus("taken"); setUnameMsg("Already taken."); }
      } catch { setUnameStatus(null); }
    }, 600);
  }

  async function handleSaveUsername(e) {
    e.preventDefault();
    setSavingUname(true);
    try {
      const data = await userApi.updateProfile({ action: "username", username });
      onUpdate({ username: data.username });
      setUnameStatus("available");
      setUnameMsg("Saved!");
      notify("success", `Username set to @${data.username}`);
    } catch (err) {
      const msg = err.message || "Save failed.";
      if (msg.includes("day")) setUnameStatus("cooldown");
      else setUnameStatus("taken");
      setUnameMsg(msg);
      notify("error", msg);
    } finally {
      setSavingUname(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await userApiFetch("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify({ action: "info", name, company }),
      });
      onUpdate(data);
      notify("success", "Profile information saved.");
    } catch (err) {
      notify("error", err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const unameColor = { available: "#22c55e", taken: "#ef4444", invalid: "#f59e0b", reserved: "#f59e0b", cooldown: "#60a5fa", checking: "var(--t3)" }[unameStatus] || "var(--t3)";
  const unameIcon  = { available: <CheckCircle size={14} />, taken: <XCircle size={14} />, invalid: <Warning size={14} />, reserved: <Warning size={14} />, cooldown: <Info size={14} />, checking: <Spinner size={14} className="spinner-icon" /> }[unameStatus];
  const canSaveUname = unameStatus === "available" && username.length >= 3 && username !== (profile.username || "");

  return (
    <Section title="Personal Information" description="Update your name, username, and company details.">
      <form className="profile-form" onSubmit={handleSave}>
        <Field label="Full Name" icon={<User size={15} />}>
          <input
            className="form-input"
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
          />
        </Field>

        {/* Username field */}
        <div className="form-group">
          <label className="form-label">Username</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="form-input-wrap" style={{ flex: 1, position: "relative" }}>
              <span className="form-icon"><At size={15} /></span>
              <input
                id="username-field"
                className="form-input"
                type="text"
                placeholder="yourhandle"
                value={username}
                onChange={handleUsernameChange}
                maxLength={20}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--t3)" }}>
                {username.length}/20
              </span>
            </div>
            <button
              type="button"
              className="btn-primary-sm"
              disabled={savingUname || !canSaveUname}
              onClick={handleSaveUsername}
            >
              {savingUname ? <><span className="spinner" /> Saving…</> : "Save"}
            </button>
          </div>
          {unameStatus && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: 12, color: unameColor }}>
              {unameIcon} {unameMsg}
            </div>
          )}
          <p className="profile-hint" style={{ marginTop: 4 }}>
            Lowercase letters, numbers, underscores only. Can be changed once every 30 days.
          </p>
        </div>

        <Field label="Company / Organisation" icon={<Buildings size={15} />}>
          <input
            className="form-input"
            type="text"
            placeholder="Your company name (optional)"
            value={company}
            onChange={e => setCompany(e.target.value)}
            maxLength={120}
          />
        </Field>
        <div className="profile-form-footer">
          <button type="submit" className="btn-primary-sm" disabled={saving}>
            {saving ? <><span className="spinner" /> Saving…</> : <><FloppyDisk size={14} /> Save Changes</>}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ── Account section (email — read only) ────── */
function AccountSection({ profile }) {
  return (
    <Section title="Account Details" description="Your email address is used to sign in and cannot be changed.">
      <div className="profile-form">
        <Field label="Email Address" icon={<EnvelopeSimple size={15} />}>
          <input className="form-input" type="email" value={profile.email} readOnly />
        </Field>
        {profile.createdAt && (
          <p className="profile-hint">
            Account created on{" "}
            {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        )}
      </div>
    </Section>
  );
}

/* ── Password section ───────────────────────── */
function PasswordSection({ notify }) {
  const [newPwd,     setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [saving,     setSaving]     = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (newPwd.length < 6) { notify("error", "Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd) { notify("error", "Passwords do not match."); return; }
    setSaving(true);
    try {
      await userApiFetch("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify({ action: "password", newPassword: newPwd, confirmPassword: confirmPwd }),
      });
      notify("success", "Password updated successfully.");
      setNewPwd(""); setConfirmPwd("");
    } catch (err) {
      notify("error", err.message || "Password update failed.");
    } finally {
      setSaving(false);
    }
  }

  const strength = passwordStrength(newPwd);

  return (
    <Section title="Change Password" description="Choose a strong password with at least 6 characters.">
      <form className="profile-form" onSubmit={handleSave}>
        <Field label="New Password" icon={<Lock size={15} />}>
          <input
            className="form-input"
            type={showNew ? "text" : "password"}
            placeholder="New password"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            minLength={6}
            autoComplete="new-password"
          />
          <button type="button" className="pwd-toggle" onClick={() => setShowNew(v => !v)}>
            {showNew ? <EyeSlash size={15} /> : <Eye size={15} />}
          </button>
        </Field>

        {newPwd.length > 0 && (
          <div className="pwd-strength">
            <div className="pwd-strength-bar">
              <div className={`pwd-strength-fill s-${strength.level}`} style={{ width: `${strength.pct}%` }} />
            </div>
            <span className={`pwd-strength-label s-${strength.level}`}>{strength.label}</span>
          </div>
        )}

        <Field label="Confirm New Password" icon={<Lock size={15} />}>
          <input
            className="form-input"
            type={showConf ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            minLength={6}
            autoComplete="new-password"
          />
          <button type="button" className="pwd-toggle" onClick={() => setShowConf(v => !v)}>
            {showConf ? <EyeSlash size={15} /> : <Eye size={15} />}
          </button>
        </Field>

        <div className="profile-form-footer">
          <button type="submit" className="btn-primary-sm" disabled={saving || !newPwd || !confirmPwd}>
            {saving ? <><span className="spinner" /> Updating…</> : <><Lock size={14} /> Update Password</>}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ── Plan & Storage section ─────────────────── */
function PlanStorageSection({ plan, navigate }) {
  const planName    = plan.display_name ?? "Starter";
  const usedBytes   = plan.used_bytes   ?? 0;
  const limitBytes  = plan.limit_bytes  ?? (2 * 1024 * 1024 * 1024);
  const percentUsed = plan.percent_used ?? 0;

  const PLAN_COLORS = {
    starter:      { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "rgba(148,163,184,0.3)" },
    creator:      { bg: "rgba(124,58,237,0.12)",  color: "#a78bfa", border: "rgba(124,58,237,0.3)"  },
    professional: { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)"  },
  };
  const pc = PLAN_COLORS[planName.toLowerCase()] || PLAN_COLORS.starter;

  return (
    <Section title="Plan & Storage" description="Your current subscription and storage usage.">
      {/* Plan badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ background: pc.bg, border: `1px solid ${pc.border}`, borderRadius: "10px", padding: "10px 18px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", color: pc.color, textTransform: "uppercase", marginBottom: "2px" }}>
              Current Plan
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: pc.color }}>{planName}</div>
          </div>
          <div style={{ fontSize: "13px", color: "var(--t2)" }}>
            <div>{plan.storage_limit_gb} GB storage</div>
            <div style={{ color: "var(--t3)", fontSize: "12px", marginTop: "2px" }}>
              {plan.max_videos != null ? `${plan.max_videos} media videos` : "Unlimited videos"} ·{" "}
              {plan.max_team_members} team member{plan.max_team_members !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        {planName !== "Professional" && (
          <button className="btn-primary-sm" onClick={() => navigate("/plans")}>
            Upgrade Plan →
          </button>
        )}
      </div>

      {/* Storage meter */}
      <div style={{ background: "var(--hover)", borderRadius: "10px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500 }}>Storage Usage</span>
          <span style={{ fontSize: "12px", color: "var(--t3)" }}>
            {formatSize(usedBytes)} / {formatSize(limitBytes)}
          </span>
        </div>
        <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${percentUsed}%`,
            borderRadius: "999px",
            background: percentUsed >= 90 ? "linear-gradient(90deg,#ef4444,#f97316)"
                      : percentUsed >= 70 ? "linear-gradient(90deg,#f97316,#fbbf24)"
                      : "linear-gradient(90deg,#7c3aed,#3b82f6)",
            transition: "width 0.6s ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--t3)", marginTop: "6px" }}>
          <span style={{ display: "flex", gap: "12px" }}>
            <span>Drive: {formatSize(plan.drive_bytes ?? 0)}</span>
            <span>Media: {formatSize(plan.media_bytes ?? 0)}</span>
          </span>
          <span style={{ color: percentUsed >= 90 ? "#f87171" : percentUsed >= 70 ? "#fbbf24" : "var(--t3)", fontWeight: percentUsed >= 70 ? 600 : 400 }}>
            {percentUsed}% used
          </span>
        </div>
        {percentUsed >= 90 && (
          <div style={{ marginTop: "10px", fontSize: "12px", color: "#f87171", background: "rgba(239,68,68,0.08)", padding: "8px 12px", borderRadius: "8px" }}>
            ⚠ Your storage is almost full. Upgrade to continue uploading.
          </div>
        )}
      </div>
    </Section>
  );
}

/* ── Danger zone ────────────────────────────── */
function DangerSection({ notify, navigate }) {
  const { logout } = useAuth();
  async function handleSignOut() {
    await logout();
    navigate("/");
  }
  return (
    <Section title="Session" description="Sign out of your account on this device.">
      <button className="btn-danger" onClick={handleSignOut}>Sign Out</button>
    </Section>
  );
}

/* ── Email Notifications section ───────────── */
const NOTIFICATION_PREFS = [
  { key: "comments",       label: "Comments on my videos",  desc: "When someone comments on your files" },
  { key: "mentions",       label: "@Mentions",              desc: "When someone mentions you in a comment" },
  { key: "team_invites",   label: "Team invitations",       desc: "When you are invited to a project" },
  { key: "status_changes", label: "Status changes",         desc: "When your video is approved or needs revision" },
  { key: "shot_assigned",  label: "Shot assignments",       desc: "When a shot is assigned to you" },
  { key: "deadlines",      label: "Deadline reminders",     desc: "3 days before project due date" },
  { key: "file_uploads",   label: "File uploads",           desc: "When files are uploaded to your projects" },
];

function NotificationsSection({ prefs, onChange, notify }) {
  const [saving, setSaving] = useState(false);

  async function handleToggle(key, val) {
    onChange(key, val);
    setSaving(true);
    try {
      await userApi.updateProfile({ email_notifications: { ...prefs, [key]: val } });
    } catch {
      // Revert on failure
      onChange(key, !val);
      notify("error", "Failed to save notification preference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Email Notifications"
      description="Choose which emails you receive from Eastape."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NOTIFICATION_PREFS.map(({ key, label, desc }) => {
          const enabled = prefs[key] !== false;
          return (
            <div
              key={key}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 0", borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--t1)" }}>{label}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--t3)" }}>{desc}</p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleToggle(key, !enabled)}
                style={{
                  width: 40, height: 22, borderRadius: 999, border: "none", cursor: "pointer",
                  background: enabled ? "#7c3aed" : "rgba(255,255,255,0.1)",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                }}
                aria-checked={enabled}
                role="switch"
              >
                <span style={{
                  position: "absolute", top: 3, left: enabled ? 21 : 3,
                  width: 16, height: 16, borderRadius: "50%", background: "white",
                  transition: "left 0.2s",
                }} />
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ─── utils ─── */
function toBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = e => res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function passwordStrength(pwd) {
  if (!pwd) return { level: 0, pct: 0, label: "" };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { level: 1, pct: 25,  label: "Weak" };
  if (score <= 2) return { level: 2, pct: 50,  label: "Fair" };
  if (score <= 3) return { level: 3, pct: 75,  label: "Good" };
  return              { level: 4, pct: 100, label: "Strong" };
}
