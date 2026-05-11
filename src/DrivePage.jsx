/**
 * DrivePage — Google Drive-style file manager.
 * Views: myDrive | recent | trash
 * Features: sidebar folder tree, grid/list, sort/filter, context menu,
 *           inline rename, bulk select, file preview, move modal, keyboard shortcuts.
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  FolderSimple, SquaresFour, Rows, House, CaretRight, CaretDown,
  MagnifyingGlass, Plus, UploadSimple, FolderSimplePlus, DotsThree,
  DownloadSimple, PencilSimple, Trash, ArrowClockwise, ArrowSquareOut,
  Check, X, CloudArrowUp, Clock, Funnel, Link, SortAscending,
  Warning, ShareNetwork, CopySimple, List,
} from '@phosphor-icons/react'
import { useAuth } from './context/AuthContext'
import { useUpload } from './context/UploadContext'
import DashboardLayout from './DashboardLayout'
import ContextMenu from './components/drive/ContextMenu'
import FilePreview from './components/drive/FilePreview'
import MoveFolderModal from './components/drive/MoveFolderModal'
import ShareModal from './components/drive/ShareModal'
import FileTypeIcon, { getFileCategory } from './components/drive/FileTypeIcon'
import DuplicateModal from './components/drive/DuplicateModal'
import { driveFilesApi, driveFoldersApi, shareLinksApi } from './lib/api'
import { showToast } from './components/ui/Toast'

// ── Utilities ─────────────────────────────────────────────────────────────────

const isTouch = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: none) and (pointer: coarse)').matches

function useLongPress(callback, ms = 500) {
  const timer = useRef(null)
  const fired = useRef(false)
  const start = useCallback((e, ...args) => {
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      callback(e, ...args)
    }, ms)
  }, [callback, ms])
  const cancel = useCallback(() => clearTimeout(timer.current), [])
  const wasFired = useCallback(() => fired.current, [])
  return { start, cancel, wasFired }
}

function fmtBytes(b) {
  if (!b) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}
function fmtSpeed(bps) {
  if (!bps || bps <= 0) return null
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}
function fmtEta(sec) {
  if (!sec || sec <= 0) return null
  if (sec < 60) return `${sec}s left`
  const m = Math.floor(sec / 60), s = sec % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s left` : `${m}m left`
  return `${Math.floor(m / 60)}h ${m % 60}m left`
}
function fmtRel(iso) {
  if (!iso) return '—'
  const d = (Date.now() - new Date(iso)) / 1000
  if (d < 60)      return 'just now'
  if (d < 3600)    return `${Math.round(d / 60)}m ago`
  if (d < 86400)   return `${Math.round(d / 3600)}h ago`
  if (d < 604800)  return `${Math.round(d / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function buildTree(folders, parentId = null) {
  return (folders || [])
    .filter(f => (f.parent_id || null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => ({ ...f, children: buildTree(folders, f.id) }))
}
function getFolderPath(allFolders, folderId) {
  const path = []
  let cur = folderId
  const map = Object.fromEntries((allFolders || []).map(f => [f.id, f]))
  let safety = 0
  while (cur && map[cur] && safety++ < 20) {
    path.unshift({ id: cur, name: map[cur].name })
    cur = map[cur].parent_id
  }
  return path
}

const SORT_OPTS = [
  { value: 'name-asc',  label: 'Name A→Z' },
  { value: 'name-desc', label: 'Name Z→A' },
  null,
  { value: 'size-desc', label: 'Size: Largest' },
  { value: 'size-asc',  label: 'Size: Smallest' },
  null,
  { value: 'date-desc', label: 'Date: Newest' },
  { value: 'date-asc',  label: 'Date: Oldest' },
]
const FILTER_OPTS = [
  { value: 'all',      label: 'All' },
  { value: 'video',    label: '🎬 Video' },
  { value: 'image',    label: '🖼 Image' },
  { value: 'audio',    label: '🎵 Audio' },
  { value: 'document', label: '📄 Document' },
  { value: 'other',    label: '📦 Other' },
]

// ── Skeleton loading cards ─────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{ height: 200, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <div className="drive-skeleton" style={{ height: 140 }} />
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="drive-skeleton" style={{ height: 12, borderRadius: 4, width: '80%' }} />
            <div className="drive-skeleton" style={{ height: 10, borderRadius: 4, width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
function SkeletonList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px' }}>
          <div className="drive-skeleton" style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }} />
          <div className="drive-skeleton" style={{ height: 13, flex: 1, borderRadius: 4 }} />
          <div className="drive-skeleton" style={{ width: 80, height: 12, borderRadius: 4 }} />
          <div className="drive-skeleton" style={{ width: 60, height: 12, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

// ── Sidebar folder tree (recursive) ──────────────────────────────────────────
function FolderTreeItem({ node, depth, currentFolderId, expandedSet, onToggle, onNavigate, onRename, onTrash, onNewSubfolder }) {
  const [showCtx, setShowCtx] = useState(false)
  const [ctxPos,  setCtxPos]  = useState({ x: 0, y: 0 })
  const isActive   = currentFolderId === node.id
  const isExpanded = expandedSet.has(node.id)

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          paddingLeft: 8 + depth * 14, paddingRight: 4,
          height: 30, borderRadius: 7, cursor: 'pointer',
          background: isActive ? 'var(--accent-tint)' : 'transparent',
          color: isActive ? 'var(--text)' : 'var(--text-3)',
          position: 'relative',
        }}
        onClick={() => onNavigate(node)}
        onContextMenu={e => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); setShowCtx(true) }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: node.children?.length ? 1 : 0.2 }}
          onClick={e => { e.stopPropagation(); onToggle(node.id) }}
        >
          <CaretRight size={11} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'rgba(255,255,255,0.5)' }} />
        </button>
        <FolderSimple size={15} weight="duotone" color={isActive ? '#fbbf24' : '#d97706'} style={{ marginRight: 6, flexShrink: 0 }} />
        <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{node.name}</span>
        <button
          className="sidebar-dots-btn"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', borderRadius: 4, color: 'rgba(255,255,255,0.4)', flexShrink: 0, display: 'flex' }}
          onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setCtxPos({ x: r.left, y: r.bottom + 4 }); setShowCtx(true) }}
        >
          <DotsThree size={15} weight="bold" />
        </button>
      </div>

      {isExpanded && node.children?.map(child => (
        <FolderTreeItem key={child.id} node={child} depth={depth + 1} currentFolderId={currentFolderId} expandedSet={expandedSet} onToggle={onToggle} onNavigate={onNavigate} onRename={onRename} onTrash={onTrash} onNewSubfolder={onNewSubfolder} />
      ))}

      {showCtx && (
        <ContextMenu x={ctxPos.x} y={ctxPos.y} onClose={() => setShowCtx(false)} items={[
          { icon: <PencilSimple size={14} />, label: 'Rename',          onClick: () => { setShowCtx(false); onRename(node) } },
          { icon: <FolderSimplePlus size={14} />, label: 'New subfolder', onClick: () => { setShowCtx(false); onNewSubfolder(node.id) } },
          { divider: true },
          { icon: <Trash size={14} />, label: 'Move to Trash', danger: true, onClick: () => { setShowCtx(false); onTrash(node) } },
        ]} />
      )}
    </>
  )
}

// ── Main DrivePage ─────────────────────────────────────────────────────────────
export default function DrivePage() {
  const { user, loading: authLoading } = useAuth()
  const navigate     = useNavigate()
  const { id: urlFolderId } = useParams()
  const [searchParams] = useSearchParams()
  const { addFiles, uploads, pendingDuplicates, resolveDuplicates, dismissDuplicates } = useUpload()
  const fileInputRef   = useRef(null)
  const folderInputRef = useRef(null)
  const dragCounter    = useRef(0)

  // ── View state ──────────────────────────────────────────────────────────────
  const viewParam = searchParams.get('view') // 'recent' | 'trash' | null
  const currentView = viewParam === 'recent' ? 'recent' : viewParam === 'trash' ? 'trash' : 'myDrive'
  const currentFolderId = currentView === 'myDrive' ? (urlFolderId || null) : null

  // ── UI state ────────────────────────────────────────────────────────────────
  const [viewMode,  setViewMode]  = useState(() => localStorage.getItem('drive-view-mode') || 'grid')
  const [sortBy,    setSortBy]    = useState(() => localStorage.getItem('drive-sort-by')   || 'name')
  const [sortDir,   setSortDir]   = useState(() => localStorage.getItem('drive-sort-dir')  || 'asc')
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showNewMenu,  setShowNewMenu]  = useState(false)
  const [isPageDrag,   setIsPageDrag]  = useState(false)
  const sortMenuRef = useRef(null)
  const newMenuRef  = useRef(null)

  // ── Data ────────────────────────────────────────────────────────────────────
  const [files,      setFiles]      = useState([])
  const [folders,    setFolders]    = useState([])
  const [allFolders, setAllFolders] = useState([])
  const [isLoading,  setIsLoading]  = useState(true)
  const [loadError,  setLoadError]  = useState(null)
  const [storage,    setStorage]    = useState(null) // { used_bytes, limit_bytes, used_gb, limit_gb }

  // ── Selection ────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set()) // Set<string> — 'file-id' or 'folder-id'

  // ── Rename ──────────────────────────────────────────────────────────────────
  const [renamingId,   setRenamingId]   = useState(null)
  const [renamingType, setRenamingType] = useState(null)
  const [renameVal,    setRenameVal]    = useState('')
  const renameInputRef = useRef(null)

  // ── New folder ──────────────────────────────────────────────────────────────
  const [showNewFolderIn, setShowNewFolderIn] = useState(undefined) // undefined=hidden, null=root, id=subfolder
  const [newFolderName,   setNewFolderName]   = useState('')
  const newFolderInputRef = useRef(null)

  // ── Context menu ────────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, item, itemType }

  // ── Preview ─────────────────────────────────────────────────────────────────
  const [previewFiles, setPreviewFiles]   = useState(null)
  const [previewIndex, setPreviewIndex]   = useState(0)

  // ── Move modal ───────────────────────────────────────────────────────────────
  const [moveItems, setMoveItems] = useState(null) // items to move

  // ── Share modal ──────────────────────────────────────────────────────────────
  const [shareTarget, setShareTarget] = useState(null) // { id, name, type: 'file'|'folder' }

  // ── Drag-to-move ─────────────────────────────────────────────────────────────
  const [draggingItem, setDraggingItem]   = useState(null) // { id, type, name }
  const [dragOverFolder, setDragOverFolder] = useState(null) // folder id being dragged over

  // ── Mobile sidebar open ───────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Sidebar expanded folders ─────────────────────────────────────────────────
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('drive-sidebar-expanded') || '[]')) }
    catch { return new Set() }
  })

  // ── Persist prefs ────────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('drive-view-mode', viewMode) }, [viewMode])
  useEffect(() => { localStorage.setItem('drive-sort-by',   sortBy)   }, [sortBy])
  useEffect(() => { localStorage.setItem('drive-sort-dir',  sortDir)  }, [sortDir])
  useEffect(() => {
    localStorage.setItem('drive-sidebar-expanded', JSON.stringify([...sidebarExpanded]))
  }, [sidebarExpanded])

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true })
  }, [user, authLoading])

  // ── Load folder tree (always) ─────────────────────────────────────────────
  const loadFolderTree = useCallback(() => {
    if (!user) return
    driveFilesApi.getFolderTree()
      .then(d => setAllFolders(d.folders || []))
      .catch(() => {})
  }, [user])

  // ── Load storage ─────────────────────────────────────────────────────────────
  const loadStorage = useCallback(() => {
    if (!user) return
    driveFilesApi.getStorageUsage()
      .then(setStorage)
      .catch(() => {})
  }, [user])

  // ── Load current view ────────────────────────────────────────────────────────
  const loadContent = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    setLoadError(null)
    try {
      if (currentView === 'recent') {
        const d = await driveFilesApi.getRecent()
        setFiles(d.files || [])
        setFolders([])
      } else if (currentView === 'trash') {
        const d = await driveFilesApi.getTrash()
        setFiles(d.files || [])
        setFolders([])
      } else {
        const [filesRes, foldersRes] = await Promise.all([
          driveFilesApi.list(currentFolderId ? { folderId: currentFolderId } : {}),
          driveFoldersApi.list(currentFolderId || null),
        ])
        setFiles(filesRes.files || [])
        setFolders(foldersRes.folders || [])
      }
    } catch (err) {
      setLoadError(err.message || 'Failed to load files')
    } finally {
      // Minimum 300ms to avoid skeleton flash
      setTimeout(() => setIsLoading(false), 300)
    }
  }, [user, currentView, currentFolderId])

  useEffect(() => { loadFolderTree(); loadStorage() }, [loadFolderTree, loadStorage])
  useEffect(() => { loadContent(); setSelected(new Set()); setFilter('all'); setSearch('') }, [loadContent])

  // Focus rename input
  useEffect(() => { if (renamingId && renameInputRef.current) renameInputRef.current.focus() }, [renamingId])
  // Focus new folder input
  useEffect(() => { if (showNewFolderIn !== undefined && newFolderInputRef.current) newFolderInputRef.current.focus() }, [showNewFolderIn])

  // Close menus on outside click
  useEffect(() => {
    function fn(e) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false)
      if (newMenuRef.current  && !newMenuRef.current.contains(e.target))  setShowNewMenu(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── Computed / sorted / filtered ─────────────────────────────────────────────
  const processedFiles = useMemo(() => {
    let res = [...files]
    if (search) {
      const q = search.toLowerCase()
      res = res.filter(f => f.name.toLowerCase().includes(q))
    } else if (filter !== 'all') {
      res = res.filter(f => getFileCategory(f.mime_type, f.name) === filter)
    }
    res.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      else if (sortBy === 'size') cmp = (a.file_size || 0) - (b.file_size || 0)
      else if (sortBy === 'date') cmp = new Date(a.created_at) - new Date(b.created_at)
      else if (sortBy === 'type') cmp = (a.mime_type || '').localeCompare(b.mime_type || '')
      return sortDir === 'desc' ? -cmp : cmp
    })
    return res
  }, [files, search, filter, sortBy, sortDir])

  const processedFolders = useMemo(() => {
    if (search) {
      const q = search.toLowerCase()
      return folders.filter(f => f.name.toLowerCase().includes(q))
    }
    return [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [folders, search])

  const breadcrumb = useMemo(() => {
    if (!currentFolderId) return [{ id: null, name: 'My Drive' }]
    return [{ id: null, name: 'My Drive' }, ...getFolderPath(allFolders, currentFolderId)]
  }, [currentFolderId, allFolders])

  const previewableFiles = useMemo(() => processedFiles, [processedFiles])

  // Files currently uploading to the visible folder (shown as placeholder cards)
  const uploadingItems = useMemo(() =>
    uploads.filter(u =>
      (u.status === 'uploading' || u.status === 'pending') &&
      (currentView === 'myDrive') &&
      (u.folderId === currentFolderId || (u.folderId == null && !currentFolderId))
    ), [uploads, currentFolderId, currentView])

  // ── File upload ─────────────────────────────────────────────────────────────
  function startUpload(fileList) {
    const arr = Array.from(fileList)
    addFiles(arr, currentFolderId || null, files, () => {
      loadContent(); loadStorage()
    })
  }

  // ── Paste ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentView !== 'myDrive') return
    function onPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      const pasted = []
      for (const item of items) {
        if (item.kind === 'file') { const f = item.getAsFile(); if (f) pasted.push(f) }
      }
      if (pasted.length) {
        showToast(`Uploading ${pasted.length} file(s) from clipboard`, 'info')
        startUpload(pasted)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [currentView, currentFolderId, files])

  // ── Drag overlay ─────────────────────────────────────────────────────────────
  function onDragEnter(e) { e.preventDefault(); dragCounter.current++; if (dragCounter.current === 1) setIsPageDrag(true) }
  function onDragLeave(e) { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setIsPageDrag(false) } }
  function onDragOver(e)  { e.preventDefault() }
  function onDrop(e)      { e.preventDefault(); dragCounter.current = 0; setIsPageDrag(false); const dropped = Array.from(e.dataTransfer.files); if (dropped.length) startUpload(dropped) }

  // ── Rename ──────────────────────────────────────────────────────────────────
  function startRename(item, type) {
    setRenamingId(item.id); setRenamingType(type); setRenameVal(item.name)
  }
  async function saveRename() {
    const name = renameVal.trim()
    if (!name) { cancelRename(); return }
    const prev = renamingType === 'file'
      ? files.find(f => f.id === renamingId)
      : folders.find(f => f.id === renamingId)
    if (!prev || name === prev.name) { cancelRename(); return }

    if (renamingType === 'file') {
      setFiles(fs => fs.map(f => f.id === renamingId ? { ...f, name } : f))
      cancelRename()
      try {
        await driveFilesApi.rename(renamingId, name)
        showToast(`Renamed to "${name}"`, 'success')
      } catch (err) {
        setFiles(fs => fs.map(f => f.id === renamingId ? { ...f, name: prev.name } : f))
        showToast(err.message || 'Rename failed', 'error')
      }
    } else {
      setFolders(fs => fs.map(f => f.id === renamingId ? { ...f, name } : f))
      setAllFolders(fs => fs.map(f => f.id === renamingId ? { ...f, name } : f))
      cancelRename()
      try {
        await driveFilesApi.renameFolder(renamingId, name)
        showToast(`Renamed to "${name}"`, 'success')
      } catch (err) {
        setFolders(fs => fs.map(f => f.id === renamingId ? { ...f, name: prev.name } : f))
        setAllFolders(fs => fs.map(f => f.id === renamingId ? { ...f, name: prev.name } : f))
        showToast(err.message || 'Rename failed', 'error')
      }
    }
  }
  function cancelRename() { setRenamingId(null); setRenamingType(null); setRenameVal('') }

  // ── New folder ──────────────────────────────────────────────────────────────
  async function createFolder(name, parentId) {
    if (!name.trim()) { setShowNewFolderIn(undefined); return }
    try {
      const d = await driveFilesApi.createFolder(name.trim(), parentId)
      const folder = d.folder
      if (parentId === currentFolderId || (parentId === null && !currentFolderId)) {
        setFolders(fs => [folder, ...fs])
      }
      setAllFolders(fs => [...fs, folder])
      showToast(`Folder "${name}" created`, 'success')
    } catch (err) {
      showToast(err.message || 'Failed to create folder', 'error')
    }
    setShowNewFolderIn(undefined); setNewFolderName('')
  }

  // ── Trash ────────────────────────────────────────────────────────────────────
  async function trashFile(file) {
    setFiles(fs => fs.filter(f => f.id !== file.id))
    showToast(`"${file.name}" moved to Trash`, 'info', {
      duration: 5000,
      action: { label: 'Undo', onClick: () => restoreFile(file) },
    })
    try {
      await driveFilesApi.trashFile(file.id)
    } catch {
      setFiles(fs => [file, ...fs])
    }
  }
  async function restoreFile(file) {
    try {
      await driveFilesApi.restore(file.id)
      if (currentView === 'trash') setFiles(fs => fs.filter(f => f.id !== file.id))
      else { setFiles(fs => [file, ...fs]) }
      showToast(`"${file.name}" restored`, 'success')
    } catch (err) {
      showToast(err.message || 'Restore failed', 'error')
    }
  }
  async function permanentDeleteFile(file) {
    if (!confirm(`Permanently delete "${file.name}"? This cannot be undone.`)) return
    setFiles(fs => fs.filter(f => f.id !== file.id))
    try {
      await driveFilesApi.permanentDelete(file.id)
      showToast(`"${file.name}" permanently deleted`, 'info')
    } catch (err) {
      setFiles(fs => [file, ...fs])
      showToast(err.message || 'Delete failed', 'error')
    }
  }
  async function trashFolder(folder) {
    if (!confirm(`Move folder "${folder.name}" and all its contents to Trash?`)) return
    setFolders(fs => fs.filter(f => f.id !== folder.id))
    setAllFolders(fs => fs.filter(f => f.id !== folder.id))
    try {
      await driveFilesApi.trashFolder(folder.id)
      showToast(`Folder "${folder.name}" moved to Trash`, 'info')
    } catch (err) {
      showToast(err.message || 'Failed to trash folder', 'error')
      loadContent()
    }
  }
  async function emptyTrash() {
    if (!confirm(`Permanently delete all ${files.length} items in Trash? This cannot be undone.`)) return
    try {
      const d = await driveFilesApi.emptyTrash()
      setFiles([])
      loadStorage()
      showToast(`Trash emptied (${d.count || 0} items deleted)`, 'success')
    } catch (err) {
      showToast(err.message || 'Failed to empty trash', 'error')
    }
  }

  // ── Bulk ─────────────────────────────────────────────────────────────────────
  async function bulkTrash() {
    const fileIds   = [...selected].filter(s => s.startsWith('file-')).map(s => s.slice(5))
    const folderIds = [...selected].filter(s => s.startsWith('folder-')).map(s => s.slice(7))
    setFiles(fs => fs.filter(f => !fileIds.includes(f.id)))
    setFolders(fs => fs.filter(f => !folderIds.includes(f.id)))
    setSelected(new Set())
    try {
      await Promise.all([
        ...fileIds.map(id => driveFilesApi.update(id, { is_trashed: true })),
        ...folderIds.map(id => driveFilesApi.trashFolder(id)),
      ])
      const total = fileIds.length + folderIds.length
      showToast(`${total} item${total !== 1 ? 's' : ''} moved to Trash`, 'info')
    } catch {
      showToast('Some items could not be trashed', 'error')
      loadContent()
    }
  }

  // ── Move ─────────────────────────────────────────────────────────────────────
  async function doMove(targetFolderId) {
    if (!moveItems) return
    const fileItems   = moveItems.filter(i => i.type === 'file')
    const folderItems = moveItems.filter(i => i.type === 'folder')
    setMoveItems(null)
    const destName = targetFolderId ? (allFolders.find(f => f.id === targetFolderId)?.name || 'folder') : 'My Drive'
    try {
      const promises = [
        ...fileItems.map(i => driveFilesApi.move(i.id, targetFolderId)),
        ...folderItems.map(i => driveFilesApi.moveFolder(i.id, targetFolderId)),
      ]
      await Promise.all(promises)
      setFiles(fs => fs.filter(f => !fileItems.map(i => i.id).includes(f.id)))
      setFolders(fs => fs.filter(f => !folderItems.map(i => i.id).includes(f.id)))
      setSelected(new Set())
      showToast(`Moved to "${destName}"`, 'success')
      loadFolderTree()
    } catch (err) {
      showToast(err.message || 'Move failed', 'error')
      loadContent()
    }
  }

  // ── Drag-to-move ─────────────────────────────────────────────────────────────
  async function handleDragDrop(draggedId, draggedType, targetFolderId) {
    if (!draggedId || draggedId === targetFolderId) return
    try {
      if (draggedType === 'folder') {
        await driveFilesApi.moveFolder(draggedId, targetFolderId)
        setFolders(fs => fs.filter(f => f.id !== draggedId))
      } else {
        await driveFilesApi.move(draggedId, targetFolderId)
        setFiles(fs => fs.filter(f => f.id !== draggedId))
      }
      const destName = targetFolderId ? (allFolders.find(f => f.id === targetFolderId)?.name || 'folder') : 'My Drive'
      showToast(`Moved to "${destName}"`, 'success')
      loadFolderTree()
    } catch (err) {
      showToast(err.message || 'Move failed', 'error')
    }
    setDraggingItem(null)
    setDragOverFolder(null)
  }

  // ── Folder upload with structure ──────────────────────────────────────────────
  async function handleFolderUpload(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return
    const rootName = files[0].webkitRelativePath.split('/')[0]
    showToast(`Creating folder structure for "${rootName}"…`, 'info')
    try {
      const folderMap = new Map()
      // Create root folder
      const rootRes = await driveFilesApi.createFolder(rootName, currentFolderId)
      folderMap.set(rootName, rootRes.folder.id)
      // Create intermediate folders
      for (const file of files) {
        const parts = file.webkitRelativePath.split('/')
        for (let i = 1; i < parts.length - 1; i++) {
          const pathKey = parts.slice(0, i + 1).join('/')
          if (!folderMap.has(pathKey)) {
            const parentPath = parts.slice(0, i).join('/')
            const parentId = folderMap.get(parentPath) || rootRes.folder.id
            const res = await driveFilesApi.createFolder(parts[i], parentId)
            folderMap.set(pathKey, res.folder.id)
          }
        }
      }
      // Upload files to correct folders
      const filesToUpload = files.map(file => {
        const parts = file.webkitRelativePath.split('/')
        const folderPath = parts.slice(0, -1).join('/')
        const targetFolderId = folderMap.get(folderPath) || rootRes.folder.id
        return { file, folderId: targetFolderId }
      })
      // Use UploadContext to upload each file
      for (const { file, folderId } of filesToUpload) {
        addFiles([file], folderId, [], () => {})
      }
      loadFolderTree()
      showToast(`Uploading "${rootName}" folder (${files.length} files)`, 'success')
    } catch (err) {
      showToast(err.message || 'Folder upload failed', 'error')
    }
  }

  // ── Copy share link ──────────────────────────────────────────────────────────
  async function copyLink(file) {
    try {
      const data = await shareLinksApi.getOrCreateForDriveFile(file.id, { file_name: file.name })
      const url = `${window.location.origin}/share/${data.link.short_token || data.link.token}`
      await navigator.clipboard.writeText(url)
      showToast('Link copied to clipboard', 'success')
    } catch {
      showToast('Failed to copy link', 'error')
    }
  }
  async function copyFolderLink(folder) {
    try {
      const data = await shareLinksApi.getOrCreateForDriveFolder(folder.id, { file_name: folder.name })
      const url = `${window.location.origin}/share/${data.link.short_token || data.link.token}`
      await navigator.clipboard.writeText(url)
      showToast('Folder link copied to clipboard', 'success')
    } catch {
      showToast('Failed to copy folder link', 'error')
    }
  }

  // ── Download ─────────────────────────────────────────────────────────────────
  async function downloadFile(file) {
    try {
      const { url } = await driveFilesApi.getDownloadUrl(file.id)
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click()
    } catch { showToast('Download failed', 'error') }
  }

  // ── Selection helpers ────────────────────────────────────────────────────────
  function toggleSelect(key) {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }
  function selectAll() {
    setSelected(new Set([
      ...folders.map(f => `folder-${f.id}`),
      ...processedFiles.map(f => `file-${f.id}`),
    ]))
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); selectAll(); return }
      if (e.key === 'Escape') {
        if (ctxMenu)      { setCtxMenu(null); return }
        if (previewFiles) { setPreviewFiles(null); return }
        if (renamingId)   { cancelRename(); return }
        setSelected(new Set())
        return
      }
      if (e.key === 'Delete' && selected.size > 0 && currentView !== 'trash') { bulkTrash(); return }
      if (e.key === 'F2' && selected.size === 1) {
        const key = [...selected][0]
        const [type, id] = [key.startsWith('folder-') ? 'folder' : 'file', key.replace(/^(folder|file)-/, '')]
        const item = type === 'folder' ? folders.find(f => f.id === id) : files.find(f => f.id === id)
        if (item) startRename(item, type)
        return
      }
      if (e.key === ' ' && selected.size === 1) {
        e.preventDefault()
        const key = [...selected][0]
        if (key.startsWith('file-')) {
          const id = key.slice(5)
          const idx = previewableFiles.findIndex(f => f.id === id)
          if (idx >= 0) { setPreviewFiles(previewableFiles); setPreviewIndex(idx) }
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, files, folders, ctxMenu, previewFiles, renamingId, currentView, processedFiles])

  // ── Context menu builders ────────────────────────────────────────────────────
  function fileCtxItems(file) {
    if (currentView === 'trash') return [
      { icon: <ArrowClockwise size={14} />, label: 'Restore',            onClick: () => { setCtxMenu(null); restoreFile(file) } },
      { divider: true },
      { icon: <Trash size={14} />, label: 'Delete permanently', danger: true, onClick: () => { setCtxMenu(null); permanentDeleteFile(file) } },
    ]
    return [
      { icon: <ArrowSquareOut size={14} />, label: 'Preview',    hint: 'Space',  onClick: () => { setCtxMenu(null); const idx = previewableFiles.findIndex(f => f.id === file.id); setPreviewFiles(previewableFiles); setPreviewIndex(idx < 0 ? 0 : idx) } },
      { icon: <DownloadSimple size={14} />, label: 'Download',   onClick: () => { setCtxMenu(null); downloadFile(file) } },
      { divider: true },
      { icon: <PencilSimple size={14} />,  label: 'Rename',      hint: 'F2',  onClick: () => { setCtxMenu(null); startRename(file, 'file') } },
      { icon: <FolderSimple size={14} />,  label: 'Move to',                  onClick: () => { setCtxMenu(null); setMoveItems([{ ...file, type: 'file' }]) } },
      { divider: true },
      { icon: <ShareNetwork size={14} />,  label: 'Share file',              onClick: () => { setCtxMenu(null); setShareTarget({ id: file.id, name: file.name, type: 'file' }) } },
      { icon: <CopySimple size={14} />,    label: 'Copy link',               onClick: () => { setCtxMenu(null); copyLink(file) } },
      { divider: true },
      { icon: <Trash size={14} />,         label: 'Move to Trash', hint: 'Del', danger: true, onClick: () => { setCtxMenu(null); trashFile(file) } },
    ]
  }
  function folderCtxItems(folder) {
    return [
      { icon: <PencilSimple size={14} />,     label: 'Rename',         hint: 'F2', onClick: () => { setCtxMenu(null); startRename(folder, 'folder') } },
      { icon: <FolderSimple size={14} />,     label: 'Move to',                    onClick: () => { setCtxMenu(null); setMoveItems([{ ...folder, type: 'folder' }]) } },
      { icon: <FolderSimplePlus size={14} />, label: 'New subfolder',              onClick: () => { setCtxMenu(null); setShowNewFolderIn(folder.id) } },
      { divider: true },
      { icon: <ShareNetwork size={14} />,     label: 'Share folder',               onClick: () => { setCtxMenu(null); setShareTarget({ id: folder.id, name: folder.name, type: 'folder' }) } },
      { icon: <CopySimple size={14} />,       label: 'Copy folder link',           onClick: () => { setCtxMenu(null); copyFolderLink(folder) } },
      { divider: true },
      { icon: <Trash size={14} />,            label: 'Move to Trash', danger: true, onClick: () => { setCtxMenu(null); trashFolder(folder) } },
    ]
  }
  // Area context menu (right-click on empty drive space)
  function areaCtxItems() {
    const items = []
    if (currentView === 'myDrive') {
      items.push(
        { icon: <FolderSimplePlus size={14} />, label: 'New Folder',    onClick: () => { setCtxMenu(null); setShowNewFolderIn(currentFolderId) } },
        { icon: <UploadSimple size={14} />,     label: 'Upload Files',  onClick: () => { setCtxMenu(null); fileInputRef.current?.click() } },
        { icon: <FolderSimple size={14} />,     label: 'Upload Folder', onClick: () => { setCtxMenu(null); folderInputRef.current?.click() } },
      )
      if (currentFolderId) {
        items.push(
          { divider: true },
          { icon: <ShareNetwork size={14} />, label: 'Share this folder', onClick: () => { setCtxMenu(null); const f = allFolders.find(x => x.id === currentFolderId); if (f) setShareTarget({ id: f.id, name: f.name, type: 'folder' }) } },
          { icon: <CopySimple size={14} />,   label: 'Copy folder link',  onClick: () => { setCtxMenu(null); const f = allFolders.find(x => x.id === currentFolderId); if (f) copyFolderLink(f) } },
        )
      }
    }
    return items
  }

  // ── Computed sort label ───────────────────────────────────────────────────────
  const sortLabel = useMemo(() => {
    const opt = SORT_OPTS.find(o => o && o.value === `${sortBy}-${sortDir}`)
    return opt ? opt.label : 'Sort'
  }, [sortBy, sortDir])

  // ── Storage bar data ──────────────────────────────────────────────────────────
  const usedPct  = storage ? Math.min(100, (storage.used_bytes / storage.limit_bytes) * 100) : 0
  const barColor = usedPct >= 90 ? '#ef4444' : usedPct >= 70 ? '#f59e0b' : '#7c3aed'

  // ── Folder tree ──────────────────────────────────────────────────────────────
  const folderTree = useMemo(() => buildTree(allFolders), [allFolders])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Drive">
      <div
        style={{ display: 'flex', height: '100%', margin: '-24px', width: 'calc(100% + 48px)', overflow: 'hidden' }}
        onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
      >
        {/* ══════════ SIDEBAR ══════════ */}
        {sidebarOpen && (
          <div className="drive-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}
        <aside className={`drive-inner-sidebar${sidebarOpen ? ' open' : ''}`}>
          {/* Storage */}
          {storage && (
            <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Storage</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtBytes(storage.used_bytes)} / {storage.limit_gb} GB</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--line-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${usedPct}%`, borderRadius: 2, background: barColor, transition: 'width 0.6s ease' }} />
              </div>
              {usedPct >= 80 && (
                <p style={{ fontSize: 11, color: usedPct >= 90 ? '#f87171' : 'var(--accent)', marginTop: 4 }}>
                  {fmtBytes((storage.limit_bytes - storage.used_bytes))} remaining
                </p>
              )}
            </div>
          )}

          {/* Nav items */}
          <nav style={{ padding: '8px 8px', flex: 1 }}>
            {/* My Drive */}
            <div
              className={`drive-nav-item ${currentView === 'myDrive' && !currentFolderId ? 'active' : ''}`}
              onClick={() => { navigate('/drive'); setSidebarOpen(false) }}
            >
              <House size={15} weight="duotone" />
              <span>My Drive</span>
            </div>

            {/* Recent */}
            <div
              className={`drive-nav-item ${currentView === 'recent' ? 'active' : ''}`}
              onClick={() => { navigate('/drive?view=recent'); setSidebarOpen(false) }}
            >
              <Clock size={15} weight="duotone" />
              <span>Recent</span>
            </div>

            {/* Trash */}
            <div
              className={`drive-nav-item ${currentView === 'trash' ? 'active' : ''}`}
              onClick={() => { navigate('/drive?view=trash'); setSidebarOpen(false) }}
            >
              <Trash size={15} weight="duotone" />
              <span>Trash</span>
            </div>

            <div style={{ height: 1, background: 'var(--line)', margin: '8px 4px' }} />

            {/* Folders section header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px 6px', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Folders</span>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                onClick={() => { setShowNewFolderIn(null); setSidebarOpen(false) }}
                title="New folder"
              >
                <Plus size={12} weight="bold" />
              </button>
            </div>

            {/* Folder tree */}
            <div style={{ marginBottom: 4 }}>
              {folderTree.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '4px 10px', fontStyle: 'italic' }}>No folders yet</div>
              )}
              {folderTree.map(node => (
                <FolderTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  currentFolderId={currentFolderId}
                  expandedSet={sidebarExpanded}
                  onToggle={id => setSidebarExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })}
                  onNavigate={f => { navigate(`/drive/folder/${f.id}`); setSidebarOpen(false) }}
                  onRename={f => startRename(f, 'folder')}
                  onTrash={trashFolder}
                  onNewSubfolder={pid => { setShowNewFolderIn(pid); navigate(`/drive/folder/${pid}`); setSidebarOpen(false) }}
                />
              ))}
            </div>
          </nav>

        </aside>

        {/* ══════════ MAIN CONTENT ══════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Toolbar ── */}
          <div className="drive-toolbar">
            {/* Mobile sidebar toggle */}
            <button className="drive-sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar">
              <List size={16} />
            </button>
            {/* Breadcrumb / title */}
            <div className="drive-breadcrumb" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {currentView === 'myDrive' ? (
                breadcrumb.map((crumb, i) => (
                  <React.Fragment key={crumb.id || 'root'}>
                    {i > 0 && <CaretRight size={11} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />}
                    {i < breadcrumb.length - 1 ? (
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '2px 4px', borderRadius: 4, whiteSpace: 'nowrap' }}
                        onClick={() => crumb.id ? navigate(`/drive/folder/${crumb.id}`) : navigate('/drive')}
                        onMouseEnter={e => e.currentTarget.style.color = '#a78bfa'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                      >{crumb.name}</button>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', padding: '2px 4px' }}>{crumb.name}</span>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {currentView === 'recent' ? 'Recent' : 'Trash'}
                </span>
              )}
            </div>

            {/* Search */}
            <div className="drive-search-wrap">
              <MagnifyingGlass size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
              <input
                className="drive-search-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{ paddingRight: search ? 28 : 12 }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex' }}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div ref={sortMenuRef} style={{ position: 'relative' }}>
              <button
                className="btn-ghost"
                style={{ fontSize: 12, gap: 4, height: 34 }}
                onClick={() => setShowSortMenu(m => !m)}
              >
                <SortAscending size={14} /> {sortLabel} <CaretDown size={10} />
              </button>
              {showSortMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50, background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '4px', minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {SORT_OPTS.map((opt, i) => opt === null ? (
                    <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
                  ) : (
                    <button
                      key={opt.value}
                      onClick={() => {
                        const [sb, sd] = opt.value.split('-')
                        setSortBy(sb); setSortDir(sd); setShowSortMenu(false)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '7px 10px', background: 'none', border: 'none',
                        cursor: 'pointer', borderRadius: 6, fontSize: 13,
                        color: `${sortBy}-${sortDir}` === opt.value ? '#a78bfa' : 'rgba(255,255,255,0.75)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {opt.label}
                      {`${sortBy}-${sortDir}` === opt.value && <Check size={13} color="#a78bfa" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Grid/List toggle */}
            <div className="view-toggle">
              <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid"><SquaresFour size={16} /></button>
              <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List"><Rows size={16} /></button>
            </div>

            {/* New / Upload button — desktop only; mobile uses FAB */}
            {currentView === 'myDrive' && (
              <div ref={newMenuRef} data-new-menu="1" style={{ position: 'relative' }}>
                <button className="btn-primary" style={{ height: 34, gap: 5 }} onClick={() => setShowNewMenu(m => !m)}>
                  <Plus size={14} /> New <CaretDown size={10} />
                </button>
                {showNewMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50, background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '4px', minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    {[
                      { icon: <FolderSimplePlus size={15} />, label: 'New Folder',    action: () => { setShowNewFolderIn(currentFolderId); setShowNewMenu(false) } },
                      null,
                      { icon: <UploadSimple size={15} />,    label: 'Upload Files',  action: () => { fileInputRef.current?.click(); setShowNewMenu(false) } },
                      { icon: <FolderSimple size={15} />,    label: 'Upload Folder', action: () => { folderInputRef.current?.click(); setShowNewMenu(false) } },
                    ].map((item, i) => item === null ? (
                      <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
                    ) : (
                      <button key={i} onClick={item.action} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Trash: empty button */}
            {currentView === 'trash' && files.length > 0 && (
              <button className="btn-ghost" style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', height: 34 }} onClick={emptyTrash}>
                <Trash size={13} /> Empty Trash
              </button>
            )}
          </div>

          {/* ── Mobile FAB (New / Upload) ── */}
          {currentView === 'myDrive' && (
            <div className="drive-fab-wrap">
              <div ref={newMenuRef} style={{ position: 'relative' }}>
                <button
                  className="drive-fab"
                  onClick={() => setShowNewMenu(m => !m)}
                  aria-label="New"
                >
                  <Plus size={22} weight="bold" />
                </button>
                {showNewMenu && (
                  <div style={{ position: 'absolute', bottom: '110%', right: 0, zIndex: 200, background: '#1a1a24', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 6, minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                    {[
                      { icon: <FolderSimplePlus size={16} />, label: 'New Folder',    action: () => { setShowNewFolderIn(currentFolderId); setShowNewMenu(false) } },
                      null,
                      { icon: <UploadSimple size={16} />,    label: 'Upload Files',  action: () => { fileInputRef.current?.click(); setShowNewMenu(false) } },
                      { icon: <FolderSimple size={16} />,    label: 'Upload Folder', action: () => { folderInputRef.current?.click(); setShowNewMenu(false) } },
                    ].map((item, i) => item === null ? (
                      <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                    ) : (
                      <button key={i} onClick={item.action}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'left' }}
                      >
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Filter bar ── */}
          {currentView === 'myDrive' && !search && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, overflowX: 'auto' }}>
              {FILTER_OPTS.map(opt => {
                const count = opt.value === 'all' ? files.length : files.filter(f => getFileCategory(f.mime_type, f.name) === opt.value).length
                if (opt.value !== 'all' && count === 0) return null
                const isActive = filter === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(f => f === opt.value ? 'all' : opt.value)}
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 999, border: '1px solid',
                      borderColor: isActive ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)',
                      background: isActive ? 'rgba(124,58,237,0.15)' : 'transparent',
                      color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}{count > 0 && opt.value !== 'all' ? ` ${count}` : ''}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Trash warning banner ── */}
          {currentView === 'trash' && (
            <div style={{ margin: '12px 16px 0', padding: '9px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Warning size={15} color="#f59e0b" />
              <span style={{ flex: 1 }}>Files in Trash are permanently deleted after 30 days</span>
            </div>
          )}

          {/* ── File content area ── */}
          <div
            className="drive-content-area"
            style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 80px' }}
            onClick={e => { if (e.target === e.currentTarget) setSelected(new Set()) }}
            onContextMenu={e => {
              // Only show area menu if right-click is on the container itself or grid/table containers
              const tag = e.target.tagName
              const cls = e.target.className || ''
              const isContainer = e.target === e.currentTarget
                || (typeof cls === 'string' && (cls.includes('drive-area') || cls.includes('drive-grid') || cls.includes('drive-list')))
                || tag === 'TABLE' || tag === 'TBODY' || tag === 'THEAD'
              if (isContainer) {
                e.preventDefault()
                const items = areaCtxItems()
                if (items.length) setCtxMenu({ x: e.clientX, y: e.clientY, item: null, itemType: 'area' })
              }
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const id   = e.dataTransfer.getData('draggedId')
              const type = e.dataTransfer.getData('draggedType')
              if (id && currentView === 'myDrive') handleDragDrop(id, type, currentFolderId)
            }}
          >
            {isLoading ? (
              viewMode === 'grid' ? <SkeletonGrid /> : <SkeletonList />
            ) : loadError ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12 }}>
                <Warning size={48} style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p style={{ fontSize: 16, color: '#fff' }}>Failed to load files</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{loadError}</p>
                <button className="btn-ghost" onClick={loadContent}>Retry</button>
              </div>
            ) : processedFiles.length === 0 && processedFolders.length === 0 && showNewFolderIn === undefined && uploadingItems.length === 0 ? (
              <div className="drive-area" style={{ height: '100%' }}>
                <EmptyState view={currentView} search={search} filter={filter} onUpload={() => fileInputRef.current?.click()} onNewFolder={() => setShowNewFolderIn(currentFolderId || null)} onClearSearch={() => setSearch('')} />
              </div>
            ) : viewMode === 'grid' ? (
              <GridView
                files={processedFiles} folders={processedFolders} uploadingItems={uploadingItems}
                selected={selected} onToggleSelect={toggleSelect}
                renamingId={renamingId} renamingType={renamingType} renameVal={renameVal}
                renameInputRef={renameInputRef}
                onRenameChange={setRenameVal} onRenameSave={saveRename} onRenameCancel={cancelRename}
                showNewFolderIn={showNewFolderIn} currentFolderId={currentFolderId}
                newFolderName={newFolderName} newFolderInputRef={newFolderInputRef}
                onNewFolderChange={setNewFolderName} onNewFolderCreate={createFolder} onNewFolderCancel={() => { setShowNewFolderIn(undefined); setNewFolderName('') }}
                onFolderOpen={f => navigate(`/drive/folder/${f.id}`)}
                onCtxFile={(file, x, y) => setCtxMenu({ x, y, item: file, itemType: 'file' })}
                onCtxFolder={(folder, x, y) => setCtxMenu({ x, y, item: folder, itemType: 'folder' })}
                onPreview={(file) => { const idx = previewableFiles.findIndex(f => f.id === file.id); setPreviewFiles(previewableFiles); setPreviewIndex(idx < 0 ? 0 : idx) }}
                currentView={currentView}
                draggingItem={draggingItem} dragOverFolder={dragOverFolder}
                onDragStart={(e, id, type, name) => { e.dataTransfer.setData('draggedId', id); e.dataTransfer.setData('draggedType', type); setDraggingItem({ id, type, name }) }}
                onDragEnd={() => { setDraggingItem(null); setDragOverFolder(null) }}
                onDrop={(e, folderId, mode) => {
                  if (mode === 'hover') { setDragOverFolder(folderId); return }
                  const id = e.dataTransfer.getData('draggedId'); const type = e.dataTransfer.getData('draggedType')
                  if (id) handleDragDrop(id, type, folderId)
                }}
              />
            ) : (
              <ListView
                files={processedFiles} folders={processedFolders} uploadingItems={uploadingItems}
                selected={selected} onToggleSelect={toggleSelect}
                sortBy={sortBy} sortDir={sortDir} setSortBy={setSortBy} setSortDir={setSortDir}
                renamingId={renamingId} renamingType={renamingType} renameVal={renameVal}
                renameInputRef={renameInputRef}
                onRenameChange={setRenameVal} onRenameSave={saveRename} onRenameCancel={cancelRename}
                showNewFolderIn={showNewFolderIn} currentFolderId={currentFolderId}
                newFolderName={newFolderName} newFolderInputRef={newFolderInputRef}
                onNewFolderChange={setNewFolderName} onNewFolderCreate={createFolder} onNewFolderCancel={() => { setShowNewFolderIn(undefined); setNewFolderName('') }}
                onFolderOpen={f => navigate(`/drive/folder/${f.id}`)}
                onCtxFile={(file, x, y) => setCtxMenu({ x, y, item: file, itemType: 'file' })}
                onCtxFolder={(folder, x, y) => setCtxMenu({ x, y, item: folder, itemType: 'folder' })}
                onPreview={(file) => { const idx = previewableFiles.findIndex(f => f.id === file.id); setPreviewFiles(previewableFiles); setPreviewIndex(idx < 0 ? 0 : idx) }}
                currentView={currentView}
                allFolders={allFolders}
                draggingItem={draggingItem} dragOverFolder={dragOverFolder}
                onDragStart={(e, id, type, name) => { e.dataTransfer.setData('draggedId', id); e.dataTransfer.setData('draggedType', type); setDraggingItem({ id, type, name }) }}
                onDragEnd={() => { setDraggingItem(null); setDragOverFolder(null) }}
                onDrop={(e, folderId, mode) => {
                  if (mode === 'hover') { setDragOverFolder(folderId); return }
                  const id = e.dataTransfer.getData('draggedId'); const type = e.dataTransfer.getData('draggedType')
                  if (id) handleDragDrop(id, type, folderId)
                }}
              />
            )}
          </div>
        </div>

        {/* ── Drag upload overlay ── */}
        {isPageDrag && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(8,10,20,0.88)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '55%', height: '55%', border: '3px dashed rgba(124,58,237,0.6)', borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <CloudArrowUp size={64} weight="duotone" color="#7c3aed" />
              <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Drop to upload</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                Uploading to: {currentFolderId ? (allFolders.find(f => f.id === currentFolderId)?.name || 'folder') : 'My Drive'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <BulkBar
          selected={selected}
          onDeselect={() => setSelected(new Set())}
          onDownload={() => {
            const fileIds = [...selected].filter(s => s.startsWith('file-')).map(s => s.slice(5))
            fileIds.forEach(id => { const f = files.find(x => x.id === id); if (f) downloadFile(f) })
          }}
          onMove={() => {
            const items = [
              ...[...selected].filter(s => s.startsWith('file-')).map(s => { const f = files.find(x => x.id === s.slice(5)); return f ? { ...f, type: 'file' } : null }),
              ...[...selected].filter(s => s.startsWith('folder-')).map(s => { const f = folders.find(x => x.id === s.slice(7)); return f ? { ...f, type: 'folder' } : null }),
            ].filter(Boolean)
            setMoveItems(items)
          }}
          onTrash={currentView === 'trash' ? null : bulkTrash}
        />
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={
            ctxMenu.itemType === 'file'   ? fileCtxItems(ctxMenu.item)
            : ctxMenu.itemType === 'folder' ? folderCtxItems(ctxMenu.item)
            : areaCtxItems()
          }
        />
      )}

      {/* ── File preview ── */}
      {previewFiles && (
        <FilePreview
          files={previewFiles}
          initialIndex={previewIndex}
          onClose={() => setPreviewFiles(null)}
        />
      )}

      {/* ── Move modal ── */}
      {moveItems && (
        <MoveFolderModal
          items={moveItems}
          currentFolderId={currentFolderId}
          allFolders={allFolders}
          onMove={doMove}
          onClose={() => setMoveItems(null)}
        />
      )}

      {/* ── Duplicate modal ── */}
      {pendingDuplicates && (
        <DuplicateModal />
      )}

      {/* ── Share modal ── */}
      {shareTarget && (
        <ShareModal
          item={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* Hidden inputs */}
      <input ref={fileInputRef} type="file" multiple hidden onChange={e => { startUpload(e.target.files); e.target.value = '' }} />
      <input ref={folderInputRef} type="file" multiple hidden webkitdirectory="" onChange={e => { handleFolderUpload(e.target.files); e.target.value = '' }} />
    </DashboardLayout>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ view, search, filter, onUpload, onNewFolder, onClearSearch }) {
  if (search) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '55%', gap: 12, textAlign: 'center' }}>
      <MagnifyingGlass size={64} weight="thin" style={{ color: 'rgba(255,255,255,0.1)' }} />
      <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>No results for "{search}"</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Try a different search term</p>
      <button className="btn-ghost" onClick={onClearSearch}>Clear search</button>
    </div>
  )
  if (view === 'trash') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '55%', gap: 12, textAlign: 'center' }}>
      <Trash size={64} weight="thin" style={{ color: 'rgba(255,255,255,0.1)' }} />
      <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Trash is empty</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Files you delete will appear here</p>
    </div>
  )
  if (view === 'recent') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '55%', gap: 12, textAlign: 'center' }}>
      <Clock size={64} weight="thin" style={{ color: 'rgba(255,255,255,0.1)' }} />
      <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>No recent files</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Files you open or upload will appear here</p>
    </div>
  )
  if (filter !== 'all') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '55%', gap: 12, textAlign: 'center' }}>
      <Funnel size={64} weight="thin" style={{ color: 'rgba(255,255,255,0.1)' }} />
      <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>No matching files</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No files of this type in the current folder</p>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '55%', gap: 14, textAlign: 'center' }}>
      <FolderSimple size={72} weight="thin" style={{ color: 'rgba(255,255,255,0.1)' }} />
      <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>This folder is empty</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Drag files here or use the buttons below</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={onUpload}><UploadSimple size={14} /> Upload Files</button>
        <button className="btn-ghost" onClick={onNewFolder}><FolderSimplePlus size={14} /> New Folder</button>
      </div>
    </div>
  )
}

// ── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkBar({ selected, onDeselect, onDownload, onMove, onTrash }) {
  const count = selected.size
  const fileCount = [...selected].filter(s => s.startsWith('file-')).length
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200,
      display: 'flex', alignItems: 'center', gap: 14,
      background: '#1a1a2e', border: '1px solid rgba(124,58,237,0.35)',
      borderRadius: 999, padding: '10px 20px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      animation: 'bulkIn 0.2s ease',
    }}>
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 2, display: 'flex' }} onClick={onDeselect}>
        <X size={14} />
      </button>
      <span style={{ fontSize: 13, color: '#fff', whiteSpace: 'nowrap' }}>{count} {count === 1 ? 'item' : 'items'} selected</span>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
      {fileCount > 0 && (
        <button className="bulk-action-btn" onClick={onDownload}><DownloadSimple size={14} /> Download</button>
      )}
      <button className="bulk-action-btn" onClick={onMove}><FolderSimple size={14} /> Move to</button>
      {onTrash && (
        <button className="bulk-action-btn danger" onClick={onTrash}><Trash size={14} /> Delete</button>
      )}
      <style>{`
        @keyframes bulkIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .bulk-action-btn{background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.7);font-size:13px;display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;transition:all 0.15s}
        .bulk-action-btn:hover{background:rgba(255,255,255,0.07);color:#fff}
        .bulk-action-btn.danger:hover{background:rgba(248,113,113,0.1);color:#f87171}
      `}</style>
    </div>
  )
}

// ── New Folder Inline Input ──────────────────────────────────────────────────
function NewFolderInput({ inputRef, value, onChange, onSave, onCancel, isCard = false }) {
  if (isCard) {
    return (
      <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, height: 72 }}>
        <FolderSimple size={28} weight="duotone" color="#fbbf24" />
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Folder name"
          onKeyDown={e => { if (e.key === 'Enter') onSave(value); if (e.key === 'Escape') onCancel() }}
          onBlur={() => setTimeout(onCancel, 150)}
          style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, color: '#fff', flex: 1, fontWeight: 600 }}
        />
      </div>
    )
  }
  return (
    <tr>
      <td colSpan={6} style={{ padding: '4px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
          <FolderSimple size={20} weight="duotone" color="#fbbf24" />
          <input
            ref={inputRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Folder name"
            onKeyDown={e => { if (e.key === 'Enter') onSave(value); if (e.key === 'Escape') onCancel() }}
            onBlur={() => setTimeout(onCancel, 150)}
            style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 4, outline: 'none', fontSize: 13, color: '#fff', padding: '4px 8px', flex: 1 }}
          />
        </div>
      </td>
    </tr>
  )
}

// ── Rename Input ─────────────────────────────────────────────────────────────
function RenameInput({ inputRef, value, onChange, onSave, onCancel }) {
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave() } if (e.key === 'Escape') onCancel() }}
      onBlur={onSave}
      onClick={e => e.stopPropagation()}
      style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid #7c3aed', borderRadius: 4, outline: 'none', fontSize: 13, color: '#fff', padding: '2px 6px', width: '100%', fontFamily: 'inherit' }}
    />
  )
}

// ── Thumbnail / Icon ─────────────────────────────────────────────────────────
function FileThumbnail({ file, size = 140 }) {
  const [imgErr, setImgErr] = useState(false)
  const mime = file.mime_type || ''
  if (file.thumbnailUrl && !imgErr) {
    return <img src={file.thumbnailUrl} alt={file.name} style={{ width: '100%', height: size, objectFit: 'cover', display: 'block' }} loading="lazy" onError={() => setImgErr(true)} />
  }
  const bg = mime.startsWith('video/') ? 'linear-gradient(135deg,#1a1030,#0a0a14)' : mime.startsWith('audio/') ? 'linear-gradient(135deg,#0a1e14,#0a0a14)' : mime === 'application/pdf' ? 'linear-gradient(135deg,#1e0a0a,#0a0a14)' : 'linear-gradient(135deg,#0d1520,#0a0a14)'
  return (
    <div style={{ height: size, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={40} />
    </div>
  )
}

// Inline thumbnail for list view rows
function ListThumb({ file }) {
  const [err, setErr] = useState(false)
  if (file.thumbnailUrl && !err) {
    return <img src={file.thumbnailUrl} alt="" style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} loading="lazy" onError={() => setErr(true)} />
  }
  return <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={26} />
}

// ── Uploading placeholder card (grid view) ────────────────────────────────────
function UploadingFileCard({ item }) {
  const isPending = item.status === 'pending'
  const pct   = isPending ? 0 : item.progress
  const speed = !isPending ? fmtSpeed(item.speed) : null
  const eta   = !isPending ? fmtEta(item.eta)   : null
  return (
    <div className="drive-file-card" style={{ cursor: 'default', pointerEvents: 'none' }}>
      {/* Thumbnail area */}
      <div style={{ position: 'relative', height: 130, background: 'linear-gradient(135deg,#110c1e,#0a0a14)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <FileTypeIcon fileName={item.name} size={40} style={{ opacity: 0.5 }} />
        {/* Progress bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: isPending ? 'rgba(124,58,237,0.35)' : '#7c3aed', transition: 'width 0.3s ease', borderRadius: 2 }} />
        </div>
        {/* Percentage badge */}
        <div style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 11, fontWeight: 700, color: isPending ? 'rgba(255,255,255,0.3)' : '#a78bfa', background: 'rgba(0,0,0,0.55)', padding: '1px 5px', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
          {isPending ? 'Queued' : `${pct}%`}
        </div>
        {/* Speed badge */}
        {speed && (
          <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.55)', padding: '1px 5px', borderRadius: 4, fontVariantNumeric: 'tabular-nums' }}>
            {speed}
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ padding: '8px 10px' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35 }}>{item.name}</span>
        <span style={{ fontSize: 11, color: isPending ? 'rgba(255,255,255,0.25)' : '#a78bfa', display: 'block', marginTop: 2 }}>
          {isPending ? 'Queued' : (eta || 'Uploading…')}
        </span>
      </div>
    </div>
  )
}

// ── Uploading placeholder row (list view) ─────────────────────────────────────
function UploadingFileRow({ item }) {
  const isPending = item.status === 'pending'
  const pct   = isPending ? 0 : item.progress
  const speed = !isPending ? fmtSpeed(item.speed) : null
  const eta   = !isPending ? fmtEta(item.eta)   : null
  const tdStyle = { padding: '0 10px', fontSize: 13, verticalAlign: 'middle' }
  return (
    <tr style={{ height: 48, opacity: isPending ? 0.55 : 1 }}>
      <td style={{ ...tdStyle, width: 40, paddingLeft: 8 }}>
        <div style={{ width: 16, height: 16 }} />
      </td>
      <td style={{ ...tdStyle, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <FileTypeIcon fileName={item.name} size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{item.name}</span>
            <div style={{ marginTop: 3, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', maxWidth: 220 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: isPending ? 'rgba(124,58,237,0.35)' : '#7c3aed', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        </div>
      </td>
      <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: isPending ? 'rgba(255,255,255,0.25)' : '#a78bfa', fontSize: 12 }}>
        {isPending ? 'Queued' : `${pct}%`}
      </td>
      <td style={tdStyle}>{fmtBytes(item.size)}</td>
      <td style={{ ...tdStyle, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
        {isPending ? '—' : [speed, eta].filter(Boolean).join(' · ') || 'Uploading…'}
      </td>
      <td /><td />
    </tr>
  )
}

// ── Grid View ────────────────────────────────────────────────────────────────
function GridView({ files, folders, uploadingItems = [], selected, onToggleSelect, renamingId, renamingType, renameVal, renameInputRef, onRenameChange, onRenameSave, onRenameCancel, showNewFolderIn, currentFolderId, newFolderName, newFolderInputRef, onNewFolderChange, onNewFolderCreate, onNewFolderCancel, onFolderOpen, onCtxFile, onCtxFolder, onPreview, currentView, draggingItem, dragOverFolder, onDragStart, onDragEnd, onDrop }) {

  function handleFileCtx(e, file) { e.preventDefault(); e.stopPropagation(); onCtxFile(file, e.clientX, e.clientY) }
  function handleFolderCtx(e, folder) { e.preventDefault(); e.stopPropagation(); onCtxFolder(folder, e.clientX, e.clientY) }

  const folderLP = useLongPress((e, folder) => {
    const touch = e.changedTouches?.[0] || e
    onCtxFolder(folder, touch.clientX, touch.clientY)
  })
  const fileLP = useLongPress((e, file) => {
    const touch = e.changedTouches?.[0] || e
    onCtxFile(file, touch.clientX, touch.clientY)
  })

  return (
    <div className="drive-area">
      {/* Folders */}
      {(folders.length > 0 || showNewFolderIn === (currentFolderId || null)) && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Folders</p>
          <div className="drive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {showNewFolderIn === (currentFolderId || null) && (
              <NewFolderInput inputRef={newFolderInputRef} value={newFolderName} onChange={onNewFolderChange} onSave={v => onNewFolderCreate(v, currentFolderId)} onCancel={onNewFolderCancel} isCard />
            )}
            {folders.map(folder => {
              const selKey = `folder-${folder.id}`
              const isSel = selected.has(selKey)
              const isRenaming = renamingId === folder.id && renamingType === 'folder'
              const isDragOver = dragOverFolder === folder.id
              return (
                <div
                  key={folder.id}
                  className={`drive-folder-card ${isSel ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  style={{ opacity: draggingItem?.id === folder.id ? 0.45 : 1 }}
                  draggable={currentView === 'myDrive'}
                  onDragStart={e => { e.stopPropagation(); onDragStart(e, folder.id, 'folder', folder.name) }}
                  onDragEnd={onDragEnd}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (draggingItem?.id !== folder.id) onDrop(null, folder.id, 'hover') }}
                  onDragLeave={e => { e.stopPropagation(); onDrop(null, null, 'hover') }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(e, folder.id) }}
                  onClick={e => {
                    if (folderLP.wasFired()) return
                    if (isTouch()) onFolderOpen(folder)
                    else if (e.detail === 2) onFolderOpen(folder)
                    else onToggleSelect(selKey)
                  }}
                  onTouchStart={e => folderLP.start(e, folder)}
                  onTouchEnd={folderLP.cancel}
                  onTouchMove={folderLP.cancel}
                  onContextMenu={e => handleFolderCtx(e, folder)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <FolderSimple size={26} weight="duotone" color={isDragOver ? '#a78bfa' : '#fbbf24'} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isRenaming ? (
                        <RenameInput inputRef={renameInputRef} value={renameVal} onChange={onRenameChange} onSave={onRenameSave} onCancel={onRenameCancel} />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="card-menu-btn"
                    style={{ flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onCtxFolder(folder, r.left, r.bottom + 4) }}
                  >
                    <DotsThree size={16} weight="bold" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Files */}
      {(files.length > 0 || uploadingItems.length > 0) && (
        <div>
          {folders.length > 0 && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Files</p>}
          <div className="drive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {uploadingItems.map(u => <UploadingFileCard key={u.id} item={u} />)}
            {files.map(file => {
              const selKey = `file-${file.id}`
              const isSel = selected.has(selKey)
              const isRenaming = renamingId === file.id && renamingType === 'file'
              return (
                <div
                  key={file.id}
                  className={`drive-file-card ${isSel ? 'selected' : ''}`}
                  style={{ opacity: draggingItem?.id === file.id ? 0.45 : 1 }}
                  draggable={currentView === 'myDrive'}
                  onDragStart={e => { e.stopPropagation(); onDragStart(e, file.id, 'file', file.name) }}
                  onDragEnd={onDragEnd}
                  onClick={e => {
                    if (fileLP.wasFired()) return
                    if (isTouch()) { e.preventDefault(); onPreview(file) }
                    else if (e.detail === 2) { e.preventDefault(); onPreview(file) }
                    else onToggleSelect(selKey)
                  }}
                  onTouchStart={e => fileLP.start(e, file)}
                  onTouchEnd={fileLP.cancel}
                  onTouchMove={fileLP.cancel}
                  onContextMenu={e => handleFileCtx(e, file)}
                >
                  {/* Thumbnail */}
                  <div style={{ position: 'relative', overflow: 'hidden' }}>
                    <FileThumbnail file={file} size={130} />
                    {/* Hover overlay */}
                    <div className="drive-card-overlay">
                      <div
                        style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${isSel ? '#7c3aed' : 'rgba(255,255,255,0.8)'}`, background: isSel ? '#7c3aed' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={e => { e.stopPropagation(); onToggleSelect(selKey) }}
                      >
                        {isSel && <Check size={11} color="#fff" weight="bold" />}
                      </div>
                    </div>
                  </div>
                  {/* Info */}
                  <div style={{ padding: '8px 10px' }}>
                    {isRenaming ? (
                      <RenameInput inputRef={renameInputRef} value={renameVal} onChange={onRenameChange} onSave={onRenameSave} onCancel={onRenameCancel} />
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35 }}>{file.name}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'block', marginTop: 2 }}>{fmtBytes(file.file_size)} · {fmtRel(file.created_at)}</span>
                  </div>
                  <button
                    className="card-menu-btn"
                    style={{ position: 'absolute', top: 8, right: 8 }}
                    onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onCtxFile(file, r.left, r.bottom + 4) }}
                  >
                    <DotsThree size={15} weight="bold" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── List View ────────────────────────────────────────────────────────────────
function SortTh({ col, label, sortBy, sortDir, setSortBy, setSortDir, style = {}, className = '' }) {
  const isActive = sortBy === col
  return (
    <th
      className={className}
      onClick={() => { if (isActive) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(col); setSortDir('asc') } }}
      style={{ ...style, cursor: 'pointer', padding: '8px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label} {isActive ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )
}

function ListView({ files, folders, uploadingItems = [], selected, onToggleSelect, sortBy, sortDir, setSortBy, setSortDir, renamingId, renamingType, renameVal, renameInputRef, onRenameChange, onRenameSave, onRenameCancel, showNewFolderIn, currentFolderId, newFolderName, newFolderInputRef, onNewFolderChange, onNewFolderCreate, onNewFolderCancel, onFolderOpen, onCtxFile, onCtxFolder, onPreview, currentView, allFolders, draggingItem, dragOverFolder, onDragStart, onDragEnd, onDrop }) {
  const folderLPList = useLongPress((e, folder) => {
    const touch = e.changedTouches?.[0] || e
    onCtxFolder(folder, touch.clientX, touch.clientY)
  })
  const fileLPList = useLongPress((e, file) => {
    const touch = e.changedTouches?.[0] || e
    onCtxFile(file, touch.clientX, touch.clientY)
  })

  const thStyle = { padding: '8px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left', userSelect: 'none' }
  const tdStyle = { padding: '0 10px', fontSize: 13, color: 'rgba(255,255,255,0.65)', verticalAlign: 'middle' }

  function mimeLabel(mime, name) {
    if (!mime && !name) return '—'
    const ext = (name?.split('.').pop() || '').toUpperCase()
    if (mime?.startsWith('video/')) return ext ? `${ext} Video` : 'Video'
    if (mime?.startsWith('image/')) return ext ? `${ext} Image` : 'Image'
    if (mime?.startsWith('audio/')) return ext ? `${ext} Audio` : 'Audio'
    if (mime === 'application/pdf') return 'PDF'
    return ext ? `${ext} File` : 'File'
  }

  function locationPath(folderId) {
    if (!folderId) return 'My Drive'
    const path = []
    let cur = folderId
    const map = Object.fromEntries((allFolders || []).map(f => [f.id, f]))
    let i = 0
    while (cur && map[cur] && i++ < 10) { path.unshift(map[cur].name); cur = map[cur].parent_id }
    return 'My Drive' + (path.length ? ' / ' + path.join(' / ') : '')
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, width: 40, paddingLeft: 8 }} />
          <SortTh col="name"  label="Name"     sortBy={sortBy} sortDir={sortDir} setSortBy={setSortBy} setSortDir={setSortDir} style={{ minWidth: 200 }} />
          <th style={thStyle}>Type</th>
          <SortTh col="size"  label="Size"     sortBy={sortBy} sortDir={sortDir} setSortBy={setSortBy} setSortDir={setSortDir} style={{ width: 100 }} className="drive-list-col-size" />
          <SortTh col="date"  label="Modified" sortBy={sortBy} sortDir={sortDir} setSortBy={setSortBy} setSortDir={setSortDir} style={{ width: 140 }} className="drive-list-col-modified" />
          {(currentView === 'recent') && <th style={{ ...thStyle, width: 160 }}>Location</th>}
          <th style={{ ...thStyle, width: 44 }} />
        </tr>
      </thead>
      <tbody>
        {showNewFolderIn === (currentFolderId || null) && (
          <NewFolderInput inputRef={newFolderInputRef} value={newFolderName} onChange={onNewFolderChange} onSave={v => onNewFolderCreate(v, currentFolderId)} onCancel={onNewFolderCancel} isCard={false} />
        )}
        {uploadingItems.map(u => <UploadingFileRow key={u.id} item={u} />)}
        {folders.map(folder => {
          const selKey = `folder-${folder.id}`
          const isSel = selected.has(selKey)
          const isRenaming = renamingId === folder.id && renamingType === 'folder'
          const isDragOver = dragOverFolder === folder.id
          return (
            <tr
              key={folder.id}
              className={`drive-list-row ${isSel ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
              style={{ height: 44, opacity: draggingItem?.id === folder.id ? 0.45 : 1 }}
              draggable={currentView === 'myDrive'}
              onDragStart={e => { e.stopPropagation(); onDragStart(e, folder.id, 'folder', folder.name) }}
              onDragEnd={onDragEnd}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (draggingItem?.id !== folder.id) onDrop(null, folder.id, 'hover') }}
              onDragLeave={e => { e.stopPropagation(); onDrop(null, null, 'hover') }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(e, folder.id) }}
              onClick={e => {
                if (folderLPList.wasFired()) return
                if (isTouch()) onFolderOpen(folder)
                else if (e.detail === 2) onFolderOpen(folder)
                else onToggleSelect(selKey)
              }}
              onTouchStart={e => folderLPList.start(e, folder)}
              onTouchEnd={folderLPList.cancel}
              onTouchMove={folderLPList.cancel}
              onContextMenu={e => { e.preventDefault(); onCtxFolder(folder, e.clientX, e.clientY) }}
            >
              <td style={{ ...tdStyle, paddingLeft: 8, width: 40 }}>
                <div
                  style={{ width: 18, height: 18, borderRadius: 3, border: `1.5px solid ${isSel ? '#7c3aed' : 'rgba(255,255,255,0.25)'}`, background: isSel ? '#7c3aed' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onToggleSelect(selKey) }}
                >
                  {isSel && <Check size={10} color="#fff" weight="bold" />}
                </div>
              </td>
              <td style={{ ...tdStyle, fontWeight: 600, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <FolderSimple size={20} weight="duotone" color="#fbbf24" style={{ flexShrink: 0 }} />
                  {isRenaming ? <RenameInput inputRef={renameInputRef} value={renameVal} onChange={onRenameChange} onSave={onRenameSave} onCancel={onRenameCancel} /> : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>}
                </div>
              </td>
              <td style={tdStyle}>Folder</td>
              <td className="drive-list-col-size" style={tdStyle}>—</td>
              <td className="drive-list-col-modified" style={tdStyle}>{fmtRel(folder.created_at)}</td>
              {currentView === 'recent' && <td style={tdStyle}>—</td>}
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <button className="card-menu-btn" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onCtxFolder(folder, r.left, r.bottom + 4) }}><DotsThree size={15} weight="bold" /></button>
              </td>
            </tr>
          )
        })}
        {files.map(file => {
          const selKey = `file-${file.id}`
          const isSel = selected.has(selKey)
          const isRenaming = renamingId === file.id && renamingType === 'file'
          return (
            <tr
              key={file.id}
              className={`drive-list-row ${isSel ? 'selected' : ''}`}
              style={{ height: 44, opacity: draggingItem?.id === file.id ? 0.45 : 1 }}
              draggable={currentView === 'myDrive'}
              onDragStart={e => { e.stopPropagation(); onDragStart(e, file.id, 'file', file.name) }}
              onDragEnd={onDragEnd}
              onClick={e => {
                if (fileLPList.wasFired()) return
                if (isTouch()) { e.preventDefault(); onPreview(file) }
                else if (e.detail === 2) { e.preventDefault(); onPreview(file) }
                else onToggleSelect(selKey)
              }}
              onTouchStart={e => fileLPList.start(e, file)}
              onTouchEnd={fileLPList.cancel}
              onTouchMove={fileLPList.cancel}
              onContextMenu={e => { e.preventDefault(); onCtxFile(file, e.clientX, e.clientY) }}
            >
              <td style={{ ...tdStyle, paddingLeft: 8, width: 40 }}>
                <div
                  style={{ width: 18, height: 18, borderRadius: 3, border: `1.5px solid ${isSel ? '#7c3aed' : 'rgba(255,255,255,0.25)'}`, background: isSel ? '#7c3aed' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onToggleSelect(selKey) }}
                >
                  {isSel && <Check size={10} color="#fff" weight="bold" />}
                </div>
              </td>
              <td style={{ ...tdStyle, fontWeight: 600, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <ListThumb file={file} />
                  {isRenaming ? <RenameInput inputRef={renameInputRef} value={renameVal} onChange={onRenameChange} onSave={onRenameSave} onCancel={onRenameCancel} /> : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</span>}
                </div>
              </td>
              <td style={{ ...tdStyle, fontSize: 12 }}>{mimeLabel(file.mime_type, file.name)}</td>
              <td className="drive-list-col-size" style={{ ...tdStyle, fontSize: 12 }}>{fmtBytes(file.file_size)}</td>
              <td className="drive-list-col-modified" style={{ ...tdStyle, fontSize: 12 }}>{fmtDate(file.updated_at || file.created_at)}</td>
              {currentView === 'recent' && (
                <td style={{ ...tdStyle, fontSize: 11, color: 'rgba(255,255,255,0.4)' }} title={locationPath(file.folder_id)}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{locationPath(file.folder_id)}</span>
                </td>
              )}
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <button className="card-menu-btn" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onCtxFile(file, r.left, r.bottom + 4) }}><DotsThree size={15} weight="bold" /></button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
