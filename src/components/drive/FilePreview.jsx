/**
 * FilePreview — full-screen preview overlay for drive files.
 * Supports: image (with zoom), video, audio, PDF (iframe), and fallback.
 */
import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import {
  X, DownloadSimple, CaretLeft, CaretRight,
  FilmStrip, MusicNote, File,
} from '@phosphor-icons/react'
import FileTypeIcon from './FileTypeIcon'
import { driveFilesApi } from '../../lib/api'

function fmt(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function MediaContent({ file, url, loading }) {
  const [zoomed, setZoomed] = useState(false)
  const mime = file.mime_type || ''

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (!url) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={72} />
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center' }}>Preview not available</p>
      </div>
    )
  }

  if (mime.startsWith('image/')) {
    return (
      <div
        style={{ flex: 1, overflow: zoomed ? 'auto' : 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: zoomed ? 'zoom-out' : 'zoom-in' }}
        onClick={() => setZoomed(z => !z)}
      >
        <img
          src={url}
          alt={file.name}
          style={{
            maxWidth: zoomed ? 'none' : '100%',
            maxHeight: zoomed ? 'none' : 'calc(90vh - 100px)',
            objectFit: 'contain',
            display: 'block',
            transition: 'all 0.2s',
          }}
          draggable={false}
        />
      </div>
    )
  }

  if (mime.startsWith('video/')) {
    return (
      <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          controls
          autoPlay
          src={url}
          style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 100px)' }}
        />
      </div>
    )
  }

  if (mime.startsWith('audio/')) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40, background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(0,0,0,0))' }}>
        <MusicNote size={72} weight="duotone" color="#34d399" />
        <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{file.name}</p>
        {file.file_size && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{fmt(file.file_size)}</p>}
        <audio controls src={url} style={{ width: '80%', maxWidth: 500 }} />
      </div>
    )
  }

  if (mime === 'application/pdf') {
    return (
      <div style={{ flex: 1, background: '#1a1a1a' }}>
        <iframe src={url} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title={file.name} />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
      <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={72} />
      <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{file.name}</p>
      {file.file_size && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{fmt(file.file_size)} · {file.mime_type || 'Unknown type'}</p>}
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Preview not available for this file type</p>
      <a href={url} download={file.name} target="_blank" rel="noopener noreferrer">
        <button className="btn-primary" style={{ marginTop: 8 }}>
          <DownloadSimple size={14} /> Download File
        </button>
      </a>
    </div>
  )
}

export default function FilePreview({ files, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex)
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  const file = files[index]

  useEffect(() => {
    if (!file) return
    // If file already has a presigned URL from listing, use it
    if (file.thumbnailUrl && file.mime_type?.startsWith('image/')) {
      // For images, try to get the full res URL; fall back to thumbnail
      setUrl(file.thumbnailUrl)
      setLoading(false)
    }
    // Always fetch proper download URL
    setLoading(true)
    driveFilesApi.getDownloadUrl(file.id)
      .then(d => { setUrl(d.url); setLoading(false) })
      .catch(() => { setUrl(null); setLoading(false) })
  }, [file?.id])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft')  setIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex(i => Math.min(files.length - 1, i + 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [files.length, onClose])

  async function download() {
    try {
      const { url: dlUrl } = await driveFilesApi.getDownloadUrl(file.id)
      const a = document.createElement('a')
      a.href = dlUrl; a.download = file.name; a.click()
    } catch {}
  }

  if (!file) return null

  const overlay = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        style={{
          background: '#13131a', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16, overflow: 'hidden',
          width: 'min(92vw, 1000px)', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          animation: 'previewIn 0.18s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={24} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          {file.file_size && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{fmt(file.file_size)}</span>}
          <button className="btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={download}>
            <DownloadSimple size={14} /> Download
          </button>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
          <MediaContent file={file} url={url} loading={loading} />
        </div>

        {/* Footer: count */}
        {files.length > 1 && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            {index + 1} of {files.length}
          </div>
        )}
      </div>

      {/* Prev / Next arrows */}
      {index > 0 && (
        <button
          style={{ position: 'fixed', left: 20, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 8001 }}
          onClick={e => { e.stopPropagation(); setIndex(i => i - 1) }}
        >
          <CaretLeft size={20} color="#fff" />
        </button>
      )}
      {index < files.length - 1 && (
        <button
          style={{ position: 'fixed', right: 20, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 8001 }}
          onClick={e => { e.stopPropagation(); setIndex(i => i + 1) }}
        >
          <CaretRight size={20} color="#fff" />
        </button>
      )}
      <style>{`@keyframes previewIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}}`}</style>
    </div>
  )

  return ReactDOM.createPortal(overlay, document.body)
}
