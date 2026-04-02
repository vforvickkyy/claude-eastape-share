/**
 * VersionsPanel — lists all versions, upload new, preview old, rename, delete.
 * Calls onPreviewVersion(versionData, seekTime) so the player can seek to the
 * same timestamp when switching versions.
 */
import React, { useEffect, useState, useRef } from 'react'
import {
  CloudArrowUp, Warning, ArrowCounterClockwise, Clock,
  PencilSimple, Trash, Check, X,
} from '@phosphor-icons/react'
import { projectMediaApi, cloudflareApi } from '../../lib/api'
import {
  uploadToWasabi, generateVideoThumbnail, generateImageThumbnail, getVideoDuration,
} from '../../lib/mediaUpload'
import { useUpload } from '../../context/UploadContext'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export default function VersionsPanel({ asset, currentTime, onVersionUploaded, onPreviewVersion }) {
  const [versions,    setVersions]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [previewingV, setPreviewingV] = useState(null)  // version_number being previewed
  const [editingId,   setEditingId]   = useState(null)  // version row id being renamed
  const [editLabel,   setEditLabel]   = useState('')
  const fileInputRef = useRef(null)
  const { addCustomUpload } = useUpload()

  useEffect(() => {
    if (!asset?.id) return
    projectMediaApi.getVersions(asset.id)
      .then(d => setVersions(d.versions || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [asset.id])

  function handlePreview(version) {
    if (!version) {
      setPreviewingV(null)
      onPreviewVersion?.(null)
      return
    }
    setPreviewingV(version.version_number)
    onPreviewVersion?.({
      wasabi_key:           version.wasabi_key,
      wasabi_thumbnail_key: version.wasabi_thumbnail_key,
      cloudflare_uid:       version.cloudflare_uid,
      cloudflare_status:    version.cloudflare_status,
      duration:             version.duration,
      file_size:            version.file_size,
      version_number:       version.version_number,
    }, currentTime ?? 0)
  }

  async function handleDelete(e, v) {
    e.stopPropagation()
    if (!confirm(`Delete version v${v.version_number}? This cannot be undone.`)) return
    try {
      await projectMediaApi.deleteVersion(v.id)
      setVersions(vs => vs.filter(x => x.id !== v.id))
      // If this was the previewed version, restore current
      if (previewingV === v.version_number) {
        setPreviewingV(null)
        onPreviewVersion?.(null)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  function startRename(e, v) {
    e.stopPropagation()
    setEditingId(v.id)
    setEditLabel(v.label || `v${v.version_number}`)
  }

  async function saveRename(v) {
    const trimmed = editLabel.trim()
    if (!trimmed) { cancelRename(); return }
    try {
      await projectMediaApi.updateVersionLabel(v.id, trimmed === `v${v.version_number}` ? null : trimmed)
      setVersions(vs => vs.map(x => x.id === v.id ? { ...x, label: trimmed === `v${v.version_number}` ? null : trimmed } : x))
    } catch (err) {
      setError(err.message)
    }
    setEditingId(null)
  }

  function cancelRename() {
    setEditingId(null)
    setEditLabel('')
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)

    const nextVersion = (asset.version || 1) + 1

    const uploadFn = async (onProgress) => {
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      const { supabase: sb } = await import('../../lib/supabaseClient')
      const { data: { session } } = await sb.auth.getSession().catch(() => ({ data: {} }))
      const token = session?.access_token || JSON.parse(localStorage.getItem('ets_auth') || '{}')?.access_token

      const presignRes = await fetch(`${BASE}/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          upload_type: 'project_media',
          filename:    file.name,
          filesize:    file.size,
          mimetype:    file.type,
          project_id:  asset.project_id,
          folder_id:   asset.folder_id || null,
        }),
      })
      if (!presignRes.ok) {
        const errBody = await presignRes.json().catch(() => ({}))
        throw new Error(errBody.error || 'Failed to get upload URL')
      }
      const { uploadUrl, assetId: tempAssetId, wasabiKey, thumbnailKey } = await presignRes.json()

      onProgress(5)

      const [thumbnailBase64, duration, cfData] = await Promise.all([
        isVideo ? generateVideoThumbnail(file) : isImage ? generateImageThumbnail(file) : Promise.resolve(null),
        isVideo ? getVideoDuration(file) : Promise.resolve(null),
        isVideo ? cloudflareApi.getUploadUrl(file.size, file.name, tempAssetId).catch(() => null) : Promise.resolve(null),
      ])

      onProgress(15)

      const cloudflareUploadUrl = cfData?.upload_url
      const cloudflareUid       = cfData?.uid

      const uploads = [uploadToWasabi(uploadUrl, file, pct => onProgress(15 + Math.round(pct * 0.75)))]
      if (isVideo && cloudflareUploadUrl) {
        const cfForm = new FormData()
        cfForm.append('file', file)
        uploads.push(fetch(cloudflareUploadUrl, { method: 'POST', body: cfForm }).catch(() => null))
      }
      await Promise.allSettled(uploads)
      onProgress(92)

      if (tempAssetId) {
        await fetch(`${BASE}/media-confirm-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            asset_id:          tempAssetId,
            thumbnail_base64:  thumbnailBase64,
            duration,
            cloudflare_uid:    cloudflareUid    || null,
            cloudflare_status: cloudflareUid ? 'processing' : 'none',
          }),
        }).catch(() => {})
      }

      onProgress(96)

      const bumped = await projectMediaApi.versionBump(asset.id, {
        wasabi_key:           wasabiKey,
        wasabi_thumbnail_key: thumbnailKey || null,
        cloudflare_uid:       cloudflareUid    || null,
        cloudflare_status:    cloudflareUid ? 'processing' : (asset.cloudflare_status || 'none'),
        duration:             duration        || null,
        file_size:            file.size,
        wasabi_status:        'ready',
      })

      if (tempAssetId) {
        await projectMediaApi.delete(tempAssetId).catch(() => {})
      }

      onVersionUploaded?.(bumped.media || bumped.asset)
    }

    addCustomUpload(
      `${file.name} — v${nextVersion}`,
      file.size,
      uploadFn,
      async () => {
        const refreshed = await projectMediaApi.getVersions(asset.id).catch(() => ({ versions: [] }))
        setVersions(refreshed.versions || [])
        setPreviewingV(null)
      }
    )
  }

  const currentVersion = asset.version || 1

  return (
    <div className="versions-panel">
      {/* Header */}
      <div className="versions-header">
        <span className="versions-current-label">
          {previewingV != null
            ? <><ArrowCounterClockwise size={12} style={{ marginRight: 4 }} />Previewing <strong>v{previewingV}</strong></>
            : <>Current: <strong>v{currentVersion}</strong></>
          }
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {previewingV != null && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => handlePreview(null)}>
              <ArrowCounterClockwise size={12} /> Restore current
            </button>
          )}
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => fileInputRef.current?.click()}>
            <CloudArrowUp size={13} /> Upload v{currentVersion + 1}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 12, marginBottom: 10 }}>
          <Warning size={13} /> {error}
        </div>
      )}

      {loading ? (
        <div className="empty-state" style={{ padding: '24px 0' }}><span className="spinner" /></div>
      ) : (
        <div className="versions-list">
          {/* Current version row */}
          <div
            className={`version-item ${previewingV == null ? 'active' : ''}`}
            onClick={() => previewingV != null && handlePreview(null)}
            style={{ cursor: previewingV != null ? 'pointer' : 'default' }}
          >
            <div className="version-item-left">
              <span className="version-badge">v{currentVersion}</span>
              <span className="version-tag current">Current</span>
            </div>
            <span className="version-date">
              <Clock size={10} style={{ marginRight: 3 }} />
              {asset.updated_at ? new Date(asset.updated_at).toLocaleDateString() : ''}
            </span>
          </div>

          {/* Previous version rows */}
          {versions
            .sort((a, b) => b.version_number - a.version_number)
            .map(v => (
              <div
                key={v.id}
                className={`version-item ${previewingV === v.version_number ? 'active' : ''}`}
                onClick={() => editingId !== v.id && handlePreview(v)}
                title={editingId === v.id ? undefined : 'Click to preview this version'}
                style={{ cursor: editingId === v.id ? 'default' : 'pointer' }}
              >
                <div className="version-item-left" style={{ flex: 1, minWidth: 0 }}>
                  <span className="version-badge past">v{v.version_number}</span>

                  {editingId === v.id ? (
                    <div className="version-label-edit" onClick={e => e.stopPropagation()}>
                      <input
                        className="version-label-input"
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename(v)
                          if (e.key === 'Escape') cancelRename()
                        }}
                        autoFocus
                        maxLength={60}
                      />
                      <button className="version-action-btn" onClick={() => saveRename(v)} title="Save">
                        <Check size={11} />
                      </button>
                      <button className="version-action-btn" onClick={cancelRename} title="Cancel">
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {v.label && (
                        <span className="version-label-text" title={v.label}>{v.label}</span>
                      )}
                      {previewingV === v.version_number && (
                        <span className="version-tag preview">Previewing</span>
                      )}
                    </>
                  )}
                </div>

                <div className="version-item-right">
                  <span className="version-date">
                    <Clock size={10} style={{ marginRight: 3 }} />
                    {v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}
                  </span>
                  <button
                    className="version-action-btn"
                    onClick={e => startRename(e, v)}
                    title="Rename version"
                  >
                    <PencilSimple size={12} />
                  </button>
                  <button
                    className="version-action-btn danger"
                    onClick={e => handleDelete(e, v)}
                    title="Delete version"
                  >
                    <Trash size={12} />
                  </button>
                </div>
              </div>
            ))
          }

          {versions.length === 0 && (
            <p style={{ color: 'var(--t3)', fontSize: 12, padding: '8px 0' }}>
              No previous versions. Upload a new version above.
            </p>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" hidden onChange={handleFileSelected} />
    </div>
  )
}
