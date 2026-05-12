import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  DownloadSimple, Lock, Warning, MusicNote, File,
  FileVideo, PaperPlaneTilt, ArrowBendDownRight,
  CaretLeft, CaretRight, X, Clock, Trash,
} from "@phosphor-icons/react";
import { formatSize } from "./lib/userApi";
import { mediaApi } from "./lib/api.js";
import { supabase } from "./lib/supabaseClient";
import VideoPlayer from "./components/media/VideoPlayer";
import CloudflareVideoPlayer from "./components/media/CloudflareVideoPlayer";
import "./styles/videojs-theme.css";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const AVATAR_COLORS = ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#f97316']
function avatarColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function formatDuration(s) {
  if (s == null) return ""
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

export default function MediaSharePage() {
  const { token } = useParams();
  const [state,       setState]      = useState("loading");
  const [data,        setData]       = useState(null);
  const [password,    setPassword]   = useState("");
  const [pwError,     setPwError]    = useState("");
  const [comments,    setComments]   = useState([]);
  const [newComment,  setNewComment] = useState("");
  const [guestName,   setGuestName]  = useState(() => localStorage.getItem('guestCommentName') || "");
  const [ownIds,      setOwnIds]     = useState(() => { try { return JSON.parse(localStorage.getItem('guestCommentIds') || '[]') } catch { return [] } });
  const [submitting,  setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewIdx,  setPreviewIdx] = useState(null);
  const playerRef = useRef(null);

  function seekPlayer(s) { playerRef.current?.seekTo?.(s) }

  useEffect(() => { loadShare() }, [])

  async function loadShare(pw) {
    try {
      const body = await mediaApi.resolveShare(token, pw || undefined)
      setData(body)
      setComments(body.comments || [])
      setState("ready")
    } catch (err) {
      const msg = err.message || ""
      if (msg.includes("Password required") || msg.includes("passwordRequired")) { setState("pw"); return }
      if (msg.includes("Incorrect password")) { setPwError("Incorrect password."); return }
      if (msg.includes("expired")) { setState("expired"); return }
      setState("error")
    }
  }

  const assetIdRef = useRef(null)
  useEffect(() => {
    if (!data?.asset?.id || !supabase) return
    const assetId = data.asset.id
    if (assetIdRef.current === assetId) return
    assetIdRef.current = assetId
    const channel = supabase
      .channel(`share-comments-${assetId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_media_comments', filter: `media_id=eq.${assetId}` },
        (payload) => {
          const c = payload.new
          setComments(cs => cs.some(x => x.id === c.id) ? cs : [...cs, c])
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel); assetIdRef.current = null }
  }, [data?.asset?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownload() {
    try {
      const res = await fetch(`${BASE}/download?asset_id=${data.asset.id}&share_token=${token}&type=download`)
      const { url } = await res.json()
      if (!url) return
      const a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch {}
  }

  async function postComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    setSubmitting(true); setSubmitError(null)
    try {
      const res = await fetch(`${BASE}/media-comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({
          assetId: data?.asset?.id,
          body: newComment.trim(),
          timestampSeconds: currentTime > 0 ? parseFloat(currentTime.toFixed(2)) : null,
          shareToken: token,
          guestName: guestName.trim() || 'Anonymous',
        }),
      })
      const d = await res.json()
      if (d.comment) {
        const name = guestName.trim() || 'Anonymous'
        const newC = { ...d.comment, guest_name: name }
        setComments(cs => [...cs, newC])
        setNewComment("")
        // Persist name + own IDs to localStorage
        localStorage.setItem('guestCommentName', name)
        const nextIds = [...ownIds, d.comment.id]
        setOwnIds(nextIds)
        localStorage.setItem('guestCommentIds', JSON.stringify(nextIds))
      } else {
        setSubmitError(d.error || "Failed to post comment.")
      }
    } catch { setSubmitError("Failed to post comment.") }
    setSubmitting(false)
  }

  async function deleteGuestComment(commentId) {
    setComments(cs => cs.filter(c => c.id !== commentId && c.parent_comment_id !== commentId))
    const nextIds = ownIds.filter(id => id !== commentId)
    setOwnIds(nextIds)
    localStorage.setItem('guestCommentIds', JSON.stringify(nextIds))
    // Best-effort delete via edge function
    try {
      await fetch(`${BASE}/media-comments?id=${commentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
      })
    } catch {}
  }

  /* ── Gate states ── */
  if (state === "loading") return (
    <SpGatePage><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div></SpGatePage>
  )

  if (state === "pw") return (
    <SpGatePage>
      <motion.div className="sp-gate-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="sp-gate-icon"><Lock size={22} weight="duotone" style={{ color: 'var(--accent)' }} /></div>
        <h2 className="sp-gate-title">Password required</h2>
        <p className="sp-gate-sub">This content is password protected.</p>
        <form onSubmit={e => { e.preventDefault(); setPwError(""); loadShare(password) }} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <input type="password" className="sp-compose-input" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} autoFocus style={{ width: '100%' }} />
          {pwError && <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{pwError}</p>}
          <button type="submit" className="sp-gate-btn">Unlock</button>
        </form>
      </motion.div>
    </SpGatePage>
  )

  if (state === "expired") return (
    <SpGatePage>
      <div className="sp-gate-card">
        <div className="sp-gate-icon" style={{ background: 'rgba(248,113,113,0.1)' }}><Warning size={22} weight="duotone" style={{ color: '#f87171' }} /></div>
        <h2 className="sp-gate-title">Link expired</h2>
        <p className="sp-gate-sub">This share link has expired and is no longer accessible.</p>
      </div>
    </SpGatePage>
  )

  if (state === "error") return (
    <SpGatePage>
      <div className="sp-gate-card">
        <div className="sp-gate-icon" style={{ background: 'rgba(248,113,113,0.1)' }}><Warning size={22} weight="duotone" style={{ color: '#f87171' }} /></div>
        <h2 className="sp-gate-title">Not found</h2>
        <p className="sp-gate-sub">This share link doesn't exist or has been removed.</p>
      </div>
    </SpGatePage>
  )

  /* ── Folder / project view ── */
  if (data.type === "folder" || data.type === "project") {
    const { folder, project, assets: folderAssets = [], allowDownload: dlOk } = data
    const title = folder?.name || project?.name || "Shared Folder"
    const previewAsset = previewIdx != null ? folderAssets[previewIdx] : null

    async function downloadAll() {
      for (const a of folderAssets) {
        if (!a.wasabi_key || a.wasabi_status !== 'ready') continue
        try {
          const res = await fetch(`${BASE}/download?asset_id=${a.id}&share_token=${token}&type=download`)
          const { url } = await res.json()
          if (!url) continue
          const el = document.createElement('a')
          el.href = url; el.target = '_blank'; el.rel = 'noopener noreferrer'
          document.body.appendChild(el); el.click(); document.body.removeChild(el)
          await new Promise(r => setTimeout(r, 400))
        } catch {}
      }
    }

    return (
      <div className="page scrollable" style={{ background: 'var(--bg)' }}>
        <div className="noise" />
        <div style={{ position: 'relative', zIndex: 5, maxWidth: 960, margin: '0 auto', padding: '32px 24px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h1>
            {dlOk && folderAssets.some(a => a.wasabi_status === 'ready') && (
              <button className="sp-download-btn" onClick={downloadAll}><DownloadSimple size={14} /> Download all</button>
            )}
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 28 }}>{folderAssets.length} file{folderAssets.length !== 1 ? 's' : ''}</p>
          {folderAssets.length === 0 ? (
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No files in this shared folder.</p>
          ) : (
            <div className="media-asset-grid">
              {folderAssets.map((a, idx) => (
                <SharedAssetTile key={a.id} asset={a} allowDownload={dlOk} parentToken={token} onPreview={() => setPreviewIdx(idx)} />
              ))}
            </div>
          )}
        </div>

        {previewAsset && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPreviewIdx(null)}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 960, background: 'var(--bg-2)', borderRadius: 14, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                <button className="btn-ghost" style={{ fontSize: 12, opacity: previewIdx > 0 ? 1 : 0.3 }} disabled={previewIdx <= 0} onClick={() => setPreviewIdx(i => i - 1)}><CaretLeft size={13} /> Prev</button>
                <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 40, textAlign: 'center' }}>{previewIdx + 1}/{folderAssets.length}</span>
                <button className="btn-ghost" style={{ fontSize: 12, opacity: previewIdx < folderAssets.length - 1 ? 1 : 0.3 }} disabled={previewIdx >= folderAssets.length - 1} onClick={() => setPreviewIdx(i => i + 1)}>Next <CaretRight size={13} /></button>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewAsset.name}</span>
                {dlOk && previewAsset.wasabi_status === 'ready' && <SharedAssetTile asset={previewAsset} allowDownload={dlOk} parentToken={token} downloadOnly />}
                <button className="icon-btn" onClick={() => setPreviewIdx(null)}><X size={15} /></button>
              </div>
              <div style={{ padding: 16 }}><AssetMediaPlayer asset={previewAsset} /></div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Single asset share view ── */
  const { asset, allowDownload, allowComments } = data
  const isVideo = asset?.type === 'video' || asset?.mime_type?.startsWith('video/')
  const isImage = asset?.type === 'image' || asset?.mime_type?.startsWith('image/')
  const isAudio = asset?.type === 'audio' || asset?.mime_type?.startsWith('audio/')
  const topLevel  = comments.filter(c => !c.parent_comment_id)
  const repliesOf = id => comments.filter(c => c.parent_comment_id === id)
  const commentName = c => c.profiles?.full_name || c.guest_name || 'Anonymous'

  return (
    <div className="sp-page">

      {/* ── Topbar ── */}
      <div className="sp-topbar">
        <div className="sp-topbar-left">
          <img src="/logo.png" alt="Eastape" className="sp-logo" onError={e => e.target.style.display = 'none'} />
          <div className="sp-topbar-sep" />
          <span className="sp-topbar-name" title={asset?.name}>{asset?.name}</span>
          {asset?.duration && <span className="sp-meta-pill">{formatDuration(asset.duration)}</span>}
          {asset?.file_size && <span className="sp-meta-pill">{formatSize(asset.file_size)}</span>}
        </div>
        <div className="sp-topbar-right">
          {allowDownload && asset?.wasabi_key && (
            <button className="sp-download-btn" onClick={handleDownload}>
              <DownloadSimple size={14} /> Download
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="sp-body">

        {/* Player area */}
        <div className="sp-player-area">
          <div className="sp-player-wrap">
            {isVideo ? (
              asset?.cloudflare_uid ? (
                <CloudflareVideoPlayer
                  ref={playerRef}
                  mediaId={asset.id}
                  cloudflareUid={asset.cloudflare_uid}
                  cloudflareStatus={asset.cloudflare_status}
                  fallbackUrl={asset.videoUrl}
                  onTimeUpdate={setCurrentTime}
                />
              ) : asset?.videoUrl ? (
                <VideoPlayer ref={playerRef} src={asset.videoUrl} mimeType={asset.mime_type} poster={asset.thumbnailUrl || undefined} onTimeUpdate={setCurrentTime} />
              ) : (
                <div className="sp-no-preview"><FileVideo size={48} weight="thin" /><p>No preview available</p></div>
              )
            ) : isImage ? (
              <img src={asset.videoUrl} alt={asset.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : isAudio ? (
              <div className="sp-audio-wrap">
                <MusicNote size={48} weight="duotone" style={{ color: 'var(--accent)' }} />
                <p style={{ color: 'var(--text-2)', fontSize: 14, fontWeight: 500 }}>{asset.name}</p>
                <audio controls src={asset.videoUrl} style={{ width: '100%', maxWidth: 480 }} />
              </div>
            ) : (
              <div className="sp-no-preview">
                <File size={48} weight="duotone" style={{ color: 'var(--text-3)' }} />
                <p style={{ color: 'var(--text-2)' }}>{asset.name}</p>
                {allowDownload && <button className="sp-download-btn" onClick={handleDownload}><DownloadSimple size={14} /> Download</button>}
              </div>
            )}
          </div>

          {asset?.notes && (
            <div className="sp-notes">
              <p>{asset.notes}</p>
            </div>
          )}
        </div>

        {/* Comments sidebar */}
        {allowComments && (
          <div className="sp-sidebar">
            <div className="sp-sidebar-header">
              <span>Comments</span>
              <span className="sp-comment-count">{comments.length}</span>
            </div>

            <div className="sp-comments">
              {topLevel.length === 0 ? (
                <p className="sp-comments-empty">No comments yet.<br />Be the first!</p>
              ) : (
                topLevel.map(c => (
                  <SpCommentThread
                    key={c.id}
                    comment={c}
                    replies={repliesOf(c.id)}
                    commentName={commentName}
                    onSeek={seekPlayer}
                    ownIds={ownIds}
                    onDelete={deleteGuestComment}
                  />
                ))
              )}
            </div>

            <form className="sp-compose" onSubmit={postComment}>
              {submitError && <p className="sp-compose-error">{submitError}</p>}
              {currentTime > 0 && (
                <div className="sp-compose-ts-hint">
                  <Clock size={11} />
                  At {formatDuration(currentTime)}
                </div>
              )}
              <input
                className="sp-compose-field"
                placeholder="Your name (optional)"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                onBlur={e => { if (e.target.value.trim()) localStorage.setItem('guestCommentName', e.target.value.trim()) }}
                disabled={submitting}
              />
              <div className="sp-compose-row">
                <input
                  className="sp-compose-field sp-compose-comment"
                  placeholder="Add a comment…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  disabled={submitting}
                />
                <button type="submit" className="sp-compose-send" disabled={submitting || !newComment.trim()}>
                  <PaperPlaneTilt size={14} weight="fill" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Comment components ── */
function SpCommentThread({ comment, replies, commentName, onSeek, ownIds, onDelete }) {
  const name = commentName(comment)
  return (
    <div className="sp-comment-thread">
      <SpCommentItem comment={comment} name={name} color={avatarColor(name)} onSeek={onSeek}
        canDelete={ownIds?.includes(comment.id)} onDelete={onDelete} />
      {replies.map(r => {
        const rName = commentName(r)
        return (
          <div key={r.id} className="sp-comment-reply-row">
            <ArrowBendDownRight size={11} className="sp-reply-icon" />
            <SpCommentItem comment={r} name={rName} color={avatarColor(rName)} onSeek={onSeek}
              canDelete={ownIds?.includes(r.id)} onDelete={onDelete} />
          </div>
        )
      })}
    </div>
  )
}

function SpCommentItem({ comment, name, color, onSeek, canDelete, onDelete }) {
  const [hovering, setHovering] = useState(false)
  return (
    <div
      className="sp-comment-item"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="sp-comment-meta">
        <div className="sp-comment-avatar" style={{ background: color }}>{name.charAt(0).toUpperCase()}</div>
        <span className="sp-comment-author">{name}</span>
        {comment.timestamp_seconds != null && (
          <button className="sp-comment-ts" onClick={() => onSeek(comment.timestamp_seconds)}>
            {formatDuration(comment.timestamp_seconds)}
          </button>
        )}
        <span className="sp-comment-age">{timeAgo(comment.created_at)}</span>
        {canDelete && hovering && (
          <button
            className="comment-action comment-delete"
            style={{ marginLeft: 'auto', color: 'var(--text-4)', display: 'flex', alignItems: 'center' }}
            onClick={() => onDelete?.(comment.id)}
            title="Delete"
          >
            <Trash size={11} />
          </button>
        )}
      </div>
      <p className="sp-comment-body">{comment.body}</p>
    </div>
  )
}

/* ── Folder helpers ── */
function AssetMediaPlayer({ asset }) {
  const isVideo = asset?.type === 'video' || asset?.mime_type?.startsWith('video/')
  const isImage = asset?.type === 'image' || asset?.mime_type?.startsWith('image/')
  const isAudio = asset?.type === 'audio' || asset?.mime_type?.startsWith('audio/')
  if (!asset?.videoUrl) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 48, color: 'var(--text-3)' }}>
      <FileVideo size={40} weight="thin" /><p style={{ fontSize: 13 }}>No preview available</p>
    </div>
  )
  if (isVideo) {
    if (asset.cloudflare_uid && asset.cloudflare_status === 'ready') return (
      <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', background: '#000', position: 'relative' }}>
        <iframe src={`https://iframe.cloudflarestream.com/${asset.cloudflare_uid}?autoplay=true&letterboxColor=transparent&primaryColor=%23f59e0b`} style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 }} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    )
    return <VideoPlayer src={asset.videoUrl} mimeType={asset.mime_type} poster={asset.thumbnailUrl || undefined} />
  }
  if (isImage) return <img src={asset.videoUrl} alt={asset.name} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }} />
  if (isAudio) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}>
      <MusicNote size={40} weight="duotone" style={{ color: 'var(--accent)' }} />
      <audio controls src={asset.videoUrl} style={{ width: '100%' }} autoPlay />
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 48, color: 'var(--text-3)' }}>
      <File size={40} weight="duotone" /><p style={{ fontSize: 13 }}>{asset.name}</p>
    </div>
  )
}

