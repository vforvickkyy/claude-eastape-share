/**
 * DriveSharePage — public page for drive file/folder share links.
 * Route: /share/:token
 * Full redesign: proper header, footer, password gate, video/image/audio/PDF previews.
 */
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DownloadSimple, FolderSimple, Lock, Warning, Clock,
  MusicNote, FilmStrip, File,
} from '@phosphor-icons/react'
import FileTypeIcon from './components/drive/FileTypeIcon'
import { shareLinksApi } from './lib/api'

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function mimeLabel(mime, name) {
  if (!mime && !name) return 'File'
  const ext = (name?.split('.').pop() || '').toUpperCase()
  if (mime?.startsWith('video/')) return ext ? `${ext} Video` : 'Video'
  if (mime?.startsWith('image/')) return ext ? `${ext} Image` : 'Image'
  if (mime?.startsWith('audio/')) return ext ? `${ext} Audio` : 'Audio'
  if (mime === 'application/pdf') return 'PDF'
  return ext ? `${ext} File` : 'File'
}

function triggerDownload(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = name || 'file'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ── Header ───────────────────────────────────────────────────────────────────
function PageHeader() {
  const navigate = useNavigate()
  return (
    <header style={{
      height: 60, background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px', flexShrink: 0,
    }}>
      <div
        style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: '#fff', cursor: 'pointer' }}
        onClick={() => navigate('/')}
      >
        Eastape<span style={{ color: '#a78bfa' }}>Studio</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => navigate('/login')}
          style={{
            height: 34, padding: '0 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.7)', fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
        >
          Log In
        </button>
        <button
          onClick={() => navigate('/signup')}
          style={{
            height: 34, padding: '0 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            background: '#7c3aed', border: 'none', color: '#fff', fontWeight: 600,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#6d28d9'}
          onMouseLeave={e => e.currentTarget.style.background = '#7c3aed'}
        >
          Sign Up Free
        </button>
      </div>
    </header>
  )
}

// ── Footer ───────────────────────────────────────────────────────────────────
function PageFooter() {
  const navigate = useNavigate()
  return (
    <footer style={{
      background: '#13131a', borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '18px 40px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
        Powered by <strong style={{ color: 'rgba(255,255,255,0.5)' }}>EastapeStudio</strong>
      </span>
      <div style={{ display: 'flex', gap: 20 }}>
        {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']].map(([label, path]) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >
            {label}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>© 2026 Eastape Films. All rights reserved.</span>
    </footer>
  )
}

// ── State card wrapper ────────────────────────────────────────────────────────
function StateCard({ icon, iconColor = '#a78bfa', title, sub, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', padding: 32 }}>
      <div style={{ color: iconColor, marginBottom: 4 }}>{icon}</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{sub}</p>}
      {children}
    </div>
  )
}

// ── File preview ──────────────────────────────────────────────────────────────
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
      <img
        src={url} alt={file.name}
        style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' }}
        onError={() => setImgErr(true)}
      />
    </div>
  )

  if (mime.startsWith('video/')) return (
    <div style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        controls
        src={url}
        style={{ width: '100%', maxHeight: '60vh', display: 'block', background: '#000' }}
      />
    </div>
  )

  if (mime.startsWith('audio/')) return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16,185,129,0.08), #000)',
      padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
    }}>
      <MusicNote size={72} weight="duotone" color="#34d399" />
      <audio controls src={url} style={{ width: '80%', maxWidth: 420 }} />
    </div>
  )

  if (mime === 'application/pdf') return (
    <div style={{ height: 520, background: '#111' }}>
      <iframe src={url} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title={file.name} />
    </div>
  )

  // Fallback
  return (
    <div style={{ background: '#0d0d14', height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={72} />
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Preview not available for this file type</p>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DriveSharePage() {
  const { token } = useParams()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [expired, setExpired] = useState(false)
  const [needsPw, setNeedsPw] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwErr,   setPwErr]   = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  useEffect(() => { loadShare() }, [token])

  async function loadShare(pw) {
    if (pw) setPwLoading(true)
    else setLoading(true)
    setError(null)
    setPwErr(false)
    try {
      const res = await shareLinksApi.resolve(token, pw)
      setData(res)
      setNeedsPw(false)
    } catch (err) {
      const msg = (err.message || '').toLowerCase()
      if (msg.includes('password')) {
        setNeedsPw(true)
        if (pw) setPwErr(true)
      } else if (msg.includes('expired') || msg.includes('410')) {
        setExpired(true)
      } else {
        setError(err.message || 'Share link not found')
      }
    } finally {
      setLoading(false)
      setPwLoading(false)
    }
  }

  const pageStyle = {
    minHeight: '100vh', background: '#0a0a0f',
    display: 'flex', flexDirection: 'column',
  }
  const contentStyle = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '32px 16px 48px',
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={pageStyle}>
      <PageHeader />
      <div style={{ ...contentStyle }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <span className="spinner" style={{ width: 36, height: 36 }} />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p>
        </div>
      </div>
      <PageFooter />
    </div>
  )

  // ── Password gate ──────────────────────────────────────────────────────────
  if (needsPw && !data) return (
    <div style={pageStyle}>
      <PageHeader />
      <div style={contentStyle}>
        <div style={{
          background: '#13131a', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: 32, width: '100%', maxWidth: 400,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center',
        }}>
          <Lock size={44} weight="duotone" color="#a78bfa" />
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Password protected</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Enter the password to access this file</p>
          </div>
          {pwErr && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>Incorrect password. Try again.</p>}
          <input
            className="input-field"
            type="password"
            placeholder="Enter password"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwErr(false) }}
            onKeyDown={e => e.key === 'Enter' && loadShare(pwInput)}
            autoFocus
            style={{ width: '100%' }}
          />
          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={pwLoading || !pwInput}
            onClick={() => loadShare(pwInput)}
          >
            {pwLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Access file'}
          </button>
        </div>
      </div>
      <PageFooter />
    </div>
  )

  // ── Expired ────────────────────────────────────────────────────────────────
  if (expired) return (
    <div style={pageStyle}>
      <PageHeader />
      <div style={contentStyle}>
        <StateCard icon={<Clock size={48} weight="duotone" />} iconColor="#f59e0b" title="Link expired" sub="The share link has passed its expiry date." />
      </div>
      <PageFooter />
    </div>
  )

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !data) return (
    <div style={pageStyle}>
      <PageHeader />
      <div style={contentStyle}>
        <StateCard icon={<Warning size={48} weight="duotone" />} iconColor="#f87171" title="Link not found" sub={error || 'This share link may have been removed or never existed.'} />
      </div>
      <PageFooter />
    </div>
  )

  const card = {
    background: '#13131a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
  }

  // ── Single file view ───────────────────────────────────────────────────────
  if (data.type === 'drive_file') {
    const { file, allowDownload } = data
    return (
      <div style={pageStyle}>
        <PageHeader />
        <div style={{ ...contentStyle }}>
          <div style={{ ...card, maxWidth: 640 }}>
            {/* Preview */}
            <FilePreviewArea file={file} url={file.downloadUrl} />

            {/* Info */}
            <div style={{ padding: '20px 24px 24px' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', wordBreak: 'break-word' }}>{file.name}</h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>
                {mimeLabel(file.mime_type, file.name)} · {formatSize(file.file_size)}
              </p>

              {allowDownload && file.downloadUrl ? (
                <button
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', height: 46, fontSize: 15, borderRadius: 10 }}
                  onClick={() => triggerDownload(file.downloadUrl, file.name)}
                >
                  <DownloadSimple size={18} /> Download {file.name}
                </button>
              ) : !allowDownload ? (
                <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.3)', padding: '12px 0' }}>
                  Download not allowed for this link
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <PageFooter />
      </div>
    )
  }

  // ── Folder view ────────────────────────────────────────────────────────────
  if (data.type === 'drive_folder') {
    const { folder, files, allowDownload } = data
    const totalSize = (files || []).reduce((s, f) => s + (f.file_size || 0), 0)

    return (
      <div style={pageStyle}>
        <PageHeader />
        <div style={{ ...contentStyle, alignItems: 'flex-start' }}>
          <div style={{ ...card, maxWidth: 760 }}>
            {/* Folder header */}
            <div style={{
              padding: '20px 24px', background: 'rgba(255,255,255,0.02)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <FolderSimple size={40} weight="duotone" color="#f59e0b" />
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px' }}>{folder.name}</h1>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Shared folder · {files?.length || 0} file{files?.length !== 1 ? 's' : ''} · {formatSize(totalSize)}
                </p>
              </div>
              {allowDownload && files?.length > 0 && (
                <button
                  className="btn-ghost"
                  style={{ fontSize: 13, flexShrink: 0 }}
                  onClick={() => files.forEach((f, i) => f.downloadUrl && setTimeout(() => triggerDownload(f.downloadUrl, f.name), i * 200))}
                >
                  <DownloadSimple size={14} /> Download all
                </button>
              )}
            </div>

            {/* File list */}
            <div style={{ padding: '16px 24px 24px' }}>
              {!files?.length ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14, padding: '24px 0' }}>This folder is empty.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {files.map(f => (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8, padding: '10px 14px',
                      }}
                    >
                      {/* Thumb/icon */}
                      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)' }}>
                        {f.thumbnailUrl ? (
                          <img src={f.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        ) : (
                          <FileTypeIcon mimeType={f.mime_type} fileName={f.name} size={26} />
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{mimeLabel(f.mime_type, f.name)} · {formatSize(f.file_size)}</p>
                      </div>
                      {/* Download */}
                      {allowDownload && f.downloadUrl && (
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 12, flexShrink: 0 }}
                          onClick={() => triggerDownload(f.downloadUrl, f.name)}
                        >
                          <DownloadSimple size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <PageFooter />
      </div>
    )
  }

  // Fallback
  return (
    <div style={pageStyle}>
      <PageHeader />
      <div style={contentStyle}>
        <StateCard icon={<Warning size={48} weight="duotone" />} iconColor="#f87171" title="Unknown share type" sub="This link type is not supported." />
      </div>
      <PageFooter />
    </div>
  )
}
