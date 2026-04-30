/**
 * UploadPanel — drag-and-drop upload to Wasabi S3 + sequential CF ingest.
 *
 * All files upload to Wasabi in parallel (fast, tracked progress).
 * After each video upload completes, it joins a sequential CF ingest queue
 * processed one-at-a-time to avoid Cloudflare API rate limits.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  CloudArrowUp, X, CheckCircle, Warning,
  File, FileVideo, FileImage, FileAudio, MusicNote,
} from '@phosphor-icons/react'
import { uploadMediaFile, ingestToCloudflare } from '../../lib/mediaUpload'
import { formatSize } from '../../lib/userApi'

const ACCEPTED = [
  'video/mp4','video/quicktime','video/x-matroska','video/x-msvideo','video/webm',
  'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
  'audio/mpeg','audio/wav','audio/aac','audio/ogg','audio/flac',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]

function FileIcon({ mimeType }) {
  if (mimeType?.startsWith('video/'))  return <FileVideo size={20} weight="duotone" style={{ color: 'var(--purple-l)' }} />
  if (mimeType?.startsWith('image/'))  return <FileImage size={20} weight="duotone" style={{ color: 'var(--blue-l)' }} />
  if (mimeType?.startsWith('audio/'))  return <MusicNote  size={20} weight="duotone" style={{ color: '#34d399' }} />
  return <File size={20} weight="duotone" style={{ color: 'var(--t3)' }} />
}

export default function UploadPanel({ projectId, folderId, onClose, onUploaded }) {
  const [files,    setFiles]    = useState([])
  const [dragging, setDragging] = useState(false)
  const [dragCount, setDragCount] = useState(0)
  const fileInputRef = useRef(null)

  // Sequential CF ingest queue — prevents rate-limiting when bulk-uploading
  const cfQueue     = useRef([])   // [{ assetId, fileId }]
  const cfRunning   = useRef(false)

  async function processCfQueue() {
    if (cfRunning.current) return
    cfRunning.current = true
    while (cfQueue.current.length > 0) {
      const { assetId, fileId } = cfQueue.current.shift()
      updateFile(fileId, { cfStatus: 'ingesting' })
      try {
        const uid = await ingestToCloudflare(assetId)
        updateFile(fileId, { cfStatus: uid ? 'cf_ready' : 'cf_failed' })
      } catch {
        updateFile(fileId, { cfStatus: 'cf_failed' })
      }
      // 800 ms gap between CF API calls
      if (cfQueue.current.length > 0) await new Promise(r => setTimeout(r, 800))
    }
    cfRunning.current = false
  }

  function enqueueCfIngest(assetId, fileId) {
    cfQueue.current.push({ assetId, fileId })
    processCfQueue()
  }

  function addFiles(newFiles) {
    const items = Array.from(newFiles).map(f => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      status: 'queued',
      progress: 0,
      assetId: null,
      error: null,
      cfStatus: null, // null | 'ingesting' | 'cf_ready' | 'cf_failed'
    }))
    setFiles(prev => [...prev, ...items])
    items.forEach(item => startUpload(item))
  }

  const onDragEnter = useCallback(e => { e.preventDefault(); setDragCount(c => c + 1); setDragging(true) }, [])
  const onDragLeave = useCallback(e => { e.preventDefault(); setDragCount(c => { const n = c - 1; if (n <= 0) setDragging(false); return n }) }, [])
  const onDragOver  = useCallback(e => { e.preventDefault() }, [])
  const onDropFiles = useCallback(e => {
    e.preventDefault(); setDragging(false); setDragCount(0)
    addFiles(e.dataTransfer.files)
  }, [projectId, folderId])

  useEffect(() => {
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover',  onDragOver)
    window.addEventListener('drop',      onDropFiles)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover',  onDragOver)
      window.removeEventListener('drop',      onDropFiles)
    }
  }, [onDragEnter, onDragLeave, onDragOver, onDropFiles])

  function updateFile(id, patch) {
    setFiles(fs => fs.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  async function startUpload(item) {
    updateFile(item.id, { status: 'uploading' })
    try {
      const asset = await uploadMediaFile(
        item.file,
        projectId,
        folderId,
        (pct) => updateFile(item.id, { progress: pct }),
      )
      updateFile(item.id, { status: 'ready', progress: 100, assetId: asset.id })
      onUploaded?.(asset)

      // Queue CF ingest for videos (sequential to avoid rate limiting)
      const isVideo = item.file.type.startsWith('video/')
      if (isVideo && asset?.id) {
        enqueueCfIngest(asset.id, item.id)
      }
    } catch (err) {
      updateFile(item.id, {
        status: 'error',
        error: err.code === 'STORAGE_QUOTA_EXCEEDED'
          ? err.message + ' Upgrade your plan.'
          : err.message,
      })
    }
  }

  const allDone = files.length > 0 && files.every(f => f.status === 'ready' || f.status === 'error')

  return (
    <motion.div
      className="upload-panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="upload-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
      >
        <div className="upload-panel-header">
          <span className="upload-panel-title">
            <CloudArrowUp size={18} weight="duotone" /> Upload Files
          </span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Drop zone */}
        <div
          className={`upload-panel-dropzone ${dragging ? 'dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <CloudArrowUp size={36} weight="thin" />
          <p className="drop-title">Drag & drop files here</p>
          <p className="drop-sub">or <span className="drop-link">click to browse</span></p>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            Videos, Images, Audio, Documents supported
          </p>
        </div>

        {/* File queue */}
        {files.length > 0 && (
          <div className="upload-panel-queue">
            {files.map(item => (
              <div key={item.id} className="upload-queue-item">
                <div className="upload-queue-icon">
                  <FileIcon mimeType={item.file.type} />
                </div>
                <div className="upload-queue-info">
                  <span className="upload-queue-name">{item.file.name}</span>
                  <span className="upload-queue-size">{formatSize(item.file.size)}</span>
                  {item.status === 'uploading' && (
                    <div className="progress-track" style={{ marginTop: 4 }}>
                      <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                  {item.status === 'ready' && item.cfStatus === 'ingesting' && (
                    <span style={{ fontSize: 11, color: 'var(--purple-l)' }}>Queuing for Cloudflare Stream…</span>
                  )}
                  {item.error && (
                    <span style={{ fontSize: 11, color: '#f87171' }}>{item.error}</span>
                  )}
                </div>
                <div className="upload-queue-status">
                  {item.status === 'queued'    && <span className="spinner" />}
                  {item.status === 'uploading' && <span style={{ fontSize: 11, color: 'var(--t2)' }}>{item.progress}%</span>}
                  {item.status === 'ready' && !item.cfStatus && <CheckCircle size={18} style={{ color: '#22c55e' }} />}
                  {item.status === 'ready' && item.cfStatus === 'ingesting' && <span className="spinner" style={{ width: 16, height: 16 }} />}
                  {item.status === 'ready' && item.cfStatus === 'cf_ready'  && <CheckCircle size={18} style={{ color: '#22c55e' }} />}
                  {item.status === 'ready' && item.cfStatus === 'cf_failed' && <CheckCircle size={18} style={{ color: '#22c55e' }} />}
                  {item.status === 'error' && <Warning size={18} style={{ color: '#f87171' }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {allDone && (
          <div style={{ padding: '0 20px 20px' }}>
            <button className="btn-primary-sm" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
              Done
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept={ACCEPTED.join(',')}
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
        />
      </motion.div>
    </motion.div>
  )
}
