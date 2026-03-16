import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DownloadSimple, Lock, Warning, VideoCamera, ChatCircle, PaperPlaneTilt,
} from "@phosphor-icons/react";
import SiteHeader from "./SiteHeader";
import { formatSize } from "./lib/userApi";
import { mediaApi } from "./lib/api.js";

export default function MediaSharePage() {
  const { token } = useParams();
  const [state,    setState]   = useState("loading"); // loading|pw|ready|expired|error
  const [data,     setData]    = useState(null);
  const [password, setPassword] = useState("");
  const [pwError,  setPwError]  = useState("");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const iframeRef = useRef(null);

  useEffect(() => { loadShare(); }, []);

  useEffect(() => {
    function onMsg(e) {
      if (e.data?.event === "timeupdate" && typeof e.data.currentTime === "number") {
        setCurrentTime(e.data.currentTime);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  async function loadShare(pw) {
    try {
      const body = await mediaApi.resolveShare(token, pw || undefined);
      setData(body);
      setComments(body.comments || []);
      setState("ready");
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("Password required") || msg.includes("passwordRequired")) { setState("pw"); return; }
      if (msg.includes("Incorrect password")) { setPwError("Incorrect password."); return; }
      if (msg.includes("expired")) { setState("expired"); return; }
      setState("error");
    }
  }

  function handlePasswordSubmit(e) {
    e.preventDefault();
    setPwError("");
    loadShare(password);
  }

  async function postComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const d = await mediaApi.createComment({
        assetId: data?.asset?.id,
        body: newComment.trim(),
        timestampSeconds: currentTime > 0 ? Math.floor(currentTime) : null,
        shareToken: token,
      });
      setComments(cs => [...cs, d.comment]);
      setNewComment("");
    } catch {}
    setSubmitting(false);
  }

  /* ── States ── */
  if (state === "loading") return <PageShell><div className="empty-state"><span className="spinner" /></div></PageShell>;

  if (state === "pw") return (
    <PageShell>
      <div className="share-public-center">
        <motion.div className="share-public-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Lock size={32} weight="duotone" style={{ color: "var(--purple-l)" }} />
          <h2 className="share-public-title">Password Required</h2>
          <p style={{ color: "var(--t2)", fontSize: 13, marginBottom: 16 }}>This content is protected.</p>
          <form onSubmit={handlePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="password"
              className="form-input"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
            {pwError && <p style={{ color: "#f87171", fontSize: 12 }}>{pwError}</p>}
            <button type="submit" className="btn-primary-sm">Unlock</button>
          </form>
        </motion.div>
      </div>
    </PageShell>
  );

  if (state === "expired") return (
    <PageShell>
      <div className="share-public-center">
        <div className="share-public-card">
          <Warning size={32} weight="duotone" style={{ color: "#f87171" }} />
          <h2 className="share-public-title">Link Expired</h2>
          <p style={{ color: "var(--t2)", fontSize: 13 }}>This share link has expired and is no longer accessible.</p>
        </div>
      </div>
    </PageShell>
  );

  if (state === "error") return (
    <PageShell>
      <div className="share-public-center">
        <div className="share-public-card">
          <Warning size={32} weight="duotone" style={{ color: "#f87171" }} />
          <h2 className="share-public-title">Not Found</h2>
          <p style={{ color: "var(--t2)", fontSize: 13 }}>This share link doesn't exist or has been removed.</p>
        </div>
      </div>
    </PageShell>
  );

  /* ── Folder / Project view ── */
  if (data.type === "folder" || data.type === "project") {
    const { folder, project, assets: folderAssets = [], allowDownload: dlOk } = data;
    const title = folder?.name || project?.name || "Shared Folder";
    return (
      <PageShell>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 0" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{title}</h1>
          <p style={{ color: "var(--t3)", fontSize: 12, marginBottom: 24 }}>{folderAssets.length} file{folderAssets.length !== 1 ? "s" : ""}</p>
          {folderAssets.length === 0 ? (
            <p style={{ color: "var(--t3)", fontSize: 13 }}>No files in this shared folder.</p>
          ) : (
            <div className="media-asset-grid">
              {folderAssets.map(a => (
                <SharedAssetTile key={a.id} asset={a} allowDownload={dlOk} />
              ))}
            </div>
          )}
        </div>
      </PageShell>
    );
  }

  /* ── Asset view ── */
  const { asset, allowDownload, allowComments } = data;
  const bunnyGuid  = asset?.bunny_video_guid;

  return (
    <PageShell>
      <div className="share-public-asset-layout">

        {/* Player */}
        <div className="share-public-player-wrap">
          <div className="share-public-meta">
            <h1 className="share-public-asset-name">{asset?.name}</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {asset?.duration && (
                <span style={{ color: "var(--t3)", fontSize: 12 }}>{formatDuration(asset.duration)}</span>
              )}
              {asset?.file_size && (
                <span style={{ color: "var(--t3)", fontSize: 12 }}>{formatSize(asset.file_size)}</span>
              )}
              {allowDownload && asset?.bunny_playback_url && (
                <a
                  href={asset.bunny_playback_url}
                  className="btn-ghost"
                  style={{ fontSize: 13 }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <DownloadSimple size={14} /> Download
                </a>
              )}
            </div>
          </div>

          {bunnyGuid && asset?.bunny_playback_url ? (
            <div className="asset-player share-player">
              <iframe
                ref={iframeRef}
                src={`${asset.bunny_playback_url}?autoplay=false&preload=true`}
                style={{ border: "none", width: "100%", height: "100%" }}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
                title={asset?.name}
              />
            </div>
          ) : (
            <div className="asset-player asset-player-processing">
              <VideoCamera size={48} weight="thin" />
              <p>No video available</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {asset?.notes && (
          <div className="share-asset-notes">
            <p className="share-asset-notes-text">{asset.notes}</p>
          </div>
        )}

        {/* Comments */}
        {allowComments && (
          <div className="share-public-comments">
            <div className="share-comments-header">
              <ChatCircle size={15} weight="duotone" />
              <span>Comments ({comments.length})</span>
            </div>

            <div className="share-comments-list">
              {comments.length === 0 ? (
                <p style={{ color: "var(--t3)", fontSize: 12, padding: "12px 0" }}>No comments yet. Be the first!</p>
              ) : (
                comments.map(c => (
                  <div key={c.id} className="share-comment-item">
                    <div className="share-comment-meta">
                      {c.timestamp_seconds != null && (
                        <button
                          className="share-comment-ts"
                          onClick={() => iframeRef.current?.contentWindow?.postMessage({ event: "seek", seconds: c.timestamp_seconds }, "*")}
                        >
                          {formatDuration(c.timestamp_seconds)}
                        </button>
                      )}
                      <span className="share-comment-author">{c.profiles?.full_name || "Anonymous"}</span>
                    </div>
                    <p className="share-comment-body">{c.body}</p>
                  </div>
                ))
              )}
            </div>

            <form className="share-comment-form" onSubmit={postComment}>
              {currentTime > 0 && (
                <span className="share-comment-time-hint">
                  Comment at {formatDuration(currentTime)}
                </span>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="Leave a comment…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  disabled={submitting}
                />
                <button type="submit" className="btn-primary-sm" disabled={submitting || !newComment.trim()}>
                  <PaperPlaneTilt size={14} />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function SharedAssetTile({ asset, allowDownload }) {
  const hasVideo = asset.bunny_video_status === "ready" && asset.bunny_playback_url;
  return (
    <div className="media-asset-card" style={{ cursor: "default" }}>
      <div className="media-asset-thumb">
        {asset.bunny_thumbnail_url ? (
          <img src={asset.bunny_thumbnail_url} alt={asset.name} />
        ) : (
          <VideoCamera size={36} weight="duotone" style={{ color: "#a78bfa" }} />
        )}
        {asset.duration && (
          <span className="media-duration-badge">{formatDuration(asset.duration)}</span>
        )}
      </div>
      <div className="media-asset-info">
        <span className="media-asset-name">{asset.name}</span>
        {allowDownload && hasVideo && (
          <a
            href={asset.bunny_playback_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            style={{ fontSize: 11, padding: "2px 8px", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={e => e.stopPropagation()}
          >
            <DownloadSimple size={12} /> Download
          </a>
        )}
      </div>
    </div>
  );
}

function PageShell({ children }) {
  return (
    <div className="page scrollable">
      <div className="noise" />
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 5, padding: "0 24px 40px", flex: 1 }}>
        {children}
      </main>
    </div>
  );
}

function formatDuration(s) {
  if (s == null) return "";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
