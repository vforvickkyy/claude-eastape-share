import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  DownloadSimple, Lock, Warning, MusicNote, File,
  FileImage, FileVideo, ChatCircle, PaperPlaneTilt, X,
  Play,
} from "@phosphor-icons/react";
import SiteHeader from "./SiteHeader";
import { formatSize } from "./lib/userApi";
import { mediaApi } from "./lib/api.js";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export default function MediaSharePage() {
  const { token } = useParams();
  const [state,      setState]     = useState("loading");
  const [data,       setData]      = useState(null);
  const [password,   setPassword]  = useState("");
  const [pwError,    setPwError]   = useState("");
  const [comments,   setComments]  = useState([]);
  const [newComment, setNewComment] = useState("");
  const [guestName,  setGuestName]  = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef(null);
  const [assetPreview, setAssetPreview] = useState(null);

  useEffect(() => { loadShare(); }, []);

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

  async function handleDownload() {
    try {
      const res = await fetch(`${BASE}/download?asset_id=${data.asset.id}&share_token=${token}&type=download`)
      const { url } = await res.json()
      if (!url) return
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {}
  }

  async function postComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/media-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: data?.asset?.id,
          body: newComment.trim(),
          timestampSeconds: currentTime > 0 ? Math.floor(currentTime) : null,
          shareToken: token,
          guestName: guestName.trim() || 'Anonymous',
        }),
      });
      const d = await res.json();
      if (d.comment) {
        setComments(cs => [...cs, { ...d.comment, guest_name: guestName.trim() || 'Anonymous' }]);
        setNewComment("");
      }
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
          <form onSubmit={e => { e.preventDefault(); setPwError(""); loadShare(password); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="password" className="form-input" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
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

    async function downloadAll() {
      for (const a of folderAssets) {
        if (!a.wasabi_key || a.wasabi_status !== 'ready') continue;
        try {
          const res = await fetch(`${BASE}/download?asset_id=${a.id}&share_token=${token}&type=download`);
          const { url } = await res.json();
          if (!url) continue;
          const el = document.createElement('a');
          el.href = url; el.target = '_blank'; el.rel = 'noopener noreferrer';
          document.body.appendChild(el); el.click(); document.body.removeChild(el);
          await new Promise(r => setTimeout(r, 400));
        } catch {}
      }
    }

    return (
      <PageShell>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h1>
            {dlOk && folderAssets.some(a => a.wasabi_status === 'ready') && (
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={downloadAll}>
                <DownloadSimple size={14} /> Download all
              </button>
            )}
          </div>
          <p style={{ color: "var(--t3)", fontSize: 12, marginBottom: 24 }}>{folderAssets.length} file{folderAssets.length !== 1 ? "s" : ""}</p>
          {folderAssets.length === 0 ? (
            <p style={{ color: "var(--t3)", fontSize: 13 }}>No files in this shared folder.</p>
          ) : (
            <div className="media-asset-grid">
              {folderAssets.map(a => (
                <SharedAssetTile key={a.id} asset={a} allowDownload={dlOk} parentToken={token} onPreview={() => setAssetPreview(a)} />
              ))}
            </div>
          )}
        </div>

        {/* Asset preview overlay */}
        {assetPreview && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={() => setAssetPreview(null)}
          >
            <div style={{ position: 'relative', width: '100%', maxWidth: 900, background: '#0d1320', borderRadius: 12, overflow: 'hidden', padding: 16 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600 }}>{assetPreview.name}</span>
                <button className="btn-ghost" onClick={() => setAssetPreview(null)}><X size={16} /></button>
              </div>
              {assetPreview.videoUrl ? (
                assetPreview.type === 'video' || assetPreview.mime_type?.startsWith('video/') ? (
                  <video src={assetPreview.videoUrl} poster={assetPreview.thumbnailUrl} controls autoPlay playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: '70vh' }} />
                ) : assetPreview.type === 'image' || assetPreview.mime_type?.startsWith('image/') ? (
                  <img src={assetPreview.videoUrl} alt={assetPreview.name} style={{ width: '100%', objectFit: 'contain', maxHeight: '70vh' }} />
                ) : assetPreview.type === 'audio' || assetPreview.mime_type?.startsWith('audio/') ? (
                  <audio controls src={assetPreview.videoUrl} style={{ width: '100%' }} autoPlay />
                ) : null
              ) : (
                <p style={{ color: 'var(--t3)', textAlign: 'center', padding: 32 }}>No preview available</p>
              )}
              {dlOk && assetPreview.wasabi_status === 'ready' && (
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <SharedAssetTile asset={assetPreview} allowDownload={dlOk} parentToken={token} downloadOnly />
                </div>
              )}
            </div>
          </div>
        )}
      </PageShell>
    );
  }

  /* ── Asset view ── */
  const { asset, allowDownload, allowComments } = data;
  const isVideo = asset?.type === 'video' || asset?.mime_type?.startsWith('video/')
  const isImage = asset?.type === 'image' || asset?.mime_type?.startsWith('image/')
  const isAudio = asset?.type === 'audio' || asset?.mime_type?.startsWith('audio/')

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
              {allowDownload && asset?.wasabi_key && (
                <button className="btn-ghost" style={{ fontSize: 13 }} onClick={handleDownload}>
                  <DownloadSimple size={14} /> Download
                </button>
              )}
            </div>
          </div>

          <div className="asset-player share-player">
            {asset?.wasabi_status === 'ready' && asset?.videoUrl ? (
              isVideo ? (
                <video
                  ref={videoRef}
                  src={asset.videoUrl}
                  poster={asset.thumbnailUrl || undefined}
                  controls
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                  onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
                />
              ) : isImage ? (
                <img src={asset.videoUrl} alt={asset.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : isAudio ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%' }}>
                  <MusicNote size={48} weight="duotone" style={{ color: 'var(--purple-l)' }} />
                  <p style={{ color: 'var(--t2)' }}>{asset.name}</p>
                  <audio controls src={asset.videoUrl} style={{ width: '100%', maxWidth: 400 }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '100%' }}>
                  <File size={48} weight="duotone" style={{ color: 'var(--t3)' }} />
                  <p style={{ color: 'var(--t2)' }}>{asset.name}</p>
                  {allowDownload && <button className="btn-primary-sm" onClick={handleDownload}><DownloadSimple size={14} /> Download</button>}
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: '100%' }}>
                <FileVideo size={48} weight="thin" style={{ color: 'var(--t3)' }} />
                <p style={{ color: 'var(--t3)' }}>No preview available</p>
              </div>
            )}
          </div>
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
                          onClick={() => { if (videoRef.current) videoRef.current.currentTime = c.timestamp_seconds }}
                        >
                          {formatDuration(c.timestamp_seconds)}
                        </button>
                      )}
                      <span className="share-comment-author">{c.profiles?.full_name || c.guest_name || "Anonymous"}</span>
                    </div>
                    <p className="share-comment-body">{c.body}</p>
                  </div>
                ))
              )}
            </div>

            <form className="share-comment-form" onSubmit={postComment}>
              {currentTime > 0 && (
                <span className="share-comment-time-hint">Comment at {formatDuration(currentTime)}</span>
              )}
              <input
                className="form-input"
                placeholder="Your name (optional)"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                disabled={submitting}
                style={{ marginBottom: 6 }}
              />
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

