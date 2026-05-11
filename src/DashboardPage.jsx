import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CloudArrowUp, FolderPlus, Folder, Eye,
  VideoCamera, ArrowRight,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import { usePlan } from "./context/PlanContext";
import DashboardLayout from "./DashboardLayout";
import { dashboardApi, formatSize } from "./lib/api";
import GettingStartedChecklist from "./components/dashboard/GettingStartedChecklist";

export default function DashboardPage() {
  const { user, loading: authLoading, profile } = useAuth();
  const plan = usePlan();
  const navigate = useNavigate();

  const [stats,       setStats]       = useState(null);
  const [recentProjs, setRecentProjs] = useState([]);
  const [recentMedia, setRecentMedia] = useState([]);
  const [activity,    setActivity]    = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    dashboardApi.getStats()
      .then(d => {
        setStats(d.stats);
        setRecentProjs(d.recent_projects || []);
        setRecentMedia(d.recent_media || []);
        setActivity(d.activity || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const displayName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  const isNewUser = profile?.createdAt
    ? new Date(profile.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    : false;
  const showChecklist = profile?.onboarding_completed && isNewUser && !profile?.onboarding_dismissed;

  const now      = new Date();
  const dayName  = now.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const usedBytes = plan.used_bytes ?? (stats?.storage_bytes ?? 0);
  const subLine  = `${dayName} · ${monthDay} · ${formatSize(usedBytes)} used`;

  const activeProjs = recentProjs.filter(p => p.status === "active" || !p.status);

  const QUICK_ACTIONS = [
    { icon: <CloudArrowUp size={20} weight="duotone" />, label: "Upload media",  onClick: () => navigate("/drive") },
    { icon: <FolderPlus   size={20} weight="duotone" />, label: "New project",   onClick: () => navigate("/projects?new=1") },
    { icon: <Folder       size={20} weight="duotone" />, label: "New folder",    onClick: () => navigate("/drive") },
    { icon: <Eye          size={20} weight="duotone" />, label: "Review",        onClick: () => navigate("/review") },
  ];

  return (
    <DashboardLayout title="Dashboard">
      {showChecklist && <GettingStartedChecklist />}

      <div className="dash-wrap">

        {/* ── Greeting ── */}
        <motion.div
          className="dash-greeting"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="dash-greeting-text">
            Good {getTimeOfDay()},&nbsp;
            <span className="dash-greeting-name">{displayName}.</span>
          </h2>
          <p className="dash-greeting-sub">{subLine}</p>
        </motion.div>

        {/* ── Quick actions ── */}
        <div className="dash-quick-actions">
          {QUICK_ACTIONS.map((a, i) => (
            <motion.button
              key={a.label}
              className="dash-qa-card"
              onClick={a.onClick}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              {a.icon}
              <span>{a.label}</span>
            </motion.button>
          ))}
        </div>

        {/* ── Recent media strip ── */}
        <div className="dash-section">
          <div className="dash-section-head">
            <span className="dash-section-title">Recent</span>
            <span className="dash-section-badge">LAST 7 DAYS</span>
          </div>
          <div className="dash-recent-scroll">
            {loading ? (
              <div className="dash-recent-empty"><span className="spinner" /></div>
            ) : recentMedia.length === 0 ? (
              <div className="dash-recent-empty" style={{ fontSize: 13, color: "var(--text-4)" }}>No recent media</div>
            ) : (
              recentMedia.slice(0, 10).map(m => (
                <button
                  key={m.id}
                  className="dash-recent-card"
                  onClick={() => navigate(`/projects/${m.project_id}/media/${m.id}`)}
                >
                  <div
                    className="dash-recent-thumb"
                    style={{
                      background: m.thumbnail_url
                        ? `url(${m.thumbnail_url}) center/cover`
                        : `linear-gradient(135deg,
                            color-mix(in oklch, ${m.projects?.color || "var(--accent)"} 35%, #0a0a0c),
                            #0a0a0c)`,
                    }}
                  >
                    {!m.thumbnail_url && <VideoCamera size={18} style={{ color: "var(--text-4)", opacity: 0.5 }} />}
                  </div>
                  <div className="dash-recent-info">
                    <span className="dash-recent-name">{m.name}</span>
                    <span className="dash-recent-proj">{m.projects?.name}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Bottom two-column ── */}
        <div className="dash-bottom-grid">

          {/* Active projects */}
          <div className="dash-bottom-col">
            <div className="dash-section-head">
              <span className="dash-section-title">Active projects</span>
              <span className="dash-section-badge">{loading ? "—" : `${activeProjs.length} IN FLIGHT`}</span>
            </div>
            {loading ? (
              <div className="dash-empty-state"><span className="spinner" /></div>
            ) : activeProjs.length === 0 ? (
              <div className="dash-empty-state">
                <p>No active projects</p>
                <button className="btn-primary-sm" onClick={() => navigate("/projects?new=1")}>New Project</button>
              </div>
            ) : (
              <div className="dash-project-list">
                {activeProjs.slice(0, 6).map(p => (
                  <button
                    key={p.id}
                    className="dash-project-row"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <span className="dash-project-dot" style={{ background: p.color || "var(--accent)" }} />
                    <span className="dash-project-name">{p.name}</span>
                    <ArrowRight size={12} className="dash-project-arrow" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="dash-bottom-col">
            <div className="dash-section-head">
              <span className="dash-section-title">Activity</span>
              <span className="dash-section-badge">TODAY</span>
            </div>
            {loading ? (
              <div className="dash-empty-state"><span className="spinner" /></div>
            ) : activity.length === 0 ? (
              <div className="dash-empty-state"><p>No recent activity</p></div>
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
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatActivity(a) {
  const action = (a.action || "").replace(/_/g, " ");
  if (a.entity_name) return `${action}: ${a.entity_name}`;
  return action;
}
