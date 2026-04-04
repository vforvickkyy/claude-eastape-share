import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import { driveFilesApi } from '../lib/api'

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
        updItem(item.id, { progress: 100, status: 'done' })
        item.onItemComplete?.()
      } else {
        const { uploads: presigned } = await driveFilesApi.presign({
          files: [{ name: item.name, size: item.size, type: item.file.type || 'application/octet-stream' }],
          folderId: item.folderId || undefined,
        })
        const { presignedUrl, thumbnailPresignedUrl, fileId } = presigned[0]

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrRefs.current[item.id] = xhr
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) updItem(item.id, { progress: Math.round(e.loaded / e.total * 100) })
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
    while (activeRef.current < 3 && queueRef.current.length > 0) {
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
    for (const item of items) {
      if (activeRef.current < 3) {
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
  function addFiles(files, folderId, existingFiles = [], onComplete) {
    onDoneRef.current = onComplete
    clearTimeout(autoHideTimer.current)

    const existingNames = new Set((existingFiles || []).map(f => f.name?.toLowerCase()))
    const dupes  = files.filter(f => existingNames.has(f.name?.toLowerCase()))
    const fresh  = files.filter(f => !existingNames.has(f.name?.toLowerCase()))

    if (fresh.length > 0) enqueueItems(fresh.map(f => makeItem(f, folderId)))

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
    queueRef.current = queueRef.current.filter(i => i.id !== id)
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
