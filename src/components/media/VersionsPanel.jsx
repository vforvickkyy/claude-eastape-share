/**
 * VersionsPanel — lists all versions of a project_media asset.
 * Uploads a new version by uploading to Wasabi/Cloudflare then doing a
 * version_bump on the ORIGINAL asset — no new tile is created.
 */
import React, { useEffect, useState, useRef } from 'react'
import { CloudArrowUp, CheckCircle, Warning } from '@phosphor-icons/react'
import { projectMediaApi } from '../../lib/api'
import {
  uploadToWasabi, generateVideoThumbnail, generateImageThumbnail, getVideoDuration,
} from '../../lib/mediaUpload'
import { cloudflareApi } from '../../lib/api'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export default function VersionsPanel({ asset, onVersionUploaded }) {
  const [versions,   setVersions]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [error,      setError]      = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!asset?.id) return
    projectMediaApi.getVersions(asset.id)
      .then(d => setVersions(d.versions || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [asset.id])

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')

      // 1. Get presigned Wasabi upload URL (creates a TEMP asset — we'll delete it after)
      const token = JSON.parse(localStorage.getItem('ets_auth') || '{}')?.access_token
      const presignRes = await fetch(`${BASE}/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          upload_type: 'project_media',
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          project_id: asset.project_id,
          folder_id: asset.folder_id || null,
        }),
      })
      if (!presignRes.ok) throw new Error('Failed to get upload URL')
      const { upload_url: uploadUrl, wasabi_key, wasabi_thumbnail_key, asset_id: tempAssetId } = await presignRes.json()

      // 2. Generate thumbnail + duration in parallel with getting CF upload URL
      const [thumbnailBase64, duration, cfData] = await Promise.all([
        isVideo ? generateVideoThumbnail(file) : isImage ? generateImageThumbnail(file) : Promise.resolve(null),
        isVideo ? getVideoDuration(file) : Promise.resolve(null),
        isVideo ? cloudflareApi.getUploadUrl(file.size, file.name, tempAssetId).catch(() => null) : Promise.resolve(null),
      ])

      const cloudflareUploadUrl = cfData?.upload_url
      const cloudflareUid       = cfData?.uid

      // 3. Upload to Wasabi (+ Cloudflare for videos) in parallel
      const uploads = [uploadToWasabi(uploadUrl, file, pct => setProgress(Math.round(pct * 0.9)))]
      if (isVideo && cloudflareUploadUrl) {
        const cfForm = new FormData()
        cfForm.append('file', file)
        uploads.push(fetch(cloudflareUploadUrl, { method: 'POST', body: cfForm }).catch(() => null))
      }
      await Promise.allSettled(uploads)
      setProgress(95)

      // 4. Confirm the temp asset (saves thumbnail)
      if (tempAssetId) {
        await fetch(`${BASE}/media-confirm-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            asset_id: tempAssetId,
            thumbnail_base64: thumbnailBase64,
            duration,
            cloudflare_uid:    cloudflareUid    || null,
            cloudflare_status: cloudflareUid ? 'processing' : 'none',
          }),
        }).catch(() => {})
      }

      // 5. Version-bump the ORIGINAL asset: snapshot current → versions table, apply new file fields
      const bumped = await projectMediaApi.versionBump(asset.id, {
        wasabi_key,
        wasabi_thumbnail_key: wasabi_thumbnail_key || null,
        cloudflare_uid:       cloudflareUid    || null,
        cloudflare_status:    cloudflareUid ? 'processing' : (asset.cloudflare_status || 'none'),
        duration:             duration        || null,
        file_size:            file.size,
        wasabi_status:        'ready',
      })

      // 6. Delete the temp asset (non-fatal)
      if (tempAssetId) {
        await projectMediaApi.delete(tempAssetId).catch(() => {})
      }

      setProgress(100)

      // Refresh versions list
      const refreshed = await projectMediaApi.getVersions(asset.id).catch(() => ({ versions: [] }))
      setVersions(refreshed.versions || [])

      onVersionUploaded?.(bumped.media || bumped.asset)
    } catch (err) {
      setError(err.message || 'Version upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="versions-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>
          Current: <strong style={{ color: 'var(--t1)' }}>v{asset.version || 1}</strong>
        </span>
        <button
          className="btn-ghost"
          style={{ fontSize: 12 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <CloudArrowUp size={13} />
          {uploading ? `Uploading… ${progress}%` : `Upload v${(asset.version || 1) + 1}`}
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 12, marginBottom: 10 }}>
          <Warning size={13} /> {error}
        </div>
      )}

      {uploading && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--purple-l)', transition: 'width 0.3s' }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            Uploading new version… {progress}%
          </p>
        </div>
      )}

      {loading ? (
        <div className="empty-state" style={{ padding: '24px 0' }}><span className="spinner" /></div>
      ) : (
        <div className="versions-list">
          {/* Current version */}
          <div className="version-item active">
            <span className="version-badge">v{asset.version || 1} — Current</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              {asset.updated_at ? new Date(asset.updated_at).toLocaleDateString() : ''}
            </span>
          </div>

          {/* Previous versions */}
          {versions
            .sort((a, b) => b.version_number - a.version_number)
            .map(v => (
              <div key={v.id} className="version-item">
                <span className="version-badge past">v{v.version_number}</span>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))
          }

          {versions.length === 0 && !uploading && (
            <p style={{ color: 'var(--t3)', fontSize: 12, padding: '8px 0' }}>
              No previous versions. Upload a new version above.
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={handleFileSelected}
      />
    </div>
  )
}
