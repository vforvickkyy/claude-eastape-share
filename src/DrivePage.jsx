import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CloudArrowUp, FolderSimplePlus, SquaresFour, Rows,
  House, CaretRight, CaretDown, Check, UploadSimple,
} from '@phosphor-icons/react'
import { useAuth } from './context/AuthContext'
import { useUpload } from './context/UploadContext'
import DashboardLayout from './DashboardLayout'
import DriveFileGrid from './components/drive/DriveFileGrid'
import DriveFileList from './components/drive/DriveFileList'
import NewFolderModal from './components/NewFolderModal'
import DuplicateModal from './components/drive/DuplicateModal'
import { driveFilesApi, driveFoldersApi } from './lib/api'
import { getFileCategory } from './components/drive/FileTypeIcon'

const SORT_OPTS = [
  { value: 'name-asc',  label: '↑ Name A→Z' },
  { value: 'name-desc', label: '↓ Name Z→A' },
  { divider: true },
  { value: 'size-desc', label: '↓ Size: Largest' },
  { value: 'size-asc',  label: '↑ Size: Smallest' },
  { divider: true },
  { value: 'date-desc', label: '↓ Date: Newest' },
  { value: 'date-asc',  label: '↑ Date: Oldest' },
]

const FILTER_OPTS = [
  { value: 'all',      label: 'All' },
  { value: 'video',    label: '🎬 Video' },
  { value: 'image',    label: '🖼 Image' },
  { value: 'audio',    label: '🎵 Audio' },
  { value: 'document', label: '📄 Document' },
  { value: 'other',    label: '📦 Other' },
]

function fmtBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export default function DrivePage() {
  const { user, loading: authLoading } = useAuth()
  const navigate    = useNavigate()
  const { id: folderId } = useParams()
  const { addFiles } = useUpload()
  const fileInputRef = useRef(null)
  const dragCounter  = useRef(0)

  const [files,          setFiles]         = useState([])
  const [folders,        setFolders]       = useState([])
  const [folderName,     setFolderName]    = useState('Root')
  const [loading,        setLoading]       = useState(true)
  const [view,           setView]          = useState(() => localStorage.getItem('drive-view') || 'grid')
  const [sort,           setSort]          = useState(() => localStorage.getItem(`drive-sort-${folderId || 'root'}`) || 'name-asc')
  const [filter,         setFilter]        = useState('all')
  const [search,         setSearch]        = useState('')
  const [showNewFolder,  setShowNewFolder] = useState(false)
  const [showSortMenu,   setShowSortMenu]  = useState(false)
  const [dragActive,     setDragActive]    = useState(false)
  const [storage,        setStorage]       = useState(null) // { used_bytes, limit_bytes }

  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true })
  }, [user, authLoading])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [filesRes, foldersRes] = await Promise.all([
        driveFilesApi.list(folderId ? { folderId } : {}),
        driveFoldersApi.list(folderId || null),
      ])
      setFiles(filesRes.files || [])
      setFolders(foldersRes.folders || [])
    } catch {}
    setLoading(false)
  }, [user, folderId])

  useEffect(() => { load() }, [load])

  // Load folder name for breadcrumb
  useEffect(() => {
    if (!folderId) { setFolderName('Root'); return }
    driveFoldersApi.list(null).then(d => {
      const f = (d.folders || []).find(x => x.id === folderId)
      setFolderName(f?.name || 'Folder')
    }).catch(() => {})
  }, [folderId])

  // Load storage usage
  useEffect(() => {
    if (!user) return
    driveFilesApi.getStorage().then(setStorage).catch(() => {})
  }, [user])

  // Save view preference
  useEffect(() => { localStorage.setItem('drive-view', view) }, [view])

  // Save sort preference per folder
  useEffect(() => {
    localStorage.setItem(`drive-sort-${folderId || 'root'}`, sort)
  }, [sort, folderId])

  // Paste to upload
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      const pasted = []
      for (const item of items) {
        if (item.kind === 'file') { const f = item.getAsFile(); if (f) pasted.push(f) }
      }
      if (pasted.length > 0) startUpload(pasted)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [files, folderId])

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return
    const fn = () => setShowSortMenu(false)
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showSortMenu])

  // Drag handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    dragCounter.current++
    setDragActive(true)
  }, [])
  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragActive(false) }
  }, [])
  const handleDragOver  = useCallback((e) => e.preventDefault(), [])
  const handleDrop      = useCallback((e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragActive(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length) startUpload(dropped)
  }, [files, folderId])

  function startUpload(filesToUpload) {
    addFiles(filesToUpload, folderId || null, files, () => {
      load()
      driveFilesApi.getStorage().then(setStorage).catch(() => {})
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // File actions
  async function handleTrash(id) {
    await driveFilesApi.update(id, { is_trashed: true }).catch(() => {})
    setFiles(f => f.filter(x => x.id !== id))
  }
  async function handleDelete(id) {
    if (!confirm('Permanently delete this file? This cannot be undone.')) return
    await driveFilesApi.delete(id).catch(() => {})
    setFiles(f => f.filter(x => x.id !== id))
  }
  async function handleRename(id, name) {
    await driveFilesApi.update(id, { name }).catch(() => {})
    setFiles(f => f.map(x => x.id === id ? { ...x, name } : x))
  }
  async function handleMove(id, newFolderId) {
    await driveFilesApi.update(id, { folder_id: newFolderId }).catch(() => {})
    setFiles(f => f.filter(x => x.id !== id))
  }
  async function handleFolderDelete(id) {
    if (!confirm('Delete this folder and trash its contents?')) return
    await driveFoldersApi.delete(id).catch(() => {})
    setFolders(f => f.filter(x => x.id !== id))
  }

  // Sort + filter
  const processed = useMemo(() => {
    let result = files.filter(f => {
      if (filter !== 'all' && getFileCategory(f.mime_type, f.name) !== filter) return false
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    result = [...result].sort((a, b) => {
      if (sort === 'name-asc')  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      if (sort === 'name-desc') return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
      if (sort === 'size-desc') return (b.file_size || 0) - (a.file_size || 0)
      if (sort === 'size-asc')  return (a.file_size || 0) - (b.file_size || 0)
      if (sort === 'date-desc') return new Date(b.created_at) - new Date(a.created_at)
      if (sort === 'date-asc')  return new Date(a.created_at) - new Date(b.created_at)
      return 0
    })
    return result
  }, [files, sort, filter, search])

  const sortLabel = SORT_OPTS.find(o => o.value === sort)?.label || 'Sort'

  // Storage bar
  const usedPct = storage ? Math.min(100, (storage.used_bytes / storage.limit_bytes) * 100) : 0
  const barColor = usedPct >= 90 ? '#ef4444' : usedPct >= 70 ? '#f59e0b' : '#7c3aed'
  const showUpgrade = storage && usedPct > 80

  const viewProps = {
    files: processed,
    folders,
    onFolderClick: f => navigate(`/drive/folder/${f.id}`),
    onTrash:  handleTrash,
    onDelete: handleDelete,
    onRename: handleRename,
    onMove:   handleMove,
    onFolderDelete: handleFolderDelete,
    sort, setSort,
  }

  return (
    <DashboardLayout title="Drive">
      <div
        style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >

        {/* ── SECTION A: Storage bar ── */}
        {storage && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '0 24px', height: 48, flexShrink: 0,
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>Storage</span>
            <span style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'nowrap' }}>
              {fmtBytes(storage.used_bytes)} of {fmtBytes(storage.limit_bytes)} used
            </span>
            <div style={{ flex: 1, maxWidth: 400, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                style={{ height: '100%', borderRadius: 3, background: barColor }}
                initial={{ width: 0 }}
                animate={{ width: `${usedPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            {showUpgrade && (
              <a href="/pricing" style={{ fontSize: 12, color: '#7c3aed', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Upgrade ↗
              </a>
            )}
          </div>
        )}

        {/* ── SECTION B: Breadcrumb + actions ── */}
        <div style={{ padding: '10px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          {/* Breadcrumb */}
          <div className="breadcrumb">
            <button className="breadcrumb-item" onClick={() => navigate('/drive')}>
              <House size={13} /> Root
            </button>
            {folderId && (
              <>
                <CaretRight size={11} className="breadcrumb-sep" />
                <span className="breadcrumb-item active">{folderName}</span>
              </>
            )}
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn-ghost" onClick={() => setShowNewFolder(true)}>
              <FolderSimplePlus size={14} /> New Folder
            </button>
            <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
              <CloudArrowUp size={14} /> Upload
            </button>
            <div className="view-toggle">
              <button className={`view-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} title="Grid view">
                <SquaresFour size={16} />
              </button>
              <button className={`view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} title="List view">
                <Rows size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── SECTION C: Sort + filter bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
        }}>
          {/* Left: sort + filter pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Sort dropdown */}
            <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
              <button
                className="btn-ghost"
                style={{ fontSize: 12, padding: '5px 10px', gap: 4 }}
                onClick={() => setShowSortMenu(m => !m)}
              >
                {sortLabel} <CaretDown size={11} />
              </button>
              <AnimatePresence>
                {showSortMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
                      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '4px 0', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    }}
                  >
                    {SORT_OPTS.map((o, i) =>
                      o.divider ? (
                        <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      ) : (
                        <button
                          key={o.value}
                          onClick={() => { setSort(o.value); setShowSortMenu(false) }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                            padding: '7px 12px', fontSize: 12,
                            color: sort === o.value ? 'var(--accent)' : 'var(--t2)',
                          }}
                        >
                          {o.label}
                          {sort === o.value && <Check size={12} />}
                        </button>
                      )
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 4 }}>
              {FILTER_OPTS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(f => f === opt.value ? 'all' : opt.value)}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 99,
                    border: '1px solid',
                    borderColor: filter === opt.value ? 'var(--accent)' : 'var(--border)',
                    background: filter === opt.value ? 'rgba(124,58,237,0.15)' : 'transparent',
                    color: filter === opt.value ? 'var(--accent)' : 'var(--t2)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: search */}
          <input
            className="input-field"
            style={{ width: 200, fontSize: 12, padding: '5px 10px' }}
            placeholder="Search files…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ── SECTION D: Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : processed.length === 0 && folders.length === 0 ? (
            <div className="empty-state">
              <CloudArrowUp size={40} weight="thin" />
              <p>{search || filter !== 'all' ? 'No matching files' : 'No files here yet'}</p>
              {!search && filter === 'all' && (
                <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
                  Upload files
                </button>
              )}
            </div>
          ) : view === 'grid' ? (
            <DriveFileGrid {...viewProps} />
          ) : (
            <DriveFileList {...viewProps} />
          )}
        </div>

        {/* ── SECTION E: Drag overlay ── */}
        <AnimatePresence>
          {dragActive && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                style={{
                  width: '60%', height: '60%', maxWidth: 600, maxHeight: 400,
                  border: '4px dashed #7c3aed', borderRadius: 16,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12,
                }}
              >
                <UploadSimple size={64} weight="duotone" color="#7c3aed" />
                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>Drop files to upload</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                  Uploading to: {folderId ? folderName : 'Root'}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modals */}
        {showNewFolder && (
          <NewFolderModal
            parentId={folderId || null}
            onCreated={folder => { setFolders(f => [folder, ...f]); setShowNewFolder(false) }}
            onClose={() => setShowNewFolder(false)}
          />
        )}
        <DuplicateModal />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={e => {
          const picked = Array.from(e.target.files || [])
          if (picked.length) startUpload(picked)
          e.target.value = ''
        }}
      />
    </DashboardLayout>
  )
}
