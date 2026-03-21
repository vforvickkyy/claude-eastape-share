import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FilmSlate, Link, DotsThree, Check, CaretDown, CaretRight,
  SlidersHorizontal,
} from '@phosphor-icons/react'
import { projectMediaApi } from '../../../lib/api'
import ShotDetailPanel from '../ShotDetailPanel'
import MediaBrowserModal from '../MediaBrowserModal'

// ── Scene color palette (same as Cards view) ──────────────────────────
const SCENE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#f59e0b','#ef4444','#ec4899',
]

// ── Completion helpers (mirrors ShotCardsView) ────────────────────────
function pipelineCompletion(shot, stages) {
  if (!stages?.length) return null
  const numStages = stages.filter(s => !s.builtin_key)
  if (!numStages.length) return null
  const vals = numStages.map(s => {
    const v = shot.pipeline_stages?.[s.name]
    if (s.cell_type === 'percentage') return Number(v || 0)
    if (s.cell_type === 'checkbox')   return (v === true || v === 1 || v === 100) ? 100 : 0
    return 0
  })
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function groupCompletion(shots, stages) {
  if (!shots.length) return null
  const vals = shots.map(s => pipelineCompletion(s, stages)).filter(v => v !== null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function completionColor(pct) {
  if (pct == null) return '#404050'
  if (pct >= 80)   return '#10b981'
  if (pct >= 40)   return '#f59e0b'
  return '#404050'
}

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
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6b7280' }} />
            No status
          </button>
          {statuses.map(s => (
            <button key={s.id}
              onClick={e => { e.stopPropagation(); onUpdate(shot.id, s.id); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: shot.status_id === s.id ? s.color + '18' : 'none',
                border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer',
                color: shot.status_id === s.id ? s.color : '#d0d0f0', fontSize: 12,
              }}
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
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        background: 'none', border: 'none', borderRadius: 6, padding: '7px 12px',
        cursor: 'pointer', fontSize: 12, color: danger ? '#f87171' : '#d0d0f0', textAlign: 'left',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{label}</button>
  )

  return (
    <div ref={ref} style={{
      position: 'absolute', right: 0, top: 'calc(100% + 2px)', zIndex: 400,
      background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10,
      padding: 4, minWidth: 160, boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
    }}>
      {linkedId && item('▶  Open Video', onOpen)}
      {item('🔗  Link File', onLink)}
      {item('✏️  Edit Details', onEdit)}
      <div style={{ height: 1, background: '#2e2e4a', margin: '4px 0' }} />
      {item('🗑  Delete Shot', onDelete, true)}
    </div>
  )
}

// ── Column Visibility Panel ───────────────────────────────────────────
function ColPanel({ columns, hiddenCols, onToggle, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} style={{
      position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 500,
      background: '#13131f', border: '1px solid #2a2a3a', borderRadius: 12,
      padding: '12px 0', width: 220, boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
    }}>
      <div style={{ padding: '0 14px 10px', fontSize: 13, fontWeight: 600, color: '#e8e8ff' }}>Columns</div>

      <div style={{ padding: '0 14px 4px', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1 }}>Fixed</div>
      {['Thumbnail', 'Shot Name', 'Status'].map(name => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', opacity: 0.45 }}>
          <div style={{ width: 16, height: 16, borderRadius: 3, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Check size={10} weight="bold" style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: 12, color: '#d0d0f0' }}>{name}</span>
        </div>
      ))}

      {columns.length > 0 && (
        <>
          <div style={{ height: 1, background: '#2a2a3a', margin: '8px 0' }} />
          <div style={{ padding: '0 14px 4px', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1 }}>Custom</div>
          {columns.map(col => {
            const visible = !hiddenCols[col.id]
            return (
              <button key={col.id}
                onClick={() => onToggle(col.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                  background: visible ? '#6366f1' : 'transparent',
                  border: `2px solid ${visible ? '#6366f1' : 'rgba(255,255,255,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {visible && <Check size={10} weight="bold" style={{ color: '#fff' }} />}
                </div>
                <span style={{ fontSize: 12, color: '#d0d0f0', textAlign: 'left' }}>{col.name}</span>
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── Main ShotListView ─────────────────────────────────────────────────
export default function ShotListView({
  projectId, statuses, scenes, stages = [], columns = [], shots,
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload,
}) {
  const navigate    = useNavigate()
  const collapseKey = `ets_list_collapse_${projectId}`
  const widthKey    = `list-widths-${projectId}`
  const colVisKey   = `list-cols-${projectId}`

  const [localShots,   setLocalShots]   = useState(shots)
  const [mediaThumbs,  setMediaThumbs]  = useState({})
  const [collapsed,    setCollapsed]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(collapseKey)) || {} } catch { return {} }
  })
  const [colWidths,    setColWidths]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(widthKey)) || {} } catch { return {} }
  })
  const [hiddenCols,   setHiddenCols]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(colVisKey)) || {} } catch { return {} }
  })
  const [sort,         setSort]         = useState({ col: null, dir: 'asc' })
  const [selectedShot, setSelectedShot] = useState(null)
  const [linkingShot,  setLinkingShot]  = useState(null)
  const [actionMenu,   setActionMenu]   = useState(null)
  const [showColPanel, setShowColPanel] = useState(false)
  const [editingName,  setEditingName]  = useState(null)
  const [editNameVal,  setEditNameVal]  = useState('')

  // Keep local shots in sync with parent
  useEffect(() => { setLocalShots(shots) }, [shots])

  // Load thumbnails — same method as ShotCardsView
  useEffect(() => {
    projectMediaApi.list({ projectId })
      .then(d => {
        const map = {}
        for (const a of (d.assets || [])) { if (a.thumbnailUrl) map[a.id] = a.thumbnailUrl }
        setMediaThumbs(map)
      })
      .catch(() => {})
  }, [projectId])

  // ── State helpers ─────────────────────────────────────────────────
  function toggleCollapse(id) {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(collapseKey, JSON.stringify(next))
      return next
    })
  }

  function toggleColVisibility(colId) {
    setHiddenCols(prev => {
      const next = { ...prev, [colId]: !prev[colId] }
      localStorage.setItem(colVisKey, JSON.stringify(next))
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
      else if (sort.col === '#')      { av = a.shot_number || ''; bv = b.shot_number || '' }
      else                            { av = a.custom_data?.[sort.col] ?? ''; bv = b.custom_data?.[sort.col] ?? '' }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }

  // ── Column resize ─────────────────────────────────────────────────
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

  // ── Shot actions ──────────────────────────────────────────────────
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

  // ── Column widths ─────────────────────────────────────────────────
  const W = {
    thumb:  colWidths.thumb  || 56,
    num:    colWidths.num    || 64,
    title:  colWidths.title  || 220,
    status: colWidths.status || 140,
  }

  const visibleCols = columns.filter(c => !hiddenCols[c.id])
  const totalCols   = 4 + visibleCols.length + 1 // thumb+num+title+status+customs+actions

  // Group shots
  const groups = [
    ...scenes.map((scene, idx) => ({
      scene, color: SCENE_COLORS[idx % SCENE_COLORS.length],
      shots: localShots.filter(s => s.scene_id === scene.id),
    })),
  ]
  const ungrouped = localShots.filter(s => !s.scene_id)
  if (ungrouped.length > 0) groups.push({ scene: null, color: 'var(--t4)', shots: ungrouped })

  // ── Header cell component ─────────────────────────────────────────
  function Th({ label, sortKey, widthKey: wk, defaultW, noResize }) {
    const w      = colWidths[wk] || defaultW
    const active = sort.col === sortKey
    return (
      <th
        onClick={sortKey ? () => handleSort(sortKey) : undefined}
        style={{
          width: w, minWidth: w, maxWidth: w, position: 'relative',
          padding: '0 10px', textAlign: 'left', height: 40, verticalAlign: 'middle',
          fontSize: 11, color: active ? '#a5b4fc' : '#606070',
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
          cursor: sortKey ? 'pointer' : 'default', userSelect: 'none',
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}
      >
        {label}
        {active && <span style={{ marginLeft: 4, color: '#a5b4fc' }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
        {!noResize && (
          <div
            onMouseDown={e => onResizeDown(e, wk, defaultW)}
            style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 1 }}
          />
        )}
      </th>
    )
  }

  // ── Custom column cell renderer ───────────────────────────────────
  function CustomCell({ shot, col }) {
    const val = shot.custom_data?.[col.name]
    const w   = colWidths[col.id] || col.width || 150

    if (col.type === 'checkbox') {
      const checked = !!val
      return (
        <td style={{ width: w, minWidth: w, padding: '0 10px', verticalAlign: 'middle' }}
          onClick={e => { e.stopPropagation(); onShotUpdate(shot.id, { custom_data: { ...(shot.custom_data || {}), [col.name]: !checked } }) }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
            background: checked ? '#6366f1' : 'transparent',
            border: `2px solid ${checked ? '#6366f1' : 'rgba(255,255,255,0.2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {checked && <Check size={11} weight="bold" style={{ color: '#fff' }} />}
          </div>
        </td>
      )
    }

    if (col.type === 'date') {
      const display = val ? new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
      return (
        <td style={{ width: w, minWidth: w, padding: '0 10px', verticalAlign: 'middle', fontSize: 12, color: val ? '#d0d0f0' : 'var(--t4)' }}>
          {display}
        </td>
      )
    }

    if (col.type === 'select') {
      return (
        <td style={{ width: w, minWidth: w, padding: '0 6px', verticalAlign: 'middle' }}>
          {val
            ? <span style={{ fontSize: 11, color: '#d0d0f0', background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '2px 8px' }}>{val}</span>
            : <span style={{ color: 'var(--t4)', fontSize: 12 }}>—</span>}
        </td>
      )
    }

    // text / number fallback
    return (
      <td style={{ width: w, minWidth: w, padding: '0 10px', verticalAlign: 'middle', fontSize: 12, color: val != null ? '#d0d0f0' : 'var(--t4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {val != null ? String(val) : '—'}
      </td>
    )
  }

  return (
    <>
      {/* Top toolbar: Columns toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 16px 4px', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColPanel(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: showColPanel ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showColPanel ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: showColPanel ? '#a5b4fc' : 'var(--t3)',
              borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            }}
          >
            <SlidersHorizontal size={13} /> Columns
          </button>
          {showColPanel && (
            <ColPanel
              columns={columns}
              hiddenCols={hiddenCols}
              onToggle={toggleColVisibility}
              onClose={() => setShowColPanel(false)}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <table style={{
          borderCollapse: 'collapse', tableLayout: 'fixed',
          minWidth: W.thumb + W.num + W.title + W.status + visibleCols.reduce((a, c) => a + (colWidths[c.id] || c.width || 150), 0) + 48,
          width: '100%',
        }}>

          {/* Sticky header */}
          <thead>
            <tr style={{ background: '#0d0d15', borderBottom: '1px solid rgba(255,255,255,0.08)', height: 40, position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Thumb — no label */}
              <th style={{ width: W.thumb, minWidth: W.thumb, position: 'relative' }}>
                <div onMouseDown={e => onResizeDown(e, 'thumb', 56)}
                  style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 1 }} />
              </th>

              <Th label="#"         sortKey="#"      widthKey="num"    defaultW={64} />
              <Th label="Shot Name" sortKey="title"  widthKey="title"  defaultW={220} />
              <Th label="Status"    sortKey="status" widthKey="status" defaultW={140} />

              {visibleCols.map(col => {
                const w = colWidths[col.id] || col.width || 150
                const active = sort.col === col.name
                return (
                  <th key={col.id}
                    onClick={() => handleSort(col.name)}
                    style={{
                      width: w, minWidth: w, maxWidth: w, position: 'relative',
                      padding: '0 10px', textAlign: 'left', height: 40, verticalAlign: 'middle',
                      fontSize: 11, color: active ? '#a5b4fc' : '#606070',
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                  >
                    {col.name.toUpperCase()}
                    {active && <span style={{ marginLeft: 4, color: '#a5b4fc' }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                    <div onMouseDown={e => onResizeDown(e, col.id, 150)}
                      style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 1 }} />
                  </th>
                )
              })}

              {/* Actions */}
              <th style={{ width: 48, minWidth: 48 }} />
            </tr>
          </thead>

          <tbody>
            {groups.map(({ scene, color, shots: groupShots }) => {
              const groupId     = scene?.id || '__ungrouped__'
              const isCollapsed = !!collapsed[groupId]
              const sorted      = sortShots(groupShots)
              const pct         = groupCompletion(groupShots, stages)

              return (
                <React.Fragment key={groupId}>
                  {/* Scene header row */}
                  <tr
                    onClick={() => toggleCollapse(groupId)}
                    style={{
                      height: 40, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.025)',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                  >
                    <td colSpan={totalCols} style={{ padding: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 40 }}>
                        {/* Left: toggle + color dot + name + count */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--t4)', display: 'flex', flexShrink: 0 }}>
                            {isCollapsed
                              ? <CaretRight size={14} weight="bold" />
                              : <CaretDown  size={14} weight="bold" />}
                          </span>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8ff', userSelect: 'none' }}>
                            {scene ? scene.name : 'Ungrouped'}
                          </span>
                          <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '2px 8px', fontSize: 11, color: 'var(--t4)' }}>
                            {groupShots.length} shot{groupShots.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Right: progress + add shot */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
                          {pct !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: completionColor(pct) }}>{pct}%</span>
                              <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: completionColor(pct), borderRadius: 2, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          )}
                          {scene && (
                            <button
                              onClick={() => onShotCreate({ title: 'New Shot', scene_id: scene.id, position: groupShots.length })}
                              style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 12, cursor: 'pointer', padding: '2px 6px', borderRadius: 5 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                              + Add Shot
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Shot rows */}
                  {!isCollapsed && sorted.map((shot, rowIdx) => {
                    const thumbUrl = mediaThumbs[shot.thumbnail_media_id] || null
                    const linkedId = shot.linked_media_id || shot.thumbnail_media_id
                    const isEditing = editingName === shot.id

                    return (
                      <tr
                        key={shot.id}
                        onClick={() => setSelectedShot(shot)}
                        style={{
                          height: 52, cursor: 'pointer',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: rowIdx % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent',
                          transition: 'background 150ms ease',
                        }}
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
                        <td
                          style={{ width: W.thumb, minWidth: W.thumb, padding: '6px 8px', verticalAlign: 'middle' }}
                          onClick={e => { if (linkedId) { e.stopPropagation(); navigate(`/projects/${projectId}/media/${linkedId}`, { state: { from: 'manage' } }) } }}
                        >
                          <div style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', cursor: linkedId ? 'pointer' : 'default', flexShrink: 0 }}>
                            {thumbUrl
                              ? <img src={thumbUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                              : <div style={{ width: 40, height: 40, background: '#1a1a24', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <FilmSlate size={16} weight="duotone" style={{ color: '#404050' }} />
                                </div>
                            }
                          </div>
                        </td>

                        {/* Shot number */}
                        <td style={{ width: W.num, minWidth: W.num, padding: '0 10px', verticalAlign: 'middle' }}>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#505060' }}>
                            {shot.shot_number ? `#${shot.shot_number}` : '—'}
                          </span>
                        </td>

                        {/* Shot name — click to inline edit */}
                        <td
                          style={{ width: W.title, minWidth: W.title, padding: '0 10px', verticalAlign: 'middle', overflow: 'hidden' }}
                          onClick={e => { e.stopPropagation(); if (!isEditing) { setEditingName(shot.id); setEditNameVal(shot.title) } }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus value={editNameVal}
                              onChange={e => setEditNameVal(e.target.value)}
                              onBlur={() => handleNameEdit(shot)}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  handleNameEdit(shot)
                                if (e.key === 'Escape') setEditingName(null)
                              }}
                              onClick={e => e.stopPropagation()}
                              style={{
                                width: '100%', background: 'rgba(255,255,255,0.08)',
                                border: '1px solid #6366f1', borderRadius: 5,
                                color: '#e8e8ff', fontSize: 13, padding: '3px 8px', outline: 'none',
                              }}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                              {linkedId && <Link size={12} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                              <span style={{ fontSize: 13, color: '#e8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {shot.title}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td
                          style={{ width: W.status, minWidth: W.status, padding: '0 10px', verticalAlign: 'middle' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <StatusPill shot={shot} statuses={statuses} onUpdate={handleStatusUpdate} />
                        </td>

                        {/* Custom columns */}
                        {visibleCols.map(col => <CustomCell key={col.id} shot={shot} col={col} />)}

                        {/* Actions */}
                        <td
                          style={{ width: 48, minWidth: 48, padding: '0 4px', verticalAlign: 'middle', position: 'relative' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                            <button
                              className="shot-action-btn"
                              onClick={e => { e.stopPropagation(); setActionMenu(actionMenu === shot.id ? null : shot.id) }}
                              style={{
                                background: 'none', border: 'none', color: 'var(--t4)',
                                cursor: 'pointer', padding: 4, borderRadius: 5, display: 'flex',
                                opacity: 0, transition: 'opacity 0.15s',
                              }}
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
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add scene */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={() => { const name = window.prompt('Scene name:'); if (name?.trim()) onSceneCreate(name.trim()) }}
          style={{
            background: 'none', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 7,
            color: 'var(--t4)', fontSize: 12, padding: '6px 14px', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#a5b4fc' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'var(--t4)' }}
        >
          + Add Scene
        </button>
      </div>

      {/* Shot detail panel */}
      {selectedShot && (
        <ShotDetailPanel
          shotId={selectedShot.id}
          statuses={statuses}
          scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={u => { onShotUpdate(u.id, u); setSelectedShot(u) }}
          onDelete={id => { onShotDelete(id); setSelectedShot(null) }}
        />
      )}

      {/* Media browser for linking */}
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
