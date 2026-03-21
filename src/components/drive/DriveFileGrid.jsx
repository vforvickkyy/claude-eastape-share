import React from 'react'
import {
  FolderSimple, DotsThree, ArrowSquareOut, PencilSimple,
  Trash, X, Check, DownloadSimple,
} from '@phosphor-icons/react'
import FileTypeIcon from './FileTypeIcon'
import { driveFilesApi } from '../../lib/api'

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function downloadFile(file) {
  try {
    const { url } = await driveFilesApi.getDownloadUrl(file.id)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
  } catch {}
}

function CtxMenu({ x, y, items, ctxRef }) {
  const left = x + 190 > window.innerWidth  ? x - 190 : x
  const top  = y + items.length * 34 + 16 > window.innerHeight ? y - items.length * 34 - 8 : y
  return (
    <div ref={ctxRef} className="card-menu-dropdown ctx-fixed" style={{ left, top }} onContextMenu={e => e.preventDefault()}>
      {items.map((item, i) =>
        item.divider ? <div key={i} className="ctx-divider" /> : (
          <button key={i} className={`card-menu-item ${item.danger ? 'danger' : ''}`} onClick={e => { e.stopPropagation(); item.onClick() }}>
            {item.icon} {item.label}
          </button>
        )
      )}
    </div>
  )
}

export default function DriveFileGrid({ files, folders, onFolderClick, onTrash, onDelete, onRename, onFolderDelete }) {
  const [ctxMenu,   setCtxMenu]   = React.useState(null)
  const [renaming,  setRenaming]  = React.useState(null) // { id, value }
  const ctxRef = React.useRef(null)

  React.useEffect(() => {
    if (!ctxMenu) return
    function onDown(e) { if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null) }
    function onKey(e) { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [ctxMenu])

  function openAt(e, payload) { e.preventDefault(); e.stopPropagation(); setCtxMenu({ ...payload, x: e.clientX, y: e.clientY }) }
  function openFromBtn(e, payload) { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setCtxMenu({ ...payload, x: r.left, y: r.bottom + 4 }) }

  async function commitRename(id) {
    const name = renaming?.value?.trim()
    setRenaming(null)
    if (name) await onRename?.(id, name)
  }

  function fileMenuItems(file) {
    return [
      { icon: <DownloadSimple size={13} />, label: 'Download',      onClick: () => { downloadFile(file); setCtxMenu(null) } },
      { icon: <ArrowSquareOut size={13} />, label: 'Open in new tab', onClick: () => { driveFilesApi.getDownloadUrl(file.id).then(({ url }) => window.open(url, '_blank')).catch(() => {}); setCtxMenu(null) } },
      { divider: true },
      { icon: <PencilSimple size={13} />,   label: 'Rename',         onClick: () => { setRenaming({ id: file.id, value: file.name }); setCtxMenu(null) } },
      { divider: true },
      { icon: <Trash size={13} />,          label: 'Move to trash',  danger: true, onClick: () => { onTrash?.(file.id); setCtxMenu(null) } },
      { icon: <Trash size={13} />,          label: 'Delete permanently', danger: true, onClick: () => { onDelete?.(file.id); setCtxMenu(null) } },
    ]
  }

  function folderMenuItems(folder) {
    return [
      { icon: <Trash size={13} />, label: 'Delete folder', danger: true, onClick: () => { onFolderDelete?.(folder.id); setCtxMenu(null) } },
    ]
  }

  const ctxItems = React.useMemo(() => {
    if (!ctxMenu) return []
    if (ctxMenu.isFolder) {
      const folder = folders?.find(f => f.id === ctxMenu.folderId)
      return folder ? folderMenuItems(folder) : []
    }
    const file = files?.find(f => f.id === ctxMenu.fileId)
    return file ? fileMenuItems(file) : []
  }, [ctxMenu, files, folders])

  return (
    <div className="file-grid">
      {/* Folders */}
      {folders?.map(folder => (
        <div
          key={folder.id}
          className="file-card folder-card"
          onClick={() => onFolderClick?.(folder)}
          onContextMenu={e => openAt(e, { isFolder: true, folderId: folder.id })}
        >
          <div className="file-card-icon folder-icon">
            <FolderSimple size={32} weight="duotone" color="#f59e0b" />
          </div>
          <div className="file-card-info">
            <span className="file-card-name">{folder.name}</span>
            <span className="file-card-meta">{formatDate(folder.created_at)}</span>
          </div>
          <button className="card-menu-btn" onClick={e => openFromBtn(e, { isFolder: true, folderId: folder.id })}>
            <DotsThree size={18} weight="bold" />
          </button>
        </div>
      ))}

      {/* Files */}
      {files?.map(file => {
        const isRenaming = renaming?.id === file.id
        return (
          <div
            key={file.id}
            className="file-card"
            onContextMenu={e => openAt(e, { isFolder: false, fileId: file.id })}
            onDoubleClick={() => downloadFile(file)}
          >
            <div className="file-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72 }}>
              <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={44} />
            </div>
            <div className="file-card-info">
              {isRenaming ? (
                <input
                  className="rename-input"
                  value={renaming.value}
                  autoFocus
                  onChange={e => setRenaming(r => ({ ...r, value: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitRename(file.id)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={() => commitRename(file.id)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="file-card-name" title={file.name}>{file.name}</span>
              )}
              <span className="file-card-meta">{formatSize(file.file_size)} · {formatDate(file.created_at)}</span>
            </div>
            <button className="card-menu-btn" onClick={e => openFromBtn(e, { isFolder: false, fileId: file.id })}>
              <DotsThree size={18} weight="bold" />
            </button>
          </div>
        )
      })}

      {ctxMenu && ctxItems.length > 0 && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} ctxRef={ctxRef} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
