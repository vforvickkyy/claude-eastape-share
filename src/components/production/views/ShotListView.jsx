import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FilmSlate, Link as LinkIcon, DotsThree, Check, CaretDown, CaretRight, Plus,
} from '@phosphor-icons/react'
import { projectMediaApi } from '../../../lib/api'
import ShotDetailPanel from '../ShotDetailPanel'
import MediaBrowserModal from '../MediaBrowserModal'

const SCENE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#f59e0b','#ef4444','#ec4899',
]

const COL_COLORS = [
  '#8b5cf6','#06b6d4','#10b981','#f59e0b',
  '#ef4444','#ec4899','#3b82f6','#84cc16',
]

// ── Status Pill ───────────────────────────────────────────────────────
function StatusPill({ shot, statuses, onUpdate }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const cur = statuses.find(s => s.id === shot.status_id)

  useEffect(() => {
    if (!open) return
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: cur ? cur.color + '22' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${cur ? cur.color + '55' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
          color: cur ? cur.color : 'var(--t4)', fontSize: 11, fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {cur && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cur.color, flexShrink: 0 }} />}
        {cur ? cur.name : '—'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300,
          background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10,
          minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: 4,
        }}>
          <button
            onClick={e => { e.stopPropagation(); onUpdate(shot.id, null); setOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6b7280' }} /> No status
          </button>
          {statuses.map(s => (
            <button key={s.id}
              onClick={e => { e.stopPropagation(); onUpdate(shot.id, s.id); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: shot.status_id === s.id ? s.color + '18' : 'none', border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', color: shot.status_id === s.id ? s.color : '#d0d0f0', fontSize: 12 }}
              onMouseEnter={e => { if (shot.status_id !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (shot.status_id !== s.id) e.currentTarget.style.background = 'none' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{s.name}</span>
              {shot.status_id === s.id && <Check size={11} style={{ color: s.color }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Actions Menu ──────────────────────────────────────────────────────
function ActionsMenu({ shot, linkedId, onOpen, onLink, onEdit, onDelete, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const item = (label, onClick, danger = false) => (
    <button
      onClick={e => { e.stopPropagation(); onClick(); onClose() }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: danger ? '#f87171' : '#d0d0f0', textAlign: 'left' }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{label}</button>
  )
  return (
    <div ref={ref} style={{ position: 'absolute', right: 0, top: 'calc(100% + 2px)', zIndex: 400, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}>
      {linkedId && item('▶  Open Video', onOpen)}
      {item('🔗  Link File', onLink)}
      {item('✏️  Edit Details', onEdit)}
      <div style={{ height: 1, background: '#2e2e4a', margin: '4px 0' }} />
      {item('🗑  Delete Shot', onDelete, true)}
    </div>
  )
}

// ── Column header with resize ─────────────────────────────────────────
function ColHeader({ label, color, width, widthKey, sortKey, sort, onSort, onResizeDown, stat, noResize }) {
  const [hoverResize, setHoverResize] = useState(false)
  const isSort = sort?.col === sortKey
  return (
    <th
      onClick={sortKey ? () => onSort(sortKey) : undefined}
      style={{
        width, minWidth: width, maxWidth: width, position: 'relative',
        background: color + '14', borderLeft: '1px solid rgba(255,255,255,0.05)',
        padding: 0, userSelect: 'none', cursor: sortKey ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 6px', overflow: 'hidden' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#c8c8e8', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
            {isSort && <span style={{ marginLeft: 4, color }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          {stat && <div style={{ fontSize: 10, color, marginTop: 1, fontWeight: 500 }}>{stat}</div>}
        </div>
      </div>
      {!noResize && (
        <div
          onMouseDown={e => onResizeDown(e, widthKey, width)}
          onMouseEnter={() => setHoverResize(true)}
          onMouseLeave={() => setHoverResize(false)}
          style={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 10, background: hoverResize ? color + '99' : 'transparent', transition: 'background 0.15s' }}
        />
      )}
    </th>
  )
}

// ── Custom column cell renderer ───────────────────────────────────────
function CustomCell({ shot, col, colWidths, onShotUpdate }) {
  const val = shot.custom_data?.[col.name]
  const w   = colWidths[col.id] || col.width || 150

  if (col.type === 'checkbox') {
    const checked = !!val
    return (
      <td style={{ width: w, minWidth: w, padding: '0 10px', verticalAlign: 'middle', textAlign: 'center' }}
        onClick={e => { e.stopPropagation(); onShotUpdate(shot.id, { custom_data: { ...(shot.custom_data || {}), [col.name]: !checked } }) }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, cursor: 'pointer', background: checked ? '#6366f1' : 'transparent', border: `2px solid ${checked ? '#6366f1' : 'rgba(255,255,255,0.2)'}`, transition: 'all 0.15s' }}>
          {checked && <Check size={12} weight="bold" style={{ color: '#fff' }} />}
        </div>
      </td>
    )
  }
  if (col.type === 'date') {
    const display = val ? new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
    return <td style={{ width: w, minWidth: w, padding: '0 10px', verticalAlign: 'middle', fontSize: 12, color: val ? '#d0d0f0' : 'var(--t4)' }}>{display}</td>
  }
  if (col.type === 'select') {
    return (
      <td style={{ width: w, minWidth: w, padding: '0 8px', verticalAlign: 'middle' }}>
        {val
          ? <span style={{ fontSize: 11, color: '#d0d0f0', background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '2px 8px' }}>{val}</span>
          : <span style={{ color: 'var(--t4)', fontSize: 12 }}>—</span>}
      </td>
    )
  }
  return (
    <td style={{ width: w, minWidth: w, padding: '0 10px', verticalAlign: 'middle', fontSize: 12, color: val != null ? '#d0d0f0' : 'var(--t4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {val != null ? String(val) : '—'}
    </td>
  )
}

// ── Custom column stat (for header) ──────────────────────────────────
function colStat(col, shots) {
  if (col.type === 'checkbox') {
    const done = shots.filter(s => !!s.custom_data?.[col.name]).length
    return `${done}/${shots.length}`
  }
  if (col.type === 'number') {
    const vals = shots.map(s => Number(s.custom_data?.[col.name] || 0))
    const avg  = vals.reduce((a, b) => a + b, 0) / Math.max(shots.length, 1)
    return `avg ${Math.round(avg)}`
  }
  return null
}

// ── Inline add-shot row ───────────────────────────────────────────────
function AddShotRow({ colCount, sceneId, onShotCreate }) {
  const [active, setActive] = useState(false)
  const [val, setVal]       = useState('')
  const inputRef = useRef()

  function activate() {
    setActive(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function commit(e) {
    e?.preventDefault()
    const title = val.trim()
    setActive(false)
    setVal('')
    if (title) {
      try { await onShotCreate({ title, scene_id: sceneId || null }) } catch {}
    }
  }

  if (!active) {
    return (
      <tr>
        <td colSpan={colCount} style={{ padding: '6px 16px' }}>
          <button
            onClick={activate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--t4)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#a5b4fc' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--t4)' }}
          >
            <Plus size={12} weight="bold" /> Add Shot
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid rgba(99,102,241,0.2)' }}>
      <td colSpan={colCount} style={{ padding: '8px 16px' }}>
        <form onSubmit={commit} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') { setActive(false); setVal('') } }}
            placeholder="Shot name…"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid #6366f1',
              borderRadius: 6, color: '#e8e8ff', fontSize: 13, padding: '5px 10px', outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--t4)' }}>↵ to add</span>
        </form>
      </td>
    </tr>
  )
}

// ── Main ShotListView ─────────────────────────────────────────────────
export default function ShotListView({
  projectId, statuses, scenes, columns = [], shots,
  filterSceneId = null,
  hiddenCols = {},
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload, onManageColumns,
}) {
  const canEdit   = !!onShotCreate
  const canDelete = !!onShotDelete
  const navigate    = useNavigate()
  const collapseKey = `ets_list_collapse_${projectId}`
  const widthKey    = `list-widths-${projectId}`

  const [localShots,   setLocalShots]   = useState(shots)
  const [mediaThumbs,  setMediaThumbs]  = useState({})
  const [collapsed,    setCollapsed]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(collapseKey)) || {} } catch { return {} }
  })
  const [colWidths,    setColWidths]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(widthKey)) || {} } catch { return {} }
  })
  const [sort,         setSort]         = useState({ col: null, dir: 'asc' })
  const [selectedShot, setSelectedShot] = useState(null)
  const [linkingShot,  setLinkingShot]  = useState(null)
  const [actionMenu,   setActionMenu]   = useState(null)
  const [editingName,  setEditingName]  = useState(null)
  const [editNameVal,  setEditNameVal]  = useState('')

  useEffect(() => { setLocalShots(shots) }, [shots])

  useEffect(() => {
    projectMediaApi.list({ projectId })
      .then(d => {
        const map = {}
        for (const a of (d.assets || [])) { if (a.thumbnailUrl) map[a.id] = a.thumbnailUrl }
        setMediaThumbs(map)
      })
      .catch(() => {})
  }, [projectId])

  function toggleCollapse(id) {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(collapseKey, JSON.stringify(next))
      return next
    })
  }

  function handleSort(col) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' }
    )
  }

  function sortShots(arr) {
    if (!sort.col) return arr
    return [...arr].sort((a, b) => {
      let av, bv
      if (sort.col === 'title')       { av = (a.title || '').toLowerCase(); bv = (b.title || '').toLowerCase() }
      else if (sort.col === 'status') { av = statuses.findIndex(s => s.id === a.status_id); bv = statuses.findIndex(s => s.id === b.status_id); if (av < 0) av = 999; if (bv < 0) bv = 999 }
      else                            { av = a.custom_data?.[sort.col] ?? ''; bv = b.custom_data?.[sort.col] ?? '' }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }

  function onResizeDown(e, key, defaultW) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startW = colWidths[key] || defaultW
    function onMove(e2) {
      setColWidths(prev => ({ ...prev, [key]: Math.max(60, startW + e2.clientX - startX) }))
    }
    function onUp(e2) {
      setColWidths(prev => {
        const next = { ...prev, [key]: Math.max(60, startW + e2.clientX - startX) }
        localStorage.setItem(widthKey, JSON.stringify(next))
        return next
      })
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function handleStatusUpdate(shotId, statusId) {
    setLocalShots(prev => prev.map(s => s.id === shotId ? { ...s, status_id: statusId } : s))
    try { await onShotUpdate(shotId, { status_id: statusId }) }
    catch { setLocalShots(shots) }
  }

  async function handleNameEdit(shot) {
    const name = editNameVal.trim()
    setEditingName(null)
    if (!name || name === shot.title) return
    setLocalShots(prev => prev.map(s => s.id === shot.id ? { ...s, title: name } : s))
    try { await onShotUpdate(shot.id, { title: name }) }
    catch { setLocalShots(shots) }
  }

  async function handleDelete(shot) {
    if (!window.confirm(`Delete shot "${shot.title}"?`)) return
    setLocalShots(prev => prev.filter(s => s.id !== shot.id))
    try { await onShotDelete(shot.id) }
    catch { setLocalShots(shots) }
  }

  function handleMediaLinked(data) {
    setLocalShots(prev => prev.map(s =>
      s.id === data.shotId
        ? { ...s, thumbnail_media_id: data.mediaId, linked_media_id: data.mediaId, linked_media_name: data.mediaName }
        : s
    ))
  }

  // ── Widths ─────────────────────────────────────────────────────────
  const W = {
    thumb:  colWidths.thumb  || 100,
    title:  colWidths.title  || 220,
    status: colWidths.status || 150,
  }

  const thumbImgW = Math.max(W.thumb - 16, 44)
  const thumbImgH = Math.min(thumbImgW * 0.6, 68)
  const rowH = Math.max(thumbImgH + 16, 64)

  const showThumb  = !hiddenCols['thumbnail']
  const showTitle  = !hiddenCols['title']
  const showStatus = !hiddenCols['status']
  const visibleCols = columns.filter(c => !hiddenCols[c.id])

  const colCount = (showThumb ? 1 : 0) + (showTitle ? 1 : 0) + (showStatus ? 1 : 0) + visibleCols.length + 1 + 1

  // ── Groups ─────────────────────────────────────────────────────────
  // When a specific scene is selected via sidebar, show flat list (no grouping)
  const flatMode = !!filterSceneId

  const groups = flatMode
    ? null
    : (() => {
        const g = scenes.map((scene, idx) => ({
          scene, color: SCENE_COLORS[idx % SCENE_COLORS.length],
          shots: localShots.filter(s => s.scene_id === scene.id),
        }))
        const ungrouped = localShots.filter(s => !s.scene_id)
        if (ungrouped.length > 0) g.push({ scene: null, color: 'var(--t4)', shots: ungrouped })
        return g
      })()

  const flatShots = flatMode ? localShots : null
  const activeScene = filterSceneId ? scenes.find(s => s.id === filterSceneId) : null

  // ── Empty state ────────────────────────────────────────────────────
  const allEmpty = localShots.length === 0
  if (allEmpty && !canEdit) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
        <FilmSlate size={48} weight="duotone" style={{ color: 'var(--t4)', opacity: 0.3, marginBottom: 16 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>No shots yet</div>
        <div style={{ fontSize: 13, color: 'var(--t4)' }}>
          {filterSceneId ? 'This scene has no shots.' : 'No shots have been added to this project.'}
        </div>
      </div>
    )
  }

  // ── Shot row renderer ──────────────────────────────────────────────
  function renderShotRow(shot, rowIdx) {
    const thumbUrl = mediaThumbs[shot.thumbnail_media_id] || null
    const linkedId = shot.linked_media_id || shot.thumbnail_media_id
    const isEditing = editingName === shot.id

    return (
      <tr
        key={shot.id}
        onClick={() => setSelectedShot(shot)}
        style={{ height: rowH, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowIdx % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent', transition: 'background 150ms' }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
          const btn = e.currentTarget.querySelector('.shot-action-btn')
          if (btn) btn.style.opacity = '1'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = rowIdx % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent'
          const btn = e.currentTarget.querySelector('.shot-action-btn')
          if (btn) btn.style.opacity = '0'
        }}
      >
        {/* Thumbnail */}
        {showThumb && (
          <td
            style={{ width: W.thumb, minWidth: W.thumb, padding: '6px 8px', verticalAlign: 'middle' }}
            onClick={e => { if (linkedId) { e.stopPropagation(); navigate(`/projects/${projectId}/media/${linkedId}`, { state: { from: 'manage' } }) } }}
          >
            <div style={{ width: thumbImgW, height: thumbImgH, borderRadius: 7, overflow: 'hidden', cursor: linkedId ? 'pointer' : 'default' }}>
              {thumbUrl
                ? <img src={thumbUrl} alt="" style={{ width: thumbImgW, height: thumbImgH, objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                : <div style={{ width: thumbImgW, height: thumbImgH, background: '#1a1a24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FilmSlate size={Math.round(thumbImgH * 0.35)} weight="duotone" style={{ color: '#404050' }} />
                  </div>
              }
            </div>
          </td>
        )}

        {/* Shot Name */}
        {showTitle && (
          <td
            style={{ width: colWidths.title || W.title, minWidth: colWidths.title || W.title, padding: '0 10px', verticalAlign: 'middle', overflow: 'hidden' }}
            onClick={e => { e.stopPropagation(); if (!isEditing) { setEditingName(shot.id); setEditNameVal(shot.title) } }}
          >
            {isEditing ? (
              <input
                autoFocus value={editNameVal}
                onChange={e => setEditNameVal(e.target.value)}
                onBlur={() => handleNameEdit(shot)}
                onKeyDown={e => { if (e.key === 'Enter') handleNameEdit(shot); if (e.key === 'Escape') setEditingName(null) }}
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid #6366f1', borderRadius: 5, color: '#e8e8ff', fontSize: 13, padding: '3px 8px', outline: 'none' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                {shot.shot_number && (
                  <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>#{shot.shot_number}</span>
                )}
                {linkedId && <LinkIcon size={12} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                <span style={{ fontSize: 13, color: '#e8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shot.title}
                </span>
              </div>
            )}
          </td>
        )}

        {/* Status */}
        {showStatus && (
          <td
            style={{ width: colWidths.status || W.status, minWidth: colWidths.status || W.status, padding: '0 10px', verticalAlign: 'middle' }}
            onClick={e => e.stopPropagation()}
          >
            <StatusPill shot={shot} statuses={statuses} onUpdate={handleStatusUpdate} />
          </td>
        )}

        {/* Custom columns */}
        {visibleCols.map(col => (
          <CustomCell key={col.id} shot={shot} col={col} colWidths={colWidths} onShotUpdate={onShotUpdate} />
        ))}

        <td style={{ width: 40 }} />

        {/* Actions */}
        <td
          style={{ width: 48, minWidth: 48, padding: '0 4px', verticalAlign: 'middle', position: 'relative' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <button
              className="shot-action-btn"
              onClick={e => { e.stopPropagation(); setActionMenu(actionMenu === shot.id ? null : shot.id) }}
              style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4, borderRadius: 5, display: 'flex', opacity: 0, transition: 'opacity 0.15s' }}
            >
              <DotsThree size={16} weight="bold" />
            </button>
            {actionMenu === shot.id && (
              <ActionsMenu
                shot={shot}
                linkedId={linkedId}
                onOpen={() => navigate(`/projects/${projectId}/media/${linkedId}`, { state: { from: 'manage' } })}
                onLink={() => { setLinkingShot(shot); setActionMenu(null) }}
                onEdit={() => { setSelectedShot(shot); setActionMenu(null) }}
                onDelete={() => handleDelete(shot)}
                onClose={() => setActionMenu(null)}
              />
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <>
      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>

          {/* Sticky header */}
          <thead>
            <tr style={{ background: '#0d0d15', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>

              {showThumb && (
                <th style={{ width: W.thumb, minWidth: W.thumb, maxWidth: W.thumb, position: 'relative', padding: 0 }}>
                  <div onMouseDown={e => onResizeDown(e, 'thumb', 100)}
                    style={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 1 }} />
                </th>
              )}

              {showTitle && (
                <ColHeader
                  label="Shot Name" color="#6366f1" sortKey="title"
                  width={colWidths.title || W.title} widthKey="title"
                  sort={sort} onSort={handleSort} onResizeDown={onResizeDown}
                />
              )}

              {showStatus && (
                <ColHeader
                  label="Status" color="#10b981" sortKey="status"
                  width={colWidths.status || W.status} widthKey="status"
                  sort={sort} onSort={handleSort} onResizeDown={onResizeDown}
                />
              )}

              {visibleCols.map((col, idx) => (
                <ColHeader
                  key={col.id}
                  label={col.name}
                  color={COL_COLORS[idx % COL_COLORS.length]}
                  sortKey={col.name}
                  width={colWidths[col.id] || col.width || 150}
                  widthKey={col.id}
                  sort={sort} onSort={handleSort} onResizeDown={onResizeDown}
                  stat={colStat(col, localShots)}
                />
              ))}

              <th style={{ width: 40, padding: 0, background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                  onClick={onManageColumns}
                  title="Manage columns"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, margin: '6px auto 0', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, cursor: 'pointer', color: 'var(--t4)' }}
                >
                  <Plus size={13} />
                </button>
              </th>

              <th style={{ width: 48, minWidth: 48 }} />
            </tr>
          </thead>

          <tbody>
            {flatMode ? (
              /* ── Flat mode: single scene selected from sidebar ── */
              <>
                {localShots.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} style={{ padding: '48px 24px', textAlign: 'center' }}>
                      <FilmSlate size={36} weight="duotone" style={{ color: 'var(--t4)', opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                      <div style={{ fontSize: 14, color: 'var(--t3)', marginBottom: 4 }}>No shots in this scene</div>
                      {canEdit && <div style={{ fontSize: 12, color: 'var(--t4)' }}>Use "Add Shot" below to get started</div>}
                    </td>
                  </tr>
                ) : (
                  sortShots(localShots).map((shot, idx) => renderShotRow(shot, idx))
                )}
                {canEdit && (
                  <AddShotRow colCount={colCount} sceneId={filterSceneId} onShotCreate={onShotCreate} />
                )}
              </>
            ) : (
              /* ── Grouped mode: all shots grouped by scene ── */
              groups.map(({ scene, color, shots: groupShots }) => {
                const groupId     = scene?.id || '__ungrouped__'
                const isCollapsed = !!collapsed[groupId]
                const sorted      = sortShots(groupShots)

                return (
                  <React.Fragment key={groupId}>
                    {/* Scene group header row */}
                    <tr
                      onClick={() => toggleCollapse(groupId)}
                      style={{ height: 40, cursor: 'pointer', background: 'rgba(255,255,255,0.025)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                    >
                      <td colSpan={colCount} style={{ padding: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 40 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--t4)', display: 'flex', flexShrink: 0 }}>
                              {isCollapsed ? <CaretRight size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
                            </span>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ff', userSelect: 'none' }}>
                              {scene ? scene.name : 'Ungrouped'}
                            </span>
                            <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '2px 8px', fontSize: 11, color: 'var(--t4)' }}>
                              {groupShots.length} shot{groupShots.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {scene && canEdit && (
                            <div onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => onShotCreate({ title: 'New Shot', scene_id: scene.id, position: groupShots.length })}
                                style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 12, cursor: 'pointer', padding: '2px 6px', borderRadius: 5 }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                              >
                                + Add Shot
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Shot rows */}
                    {!isCollapsed && sorted.map((shot, rowIdx) => renderShotRow(shot, rowIdx))}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedShot && (
        <ShotDetailPanel
          shotId={selectedShot.id} statuses={statuses} scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={canEdit   ? u => { onShotUpdate(u.id, u); setSelectedShot(u) } : null}
          onDelete={canDelete ? id => { onShotDelete(id); setSelectedShot(null) } : null}
        />
      )}

      {linkingShot && (
        <MediaBrowserModal
          projectId={projectId}
          shotId={linkingShot.id}
          shotName={linkingShot.title}
          currentLinkedMediaId={linkingShot.linked_media_id || linkingShot.thumbnail_media_id || null}
          onLinked={handleMediaLinked}
          onClose={() => setLinkingShot(null)}
        />
      )}
    </>
  )
}
