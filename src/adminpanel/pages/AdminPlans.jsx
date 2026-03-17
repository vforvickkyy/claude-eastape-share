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
  ArrowUp,
  ArrowDown,
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
    body: JSON.stringify({ admin_id: userId, action, target_type: targetType, target_id: String(targetId), metadata }),
  });
}

/* ── Tier → color map ─────────────────────────────────────── */
function tierColor(name = "") {
  const k = name.toLowerCase();
  if (k === "creator" || k === "pro") return "#3b82f6";
  if (k === "professional" || k === "studio" || k === "business") return "#f59e0b";
  return "rgba(148,163,184,0.4)";
}

/* ── Plan Card ────────────────────────────────────────────── */
function PlanCard({ plan, userCount, onEdit, onDelete, onToggle }) {
  const color = tierColor(plan.display_name || plan.name);
  const currency = plan.currency_symbol || "₹";
  const features = Array.isArray(plan.features) ? plan.features : [];
  const addons   = Array.isArray(plan.addons)   ? plan.addons   : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: "var(--card)",
        border: `1px solid ${plan.is_highlighted ? color : "var(--border)"}`,
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
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: color, borderRadius: "14px 14px 0 0" }} />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "var(--t3)", letterSpacing: "0.08em", fontWeight: 600, textTransform: "uppercase" }}>
            {plan.tier_label || plan.name?.toUpperCase()}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.2 }}>{plan.display_name || plan.name}</div>
          {plan.badge_text && (
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "999px", background: `${color}22`, color, border: `1px solid ${color}44`, fontWeight: 600 }}>
              {plan.badge_text}
            </span>
          )}
          <div style={{ fontSize: "12px", color: plan.is_active ? "#4ade80" : "var(--t3)", marginTop: "4px" }}>
            {plan.is_active ? "● Active" : "○ Inactive"}
          </div>
        </div>
        <div style={{ background: "rgba(249,115,22,0.12)", color: "#f97316", fontSize: "12px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>
          <Users size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} />
          {userCount} users
        </div>
      </div>

      {/* Pricing */}
      <div>
        <div style={{ fontSize: "24px", fontWeight: 700 }}>
          {currency}{Number(plan.price_monthly ?? 0).toLocaleString("en-IN")}
          <span style={{ fontSize: "13px", color: "var(--t3)", fontWeight: 400 }}>/mo</span>
        </div>
        {plan.price_yearly > 0 && (
          <div style={{ fontSize: "12px", color: "var(--t3)" }}>{currency}{Number(plan.price_yearly).toLocaleString("en-IN")}/yr</div>
        )}
        {plan.tagline && (
          <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "4px", fontStyle: "italic" }}>{plan.tagline}</div>
        )}
      </div>

      {/* Limits grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", padding: "10px", fontSize: "11px" }}>
        {[
          ["Storage",    plan.storage_limit_gb != null ? `${plan.storage_limit_gb >= 1024 ? (plan.storage_limit_gb/1024)+"TB" : plan.storage_limit_gb+"GB"}` : "∞"],
          ["Files",      plan.max_files        != null ? plan.max_files        : "∞"],
          ["Videos",     plan.max_videos       != null ? plan.max_videos       : "∞"],
          ["Team",       plan.max_team_members != null ? plan.max_team_members : "∞"],
          ["File size",  plan.max_file_size_mb != null ? `${plan.max_file_size_mb >= 1024 ? (plan.max_file_size_mb/1024)+"GB" : plan.max_file_size_mb+"MB"}` : "∞"],
          ["Link expiry",plan.link_expiry_days != null ? `${plan.link_expiry_days}d` : "∞"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
            <span style={{ color: "var(--t3)" }}>{k}</span>
            <span style={{ fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Feature toggles */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {[["Drive", plan.drive_enabled], ["Media", plan.media_enabled], ["Sharing", plan.sharing_enabled]].map(([label, on]) => (
          <span key={label} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", background: on ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)", color: on ? "#4ade80" : "var(--t3)", border: `1px solid ${on ? "rgba(74,222,128,0.2)" : "var(--border)"}` }}>
            {on ? "✓" : "✗"} {label}
          </span>
        ))}
      </div>

      {/* Features */}
      {features.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
          {features.slice(0, 5).map((f, i) => (
            <li key={i} style={{ fontSize: "11px", color: "var(--t2)", display: "flex", alignItems: "flex-start", gap: "5px" }}>
              <Check size={11} weight="bold" style={{ color, marginTop: "2px", flexShrink: 0 }} />
              {typeof f === "object" ? f.label : f}
            </li>
          ))}
          {features.length > 5 && (
            <li style={{ fontSize: "11px", color: "var(--t3)" }}>+{features.length - 5} more…</li>
          )}
        </ul>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <button className="admin-action-btn" onClick={() => onToggle(plan)} style={{ flex: 1, justifyContent: "center" }}>
          {plan.is_active ? <><ToggleRight size={14} style={{ color: "#4ade80" }} /> Active</> : <><ToggleLeft size={14} /> Inactive</>}
        </button>
        <button className="admin-action-btn" onClick={() => onEdit(plan)}><PencilSimple size={13} /> Edit</button>
        <button className="admin-action-btn danger" onClick={() => onDelete(plan)} disabled={userCount > 0}
          title={userCount > 0 ? "Cannot delete — plan has users" : "Delete"} style={{ opacity: userCount > 0 ? 0.4 : 1, cursor: userCount > 0 ? "not-allowed" : "pointer" }}>
          <Trash size={13} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Plan Form Modal ──────────────────────────────────────── */
const DEFAULT_FORM = {
  name: "", display_name: "", tier_label: "", tagline: "", badge_text: "",
  is_highlighted: false, cta_text: "Get Started", sort_order: 0, currency_symbol: "₹",
  price_monthly: 0, price_yearly: 0,
  storage_limit_gb: 5, bandwidth_limit_gb: 50, max_file_size_mb: 500,
  max_files: "", max_videos: "", max_team_members: 1,
  link_expiry_days: 7, projects_limit: "",
  drive_enabled: true, media_enabled: false, sharing_enabled: true,
  features: [], addons: [], is_active: true,
};

function PlanFormModal({ mode, plan, onClose, onSaved }) {
  const [form, setForm]           = useState(mode === "edit" ? { ...DEFAULT_FORM, ...plan } : { ...DEFAULT_FORM });
  const [newFeature, setNewFeature] = useState("");
  const [newAddonLabel, setNewAddonLabel] = useState("");
  const [newAddonPrice, setNewAddonPrice] = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  function field(key, value) { setForm(f => ({ ...f, [key]: value })); }

  function addFeature() {
    const t = newFeature.trim(); if (!t) return;
    setForm(f => ({ ...f, features: [...(f.features || []), t] }));
    setNewFeature("");
  }
  function removeFeature(i) { setForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) })); }
  function moveFeature(i, dir) {
    const arr = [...(form.features || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setForm(f => ({ ...f, features: arr }));
  }

  function addAddon() {
    const l = newAddonLabel.trim(), p = newAddonPrice.trim(); if (!l) return;
    setForm(f => ({ ...f, addons: [...(f.addons || []), { label: l, price: p }] }));
    setNewAddonLabel(""); setNewAddonPrice("");
  }
  function removeAddon(i) { setForm(f => ({ ...f, addons: f.addons.filter((_, idx) => idx !== i) })); }

  async function handleSave() {
    if (!form.name.trim()) { setError("Internal name is required."); return; }
    setSaving(true); setError("");
    const { headers } = getAuth();
    const payload = {
      name:               form.name.trim().toLowerCase().replace(/\s+/g, "-"),
      display_name:       form.display_name.trim() || form.name.trim(),
      tier_label:         form.tier_label.trim().toUpperCase() || form.name.trim().toUpperCase(),
      tagline:            form.tagline.trim(),
      badge_text:         form.badge_text.trim() || null,
      is_highlighted:     !!form.is_highlighted,
      cta_text:           form.cta_text.trim() || "Get Started",
      sort_order:         Number(form.sort_order) || 0,
      currency_symbol:    form.currency_symbol || "₹",
      price_monthly:      Number(form.price_monthly) || 0,
      price_yearly:       Number(form.price_yearly) || 0,
      storage_limit_gb:   form.storage_limit_gb !== "" ? Number(form.storage_limit_gb) : null,
      bandwidth_limit_gb: form.bandwidth_limit_gb !== "" ? Number(form.bandwidth_limit_gb) : null,
      max_file_size_mb:   form.max_file_size_mb !== "" ? Number(form.max_file_size_mb) : null,
      max_files:          form.max_files !== "" ? Number(form.max_files) : null,
      max_videos:         form.max_videos !== "" ? Number(form.max_videos) : null,
      max_team_members:   Number(form.max_team_members) || 1,
      link_expiry_days:   form.link_expiry_days !== "" ? Number(form.link_expiry_days) : null,
      projects_limit:     form.projects_limit !== "" ? Number(form.projects_limit) : null,
      drive_enabled:      !!form.drive_enabled,
      media_enabled:      !!form.media_enabled,
      sharing_enabled:    !!form.sharing_enabled,
      features:           form.features || [],
      addons:             form.addons || [],
      is_active:          !!form.is_active,
    };
    try {
      let res;
      if (mode === "edit") {
        res = await fetch(`${BASE}/rest/v1/plans?id=eq.${plan.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${BASE}/rest/v1/plans`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`Save failed (${res.status}): ${body}`);
      }
      auditLog(mode === "edit" ? "plan.updated" : "plan.created", "plan", plan?.id ?? "new", payload).catch(() => {});
      onSaved();
    } catch (e) {
      setError(e.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const inp = { width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", color: "var(--t1)", fontSize: "13px", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: "12px", color: "var(--t3)", display: "block", marginBottom: "4px" };
  const row2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" };
  const row3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" };

  return (
    <AdminModal title={mode === "edit" ? `Edit — ${plan?.display_name || plan?.name}` : "Create New Plan"} onClose={onClose} maxWidth="620px">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "70vh", overflowY: "auto", paddingRight: "4px" }}>

        {/* ── Identity ── */}
        <div style={{ fontSize: "11px", color: "var(--admin-accent)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Identity</div>
        <div style={row2}>
          <div>
            <label style={lbl}>Internal Name * <span style={{ color: "var(--t3)" }}>(e.g. creator)</span></label>
            <input style={inp} value={form.name} onChange={e => field("name", e.target.value)} placeholder="creator" />
          </div>
          <div>
            <label style={lbl}>Display Name <span style={{ color: "var(--t3)" }}>(shown to users)</span></label>
            <input style={inp} value={form.display_name} onChange={e => field("display_name", e.target.value)} placeholder="Creator" />
          </div>
        </div>
        <div style={row3}>
          <div>
            <label style={lbl}>Tier Label <span style={{ color: "var(--t3)" }}>(e.g. PRO)</span></label>
            <input style={inp} value={form.tier_label} onChange={e => field("tier_label", e.target.value)} placeholder="PRO" />
          </div>
          <div>
            <label style={lbl}>Badge Text <span style={{ color: "var(--t3)" }}>(optional)</span></label>
            <input style={inp} value={form.badge_text} onChange={e => field("badge_text", e.target.value)} placeholder="Most Popular" />
          </div>
          <div>
            <label style={lbl}>Sort Order</label>
            <input style={inp} type="number" min="0" value={form.sort_order} onChange={e => field("sort_order", e.target.value)} />
          </div>
        </div>
        <div>
          <label style={lbl}>Tagline</label>
          <input style={inp} value={form.tagline} onChange={e => field("tagline", e.target.value)} placeholder="For creators, freelancers & growing businesses." />
        </div>
        <div style={row2}>
          <div>
            <label style={lbl}>CTA Button Text</label>
            <input style={inp} value={form.cta_text} onChange={e => field("cta_text", e.target.value)} placeholder="Start PRO" />
          </div>
          <div>
            <label style={lbl}>Currency Symbol</label>
            <input style={inp} value={form.currency_symbol} onChange={e => field("currency_symbol", e.target.value)} placeholder="₹" />
          </div>
        </div>

        {/* ── Pricing ── */}
        <div style={{ fontSize: "11px", color: "var(--admin-accent)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Pricing</div>
        <div style={row2}>
          <div>
            <label style={lbl}>Monthly Price</label>
            <input style={inp} type="number" min="0" value={form.price_monthly} onChange={e => field("price_monthly", e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Yearly Price</label>
            <input style={inp} type="number" min="0" value={form.price_yearly} onChange={e => field("price_yearly", e.target.value)} />
          </div>
        </div>

        {/* ── Limits ── */}
        <div style={{ fontSize: "11px", color: "var(--admin-accent)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Allowances <span style={{ color: "var(--t3)", fontWeight: 400, fontSize: "10px" }}>(leave blank = unlimited)</span></div>
        <div style={row3}>
          <div>
            <label style={lbl}>Storage (GB)</label>
            <input style={inp} type="number" min="0" value={form.storage_limit_gb ?? ""} onChange={e => field("storage_limit_gb", e.target.value)} placeholder="∞" />
          </div>
          <div>
            <label style={lbl}>Bandwidth (GB)</label>
            <input style={inp} type="number" min="0" value={form.bandwidth_limit_gb ?? ""} onChange={e => field("bandwidth_limit_gb", e.target.value)} placeholder="∞" />
          </div>
          <div>
            <label style={lbl}>Max File Size (MB)</label>
            <input style={inp} type="number" min="0" value={form.max_file_size_mb ?? ""} onChange={e => field("max_file_size_mb", e.target.value)} placeholder="∞" />
          </div>
          <div>
            <label style={lbl}>Max Files</label>
            <input style={inp} type="number" min="0" value={form.max_files ?? ""} onChange={e => field("max_files", e.target.value)} placeholder="∞" />
          </div>
          <div>
            <label style={lbl}>Max Videos</label>
            <input style={inp} type="number" min="0" value={form.max_videos ?? ""} onChange={e => field("max_videos", e.target.value)} placeholder="∞" />
          </div>
          <div>
            <label style={lbl}>Media Projects</label>
            <input style={inp} type="number" min="0" value={form.projects_limit ?? ""} onChange={e => field("projects_limit", e.target.value)} placeholder="∞" />
          </div>
          <div>
            <label style={lbl}>Team Members</label>
            <input style={inp} type="number" min="1" value={form.max_team_members ?? ""} onChange={e => field("max_team_members", e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Link Expiry (days)</label>
            <input style={inp} type="number" min="0" value={form.link_expiry_days ?? ""} onChange={e => field("link_expiry_days", e.target.value)} placeholder="∞" />
          </div>
        </div>

        {/* ── Feature Toggles ── */}
        <div style={{ fontSize: "11px", color: "var(--admin-accent)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Feature Access</div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {[["drive_enabled","Drive"],["media_enabled","Media"],["sharing_enabled","Sharing"],["is_highlighted","Highlighted card"],["is_active","Active (visible)"]].map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", color: "var(--t2)" }}>
              <input type="checkbox" checked={!!form[key]} onChange={e => field(key, e.target.checked)} style={{ accentColor: "#f97316", width: "14px", height: "14px" }} />
              {label}
            </label>
          ))}
        </div>

        {/* ── Features List ── */}
        <div style={{ fontSize: "11px", color: "var(--admin-accent)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Feature Bullet Points</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <AnimatePresence>
            {(form.features || []).map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}
                style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px" }}>
                <Check size={11} weight="bold" style={{ color: "#4ade80", flexShrink: 0 }} />
                <span style={{ flex: 1, color: "var(--t2)" }}>{typeof f === "object" ? f.label : f}</span>
                <button onClick={() => moveFeature(i, -1)} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", padding: "0 2px", display: "flex" }} title="Move up"><ArrowUp size={11} /></button>
                <button onClick={() => moveFeature(i, 1)} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", padding: "0 2px", display: "flex" }} title="Move down"><ArrowDown size={11} /></button>
                <button onClick={() => removeFeature(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: "0 2px", display: "flex" }}><X size={12} /></button>
              </motion.div>
            ))}
          </AnimatePresence>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <input style={{ ...inp, flex: 1 }} value={newFeature} onChange={e => setNewFeature(e.target.value)} onKeyDown={e => e.key === "Enter" && addFeature()} placeholder="Add a feature bullet…" />
            <button className="admin-action-btn primary" onClick={addFeature}><Plus size={13} /> Add</button>
          </div>
        </div>

        {/* ── Add-ons ── */}
        <div style={{ fontSize: "11px", color: "var(--admin-accent)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Add-ons / Extras</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <AnimatePresence>
            {(form.addons || []).map((a, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px" }}>
                <span style={{ flex: 1, color: "var(--t2)" }}>{a.label}</span>
                <span style={{ color: "var(--t3)" }}>{a.price}</span>
                <button onClick={() => removeAddon(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: "0 2px", display: "flex" }}><X size={12} /></button>
              </motion.div>
            ))}
          </AnimatePresence>
          <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
            <input style={{ ...inp, flex: 2 }} value={newAddonLabel} onChange={e => setNewAddonLabel(e.target.value)} placeholder="Add-on label (e.g. Extra 100 GB)" />
            <input style={{ ...inp, flex: 1 }} value={newAddonPrice} onChange={e => setNewAddonPrice(e.target.value)} placeholder="Price (e.g. ₹79/mo)" />
            <button className="admin-action-btn primary" onClick={addAddon}><Plus size={13} /></button>
          </div>
        </div>

        {error && <div style={{ fontSize: "12px", color: "#f87171", background: "rgba(248,113,113,0.08)", padding: "8px 12px", borderRadius: "6px" }}>{error}</div>}
      </div>

      <div className="admin-modal-footer" style={{ marginTop: "8px" }}>
        <button className="admin-action-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-action-btn primary" onClick={handleSave} disabled={saving} style={{ minWidth: "110px", justifyContent: "center" }}>
          {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Plan"}
        </button>
      </div>
    </AdminModal>
  );
}

/* ── Change Plan Modal ────────────────────────────────────── */
function ChangePlanModal({ userPlan, plans, onClose, onSaved }) {
  const [selectedPlanId, setSelectedPlanId] = useState(userPlan.plan_id);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { headers } = getAuth();
    await fetch(`${BASE}/rest/v1/user_plans?user_id=eq.${userPlan.user_id}&is_active=eq.true`, {
      method: "PATCH", headers, body: JSON.stringify({ plan_id: selectedPlanId }),
    });
    await auditLog("user_plan.changed", "user_plan", userPlan.user_id, { new_plan_id: selectedPlanId });
    setSaving(false); onSaved();
  }

  const currency = plans[0]?.currency_symbol || "₹";

  return (
    <AdminModal title="Change User Plan" onClose={onClose} maxWidth="380px">
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "4px" }}>
          Select a plan for <strong style={{ color: "var(--t1)" }}>{userPlan.profiles?.full_name || userPlan.profiles?.email || userPlan.user_id}</strong>:
        </div>
        {plans.map(p => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "8px", border: `1px solid ${selectedPlanId === p.id ? "#f97316" : "var(--border)"}`, background: selectedPlanId === p.id ? "rgba(249,115,22,0.06)" : "var(--bg)", cursor: "pointer", transition: "all 0.15s" }}>
            <input type="radio" name="plan" value={p.id} checked={selectedPlanId === p.id} onChange={() => setSelectedPlanId(p.id)} style={{ accentColor: "#f97316" }} />
            <span style={{ flex: 1, fontSize: "13px", fontWeight: 500 }}>{p.display_name || p.name}</span>
            <span style={{ fontSize: "12px", color: "var(--t3)" }}>{currency}{p.price_monthly}/mo</span>
          </label>
        ))}
      </div>
      <div className="admin-modal-footer" style={{ marginTop: "8px" }}>
        <button className="admin-action-btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-action-btn primary" onClick={handleSave} disabled={saving} style={{ minWidth: "110px", justifyContent: "center" }}>
          {saving ? "Saving…" : "Update Plan"}
        </button>
      </div>
    </AdminModal>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminPlans() {
  const [plans,        setPlans]        = useState([]);
  const [userPlansAll, setUserPlansAll] = useState([]);
  const [userPlanRows, setUserPlanRows] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [editingPlan,  setEditingPlan]  = useState(null);
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [changingPlan, setChangingPlan] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { headers } = getAuth();
    const [pRes, upRes, upRowRes] = await Promise.all([
      fetch(`${BASE}/rest/v1/plans?order=sort_order.asc`, { headers }),
      fetch(`${BASE}/rest/v1/user_plans?select=plan_id&is_active=eq.true`, { headers }),
      fetch(`${BASE}/rest/v1/user_plans?select=user_id,plan_id,started_at,plans(name,display_name),profiles(full_name,email)&is_active=eq.true&order=started_at.desc&limit=100`, { headers }),
    ]);
    const [plansData, upData, upRowData] = await Promise.all([pRes.json(), upRes.json(), upRowRes.json()]);
    setPlans(Array.isArray(plansData) ? plansData : []);
    setUserPlansAll(Array.isArray(upData) ? upData : []);
    setUserPlanRows(Array.isArray(upRowData) ? upRowData : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function userCountForPlan(planId) { return userPlansAll.filter(up => up.plan_id === planId).length; }

  async function handleToggle(plan) {
    const { headers } = getAuth();
    await fetch(`${BASE}/rest/v1/plans?id=eq.${plan.id}`, { method: "PATCH", headers, body: JSON.stringify({ is_active: !plan.is_active }) });
    await auditLog("plan.toggled", "plan", plan.id, { is_active: !plan.is_active });
    fetchAll();
  }

  async function handleDeleteConfirm() {
    if (!deletingPlan) return;
    setDeleting(true);
    const { headers } = getAuth();
    await fetch(`${BASE}/rest/v1/plans?id=eq.${deletingPlan.id}`, { method: "DELETE", headers });
    await auditLog("plan.deleted", "plan", deletingPlan.id, { name: deletingPlan.name });
    setDeletingPlan(null); setDeleting(false); fetchAll();
  }

  /* Revenue */
  const paidPlans = plans.filter(p => (p.price_monthly ?? 0) > 0);
  const totalMRR  = paidPlans.reduce((sum, p) => sum + (userCountForPlan(p.id) * (p.price_monthly || 0)), 0);
  const totalPaid = paidPlans.reduce((sum, p) => sum + userCountForPlan(p.id), 0);
  const freeCount = userPlansAll.length - totalPaid;
  const totalAll  = userPlansAll.length;
  const paidPct   = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0;
  const currency  = plans[0]?.currency_symbol || "₹";

  const columns = [
    { key: "profiles", label: "Name",    render: v => <span style={{ fontWeight: 500 }}>{v?.full_name || "—"}</span> },
    { key: "profiles", label: "Email",   render: v => <span style={{ color: "var(--t3)" }}>{v?.email || "—"}</span> },
    { key: "plans",    label: "Plan",    render: v => {
      const c = tierColor(v?.display_name || v?.name || "");
      return <span style={{ fontSize: "11px", padding: "3px 9px", borderRadius: "999px", border: `1px solid ${c}`, color: c, fontWeight: 600 }}>{v?.display_name || v?.name || "—"}</span>;
    }},
    { key: "started_at", label: "Started", render: v => v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
    { key: "_actions", label: "Actions", render: (_, row) => <button className="admin-action-btn" onClick={() => setChangingPlan(row)}><ArrowsLeftRight size={12} /> Change Plan</button> },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <div>
          <div className="admin-page-title">Plans &amp; Billing</div>
          <div className="admin-page-sub">Manage subscription plans. Changes reflect on the public pricing page immediately.</div>
        </div>
        <button className="admin-action-btn primary" onClick={() => setEditingPlan("new")}><Plus size={14} /> New Plan</button>
      </div>

      {/* Plan cards */}
      {loading ? (
        <div className="admin-stats-grid" style={{ marginBottom: "28px" }}>
          {[0,1,2].map(i => <div key={i} className="admin-stats-skeleton" style={{ height: "320px" }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          {plans.map(plan => (
            <PlanCard key={plan.id} plan={plan} userCount={userCountForPlan(plan.id)}
              onEdit={setEditingPlan} onDelete={setDeletingPlan} onToggle={handleToggle} />
          ))}
          {plans.length === 0 && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--t3)", padding: "48px", fontSize: "13px" }}>No plans. Create your first plan.</div>}
        </div>
      )}

      {/* Revenue */}
      <div className="admin-section" style={{ marginBottom: "20px" }}>
        <div className="admin-section-title"><span style={{ display: "flex", alignItems: "center", gap: "8px" }}><CurrencyDollar size={16} style={{ color: "#4ade80" }} />Revenue Overview</span></div>
        <div className="admin-section-body">
          <div className="admin-stats-grid" style={{ marginBottom: "20px" }}>
            <AdminStatsCard icon={<CurrencyDollar size={18} />} label="Total MRR" value={`${currency}${totalMRR.toLocaleString("en-IN")}`} trend="Monthly recurring revenue" color="#4ade80" />
            {paidPlans.map(p => (
              <AdminStatsCard key={p.id} icon={<CreditCard size={18} />} label={`${p.display_name || p.name} MRR`}
                value={`${currency}${(userCountForPlan(p.id) * p.price_monthly).toLocaleString("en-IN")}`}
                trend={`${userCountForPlan(p.id)} users × ${currency}${p.price_monthly}`} color={tierColor(p.display_name || p.name)} />
            ))}
            <AdminStatsCard icon={<Users size={18} />} label="Free vs Paid" value={`${paidPct}% paid`} trend={`${totalPaid} paid · ${freeCount} free`} color="#f97316" />
          </div>
          {totalAll > 0 && (
            <div>
              <div style={{ fontSize: "12px", color: "var(--t3)", marginBottom: "6px" }}>Free vs Paid</div>
              <div style={{ height: "10px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${paidPct}%`, background: "linear-gradient(90deg, #f97316, #3b82f6)", borderRadius: "999px 0 0 999px", transition: "width 0.6s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--t3)", marginTop: "4px" }}>
                <span>{paidPct}% paid ({totalPaid})</span><span>{100 - paidPct}% free ({freeCount})</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subscriptions table */}
      <div className="admin-section">
        <div className="admin-section-title">
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><Users size={16} />Active Subscriptions</span>
          <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 400 }}>{userPlanRows.length} records</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead><tr>{columns.map((c, i) => <th key={i}>{c.label}</th>)}</tr></thead>
            <tbody>
              {loading ? [0,1,2,3].map(i => <tr key={i}>{columns.map((_, j) => <td key={j}><span style={{ display: "block", height: "14px", borderRadius: "4px", background: "rgba(255,255,255,0.06)", width: "70%" }} /></td>)}</tr>)
              : userPlanRows.length === 0 ? <tr><td colSpan={columns.length}><div className="admin-empty">No active subscriptions.</div></td></tr>
              : userPlanRows.map((row, ri) => <tr key={ri}>{columns.map((col, ci) => <td key={ci}>{col.render ? col.render(row[col.key], row) : row[col.key] ?? "—"}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {editingPlan && <PlanFormModal key="plan-form" mode={editingPlan === "new" ? "create" : "edit"} plan={editingPlan === "new" ? null : editingPlan} onClose={() => setEditingPlan(null)} onSaved={() => { setEditingPlan(null); fetchAll(); }} />}
        {deletingPlan && <ConfirmModal key="del" title="Delete Plan" message={`Delete "${deletingPlan.display_name || deletingPlan.name}"? Cannot be undone.`} confirmLabel="Delete" onConfirm={handleDeleteConfirm} onClose={() => setDeletingPlan(null)} loading={deleting} />}
        {changingPlan && <ChangePlanModal key="change" userPlan={changingPlan} plans={plans} onClose={() => setChangingPlan(null)} onSaved={() => { setChangingPlan(null); fetchAll(); }} />}
      </AnimatePresence>
    </div>
  );
}
