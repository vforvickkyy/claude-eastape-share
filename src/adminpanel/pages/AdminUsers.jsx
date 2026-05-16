import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import UserDetailPanel from "../components/UserDetailPanel";
import {
  DotsThree,
  Eye,
  CreditCard,
  Link as LinkIcon,
  Key,
  Warning,
  CheckCircle,
  Prohibit,
  Trash,
  X,
  MagnifyingGlass,
  Export,
  CaretDown,
  UserCircle,
  File,
  VideoCamera,
  Plus,
  EyeSlash,
} from "@phosphor-icons/react";
import { StatusBadge, PlanBadge } from "../components/AdminBadge";

/* ── Constants ───────────────────────────────────────────────── */
const BASE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PER_PAGE = 20;

/* ── Auth helper ─────────────────────────────────────────────── */
function getAuth() {
  const s = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return { token: s.access_token, userId: s.user?.id };
}

/* ── Edge function fetch ─────────────────────────────────────── */
async function apiFetch(path, opts = {}) {
  const { token } = getAuth();
  const res = await fetch(`${BASE_FN}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ── Audit log helper ────────────────────────────────────────── */
async function auditLog(action, targetId, metadata = {}) {
  try {
    const { token, userId: adminId } = getAuth();
    await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_logs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        admin_id: adminId,
        action,
        target_type: "user",
        target_id: String(targetId),
        metadata,
      }),
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

/* ── Format date ─────────────────────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Format relative time ────────────────────────────────────── */
function formatRelative(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

/* ── Avatar ──────────────────────────────────────────────────── */
function Avatar({ name, avatarUrl, size = 32 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
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
        fontSize: size * 0.38,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

/* ── Toast ───────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const colors = {
    success: { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.25)", text: "#4ade80" },
    error:   { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.3)", text: "#f87171" },
    info:    { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.25)", text: "#60a5fa" },
  };
  const c = colors[type] || colors.success;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: "10px",
        padding: "12px 16px",
        fontSize: "13px",
        color: c.text,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        maxWidth: "320px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <CheckCircle size={16} weight="bold" />
      {message}
    </motion.div>
  );
}

/* ── Spinner ─────────────────────────────────────────────────── */
function Spinner({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: "spin 0.75s linear infinite", flexShrink: 0 }}
    >
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

/* ── Modal wrapper ───────────────────────────────────────────── */
function Modal({ title, onClose, children, maxWidth = "520px" }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="admin-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="admin-modal-card"
        style={{ maxWidth, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <span>{title}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex", padding: "2px", borderRadius: "6px" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t1)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t3)")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </motion.div>
    </div>
  );
}

/* ── 3-dot action menu ───────────────────────────────────────── */
function ActionMenu({ user, onViewDetails, onChangePlan, onSendMagicLink, onResetPassword, onToggleSuspend, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        className="admin-action-btn"
        onClick={() => setOpen((v) => !v)}
        style={{ padding: "5px 8px" }}
        aria-label="Actions"
      >
        <DotsThree size={16} weight="bold" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 4px)",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              overflow: "hidden",
              zIndex: 200,
              minWidth: "180px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
            onClick={() => setOpen(false)}
          >
            {[
              { label: "View Details",   icon: <Eye size={14} />,      onClick: onViewDetails },
              { label: "Change Plan",    icon: <CreditCard size={14} />, onClick: onChangePlan },
              { label: "Send Magic Link",icon: <LinkIcon size={14} />,  onClick: onSendMagicLink },
              { label: "Reset Password", icon: <Key size={14} />,       onClick: onResetPassword },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.onClick}
                style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--t2)", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {item.icon}{item.label}
              </button>
            ))}
            <div style={{ height: "1px", background: "var(--border)", margin: "4px 0" }} />
            <button
              onClick={onToggleSuspend}
              style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: user.is_suspended ? "#4ade80" : "#fbbf24", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {user.is_suspended ? <CheckCircle size={14} /> : <Warning size={14} />}
              {user.is_suspended ? "Unsuspend User" : "Suspend User"}
            </button>
            <div style={{ height: "1px", background: "var(--border)", margin: "4px 0" }} />
            <button
              onClick={onDelete}
              style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#f87171", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Trash size={14} />Delete User
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Add User Modal ──────────────────────────────────────────── */
function AddUserModal({ plans, onClose, onSuccess }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [planId, setPlanId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) return setError("Full name is required.");
    if (!email.trim()) return setError("Email is required.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      await apiFetch("/admin-create-user", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name: fullName, plan_id: planId || null, is_admin: isAdmin }),
      });
      onSuccess("User created successfully");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "var(--t1)",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = { fontSize: "12px", color: "var(--t3)", marginBottom: "5px", display: "block" };

  return (
    <Modal title="Add New User" onClose={onClose} maxWidth="480px">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={labelStyle}>Full Name *</label>
          <input style={inputStyle} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required />
        </div>
        <div>
          <label style={labelStyle}>Email *</label>
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" required />
        </div>
        <div>
          <label style={labelStyle}>Password * (min 8 chars)</label>
          <div style={{ position: "relative" }}>
            <input
              style={{ ...inputStyle, paddingRight: "38px" }}
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex" }}
            >
              {showPw ? <EyeSlash size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Confirm Password *</label>
          <input
            style={inputStyle}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <div>
          <label style={labelStyle}>Plan</label>
          <select
            style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="">— No plan (Free) —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.price_monthly != null ? ` ($${p.price_monthly}/mo)` : ""}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label style={{ ...labelStyle, marginBottom: 0, flex: 1, cursor: "pointer" }}>Admin access</label>
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            style={{ accentColor: "var(--admin-accent)", width: "16px", height: "16px", cursor: "pointer" }}
          />
        </div>

        {error && (
          <p style={{ fontSize: "12px", color: "#f87171", margin: 0, padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: "6px" }}>
            {error}
          </p>
        )}

        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button type="button" className="admin-action-btn" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="submit" className="admin-action-btn primary" disabled={loading} style={{ minWidth: "110px", justifyContent: "center" }}>
            {loading ? <><Spinner size={13} /> Creating…</> : "Create User"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Magic Link Modal ────────────────────────────────────────── */
function MagicLinkModal({ email, link, onClose }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback */
    }
  }

  return (
    <Modal title="Magic Link Generated" onClose={onClose} maxWidth="480px">
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <p style={{ fontSize: "13px", color: "var(--t2)", margin: 0 }}>
          Magic link generated for <strong style={{ color: "var(--t1)" }}>{email}</strong>:
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            readOnly
            value={link}
            style={{
              flex: 1,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "8px 12px",
              color: "var(--t2)",
              fontSize: "12px",
              outline: "none",
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          />
          <button className="admin-action-btn primary" onClick={handleCopy} style={{ flexShrink: 0 }}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: "12px", color: "var(--t3)", margin: 0 }}>
          This link expires in 1 hour.
        </p>
        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button className="admin-action-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Reset Password Modal ────────────────────────────────────── */
function ResetPasswordModal({ user, onClose, onSuccess }) {
  const [tab, setTab] = useState("link");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkResult, setLinkResult] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");

  const inputStyle = {
    width: "100%",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "var(--t1)",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };

  async function handleGenerateLink() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/admin-reset-password", {
        method: "POST",
        body: JSON.stringify({ email: user.email, user_id: user.id, mode: "link" }),
      });
      setLinkResult(data.link || data.reset_link || data.action_link || "");
      await auditLog("send_reset_link", user.id, { email: user.email });
      onSuccess("Reset link generated");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(linkResult);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function handleForceReset(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters.");
    if (newPassword !== confirmPw) return setError("Passwords do not match.");
    if (resetConfirm !== "RESET") return setError('Type "RESET" to confirm.');

    setLoading(true);
    try {
      await apiFetch("/admin-reset-password", {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, mode: "force", new_password: newPassword }),
      });
      await auditLog("force_reset_password", user.id, { email: user.email });
      onSuccess("Password updated");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const tabBtnStyle = (active) => ({
    flex: 1,
    padding: "8px",
    background: active ? "var(--admin-accent-bg)" : "none",
    border: "none",
    borderBottom: `2px solid ${active ? "var(--admin-accent)" : "transparent"}`,
    color: active ? "var(--admin-accent)" : "var(--t3)",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <Modal title="Reset Password" onClose={onClose} maxWidth="480px">
      <div style={{ display: "flex", marginBottom: "20px", borderBottom: "1px solid var(--border)" }}>
        <button style={tabBtnStyle(tab === "link")} onClick={() => setTab("link")}>Send Reset Link</button>
        <button style={tabBtnStyle(tab === "force")} onClick={() => setTab("force")}>Set New Password</button>
      </div>

      {tab === "link" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ fontSize: "13px", color: "var(--t2)", margin: 0 }}>
            Generate a password reset link for <strong style={{ color: "var(--t1)" }}>{user.email}</strong>.
          </p>
          {!linkResult ? (
            <button className="admin-action-btn primary" onClick={handleGenerateLink} disabled={loading} style={{ justifyContent: "center" }}>
              {loading ? <><Spinner size={13} /> Generating…</> : "Generate Reset Link"}
            </button>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <input readOnly value={linkResult} style={{ ...inputStyle, fontFamily: "monospace", fontSize: "11px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
              <button className="admin-action-btn primary" onClick={handleCopyLink} style={{ flexShrink: 0 }}>
                {linkCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
          {error && <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>{error}</p>}
          <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
            <button className="admin-action-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      )}

      {tab === "force" && (
        <form onSubmit={handleForceReset} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#fbbf24" }}>
            This will immediately change the user's password and invalidate all active sessions.
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "5px", display: "block" }}>New Password *</label>
            <input style={inputStyle} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" required />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "5px", display: "block" }}>Confirm Password *</label>
            <input style={inputStyle} type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repeat password" required />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "5px", display: "block" }}>Type <strong style={{ color: "var(--t1)" }}>RESET</strong> to confirm</label>
            <input style={inputStyle} type="text" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="RESET" />
          </div>
          {error && <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>{error}</p>}
          <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
            <button type="button" className="admin-action-btn" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              type="submit"
              disabled={loading || resetConfirm !== "RESET"}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", borderRadius: "8px", border: "none", cursor: resetConfirm !== "RESET" || loading ? "not-allowed" : "pointer",
                background: resetConfirm !== "RESET" || loading ? "rgba(248,113,113,0.15)" : "rgba(248,113,113,0.25)",
                color: "#f87171", fontSize: "13px", fontWeight: 500, opacity: resetConfirm !== "RESET" || loading ? 0.6 : 1,
              }}
            >
              {loading ? <Spinner size={13} /> : <Key size={14} />}
              Force Reset Password
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ── Change Plan Modal ───────────────────────────────────────── */
function ChangePlanModal({ user, currentPlanId, plans, onClose, onSuccess }) {
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!selectedPlanId) return;
    setLoading(true);
    setError("");
    try {
      const { token } = getAuth();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?on_conflict=user_id`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: user.id,
          plan_id: selectedPlanId,
          is_active: true,
          started_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to update plan");
      }
      const plan = plans.find((p) => p.id === selectedPlanId);
      await auditLog("change_plan", user.id, { plan_id: selectedPlanId, plan_name: plan?.name });
      onSuccess("Plan updated to " + (plan?.name || selectedPlanId), { userId: user.id, planId: selectedPlanId, planName: plan?.name || "" });
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Change Plan" onClose={onClose} maxWidth="480px">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <p style={{ fontSize: "13px", color: "var(--t2)", margin: 0 }}>
          Select a new plan for <strong style={{ color: "var(--t1)" }}>{user.full_name || user.email}</strong>.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {plans.map((plan) => {
            const selected = selectedPlanId === plan.id;
            return (
              <label
                key={plan.id}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  padding: "12px 16px", borderRadius: "10px", cursor: "pointer",
                  border: `1px solid ${selected ? "var(--admin-accent)" : "var(--border)"}`,
                  background: selected ? "rgba(249,115,22,0.08)" : "var(--bg)",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="radio" name="plan" value={plan.id}
                  checked={selected} onChange={() => setSelectedPlanId(plan.id)}
                  style={{ accentColor: "var(--admin-accent)" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>{plan.name}</div>
                  {plan.price_monthly != null && (
                    <div style={{ fontSize: "12px", color: "var(--t3)" }}>${plan.price_monthly}/month</div>
                  )}
                </div>
                <PlanBadge plan={plan.name} />
              </label>
            );
          })}
        </div>
        {error && <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>{error}</p>}
        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button className="admin-action-btn" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="admin-action-btn primary"
            onClick={handleConfirm}
            disabled={loading || !selectedPlanId}
            style={{ opacity: loading ? 0.7 : 1, minWidth: "100px", justifyContent: "center" }}
          >
            {loading ? <><Spinner size={13} /> Saving…</> : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Delete Confirm Modal ────────────────────────────────────── */
function DeleteConfirmModal({ user, onClose, onConfirm }) {
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const matches = emailInput === user.email;

  async function handleDelete() {
    if (!matches) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch("/admin-delete-user", {
        method: "POST",
        body: JSON.stringify({ userId: user.id }),
      });
      await auditLog("delete_user", user.id, { email: user.email });
      onConfirm(user.id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Delete User" onClose={loading ? undefined : onClose} maxWidth="420px">
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "8px" }}>
          <Warning size={18} weight="bold" style={{ color: "#f87171", flexShrink: 0 }} />
          <p style={{ fontSize: "13px", color: "var(--t2)", margin: 0, lineHeight: 1.5 }}>
            This will permanently delete <strong style={{ color: "var(--t1)" }}>{user.full_name || user.email}</strong> and all their data. This cannot be undone.
          </p>
        </div>
        <div>
          <label style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "5px", display: "block" }}>
            Type <strong style={{ color: "var(--t1)" }}>{user.email}</strong> to confirm
          </label>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={user.email}
            style={{ width: "100%", background: "var(--bg)", border: `1px solid ${matches ? "rgba(248,113,113,0.5)" : "var(--border)"}`, borderRadius: "8px", padding: "8px 12px", color: "var(--t1)", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        {error && <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>{error}</p>}
        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button className="admin-action-btn" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="admin-action-btn danger"
            onClick={handleDelete}
            disabled={!matches || loading}
            style={{ minWidth: "110px", justifyContent: "center", opacity: !matches || loading ? 0.5 : 1, cursor: !matches || loading ? "not-allowed" : "pointer" }}
          >
            {loading ? <><Spinner size={13} /> Deleting…</> : <><Trash size={14} /> Delete User</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── User Detail Drawer ──────────────────────────────────────── */
function UserDetailDrawer({ user, planName, planId, plans, onClose, onChangePlan, onToggleSuspend, onDelete, onSuccess }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [fileCnt, setFileCnt] = useState("—");
  const [videoCnt, setVideoCnt] = useState("—");
  const [files, setFiles] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);

  useEffect(() => {
    if (!user) return;
    const { token } = getAuth();
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    };

    async function loadCounts() {
      try {
        const [fRes, vRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/shares?select=id&user_id=eq.${user.id}`, {
            headers: { ...authHeaders, Prefer: "count=exact", Range: "0-0" },
          }),
          fetch(`${SUPABASE_URL}/rest/v1/media_assets?select=id&user_id=eq.${user.id}`, {
            headers: { ...authHeaders, Prefer: "count=exact", Range: "0-0" },
          }),
        ]);
        const fRange = fRes.headers.get("content-range");
        const vRange = vRes.headers.get("content-range");
        setFileCnt(parseInt(fRange?.split("/")[1] || "0").toLocaleString());
        setVideoCnt(parseInt(vRange?.split("/")[1] || "0").toLocaleString());
      } catch { /* ignore */ }
    }
    loadCounts();
  }, [user]);

  useEffect(() => {
    if (activeTab !== "files" || !user) return;
    setLoadingFiles(true);
    const { token } = getAuth();
    fetch(`${SUPABASE_URL}/rest/v1/shares?user_id=eq.${user.id}&select=id,filename,file_size,created_at&order=created_at.desc&limit=20`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    })
      .then((r) => r.json())
      .then((d) => setFiles(Array.isArray(d) ? d : []))
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false));
  }, [activeTab, user]);

  useEffect(() => {
    if (activeTab !== "videos" || !user) return;
    setLoadingVideos(true);
    const { token } = getAuth();
    fetch(`${SUPABASE_URL}/rest/v1/media_assets?user_id=eq.${user.id}&select=id,name,bunny_video_status,created_at&order=created_at.desc&limit=20`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    })
      .then((r) => r.json())
      .then((d) => setVideos(Array.isArray(d) ? d : []))
      .catch(() => setVideos([]))
      .finally(() => setLoadingVideos(false));
  }, [activeTab, user]);

  if (!user) return null;

  const tabBtnStyle = (active) => ({
    flex: 1,
    padding: "8px 12px",
    background: "none",
    border: "none",
    borderBottom: `2px solid ${active ? "var(--admin-accent)" : "transparent"}`,
    color: active ? "var(--admin-accent)" : "var(--t3)",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  function formatBytes(bytes) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "420px", background: "#0d1320", borderLeft: "1px solid var(--border)",
        zIndex: 300, display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: "15px" }}>User Details</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex" }}>
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Profile block */}
        <div style={{ padding: "24px 20px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <Avatar name={user.full_name || user.email} avatarUrl={user.avatar_url} size={72} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "var(--t1)" }}>{user.full_name || "—"}</div>
            <div style={{ fontSize: "13px", color: "var(--t3)", marginTop: "3px" }}>{user.email}</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "3px" }}>Joined {formatDate(user.created_at)}</div>
          </div>
          <StatusBadge status={user.is_admin ? "admin" : user.is_suspended ? "suspended" : "active"} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: "16px" }}>
          <button style={tabBtnStyle(activeTab === "overview")} onClick={() => setActiveTab("overview")}>Overview</button>
          <button style={tabBtnStyle(activeTab === "files")} onClick={() => setActiveTab("files")}>Files</button>
          <button style={tabBtnStyle(activeTab === "videos")} onClick={() => setActiveTab("videos")}>Videos</button>
        </div>

        {/* Tab content */}
        <div style={{ padding: "0 20px 20px" }}>
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Plan */}
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>Current Plan</div>
                  <PlanBadge plan={planName || "free"} />
                </div>
                <button className="admin-action-btn" onClick={onChangePlan}><CreditCard size={13} /> Change Plan</button>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { icon: <File size={18} weight="duotone" style={{ color: "var(--admin-accent)" }} />, value: fileCnt, label: "Files" },
                  { icon: <VideoCamera size={18} weight="duotone" style={{ color: "var(--admin-accent)" }} />, value: videoCnt, label: "Videos" },
                ].map((stat) => (
                  <div key={stat.label} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
                    {stat.icon}
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: 700 }}>{stat.value}</div>
                      <div style={{ fontSize: "11px", color: "var(--t3)" }}>{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Meta */}
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Last Sign In", value: formatRelative(user.last_sign_in_at) },
                  { label: "Email Confirmed", value: user.email_confirmed_at ? formatDate(user.email_confirmed_at) : "Not confirmed" },
                  { label: "User ID", value: user.id, mono: true },
                ].map((row) => (
                  <div key={row.label}>
                    <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{row.label}</div>
                    <div style={{ fontSize: row.mono ? "11px" : "13px", color: "var(--t2)", fontFamily: row.mono ? "monospace" : undefined, wordBreak: "break-all" }}>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "files" && (
            <div>
              {loadingFiles ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--t3)", fontSize: "13px" }}>Loading…</div>
              ) : files.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--t3)", fontSize: "13px" }}>No files found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {files.map((f) => (
                    <div key={f.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "13px", color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename || "Unnamed"}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{formatDate(f.created_at)}</div>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--t3)", flexShrink: 0, marginLeft: "8px" }}>{formatBytes(f.file_size)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "videos" && (
            <div>
              {loadingVideos ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--t3)", fontSize: "13px" }}>Loading…</div>
              ) : videos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--t3)", fontSize: "13px" }}>No videos found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {videos.map((v) => (
                    <div key={v.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "13px", color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name || "Unnamed"}</div>
                        <div style={{ fontSize: "11px", color: "var(--t3)" }}>{formatDate(v.created_at)}</div>
                      </div>
                      <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--t3)", flexShrink: 0, marginLeft: "8px" }}>
                        {v.bunny_video_status || "unknown"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
        <button
          className="admin-action-btn"
          onClick={onToggleSuspend}
          style={{ width: "100%", justifyContent: "center", padding: "9px", color: user.is_suspended ? "#4ade80" : "#fbbf24", borderColor: user.is_suspended ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)" }}
        >
          {user.is_suspended ? <><CheckCircle size={14} /> Unsuspend User</> : <><Prohibit size={14} /> Suspend User</>}
        </button>
        <button className="admin-action-btn danger" onClick={onDelete} style={{ width: "100%", justifyContent: "center", padding: "9px" }}>
          <Trash size={14} />Delete User
        </button>
      </div>
    </motion.div>
  );
}

/* ── Main component ──────────────────────────────────────────── */
export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  const [userPlans, setUserPlans] = useState({}); // { userId: { name, planId } }
  const [planList, setPlanList] = useState([]);

  /* Modal states */
  const [showAddUser, setShowAddUser] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [actionUser, setActionUser] = useState(null);
  const [magicLinkData, setMagicLinkData] = useState({ email: "", link: "" });

  const [toast, setToast] = useState(null);
  const searchDebounce = useRef(null);

  /* ── Debounce search ────────────────────────────────────────── */
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  /* ── Fetch plans ────────────────────────────────────────────── */
  useEffect(() => {
    const { token } = getAuth();
    fetch(`${SUPABASE_URL}/rest/v1/plans?is_active=eq.true&select=id,name,price_monthly&order=price_monthly.asc`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setPlanList(d); })
      .catch(() => {});
  }, []);

  /* ── Fetch users via edge function ──────────────────────────── */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(
        `/admin-get-users?page=${page}&limit=${PER_PAGE}&search=${encodeURIComponent(debouncedSearch)}&filter=${filter}&sort=${sort}`
      );
      setUsers(Array.isArray(data.users) ? data.users : []);
      setTotalCount(data.total || 0);

      /* Build plan map from embedded plan data if available */
      if (Array.isArray(data.users)) {
        const map = {};
        data.users.forEach((u) => {
          if (u.plan_id || u.plan_name) {
            map[u.id] = { name: u.plan_name || "Free", planId: u.plan_id || "" };
          }
        });
        if (Object.keys(map).length > 0) {
          setUserPlans((prev) => ({ ...prev, ...map }));
        }
      }
    } catch (err) {
      console.error("Users fetch error:", err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filter, sort]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /* ── Refresh user plans map ─────────────────────────────────── */
  async function refreshUserPlans() {
    try {
      const { token } = getAuth();
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_plans?select=user_id,plan_id,plans(name,price_monthly)&is_active=eq.true`,
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } }
      );
      const d = await r.json();
      if (Array.isArray(d)) {
        const map = {};
        d.forEach((up) => { map[up.user_id] = { name: up.plans?.name || "Free", planId: up.plan_id }; });
        setUserPlans(map);
      }
    } catch { /* ignore */ }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  /* ── Toast helper ───────────────────────────────────────────── */
  function showToast(message, type = "success") {
    setToast({ message, type, id: Date.now() });
  }

  /* ── Toggle suspend ─────────────────────────────────────────── */
  async function handleToggleSuspend(user) {
    try {
      const { token } = getAuth();
      const newVal = !user.is_suspended;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ is_suspended: newVal }),
      });
      if (!res.ok) throw new Error("Failed to update user");
      const update = (u) => u.id === user.id ? { ...u, is_suspended: newVal } : u;
      setUsers((prev) => prev.map(update));
      if (selectedUser?.id === user.id) setSelectedUser((u) => ({ ...u, is_suspended: newVal }));
      await auditLog(newVal ? "suspend_user" : "unsuspend_user", user.id, { email: user.email });
      showToast(`User ${newVal ? "suspended" : "unsuspended"}`);
    } catch {
      showToast("Failed to update user", "error");
    }
  }

  /* ── Send magic link ────────────────────────────────────────── */
  async function handleSendMagicLink(user) {
    try {
      const data = await apiFetch("/admin-send-magic-link", {
        method: "POST",
        body: JSON.stringify({ email: user.email, user_id: user.id }),
      });
      await auditLog("send_magic_link", user.id, { email: user.email });
      setMagicLinkData({ email: user.email, link: data.link || data.magic_link || data.action_link || "" });
      setShowMagicLink(true);
    } catch (err) {
      showToast("Failed to generate magic link: " + err.message, "error");
    }
  }

  /* ── Export CSV ─────────────────────────────────────────────── */
  async function handleExportCSV() {
    try {
      const { token } = getAuth();
      const res = await fetch(`${BASE_FN}/admin-export-users`, {
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eastape-users-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("CSV exported");
    } catch (err) {
      showToast("Export failed: " + err.message, "error");
    }
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  function openDetail(user) { setSelectedUser(user); setShowDetail(true); }
  function openChangePlan(user) { setActionUser(user); setShowChangePlan(true); }
  function openResetPw(user) { setActionUser(user); setShowResetPw(true); }
  function openDelete(user) { setActionUser(user); setShowDelete(true); }

  function getUserStatus(user) {
    if (user.is_admin) return "admin";
    if (user.is_suspended) return "suspended";
    return "active";
  }

  /* ── Pagination page numbers ─────────────────────────────────── */
  function buildPageNums() {
    if (totalPages <= 1) return [];
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) pages.push(i);
    }
    const out = [];
    let prev = null;
    for (const p of pages) {
      if (prev !== null && p - prev > 1) out.push("…");
      out.push(p);
      prev = p;
    }
    return out;
  }
  const pageNums = buildPageNums();

  const selectStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "7px 30px 7px 12px",
    color: "var(--t1)",
    fontSize: "13px",
    outline: "none",
    appearance: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ position: "relative" }}>
      {/* ── Page header ──────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "4px", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div className="admin-page-title">All Users</div>
          <div className="admin-page-sub">Manage registered users and their accounts.</div>
        </div>
        <button
          className="admin-action-btn primary"
          onClick={() => setShowAddUser(true)}
          style={{ flexShrink: 0, marginTop: "2px" }}
        >
          <Plus size={14} weight="bold" /> Add User
        </button>
      </div>

      {/* ── Table card ───────────────────────────────────────────── */}
      <div className="admin-table-wrap">
        {/* Controls */}
        <div className="admin-table-header" style={{ flexWrap: "wrap", gap: "10px" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "280px" }}>
            <MagnifyingGlass size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }} />
            <input
              className="admin-table-search"
              style={{ paddingLeft: "30px", width: "100%", boxSizing: "border-box" }}
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter */}
          <div style={{ position: "relative" }}>
            <select style={selectStyle} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
              <option value="all">All Users</option>
              <option value="suspended">Suspended</option>
              <option value="admins">Admins</option>
            </select>
            <CaretDown size={12} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }} />
          </div>

          {/* Sort */}
          <div style={{ position: "relative" }}>
            <select style={selectStyle} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <CaretDown size={12} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", pointerEvents: "none" }} />
          </div>

          <button className="admin-action-btn" onClick={handleExportCSV} style={{ marginLeft: "auto" }}>
            <Export size={14} /> Export CSV
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Last Sign In</th>
                <th>Status</th>
                <th style={{ width: "60px" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, ri) => (
                  <tr key={ri} className="admin-table-skeleton">
                    {[1, 2, 3, 4, 5].map((c) => (
                      <td key={c}><span className="admin-table-skeleton-row" style={{ width: `${50 + Math.random() * 40}%` }} /></td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="admin-empty">
                      <UserCircle size={32} style={{ color: "var(--t3)" }} />
                      <span>No users found.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const plan = userPlans[user.id];
                  return (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Avatar name={user.full_name || user.email} avatarUrl={user.avatar_url} size={32} />
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)" }}>{user.full_name || "—"}</div>
                            <div style={{ fontSize: "11px", color: "var(--t3)" }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><PlanBadge plan={plan?.name || user.plan_name || "Free"} /></td>
                      <td style={{ fontSize: "12px", color: "var(--t2)" }}>{formatRelative(user.last_sign_in_at)}</td>
                      <td><StatusBadge status={getUserStatus(user)} /></td>
                      <td>
                        <ActionMenu
                          user={user}
                          onViewDetails={() => openDetail(user)}
                          onChangePlan={() => openChangePlan(user)}
                          onSendMagicLink={() => handleSendMagicLink(user)}
                          onResetPassword={() => openResetPw(user)}
                          onToggleSuspend={() => handleToggleSuspend(user)}
                          onDelete={() => openDelete(user)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && users.length > 0 && (
          <div className="admin-pagination">
            <span>
              Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, totalCount)} of {totalCount.toLocaleString()}
            </span>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button className="admin-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">‹</button>
                <div className="admin-page-btns">
                  {pageNums.map((p, i) =>
                    p === "…" ? (
                      <span key={`e-${i}`} style={{ padding: "4px 6px", color: "var(--t3)", fontSize: "12px" }}>…</span>
                    ) : (
                      <button key={p} className={`admin-page-btn${p === page ? " active" : ""}`} onClick={() => setPage(p)}>{p}</button>
                    )
                  )}
                </div>
                <button className="admin-page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="Next page">›</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals & Drawer ────────────────────────────────────────── */}
      <AnimatePresence>
        {/* Add User */}
        {showAddUser && (
          <AddUserModal
            plans={planList}
            onClose={() => setShowAddUser(false)}
            onSuccess={(msg) => { showToast(msg); loadUsers(); }}
          />
        )}

        {/* User Detail Drawer */}
        {showDetail && selectedUser && (
          <UserDetailPanel
            key="drawer"
            user={selectedUser}
            planName={userPlans[selectedUser.id]?.name}
            planId={userPlans[selectedUser.id]?.planId}
            plans={planList}
            onClose={() => setShowDetail(false)}
            onChangePlan={() => openChangePlan(selectedUser)}
            onToggleSuspend={() => handleToggleSuspend(selectedUser)}
            onDelete={() => openDelete(selectedUser)}
            onSuccess={showToast}
          />
        )}

        {/* Change Plan */}
        {showChangePlan && actionUser && (
          <ChangePlanModal
            key="change-plan"
            user={actionUser}
            currentPlanId={userPlans[actionUser.id]?.planId}
            plans={planList}
            onClose={() => { setShowChangePlan(false); setActionUser(null); }}
            onSuccess={(msg, { userId, planId, planName } = {}) => {
              showToast(msg);
              if (userId) setUserPlans((prev) => ({ ...prev, [userId]: { name: planName || "Free", planId: planId || "" } }));
              refreshUserPlans();
            }}
          />
        )}

        {/* Magic Link */}
        {showMagicLink && (
          <MagicLinkModal
            key="magic-link"
            email={magicLinkData.email}
            link={magicLinkData.link}
            onClose={() => setShowMagicLink(false)}
          />
        )}

        {/* Reset Password */}
        {showResetPw && actionUser && (
          <ResetPasswordModal
            key="reset-pw"
            user={actionUser}
            onClose={() => { setShowResetPw(false); setActionUser(null); }}
            onSuccess={(msg) => showToast(msg)}
          />
        )}

        {/* Delete */}
        {showDelete && actionUser && (
          <DeleteConfirmModal
            key="delete"
            user={actionUser}
            onClose={() => { setShowDelete(false); setActionUser(null); }}
            onConfirm={(deletedId) => {
              setUsers((prev) => prev.filter((u) => u.id !== deletedId));
              setTotalCount((n) => Math.max(0, n - 1));
              if (showDetail && selectedUser?.id === deletedId) {
                setShowDetail(false);
                setSelectedUser(null);
              }
              showToast("User deleted");
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <Toast key={toast.id} message={toast.message} type={toast.type} onDone={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
