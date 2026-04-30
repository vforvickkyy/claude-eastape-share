import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, DownloadSimple, Trash, Copy, CheckCircle,
  ChatCircle, ClockCounterClockwise, Info, PencilSimple,
  Check, X, SidebarSimple, MusicNote, File, FileImage,
  FilePdf, CaretLeft, CaretRight,
} from '@phosphor-icons/react'
import { useAuth } from './context/AuthContext'
import DashboardLayout from './DashboardLayout'
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
  const [showShare,      setShowShare]     = useState(false)
  const [sidebarOpen,    setSidebarOpen]   = useState(true)
  const [editNotes,      setEditNotes]     = useState(false)
  const [notesVal,       setNotesVal]      = useState('')
  const [siblings,       setSiblings]      = useState([])

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

  async function copyShareLink() {
    try {
      const data = await shareLinksApi.create({ project_media_id: mediaId, allow_download: true, allow_comments: true })
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
    <DashboardLayout title="Media Asset">
      <div className="asset-skeleton">
        <div className="asset-skeleton-topbar">
          <div className="skel skel-btn" />
          <div className="skel skel-title" />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div className="skel skel-btn" />
            <div className="skel skel-btn" />
            <div className="skel skel-btn" />
          </div>
        </div>
        <div className="asset-skeleton-body">
          <div className="skel skel-player" />
          <div className="asset-skeleton-sidebar">
            <div className="skel skel-tab-row" />
            <div className="skel skel-line" style={{ width: '90%' }} />
            <div className="skel skel-line" style={{ width: '70%' }} />
            <div className="skel skel-line" style={{ width: '80%' }} />
            <div className="skel skel-line" style={{ width: '60%' }} />
            <div className="skel skel-comment" />
            <div className="skel skel-comment" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )

  if (!asset) return (
    <DashboardLayout title="Media Asset">
      <div className="empty-state"><p>Asset not found</p></div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout title={asset.name}>
      {/* Top bar */}
      <div className="asset-topbar">
        <button className="btn-ghost" onClick={() => navigate(backPath)}>
          <ArrowLeft size={14} /> {location.state?.from === 'manage' ? '← Back to Manage' : 'Back'}
        </button>

        {editName ? (
          <div className="asset-name-edit">
            <input
              className="asset-name-input"
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditName(false) }}
              autoFocus
            />
            <button className="icon-btn" onClick={saveName}><Check size={14} /></button>
            <button className="icon-btn" onClick={() => setEditName(false)}><X size={14} /></button>
          </div>
        ) : (
          <button className="asset-name-btn" onClick={() => setEditName(true)}>
            {asset.name} <PencilSimple size={13} className="asset-name-edit-icon" />
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`media-status-badge ${statusMeta.class}`} style={{ position: 'static' }}>{statusMeta.label}</span>
          <button className="btn-ghost" onClick={handleDownload}>
            <DownloadSimple size={14} /> Download
          </button>
          <button className="btn-ghost" onClick={copyShareLink}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn-ghost" onClick={() => setShowShare(true)}>Share</button>
          <button className="btn-ghost" onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar">
            <SidebarSimple size={14} />
          </button>
          <button className="btn-ghost danger" onClick={handleDelete}>
            <Trash size={14} />
          </button>
        </div>
      </div>

      {/* Prev / Next */}
      {siblings.length > 1 && (() => {
        const idx = siblings.findIndex(s => s.id === mediaId)
        const prev = idx > 0 ? siblings[idx - 1] : null
        const next = idx < siblings.length - 1 ? siblings[idx + 1] : null
        return (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
            <button
              className="btn-ghost"
              style={{ fontSize: 12, opacity: prev ? 1 : 0.3 }}
              disabled={!prev}
              onClick={() => navigate(`/projects/${projectId}/media/${prev.id}`)}
            >
              <CaretLeft size={13} /> Prev
            </button>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{idx + 1} / {siblings.length}</span>
            <button
              className="btn-ghost"
              style={{ fontSize: 12, opacity: next ? 1 : 0.3 }}
              disabled={!next}
              onClick={() => navigate(`/projects/${projectId}/media/${next.id}`)}
            >
              Next <CaretRight size={13} />
            </button>
          </div>
        )
      })()}

      {/* Main layout */}
      <div className={`asset-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
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
                      onStatusChange={(newStatus) =>
                        !previewVersion && setAsset(prev => ({ ...prev, cloudflare_status: newStatus }))
                      }
                    />
                  ) : (
                    // No CF uid yet — auto-ingest is running; never fall back to Wasabi
                    <div className="asset-player asset-player-processing">
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        border: '3px solid rgba(124,58,237,0.2)',
                        borderTop: '3px solid #7c3aed',
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

          {/* Notes */}
          <div className="asset-notes-wrap">
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
        </div>

        {/* Sidebar */}
        <div className={`asset-sidebar ${sidebarOpen ? '' : 'hidden'}`}>
          <div className="asset-tabs">
            {[
              { id: 'comments', icon: <ChatCircle size={15} />,            label: 'Comments' },
              { id: 'versions', icon: <ClockCounterClockwise size={15} />, label: 'Versions' },
              { id: 'info',     icon: <Info size={15} />,                  label: 'Info'     },
            ].map(t => (
              <button
                key={t.id}
                className={`asset-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div className="asset-tab-content">
            {tab === 'comments' && (
              <CommentsPanel assetId={mediaId} currentTime={currentTime} onSeek={seekTo} />
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
      </div>

      <AnimatePresence>
        {showShare && <ShareModal asset={asset} onClose={() => setShowShare(false)} />}
      </AnimatePresence>
    </DashboardLayout>
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
