import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Users,
  Plus,
  PencilSimple,
  Trash,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  CurrencyDollar,
  ArrowsLeftRight,
  Warning,
} from "@phosphor-icons/react";
import AdminStatsCard from "../components/AdminStatsCard.jsx";
import AdminModal from "../components/AdminModal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";

/* ── Auth helpers ─────────────────────────────────────────── */
function getAuth() {
  const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    token: session.access_token,
    userId: session.user?.id,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
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
      target_id: String(targetId),
      metadata,
    }),
  });
}

/* ── Helpers ─────────────────────────────────────────────── */
const PLAN_COLORS = {
  free:     { border: "rgba(148,163,184,0.3)", label: "gray"  },
  pro:      { border: "#3b82f6",               label: "blue"  },
  business: { border: "#f59e0b",               label: "gold"  },
};

function planColor(name = "") {
  const key = name.toLowerCase();
  return PLAN_COLORS[key] || { border: "rgba(148,163,184,0.2)", label: "gray" };
}

const PRO_PRICE  = 12;
const BIZ_PRICE  = 29;

/* ── Plan Card ───────────────────────────────────────────── */
function PlanCard({ plan, userCount, onEdit, onDelete, onToggle }) {
  const color = planColor(plan.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: "var(--card)",
        border: `1px solid ${color.border}`,
        borderRadius: "14px",
        padding: "22px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Active glow bar */}
      {plan.is_active && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: color.border,
            borderRadius: "14px 14px 0 0",
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.2 }}>{plan.name}</div>
          <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "4px" }}>
            {plan.is_active ? (
              <span style={{ color: "#4ade80" }}>● Active</span>
            ) : (
              <span style={{ color: "var(--t3)" }}>○ Inactive</span>
            )}
          </div>
        </div>
        {/* User count badge */}
        <div
          style={{
            background: "rgba(249,115,22,0.12)",
            color: "#f97316",
            fontSize: "12px",
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: "999px",
            whiteSpace: "nowrap",
          }}
        >
          <Users size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} />
          {userCount} users
        </div>
      </div>

      {/* Pricing */}
      <div style={{ display: "flex", gap: "20px" }}>
        <div>
          <div style={{ fontSize: "24px", fontWeight: 700 }}>
            ${plan.price_monthly ?? 0}
            <span style={{ fontSize: "13px", color: "var(--t3)", fontWeight: 400 }}>/mo</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--t3)" }}>
            ${plan.price_yearly ?? 0}/yr
          </div>
        </div>
      </div>

      {/* Limits */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "12px",
        }}
      >
        {[
          ["Storage",    `${plan.storage_limit_gb ?? "—"} GB`],
          ["Bandwidth",  `${plan.bandwidth_limit_gb ?? "—"} GB`],
          ["Files",      plan.max_files ?? "Unlimited"],
          ["Videos",     plan.max_videos ?? "Unlimited"],
          ["Team",       plan.max_team_members ?? "—"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
            <span style={{ color: "var(--t3)" }}>{k}</span>
            <span style={{ fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Feature flags */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {[
          ["Drive",   plan.drive_enabled],
          ["Media",   plan.media_enabled],
          ["Sharing", plan.sharing_enabled],
        ].map(([label, enabled]) => (
          <span
            key={label}
            style={{
              fontSize: "11px",
              padding: "3px 8px",
              borderRadius: "999px",
              background: enabled ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
              color: enabled ? "#4ade80" : "var(--t3)",
              border: `1px solid ${enabled ? "rgba(74,222,128,0.2)" : "var(--border)"}`,
            }}
          >
            {enabled ? "✓" : "✗"} {label}
          </span>
        ))}
      </div>

      {/* Features list */}
      {Array.isArray(plan.features) && plan.features.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          {plan.features.map((f, i) => (
            <li key={i} style={{ fontSize: "12px", color: "var(--t2)", display: "flex", alignItems: "flex-start", gap: "6px" }}>
              <Check size={12} weight="bold" style={{ color: color.border, marginTop: "2px", flexShrink: 0 }} />
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <button
          className="admin-action-btn"
          onClick={() => onToggle(plan)}
          title={plan.is_active ? "Deactivate" : "Activate"}
          style={{ flex: 1, justifyContent: "center" }}
        >
          {plan.is_active ? (
            <><ToggleRight size={14} style={{ color: "#4ade80" }} /> Active</>
          ) : (
            <><ToggleLeft size={14} /> Inactive</>
          )}
        </button>
        <button className="admin-action-btn" onClick={() => onEdit(plan)}>
          <PencilSimple size={13} /> Edit
        </button>
        <button
          className="admin-action-btn danger"
          onClick={() => onDelete(plan)}
          disabled={userCount > 0}
          title={userCount > 0 ? "Cannot delete — plan has active users" : "Delete plan"}
          style={{ opacity: userCount > 0 ? 0.4 : 1, cursor: userCount > 0 ? "not-allowed" : "pointer" }}
        >
          <Trash size={13} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Plan Form Modal ─────────────────────────────────────── */
const DEFAULT_FORM = {
  name: "",
  price_monthly: 0,
  price_yearly: 0,
  storage_limit_gb: 5,
  bandwidth_limit_gb: 50,
  max_files: null,
  max_videos: null,
  max_team_members: 1,
  drive_enabled: true,
  media_enabled: false,
  sharing_enabled: true,
  features: [],
  is_active: true,
};

function PlanFormModal({ mode, plan, onClose, onSaved }) {
  const [form, setForm] = useState(mode === "edit" ? { ...DEFAULT_FORM, ...plan } : { ...DEFAULT_FORM });
  const [newFeature, setNewFeature] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function field(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addFeature() {
    const trimmed = newFeature.trim();
    if (!trimmed) return;
    setForm((f) => ({ ...f, features: [...(f.features || []), trimmed] }));
    setNewFeature("");
  }

  function removeFeature(i) {
    setForm((f) => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Plan name is required."); return; }
    setSaving(true);
    setError("");
    const { headers } = getAuth();
    const payload = {
      name: form.name.trim(),
      price_monthly: Number(form.price_monthly) || 0,
      price_yearly: Number(form.price_yearly) || 0,
      storage_limit_gb: Number(form.storage_limit_gb) || null,
      bandwidth_limit_gb: Number(form.bandwidth_limit_gb) || null,
      max_files: form.max_files ? Number(form.max_files) : null,
      max_videos: form.max_videos ? Number(form.max_videos) : null,
      max_team_members: Number(form.max_team_members) || 1,
      drive_enabled: !!form.drive_enabled,
      media_enabled: !!form.media_enabled,
      sharing_enabled: !!form.sharing_enabled,
      features: form.features || [],
      is_active: !!form.is_active,
    };
    try {
      let res;
      if (mode === "edit") {
        res = await fetch(`${BASE}/rest/v1/plans?id=eq.${plan.id}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${BASE}/rest/v1/plans`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      const savedId = Array.isArray(saved) ? saved[0]?.id : saved?.id;
      await auditLog(mode === "edit" ? "plan.updated" : "plan.created", "plan", savedId ?? plan?.id ?? "new", payload);
      onSaved();
    } catch (e) {
      setError(e.message || "Save failed.");
    } finally {
      setSaving(false);
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
  };
  const labelStyle = { fontSize: "12px", color: "var(--t3)", display: "block", marginBottom: "4px" };
  const rowStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" };

  return (
    <AdminModal
      title={mode === "edit" ? `Edit Plan — ${plan.name}` : "Create New Plan"}
      onClose={onClose}
      maxWidth="560px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Name */}
        <div>
          <label style={labelStyle}>Plan Name *</label>
          <input style={inputStyle} value={form.name} onChange={(e) => field("name", e.target.value)} placeholder="e.g. Pro" />
        </div>

        {/* Pricing */}
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Monthly Price ($)</label>
            <input style={inputStyle} type="number" min="0" value={form.price_monthly} onChange={(e) => field("price_monthly", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Yearly Price ($)</label>
            <input style={inputStyle} type="number" min="0" value={form.price_yearly} onChange={(e) => field("price_yearly", e.target.value)} />
          </div>
        </div>

        {/* Storage / Bandwidth */}
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Storage Limit (GB)</label>
            <input style={inputStyle} type="number" min="0" value={form.storage_limit_gb ?? ""} onChange={(e) => field("storage_limit_gb", e.target.value)} placeholder="e.g. 50" />
          </div>
          <div>
            <label style={labelStyle}>Bandwidth Limit (GB)</label>
            <input style={inputStyle} type="number" min="0" value={form.bandwidth_limit_gb ?? ""} onChange={(e) => field("bandwidth_limit_gb", e.target.value)} placeholder="e.g. 200" />
          </div>
        </div>

        {/* Files / Videos / Team */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Max Files</label>
            <input style={inputStyle} type="number" min="0" value={form.max_files ?? ""} onChange={(e) => field("max_files", e.target.value)} placeholder="Unlimited" />
          </div>
          <div>
            <label style={labelStyle}>Max Videos</label>
            <input style={inputStyle} type="number" min="0" value={form.max_videos ?? ""} onChange={(e) => field("max_videos", e.target.value)} placeholder="Unlimited" />
          </div>
          <div>
            <label style={labelStyle}>Team Members</label>
            <input style={inputStyle} type="number" min="1" value={form.max_team_members ?? ""} onChange={(e) => field("max_team_members", e.target.value)} placeholder="1" />
          </div>
        </div>

        {/* Feature toggles */}
        <div>
          <label style={labelStyle}>Feature Access</label>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              ["drive_enabled",   "Drive"],
              ["media_enabled",   "Media"],
              ["sharing_enabled", "Sharing"],
            ].map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", color: "var(--t2)" }}>
                <input
                  type="checkbox"
                  checked={!!form[key]}
                  onChange={(e) => field(key, e.target.checked)}
                  style={{ accentColor: "#f97316", width: "14px", height: "14px" }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Features list */}
        <div>
          <label style={labelStyle}>Features (bullet list)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
            <AnimatePresence>
              {(form.features || []).map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    fontSize: "13px",
                  }}
                >
                  <Check size={12} weight="bold" style={{ color: "#4ade80", flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "var(--t2)" }}>{f}</span>
                  <button
                    onClick={() => removeFeature(i)}
                    style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", padding: "0 2px", display: "flex" }}
                  >
                    <X size={13} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={newFeature}
              onChange={(e) => setNewFeature(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFeature()}
              placeholder="Add a feature…"
            />
            <button className="admin-action-btn primary" onClick={addFeature}>
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Active toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--t2)" }}>
          <input
            type="checkbox"
            checked={!!form.is_active}
            onChange={(e) => field("is_active", e.target.checked)}
            style={{ accentColor: "#f97316", width: "14px", height: "14px" }}
          />
          Plan is Active (visible to users)
        </label>

        {error && (
          <div style={{ fontSize: "12px", color: "#f87171", background: "rgba(248,113,113,0.08)", padding: "8px 12px", borderRadius: "6px" }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="admin-modal-footer" style={{ marginTop: "4px" }}>
        <button className="admin-action-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-action-btn primary" onClick={handleSave} disabled={saving} style={{ minWidth: "90px", justifyContent: "center" }}>
          {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Plan"}
        </button>
      </div>
    </AdminModal>
  );
}

/* ── Change Plan Modal ───────────────────────────────────── */
function ChangePlanModal({ userPlan, plans, onClose, onSaved }) {
  const [selectedPlanId, setSelectedPlanId] = useState(userPlan.plan_id);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { headers } = getAuth();
    try {
      await fetch(`${BASE}/rest/v1/user_plans?user_id=eq.${userPlan.user_id}&is_active=eq.true`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ plan_id: selectedPlanId }),
      });
      await auditLog("user_plan.changed", "user_plan", userPlan.user_id, { new_plan_id: selectedPlanId });
      onSaved();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title="Change Plan" onClose={onClose} maxWidth="380px">
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "4px" }}>
          Select a plan for <strong style={{ color: "var(--t1)" }}>{userPlan.profiles?.full_name || userPlan.profiles?.email || userPlan.user_id}</strong>:
        </div>
        {plans.map((p) => (
          <label
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "8px",
              border: `1px solid ${selectedPlanId === p.id ? "#f97316" : "var(--border)"}`,
              background: selectedPlanId === p.id ? "rgba(249,115,22,0.06)" : "var(--bg)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <input
              type="radio"
              name="plan"
              value={p.id}
              checked={selectedPlanId === p.id}
              onChange={() => setSelectedPlanId(p.id)}
              style={{ accentColor: "#f97316" }}
            />
            <span style={{ flex: 1, fontSize: "13px", fontWeight: 500 }}>{p.name}</span>
            <span style={{ fontSize: "12px", color: "var(--t3)" }}>${p.price_monthly}/mo</span>
          </label>
        ))}
      </div>
      <div className="admin-modal-footer" style={{ marginTop: "4px" }}>
        <button className="admin-action-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-action-btn primary" onClick={handleSave} disabled={saving} style={{ minWidth: "90px", justifyContent: "center" }}>
          {saving ? "Saving…" : "Update Plan"}
        </button>
      </div>
    </AdminModal>
  );
}

/* ── Main Page ───────────────────────────────────────────── */
export default function AdminPlans() {
  const [plans, setPlans]             = useState([]);
  const [userPlansAll, setUserPlansAll] = useState([]);
  const [userPlanRows, setUserPlanRows] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [editingPlan, setEditingPlan] = useState(null);      // plan object or "new"
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [deleting, setDeleting]       = useState(false);
  const [changingPlan, setChangingPlan] = useState(null);    // user_plan row

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { headers } = getAuth();
    const [pRes, upRes, upRowRes] = await Promise.all([
      fetch(`${BASE}/rest/v1/plans?order=price_monthly.asc`, { headers }),
      fetch(`${BASE}/rest/v1/user_plans?select=plan_id&is_active=eq.true`, { headers }),
      fetch(
        `${BASE}/rest/v1/user_plans?select=user_id,plan_id,started_at,plans(name),profiles(full_name,email)&is_active=eq.true&order=started_at.desc&limit=50`,
        { headers }
      ),
    ]);
    const [plansData, upData, upRowData] = await Promise.all([pRes.json(), upRes.json(), upRowRes.json()]);
    setPlans(Array.isArray(plansData) ? plansData : []);
    setUserPlansAll(Array.isArray(upData) ? upData : []);
    setUserPlanRows(Array.isArray(upRowData) ? upRowData : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* Counts per plan */
  function userCountForPlan(planId) {
    return userPlansAll.filter((up) => up.plan_id === planId).length;
  }

  /* Toggle active */
  async function handleToggle(plan) {
    const { headers } = getAuth();
    await fetch(`${BASE}/rest/v1/plans?id=eq.${plan.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ is_active: !plan.is_active }),
    });
    await auditLog("plan.toggled", "plan", plan.id, { is_active: !plan.is_active });
    fetchAll();
  }

  /* Delete */
  async function handleDeleteConfirm() {
    if (!deletingPlan) return;
    setDeleting(true);
    const { headers } = getAuth();
    await fetch(`${BASE}/rest/v1/plans?id=eq.${deletingPlan.id}`, { method: "DELETE", headers });
    await auditLog("plan.deleted", "plan", deletingPlan.id, { name: deletingPlan.name });
    setDeletingPlan(null);
    setDeleting(false);
    fetchAll();
  }

  /* Revenue calcs */
  const proCount  = plans.find((p) => p.name?.toLowerCase() === "pro")
    ? userCountForPlan(plans.find((p) => p.name?.toLowerCase() === "pro").id)
    : 0;
  const bizCount  = plans.find((p) => p.name?.toLowerCase() === "business")
    ? userCountForPlan(plans.find((p) => p.name?.toLowerCase() === "business").id)
    : 0;
  const freeCount = plans.find((p) => p.name?.toLowerCase() === "free")
    ? userCountForPlan(plans.find((p) => p.name?.toLowerCase() === "free").id)
    : 0;
  const proMRR    = proCount * PRO_PRICE;
  const bizMRR    = bizCount * BIZ_PRICE;
  const totalMRR  = proMRR + bizMRR;
  const totalPaid = proCount + bizCount;
  const totalAll  = totalPaid + freeCount;
  const paidPct   = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0;

  /* Table columns */
  const columns = [
    {
      key: "profiles",
      label: "Name",
      render: (v) => (
        <span style={{ fontWeight: 500 }}>{v?.full_name || "—"}</span>
      ),
    },
    {
      key: "profiles",
      label: "Email",
      render: (v) => <span style={{ color: "var(--t3)" }}>{v?.email || "—"}</span>,
    },
    {
      key: "plans",
      label: "Plan",
      render: (v) => {
        const color = planColor(v?.name || "");
        return (
          <span
            style={{
              fontSize: "11px",
              padding: "3px 9px",
              borderRadius: "999px",
              border: `1px solid ${color.border}`,
              color: color.border,
              fontWeight: 600,
            }}
          >
            {v?.name || "—"}
          </span>
        );
      },
    },
    {
      key: "started_at",
      label: "Started",
      render: (v) =>
        v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—",
    },
    {
      key: "_actions",
      label: "Actions",
      render: (_, row) => (
        <button className="admin-action-btn" onClick={() => setChangingPlan(row)}>
          <ArrowsLeftRight size={12} /> Change Plan
        </button>
      ),
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <div>
          <div className="admin-page-title">Plans &amp; Billing</div>
          <div className="admin-page-sub">Manage subscription plans and billing records.</div>
        </div>
        <button className="admin-action-btn primary" onClick={() => setEditingPlan("new")}>
          <Plus size={14} /> Create New Plan
        </button>
      </div>

      {/* Plan cards */}
      {loading ? (
        <div className="admin-stats-grid" style={{ marginBottom: "28px" }}>
          {[0, 1, 2].map((i) => <div key={i} className="admin-stats-skeleton" style={{ height: "280px" }} />)}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              userCount={userCountForPlan(plan.id)}
              onEdit={setEditingPlan}
              onDelete={setDeletingPlan}
              onToggle={handleToggle}
            />
          ))}
          {plans.length === 0 && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--t3)", padding: "48px", fontSize: "13px" }}>
              No plans found. Create your first plan.
            </div>
          )}
        </div>
      )}

      {/* Revenue section */}
      <div className="admin-section" style={{ marginBottom: "20px" }}>
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CurrencyDollar size={16} style={{ color: "#4ade80" }} />
            Revenue Overview
          </span>
        </div>
        <div className="admin-section-body">
          <div className="admin-stats-grid" style={{ marginBottom: "20px" }}>
            <AdminStatsCard
              icon={<CreditCard size={18} />}
              label="Pro MRR"
              value={`$${proMRR.toLocaleString()}`}
              trend={`${proCount} Pro users × $${PRO_PRICE}`}
              color="#3b82f6"
            />
            <AdminStatsCard
              icon={<CreditCard size={18} />}
              label="Business MRR"
              value={`$${bizMRR.toLocaleString()}`}
              trend={`${bizCount} Business users × $${BIZ_PRICE}`}
              color="#f59e0b"
            />
            <AdminStatsCard
              icon={<CurrencyDollar size={18} />}
              label="Total MRR"
              value={`$${totalMRR.toLocaleString()}`}
              trend="Monthly recurring revenue"
              color="#4ade80"
            />
            <AdminStatsCard
              icon={<Users size={18} />}
              label="Free vs Paid"
              value={`${paidPct}% paid`}
              trend={`${totalPaid} paid / ${freeCount} free`}
              color="#f97316"
            />
          </div>
          {/* Bar */}
          {totalAll > 0 && (
            <div>
              <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "6px" }}>
                Free vs Paid ratio
              </div>
              <div style={{ height: "10px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", overflow: "hidden", display: "flex" }}>
                <div
                  style={{
                    width: `${paidPct}%`,
                    background: "linear-gradient(90deg, #f97316, #3b82f6)",
                    borderRadius: "999px 0 0 999px",
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>
                <span>{paidPct}% paid ({totalPaid})</span>
                <span>{100 - paidPct}% free ({freeCount})</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Users per plan table */}
      <div className="admin-section">
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={16} />
            Active Subscriptions
          </span>
          <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}>{userPlanRows.length} records</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((c, i) => <th key={i}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="admin-table-skeleton">
                    {columns.map((_, j) => (
                      <td key={j}><span className="admin-table-skeleton-row" style={{ width: "70%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : userPlanRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <div className="admin-empty">No active subscriptions found.</div>
                  </td>
                </tr>
              ) : (
                userPlanRows.map((row, ri) => (
                  <tr key={ri}>
                    {columns.map((col, ci) => (
                      <td key={ci}>
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {editingPlan && (
          <PlanFormModal
            key="plan-form"
            mode={editingPlan === "new" ? "create" : "edit"}
            plan={editingPlan === "new" ? null : editingPlan}
            onClose={() => setEditingPlan(null)}
            onSaved={() => { setEditingPlan(null); fetchAll(); }}
          />
        )}
        {deletingPlan && (
          <ConfirmModal
            key="delete-plan"
            title="Delete Plan"
            message={`Are you sure you want to delete the "${deletingPlan.name}" plan? This action cannot be undone.`}
            confirmLabel="Delete Plan"
            onConfirm={handleDeleteConfirm}
            onClose={() => setDeletingPlan(null)}
            loading={deleting}
          />
        )}
        {changingPlan && (
          <ChangePlanModal
            key="change-plan"
            userPlan={changingPlan}
            plans={plans}
            onClose={() => setChangingPlan(null)}
            onSaved={() => { setChangingPlan(null); fetchAll(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