function SharedAssetTile({ asset, allowDownload, parentToken, onPreview, downloadOnly }) {
  const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

  async function handleDownload(e) {
    e?.stopPropagation()
    try {
      const res = await fetch(`${BASE}/download?asset_id=${asset.id}&share_token=${parentToken}&type=download`)
      const { url } = await res.json()
      if (!url) return
      const a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch {}
  }

  if (downloadOnly) {
    return allowDownload && asset.wasabi_status === 'ready' ? (
      <button className="btn-ghost" style={{ fontSize: 13 }} onClick={handleDownload}>
        <DownloadSimple size={14} /> Download
      </button>
    ) : null;
  }

  const canView = asset.wasabi_status === 'ready' && asset.videoUrl

  return (
    <div className="media-asset-card" style={{ cursor: canView ? 'pointer' : 'default' }} onClick={canView ? onPreview : undefined}>
      <div className="media-asset-thumb">
        {asset.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt={asset.name} onError={e => { e.target.style.display = 'none' }} />
        ) : (
          <FileVideo size={36} weight="duotone" style={{ color: "#a78bfa" }} />
        )}
        {asset.duration && (
          <span className="media-duration-badge">{formatDuration(asset.duration)}</span>
        )}
      </div>
      <div className="media-asset-info">
        <span className="media-asset-name">{asset.name}</span>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {canView && (
            <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={e => { e.stopPropagation(); onPreview?.(); }}>
              <Play size={11} /> View
            </button>
          )}
          {allowDownload && asset.wasabi_status === 'ready' && (
            <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={handleDownload}>
              <DownloadSimple size={12} /> Download
            </button>
          )}
        </div>
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
