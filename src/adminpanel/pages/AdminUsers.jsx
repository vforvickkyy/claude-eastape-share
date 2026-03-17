import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DotsThree,
  Eye,
  CreditCard,
  Key,
  Prohibit,
  CheckCircle,
  Trash,
  X,
  MagnifyingGlass,
  Export,
  CaretDown,
  UserCircle,
  File,
  VideoCamera,
  ArrowLeft,
} from "@phosphor-icons/react";
import { StatusBadge, PlanBadge } from "../components/AdminBadge";
import AdminModal from "../components/AdminModal";
import ConfirmModal from "../components/ConfirmModal";

/* ── Auth helper ─────────────────────────────────────────────── */
function getAuth() {
  const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    token: session.access_token,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
  };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;
const PER_PAGE = 20;

/* ── Audit log helper ────────────────────────────────────────── */
async function auditLog(action, targetType, targetId, metadata = {}) {
  try {
    const { headers } = getAuth();
    const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
    const adminId = session.user?.id;
    await fetch(`${BASE}/rest/v1/admin_audit_logs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ admin_id: adminId, action, target_type: targetType, target_id: targetId, metadata }),
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

/* ── Avatar initials ─────────────────────────────────────────── */
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: type === "error" ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.12)",
        border: `1px solid ${type === "error" ? "rgba(248,113,113,0.3)" : "rgba(74,222,128,0.25)"}`,
        borderRadius: "10px",
        padding: "12px 16px",
        fontSize: "13px",
        color: type === "error" ? "#f87171" : "#4ade80",
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

/* ── 3-dot action menu ───────────────────────────────────────── */
function ActionMenu({ user, onViewDetails, onChangePlan, onResetPassword, onToggleSuspend, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const items = [
    { label: "View Details", icon: <Eye size={14} />, onClick: onViewDetails },
    { label: "Change Plan", icon: <CreditCard size={14} />, onClick: onChangePlan },
    { label: "Reset Password", icon: <Key size={14} />, onClick: onResetPassword },
    {
      label: user.is_suspended ? "Unsuspend" : "Suspend",
      icon: user.is_suspended ? <CheckCircle size={14} /> : <Prohibit size={14} />,
      onClick: onToggleSuspend,
      warn: !user.is_suspended,
    },
    { label: "Delete User", icon: <Trash size={14} />, onClick: onDelete, danger: true },
  ];

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
              minWidth: "170px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
            onClick={() => setOpen(false)}
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={item.onClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  width: "100%",
                  padding: "9px 14px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: item.danger
                    ? "#f87171"
                    : item.warn
                    ? "#fbbf24"
                    : "var(--t2)",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── User Detail Drawer ──────────────────────────────────────── */
function UserDetailDrawer({ user, planName, onClose, onChangePlan, onToggleSuspend, onDelete }) {
  const [fileCnt, setFileCnt] = useState("—");
  const [videoCnt, setVideoCnt] = useState("—");

  useEffect(() => {
    if (!user) return;
    const { headers } = getAuth();
    async function loadStats() {
      try {
        const [fRes, vRes] = await Promise.all([
          fetch(`${BASE}/rest/v1/shares?select=id&user_id=eq.${user.id}`, {
            headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
          }),
          fetch(`${BASE}/rest/v1/media_assets?select=id&user_id=eq.${user.id}`, {
            headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
          }),
        ]);
        const fRange = fRes.headers.get("content-range");
        const vRange = vRes.headers.get("content-range");
        setFileCnt(parseInt(fRange?.split("/")[1] || "0").toLocaleString());
        setVideoCnt(parseInt(vRange?.split("/")[1] || "0").toLocaleString());
      } catch {
        /* ignore */
      }
    }
    loadStats();
  }, [user]);

  if (!user) return null;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "420px",
        background: "var(--card)",
        borderLeft: "1px solid var(--border)",
        zIndex: 300,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "15px" }}>User Details</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t1)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t3)")}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        {/* Profile */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
          <Avatar name={user.full_name || user.email} avatarUrl={user.avatar_url} size={72} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "var(--t1)" }}>
              {user.full_name || "—"}
            </div>
            <div style={{ fontSize: "13px", color: "var(--t3)", marginTop: "3px" }}>{user.email}</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "3px" }}>
              Joined {formatDate(user.created_at)}
            </div>
          </div>
          <StatusBadge status={user.is_admin ? "admin" : user.is_suspended ? "suspended" : "active"} />
        </div>

        {/* Plan */}
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>Current Plan</div>
            <PlanBadge plan={planName || "free"} />
          </div>
          <button className="admin-action-btn" onClick={onChangePlan}>
            <CreditCard size={13} />
            Change Plan
          </button>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "14px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <File size={18} weight="duotone" style={{ color: "var(--admin-accent)" }} />
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700 }}>{fileCnt}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>Files</div>
            </div>
          </div>
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "14px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <VideoCamera size={18} weight="duotone" style={{ color: "var(--admin-accent)" }} />
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700 }}>{videoCnt}</div>
              <div style={{ fontSize: "11px", color: "var(--t3)" }}>Videos</div>
            </div>
          </div>
        </div>

        {/* User ID */}
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "20px",
          }}
        >
          <div style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            User ID
          </div>
          <div style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "monospace", wordBreak: "break-all" }}>
            {user.id}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <button
          className="admin-action-btn"
          onClick={onToggleSuspend}
          style={{
            width: "100%",
            justifyContent: "center",
            padding: "9px",
            color: user.is_suspended ? "#4ade80" : "#fbbf24",
            borderColor: user.is_suspended ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)",
          }}
        >
          {user.is_suspended ? (
            <><CheckCircle size={14} /> Unsuspend User</>
          ) : (
            <><Prohibit size={14} /> Suspend User</>
          )}
        </button>
        <button
          className="admin-action-btn danger"
          onClick={onDelete}
          style={{ width: "100%", justifyContent: "center", padding: "9px" }}
        >
          <Trash size={14} />
          Delete User
        </button>
      </div>
    </motion.div>
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
      const { headers } = getAuth();
      const res = await fetch(`${BASE}/rest/v1/user_plans`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
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
      await auditLog("change_plan", "user", user.id, { plan_id: selectedPlanId, plan_name: plan?.name });
      onSuccess?.("Plan updated to " + (plan?.name || selectedPlanId));
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminModal title="Change Plan" onClose={onClose} maxWidth="480px">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <p style={{ fontSize: "13px", color: "var(--t2)" }}>
          Select a new plan for <strong style={{ color: "var(--t1)" }}>{user.full_name || user.email}</strong>.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {plans.map((plan) => {
            const selected = selectedPlanId === plan.id;
            return (
              <label
                key={plan.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: `1px solid ${selected ? "var(--admin-accent)" : "var(--border)"}`,
                  background: selected ? "rgba(249,115,22,0.08)" : "var(--bg)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="radio"
                  name="plan"
                  value={plan.id}
                  checked={selected}
                  onChange={() => setSelectedPlanId(plan.id)}
                  style={{ accentColor: "var(--admin-accent)" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>
                    {plan.name}
                  </div>
                  {plan.price_monthly != null && (
                    <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                      ${plan.price_monthly}/month
                    </div>
                  )}
                </div>
                <PlanBadge plan={plan.name} />
              </label>
            );
          })}
        </div>

        {error && <p style={{ fontSize: "12px", color: "#f87171" }}>{error}</p>}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button className="admin-action-btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="admin-action-btn primary"
            onClick={handleConfirm}
            disabled={loading || !selectedPlanId}
            style={{ opacity: loading ? 0.7 : 1, minWidth: "100px", justifyContent: "center" }}
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

/* ── Main component ──────────────────────────────────────────── */
export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [userPlans, setUserPlans] = useState({}); // { userId: planName }
  const [planList, setPlanList] = useState([]);   // available plans

  const [selectedUser, setSelectedUser] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [actionUser, setActionUser] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [toast, setToast] = useState(null);

  const searchDebounce = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  /* ── Debounce search ─────────────────────────────────────── */
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  /* ── Fetch plan list once ────────────────────────────────── */
  useEffect(() => {
    async function loadPlans() {
      try {
        const { headers } = getAuth();
        const res = await fetch(`${BASE}/rest/v1/plans?is_active=eq.true&select=id,name,price_monthly`, { headers });
        const data = await res.json();
        if (Array.isArray(data)) setPlanList(data);
      } catch (err) {
        console.error("Plans fetch error:", err);
      }
    }
    loadPlans();
  }, []);

  /* ── Fetch user plans mapping ────────────────────────────── */
  useEffect(() => {
    async function loadUserPlans() {
      try {
        const { headers } = getAuth();
        const res = await fetch(
          `${BASE}/rest/v1/user_plans?select=user_id,plan_id,plans(name,price_monthly)&is_active=eq.true`,
          { headers }
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          const map = {};
          data.forEach((up) => {
            map[up.user_id] = { name: up.plans?.name || "Free", planId: up.plan_id };
          });
          setUserPlans(map);
        }
      } catch (err) {
        console.error("User plans fetch error:", err);
      }
    }
    loadUserPlans();
  }, []);

  /* ── Fetch users ─────────────────────────────────────────── */
  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      try {
        const { headers } = getAuth();
        const offset = (page - 1) * PER_PAGE;

        const sortColumn = sortBy === "oldest" ? "created_at" : "created_at";
        const sortDir = sortBy === "oldest" ? "asc" : "desc";

        let url = `${BASE}/rest/v1/profiles?select=id,full_name,email,avatar_url,created_at,is_suspended,is_admin`;
        url += `&order=${sortColumn}.${sortDir}`;
        url += `&limit=${PER_PAGE}&offset=${offset}`;

        if (debouncedSearch) {
          url += `&or=(full_name.ilike.*${encodeURIComponent(debouncedSearch)}*,email.ilike.*${encodeURIComponent(debouncedSearch)}*)`;
        }

        if (filterPlan === "suspended") {
          url += `&is_suspended=eq.true`;
        } else if (filterPlan === "admins") {
          url += `&is_admin=eq.true`;
        }

        const res = await fetch(url, {
          headers: { ...headers, Prefer: "count=exact", Range: `${offset}-${offset + PER_PAGE - 1}` },
        });

        const data = await res.json();
        const range = res.headers.get("content-range");
        const total = parseInt(range?.split("/")[1] || "0");

        setUsers(Array.isArray(data) ? data : []);
        setTotalCount(total);
      } catch (err) {
        console.error("Users fetch error:", err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [page, debouncedSearch, filterPlan, sortBy]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  /* ── Show toast ──────────────────────────────────────────── */
  function showToast(message, type = "success") {
    setToast({ message, type, id: Date.now() });
  }

  /* ── Toggle suspend ──────────────────────────────────────── */
  async function handleToggleSuspend(user) {
    try {
      const { headers } = getAuth();
      const newVal = !user.is_suspended;
      const res = await fetch(`${BASE}/rest/v1/profiles?id=eq.${user.id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ is_suspended: newVal }),
      });
      if (!res.ok) throw new Error("Failed to update user");
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_suspended: newVal } : u))
      );
      if (selectedUser?.id === user.id) setSelectedUser((u) => ({ ...u, is_suspended: newVal }));
      await auditLog(newVal ? "suspend_user" : "unsuspend_user", "user", user.id, {
        email: user.email,
      });
      showToast(`User ${newVal ? "suspended" : "unsuspended"}`);
    } catch (err) {
      showToast("Failed to update user", "error");
    }
  }

  /* ── Reset password ──────────────────────────────────────── */
  async function handleResetPassword(user) {
    try {
      const { headers } = getAuth();
      await fetch(`${BASE}/auth/v1/recover`, {
        method: "POST",
        headers: { ...headers },
        body: JSON.stringify({ email: user.email }),
      });
      await auditLog("reset_password", "user", user.id, { email: user.email });
      showToast("Password reset email sent");
    } catch (err) {
      showToast("Failed to send reset email", "error");
    }
  }

  /* ── Delete user ─────────────────────────────────────────── */
  async function handleDeleteUser() {
    if (!actionUser) return;
    setDeleteLoading(true);
    try {
      const { token } = getAuth();
      const res = await fetch(`${BASE}/functions/v1/admin-delete-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ userId: actionUser.id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      await auditLog("delete_user", "user", actionUser.id, { email: actionUser.email });
      setUsers((prev) => prev.filter((u) => u.id !== actionUser.id));
      setTotalCount((n) => Math.max(0, n - 1));
      setShowConfirmDelete(false);
      if (showDetail && selectedUser?.id === actionUser.id) {
        setShowDetail(false);
        setSelectedUser(null);
      }
      showToast("User deleted");
    } catch (err) {
      showToast("Failed to delete user", "error");
    } finally {
      setDeleteLoading(false);
    }
  }

  /* ── Export CSV ──────────────────────────────────────────── */
  async function handleExportCSV() {
    try {
      const { token } = getAuth();
      const res = await fetch(`${BASE}/functions/v1/admin-export-users`, {
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
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
      showToast("Export failed", "error");
    }
  }

  /* ── Open detail for user ────────────────────────────────── */
  function openDetail(user) {
    setSelectedUser(user);
    setShowDetail(true);
  }

  /* ── Open change plan ────────────────────────────────────── */
  function openChangePlan(user) {
    setActionUser(user);
    setShowChangePlan(true);
  }

  /* ── Open confirm delete ─────────────────────────────────── */
  function openDelete(user) {
    setActionUser(user);
    setShowConfirmDelete(true);
  }

  /* ── Get user status string ──────────────────────────────── */
  function getUserStatus(user) {
    if (user.is_admin) return "admin";
    if (user.is_suspended) return "suspended";
    return "active";
  }

  /* ── Pagination helpers ──────────────────────────────────── */
  function buildPageNums() {
    if (totalPages <= 1) return [];
    const pages = [];
    const delta = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        pages.push(i);
      }
    }
    const withEllipsis = [];
    let prev = null;
    for (const p of pages) {
      if (prev !== null && p - prev > 1) withEllipsis.push("…");
      withEllipsis.push(p);
      prev = p;
    }
    return withEllipsis;
  }
  const pageNums = buildPageNums();

  return (
    <div style={{ position: "relative" }}>
      {/* ── Page header ────────────────────────────────────── */}
      <div className="admin-page-title">All Users</div>
      <div className="admin-page-sub">Manage registered users and their accounts.</div>

      {/* ── Users table card ───────────────────────────────── */}
      <div className="admin-table-wrap">
        {/* Table header controls */}
        <div className="admin-table-header" style={{ flexWrap: "wrap", gap: "10px" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "280px" }}>
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
              className="admin-table-search"
              style={{ paddingLeft: "30px", width: "100%" }}
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter dropdown */}
          <div style={{ position: "relative" }}>
            <select
              value={filterPlan}
              onChange={(e) => { setFilterPlan(e.target.value); setPage(1); }}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "7px 30px 7px 12px",
                color: "var(--t1)",
                fontSize: "13px",
                outline: "none",
                appearance: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Users</option>
              <option value="suspended">Suspended</option>
              <option value="admins">Admins</option>
            </select>
            <CaretDown
              size={12}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--t3)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Sort dropdown */}
          <div style={{ position: "relative" }}>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "7px 30px 7px 12px",
                color: "var(--t1)",
                fontSize: "13px",
                outline: "none",
                appearance: "none",
                cursor: "pointer",
              }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <CaretDown
              size={12}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--t3)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Export button */}
          <button className="admin-action-btn" onClick={handleExportCSV} style={{ marginLeft: "auto" }}>
            <Export size={14} />
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Joined</th>
                <th>Status</th>
                <th style={{ width: "60px" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, ri) => (
                  <tr key={ri} className="admin-table-skeleton">
                    {[1, 2, 3, 4, 5].map((c) => (
                      <td key={c}>
                        <span
                          className="admin-table-skeleton-row"
                          style={{ width: `${50 + Math.random() * 40}%` }}
                        />
                      </td>
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
                            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--t1)" }}>
                              {user.full_name || "—"}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--t3)" }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <PlanBadge plan={plan?.name || "Free"} />
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--t2)" }}>
                        {formatDate(user.created_at)}
                      </td>
                      <td>
                        <StatusBadge status={getUserStatus(user)} />
                      </td>
                      <td>
                        <ActionMenu
                          user={user}
                          onViewDetails={() => openDetail(user)}
                          onChangePlan={() => openChangePlan(user)}
                          onResetPassword={() => handleResetPassword(user)}
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
                <button
                  className="admin-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <div className="admin-page-btns">
                  {pageNums.map((p, i) =>
                    p === "…" ? (
                      <span key={`e-${i}`} style={{ padding: "4px 6px", color: "var(--t3)", fontSize: "12px" }}>…</span>
                    ) : (
                      <button
                        key={p}
                        className={`admin-page-btn ${p === page ? "active" : ""}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
                <button
                  className="admin-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── User Detail Drawer ─────────────────────────────── */}
      <AnimatePresence>
        {showDetail && selectedUser && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetail(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 299,
              }}
            />
            <UserDetailDrawer
              user={selectedUser}
              planName={userPlans[selectedUser.id]?.name}
              onClose={() => setShowDetail(false)}
              onChangePlan={() => openChangePlan(selectedUser)}
              onToggleSuspend={() => handleToggleSuspend(selectedUser)}
              onDelete={() => openDelete(selectedUser)}
            />
          </>
        )}
      </AnimatePresence>

      {/* ── Change Plan Modal ──────────────────────────────── */}
      <AnimatePresence>
        {showChangePlan && actionUser && (
          <ChangePlanModal
            user={actionUser}
            currentPlanId={userPlans[actionUser.id]?.planId}
            plans={planList}
            onClose={() => { setShowChangePlan(false); setActionUser(null); }}
            onSuccess={(msg) => {
              showToast(msg);
              // refresh user plans
              const { headers } = getAuth();
              fetch(`${BASE}/rest/v1/user_plans?select=user_id,plan_id,plans(name,price_monthly)&is_active=eq.true`, { headers })
                .then((r) => r.json())
                .then((data) => {
                  if (Array.isArray(data)) {
                    const map = {};
                    data.forEach((up) => { map[up.user_id] = { name: up.plans?.name || "Free", planId: up.plan_id }; });
                    setUserPlans(map);
                  }
                })
                .catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Confirm Delete Modal ───────────────────────────── */}
      <AnimatePresence>
        {showConfirmDelete && actionUser && (
          <ConfirmModal
            title="Delete User"
            message="This will permanently delete the user and all their data. This action cannot be undone."
            confirmLabel="Delete User"
            loading={deleteLoading}
            onConfirm={handleDeleteUser}
            onClose={() => { if (!deleteLoading) { setShowConfirmDelete(false); setActionUser(null); } }}
          />
        )}
      </AnimatePresence>

      {/* ── Toast ──────────────────────────────────────────── */}
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
