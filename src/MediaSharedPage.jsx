import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShareNetwork, VideoCamera, Link as LinkIcon, Trash, Eye, Clock, Lock } from "@phosphor-icons/react";
import { useAuth } from "./context/AuthContext";
import DashboardLayout from "./DashboardLayout";
import { mediaApi } from "./lib/api.js";

function timeAgo(iso) {
  if (!iso) return "";
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

function isExpired(link) {
  return link.expires_at && new Date(link.expires_at) < new Date();
}

export default function MediaSharedPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [links,   setLinks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    load();
  }, [user, authLoading]);

  async function load() {
    setLoading(true);
    try {
      const { links: data } = await mediaApi.getShareLinks();
      setLinks(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await mediaApi.deleteShareLink(id);
      setLinks(ls => ls.filter(l => l.id !== id));
    } catch {}
  }

  function copyLink(token) {
    const url = `${window.location.origin}/media/share/${token}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  const FRONTEND = window.location.origin;

  return (
    <DashboardLayout title="Shared Links">
      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : error ? (
        <div className="empty-state" style={{ color: "#f87171" }}>{error}</div>
      ) : links.length === 0 ? (
        <div className="empty-state">
          <ShareNetwork size={36} weight="thin" style={{ color: "var(--t3)", marginBottom: 8 }} />
          <p style={{ color: "var(--t3)", fontSize: 13 }}>No shared links yet.</p>
          <p style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>
            Share an asset from a project to see links here.
          </p>
        </div>
      ) : (
        <div className="shared-links-list">
          {links.map((link, i) => {
            const expired = isExpired(link);
            const asset   = link.media_assets;
            const project = link.media_projects;
            const shareUrl = `${FRONTEND}/media/share/${link.token}`;

            return (
              <motion.div
                key={link.id}
                className={`shared-link-row ${expired ? "expired" : ""}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Thumbnail / icon */}
                <div className="shared-link-thumb">
                  {asset?.bunny_thumbnail_url ? (
                    <img src={asset.bunny_thumbnail_url} alt={asset.name} />
                  ) : (
                    <VideoCamera size={18} weight="duotone" style={{ color: "#a78bfa" }} />
                  )}
                </div>

                {/* Info */}
                <div className="shared-link-info">
                  <span className="shared-link-title">
                    {asset?.name || project?.name || "Shared link"}
                  </span>
                  <div className="shared-link-meta-row">
                    {project && (
                      <span
                        className="shared-link-project"
                        onClick={() => navigate(`/media/project/${project.id}`)}
                      >
                        {project.name}
                      </span>
                    )}
                    <span className="shared-link-created">
                      <Clock size={11} />
                      {timeAgo(link.created_at)}
                    </span>
                    {link.view_count > 0 && (
                      <span className="shared-link-views">
                        <Eye size={11} />
                        {link.view_count} view{link.view_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {link.password && (
                      <span className="shared-link-badge">
                        <Lock size={10} /> Password
                      </span>
                    )}
                    {expired && (
                      <span className="shared-link-badge expired-badge">Expired</span>
                    )}
                    {link.expires_at && !expired && (
                      <span className="shared-link-badge">
                        Expires {new Date(link.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <span className="shared-link-url">{shareUrl}</span>
                </div>

                {/* Actions */}
                <div className="shared-link-actions">
                  <button
                    className="btn-ghost shared-link-btn"
                    onClick={() => copyLink(link.token)}
                    title="Copy link"
                  >
                    <LinkIcon size={14} />
                    {copied === link.token ? "Copied!" : "Copy"}
                  </button>
                  <button
                    className="btn-ghost shared-link-btn danger"
                    onClick={() => handleDelete(link.id)}
                    title="Delete link"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