function SharedAssetTile({ asset, allowDownload, parentToken, onPreview, downloadOnly }) {
  const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  async function handleDownload(e) {
    e?.stopPropagation()
    try {
      const res = await fetch(`${BASE_URL}/download?asset_id=${asset.id}&share_token=${parentToken}&type=download`)
      const { url } = await res.json()
      if (!url) return
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch {}
  }
  if (downloadOnly) return allowDownload && asset.wasabi_status === 'ready' ? (
    <button className="btn-ghost" style={{ fontSize: 12 }} onClick={handleDownload}><DownloadSimple size={13} /> Download</button>
  ) : null
  const canView = asset.wasabi_status === 'ready' && asset.videoUrl
  return (
    <div className="media-asset-card" style={{ cursor: canView ? 'pointer' : 'default' }} onClick={canView ? onPreview : undefined}>
      <div className="media-asset-thumb">
        {asset.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt={asset.name} onError={e => { e.target.style.display = 'none' }} />
        ) : (
          <FileVideo size={32} weight="duotone" style={{ color: 'var(--accent)' }} />
        )}
        {asset.duration && <span className="media-duration-badge">{formatDuration(asset.duration)}</span>}
      </div>
      <div className="media-asset-info">
        <span className="media-asset-name">{asset.name}</span>
        <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
          {canView && <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={e => { e.stopPropagation(); onPreview?.() }}><CaretRight size={11} /> View</button>}
          {allowDownload && asset.wasabi_status === 'ready' && <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={handleDownload}><DownloadSimple size={11} /> Download</button>}
        </div>
      </div>
    </div>
  )
}

function SpGatePage({ children }) {
  return (
    <div className="sp-gate-page">
      <div className="sp-gate-logo">
        <img src="/logo.png" alt="Eastape" style={{ height: 28 }} onError={e => e.target.style.display = 'none'} />
      </div>
      {children}
    </div>
  )
}
