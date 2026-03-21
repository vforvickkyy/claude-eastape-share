import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HardDrive, VideoCamera, Clock, CloudArrowUp, Files,
  LinkSimple, Users, ArrowRight, ChartBar, Briefcase,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { usePlan } from "./context/PlanContext";
import DashboardLayout from "./DashboardLayout";
import { dashboardApi, formatSize } from "./lib/api";
import GettingStartedChecklist from "./components/dashboard/GettingStartedChecklist";

const CARD_VARIANTS = {
  hidden:  { opacity: 0, y: 16 },
  visible: i => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] } }),
};

export default function DashboardPage() {
  const { user, loading: authLoading, profile } = useAuth();
  const plan = usePlan();
  const navigate = useNavigate();

  const [stats,        setStats]        = useState(null);
  const [recentProjs,  setRecentProjs]  = useState([]);
  const [recentFiles,  setRecentFiles]  = useState([]);
  const [recentMedia,  setRecentMedia]  = useState([]);
  const [activity,     setActivity]     = useState([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    dashboardApi.getStats()
      .then(d => {
        setStats(d.stats);
        setRecentProjs(d.recent_projects || []);
        setRecentFiles(d.recent_files || []);
        setRecentMedia(d.recent_media || []);
        setActivity(d.activity || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Storage from PlanContext (preferred) or dashboard stats fallback
  const usedBytes   = plan.used_bytes   ?? (stats?.storage_bytes ?? 0);
  const limitBytes  = plan.limit_bytes  ?? (2 * 1024 * 1024 * 1024);
  const percentUsed = plan.percent_used ?? Math.min(100, Math.round((usedBytes / limitBytes) * 100));
  const planName    = plan.display_name ?? "Starter";

  const displayName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  // Show checklist for new users (first 7 days, completed onboarding, not dismissed)
  const isNewUser = profile?.createdAt
    ? new Date(profile.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    : false;
  const showChecklist = profile?.onboarding_completed && isNewUser && !profile?.onboarding_dismissed;

  return (
    <DashboardLayout title="Dashboard">
      {/* Getting Started Checklist */}
      {showChecklist && <GettingStartedChecklist />}

      {/* Greeting */}
      <motion.div
        className="dash-greeting"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="dash-greeting-text">
          Good {getTimeOfDay()}, <span className="dash-greeting-name">{displayName}</span>
        </h2>
        <p className="dash-greeting-sub">Here's what's happening with your workspace.</p>
      </motion.div>

      {/* Stats row */}
      <div className="stats-bar">
        {[
          { icon: <Briefcase size={22} weight="duotone" />,  value: stats?.project_count ?? 0,           label: "Projects"     },
          { icon: <Files size={22} weight="duotone" />,      value: stats?.file_count ?? 0,              label: "Files"        },
          { icon: <VideoCamera size={22} weight="duotone" />, value: stats?.video_count ?? 0,            label: "Videos"       },
          { icon: <ChartBar size={22} weight="duotone" />,   value: formatSize(usedBytes),              label: "Storage Used" },
        ].map((stat, i) => (
          <motion.div key={stat.label} className="stat-card" custom={i} variants={CARD_VARIANTS} initial="hidden" animate="visible">
            <span className="stat-icon">{stat.icon}</span>
            <div>
              <span className="stat-value">{loading ? "—" : stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main grid */}
      <div className="dash-grid">

        {/* ── Projects card ── */}
        <motion.div className="dash-widget" custom={0} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <Briefcase size={18} weight="duotone" className="dash-widget-icon media" />
            <span className="dash-widget-title">Recent Projects</span>
            <button className="btn-ghost dash-widget-link" onClick={() => navigate("/projects")}>
              View all <ArrowRight size={13} weight="bold" />
            </button>
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
          ) : recentProjs.length === 0 ? (
            <div className="dash-empty">
              <p>No projects yet</p>
              <button className="btn-primary-sm" onClick={() => navigate("/projects?new=1")}>New Project</button>
            </div>
          ) : (
            <div className="dash-project-list">
              {recentProjs.slice(0, 5).map(p => (
                <button
                  key={p.id}
                  className="dash-project-row"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <span className="dash-project-dot" style={{ background: p.color || "#6366f1" }} />
                  <span className="dash-project-name">{p.icon ? `${p.icon} ` : ""}{p.name}</span>
                  <ArrowRight size={12} className="dash-project-arrow" />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Drive card ── */}
        <motion.div className="dash-widget" custom={1} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <HardDrive size={18} weight="duotone" className="dash-widget-icon drive" />
            <span className="dash-widget-title">Drive</span>
            <button className="btn-ghost dash-widget-link" onClick={() => navigate("/drive")}>
              View all <ArrowRight size={13} weight="bold" />
            </button>
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
          ) : recentFiles.length === 0 ? (
            <div className="dash-empty">
              <p>No drive files yet</p>
              <button className="btn-primary-sm" onClick={() => navigate("/drive")}>Upload files</button>
            </div>
          ) : (
            <div className="dash-file-list">
              {recentFiles.slice(0, 4).map(f => (
                <div key={f.id} className="dash-file-row">
                  <Files size={14} weight="duotone" className="dash-file-icon" />
                  <span className="dash-file-name">{f.name}</span>
                  <span className="dash-file-meta">{f.file_size ? formatSize(f.file_size) : ""}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Storage bar ── */}
        <motion.div className="dash-widget dash-storage" custom={2} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <HardDrive size={18} weight="duotone" className="dash-widget-icon drive" />
            <span className="dash-widget-title">Storage</span>
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px",
              background: planName === "Starter" ? "rgba(148,163,184,0.15)" : planName === "Creator" ? "rgba(124,58,237,0.15)" : "rgba(59,130,246,0.15)",
              color: planName === "Starter" ? "var(--t3)" : planName === "Creator" ? "#a78bfa" : "#60a5fa",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>{planName}</span>
          </div>
          <div className="storage-bar-wrap">
            <div className="storage-bar-track">
              <div
                className="storage-bar-fill"
                style={{
                  width: `${percentUsed}%`,
                  background: percentUsed >= 90 ? "linear-gradient(90deg,#ef4444,#f97316)" : percentUsed >= 70 ? "linear-gradient(90deg,#f97316,#fbbf24)" : undefined,
                }}
              />
            </div>
            <div className="storage-bar-labels">
              <span>{formatSize(usedBytes)} used</span>
              <span>{formatSize(limitBytes)} total</span>
            </div>
          </div>
          {percentUsed >= 80 && (
            <div style={{ fontSize: "11px", color: percentUsed >= 90 ? "#f87171" : "#fbbf24", marginTop: "6px" }}>
              {percentUsed >= 90 ? "⚠ Storage almost full!" : "Storage usage is high."}
            </div>
          )}
          <button className="btn-ghost" style={{ marginTop: 10, fontSize: 12 }} onClick={() => navigate("/plans")}>
            {planName === "Professional" ? "View plan details" : "Upgrade plan →"}
          </button>
        </motion.div>

        {/* ── Quick upload CTA ── */}
        <motion.div className="dash-widget dash-upload-cta" custom={3} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <CloudArrowUp size={18} weight="duotone" className="dash-widget-icon upload" />
            <span className="dash-widget-title">Quick Upload</span>
          </div>
          <p className="dash-upload-desc">Share files instantly via secure links.</p>
          <button className="db-new-btn" style={{ marginTop: 12 }} onClick={() => navigate("/upload")}>
            <CloudArrowUp size={15} weight="bold" /> New Upload
          </button>
        </motion.div>

        {/* ── Recent Activity ── */}
        <motion.div className="dash-widget dash-activity" custom={4} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <Clock size={18} weight="duotone" className="dash-widget-icon" />
            <span className="dash-widget-title">Recent Activity</span>
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
          ) : activity.length === 0 ? (
            <div className="dash-empty"><p>No recent activity</p></div>
          ) : (
            <div className="dash-activity-list">
              {activity.slice(0, 6).map(a => (
                <div key={a.id} className="dash-activity-row">
                  <span className="dash-activity-dot" />
                  <div className="dash-activity-info">
                    <span className="dash-activity-label">{formatActivity(a)}</span>
                    <span className="dash-activity-time">{a.created_at ? timeAgo(a.created_at) : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Recent Media ── */}
        <motion.div className="dash-widget" custom={5} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <VideoCamera size={18} weight="duotone" className="dash-widget-icon media" />
            <span className="dash-widget-title">Recent Media</span>
            <button className="btn-ghost dash-widget-link" onClick={() => navigate("/projects")}>
              View all <ArrowRight size={13} weight="bold" />
            </button>
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
          ) : recentMedia.length === 0 ? (
            <div className="dash-empty">
              <p>No media uploads yet</p>
              <button className="btn-primary-sm" onClick={() => navigate("/projects")}>Go to Projects</button>
            </div>
          ) : (
            <div className="dash-project-list">
              {recentMedia.slice(0, 5).map(m => (
                <button
                  key={m.id}
                  className="dash-project-row"
                  onClick={() => navigate(`/projects/${m.project_id}/media/${m.id}`)}
                >
                  <span className="dash-project-dot" style={{ background: m.projects?.color || "#6366f1" }} />
                  <span className="dash-project-name">{m.name}</span>
                  <span style={{ fontSize: 10, color: "var(--t3)", marginLeft: "auto" }}>{m.projects?.name}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>

      </div>
    </DashboardLayout>
  );
}

/* ── helpers ── */
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatActivity(a) {
  const action = (a.action || "").replace(/_/g, " ");
  if (a.entity_name) return `${action}: ${a.entity_name}`;
  return action;
}
