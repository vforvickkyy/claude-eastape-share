import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, DownloadSimple, Trash, Copy, CheckCircle,
  ChatCircle, ClockCounterClockwise, Info, PencilSimple,
  Check, X, SidebarSimple, MusicNote, File, FileImage,
  FilePdf, FilePpt, FileXls, FileDoc,
} from '@phosphor-icons/react'
import { useAuth } from './context/AuthContext'
import DashboardLayout from './DashboardLayout'
import CommentsPanel from './components/media/CommentsPanel'
import VersionsPanel from './components/media/VersionsPanel'
import ShareModal from './components/media/ShareModal'
import VideoPlayer from './components/media/VideoPlayer'
import { userApiFetch, formatSize } from './lib/userApi'
import './styles/videojs-theme.css'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const REFRESH_INTERVAL = 3.5 * 60 * 60 * 1000

const STATUS_OPTIONS = [
  { value: 'in_review', label: 'In Review', class: 'badge-review'   },
  { value: 'approved',  label: 'Approved',  class: 'badge-approved' },
  { value: 'revision',  label: 'Revision',  class: 'badge-revision' },
]

function getToken() {
  try { return JSON.parse(localStorage.getItem('ets_auth'))?.access_token } catch { return null }
}

export default function MediaAssetPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { id: assetId } = useParams()

  const [asset,       setAsset]      = useState(null)
  const [loading,     setLoading]    = useState(true)
  const [videoSrc,    setVideoSrc]   = useState(null)
  const [thumbSrc,    setThumbSrc]   = useState(null)
  const [tab,         setTab]        = useState('comments')
  const [currentTime, setCurrentTime] = useState(0)
  const [editName,    setEditName]   = useState(false)
  const [nameVal,     setNameVal]    = useState('')
  const [copied,      setCopied]     = useState(false)
  const [showShare,   setShowShare]  = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editNotes,   setEditNotes]  = useState(false)
  const [notesVal,    setNotesVal]   = useState('')

  const playerRef = useRef(null)

  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true })
  }, [user, authLoading])

  useEffect(() => {
    if (!user || !assetId) return
    loadAsset()
  }, [user, assetId])

  async function loadAsset() {
    try {
      const d = await userApiFetch(`/api/media/assets?id=${assetId}`)
      const a = d.asset
      setAsset(a)
      setNameVal(a?.name || '')
      setNotesVal(a?.notes || '')
      if (a?.wasabi_status === 'ready') {
        await fetchPlaybackUrl(a)
      }
    } catch {
      navigate('/media')
    } finally {
      setLoading(false)
    }
  }

  async function fetchPlaybackUrl(a = asset) {
    if (!a?.wasabi_key) return
    try {
      const token = getToken()
      const res = await fetch(`${BASE}/download?asset_id=${a.id}&type=view`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const { url, thumbnailUrl } = await res.json()
      setVideoSrc(url)
      if (thumbnailUrl) setThumbSrc(thumbnailUrl)
    } catch { /* ignore */ }
  }

  // Refresh presigned URL before it expires (4h TTL, refresh at 3.5h)
  useEffect(() => {
    if (!asset?.wasabi_status === 'ready') return
    const interval = setInterval(() => fetchPlaybackUrl(), REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [asset?.id])

  async function saveName() {
    if (!nameVal.trim() || nameVal === asset.name) { setEditName(false); return }
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: nameVal.trim() }),
    })
    setAsset(a => ({ ...a, name: nameVal.trim() }))
    setEditName(false)
  }

  async function saveNotes() {
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: notesVal }),
    })
    setAsset(a => ({ ...a, notes: notesVal }))
    setEditNotes(false)
  }

  async function changeStatus(status) {
    await userApiFetch(`/api/media/assets?id=${assetId}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
    setAsset(a => ({ ...a, status }))
  }

  async function handleDelete() {
    if (!window.confirm('Delete this asset? This cannot be undone.')) return
    await userApiFetch(`/api/media/assets?id=${assetId}`, { method: 'DELETE' })
    navigate(`/media/project/${asset.project_id}`)
  }

  async function handleDownload() {
    try {
      const token = getToken()
      const res = await fetch(`${BASE}/download?asset_id=${assetId}&type=download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = asset.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
    } catch (err) {
      alert('Download failed: ' + err.message)
    }
  }

  async function copyShareLink() {
    const data = await userApiFetch('/api/media/share', {
      method: 'POST',
      body: JSON.stringify({ assetId, allowDownload: true, allowComments: true }),
    })
    const token = data.link?.token || (data.shareUrl || '').split('/').pop()
    const url = `${window.location.origin}/media/share/${token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function seekTo(seconds) {
    playerRef.current?.seekTo(seconds)
  }

  const statusMeta = STATUS_OPTIONS.find(s => s.value === asset?.status) || STATUS_OPTIONS[0]
  const isVideo = asset?.type === 'video' || asset?.mime_type?.startsWith('video/')
  const isImage = asset?.type === 'image' || asset?.mime_type?.startsWith('image/')
  const isAudio = asset?.type === 'audio' || asset?.mime_type?.startsWith('audio/')

  if (loading) return (
    <DashboardLayout title="Asset">
      <div className="empty-state"><span className="spinner" /></div>
    </DashboardLayout>
  )

  if (!asset) return (
    <DashboardLayout title="Asset">
      <div className="empty-state"><p>Asset not found</p></div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout title={asset.name}>
      {/* Top bar */}
      <div className="asset-topbar">
        <button className="btn-ghost" onClick={() => navigate(`/media/project/${asset.project_id}`)}>
          <ArrowLeft size={14} /> Back
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
          <span className={`media-status-badge ${statusMeta.class}`}>{statusMeta.label}</span>
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

      {/* Main layout */}
      <div className={`asset-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>

        {/* LEFT — Media player / preview */}
        <div className="asset-player-wrap">
          {asset.wasabi_status === 'ready' ? (
            <>
              {isVideo && videoSrc ? (
                <div className="asset-player">
                  <VideoPlayer
                    ref={playerRef}
                    src={videoSrc}
                    mimeType={asset.mime_type}
                    poster={thumbSrc}
                    onTimeUpdate={setCurrentTime}
                  />
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
                  <AssetTypePlaceholder asset={asset} />
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
                  : <span className="asset-notes-placeholder">Add notes or context… (click to edit)</span>
                }
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — Tabbed sidebar */}
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
              <CommentsPanel assetId={assetId} currentTime={currentTime} onSeek={seekTo} />
            )}
            {tab === 'versions' && (
              <VersionsPanel asset={asset} onVersionUploaded={newAsset => setAsset(newAsset)} />
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

function AssetTypePlaceholder({ asset }) {
  const mime = asset?.mime_type || ''
  const style = { width: 48, height: 48 }
  if (mime.includes('pdf'))        return <FilePdf  {...style} style={style} weight="duotone" color="#ef4444" />
  if (mime.includes('word') || mime.includes('document')) return <FileDoc {...style} style={style} weight="duotone" color="#3b82f6" />
  if (mime.includes('sheet') || mime.includes('excel'))   return <FileXls {...style} style={style} weight="duotone" color="#22c55e" />
  if (mime.includes('presentation') || mime.includes('powerpoint')) return <FilePpt {...style} style={style} weight="duotone" color="#f97316" />
  return <File size={48} weight="duotone" style={{ color: 'var(--t3)' }} />
}

function InfoPanel({ asset, onStatusChange }) {
  const [status, setStatus] = useState(asset.status)

  async function handleChange(val) {
    setStatus(val)
    await onStatusChange(val)
  }

  return (
    <div className="info-panel">
      <div className="info-row">
        <span className="info-label">Status</span>
        <select className="media-filter-select" value={status} onChange={e => handleChange(e.target.value)}>
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="info-row">
        <span className="info-label">Type</span>
        <span className="info-value">{asset.type}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Size</span>
        <span className="info-value">{asset.file_size ? formatSize(asset.file_size) : '—'}</span>
      </div>
      {asset.duration && (
        <div className="info-row">
          <span className="info-label">Duration</span>
          <span className="info-value">{formatDuration(asset.duration)}</span>
        </div>
      )}
      {asset.width && asset.height && (
        <div className="info-row">
          <span className="info-label">Resolution</span>
          <span className="info-value">{asset.width} × {asset.height}</span>
        </div>
      )}
      <div className="info-row">
        <span className="info-label">Version</span>
        <span className="info-value">v{asset.version}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Uploaded</span>
        <span className="info-value">{asset.created_at ? new Date(asset.created_at).toLocaleDateString() : '—'}</span>
      </div>
      {asset.mime_type && (
        <div className="info-row">
          <span className="info-label">MIME</span>
          <span className="info-value" style={{ fontSize: 11 }}>{asset.mime_type}</span>
        </div>
      )}
    </div>
  )
}

function formatDuration(s) {
  if (!s) return ''
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
