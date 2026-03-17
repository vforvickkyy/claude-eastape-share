import React from "react";

/**
 * StatusBadge — displays user account status.
 * Variants: active (green), suspended (red), pending (yellow), admin (purple)
 */
export function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();

  const dot = {
    active:    { color: "#4ade80" },
    suspended: { color: "#f87171" },
    pending:   { color: "#fbbf24" },
    admin:     { color: "#a78bfa" },
  }[s] || { color: "#94a3b8" };

  const label =
    s === "active"    ? "Active"    :
    s === "suspended" ? "Suspended" :
    s === "pending"   ? "Pending"   :
    s === "admin"     ? "Admin"     :
    status || "Unknown";

  return (
    <span className={`status-badge ${s}`}>
      <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
        <circle cx="3" cy="3" r="3" fill={dot.color} />
      </svg>
      {label}
    </span>
  );
}

/**
 * PlanBadge — displays subscription plan.
 * Variants: free (gray), pro (blue), business (gold)
 */
export function PlanBadge({ plan }) {
  const p = (plan || "free").toLowerCase();

  const label =
    p === "free"     ? "Free"     :
    p === "pro"      ? "Pro"      :
    p === "business" ? "Business" :
    plan || "Free";

  return (
    <span className={`plan-badge ${p}`}>
      {label}
    </span>
  );
}
