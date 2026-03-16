import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HardDrive, VideoCamera, Clock, CloudArrowUp, Files,
  LinkSimple, Users, ArrowRight, ChartBar,
} from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import { userApiFetch, formatSize, totalShareSize } from "./lib/userApi";

const CARD_VARIANTS = {
  hidden:  { opacity: 0, y: 16 },
  visible: i => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] } }),
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [shares,   setShares]   = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      userApiFetch("/api/user/files?limit=6").then(d => d.shares || []).catch(() => []),
      userApiFetch("/api/media/projects").then(d => d.projects || []).catch(() => []),
    ]).then(([s, p]) => { setShares(s); setProjects(p); })
      .finally(() => setLoading(false));
  }, [user]);

  const totalFiles   = shares.reduce((s, sh) => s + (sh.files?.length || 0), 0);
  const totalStorage = shares.reduce((s, sh) => s + totalShareSize(sh), 0);
  const activeLinks  = shares.filter(sh => new Date(sh.expires_at) > new Date()).length;

  const displayName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  return (
    <DashboardLayout title="Dashboard">
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
          { icon: <Files size={22} weight="duotone" />,     value: totalFiles,               label: "Drive Files"    },
          { icon: <ChartBar size={22} weight="duotone" />,  value: formatSize(totalStorage), label: "Storage Used"   },
          { icon: <LinkSimple size={22} weight="duotone" />, value: activeLinks,              label: "Active Links"   },
          { icon: <VideoCamera size={22} weight="duotone" />, value: projects.length,         label: "Media Projects" },
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

        {/* ── Drive card ── */}
        <motion.div className="dash-widget" custom={0} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <HardDrive size={18} weight="duotone" className="dash-widget-icon drive" />
            <span className="dash-widget-title">Drive</span>
            <button className="btn-ghost dash-widget-link" onClick={() => navigate("/drive")}>
              View all <ArrowRight size={13} weight="bold" />
            </button>
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
          ) : shares.length === 0 ? (
            <div className="dash-empty">
              <p>No files uploaded yet</p>
              <button className="btn-primary-sm" onClick={() => navigate("/upload")}>Upload files</button>
            </div>
          ) : (
            <div className="dash-file-list">
              {shares.slice(0, 4).map(sh => (
                <div key={sh.token} className="dash-file-row">
                  <Files size={14} weight="duotone" className="dash-file-icon" />
                  <span className="dash-file-name">{sh.files?.[0]?.name || "Untitled"}</span>
                  <span className="dash-file-meta">{formatSize(totalShareSize(sh))}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Media card ── */}
        <motion.div className="dash-widget" custom={1} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <VideoCamera size={18} weight="duotone" className="dash-widget-icon media" />
            <span className="dash-widget-title">Media Projects</span>
            <button className="btn-ghost dash-widget-link" onClick={() => navigate("/media")}>
              View all <ArrowRight size={13} weight="bold" />
            </button>
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
          ) : projects.length === 0 ? (
            <div className="dash-empty">
              <p>No media projects yet</p>
              <button className="btn-primary-sm" onClick={() => navigate("/media")}>New Project</button>
            </div>
          ) : (
            <div className="dash-project-list">
              {projects.slice(0, 4).map(p => (
                <button
                  key={p.id}
                  className="dash-project-row"
                  onClick={() => navigate(`/media/project/${p.id}`)}
                >
                  <span className="dash-project-dot" style={{ background: p.color || "#7c3aed" }} />
                  <span className="dash-project-name">{p.name}</span>
                  <ArrowRight size={12} className="dash-project-arrow" />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Storage bar ── */}
        <motion.div className="dash-widget dash-storage" custom={2} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <HardDrive size={18} weight="duotone" className="dash-widget-icon drive" />
            <span className="dash-widget-title">Storage</span>
          </div>
          <div className="storage-bar-wrap">
            <div className="storage-bar-track">
              <div
                className="storage-bar-fill"
                style={{ width: `${Math.min(100, (totalStorage / (5 * 1024 * 1024 * 1024)) * 100).toFixed(1)}%` }}
              />
            </div>
            <div className="storage-bar-labels">
              <span>{formatSize(totalStorage)} used</span>
              <span>5 GB total</span>
            </div>
          </div>
          <button className="btn-ghost" style={{ marginTop: 10, fontSize: 12 }} onClick={() => navigate("/plans")}>
            Upgrade plan
          </button>
        </motion.div>

        {/* ── Quick upload CTA ── */}
        <motion.div className="dash-widget dash-upload-cta" custom={3} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <CloudArrowUp size={18} weight="duotone" className="dash-widget-icon upload" />
            <span className="dash-widget-title">Quick Upload</span>
          </div>
          <p className="dash-upload-desc">Share files instantly via secure links. Links expire after 7 days.</p>
          <button className="db-new-btn" style={{ marginTop: 12 }} onClick={() => navigate("/upload")}>
            <CloudArrowUp size={15} weight="bold" /> New Upload
          </button>
        </motion.div>

        {/* ── Recent activity ── */}
        <motion.div className="dash-widget dash-activity" custom={4} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <Clock size={18} weight="duotone" className="dash-widget-icon" />
            <span className="dash-widget-title">Recent Activity</span>
            <button className="btn-ghost dash-widget-link" onClick={() => navigate("/recent")}>
              View all <ArrowRight size={13} weight="bold" />
            </button>
          </div>
          {loading ? (
            <div className="empty-state" style={{ padding: "24px 0" }}><span className="spinner" /></div>
          ) : shares.length === 0 ? (
            <div className="dash-empty"><p>No recent activity</p></div>
          ) : (
            <div className="dash-activity-list">
              {shares.slice(0, 5).map(sh => (
                <div key={sh.token} className="dash-activity-row">
                  <span className="dash-activity-dot" />
                  <div className="dash-activity-info">
                    <span className="dash-activity-label">Uploaded "{sh.files?.[0]?.name || "file"}"</span>
                    <span className="dash-activity-time">
                      {sh.created_at ? timeAgo(sh.created_at) : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Team overview ── */}
        <motion.div className="dash-widget" custom={5} variants={CARD_VARIANTS} initial="hidden" animate="visible">
          <div className="dash-widget-head">
            <Users size={18} weight="duotone" className="dash-widget-icon" />
            <span className="dash-widget-title">Team</span>
          </div>
          <div className="dash-empty">
            <p>Invite team members in any Media project to collaborate.</p>
            <button className="btn-primary-sm" onClick={() => navigate("/media")}>Go to Media</button>
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
}

/* ── helpers ── */
function getToken() {
  try { return JSON.parse(localStorage.getItem("ets_auth"))?.access_token; } catch { return null; }
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
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
