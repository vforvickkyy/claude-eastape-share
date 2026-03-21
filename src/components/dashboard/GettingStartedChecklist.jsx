import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ArrowRight } from "@phosphor-icons/react";
import { useAuth } from "../../context/AuthContext";
import { dashboardApi } from "../../lib/api";

const ITEMS = [
  { id: "account",  label: "Create your account",       action: null },
  { id: "username", label: "Choose your @username",     action: (nav) => nav("/profile") },
  { id: "project",  label: "Create your first project", action: (nav) => nav("/projects?new=1") },
  { id: "file",     label: "Upload your first file",    action: (nav) => nav("/drive") },
  { id: "team",     label: "Invite a team member",      action: (nav) => nav("/projects") },
  { id: "shot",     label: "Link a file to a shot",     action: (nav) => nav("/projects") },
];

export default function GettingStartedChecklist({ onDismiss }) {
  const { profile, updateProfileLocally } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ project: 0, file: 0, team: 0, shot: 0 });
  const [dismissed, setDismissed] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [autoTimer, setAutoTimer] = useState(null);

  useEffect(() => {
    dashboardApi.getStats().then(d => {
      setCounts({
        project: d.stats?.project_count ?? 0,
        file:    d.stats?.file_count    ?? 0,
        team:    0, // requires separate endpoint not yet available
        shot:    0, // requires separate endpoint not yet available
      });
    }).catch(() => {});
  }, []);

  function isChecked(id) {
    if (id === "account")  return true;
    if (id === "username") return !!profile?.username;
    if (id === "project")  return counts.project > 0;
    if (id === "file")     return counts.file > 0;
    if (id === "team")     return counts.team > 0;
    if (id === "shot")     return counts.shot > 0;
    return false;
  }

  const checkedItems = ITEMS.filter(item => isChecked(item.id));
  const completedCount = checkedItems.length;

  useEffect(() => {
    if (completedCount === ITEMS.length) {
      setAllDone(true);
      const t = setTimeout(() => handleDismiss(), 5000);
      setAutoTimer(t);
      return () => clearTimeout(t);
    }
  }, [completedCount]);

  async function handleDismiss() {
    if (autoTimer) clearTimeout(autoTimer);
    setDismissed(true);
    try {
      const { userApi } = await import("../../lib/api");
      await userApi.updateProfile({ onboarding_dismissed: true });
      updateProfileLocally({ onboarding_dismissed: true });
    } catch {}
    onDismiss?.();
  }

  if (dismissed) return null;

  if (allDone) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          style={{
            background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: 12, padding: "20px 24px", marginBottom: 24,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}
        >
          <span style={{ fontSize: 15 }}>🎉 You're all set! You know the basics of Eastape.</span>
          <button className="btn-ghost" onClick={handleDismiss} style={{ fontSize: 12, color: "var(--t3)" }}>Dismiss</button>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)",
        borderRadius: 12, padding: "20px 24px", marginBottom: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>🚀 Get started with Eastape</span>
        <button
          onClick={handleDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
        >
          <X size={13} /> dismiss
        </button>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "var(--t3)", display: "block", marginBottom: 6 }}>
          {completedCount} of {ITEMS.length} complete
        </span>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <motion.div
            animate={{ width: `${(completedCount / ITEMS.length) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ height: "100%", background: "#7c3aed", borderRadius: 3 }}
          />
        </div>
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ITEMS.map(item => {
          const checked = isChecked(item.id);
          return (
            <div
              key={item.id}
              style={{ display: "flex", alignItems: "center", gap: 12, height: 34 }}
            >
              {/* Checkbox circle */}
              <motion.div
                animate={{
                  background: checked ? "#7c3aed" : "transparent",
                  borderColor: checked ? "#7c3aed" : "rgba(255,255,255,0.2)",
                }}
                transition={{ duration: 0.2 }}
                style={{
                  width: 20, height: 20, borderRadius: "50%", border: "1.5px solid",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {checked && <Check size={11} weight="bold" color="#fff" />}
              </motion.div>

              {/* Label */}
              <span style={{
                fontSize: 13,
                color: checked ? "var(--t3)" : "var(--t1)",
                textDecoration: checked ? "line-through" : "none",
                flex: 1,
              }}>
                {item.label}
              </span>

              {/* Action arrow for pending items */}
              {!checked && item.action && (
                <button
                  onClick={() => item.action(navigate)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex", alignItems: "center" }}
                >
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
