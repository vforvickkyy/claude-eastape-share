import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck,
  ShieldSlash,
  MagnifyingGlass,
  UserCircle,
  Check,
  Warning,
} from "@phosphor-icons/react";
import ConfirmModal from "../components/ConfirmModal";

/* ── Auth helper ──────────────────────────────────────────── */
function getAuth() {
  const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    token: session.access_token,
    userId: session.user?.id,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;

async function auditLog(action, targetType, targetId, metadata = {}) {
  const { userId, headers } = getAuth();
  await fetch(`${BASE}/rest/v1/admin_audit_logs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      admin_id: userId,
      action,
      target_type: targetType,
      target_id: String(targetId || ""),
      metadata,
    }),
  });
}

/* ── Helpers ──────────────────────────────────────────────── */
function formatDate(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Toast ────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  const colors = {
    success: { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)", color: "#4ade80" },
    error: { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)", color: "#f87171" },
    warn: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)", color: "#fbbf24" },
  };
  const c = colors[type] || colors.success;
  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
        padding: "10px 16px",
        borderRadius: "10px",
        fontSize: "13px",
        fontWeight: 500,
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      }}
    >
      {type === "success" ? <Check size={14} /> : <Warning size={14} />}
      {message}
    </div>
  );
}

/* ── Avatar ───────────────────────────────────────────────── */
function Avatar({ name, avatarUrl, size = 32 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
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
        fontSize: size * 0.38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {initial}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminAdmins() {
  const { userId: currentUserId } = getAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

  // Revoke
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Grant search
  const [grantQuery, setGrantQuery] = useState("");
  const [grantResults, setGrantResults] = useState([]);
  const [grantSearching, setGrantSearching] = useState(false);
  const [grantTarget, setGrantTarget] = useState(null);
  const [grantLoading, setGrantLoading] = useState(false);
  const [showGrantDropdown, setShowGrantDropdown] = useState(false);

  const [toast, setToast] = useState(null);
  const grantDebounce = useRef(null);

  function showToast(message, type = "success") {
    setToast({ message, type, id: Date.now() });
  }

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const { headers } = getAuth();
      const res = await fetch(
        `${BASE}/rest/v1/profiles?is_admin=eq.true&select=id,full_name,email,avatar_url,created_at&order=created_at.asc`,
        { headers }
      );
      const data = await res.json();
      setAdmins(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  // Revoke admin
  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      const { headers } = getAuth();
      const res = await fetch(
        `${BASE}/rest/v1/profiles?id=eq.${revokeTarget.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ is_admin: false }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      await auditLog(`Revoked admin access from ${revokeTarget.email}`, "user", revokeTarget.id);
      showToast(`Admin access revoked from ${revokeTarget.full_name || revokeTarget.email}`);
      setRevokeTarget(null);
      fetchAdmins();
    } catch (e) {
      showToast("Failed to revoke admin access", "error");
    } finally {
      setRevokeLoading(false);
    }
  }

  // Search non-admin users
  useEffect(() => {
    clearTimeout(grantDebounce.current);
    if (!grantQuery.trim()) {
      setGrantResults([]);
      setShowGrantDropdown(false);
      return;
    }
    grantDebounce.current = setTimeout(async () => {
      setGrantSearching(true);
      try {
        const { headers } = getAuth();
        const res = await fetch(
          `${BASE}/rest/v1/profiles?email=ilike.*${encodeURIComponent(grantQuery)}*&is_admin=eq.false&select=id,full_name,email&limit=5`,
          { headers }
        );
        const data = await res.json();
        setGrantResults(Array.isArray(data) ? data : []);
        setShowGrantDropdown(true);
      } catch (e) {
        setGrantResults([]);
      } finally {
        setGrantSearching(false);
      }
    }, 350);
  }, [grantQuery]);

  // Grant admin
  async function handleGrant() {
    if (!grantTarget) return;
    setGrantLoading(true);
    try {
      const { headers } = getAuth();
      const res = await fetch(
        `${BASE}/rest/v1/profiles?id=eq.${grantTarget.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ is_admin: true }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      await auditLog(`Granted admin access to ${grantTarget.email}`, "user", grantTarget.id);
      showToast(`Admin access granted to ${grantTarget.full_name || grantTarget.email}`);
      setGrantTarget(null);
      setGrantQuery("");
      setGrantResults([]);
      setShowGrantDropdown(false);
      fetchAdmins();
    } catch (e) {
      showToast("Failed to grant admin access", "error");
    } finally {
      setGrantLoading(false);
    }
  }

  return (
    <div>
      <div className="admin-page-title">Admins</div>
      <div className="admin-page-sub">Manage administrator accounts and permissions.</div>

      {/* Admins table */}
      <div className="admin-table-wrap" style={{ marginBottom: "24px" }}>
        <div className="admin-table-header">
          <div style={{ fontWeight: 600, fontSize: "14px", flex: 1 }}>Administrator Accounts</div>
          {!loading && (
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>
              {admins.length} admin{admins.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)", fontSize: "13px" }}>
            Loading…
          </div>
        ) : admins.length === 0 ? (
          <div className="admin-empty">No admins found.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Name</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const isSelf = admin.id === currentUserId;
                const isExpanded = expandedRow === admin.id;
                return (
                  <React.Fragment key={admin.id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpandedRow(isExpanded ? null : admin.id)}
                    >
                      <td style={{ width: "48px" }}>
                        <Avatar name={admin.full_name || admin.email} avatarUrl={admin.avatar_url} size={32} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: "13px" }}>
                          {admin.full_name || "—"}
                          {isSelf && (
                            <span
                              style={{
                                marginLeft: "6px",
                                fontSize: "10px",
                                fontWeight: 600,
                                background: "rgba(249,115,22,0.15)",
                                color: "#f97316",
                                padding: "1px 6px",
                                borderRadius: "20px",
                              }}
                            >
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--t2)" }}>{admin.email || "—"}</td>
                      <td style={{ fontSize: "12px", color: "var(--t2)", whiteSpace: "nowrap" }}>
                        {formatDate(admin.created_at)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {isSelf ? (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--t3)",
                              fontStyle: "italic",
                              padding: "4px 8px",
                            }}
                            title="Cannot revoke your own admin access"
                          >
                            Can't revoke yourself
                          </span>
                        ) : (
                          <button
                            className="admin-action-btn danger"
                            onClick={() => setRevokeTarget(admin)}
                          >
                            <ShieldSlash size={12} />
                            Revoke Admin
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} style={{ background: "var(--bg)", padding: "0" }}>
                          <div style={{ padding: "14px 20px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>User ID</div>
                              <div style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--t2)" }}>{admin.id}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Email</div>
                              <div style={{ fontSize: "12px", color: "var(--t1)" }}>{admin.email}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Joined</div>
                              <div style={{ fontSize: "12px", color: "var(--t1)" }}>{formatDate(admin.created_at)}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Grant Admin section */}
      <div className="admin-section">
        <div className="admin-section-title">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={16} weight="duotone" style={{ color: "#f97316" }} />
            Grant Admin Access
          </div>
        </div>
        <div className="admin-section-body">
          <p style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "14px" }}>
            Search for a non-admin user by email to grant them administrator access.
          </p>
          <div style={{ position: "relative", maxWidth: "420px" }}>
            <div style={{ position: "relative" }}>
              <MagnifyingGlass
                size={14}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--t3)",
                  pointerEvents: "none",
                }}
              />
              <input
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "9px 12px 9px 32px",
                  color: "var(--t1)",
                  fontSize: "13px",
                  outline: "none",
                }}
                placeholder="Search by email…"
                value={grantQuery}
                onChange={(e) => setGrantQuery(e.target.value)}
                onFocus={() => grantResults.length > 0 && setShowGrantDropdown(true)}
                onBlur={() => setTimeout(() => setShowGrantDropdown(false), 200)}
              />
            </div>

            {/* Dropdown results */}
            {showGrantDropdown && grantResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  zIndex: 50,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                {grantResults.map((user) => (
                  <button
                    key={user.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setGrantTarget(user);
                      setShowGrantDropdown(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Avatar name={user.full_name || user.email} size={28} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)" }}>
                        {user.full_name || "—"}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--t3)" }}>{user.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {grantSearching && (
              <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontSize: "11px" }}>
                Searching…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Revoke confirm */}
      {revokeTarget && (
        <ConfirmModal
          title="Revoke Admin Access"
          message={`Are you sure you want to revoke admin access from ${revokeTarget.full_name || revokeTarget.email}? They will lose all admin privileges immediately.`}
          confirmLabel="Revoke Admin"
          loading={revokeLoading}
          onConfirm={handleRevoke}
          onClose={() => setRevokeTarget(null)}
        />
      )}

      {/* Grant confirm */}
      {grantTarget && (
        <ConfirmModal
          title="Grant Admin Access"
          message={`Grant admin access to ${grantTarget.full_name || grantTarget.email} (${grantTarget.email})? They will gain full administrator privileges.`}
          confirmLabel="Grant Admin"
          loading={grantLoading}
          onConfirm={handleGrant}
          onClose={() => setGrantTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
