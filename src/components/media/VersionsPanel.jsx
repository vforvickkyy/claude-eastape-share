/**
 * VersionsPanel — lists all versions of a project_media asset.
 * Uploads a new version via the shared UploadProgressPanel (bottom-right floating panel).
 * Allows switching to a previous version for live preview.
 */
import React, { useEffect, useState, useRef } from 'react'
import { CloudArrowUp, Warning, ArrowCounterClockwise, Clock } from '@phosphor-icons/react'
import { projectMediaApi, cloudflareApi } from '../../lib/api'
import {
  uploadToWasabi, generateVideoThumbnail, generateImageThumbnail, getVideoDuration,
} from '../../lib/mediaUpload'
import { useUpload } from '../../context/UploadContext'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export default function VersionsPanel({ asset, onVersionUploaded, onPreviewVersion }) {
  const [versions,     setVersions]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [previewingV,  setPreviewingV]  = useState(null)  // version_number being previewed, null = current
  const fileInputRef   = useRef(null)
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
      // Restore current
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
    })
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
      // Get token from supabase session (auto-refreshes), fall back to ets_auth
      const { supabase: sb } = await import('../../lib/supabaseClient')
      const { data: { session } } = await sb.auth.getSession().catch(() => ({ data: {} }))
      const token = session?.access_token || JSON.parse(localStorage.getItem('ets_auth') || '{}')?.access_token

      // 1. Get presigned Wasabi upload URL (creates a TEMP asset)
      // presign expects: filename, filesize, mimetype (not file_name etc.)
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
      // presign returns: uploadUrl, assetId, wasabiKey, thumbnailKey
      const { uploadUrl, assetId: tempAssetId, wasabiKey, thumbnailKey } = await presignRes.json()

      onProgress(5)

      // 2. Generate thumbnail + duration + Cloudflare URL in parallel
      const [thumbnailBase64, duration, cfData] = await Promise.all([
        isVideo ? generateVideoThumbnail(file) : isImage ? generateImageThumbnail(file) : Promise.resolve(null),
        isVideo ? getVideoDuration(file) : Promise.resolve(null),
        isVideo ? cloudflareApi.getUploadUrl(file.size, file.name, tempAssetId).catch(() => null) : Promise.resolve(null),
      ])

      onProgress(15)

      const cloudflareUploadUrl = cfData?.upload_url
      const cloudflareUid       = cfData?.uid

      // 3. Upload to Wasabi (+Cloudflare for videos) in parallel
      const uploads = [uploadToWasabi(uploadUrl, file, pct => onProgress(15 + Math.round(pct * 0.75)))]
      if (isVideo && cloudflareUploadUrl) {
        const cfForm = new FormData()
        cfForm.append('file', file)
        uploads.push(fetch(cloudflareUploadUrl, { method: 'POST', body: cfForm }).catch(() => null))
      }
      await Promise.allSettled(uploads)
      onProgress(92)

      // 4. Confirm temp asset (saves thumbnail)
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

      // 5. Version-bump the ORIGINAL asset
      // wasabiKey / thumbnailKey are the field names returned by presign
      const bumped = await projectMediaApi.versionBump(asset.id, {
        wasabi_key:           wasabiKey,
        wasabi_thumbnail_key: thumbnailKey || null,
        cloudflare_uid:       cloudflareUid    || null,
        cloudflare_status:    cloudflareUid ? 'processing' : (asset.cloudflare_status || 'none'),
        duration:             duration        || null,
        file_size:            file.size,
        wasabi_status:        'ready',
      })

      // 6. Delete temp asset (non-fatal)
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
        // Refresh versions list after upload completes
        const refreshed = await projectMediaApi.getVersions(asset.id).catch(() => ({ versions: [] }))
        setVersions(refreshed.versions || [])
        setPreviewingV(null)
      }
    )
  }

  const currentVersion = asset.version || 1

  return (
    <div className="versions-panel">
      {/* Header row */}
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
          <button
            className="btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudArrowUp size={13} />
            Upload v{currentVersion + 1}
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
          {/* Current version */}
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

          {/* Previous versions */}
          {versions
            .sort((a, b) => b.version_number - a.version_number)
            .map(v => (
              <div
                key={v.id}
                className={`version-item ${previewingV === v.version_number ? 'active' : ''}`}
                onClick={() => handlePreview(v)}
                title="Click to preview this version"
                style={{ cursor: 'pointer' }}
              >
                <div className="version-item-left">
                  <span className="version-badge past">v{v.version_number}</span>
                  {previewingV === v.version_number && (
                    <span className="version-tag preview">Previewing</span>
                  )}
                </div>
                <span className="version-date">
                  <Clock size={10} style={{ marginRight: 3 }} />
                  {v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}
                </span>
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
