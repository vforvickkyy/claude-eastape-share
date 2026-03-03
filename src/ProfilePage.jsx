import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Trash, User, Buildings, EnvelopeSimple, Lock,
  CheckCircle, Warning, Eye, EyeSlash, FloppyDisk,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import { userApiFetch } from "./lib/userApi";

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
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  const [profile, setProfile] = useState(null);
  const [toast, setToast]     = useState(null); // { type: "success"|"error", message }

  function notify(type, message) { setToast({ type, message }); }

  // Load fresh profile data from server
  useEffect(() => {
    if (!user) return;
    userApiFetch("/api/user/profile")
      .then(d => setProfile(d))
      .catch(() => setProfile({
        email: user.email,
        name:  user.user_metadata?.full_name || "",
        company: user.user_metadata?.company || "",
        avatarUrl: user.user_metadata?.avatar_url || null,
        createdAt: user.created_at,
      }));
  }, [user]);

  if (!profile) return (
    <DashboardLayout title="Profile Settings">
      <div className="empty-state"><span className="spinner" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title="Profile Settings">
      <div className="profile-wrap">
        {toast && (
          <Toast type={toast.type} message={toast.message} onDone={() => setToast(null)} />
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
        <AccountSection profile={profile} />
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

  return (
    <Section title="Personal Information" description="Update your name and company details.">
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
