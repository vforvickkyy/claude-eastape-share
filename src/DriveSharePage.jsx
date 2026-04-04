/**
 * DriveSharePage — public page for drive file/folder share links.
 * Route: /share/:token
 * Handles:
 *   type === 'drive_file'   — single file preview + download
 *   type === 'drive_folder' — folder browser with per-file download
 */
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  DownloadSimple, FolderSimple, File, FileImage,
  FilePdf, FilmStrip, MusicNote, Lock, Warning,
} from '@phosphor-icons/react'
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
  if (mime?.startsWith('video/')) return `${ext} Video`
  if (mime?.startsWith('image/')) return `${ext} Image`
  if (mime?.startsWith('audio/')) return `${ext} Audio`
  if (mime === 'application/pdf') return 'PDF'
  return ext ? `${ext} File` : 'File'
}

function FileIcon({ mimeType, size = 40 }) {
  const s = { size, weight: 'duotone', style: { opacity: 0.7 } }
  if (mimeType?.startsWith('video/')) return <FilmStrip {...s} color="#a78bfa" />
  if (mimeType?.startsWith('image/')) return <FileImage {...s} color="#60a5fa" />
  if (mimeType?.startsWith('audio/')) return <MusicNote {...s} color="#34d399" />
  if (mimeType === 'application/pdf') return <FilePdf {...s} color="#f87171" />
  return <File {...s} color="var(--t3)" />
}

function downloadUrl(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = name || 'file'
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default function DriveSharePage() {
  const { token } = useParams()
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [pwInput,  setPwInput]  = useState('')
  const [needsPw,  setNeedsPw]  = useState(false)
  const [pwErr,    setPwErr]    = useState(false)

  useEffect(() => { loadShare() }, [token])

  async function loadShare(pw) {
    setLoading(true)
    setError(null)
    try {
      const res = await shareLinksApi.resolve(token, pw)
      setData(res)
      setNeedsPw(false)
    } catch (err) {
      if (err.message?.toLowerCase().includes('password')) {
        setNeedsPw(true)
        if (pw) setPwErr(true)
      } else {
        setError(err.message || 'Share link not found or expired')
      }
    } finally {
      setLoading(false)
    }
  }

  // Password gate
  if (needsPw && !data) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <Lock size={32} style={{ color: 'var(--purple-l)', marginBottom: 12 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Password required</h2>
          <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 20 }}>This share link is password protected.</p>
          {pwErr && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>Incorrect password. Try again.</p>}
          <input
            className="input-base"
            type="password"
            placeholder="Enter password"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwErr(false) }}
            onKeyDown={e => e.key === 'Enter' && loadShare(pwInput)}
            autoFocus
            style={{ marginBottom: 10 }}
          />
          <button className="btn-primary-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => loadShare(pwInput)}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Unlock'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span className="spinner" style={{ width: 36, height: 36 }} />
          <p style={{ color: 'var(--t3)', fontSize: 13 }}>Loading…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <Warning size={32} style={{ color: '#f87171', marginBottom: 12 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Link unavailable</h2>
          <p style={{ color: 'var(--t3)', fontSize: 13 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  // ── Single file ────────────────────────────────────────────────────────────
  if (data.type === 'drive_file') {
    const { file, allowDownload } = data
    const isImage = file.mime_type?.startsWith('image/')
    const isVideo = file.mime_type?.startsWith('video/')
    const isAudio = file.mime_type?.startsWith('audio/')

    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, width: '100%', maxWidth: 640 }}>
          {/* Brand header */}
          <BrandHeader />

          {/* Preview */}
          {isImage && file.downloadUrl && (
            <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 20, background: '#000', maxHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={file.downloadUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }} />
            </div>
          )}
          {isVideo && file.downloadUrl && (
            <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <video controls src={file.downloadUrl} style={{ width: '100%', borderRadius: 10, background: '#000', display: 'block' }} />
            </div>
          )}
          {isAudio && file.downloadUrl && (
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <MusicNote size={48} weight="duotone" style={{ color: 'var(--purple-l)' }} />
              <audio controls src={file.downloadUrl} style={{ width: '100%' }} />
            </div>
          )}
          {!isImage && !isVideo && !isAudio && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <FileIcon mimeType={file.mime_type} size={56} />
            </div>
          )}

          {/* File info */}
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', wordBreak: 'break-word' }}>{file.name}</h2>
          <p style={{ color: 'var(--t3)', fontSize: 13, margin: '0 0 20px' }}>
            {mimeLabel(file.mime_type, file.name)} · {formatSize(file.file_size)}
          </p>

          {allowDownload && file.downloadUrl && (
            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 14 }}
              onClick={() => downloadUrl(file.downloadUrl, file.name)}
            >
              <DownloadSimple size={16} /> Download
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Folder ─────────────────────────────────────────────────────────────────
  if (data.type === 'drive_folder') {
    const { folder, files, allowDownload } = data
    const totalSize = (files || []).reduce((s, f) => s + (f.file_size || 0), 0)

    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, width: '100%', maxWidth: 720 }}>
          <BrandHeader />

          {/* Folder header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <FolderSimple size={36} weight="duotone" color="#f59e0b" />
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{folder.name}</h2>
              <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>
                {files?.length || 0} file{files?.length !== 1 ? 's' : ''} · {formatSize(totalSize)}
              </p>
            </div>
            {allowDownload && files?.length > 0 && (
              <button
                className="btn-ghost"
                style={{ marginLeft: 'auto', fontSize: 13 }}
                onClick={() => files.forEach(f => f.downloadUrl && setTimeout(() => downloadUrl(f.downloadUrl, f.name), 200))}
              >
                <DownloadSimple size={14} /> Download all
              </button>
            )}
          </div>

          {/* File list */}
          {!files?.length ? (
            <p style={{ color: 'var(--t3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>This folder is empty.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map(f => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 12px',
                  }}
                >
                  {/* Thumbnail or icon */}
                  <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)' }}>
                    {f.thumbnailUrl ? (
                      <img src={f.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <FileIcon mimeType={f.mime_type} size={22} />
                    )}
                  </div>

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                      {f.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--t3)' }}>
                      {mimeLabel(f.mime_type, f.name)} · {formatSize(f.file_size)}
                    </p>
                  </div>

                  {/* Download */}
                  {allowDownload && f.downloadUrl && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 12, flexShrink: 0 }}
                      onClick={() => downloadUrl(f.downloadUrl, f.name)}
                    >
                      <DownloadSimple size={13} /> Download
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <Warning size={32} style={{ color: '#f87171', marginBottom: 12 }} />
        <p style={{ color: 'var(--t3)', fontSize: 13 }}>Unknown share type.</p>
      </div>
    </div>
  )
}

function BrandHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--t1)' }}>
        Eastape<span style={{ color: 'var(--purple-l)' }}>Studio</span>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 16px 80px',
}

const cardStyle = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 28,
  width: '100%',
  maxWidth: 520,
}
