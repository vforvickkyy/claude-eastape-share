import React, { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, DownloadSimple, Trash, Copy, CheckCircle,
  Check, X, SidebarSimple, MusicNote, File,
  CaretLeft, CaretRight,
  Play, Pause, SkipBack, SkipForward,
  SpeakerSimpleHigh, SpeakerSimpleLow, SpeakerSimpleX,
  Repeat, FrameCorners, LinkSimple, ToggleLeft, ToggleRight,
} from '@phosphor-icons/react'
import { useAuth } from './context/AuthContext'
import { useProject } from './context/ProjectContext'
import CommentsPanel from './components/media/CommentsPanel'
import VersionsPanel from './components/media/VersionsPanel'
import ShareModal from './components/media/ShareModal'
import VideoPlayer from './components/media/VideoPlayer'
import CloudflareVideoPlayer from './components/media/CloudflareVideoPlayer'
import { projectMediaApi, shareLinksApi, cloudflareApi, formatSize } from './lib/api'
import './styles/videojs-theme.css'

const REFRESH_INTERVAL = 3.5 * 60 * 60 * 1000

const STATUS_OPTIONS = [
  { value: 'in_review', label: 'In Review', class: 'badge-review'   },
  { value: 'approved',  label: 'Approved',  class: 'badge-approved' },
  { value: 'revision',  label: 'Revision',  class: 'badge-revision' },
]

