/**
 * MoveFolderModal — pick a destination folder to move one or multiple items.
 * Props:
 *   items: [{id, name, type: 'file'|'folder', folder_id?}]
 *   currentFolderId: string|null — grey out this folder
 *   allFolders: [{id, name, parent_id}] — flat list; component builds tree
 *   onMove: (targetFolderId: string|null) => void
 *   onClose: () => void
 */
import React, { useState, useMemo } from 'react'
import { X, FolderSimple, CaretRight, Check, House } from '@phosphor-icons/react'

function buildTree(folders, parentId = null) {
  return folders
    .filter(f => (f.parent_id || null) === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.id) }))
}

function FolderItem({ node, depth, selected, currentFolderId, movingFolderIds, onSelect, expandedSet, toggleExpand }) {
  const isDisabled = currentFolderId === node.id || movingFolderIds?.has(node.id)
  const isSelected = selected === node.id
  const hasChildren = node.children.length > 0
  const isExpanded = expandedSet.has(node.id)

  return (
    <>
      <div
        onClick={() => !isDisabled && onSelect(node.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `6px 12px 6px ${12 + depth * 16}px`,
          borderRadius: 6, cursor: isDisabled ? 'default' : 'pointer',
          opacity: isDisabled ? 0.35 : 1,
          background: isSelected ? 'rgba(124,58,237,0.18)' : 'transparent',
          border: `1px solid ${isSelected ? 'rgba(124,58,237,0.4)' : 'transparent'}`,
          marginBottom: 2,
        }}
        onMouseEnter={e => { if (!isDisabled && !isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
      >
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hasChildren ? 1 : 0.2 }}
          onClick={e => { e.stopPropagation(); if (hasChildren) toggleExpand(node.id) }}
        >
          <CaretRight size={11} color="rgba(255,255,255,0.5)" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        <FolderSimple size={16} weight="duotone" color="#fbbf24" />
        <span style={{ fontSize: 13, color: isSelected ? '#fff' : 'rgba(255,255,255,0.8)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
          {isDisabled && currentFolderId === node.id && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>(current)</span>}
        </span>
        {isSelected && <Check size={14} color="#a78bfa" />}
      </div>
      {isExpanded && node.children.map(child => (
        <FolderItem key={child.id} node={child} depth={depth + 1} selected={selected} currentFolderId={currentFolderId} movingFolderIds={movingFolderIds} onSelect={onSelect} expandedSet={expandedSet} toggleExpand={toggleExpand} />
      ))}
    </>
  )
}

export default function MoveFolderModal({ items, currentFolderId, allFolders, onMove, onClose }) {
  const [selected, setSelected] = useState(null) // null = root
  const [expanded, setExpanded] = useState(new Set())
  const [search, setSearch] = useState('')

  const movingFolderIds = useMemo(() => new Set(items.filter(i => i.type === 'folder').map(i => i.id)), [items])

  const tree = useMemo(() => buildTree(allFolders || []), [allFolders])

  const filteredFolders = useMemo(() => {
    if (!search) return null
    return (allFolders || []).filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
  }, [search, allFolders])

  function toggleExpand(id) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const label = items.length === 1 ? `"${items[0].name}"` : `${items.length} items`
  const destLabel = selected === null ? 'My Drive (root)' : (allFolders || []).find(f => f.id === selected)?.name || 'Selected folder'
  const isSameLocation = selected === (currentFolderId || null)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '96vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Move {label}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
          <input
            className="input-field"
            placeholder="Search folders…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', fontSize: 13, marginBottom: 8 }}
          />
        </div>

        {/* Folder tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {/* Root / My Drive option */}
          {!search && (
            <div
              onClick={() => setSelected(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6,
                cursor: currentFolderId === null ? 'default' : 'pointer',
                opacity: currentFolderId === null ? 0.35 : 1,
                background: selected === null ? 'rgba(124,58,237,0.18)' : 'transparent',
                border: `1px solid ${selected === null ? 'rgba(124,58,237,0.4)' : 'transparent'}`,
                marginBottom: 2,
              }}
              onMouseEnter={e => { if (currentFolderId !== null && selected !== null) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (selected !== null) e.currentTarget.style.background = 'transparent' }}
            >
              <House size={16} color="#a78bfa" />
              <span style={{ fontSize: 13, color: selected === null ? '#fff' : 'rgba(255,255,255,0.8)', flex: 1, fontWeight: 600 }}>My Drive</span>
              {currentFolderId === null && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>(current)</span>}
              {selected === null && <Check size={14} color="#a78bfa" />}
            </div>
          )}

          {filteredFolders ? (
            filteredFolders.map(f => (
              <div key={f.id} onClick={() => !movingFolderIds.has(f.id) && f.id !== currentFolderId && setSelected(f.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, opacity: movingFolderIds.has(f.id) || f.id === currentFolderId ? 0.35 : 1, background: selected === f.id ? 'rgba(124,58,237,0.18)' : 'transparent', border: `1px solid ${selected === f.id ? 'rgba(124,58,237,0.4)' : 'transparent'}` }}
              >
                <FolderSimple size={16} weight="duotone" color="#fbbf24" />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{f.name}</span>
                {selected === f.id && <Check size={14} color="#a78bfa" />}
              </div>
            ))
          ) : (
            tree.map(node => (
              <FolderItem key={node.id} node={node} depth={0} selected={selected} currentFolderId={currentFolderId} movingFolderIds={movingFolderIds} onSelect={setSelected} expandedSet={expanded} toggleExpand={toggleExpand} />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Moving to: <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{destLabel}</strong></span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={isSameLocation}
              onClick={() => { if (!isSameLocation) onMove(selected) }}
            >
              Move here
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
