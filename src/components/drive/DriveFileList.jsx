import React from 'react'
import {
  FolderSimple, DotsThree, PencilSimple, Trash,
  DownloadSimple, ArrowSquareOut, CaretUp, CaretDown,
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

function formatRel(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso)
  const s = diff / 1000, m = s / 60, h = m / 60, d = h / 24, mo = d / 30
  if (d < 1)  return `${Math.round(h)}h ago`
  if (d < 7)  return `${Math.round(d)}d ago`
  if (mo < 2) return `${Math.round(d / 7)}w ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function mimeLabel(mime, name) {
  if (!mime && !name) return '—'
  const ext = (name?.split('.').pop() || '').toUpperCase()
  if (mime?.startsWith('video/')) return `${ext} Video`
  if (mime?.startsWith('image/')) return `${ext} Image`
  if (mime?.startsWith('audio/')) return `${ext} Audio`
  if (mime === 'application/pdf') return 'PDF Document'
  if (ext) return `${ext} File`
  return 'File'
}

async function downloadFile(file) {
  try {
    const { url } = await driveFilesApi.getDownloadUrl(file.id)
    const a = document.createElement('a')
    a.href = url; a.download = file.name; a.click()
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

function SortArrow({ col, sort, setSort }) {
  const asc = `${col}-asc`, desc = `${col}-desc`
  const active = sort === asc || sort === desc
  const isAsc  = sort === asc
  return (
    <button
      onClick={() => setSort(active && isAsc ? desc : asc)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'inline-flex', alignItems: 'center', gap: 2,
        color: active ? 'var(--accent)' : 'var(--t3)', fontSize: 'inherit',
      }}
    >
      {col === 'name' ? 'Name' : col === 'size' ? 'Size' : 'Modified'}
      {active ? (isAsc ? <CaretUp size={10} /> : <CaretDown size={10} />) : <CaretDown size={10} style={{ opacity: 0.3 }} />}
    </button>
  )
}

export default function DriveFileList({ files, folders, onFolderClick, onTrash, onDelete, onRename, onFolderDelete, sort, setSort }) {
  const [ctxMenu,  setCtxMenu]  = React.useState(null)
  const [renaming, setRenaming] = React.useState(null)
  const ctxRef   = React.useRef(null)
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    if (!ctxMenu) return
    function onDown(e) { if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null) }
    function onKey(e) { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [ctxMenu])

  React.useEffect(() => { if (renaming) inputRef.current?.focus() }, [renaming])

  function openAt(e, p)     { e.preventDefault(); e.stopPropagation(); setCtxMenu({ ...p, x: e.clientX, y: e.clientY }) }
  function openFromBtn(e,p) { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setCtxMenu({ ...p, x: r.left, y: r.bottom + 4 }) }

  async function commitRename(id) {
    const name = renaming?.value?.trim()
    setRenaming(null)
    if (name) await onRename?.(id, name)
  }

  function fileMenuItems(file) {
    return [
      { icon: <DownloadSimple size={13} />, label: 'Download',       onClick: () => { downloadFile(file); setCtxMenu(null) } },
      { icon: <ArrowSquareOut size={13} />, label: 'Open in new tab', onClick: () => { driveFilesApi.getDownloadUrl(file.id).then(({ url }) => window.open(url, '_blank')).catch(() => {}); setCtxMenu(null) } },
      { divider: true },
      { icon: <PencilSimple size={13} />,   label: 'Rename',          onClick: () => { setRenaming({ id: file.id, value: file.name }); setCtxMenu(null) } },
      { divider: true },
      { icon: <Trash size={13} />,          label: 'Move to trash',   danger: true, onClick: () => { onTrash?.(file.id); setCtxMenu(null) } },
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
    if (ctxMenu.isFolder) { const f = folders?.find(x => x.id === ctxMenu.folderId); return f ? folderMenuItems(f) : [] }
    const f = files?.find(x => x.id === ctxMenu.fileId); return f ? fileMenuItems(f) : []
  }, [ctxMenu, files, folders])

  const thStyle = { padding: '8px 12px 8px 0', fontSize: 11, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', userSelect: 'none' }
  const tdStyle = { padding: '0 12px 0 0', fontSize: 12, color: 'var(--t2)', verticalAlign: 'middle' }

  return (
    <>
      <table className="file-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, paddingLeft: 8, width: 40 }} />
            <th style={thStyle}><SortArrow col="name" sort={sort} setSort={setSort} /></th>
            <th style={{ ...thStyle, width: 120 }}>Type</th>
            <th style={{ ...thStyle, width: 100 }}><SortArrow col="size" sort={sort} setSort={setSort} /></th>
            <th style={{ ...thStyle, width: 140 }}><SortArrow col="date" sort={sort} setSort={setSort} /></th>
            <th style={{ ...thStyle, width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {/* Folders first */}
          {folders?.map(folder => (
            <tr
              key={folder.id}
              className="file-list-row folder-row"
              style={{ height: 44, cursor: 'pointer' }}
              onClick={() => onFolderClick?.(folder)}
              onContextMenu={e => openAt(e, { isFolder: true, folderId: folder.id })}
            >
              <td style={{ ...tdStyle, paddingLeft: 8 }}>
                <FolderSimple size={24} weight="duotone" color="#f59e0b" />
              </td>
              <td style={tdStyle}>
                <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{folder.name}</span>
              </td>
              <td style={tdStyle}>Folder</td>
              <td style={tdStyle}>—</td>
              <td style={tdStyle}>{formatRel(folder.created_at)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <button className="card-menu-btn" onClick={e => openFromBtn(e, { isFolder: true, folderId: folder.id })}>
                  <DotsThree size={16} weight="bold" />
                </button>
              </td>
            </tr>
          ))}

          {/* Files */}
          {files?.map(file => {
            const isRenaming = renaming?.id === file.id
            return (
              <tr
                key={file.id}
                className="file-list-row"
                style={{ height: 44 }}
                onContextMenu={e => openAt(e, { isFolder: false, fileId: file.id })}
                onDoubleClick={() => downloadFile(file)}
              >
                <td style={{ ...tdStyle, paddingLeft: 8 }}>
                  <FileTypeIcon mimeType={file.mime_type} fileName={file.name} size={28} />
                </td>
                <td style={tdStyle}>
                  {isRenaming ? (
                    <input
                      ref={inputRef}
                      className="rename-input rename-input--row"
                      value={renaming.value}
                      onChange={e => setRenaming(r => ({ ...r, value: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  commitRename(file.id)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={() => commitRename(file.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span style={{ color: 'var(--t1)' }} title={file.name}>{file.name}</span>
                  )}
                </td>
                <td style={tdStyle}>{mimeLabel(file.mime_type, file.name)}</td>
                <td style={tdStyle}>{formatSize(file.file_size)}</td>
                <td style={tdStyle}>{formatRel(file.created_at)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button className="card-menu-btn" onClick={e => openFromBtn(e, { isFolder: false, fileId: file.id })}>
                    <DotsThree size={16} weight="bold" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {ctxMenu && ctxItems.length > 0 && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} ctxRef={ctxRef} />
      )}
    </>
  )
}
