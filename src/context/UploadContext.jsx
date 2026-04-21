import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import { driveFilesApi } from '../lib/api'

const MULTIPART_THRESHOLD = 4.9 * 1024 * 1024 * 1024  // 4.9 GB — use multipart only when single PUT would fail
const PART_SIZE           = 100 * 1024 * 1024          // 100 MB per part

const UploadContext = createContext(null)

export function UploadProvider({ children }) {
  const [uploads, setUploads]                 = useState([])
  const [isMinimized, setIsMinimized]         = useState(false)
  const [pendingDuplicates, setPendingDuplicates] = useState(null) // { files[], folderId, existingFiles[] }

  const xhrRefs    = useRef({})  // id → XHR instance
  const queueRef   = useRef([])  // items waiting to start
  const activeRef  = useRef(0)   // count of active uploads
  const onDoneRef  = useRef(null) // called when all complete

  const autoHideTimer = useRef(null)

  const updItem = useCallback((id, patch) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
  }, [])

  function scheduleAutoHide() {
    clearTimeout(autoHideTimer.current)
    autoHideTimer.current = setTimeout(() => {
      setUploads([])
    }, 3000)
  }

  async function runUpload(item) {
    activeRef.current++
    updItem(item.id, { status: 'uploading' })
    try {
      if (item.uploadFn) {
        // Custom upload function — used for version bumps, etc.
        await item.uploadFn((pct) => updItem(item.id, { progress: pct }))
        updItem(item.id, { progress: 100, status: 'done', speed: null, eta: null })
        item.onItemComplete?.()
      } else if (item.size > MULTIPART_THRESHOLD) {
        // ── Multipart upload (files > 4.9 GB) ────────────────────────────────
        let initiateUrl, wasabiKey, fileId, thumbnailPresignedUrl

        if (item.initiateUrl) {
          // Pre-fetched during batch initiate
          initiateUrl          = item.initiateUrl
          wasabiKey            = item.wasabiKey
          fileId               = item.fileId
          thumbnailPresignedUrl = item.thumbnailPresignedUrl
        } else {
          const res = await driveFilesApi.multipartInitiate({
            name: item.name, size: item.size,
            type: item.file.type || 'application/octet-stream',
            folderId: item.folderId || undefined,
          })
          initiateUrl          = res.initiateUrl
          wasabiKey            = res.wasabiKey
          fileId               = res.fileId
          thumbnailPresignedUrl = res.thumbnailPresignedUrl
        }

        // POST the presigned initiate URL directly to Wasabi to get the uploadId
        const initRes = await fetch(initiateUrl, { method: 'POST' })
        if (!initRes.ok) {
          const errText = await initRes.text()
          throw new Error(`Multipart init failed (${initRes.status}): ${errText}`)
        }
        const initXml = await initRes.text()
        const uploadIdMatch = initXml.match(/<UploadId>([^<]+)<\/UploadId>/)
        if (!uploadIdMatch) throw new Error('No UploadId in Wasabi response')
        const uploadId = uploadIdMatch[1]

        const totalParts = Math.ceil(item.size / PART_SIZE)
        const parts = []
        let totalUploaded = 0
        let lastLoaded = 0, lastTime = 0, emaSpeed = 0

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          // Check if cancelled
          if (!xhrRefs.current[item.id] && xhrRefs.current[item.id] !== undefined) break

          const start  = (partNumber - 1) * PART_SIZE
          const end    = Math.min(start + PART_SIZE, item.size)
          const chunk  = item.file.slice(start, end)

          const { partUrl } = await driveFilesApi.multipartPresignPart({ uploadId, wasabiKey, partNumber })

          const etag = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhrRefs.current[item.id] = xhr

            xhr.upload.onprogress = (e) => {
              if (!e.lengthComputable) return
              const now = Date.now()
              const partLoaded = totalUploaded + e.loaded
              const pct = Math.round(partLoaded / item.size * 100)

              if (lastTime === 0) { lastLoaded = partLoaded; lastTime = now; updItem(item.id, { progress: pct }); return }
              const dt = (now - lastTime) / 1000
              if (dt >= 0.3) {
                const instant = (partLoaded - lastLoaded) / dt
                emaSpeed = emaSpeed === 0 ? instant : emaSpeed * 0.6 + instant * 0.4
                lastLoaded = partLoaded; lastTime = now
                const bytesLeft = item.size - partLoaded
                const eta = emaSpeed > 0 ? Math.ceil(bytesLeft / emaSpeed) : null
                updItem(item.id, { progress: pct, speed: Math.round(emaSpeed), eta })
              } else {
                updItem(item.id, { progress: pct })
              }
            }
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.getResponseHeader('ETag') || '')
              } else {
                reject(new Error(`Part ${partNumber} failed (HTTP ${xhr.status})`))
              }
            }
            xhr.onerror = () => reject(new Error('Network error'))
            xhr.onabort = () => reject(new Error('cancelled'))
            xhr.open('PUT', partUrl)
            // Don't set Content-Type — it's not in SignedHeaders and some S3 implementations reject it
            xhr.send(chunk)
          })

          totalUploaded += (end - start)
          parts.push({ partNumber, etag })
        }

        // Complete the multipart upload
        await driveFilesApi.multipartComplete({ uploadId, wasabiKey, fileId, parts })
        updItem(item.id, { progress: 100, status: 'done', speed: null, eta: null })

        // Thumbnail (non-blocking)
        if (thumbnailPresignedUrl && fileId) {
          const mime = item.file.type || ''
          if (mime.startsWith('image/') || mime.startsWith('video/')) {
            import('../lib/mediaUpload').then(async ({ generateVideoThumbnail, generateImageThumbnail }) => {
              try {
                const base64 = mime.startsWith('video/')
                  ? await generateVideoThumbnail(item.file)
                  : await generateImageThumbnail(item.file)
                if (base64) {
                  const byteStr = atob(base64.split(',')[1])
                  const arr = new Uint8Array(byteStr.length)
                  for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
                  const blob = new Blob([arr], { type: 'image/jpeg' })
                  await fetch(thumbnailPresignedUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } })
                }
              } catch {}
            }).catch(() => {})
          }
        }

      } else {
        // ── Single PUT upload (files ≤ 100 MB) ───────────────────────────────
        // Use pre-fetched URL if available (batch presign), otherwise fetch individually
        let presignedUrl, thumbnailPresignedUrl, fileId
        if (item.presignedUrl) {
          presignedUrl = item.presignedUrl
          thumbnailPresignedUrl = item.thumbnailPresignedUrl
          fileId = item.fileId
        } else {
          const { uploads: presigned } = await driveFilesApi.presign({
            files: [{ name: item.name, size: item.size, type: item.file.type || 'application/octet-stream' }],
            folderId: item.folderId || undefined,
          })
          ;({ presignedUrl, thumbnailPresignedUrl, fileId } = presigned[0])
        }

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrRefs.current[item.id] = xhr

          // Speed tracking (per-upload closure)
          let lastLoaded = 0
          let lastTime   = 0
          let emaSpeed   = 0   // bytes/sec exponential moving average

          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return
            const now = Date.now()
            const pct = Math.round(e.loaded / e.total * 100)

            if (lastTime === 0) {
              lastLoaded = e.loaded
              lastTime   = now
              updItem(item.id, { progress: pct })
              return
            }

            const dt = (now - lastTime) / 1000  // seconds since last sample
            if (dt >= 0.3) {
              const instant = (e.loaded - lastLoaded) / dt   // bytes/sec
              emaSpeed = emaSpeed === 0 ? instant : emaSpeed * 0.6 + instant * 0.4
              lastLoaded = e.loaded
              lastTime   = now
              const bytesLeft = e.total - e.loaded
              const eta = emaSpeed > 0 ? Math.ceil(bytesLeft / emaSpeed) : null
              updItem(item.id, { progress: pct, speed: Math.round(emaSpeed), eta })
            } else {
              updItem(item.id, { progress: pct })
            }
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              updItem(item.id, { progress: 100, status: 'done' })
              resolve()
            } else reject(new Error(`Upload failed (HTTP ${xhr.status})`))
          }
          xhr.onerror = () => reject(new Error('Network error'))
          xhr.onabort = () => reject(new Error('cancelled'))
          xhr.open('PUT', presignedUrl)
          xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream')
          xhr.send(item.file)
        })

        // Generate + upload thumbnail for images/videos (non-blocking)
        if (thumbnailPresignedUrl && fileId) {
          const mime = item.file.type || ''
          if (mime.startsWith('image/') || mime.startsWith('video/')) {
            import('../lib/mediaUpload').then(async ({ generateVideoThumbnail, generateImageThumbnail }) => {
              try {
                const base64 = mime.startsWith('video/')
                  ? await generateVideoThumbnail(item.file)
                  : await generateImageThumbnail(item.file)
                if (base64) {
                  const byteStr = atob(base64.split(',')[1])
                  const arr = new Uint8Array(byteStr.length)
                  for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
                  const blob = new Blob([arr], { type: 'image/jpeg' })
                  await fetch(thumbnailPresignedUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } })
                }
              } catch {}
            }).catch(() => {})
          }
        }
      }
    } catch (err) {
      if (err.message !== 'cancelled') updItem(item.id, { status: 'error', error: err.message })
    } finally {
      activeRef.current--
      delete xhrRefs.current[item.id]
      processQueue()
    }
  }

  function processQueue() {
    while (activeRef.current < 1 && queueRef.current.length > 0) {
      runUpload(queueRef.current.shift())
    }
    if (activeRef.current === 0 && queueRef.current.length === 0) {
      onDoneRef.current?.()
      // Auto-hide after 3s if all uploads done
      setUploads(prev => {
        const allDone = prev.every(u => u.status === 'done' || u.status === 'error' || u.status === 'cancelled')
        if (allDone && prev.length > 0) scheduleAutoHide()
        return prev
      })
    }
  }

  function enqueueItems(items) {
    setUploads(prev => [...prev, ...items])
    let starting = 0
    for (const item of items) {
      if (activeRef.current + starting < 1) {
        starting++
        setTimeout(() => runUpload(item), 0)
      } else {
        queueRef.current.push(item)
      }
    }
    setIsMinimized(false)
  }

  function makeItem(file, folderId) {
    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      folderId: folderId || null,
      progress: 0,
      status: 'pending',
      error: null,
    }
  }

  /** Add a single item with a fully custom async upload function.
   *  uploadFn: async (onProgress: (pct: number) => void) => void
   *  onItemComplete: called when this specific item finishes successfully
   */
  function addCustomUpload(name, size, uploadFn, onItemComplete) {
    clearTimeout(autoHideTimer.current)
    setIsMinimized(false)
    const item = {
      id: crypto.randomUUID(),
      name,
      size: size || 0,
      file: null,
      folderId: null,
      progress: 0,
      status: 'pending',
      error: null,
      uploadFn,
      onItemComplete,
    }
    enqueueItems([item])
  }

  /** Main entry — call from DrivePage with file list + current folder files */
  async function addFiles(files, folderId, existingFiles = [], onComplete) {
    onDoneRef.current = onComplete
    clearTimeout(autoHideTimer.current)

    const existingNames = new Set((existingFiles || []).map(f => f.name?.toLowerCase()))
    const dupes  = files.filter(f => existingNames.has(f.name?.toLowerCase()))
    const fresh  = files.filter(f => !existingNames.has(f.name?.toLowerCase()))

    if (fresh.length > 0) {
      const items = fresh.map(f => makeItem(f, folderId))

      // Show items in UI immediately as pending
      setUploads(prev => [...prev, ...items])
      setIsMinimized(false)

      // Batch-presign/initiate all files
      try {
        const smallFiles = fresh.filter(f => f.size <= MULTIPART_THRESHOLD)
        const largeFiles = fresh.filter(f => f.size >  MULTIPART_THRESHOLD)

        // Single presign call for all small files
        if (smallFiles.length > 0) {
          const { uploads: presigned } = await driveFilesApi.presign({
            files: smallFiles.map(f => ({ name: f.name, size: f.size, type: f.type || 'application/octet-stream' })),
            folderId: folderId || undefined,
          })
          presigned.forEach((p, i) => {
            const item = items[fresh.indexOf(smallFiles[i])]
            item.presignedUrl          = p.presignedUrl
            item.thumbnailPresignedUrl = p.thumbnailPresignedUrl
            item.fileId                = p.fileId
          })
        }

        // Initiate multipart for each large file (parallel)
        if (largeFiles.length > 0) {
          const mpResults = await Promise.all(largeFiles.map(f =>
            driveFilesApi.multipartInitiate({
              name: f.name, size: f.size,
              type: f.type || 'application/octet-stream',
              folderId: folderId || undefined,
            })
          ))
          mpResults.forEach((res, i) => {
            const item = items[fresh.indexOf(largeFiles[i])]
            item.initiateUrl           = res.initiateUrl
            item.wasabiKey             = res.wasabiKey
            item.fileId                = res.fileId
            item.thumbnailPresignedUrl = res.thumbnailPresignedUrl
          })
        }
      } catch (err) {
        const msg = err?.message || 'Upload init failed'
        items.forEach(item => updItem(item.id, { status: 'error', error: msg }))
        if (dupes.length > 0) setPendingDuplicates({ files: dupes, folderId, existingFiles })
        return
      }

      // Queue items — URLs already in hand, no presign delay per file
      let starting = 0
      for (const item of items) {
        if (activeRef.current + starting < 1) {
          starting++
          setTimeout(() => runUpload(item), 0)
        } else {
          queueRef.current.push(item)
        }
      }
    }

    if (dupes.length > 0) {
      setPendingDuplicates({ files: dupes, folderId, existingFiles })
    }
  }

  function resolveDuplicates(decisions) {
    // decisions: [{ file, action: 'replace'|'keepboth'|'skip', existingId? }]
    const { folderId } = pendingDuplicates
    setPendingDuplicates(null)

    const toUpload = []
    for (const { file, action, existingId } of decisions) {
      if (action === 'skip') continue
      if (action === 'replace') {
        // Delete existing DB record first
        if (existingId) driveFilesApi.delete(existingId).catch(() => {})
        toUpload.push(file)
      } else {
        // keepboth — rename with (1), (2) etc
        const dot = file.name.lastIndexOf('.')
        const base = dot > 0 ? file.name.slice(0, dot) : file.name
        const ext  = dot > 0 ? file.name.slice(dot) : ''
        const renamed = new File([file], `${base} (1)${ext}`, { type: file.type })
        toUpload.push(renamed)
      }
    }
    if (toUpload.length > 0) enqueueItems(toUpload.map(f => makeItem(f, folderId)))
  }

  function cancelUpload(id) {
    xhrRefs.current[id]?.abort()
    queueRef.current = queueRef.current.filter(i => {
      if (i.id === id && i.fileId && i.wasabiKey) {
        // If initiate was already called, clean up the DB record and any in-progress multipart
        driveFilesApi.multipartAbort({ uploadId: '', wasabiKey: i.wasabiKey, fileId: i.fileId }).catch(() => {})
      }
      return i.id !== id
    })
    updItem(id, { status: 'cancelled' })
  }

  function clearCompleted() {
    setUploads(prev => prev.filter(u => u.status === 'uploading' || u.status === 'pending'))
    clearTimeout(autoHideTimer.current)
  }

  function dismissAll() {
    setUploads([])
    clearTimeout(autoHideTimer.current)
  }

  const activeCount  = uploads.filter(u => u.status === 'uploading' || u.status === 'pending').length
  const doneCount    = uploads.filter(u => u.status === 'done').length
  const totalCount   = uploads.length
  const overallPct   = totalCount === 0 ? 0 : Math.round(
    uploads.reduce((s, u) => s + (u.status === 'done' ? 100 : u.status === 'cancelled' ? 0 : u.progress), 0) / totalCount
  )

  return (
    <UploadContext.Provider value={{
      uploads, isMinimized, pendingDuplicates,
      activeCount, doneCount, totalCount, overallPct,
      isVisible: uploads.length > 0 || !!pendingDuplicates,
      addFiles,
      addCustomUpload,
      cancelUpload,
      clearCompleted,
      dismissAll,
      resolveDuplicates,
      dismissDuplicates: () => setPendingDuplicates(null),
      toggleMinimize: () => setIsMinimized(m => !m),
      clearAutoHide: () => clearTimeout(autoHideTimer.current),
    }}>
      {children}
    </UploadContext.Provider>
  )
}

export const useUpload = () => useContext(UploadContext)
