/**
 * mediaUpload.js — Upload to Wasabi S3, then pull-ingest into Cloudflare Stream.
 *
 * Flow for video files:
 *   1. presign  → creates DB record, returns Wasabi PUT URL
 *   2. generate thumbnail + duration (client-side)
 *   3. upload to Wasabi (tracked progress)
 *   4. media-confirm-upload → marks wasabi_status = 'ready', stores thumbnail
 *   5. cloudflare-stream ingest_from_url → CF pulls file from Wasabi server-to-server
 *      Returns cloudflare_uid so the asset page shows CF player immediately
 *
 * Non-video files skip step 5.
 */

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

function getToken() {
  try { return JSON.parse(localStorage.getItem('ets_auth'))?.access_token } catch { return null }
}

async function getTokenAsync() {
  try {
    const { supabase } = await import('./supabaseClient.js')
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) return session.access_token
  } catch {}
  return getToken()
}

/** Extract a video frame as base64 JPEG */
export function generateVideoThumbnail(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = URL.createObjectURL(file)

    video.onloadeddata = () => {
      video.currentTime = Math.min(2, video.duration * 0.1)
    }

    video.onseeked = () => {
      const maxW = 1280
      const scale = Math.min(1, maxW / (video.videoWidth || 1280))
      canvas.width  = (video.videoWidth  || 1280) * scale
      canvas.height = (video.videoHeight || 720)  * scale
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return }
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.85)
      URL.revokeObjectURL(video.src)
    }

    video.onerror = () => resolve(null)
    setTimeout(() => resolve(null), 10000)
  })
}

/** Resize an image and return base64 JPEG */
export function generateImageThumbnail(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    img.onload = () => {
      const maxW = 1280
      const scale = Math.min(1, maxW / (img.width || 1))
      canvas.width  = img.width  * scale
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return }
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.85)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => resolve(null)
    img.src = URL.createObjectURL(file)
  })
}

/** Get video duration in seconds */
export function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      resolve(video.duration)
      URL.revokeObjectURL(video.src)
    }
    video.onerror = () => resolve(null)
    video.src = URL.createObjectURL(file)
  })
}

/** Upload a file to a presigned Wasabi PUT URL with progress */
export function uploadToWasabi(presignedUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.open('PUT', presignedUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.send(file)
  })
}

/**
 * Full upload orchestrator for project media.
 *
 * onProgress(0–100) tracks Wasabi upload progress only.
 * Cloudflare ingestion happens after confirm and is non-blocking to the
 * progress bar — it resolves quickly (CF just queues the pull job).
 */
export async function uploadMediaFile(file, projectId, folderId, onProgress) {
  const token = await getTokenAsync()
  const isVideo = file.type.startsWith('video/')

  // ── 1. Create DB record + get Wasabi PUT URL ───────────────────────────────
  const presignRes = await fetch(`${BASE}/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      upload_type: 'project_media',
      filename:    file.name,
      filesize:    file.size,
      mimetype:    file.type,
      project_id:  projectId,
      folder_id:   folderId || null,
    }),
  })

  const presignData = await presignRes.json()
  if (!presignRes.ok) {
    const err = new Error(presignData.error || 'Presign failed')
    if (presignData.code) err.code = presignData.code
    throw err
  }

  const uploadUrl = presignData.uploadUrl || presignData.upload_url
  const assetId   = presignData.assetId   || presignData.asset_id || presignData.media_id

  // ── 2. Generate thumbnail + duration (client-side, parallel) ──────────────
  let thumbnailBase64 = null
  let duration        = null

  if (isVideo) {
    ;[thumbnailBase64, duration] = await Promise.all([
      generateVideoThumbnail(file),
      getVideoDuration(file),
    ])
  } else if (file.type.startsWith('image/')) {
    thumbnailBase64 = await generateImageThumbnail(file)
  }

  // ── 3. Upload to Wasabi (with progress) ───────────────────────────────────
  await uploadToWasabi(uploadUrl, file, onProgress)

  // ── 4. Confirm upload (marks wasabi_status = 'ready', stores thumbnail) ───
  const confirmRes = await fetch(`${BASE}/media-confirm-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      asset_id:         assetId,
      thumbnail_base64: thumbnailBase64,
      duration,
    }),
  })

  if (!confirmRes.ok) {
    const d = await confirmRes.json().catch(() => ({}))
    throw new Error(d.error || 'Confirm upload failed')
  }

  const { asset } = await confirmRes.json()

  // ── 5. For videos: trigger Cloudflare Stream pull-ingest from Wasabi ───────
  // Cloudflare fetches the file server-to-server from Wasabi — no second
  // browser upload needed. We await this so the returned asset includes the
  // cloudflare_uid, letting the asset page show the CF player immediately.
  if (isVideo) {
    try {
      const cfRes = await fetch(`${BASE}/cloudflare-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'ingest_from_url', media_id: assetId }),
      })
      if (cfRes.ok) {
        const cfData = await cfRes.json()
        if (cfData.uid && asset) {
          asset.cloudflare_uid    = cfData.uid
          asset.cloudflare_status = 'processing'
        }
      }
    } catch (err) {
      // Non-fatal — auto-ingest will retry when user views the asset
      console.error('CF ingest failed (non-fatal):', err)
    }
  }

  return asset
}
