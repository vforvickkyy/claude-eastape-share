import React, { useState, useRef, useEffect } from 'react'
import { CheckCircle, Check, MagnifyingGlass, Plus, X as XIcon } from '@phosphor-icons/react'
import { productionApi } from '../../../lib/api'
import ShotDetailPanel from '../ShotDetailPanel'

// ─── shared inline dropdown wrapper ──────────────────────────────────
function useClickOutside(ref, close) {
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) close() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
}

// ── Percentage Cell ───────────────────────────────────────────────────
function PercentageCell({ shot, stage, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const [val,  setVal]  = useState(shot.pipeline_stages?.[stage.name] ?? 0)
  const ref = useRef()
  useEffect(() => { setVal(shot.pipeline_stages?.[stage.name] ?? 0) }, [shot.pipeline_stages, stage.name])
  useClickOutside(ref, () => setOpen(false))

  async function save() { await onUpdate(shot.id, stage.name, Number(val)); setOpen(false) }
  const pct = Number(shot.pipeline_stages?.[stage.name] ?? 0)
  const color = stage.color || '#6366f1'

  return (
    <td style={{ width, minWidth: width, padding: 0, position: 'relative', verticalAlign: 'middle' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: '100%', padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer', minHeight: 40 }}
      >
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.2s' }} />
        </div>
        <span style={{ fontSize: 11, color: pct >= 100 ? '#22c55e' : 'var(--t3)', flexShrink: 0, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
        {pct >= 100 && <CheckCircle size={12} weight="fill" style={{ color: '#22c55e', flexShrink: 0 }} />}
      </button>

      {open && (
        <div ref={ref} style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 200,
          background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10,
          padding: 14, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 10, fontWeight: 600 }}>{stage.name}</div>
          <input
            type="range" min={0} max={100} step={5} value={val}
            onChange={e => setVal(e.target.value)}
            style={{ width: '100%', accentColor: color }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 13, color: '#e8e8ff', fontWeight: 600 }}>{val}%</span>
            <button onClick={save} style={{ background: color, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
              Save
            </button>
          </div>
        </div>
      )}
    </td>
  )
}

// ── Checkbox Cell ─────────────────────────────────────────────────────
function CheckboxCell({ shot, stage, onUpdate, width }) {
  const [hover, setHover] = useState(false)
  const val    = shot.pipeline_stages?.[stage.name]
  const isDone = val === true || val === 1 || val === 100
  const color  = stage.color || '#10b981'

  return (
    <td
      style={{ width, minWidth: width, textAlign: 'center', verticalAlign: 'middle', padding: 0, background: isDone ? color + '18' : hover ? 'rgba(255,255,255,0.03)' : undefined, cursor: 'pointer', transition: 'background 0.15s' }}
      onClick={() => onUpdate(shot.id, stage.name, !isDone)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 6,
        background: isDone ? color : 'transparent',
        border: `2px solid ${isDone ? color : hover ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)'}`,
        transition: 'all 0.15s',
        boxShadow: isDone ? `0 0 8px ${color}55` : 'none',
      }}>
        {isDone && <Check size={13} weight="bold" style={{ color: '#fff' }} />}
      </div>
    </td>
  )
}

// ── Status Cell ───────────────────────────────────────────────────────
function StatusCell({ shot, stage, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const ref   = useRef()
  const opts  = Array.isArray(stage.status_options) ? stage.status_options : []
  const cur   = shot.pipeline_stages?.[stage.name] || null
  const curOpt = opts.find(o => o.label === cur) || null
  useClickOutside(ref, () => setOpen(false))

  async function pick(label) { await onUpdate(shot.id, stage.name, label); setOpen(false) }

  return (
    <td style={{ width, minWidth: width, padding: '0 6px', verticalAlign: 'middle', position: 'relative' }}>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: curOpt ? curOpt.color + '22' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${curOpt ? curOpt.color + '55' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
          color: curOpt ? curOpt.color : 'var(--t4)', fontSize: 12, fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}
      >
        {curOpt ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: curOpt.color, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{curOpt.label}</span>
          </>
        ) : (
          <span style={{ marginLeft: 4 }}>—</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div ref={ref} style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 6, zIndex: 300,
          background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10,
          minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', overflow: 'hidden',
          padding: 4,
        }}>
          {opts.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--t4)' }}>No options configured</div>
          )}
          {opts.map(opt => (
            <button
              key={opt.label}
              onClick={() => pick(opt.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: cur === opt.label ? opt.color + '18' : 'none',
                border: 'none', borderRadius: 7, padding: '8px 10px', cursor: 'pointer',
                color: cur === opt.label ? opt.color : '#d0d0f0', fontSize: 13,
                textAlign: 'left', transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (cur !== opt.label) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (cur !== opt.label) e.currentTarget.style.background = 'none' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{opt.label}</span>
              {cur === opt.label && <Check size={12} style={{ color: opt.color, flexShrink: 0 }} />}
            </button>
          ))}
          {cur && (
            <>
              <div style={{ height: 1, background: '#2e2e4a', margin: '4px 0' }} />
              <button
                onClick={() => pick(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  background: 'none', border: 'none', borderRadius: 7, padding: '7px 10px',
                  cursor: 'pointer', color: 'var(--t4)', fontSize: 12,
                }}
              >
                <XIcon size={11} /> Clear
              </button>
            </>
          )}
        </div>
      )}
    </td>
  )
}

function StageCell({ shot, stage, onUpdate, width }) {
  const type = stage.cell_type || 'checkbox'
  if (type === 'percentage') return <PercentageCell shot={shot} stage={stage} onUpdate={onUpdate} width={width} />
  if (type === 'status')     return <StatusCell     shot={shot} stage={stage} onUpdate={onUpdate} width={width} />
  return <CheckboxCell shot={shot} stage={stage} onUpdate={onUpdate} width={width} />
}

// ── Column aggregate stat ─────────────────────────────────────────────
function stageStat(stage, shots) {
  const type = stage.cell_type || 'checkbox'
  const vals = shots.map(s => s.pipeline_stages?.[stage.name])
  if (type === 'checkbox') {
    const done = vals.filter(v => v === true || v === 1 || v === 100).length
    return `${done}/${shots.length}`
  }
  if (type === 'percentage') {
    const sum = vals.reduce((a, v) => a + Number(v || 0), 0)
    return `${Math.round(sum / Math.max(shots.length, 1))}% avg`
  }
  return null
}

// ── Stage column header ───────────────────────────────────────────────
function StageHeader({ stage, shots, widths, onWidthChange, onWidthSave, onContextMenu, onRename }) {
  const [hoverResize, setHoverResize] = useState(false)
  const [renaming,    setRenaming]    = useState(false)
  const [draftName,   setDraftName]   = useState(stage.name)
  const startX     = useRef(null)
  const startWidth = useRef(null)
  const w          = widths[stage.id] || stage.width || 120
  const color      = stage.color || '#6366f1'
  const stat       = stageStat(stage, shots)

  function onResizeDown(e) {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    startWidth.current = w
    function onMove(e2) {
      const next = Math.min(300, Math.max(80, startWidth.current + e2.clientX - startX.current))
      onWidthChange(stage.id, next)
    }
    function onUp(e2) {
      const next = Math.min(300, Math.max(80, startWidth.current + e2.clientX - startX.current))
      onWidthSave(stage.id, next)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function commitRename() {
    if (draftName.trim() && draftName.trim() !== stage.name) {
      await productionApi.updatePipelineStage(stage.id, { name: draftName.trim() })
      onRename(stage.id, draftName.trim())
    }
    setRenaming(false)
  }

  return (
    <th
      style={{
        width: w, minWidth: w, maxWidth: w, position: 'relative',
        background: color + '14', padding: 0, userSelect: 'none',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
      }}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, stage, () => setRenaming(true)) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 6px', overflow: 'hidden' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {renaming ? (
          <input
            autoFocus value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: `1px solid ${color}`, borderRadius: 4, color: '#e8e8ff', fontSize: 11, padding: '2px 6px', outline: 'none' }}
          />
        ) : (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#c8c8e8', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stage.name}
            </div>
            {stat && (
              <div style={{ fontSize: 10, color: color, marginTop: 1, fontWeight: 500 }}>{stat}</div>
            )}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeDown}
        onMouseEnter={() => setHoverResize(true)}
        onMouseLeave={() => setHoverResize(false)}
        style={{
          position: 'absolute', top: 0, right: 0, width: 6, height: '100%',
          cursor: 'col-resize', zIndex: 10,
          background: hoverResize ? color + '99' : 'transparent',
          transition: 'background 0.15s',
        }}
        title="Drag to resize"
      />
    </th>
  )
}

