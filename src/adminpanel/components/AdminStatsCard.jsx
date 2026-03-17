import React from "react";
import { motion } from "framer-motion";

/**
 * AdminStatsCard — icon, label, value, optional trend, skeleton state.
 * Props:
 *   icon     — ReactNode (Phosphor icon element)
 *   label    — string description
 *   value    — string or number to display prominently
 *   trend    — optional string e.g. "+12% this week"
 *   loading  — boolean, shows skeleton placeholder
 *   color    — optional CSS color string for icon bg/color override
 */
export default function AdminStatsCard({ icon, label, value, trend, loading = false, color }) {
  if (loading) {
    return <div className="admin-stats-skeleton" />;
  }

  return (
    <motion.div
      className="admin-stats-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Icon */}
      <div
        className="admin-stats-icon"
        style={
          color
            ? {
                background: `${color}1f`,
                color: color,
              }
            : undefined
        }
      >
        {icon}
      </div>

      {/* Value */}
      <div className="admin-stats-value">{value ?? "—"}</div>

      {/* Label */}
      <div className="admin-stats-label">{label}</div>

      {/* Trend */}
      {trend && <div className="admin-stats-trend">{trend}</div>}
    </motion.div>
  );
}
