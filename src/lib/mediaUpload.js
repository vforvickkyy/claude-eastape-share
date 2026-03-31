/**
 * mediaUpload.js — Wasabi S3 + Cloudflare Stream upload utilities
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
 * Full upload orchestrator:
 * 1. Get presigned URL from presign edge function (creates DB record)
 * 2. Generate thumbnail + duration
 * 3. For video files: get Cloudflare direct upload URL simultaneously
 * 4. Upload to Wasabi (with progress) + Cloudflare simultaneously
 * 5. Confirm upload + save thumbnail + cloudflare fields
 */
export async function uploadMediaFile(file, projectId, folderId, onProgress) {
  const token = await getTokenAsync()
  const isVideo = file.type.startsWith('video/')

  // 1. Get presigned URL + pre-create DB record
  const presignRes = await fetch(`${BASE}/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      upload_type: 'project_media',
      filename: file.name,
      filesize: file.size,
      mimetype: file.type,
      project_id: projectId,
      folder_id: folderId || null,
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

  // 2. Generate thumbnail + duration
  let thumbnailBase64 = null
  let duration = null

  if (isVideo) {
    ;[thumbnailBase64, duration] = await Promise.all([
      generateVideoThumbnail(file),
      getVideoDuration(file),
    ])
  } else if (file.type.startsWith('image/')) {
    thumbnailBase64 = await generateImageThumbnail(file)
  }

  // 3. For video files: get Cloudflare direct upload URL
  let cloudflareUploadUrl = null
  let cloudflareUid = null

  if (isVideo) {
    try {
      const cfRes = await fetch(`${BASE}/cloudflare-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'get_upload_url', file_size: file.size, file_name: file.name, media_id: assetId }),
      })
      if (cfRes.ok) {
        const cfData = await cfRes.json()
        if (cfData.success) {
          cloudflareUploadUrl = cfData.upload_url
          cloudflareUid = cfData.uid
        }
      }
    } catch (err) {
      console.error('Cloudflare upload URL failed (non-fatal):', err)
    }
  }

  // 4. Upload to Wasabi + Cloudflare simultaneously
  const uploadPromises = [
    uploadToWasabi(uploadUrl, file, onProgress),
  ]

  if (isVideo && cloudflareUploadUrl) {
    // Cloudflare direct_upload URL expects multipart/form-data POST with file field
    const cfForm = new FormData()
    cfForm.append('file', file)
    uploadPromises.push(
      fetch(cloudflareUploadUrl, {
        method: 'POST',
        body: cfForm,
        // No Content-Type header — browser sets multipart boundary automatically
      }).catch(err => {
        console.error('Cloudflare upload failed (non-fatal):', err)
        return null
      })
    )
  }

  await Promise.allSettled(uploadPromises)

  // 5. Confirm upload
  const confirmRes = await fetch(`${BASE}/media-confirm-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      asset_id: assetId,
      thumbnail_base64: thumbnailBase64,
      duration,
      cloudflare_uid: cloudflareUid,
      cloudflare_status: cloudflareUid ? 'processing' : 'none',
    }),
  })

  if (!confirmRes.ok) {
    const d = await confirmRes.json().catch(() => ({}))
    throw new Error(d.error || 'Confirm upload failed')
  }

  const { asset } = await confirmRes.json()
  return asset
}