export default function ProjectMediaAssetPage() {
  const { user, loading: authLoading } = useAuth()
  const { project } = useProject()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { id: projectId, mediaId } = useParams()
  const backPath  = location.state?.from?.startsWith('/')
    ? location.state.from
    : location.state?.from === 'manage'
      ? `/projects/${projectId}/manage`
      : `/projects/${projectId}/files`

  const [asset,          setAsset]         = useState(null)
  const [loading,        setLoading]       = useState(true)
  const [videoSrc,       setVideoSrc]      = useState(null)
  const [thumbSrc,       setThumbSrc]      = useState(null)
  const [previewVersion, setPreviewVersion] = useState(null)  // null = current version
  const [seekTarget,     setSeekTarget]    = useState(0)      // seconds to seek to after version switch
  const [tab,            setTab]           = useState('comments')
  const [currentTime,    setCurrentTime]   = useState(0)
  const [editName,       setEditName]      = useState(false)
  const [nameVal,        setNameVal]       = useState('')
  const [copied,         setCopied]        = useState(false)
  const [showShare,          setShowShare]          = useState(false)
  const [showShareSettings,  setShowShareSettings]  = useState(false)
  const [shareSettings,      setShareSettings]      = useState({ allow_download: true, allow_comments: true })
  const shareSettingsRef = useRef(null)
  const [sidebarOpen,    setSidebarOpen]   = useState(true)
  const [editNotes,      setEditNotes]     = useState(false)
  const [notesVal,       setNotesVal]      = useState('')
  const [siblings,       setSiblings]      = useState([])
  const [isPlaying,      setIsPlaying]     = useState(false)
  const [duration,       setDuration]      = useState(0)
  const [timelineComments, setTimelineComments] = useState([])

  const playerRef = useRef(null)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true })
  }, [user, authLoading])

  useEffect(() => {
    if (!user || !mediaId) return
    loadAsset()
  }, [user, mediaId])

  async function loadAsset() {
    setLoading(true)
    try {
      const d = await projectMediaApi.get(mediaId)
      const a = d.asset || d.media
      setAsset(a)
      setNameVal(a?.name || '')
      setNotesVal(a?.notes || '')
      setShareSettings({
        allow_download: a?.allow_download !== false,
        allow_comments: a?.allow_comments !== false,
      })
      if (a?.wasabi_status === 'ready') {
        await fetchPlaybackUrl(a)
      }
      // Fetch siblings for prev/next
      if (a?.project_id) {
        projectMediaApi.list({ projectId: a.project_id, folderId: a.folder_id || 'root' })
          .then(sd => {
            const list = sd.assets || sd.media || []
            setSiblings([...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
          })
          .catch(() => {})
      }
    } catch {
      navigate(`/projects/${projectId}/media`)
    } finally {
      setLoading(false)
    }
  }

  async function fetchPlaybackUrl(a = asset) {
    if (!a?.wasabi_key) return
    try {
      const { url, thumbnailUrl } = await projectMediaApi.getViewUrl(a.id)
      setVideoSrc(url)
      if (thumbnailUrl) setThumbSrc(thumbnailUrl)
    } catch {}
  }

  useEffect(() => {
    if (!asset?.wasabi_status === 'ready') return
    const interval = setInterval(() => fetchPlaybackUrl(), REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [asset?.id])

  // Auto-ingest into Cloudflare Stream for videos not yet there,
  // or re-ingest if stuck in 'pending' (old TUS placeholder that was never uploaded).
  useEffect(() => {
    if (!asset) return
    const isVid = asset.type === 'video' || asset.mime_type?.startsWith('video/')
    if (!isVid) return
    if (asset.wasabi_status !== 'ready') return

    // Skip if already successfully ingested and processing/ready
    const alreadyOk = asset.cloudflare_uid &&
      asset.cloudflare_status !== 'none' &&
      asset.cloudflare_status !== 'pending'
    if (alreadyOk) return

    cloudflareApi.ingestFromUrl(asset.id)
      .then(d => {
        if (d?.uid) {
          setAsset(a => ({ ...a, cloudflare_uid: d.uid, cloudflare_status: 'processing' }))
        }
      })
      .catch(() => {})
  }, [asset?.id])

  async function saveName() {
    if (!nameVal.trim() || nameVal === asset.name) { setEditName(false); return }
    await projectMediaApi.update(mediaId, { name: nameVal.trim() }).catch(() => {})
    setAsset(a => ({ ...a, name: nameVal.trim() }))
    setEditName(false)
  }

  async function saveNotes() {
    await projectMediaApi.update(mediaId, { notes: notesVal }).catch(() => {})
    setAsset(a => ({ ...a, notes: notesVal }))
    setEditNotes(false)
  }

  async function changeStatus(status) {
    await projectMediaApi.update(mediaId, { status }).catch(() => {})
    setAsset(a => ({ ...a, status }))
  }

  async function handleDelete() {
    if (!confirm('Delete this asset? This cannot be undone.')) return
    await projectMediaApi.delete(mediaId).catch(() => {})
    navigate(`/projects/${projectId}/media`)
  }

  async function handleDownload() {
    try {
      const { url } = await projectMediaApi.getDownloadUrl(mediaId)
      if (!url) return
      const a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch (err) {
      alert('Download failed: ' + err.message)
    }
  }

  useEffect(() => {
    if (!showShareSettings) return
    const handler = (e) => {
      if (shareSettingsRef.current && !shareSettingsRef.current.contains(e.target)) {
        setShowShareSettings(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showShareSettings])

  async function toggleShareSetting(key) {
    const next = { ...shareSettings, [key]: !shareSettings[key] }
    setShareSettings(next)
    await projectMediaApi.update(mediaId, next).catch(() => {})
  }

  async function copyShareLink() {
    try {
      const data = await shareLinksApi.create({
        project_media_id: mediaId,
        allow_download: shareSettings.allow_download,
        allow_comments: shareSettings.allow_comments,
      })
      const token = data.link?.token || data.share_link?.token
      const url = `${window.location.origin}/media/share/${token}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  function seekTo(seconds) {
    playerRef.current?.seekTo(seconds)
  }

  async function handlePreviewVersion(versionData, seekSeconds = 0) {
    if (!versionData) {
      // Restore current version
      setSeekTarget(0)
      setPreviewVersion(null)
      if (asset?.wasabi_status === 'ready') fetchPlaybackUrl(asset)
      return
    }
    setSeekTarget(seekSeconds)
    setPreviewVersion(versionData)
    // For Cloudflare videos, the player re-mounts via key change — startTime handles seek
    // For Wasabi-only files, fetch a presigned URL for the version's wasabi_key
    if (!versionData.cloudflare_uid && versionData.wasabi_key) {
      try {
        const { url, thumbnailUrl } = await projectMediaApi.getVersionViewUrl(
          mediaId, versionData.wasabi_key, versionData.wasabi_thumbnail_key || null
        )
        setVideoSrc(url)
        if (thumbnailUrl) setThumbSrc(thumbnailUrl)
      } catch {}
    }
  }

  const statusMeta = STATUS_OPTIONS.find(s => s.value === asset?.status) || STATUS_OPTIONS[0]
  // When previewing a previous version, overlay its fields on the current asset
  const effectiveAsset = previewVersion ? { ...asset, ...previewVersion } : asset
  const isVideo = asset?.type === 'video' || asset?.mime_type?.startsWith('video/')
  const isImage = asset?.type === 'image' || asset?.mime_type?.startsWith('image/')
  const isAudio = asset?.type === 'audio' || asset?.mime_type?.startsWith('audio/')

  if (loading) return (
    <div className="viewer-page">
      <div className="viewer-topbar">
        <div className="skel skel-btn" style={{ width: 80 }} />
        <div className="skel skel-title" style={{ width: 260 }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div className="skel skel-btn" style={{ width: 80 }} />
          <div className="skel skel-btn" style={{ width: 80 }} />
        </div>
      </div>
      <div className="viewer-body">
        <div className="skel" style={{ flex: 1, margin: 24, borderRadius: 12 }} />
        <div className="viewer-right-panel" style={{ borderLeft: '1px solid var(--line)' }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skel skel-tab-row" />
            {[90, 70, 80, 60, 90, 70].map((w, i) => (
              <div key={i} className="skel skel-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  if (!asset) return (
    <div className="viewer-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-3)' }}>Asset not found</p>
    </div>
  )

  return (
    <div className="viewer-page">
      {/* ── Viewer Topbar ── */}
      <div className="viewer-topbar">
        <button className="viewer-back-btn" onClick={() => navigate(backPath)} title="Back">
          <ArrowLeft size={15} />
        </button>

        {/* Breadcrumb */}
        <div className="viewer-breadcrumb">
          {project?.name && (
            <>
              <span className="viewer-bc-item" onClick={() => navigate(`/projects/${projectId}`)}>{project.name}</span>
              <span className="viewer-bc-sep">/</span>
            </>
          )}
          {editName ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                className="viewer-name-input"
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditName(false) }}
                autoFocus
              />
              <button className="icon-btn" onClick={saveName}><Check size={13} /></button>
              <button className="icon-btn" onClick={() => setEditName(false)}><X size={13} /></button>
            </span>
          ) : (
            <span className="viewer-bc-current" onClick={() => setEditName(true)} title="Click to rename">
              {asset.name}
            </span>
          )}
        </div>

        <div className="viewer-topbar-right">
          {/* Prev / Next */}
          {siblings.length > 1 && (() => {
            const idx = siblings.findIndex(s => s.id === mediaId)
            const prev = idx > 0 ? siblings[idx - 1] : null
            const next = idx < siblings.length - 1 ? siblings[idx + 1] : null
            return (
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <button className="icon-btn" disabled={!prev} onClick={() => navigate(`/projects/${projectId}/media/${prev.id}`)}>
                  <CaretLeft size={13} />
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-4)', minWidth: 36, textAlign: 'center' }}>{idx + 1}/{siblings.length}</span>
                <button className="icon-btn" disabled={!next} onClick={() => navigate(`/projects/${projectId}/media/${next.id}`)}>
                  <CaretRight size={13} />
                </button>
              </div>
            )
          })()}

          <span className={`media-status-badge ${statusMeta.class}`} style={{ position: 'static' }}>{statusMeta.label}</span>
          <button className="viewer-action-btn" onClick={handleDownload} title="Download">
            <DownloadSimple size={15} />
          </button>

          {/* Share settings + copy link */}
          <div ref={shareSettingsRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line-2)', borderRadius: 7, overflow: 'hidden' }}>
              <button
                className="viewer-action-btn"
                style={{ borderRadius: 0, border: 'none' }}
                onClick={copyShareLink}
                title={copied ? 'Copied!' : 'Copy share link'}
              >
                {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
              </button>
              <div style={{ width: 1, background: 'var(--line-2)', flexShrink: 0 }} />
              <button
                className={`viewer-action-btn${showShareSettings ? ' active' : ''}`}
                style={{ borderRadius: 0, border: 'none', padding: '0 8px' }}
                onClick={() => setShowShareSettings(v => !v)}
                title="Share settings"
              >
                <LinkSimple size={14} />
              </button>
            </div>
            {showShareSettings && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 300,
                background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 10,
                padding: '12px 0', minWidth: 220,
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '0 14px 8px' }}>Share settings</p>
                {[
                  { key: 'allow_download', label: 'Allow download',  sub: 'Viewers can download this file' },
                  { key: 'allow_comments', label: 'Allow comments',  sub: 'Viewers can leave comments' },
                ].map(({ key, label, sub }) => (
                  <button
                    key={key}
                    onClick={() => toggleShareSetting(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {shareSettings[key]
                      ? <ToggleRight size={22} weight="fill" style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      : <ToggleLeft  size={22}               style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                    }
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{sub}</div>
                    </div>
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />
                <div style={{ padding: '0 14px' }}>
                  <button
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 12, height: 32 }}
                    onClick={() => { copyShareLink(); setShowShareSettings(false) }}
                  >
                    {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy share link'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button className="viewer-action-btn" onClick={() => setSidebarOpen(o => !o)} title="Toggle panel">
            <SidebarSimple size={15} />
          </button>
          <button className="viewer-action-btn danger" onClick={handleDelete} title="Delete">
            <Trash size={15} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={`viewer-body ${sidebarOpen ? '' : 'panel-hidden'}`}>
        {/* Player area */}
        <div className="viewer-player-area">
        {/* Player */}
        <div className="asset-player-wrap">
          {asset.wasabi_status === 'ready' ? (
            <>
              {isVideo ? (
                <div className="asset-player">
                  {effectiveAsset.cloudflare_uid ? (
                    <CloudflareVideoPlayer
                      ref={playerRef}
                      key={effectiveAsset.cloudflare_uid}
                      mediaId={asset.id}
                      cloudflareUid={effectiveAsset.cloudflare_uid}
                      cloudflareStatus={effectiveAsset.cloudflare_status}
                      fallbackUrl={videoSrc}
                      startTime={seekTarget}
                      onTimeUpdate={setCurrentTime}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onDurationChange={setDuration}
                      onStatusChange={(newStatus) =>
                        !previewVersion && setAsset(prev => ({ ...prev, cloudflare_status: newStatus }))
                      }
                    />
                  ) : (
                    // No CF uid yet — auto-ingest is running; never fall back to Wasabi
                    <div className="asset-player asset-player-processing">
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        border: '3px solid var(--accent-tint)',
                        borderTop: '3px solid var(--accent)',
                        animation: 'cf-spin 1s linear infinite',
                      }} />
                      <p style={{ color: 'white', fontSize: 15, fontWeight: 600, margin: '16px 0 4px' }}>Preparing video stream…</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>This usually takes 30–60 seconds</p>
                      <style>{`@keyframes cf-spin { 0% { transform:rotate(0deg) } 100% { transform:rotate(360deg) } }`}</style>
                    </div>
                  )}
                </div>
              ) : isImage && videoSrc ? (
                <div className="asset-player" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
                  <img src={videoSrc} alt={asset.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
              ) : isAudio && videoSrc ? (
                <div className="asset-player asset-player-processing" style={{ flexDirection: 'column' }}>
                  <MusicNote size={48} style={{ color: 'var(--purple-l)' }} weight="duotone" />
                  <p style={{ color: 'var(--t2)', marginBottom: 12 }}>{asset.name}</p>
                  <audio controls src={videoSrc} style={{ width: '100%', maxWidth: 420 }} />
                </div>
              ) : (
                <div className="asset-player asset-player-processing">
                  <File size={48} weight="duotone" style={{ opacity: 0.4 }} />
                  <p style={{ marginTop: 12 }}>
                    <button className="btn-primary-sm" onClick={handleDownload}>
                      <DownloadSimple size={14} /> Download file
                    </button>
                  </p>
                </div>
              )}
            </>
          ) : asset.wasabi_status === 'uploading' ? (
            <div className="asset-player asset-player-processing">
              <span className="spinner" style={{ width: 32, height: 32 }} />
              <p style={{ marginTop: 12 }}>Uploading…</p>
            </div>
          ) : (
            <div className="asset-player asset-player-processing">
              <p>No preview available</p>
            </div>
          )}

        </div>

        {/* Notes */}
        <div className="asset-notes-wrap" style={{ padding: '8px 16px 12px', flexShrink: 0 }}>
          {editNotes ? (
            <div className="asset-notes-edit">
              <textarea
                className="asset-notes-textarea"
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                placeholder="Add notes or context for this asset…"
                rows={4}
                autoFocus
              />
              <div className="asset-notes-actions">
                <button className="btn-primary-sm" onClick={saveNotes}>Save</button>
                <button className="btn-ghost" onClick={() => { setNotesVal(asset.notes || ''); setEditNotes(false) }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="asset-notes-display" onClick={() => setEditNotes(true)}>
              {asset.notes
                ? <p className="asset-notes-text">{asset.notes}</p>
                : <span className="asset-notes-placeholder">Add notes… (click to edit)</span>
              }
            </button>
          )}
        </div>

        </div>{/* end viewer-player-area */}

        {/* Right panel */}
        {sidebarOpen && (
          <div className="viewer-right-panel">
            <div className="viewer-panel-tabs">
              {[
                { id: 'comments', label: 'Comments' },
                { id: 'versions', label: 'Versions' },
                { id: 'info',     label: 'Details'  },
              ].map(t => (
                <button
                  key={t.id}
                  className={`viewer-panel-tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.id === 'comments' && tab === 'comments' && <span className="viewer-panel-tab-badge" />}
                </button>
              ))}
            </div>
            <div className="viewer-panel-content">
              {tab === 'comments' && (
                <CommentsPanel
                  assetId={mediaId}
                  currentTime={currentTime}
                  onSeek={seekTo}
                  onCommentsChange={setTimelineComments}
                  isAssetOwner={!!(user?.id && (user.id === asset?.user_id || user.id === asset?.created_by || user.id === asset?.owner_id))}
                />
              )}
              {tab === 'versions' && (
                <VersionsPanel
                  asset={asset}
                  currentTime={currentTime}
                  onVersionUploaded={newAsset => { setAsset(newAsset); setPreviewVersion(null); setSeekTarget(0) }}
                  onPreviewVersion={handlePreviewVersion}
                />
              )}
              {tab === 'info' && (
                <InfoPanel asset={asset} onStatusChange={changeStatus} />
              )}
            </div>
          </div>
        )}
      </div>{/* end viewer-body */}

      <AnimatePresence>
        {showShare && <ShareModal asset={asset} onClose={() => setShowShare(false)} />}
      </AnimatePresence>
    </div>
  )
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

function fmt(s) {
  if (!s && s !== 0) return '0:00'
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function VideoControls({ playerRef, currentTime, duration, isPlaying, fps = 24, onSeek, comments = [] }) {
  const [volume,    setVolume]    = useState(1)
  const [muted,     setMuted]     = useState(false)
  const [loop,      setLoop]      = useState(false)
  const [speed,     setSpeed]     = useState(1)
  const [showSpeed, setShowSpeed] = useState(false)
  const [showVol,   setShowVol]   = useState(false)
  const speedMenuRef = useRef(null)

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  const VolumeIcon = (muted || volume === 0) ? SpeakerSimpleX
                   : volume < 0.5           ? SpeakerSimpleLow
                   :                          SpeakerSimpleHigh

  useEffect(() => {
    if (!showSpeed) return
    function onDown(e) {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) setShowSpeed(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showSpeed])

  function togglePlay() {
    const paused = playerRef.current?.isPaused() ?? !isPlaying
    if (paused) playerRef.current?.play()
    else playerRef.current?.pause()
  }
  function toggleMute() {
    const next = !muted
    setMuted(next)
    playerRef.current?.setMuted(next)
  }
  function handleVolume(v) {
    setVolume(v)
    playerRef.current?.setVolume(v)
    if (v === 0) { setMuted(true); playerRef.current?.setMuted(true) }
    else if (muted) { setMuted(false); playerRef.current?.setMuted(false) }
  }
  function toggleLoop() {
    const next = !loop
    setLoop(next)
    playerRef.current?.setLoop(next)
  }
  function setSpeedVal(r) {
    setSpeed(r)
    playerRef.current?.setPlaybackRate(r)
    setShowSpeed(false)
  }
  function frameBack()    { onSeek(Math.max(0, currentTime - 1 / fps)) }
  function frameForward() { onSeek(Math.min(duration || 0, currentTime + 1 / fps)) }

  return (
    <div className="vc-bar">
      {/* Scrub bar */}
      <div className="vc-progress">
        <div className="vc-progress-bg">
          <div className="vc-progress-fill" style={{ width: `${pct}%` }} />
          {duration > 0 && comments.map(c => c.timestamp_seconds != null && (
            <div
              key={c.id}
              className="vc-marker"
              style={{ left: `${(c.timestamp_seconds / duration) * 100}%` }}
              title={c.body?.slice(0, 60)}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.05}
          value={currentTime}
          onChange={e => onSeek(parseFloat(e.target.value))}
          className="vc-scrub-input"
        />
      </div>

      {/* Controls row */}
      <div className="vc-controls">
        <div className="vc-left">
          <button className="vc-btn" onClick={frameBack} title="Frame back"><SkipBack size={13} /></button>
          <button className="vc-btn vc-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause (K)' : 'Play (K)'}>
            {isPlaying ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
          </button>
          <button className="vc-btn" onClick={frameForward} title="Frame forward"><SkipForward size={13} /></button>
          <span className="vc-time">{fmt(currentTime)} / {fmt(duration || 0)}</span>
        </div>

        <div className="vc-right">
          <button
            className={`vc-btn${loop ? ' vc-active' : ''}`}
            onClick={toggleLoop}
            title="Loop"
          >
            <Repeat size={14} />
          </button>

          {/* Volume */}
          <div
            className="vc-vol-wrap"
            onMouseEnter={() => setShowVol(true)}
            onMouseLeave={() => setShowVol(false)}
          >
            <button className="vc-btn" onClick={toggleMute}><VolumeIcon size={14} /></button>
            {showVol && (
              <div className="vc-vol-popup">
                <input
                  type="range"
                  min={0} max={1} step={0.02}
                  value={muted ? 0 : volume}
                  onChange={e => handleVolume(parseFloat(e.target.value))}
                  className="vc-vol-slider"
                  style={{ '--vol-pct': `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>
            )}
          </div>

          {/* Speed */}
          <div className="vc-speed-wrap" ref={speedMenuRef}>
            <button className="vc-btn vc-speed-btn" onClick={() => setShowSpeed(p => !p)}>
              {speed}×
            </button>
            {showSpeed && (
              <div className="vc-speed-menu">
                {SPEEDS.map(r => (
                  <button
                    key={r}
                    className={`vc-speed-item${speed === r ? ' active' : ''}`}
                    onClick={() => setSpeedVal(r)}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="vc-btn" onClick={() => playerRef.current?.requestFullscreen()} title="Fullscreen">
            <FrameCorners size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoPanel({ asset, onStatusChange }) {
  const statusMeta = STATUS_OPTIONS.find(s => s.value === asset?.status) || STATUS_OPTIONS[0]
  return (
    <div className="info-panel">
      <div className="info-row">
        <span className="info-label">Status</span>
        <select
          className="info-status-select"
          value={asset.status || 'in_review'}
          onChange={e => onStatusChange(e.target.value)}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      {asset.type && <div className="info-row"><span className="info-label">Type</span><span>{asset.type}</span></div>}
      {asset.mime_type && <div className="info-row"><span className="info-label">MIME</span><span style={{ fontSize: 11 }}>{asset.mime_type}</span></div>}
      {asset.duration && (
        <div className="info-row">
          <span className="info-label">Duration</span>
          <span>{Math.floor(asset.duration / 60)}:{String(Math.round(asset.duration % 60)).padStart(2, '0')}</span>
        </div>
      )}
      {asset.width && asset.height && (
        <div className="info-row"><span className="info-label">Resolution</span><span>{asset.width}×{asset.height}</span></div>
      )}
      {asset.file_size && (
        <div className="info-row"><span className="info-label">Size</span><span>{formatSize(asset.file_size)}</span></div>
      )}
      {asset.created_at && (
        <div className="info-row">
          <span className="info-label">Added</span>
          <span>{new Date(asset.created_at).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  )
}
