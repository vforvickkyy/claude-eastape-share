/**
 * DriveSharePage — public Google Drive-style share page.
 * Route: /share/:token
 * Features: folder navigation, breadcrumbs, list/grid toggle, subfolders, file icons.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DownloadSimple, FolderSimple, Lock, Warning, Clock,
  MusicNote, Rows, SquaresFour, CaretRight, House,
  ArrowLeft, Play, PaperPlaneTilt, Trash, X, ArrowLeft as BackArrow,
  CaretLeft, CaretRight as CaretRightIcon, ChatDots,
} from '@phosphor-icons/react'
import FileTypeIcon from './components/drive/FileTypeIcon'
import CloudflareVideoPlayer from './components/media/CloudflareVideoPlayer'
import { shareLinksApi } from './lib/api'

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
function mimeLabel(mime, name) {
  const ext = (name?.split('.').pop() || '').toUpperCase()
  if (mime?.startsWith('video/')) return ext ? `${ext} Video` : 'Video'
  if (mime?.startsWith('image/')) return ext ? `${ext} Image` : 'Image'
  if (mime?.startsWith('audio/')) return ext ? `${ext} Audio` : 'Audio'
  if (mime === 'application/pdf') return 'PDF'
  return ext || 'File'
}
function triggerDownload(url, name) {
  const a = document.createElement('a')
  a.href = url; a.download = name || 'file'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// ── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ onClick }) {
  return (
    <img
      src="/logo.png"
      alt="EastapeStudio"
      onClick={onClick}
      style={{ height: 32, cursor: onClick ? 'pointer' : 'default', objectFit: 'contain', display: 'block' }}
    />
  )
}

// ── Thumbnail with onError fallback ──────────────────────────────────────────
function ThumbOrIcon({ file, size = 40, imgStyle = {} }) {
  const [err, setErr] = useState(false)
  if (file.thumbnailUrl && !err) {
    return (
      <img
        src={file.thumbnailUrl} alt=""
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: 4, display: 'block', flexShrink: 0, ...imgStyle }}
        loading="lazy"
        onError={() => setErr(true)}
      />
    )
  }
  return <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={size} />
}

// ── Header ───────────────────────────────────────────────────────────────────
function PageHeader() {
  const navigate = useNavigate()
  return (
    <header style={{
      height: 58, background: '#0f0f18', borderBottom: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
    }}>
      <Logo onClick={() => navigate('/')} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => navigate('/login')}
          style={{
            height: 33, padding: '0 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.65)', fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'}
        >Log In</button>
        <button
          onClick={() => navigate('/signup')}
          style={{
            height: 33, padding: '0 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
            background: 'var(--accent)', border: 'none', color: '#000', fontWeight: 600,
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >Sign Up Free</button>
      </div>
    </header>
  )
}

// ── Footer ───────────────────────────────────────────────────────────────────
function PageFooter() {
  const navigate = useNavigate()
  return (
    <footer style={{
      background: '#0f0f18', borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '16px 32px', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
    }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
        Powered by <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Eastape Films</strong>
      </span>
      <div style={{ display: 'flex', gap: 18 }}>
        {[['Privacy Policy', '/privacy'], ['Terms', '/terms']].map(([l, p]) => (
          <button key={p} onClick={() => navigate(p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
          >{l}</button>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>© 2026 Eastape Films.</span>
    </footer>
  )
}

// ── State display ─────────────────────────────────────────────────────────────
function StateCard({ icon, iconColor = '#a78bfa', title, sub, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '48px 32px' }}>
      <div style={{ color: iconColor }}>{icon}</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0' }}>{title}</h2>
      {sub && <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{sub}</p>}
      {children}
    </div>
  )
}

// ── File preview (single file) ────────────────────────────────────────────────
function FilePreviewArea({ file, url }) {
  const [imgErr, setImgErr] = useState(false)
  const mime = file.mime_type || ''
  if (!url) return (
    <div style={{ background: '#000', height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={72} />
    </div>
  )
  if (mime.startsWith('image/') && !imgErr) return (
    <div style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: '60vh', overflow: 'hidden' }}>
      <img src={url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' }} onError={() => setImgErr(true)} />
    </div>
  )
  if (mime.startsWith('video/')) return (
    <div style={{ background: '#000' }}>
      <video controls src={url} style={{ width: '100%', maxHeight: '60vh', display: 'block', background: '#000' }} />
    </div>
  )
  if (mime.startsWith('audio/')) return (
    <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,.08),#000)', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <MusicNote size={72} weight="duotone" color="#34d399" />
      <audio controls src={url} style={{ width: '80%', maxWidth: 420 }} />
    </div>
  )
  if (mime === 'application/pdf') return (
    <div style={{ height: 520, background: '#111' }}>
      <iframe src={url} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title={file.name} />
    </div>
  )
  return (
    <div style={{ background: '#0d0d14', height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={72} />
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Preview not available</p>
    </div>
  )
}

// ── View toggle ───────────────────────────────────────────────────────────────
function ViewToggle({ view, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 7, padding: 3, gap: 2 }}>
      {[['list', Rows], ['grid', SquaresFour]].map(([v, Icon]) => (
        <button key={v} onClick={() => onChange(v)}
          style={{
            width: 30, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: view === v ? 'var(--accent-soft)' : 'transparent',
            border: 'none', cursor: 'pointer',
            color: view === v ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
          }}
        ><Icon size={13} /></button>
      ))}
    </div>
  )
}

// ── Folder card ───────────────────────────────────────────────────────────────
function FolderCard({ folder, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={() => onClick(folder)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: hov ? 'var(--accent-tint)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hov ? 'var(--accent-soft)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 9, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <FolderSimple size={28} weight="duotone" color={hov ? '#f59e0b' : '#d97706'} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{folder.name}</span>
      <CaretRight size={13} color="rgba(255,255,255,0.3)" style={{ flexShrink: 0 }} />
    </div>
  )
}

// ── File row (list view) ──────────────────────────────────────────────────────
function FileRow({ file, allowDownload }) {
  return (
    <div className="share-file-row">
      <ThumbOrIcon file={file} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="share-file-row-name" style={{ margin: 0, fontWeight: 600, color: '#fff' }} title={file.name}>{file.name}</p>
        <p className="share-file-row-meta" style={{ margin: 0 }}>{mimeLabel(file.mime_type, file.name)} · {formatSize(file.file_size)}</p>
      </div>
      {allowDownload && file.downloadUrl && (
        <button
          onClick={() => triggerDownload(file.downloadUrl, file.name)}
          title="Download"
          style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.25)'; e.currentTarget.style.color = '#a78bfa' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        >
          <DownloadSimple size={14} />
        </button>
      )}
    </div>
  )
}

// ── File card (grid view) ─────────────────────────────────────────────────────
function FileCard({ file, allowDownload }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hov ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      <div style={{ height: 110, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {file.thumbnailUrl
          ? <ThumbOrIcon file={file} size={110} imgStyle={{ width: '100%', height: 110, borderRadius: 0 }} />
          : <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={42} />
        }
      </div>
      <div style={{ padding: '8px 10px', flex: 1 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{formatSize(file.file_size)}</p>
      </div>
      {allowDownload && file.downloadUrl && (
        <button
          onClick={() => triggerDownload(file.downloadUrl, file.name)}
          style={{
            margin: '0 8px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
            fontSize: 11, cursor: 'pointer', padding: '5px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.2)'; e.currentTarget.style.color = '#a78bfa' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        >
          <DownloadSimple size={11} /> Download
        </button>
      )}
    </div>
  )
}

// ── Comment helpers ───────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#f97316']
function avatarColor(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
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
  if (s == null) return ''
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Project file tile (media card) ───────────────────────────────────────────
function ProjectFileTile({ file, allowDownload, onClick }) {
  const isVideo = file.mime_type?.startsWith('video/') || file.type === 'video'
  const isImage = file.mime_type?.startsWith('image/') || file.type === 'image'
  const canPlay  = (isVideo || isImage || file.mime_type?.startsWith('audio/')) && file.downloadUrl
  const [hov, setHov] = useState(false)
  return (
    <div
      className="media-asset-card"
      style={{ cursor: canPlay ? 'pointer' : 'default', background: hov ? 'rgba(255,255,255,0.06)' : undefined }}
      onClick={canPlay ? onClick : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div className="media-asset-thumb" style={{ position: 'relative', background: 'rgba(0,0,0,0.4)', borderRadius: '8px 8px 0 0', overflow: 'hidden', height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {file.thumbnailUrl
          ? <img src={file.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} loading="lazy" />
          : <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={40} />
        }
        {isVideo && canPlay && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hov ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)', transition: 'background 0.15s' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.5)' }}>
              <Play size={18} weight="fill" style={{ color: '#fff', marginLeft: 2 }} />
            </div>
          </div>
        )}
        {file.duration != null && (
          <span className="media-duration-badge">{formatDuration(file.duration)}</span>
        )}
      </div>
      <div className="media-asset-info" style={{ padding: '8px 10px 10px' }}>
        <p className="media-asset-name" style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</p>
        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          {mimeLabel(file.mime_type, file.name)}{file.file_size ? ` · ${formatSize(file.file_size)}` : ''}
        </p>
      </div>
    </div>
  )
}

// ── Project folder share view ─────────────────────────────────────────────────
function ProjectFolderView({ rootData, navData, navStack, navLoading, token, authPw, navigateInto, navigateTo }) {
  const { rootFolder, allowDownload, allowComments } = rootData
  const current = navData || rootData
  const { subfolders = [], files = [] } = current

  const [viewMode,    setViewMode]    = useState('grid')
  const [activeFile,  setActiveFile]  = useState(null)
  const [activeIdx,   setActiveIdx]   = useState(-1)
  const [comments,    setComments]    = useState([])
  const [cmtLoading,  setCmtLoading]  = useState(false)
  const [newComment,  setNewComment]  = useState('')
  const [guestName,   setGuestName]   = useState(() => localStorage.getItem('guestCommentName') || '')
  const [submitting,  setSubmitting]  = useState(false)
  const [ownIds,      setOwnIds]      = useState(() => { try { return JSON.parse(localStorage.getItem('guestCommentIds') || '[]') } catch { return [] } })
  const videoRef = useRef(null)

  // Close modal on Escape
  useEffect(() => {
    if (!activeFile) return
    const onKey = (e) => { if (e.key === 'Escape') setActiveFile(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeFile])

  async function openFile(file, idx) {
    setActiveFile(file)
    setActiveIdx(idx)
    setComments([])
    setNewComment('')
    if (allowComments && file._source === 'media') {
      setCmtLoading(true)
      try {
        const r = await fetch(`${BASE_URL}/share-resolve?token=${token}&media_id=${file.id}`)
        const d = await r.json()
        setComments(d.comments || [])
      } catch {}
      setCmtLoading(false)
    }
  }

  function navFile(dir) {
    const next = files[activeIdx + dir]
    if (next) openFile(next, activeIdx + dir)
  }

  async function postComment(e) {
    e.preventDefault()
    if (!newComment.trim() || !activeFile) return
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE_URL}/media-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
        body: JSON.stringify({ assetId: activeFile.id, body: newComment.trim(), shareToken: token, guestName: guestName.trim() || 'Anonymous' }),
      })
      const d = await res.json()
      if (d.comment) {
        const name = guestName.trim() || 'Anonymous'
        setComments(cs => [...cs, { ...d.comment, guest_name: name }])
        setNewComment('')
        localStorage.setItem('guestCommentName', name)
        const nextIds = [...ownIds, d.comment.id]
        setOwnIds(nextIds)
        localStorage.setItem('guestCommentIds', JSON.stringify(nextIds))
      }
    } catch {}
    setSubmitting(false)
  }

  async function deleteComment(id) {
    setComments(cs => cs.filter(c => c.id !== id))
    setOwnIds(ids => { const n = ids.filter(x => x !== id); localStorage.setItem('guestCommentIds', JSON.stringify(n)); return n })
    try { await fetch(`${BASE_URL}/media-comments?id=${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY } }) } catch {}
  }

  const isVideo  = f => f?.mime_type?.startsWith('video/') || f?.type === 'video'
  const isImage  = f => f?.mime_type?.startsWith('image/') || f?.type === 'image'
  const isAudio  = f => f?.mime_type?.startsWith('audio/') || f?.type === 'audio'
  const canCommentOn = f => allowComments && f?._source === 'media'

  const page = { minHeight: '100vh', background: '#09090f', display: 'flex', flexDirection: 'column' }
  const card = { background: '#13131a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }

  return (
    <div style={page}>
      <PageHeader />
      <div style={{ flex: 1, padding: '28px 16px 48px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ ...card, maxWidth: 980, width: '100%', alignSelf: 'flex-start' }}>

          {/* Folder header */}
          <div className="share-folder-header">
            <FolderSimple size={38} weight="duotone" color="#f59e0b" style={{ flexShrink: 0 }} />
            <div className="share-folder-header-info">
              <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 2px' }}>{rootFolder.name}</h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
                {subfolders.length > 0 && `${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''} · `}
                {files.length} file{files.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="share-folder-actions">
              <ViewToggle view={viewMode} onChange={setViewMode} />
              {allowDownload && files.length > 0 && (
                <button className="btn-ghost" style={{ fontSize: 12, height: 32, padding: '0 12px' }}
                  onClick={() => files.forEach((f, i) => f.downloadUrl && setTimeout(() => triggerDownload(f.downloadUrl, f.name), i * 200))}>
                  <DownloadSimple size={13} /> Download all
                </button>
              )}
            </div>
          </div>

          {/* Breadcrumbs */}
          {navStack.length > 0 && (
            <div style={{ padding: '10px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => navigateTo(-1)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '2px 4px', borderRadius: 4 }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}>
                <House size={13} /> {rootFolder.name}
              </button>
              {navStack.map((crumb, i) => (
                <React.Fragment key={crumb.id}>
                  <CaretRight size={11} color="rgba(255,255,255,0.25)" />
                  <button onClick={() => navigateTo(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px', borderRadius: 4, color: i === navStack.length - 1 ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: i === navStack.length - 1 ? 600 : 400 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                    onMouseLeave={e => e.currentTarget.style.color = i === navStack.length - 1 ? '#fff' : 'rgba(255,255,255,0.5)'}
                  >{crumb.name}</button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Content */}
          <div style={{ padding: '16px 20px 24px', position: 'relative' }}>
            {navLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(19,19,26,0.7)', zIndex: 10, borderRadius: '0 0 16px 16px' }}>
                <span className="spinner" style={{ width: 28, height: 28 }} />
              </div>
            )}

            {subfolders.length === 0 && files.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 14, padding: '32px 0' }}>This folder is empty.</p>
            ) : (
              <>
                {subfolders.length > 0 && (
                  <div style={{ marginBottom: files.length > 0 ? 20 : 0 }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Folders</p>
                    <div className="share-folder-grid">
                      {subfolders.map(sf => <FolderCard key={sf.id} folder={sf} onClick={navigateInto} />)}
                    </div>
                  </div>
                )}

                {files.length > 0 && (
                  <div>
                    {subfolders.length > 0 && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Files</p>}
                    {viewMode === 'list' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {files.map((f, idx) => (
                          <div key={f.id} className="share-file-row" onClick={() => f.downloadUrl && openFile(f, idx)} style={{ cursor: f.downloadUrl ? 'pointer' : 'default' }}>
                            <ThumbOrIcon file={f} size={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p className="share-file-row-name" style={{ margin: 0, fontWeight: 600, color: '#fff' }} title={f.name}>{f.name}</p>
                              <p className="share-file-row-meta" style={{ margin: 0 }}>{mimeLabel(f.mime_type, f.name)} · {formatSize(f.file_size)}</p>
                            </div>
                            {isVideo(f) && f.downloadUrl && <Play size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />}
                            {allowDownload && f.downloadUrl && (
                              <button onClick={e => { e.stopPropagation(); triggerDownload(f.downloadUrl, f.name) }} title="Download"
                                style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.25)'; e.currentTarget.style.color = '#a78bfa' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}>
                                <DownloadSimple size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="media-asset-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                        {files.map((f, idx) => (
                          <ProjectFileTile key={f.id} file={f} allowDownload={allowDownload} onClick={() => openFile(f, idx)} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <PageFooter />

      {/* ── Media modal ── */}
      {activeFile && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          onClick={() => setActiveFile(null)}
        >
          {/* Modal topbar */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0f0f18', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setActiveFile(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: 13, padding: '4px 8px', borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}>
              <BackArrow size={14} /> Back to folder
            </button>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>|</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', padding: '4px 6px', borderRadius: 5, display: 'flex', alignItems: 'center' }} disabled={activeIdx <= 0} onClick={() => navFile(-1)}
              onMouseEnter={e => { if (activeIdx > 0) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}>
              <CaretLeft size={16} />
            </button>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', minWidth: 40, textAlign: 'center' }}>{activeIdx + 1}/{files.length}</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', padding: '4px 6px', borderRadius: 5, display: 'flex', alignItems: 'center' }} disabled={activeIdx >= files.length - 1} onClick={() => navFile(1)}
              onMouseEnter={e => { if (activeIdx < files.length - 1) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}>
              <CaretRightIcon size={16} />
            </button>
            <span style={{ fontWeight: 600, fontSize: 13, flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{activeFile.name}</span>
            {allowDownload && activeFile.downloadUrl && (
              <button className="btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => triggerDownload(activeFile.downloadUrl, activeFile.name)}>
                <DownloadSimple size={13} /> Download
              </button>
            )}
            <button onClick={() => setActiveFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', padding: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}>
              <X size={16} />
            </button>
          </div>

          {/* Modal body */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

            {/* Player area */}
            <div className="sp-player-area" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isVideo(activeFile) && activeFile._source === 'media' ? 0 : 16, overflow: 'hidden' }}>
              {isVideo(activeFile) && activeFile._source === 'media' ? (
                <div key={activeFile.id} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320, background: '#000' }}>
                  <CloudflareVideoPlayer
                    mediaId={activeFile.id}
                    cloudflareUid={activeFile.cloudflare_uid}
                    cloudflareStatus={activeFile.cloudflare_status}
                    fallbackUrl={activeFile.downloadUrl}
                  />
                </div>
              ) : isVideo(activeFile) && activeFile.downloadUrl ? (
                <video
                  key={activeFile.id}
                  src={activeFile.downloadUrl}
                  controls
                  autoPlay
                  poster={activeFile.thumbnailUrl || undefined}
                  style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, background: '#000', display: 'block' }}
                />
              ) : isImage(activeFile) && activeFile.downloadUrl ? (
                <img src={activeFile.downloadUrl} alt={activeFile.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
              ) : isAudio(activeFile) && activeFile.downloadUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                  <MusicNote size={72} weight="duotone" style={{ color: '#34d399' }} />
                  <audio key={activeFile.id} controls autoPlay src={activeFile.downloadUrl} style={{ width: '80%', maxWidth: 440 }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.35)' }}>
                  <FileTypeIcon mimeType={activeFile.mime_type} fileName={activeFile.name} size={64} />
                  <p style={{ fontSize: 13, margin: 0 }}>Preview not available</p>
                  {allowDownload && activeFile.downloadUrl && (
                    <button className="btn-primary" onClick={() => triggerDownload(activeFile.downloadUrl, activeFile.name)}>
                      <DownloadSimple size={14} /> Download
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Comments sidebar */}
            {canCommentOn(activeFile) && (
              <div className="sp-sidebar" style={{ width: 300, borderLeft: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', background: '#0f0f18', flexShrink: 0 }}>
                <div className="sp-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChatDots size={14} /> Comments
                  </span>
                  <span className="sp-comment-count" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '1px 7px' }}>{comments.length}</span>
                </div>

                <div className="sp-comments" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                  {cmtLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" style={{ width: 20, height: 20 }} /></div>
                  ) : comments.length === 0 ? (
                    <p className="sp-comments-empty" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 13, padding: '24px 16px' }}>No comments yet.<br />Be the first!</p>
                  ) : (
                    comments.filter(c => !c.parent_comment_id).map(c => {
                      const name = c.profiles?.full_name || c.guest_name || 'Anonymous'
                      return (
                        <div key={c.id} className="sp-comment-item" style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{name}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{timeAgo(c.created_at)}</span>
                            {ownIds.includes(c.id) && (
                              <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', padding: 0 }}
                                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                                <Trash size={11} />
                              </button>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{c.body}</p>
                        </div>
                      )
                    })
                  )}
                </div>

                <form className="sp-compose" onSubmit={postComment} style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    className="sp-compose-field"
                    placeholder="Your name (optional)"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    onBlur={e => { if (e.target.value.trim()) localStorage.setItem('guestCommentName', e.target.value.trim()) }}
                    disabled={submitting}
                    style={{ fontSize: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="sp-compose-field sp-compose-comment"
                      placeholder="Add a comment…"
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      disabled={submitting}
                      style={{ flex: 1, fontSize: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', outline: 'none' }}
                    />
                    <button type="submit" disabled={submitting || !newComment.trim()}
                      style={{ width: 34, height: 34, borderRadius: 7, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', opacity: (!newComment.trim() || submitting) ? 0.4 : 1 }}>
                      <PaperPlaneTilt size={14} weight="fill" />
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DriveSharePage() {
  const { token }  = useParams()
  const [rootData,  setRootData]  = useState(null)   // initial resolve (type, rootFolder, etc.)
  const [navData,   setNavData]   = useState(null)   // current folder contents
  const [navStack,  setNavStack]  = useState([])     // [{id, name}, ...]
  const [loading,   setLoading]   = useState(true)
  const [navLoading,setNavLoading]= useState(false)
  const [error,     setError]     = useState(null)
  const [expired,   setExpired]   = useState(false)
  const [needsPw,   setNeedsPw]   = useState(false)
  const [pwInput,   setPwInput]   = useState('')
  const [pwErr,     setPwErr]     = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [viewMode,  setViewMode]  = useState('list')
  const [authPw,    setAuthPw]    = useState(null)  // password used to unlock, kept for subfolder nav

  // Unlock body scroll
  useEffect(() => {
    const prev = { h: document.documentElement.style.overflow, b: document.body.style.overflow }
    document.documentElement.style.overflow = 'auto'
    document.body.style.overflow = 'auto'
    return () => { document.documentElement.style.overflow = prev.h; document.body.style.overflow = prev.b }
  }, [])

  useEffect(() => { loadRoot() }, [token])

  async function loadRoot(pw) {
    if (pw) setPwLoading(true); else setLoading(true)
    setError(null); setPwErr(false)
    try {
      const res = await shareLinksApi.resolve(token, pw)
      setRootData(res)
      setNavData(res)
      setNavStack([])
      setNeedsPw(false)
      if (pw) setAuthPw(pw)  // remember password for subfolder navigation
    } catch (err) {
      const msg = (err.message || '').toLowerCase()
      if (msg.includes('password')) { setNeedsPw(true); if (pw) setPwErr(true) }
      else if (msg.includes('expired') || msg.includes('410')) setExpired(true)
      else setError(err.message || 'Share link not found')
    } finally { setLoading(false); setPwLoading(false) }
  }

  const navigateInto = useCallback(async (folder) => {
    setNavLoading(true)
    try {
      const res = await shareLinksApi.resolve(token, authPw, folder.id)
      setNavData(res)
      setNavStack(s => [...s, { id: folder.id, name: folder.name }])
    } catch (err) {
      // silently ignore nav errors — folder might be empty
    } finally { setNavLoading(false) }
  }, [token, authPw])

  const navigateTo = useCallback(async (idx) => {
    // idx === -1 → root; otherwise navigate to that breadcrumb
    if (idx === -1) {
      setNavData(rootData)
      setNavStack([])
      return
    }
    const target = navStack[idx]
    setNavLoading(true)
    try {
      const res = await shareLinksApi.resolve(token, authPw, target.id)
      setNavData(res)
      setNavStack(s => s.slice(0, idx + 1))
    } catch { } finally { setNavLoading(false) }
  }, [token, authPw, navStack, rootData])

  // ── Page shell ────────────────────────────────────────────────────────────
  const page = { minHeight: '100vh', background: '#09090f', display: 'flex', flexDirection: 'column' }
  const centered = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px 48px' }

  if (loading) return (
    <div style={page}><PageHeader />
      <div style={centered}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p>
      </div></div>
      <PageFooter />
    </div>
  )

  if (needsPw && !rootData) return (
    <div style={page}><PageHeader />
      <div style={centered}>
        <div style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <Lock size={44} weight="duotone" color="#a78bfa" />
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Password protected</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Enter the password to access this content</p>
          </div>
          {pwErr && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>Incorrect password. Try again.</p>}
          <input className="input-field" type="password" placeholder="Enter password" value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwErr(false) }}
            onKeyDown={e => e.key === 'Enter' && loadRoot(pwInput)}
            autoFocus style={{ width: '100%' }}
          />
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            disabled={pwLoading || !pwInput} onClick={() => loadRoot(pwInput)}>
            {pwLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Access'}
          </button>
        </div>
      </div>
      <PageFooter />
    </div>
  )

  if (expired) return (
    <div style={page}><PageHeader />
      <div style={centered}><StateCard icon={<Clock size={48} weight="duotone" />} iconColor="#f59e0b" title="Link expired" sub="This share link has passed its expiry date." /></div>
      <PageFooter />
    </div>
  )
  if (error || !rootData) return (
    <div style={page}><PageHeader />
      <div style={centered}><StateCard icon={<Warning size={48} weight="duotone" />} iconColor="#f87171" title="Link not found" sub={error || 'This share link may have been removed.'} /></div>
      <PageFooter />
    </div>
  )

  const card = { background: '#13131a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }

  // ── Single file view ───────────────────────────────────────────────────────
  if (rootData.type === 'drive_file') {
    const { file, allowDownload } = rootData
    return (
      <div style={page}><PageHeader />
        <div style={centered}>
          <div style={{ ...card, maxWidth: 640, width: '100%', overflow: 'hidden' }}>
            <FilePreviewArea file={file} url={file.downloadUrl} />
            <div style={{ padding: '20px 24px 24px' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', wordBreak: 'break-word' }}>{file.name}</h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>
                {mimeLabel(file.mime_type, file.name)} · {formatSize(file.file_size)}
              </p>
              {allowDownload && file.downloadUrl
                ? <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', height: 46, fontSize: 15, borderRadius: 10 }}
                    onClick={() => triggerDownload(file.downloadUrl, file.name)}>
                    <DownloadSimple size={18} /> Download {file.name}
                  </button>
                : !allowDownload
                  ? <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.3)', padding: '12px 0' }}>Download not permitted</p>
                  : null}
            </div>
          </div>
        </div>
        <PageFooter />
      </div>
    )
  }

  // ── Project folder view (media grid + player + comments) ─────────────────
  if (rootData.type === 'project_folder') {
    return (
      <ProjectFolderView
        rootData={rootData}
        navData={navData}
        navStack={navStack}
        navLoading={navLoading}
        token={token}
        authPw={authPw}
        navigateInto={navigateInto}
        navigateTo={navigateTo}
      />
    )
  }

  // ── Folder view (drive_folder) ────────────────────────────────────────────
  if (rootData.type === 'drive_folder') {
    const { rootFolder, allowDownload } = rootData
    const current = navData || rootData
    const { subfolders = [], files = [] } = current
    const totalSize = files.reduce((s, f) => s + (f.file_size || 0), 0)
    const isEmpty = subfolders.length === 0 && files.length === 0

    return (
      <div style={page}>
        <PageHeader />
        <div style={{ flex: 1, padding: '28px 16px 48px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...card, maxWidth: 900, width: '100%', alignSelf: 'flex-start' }}>

            {/* ── Folder header ── */}
            <div className="share-folder-header">
              <FolderSimple size={38} weight="duotone" color="#f59e0b" style={{ flexShrink: 0 }} />
              <div className="share-folder-header-info">
                <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rootFolder.name}</h1>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
                  {subfolders.length > 0 && `${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''} · `}
                  {files.length} file{files.length !== 1 ? 's' : ''} · {formatSize(totalSize)}
                </p>
              </div>
              <div className="share-folder-actions">
                <ViewToggle view={viewMode} onChange={setViewMode} />
                {allowDownload && files.length > 0 && (
                  <button className="btn-ghost" style={{ fontSize: 12, height: 32, padding: '0 12px' }}
                    onClick={() => files.forEach((f, i) => f.downloadUrl && setTimeout(() => triggerDownload(f.downloadUrl, f.name), i * 200))}>
                    <DownloadSimple size={13} /> Download all
                  </button>
                )}
              </div>
            </div>

            {/* ── Breadcrumbs ── */}
            {navStack.length > 0 && (
              <div style={{ padding: '10px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <button onClick={() => navigateTo(-1)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '2px 4px', borderRadius: 4 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}>
                  <House size={13} /> {rootFolder.name}
                </button>
                {navStack.map((crumb, i) => (
                  <React.Fragment key={crumb.id}>
                    <CaretRight size={11} color="rgba(255,255,255,0.25)" />
                    <button onClick={() => navigateTo(i)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px', borderRadius: 4,
                        color: i === navStack.length - 1 ? '#fff' : 'rgba(255,255,255,0.5)',
                        fontWeight: i === navStack.length - 1 ? 600 : 400,
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                      onMouseLeave={e => e.currentTarget.style.color = i === navStack.length - 1 ? '#fff' : 'rgba(255,255,255,0.5)'}
                    >{crumb.name}</button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* ── Content ── */}
            <div style={{ padding: '16px 20px 24px', position: 'relative' }}>
              {navLoading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(19,19,26,0.7)', zIndex: 10, borderRadius: '0 0 16px 16px' }}>
                  <span className="spinner" style={{ width: 28, height: 28 }} />
                </div>
              )}

              {isEmpty ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 14, padding: '32px 0' }}>This folder is empty.</p>
              ) : (
                <>
                  {/* Sub-folders */}
                  {subfolders.length > 0 && (
                    <div style={{ marginBottom: files.length > 0 ? 20 : 0 }}>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Folders</p>
                      <div className="share-folder-grid">
                        {subfolders.map(sf => <FolderCard key={sf.id} folder={sf} onClick={navigateInto} />)}
                      </div>
                    </div>
                  )}

                  {/* Files */}
                  {files.length > 0 && (
                    <div>
                      {subfolders.length > 0 && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Files</p>}
                      {viewMode === 'list' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {files.map(f => <FileRow key={f.id} file={f} allowDownload={allowDownload} />)}
                        </div>
                      ) : (
                        <div className="share-files-grid">
                          {files.map(f => <FileCard key={f.id} file={f} allowDownload={allowDownload} />)}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <PageFooter />
      </div>
    )
  }

  return (
    <div style={page}><PageHeader />
      <div style={centered}><StateCard icon={<Warning size={48} weight="duotone" />} iconColor="#f87171" title="Unknown share type" sub="This link type is not supported." /></div>
      <PageFooter />
    </div>
  )
}
