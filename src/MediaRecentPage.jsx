import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { VideoCamera, Clock } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import { mediaApi } from "./lib/api.js";
import { formatSize } from "./lib/userApi";

function formatDuration(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_COLORS = {
  draft:    { bg: "rgba(148,163,184,0.1)", color: "#94a3b8" },
  review:   { bg: "rgba(245,158,11,0.12)", color: "#fbbf24" },
  approved: { bg: "rgba(34,197,94,0.12)",  color: "#4ade80" },
  revision: { bg: "rgba(239,68,68,0.12)",  color: "#f87171" },
};

export default function MediaRecentPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [assets,  setAssets]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    load();
  }, [user, authLoading]);

  async function load() {
    setLoading(true);
    try {
      const { assets: data } = await mediaApi.getAssets({ limit: 40 });
      setAssets(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout title="Recent">
      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : error ? (
        <div className="empty-state" style={{ color: "#f87171" }}>{error}</div>
      ) : assets.length === 0 ? (
        <div className="empty-state">
          <Clock size={36} weight="thin" style={{ color: "var(--t3)", marginBottom: 8 }} />
          <p style={{ color: "var(--t3)", fontSize: 13 }}>No recent assets yet.</p>
        </div>
      ) : (
        <div className="media-recent-list">
          {assets.map((asset, i) => (
            <motion.div
              key={asset.id}
              className="media-recent-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => navigate(`/media/asset/${asset.id}`)}
            >
              {/* Thumbnail */}
              <div className="media-recent-thumb">
                {asset.bunny_thumbnail_url ? (
                  <img src={asset.bunny_thumbnail_url} alt={asset.name} />
                ) : (
                  <VideoCamera size={20} weight="duotone" style={{ color: "#a78bfa" }} />
                )}
                {asset.duration && (
                  <span className="media-duration-badge">{formatDuration(asset.duration)}</span>
                )}
              </div>

              {/* Info */}
              <div className="media-recent-info">
                <span className="media-recent-name">{asset.name}</span>
                <span className="media-recent-project">
                  {asset.media_projects?.name || "Unknown project"}
                </span>
              </div>

              {/* Status */}
              {asset.status && (
                <span
                  className="status-badge"
                  style={STATUS_COLORS[asset.status] || STATUS_COLORS.draft}
                >
                  {asset.status}
                </span>
              )}

              {/* Meta */}
              <div className="media-recent-meta">
                {asset.file_size && (
                  <span>{formatSize(asset.file_size)}</span>
                )}
                <span>{timeAgo(asset.created_at)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