// ── Context Menu ─────────────────────────────────────────────────────
function ContextMenu({ x, y, stage, onHide, onRename, onDelete, onClose }) {
  const ref = useRef()
  useClickOutside(ref, onClose)

  const item = (label, onClick, danger) => (
    <button
      onClick={() => { onClick(); onClose() }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', background: 'none',
        border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 13,
        color: danger ? '#f87171' : '#d0d0f0', borderRadius: 6,
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{label}</button>
  )

  return (
    <div ref={ref} style={{
      position: 'fixed', left: x, top: y, zIndex: 9999,
      background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10,
      padding: 4, minWidth: 180, boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
    }}>
      {item('✏️  Rename', onRename)}
      {item('👁  Hide Column', () => onHide(stage.id))}
      <div style={{ height: 1, background: '#2e2e4a', margin: '4px 0' }} />
      {item('🗑  Delete Column', () => onDelete(stage.id, stage.name), true)}
    </div>
  )
}

// ── Assignee Dropdown ─────────────────────────────────────────────────
function AssigneeDropdown({ shot, teamMembers, onAssign, onClose }) {
  const [search, setSearch] = useState('')
  const ref = useRef()
  useClickOutside(ref, onClose)

  const q        = search.toLowerCase()
  const filtered = teamMembers.filter(m => (m.full_name || '').toLowerCase().includes(q))

  function initials(name) {
    if (!name) return '?'
    const p = name.trim().split(' ')
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300,
      background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10,
      minWidth: 220, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px 6px', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
        Assign To
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 8px' }}>
        <MagnifyingGlass size={12} style={{ color: 'var(--t4)', flexShrink: 0 }} />
        <input
          autoFocus value={search} placeholder="Search team…"
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#e8e8ff', fontSize: 13 }}
        />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0 4px 4px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--t4)', textAlign: 'center' }}>
            {teamMembers.length === 0 ? 'No team members yet' : 'No results'}
          </div>
        )}
        {filtered.map(m => {
          const active = shot.assigned_to === m.user_id
          return (
            <button
              key={m.user_id}
              onClick={() => { onAssign(m.user_id); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: active ? 'rgba(99,102,241,0.15)' : 'none',
                border: 'none', borderRadius: 7, padding: '7px 10px',
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none' }}
            >
              {m.avatar_url
                ? <img src={m.avatar_url} alt={m.full_name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600, flexShrink: 0 }}>{initials(m.full_name)}</div>
              }
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, color: active ? '#a5b4fc' : '#e8e8ff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name || 'Unnamed'}</div>
                {m.role && <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'capitalize' }}>{m.role}</div>}
              </div>
              {active && <Check size={13} style={{ color: '#6366f1', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>
      {shot.assigned_to && (
        <>
          <div style={{ height: 1, background: '#2e2e4a', margin: '0 8px' }} />
          <button
            onClick={() => { onAssign(null); onClose() }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', padding: '9px 14px', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
          >
            <XIcon size={11} /> Unassign
          </button>
        </>
      )}
    </div>
  )
}

// ── Assignee Cell ─────────────────────────────────────────────────────
function AssigneeCell({ shot, teamMembers, onAssign }) {
  const [open, setOpen] = useState(false)
  const ref    = useRef()
  const member = teamMembers.find(m => m.user_id === shot.assigned_to)
  const name   = shot.assigned_to_name || member?.full_name
  const avatar = shot.assigned_to_avatar || member?.avatar_url

  function initials(n) {
    if (!n) return '?'
    const p = n.trim().split(' ')
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : n.slice(0, 2).toUpperCase()
  }

  return (
    <td style={{ padding: '0 8px', verticalAlign: 'middle', position: 'relative', width: 140, minWidth: 140 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, width: '100%' }}
      >
        {shot.assigned_to ? (
          <>
            {avatar
              ? <img src={avatar} alt={name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600, flexShrink: 0 }}>{initials(name)}</div>
            }
            <span style={{ fontSize: 12, color: '#d0d0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name?.split(' ')[0] || 'Member'}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginLeft: 4 }}>—</span>
        )}
      </button>
      {open && (
        <AssigneeDropdown shot={shot} teamMembers={teamMembers} onAssign={onAssign} onClose={() => setOpen(false)} />
      )}
    </td>
  )
}

// ── Main PipelineView ─────────────────────────────────────────────────
export default function PipelineView({
  projectId, statuses, scenes, stages: initialStages, shots, columns,
  teamMembers = [],
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload,
  onManageStages,
}) {
  const [selectedShot, setSelectedShot] = useState(null)
  const [localShots,   setLocalShots]   = useState(shots)
  const [stages,       setStages]       = useState(initialStages)
  const [widths,       setWidths]       = useState({})
  const [ctxMenu,      setCtxMenu]      = useState(null)
  const widthSaveTimer = useRef({})

  useEffect(() => { setLocalShots(shots) }, [shots])
  useEffect(() => { setStages(initialStages) }, [initialStages])

  function handleWidthChange(stageId, w) { setWidths(prev => ({ ...prev, [stageId]: w })) }
  function handleWidthSave(stageId, w) {
    clearTimeout(widthSaveTimer.current[stageId])
    widthSaveTimer.current[stageId] = setTimeout(() => productionApi.updateStageWidth(stageId, w).catch(() => {}), 600)
  }
  function handleRenameStage(stageId, name) { setStages(prev => prev.map(s => s.id === stageId ? { ...s, name } : s)) }
  async function handleHideStage(stageId) { await productionApi.hideStage(stageId).catch(() => {}); setStages(prev => prev.filter(s => s.id !== stageId)) }
  async function handleDeleteStage(stageId, stageName) {
    if (!window.confirm(`Delete "${stageName}" permanently? All progress data will be lost.`)) return
    await productionApi.deletePipelineStage(stageId).catch(() => {})
    setStages(prev => prev.filter(s => s.id !== stageId))
  }

  async function handleCellUpdate(shotId, stageName, value) {
    setLocalShots(prev => prev.map(s =>
      s.id === shotId ? { ...s, pipeline_stages: { ...(s.pipeline_stages || {}), [stageName]: value } } : s
    ))
    try { await productionApi.updateShotPipeline(shotId, stageName, value) }
    catch { await onReload() }
  }

  async function handleAssign(shotId, assignedTo) {
    const member = teamMembers.find(m => m.user_id === assignedTo)
    setLocalShots(prev => prev.map(s =>
      s.id === shotId
        ? { ...s, assigned_to: assignedTo, assigned_to_name: member?.full_name || null, assigned_to_avatar: member?.avatar_url || null }
        : s
    ))
    try { await productionApi.updateShotAssignee(shotId, assignedTo, null) }
    catch { await onReload() }
  }

  const groupedShots = scenes.length
    ? scenes.map(scene => ({ scene, shots: localShots.filter(s => s.scene_id === scene.id) })).filter(g => g.shots.length > 0)
    : [{ scene: null, shots: localShots }]
  const scenelessShots = localShots.filter(s => !s.scene_id)
  if (scenes.length > 0 && scenelessShots.length > 0) groupedShots.push({ scene: null, shots: scenelessShots })

  return (
    <>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} stage={ctxMenu.stage}
          onHide={handleHideStage}
          onRename={ctxMenu.onRename}
          onDelete={handleDeleteStage}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="pv-wrapper" style={{ overflowX: 'auto' }}>
        {stages.length === 0 && (
          <div className="pv-no-stages">
            No pipeline stages configured.{' '}
            <button className="link-btn" onClick={onManageStages}>Set up stages</button>
          </div>
        )}

        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Shot */}
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, minWidth: 200 }}>
                Shot
              </th>
              {/* Status */}
              <th style={{ textAlign: 'left', padding: '10px 10px', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, width: 120 }}>
                Status
              </th>
              {/* Stage columns */}
              {stages.map(s => (
                <StageHeader
                  key={s.id} stage={s} shots={localShots} widths={widths}
                  onWidthChange={handleWidthChange} onWidthSave={handleWidthSave}
                  onContextMenu={(e, stage, openRename) => setCtxMenu({ x: e.clientX, y: e.clientY, stage, onRename: openRename })}
                  onRename={handleRenameStage}
                />
              ))}
              {/* Assigned To */}
              <th style={{ textAlign: 'left', padding: '10px 10px', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, width: 140 }}>
                Assigned To
              </th>
              {/* Add stage ghost */}
              <th style={{ width: 40, padding: 0 }}>
                <button
                  onClick={onManageStages}
                  title="Manage stages"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, margin: '0 auto', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, cursor: 'pointer', color: 'var(--t4)' }}
                >
                  <Plus size={13} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedShots.map(({ scene, shots: groupShots }) => (
              <React.Fragment key={scene?.id || 'no-scene'}>
                {scene && (
                  <tr>
                    <td
                      colSpan={3 + stages.length + 1}
                      style={{ padding: '6px 14px', fontSize: 11, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      {scene.name}
                    </td>
                  </tr>
                )}
                {groupShots.map((shot, rowIdx) => {
                  const status = statuses.find(s => s.id === shot.status_id)
                  return (
                    <tr
                      key={shot.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {/* Shot title */}
                      <td
                        style={{ padding: '0 14px', cursor: 'pointer', minHeight: 44, height: 44, verticalAlign: 'middle' }}
                        onClick={() => setSelectedShot(shot)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {shot.shot_number && (
                            <span style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600, flexShrink: 0 }}>#{shot.shot_number}</span>
                          )}
                          <span style={{ fontSize: 13, color: '#e8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.title}</span>
                        </div>
                      </td>
                      {/* Shot status */}
                      <td style={{ padding: '0 6px', verticalAlign: 'middle', width: 120 }}>
                        {status && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: status.color + '22', color: status.color,
                            border: `1px solid ${status.color}55`,
                            borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }} />
                            {status.name}
                          </span>
                        )}
                      </td>
                      {/* Stage cells */}
                      {stages.map(stage => (
                        <StageCell
                          key={stage.id} shot={shot} stage={stage}
                          onUpdate={handleCellUpdate}
                          width={widths[stage.id] || stage.width || 120}
                        />
                      ))}
                      {/* Assignee */}
                      <AssigneeCell
                        shot={shot} teamMembers={teamMembers}
                        onAssign={assignedTo => handleAssign(shot.id, assignedTo)}
                      />
                      <td />
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {localShots.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t4)', fontSize: 13 }}>
            No shots yet. Add them in the Shot List view.
          </div>
        )}
      </div>

      {selectedShot && (
        <ShotDetailPanel
          shotId={selectedShot.id} statuses={statuses} scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={u => { onShotUpdate(u.id, u); setSelectedShot(u) }}
          onDelete={id => { onShotDelete(id); setSelectedShot(null) }}
        />
      )}
    </>
  )
}
