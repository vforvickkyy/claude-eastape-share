import React, { useState, useRef, useEffect, useCallback } from 'react'
import { CheckCircle, Check, MagnifyingGlass, Plus, X as XIcon, UserCircle, ArrowsOut } from '@phosphor-icons/react'
import { productionApi } from '../../../lib/api'
import ShotDetailPanel from '../ShotDetailPanel'

// ── Percentage Cell ───────────────────────────────────────────────────
function PercentageCell({ shot, stage, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const [val,  setVal]  = useState(shot.pipeline_stages?.[stage.name] ?? 0)
  const ref = useRef()

  useEffect(() => { setVal(shot.pipeline_stages?.[stage.name] ?? 0) }, [shot.pipeline_stages, stage.name])
  useEffect(() => {
    if (!open) return
    function h(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  async function save() { await onUpdate(shot.id, stage.name, Number(val)); setOpen(false) }
  const pct = Number(shot.pipeline_stages?.[stage.name] ?? 0)

  return (
    <td className={`pv-cell ${pct >= 100 ? 'pv-cell--done' : ''}`} style={{ width }}>
      <button className="pv-cell-btn" onClick={() => setOpen(v => !v)}>
        <div className="pv-cell-bar">
          <div className="pv-cell-fill" style={{ width: `${pct}%`, background: stage.color || '#6366f1' }} />
        </div>
        <span className="pv-cell-pct">{pct}%</span>
        {pct >= 100 && <CheckCircle size={13} weight="fill" style={{ color: '#22c55e', flexShrink: 0 }} />}
      </button>
      {open && (
        <div className="pv-popover" ref={ref}>
          <label className="pv-popover-label">{stage.name}</label>
          <input type="range" min={0} max={100} step={5} value={val} onChange={e => setVal(e.target.value)} />
          <div className="pv-popover-row">
            <span className="pv-popover-pct">{val}%</span>
            <button className="btn-primary btn-xs" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </td>
  )
}

// ── Checkbox Cell ─────────────────────────────────────────────────────
function CheckboxCell({ shot, stage, onUpdate, width }) {
  const val    = shot.pipeline_stages?.[stage.name]
  const isDone = val === true || val === 1 || val === 100
  return (
    <td
      className="pv-cell pv-cell--checkbox"
      style={{ width, background: isDone ? 'rgba(16,185,129,0.10)' : undefined, cursor: 'pointer' }}
      onClick={() => onUpdate(shot.id, stage.name, !isDone)}
      title={isDone ? 'Mark not done' : 'Mark done'}
    >
      {isDone
        ? <div className="pv-checkbox pv-checkbox--checked"><Check size={14} weight="bold" style={{ color: '#fff' }} /></div>
        : <div className="pv-checkbox pv-checkbox--empty" />
      }
    </td>
  )
}

// ── Status Cell ───────────────────────────────────────────────────────
function StatusCell({ shot, stage, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const ref  = useRef()
  const opts = Array.isArray(stage.status_options) ? stage.status_options : []
  const cur  = shot.pipeline_stages?.[stage.name] || null
  const curOpt = opts.find(o => o.label === cur) || null

  useEffect(() => {
    if (!open) return
    function h(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  async function pick(label) { await onUpdate(shot.id, stage.name, label); setOpen(false) }

  return (
    <td className="pv-cell pv-cell--status" style={{ width, position: 'relative' }}>
      <button
        className="pv-status-cell-btn"
        onClick={() => setOpen(v => !v)}
        style={curOpt ? { background: curOpt.color + '22', color: curOpt.color, borderColor: curOpt.color + '55' } : undefined}
      >
        {curOpt
          ? <><span className="pv-sopt-dot" style={{ background: curOpt.color }} />{curOpt.label}</>
          : <span style={{ color: 'var(--t4)' }}>—</span>
        }
      </button>
      {open && (
        <div className="pv-status-dropdown" ref={ref}>
          {opts.map(opt => (
            <button key={opt.label} className="pv-status-opt" onClick={() => pick(opt.label)}>
              <span className="pv-sopt-dot" style={{ background: opt.color }} />
              {opt.label}
              {cur === opt.label && <Check size={11} style={{ marginLeft: 'auto', color: opt.color }} />}
            </button>
          ))}
          {cur && (
            <button className="pv-status-opt pv-status-opt--clear" onClick={() => pick(null)}>
              <XIcon size={11} /> Clear
            </button>
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

// ── Stage column header with resize + right-click ────────────────────
function StageHeader({ stage, shots, widths, onWidthChange, onWidthSave, onContextMenu, onRename }) {
  const resizeRef  = useRef()
  const startX     = useRef(null)
  const startWidth = useRef(null)
  const w = widths[stage.id] || stage.width || 120
  const stat = stageStat(stage, shots)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(stage.name)

  function onResizeDown(e) {
    e.preventDefault()
    startX.current = e.clientX
    startWidth.current = w
    function onMove(e2) {
      const delta = e2.clientX - startX.current
      const next = Math.min(300, Math.max(80, startWidth.current + delta))
      onWidthChange(stage.id, next)
    }
    function onUp(e2) {
      const delta = e2.clientX - startX.current
      const next = Math.min(300, Math.max(80, startWidth.current + delta))
      onWidthSave(stage.id, next)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleContextMenu(e) {
    e.preventDefault()
    onContextMenu(e, stage, () => setRenaming(true))
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
      className="pv-th-stage"
      style={{ width: w, minWidth: w, maxWidth: w, background: (stage.color || '#6366f1') + '18', position: 'relative' }}
      onContextMenu={handleContextMenu}
    >
      <div className="pv-th-stage-inner">
        <span className="pv-stage-dot" style={{ background: stage.color || '#6366f1' }} />
        {renaming ? (
          <input
            className="pv-th-rename-input"
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
          />
        ) : (
          <div className="pv-th-stage-text">
            <span className="pv-th-stage-name">{stage.name}</span>
            {stat && <span className="pv-th-stage-stat">{stat}</span>}
          </div>
        )}
      </div>
      <div
        className="pv-resize-handle"
        ref={resizeRef}
        onMouseDown={onResizeDown}
        title="Drag to resize"
      />
    </th>
  )
}

// ── Context Menu ─────────────────────────────────────────────────────
function ContextMenu({ x, y, stage, onHide, onRename, onDelete, onClose }) {
  const ref = useRef()
  useEffect(() => {
    function h(e) { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="pv-context-menu" ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}>
      <button className="pv-ctx-item" onClick={() => { onRename(); onClose() }}>✏️ Rename</button>
      <button className="pv-ctx-item" onClick={() => { onHide(stage.id); onClose() }}>👁 Hide Column</button>
      <div className="pv-ctx-sep" />
      <button className="pv-ctx-item pv-ctx-item--danger" onClick={() => { onDelete(stage.id, stage.name); onClose() }}>🗑 Delete Column</button>
    </div>
  )
}

// ── Assignee Dropdown (team members only) ─────────────────────────────
function AssigneeDropdown({ shot, teamMembers, onAssign, onClose }) {
  const [search, setSearch] = useState('')
  const ref = useRef()
  useEffect(() => {
    function h(e) { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const q = search.toLowerCase()
  const filtered = teamMembers.filter(m => (m.full_name || '').toLowerCase().includes(q))

  function initials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }

  return (
    <div className="pv-assignee-dropdown" ref={ref}>
      <div className="pv-assignee-dropdown-header">Assign To</div>
      <div className="pv-assignee-search">
        <MagnifyingGlass size={12} style={{ color: 'var(--t3)', flexShrink: 0 }} />
        <input
          autoFocus
          className="pv-assignee-search-input"
          placeholder="Search team…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="pv-assignee-list">
        {filtered.length === 0 && (
          <div className="pv-assignee-empty">
            {teamMembers.length === 0 ? 'No team members yet' : 'No results'}
          </div>
        )}
        {filtered.map(m => (
          <button
            key={m.user_id}
            className={`pv-assignee-opt ${shot.assigned_to === m.user_id ? 'active' : ''}`}
            onClick={() => { onAssign(m.user_id); onClose() }}
          >
            {m.avatar_url
              ? <img src={m.avatar_url} className="pv-assignee-avatar" alt={m.full_name} />
              : <div className="pv-assignee-initials">{initials(m.full_name)}</div>
            }
            <span className="pv-assignee-name">{m.full_name || 'Unnamed'}</span>
            <span className="pv-assignee-role">{m.role}</span>
            {shot.assigned_to === m.user_id && <Check size={11} style={{ marginLeft: 'auto', color: '#6366f1' }} />}
          </button>
        ))}
      </div>
      {shot.assigned_to && (
        <button className="pv-assignee-unassign" onClick={() => { onAssign(null); onClose() }}>
          <XIcon size={11} /> Unassign
        </button>
      )}
    </div>
  )
}

// ── Assignee Cell ─────────────────────────────────────────────────────
function AssigneeCell({ shot, teamMembers, onAssign }) {
  const [open, setOpen] = useState(false)
  const member = teamMembers.find(m => m.user_id === shot.assigned_to)

  function initials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }

  const name    = shot.assigned_to_name || member?.full_name
  const avatar  = shot.assigned_to_avatar || member?.avatar_url

  return (
    <td className="pv-cell pv-cell--assignee" style={{ position: 'relative' }}>
      <button className="pv-assignee-cell-btn" onClick={() => setOpen(v => !v)}>
        {shot.assigned_to ? (
          <>
            {avatar
              ? <img src={avatar} className="pv-assignee-avatar" alt={name} />
              : <div className="pv-assignee-initials" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(name)}</div>
            }
            <span className="pv-assignee-name">{name?.split(' ')[0] || 'Member'}</span>
          </>
        ) : (
          <span className="pv-assignee-empty">—</span>
        )}
      </button>
      {open && (
        <AssigneeDropdown
          shot={shot}
          teamMembers={teamMembers}
          onAssign={onAssign}
          onClose={() => setOpen(false)}
        />
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
  const [ctxMenu,      setCtxMenu]      = useState(null) // { x, y, stage, onRename }

  useEffect(() => { setLocalShots(shots) }, [shots])
  useEffect(() => { setStages(initialStages) }, [initialStages])

  // Debounce ref for width saves
  const widthSaveTimer = useRef({})

  function handleWidthChange(stageId, w) {
    setWidths(prev => ({ ...prev, [stageId]: w }))
  }

  function handleWidthSave(stageId, w) {
    clearTimeout(widthSaveTimer.current[stageId])
    widthSaveTimer.current[stageId] = setTimeout(() => {
      productionApi.updateStageWidth(stageId, w).catch(() => {})
    }, 500)
  }

  function handleContextMenu(e, stage, openRename) {
    setCtxMenu({ x: e.clientX, y: e.clientY, stage, onRename: openRename })
  }

  function handleRenameStage(stageId, name) {
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, name } : s))
  }

  async function handleHideStage(stageId) {
    await productionApi.hideStage(stageId).catch(() => {})
    setStages(prev => prev.filter(s => s.id !== stageId))
  }

  async function handleDeleteStage(stageId, stageName) {
    if (!window.confirm(`Delete "${stageName}" permanently? All progress data will be lost.`)) return
    await productionApi.deletePipelineStage(stageId).catch(() => {})
    setStages(prev => prev.filter(s => s.id !== stageId))
  }

  async function handleCellUpdate(shotId, stageName, value) {
    setLocalShots(prev => prev.map(s =>
      s.id === shotId
        ? { ...s, pipeline_stages: { ...(s.pipeline_stages || {}), [stageName]: value } }
        : s
    ))
    try {
      await productionApi.updateShotPipeline(shotId, stageName, value)
    } catch {
      await onReload()
    }
  }

  async function handleAssign(shotId, assignedTo) {
    const member = teamMembers.find(m => m.user_id === assignedTo)
    setLocalShots(prev => prev.map(s =>
      s.id === shotId
        ? { ...s, assigned_to: assignedTo, assigned_to_name: member?.full_name || null, assigned_to_avatar: member?.avatar_url || null }
        : s
    ))
    try {
      await productionApi.updateShotAssignee(shotId, assignedTo, null)
    } catch {
      await onReload()
    }
  }

  const groupedShots = scenes.length
    ? scenes.map(scene => ({ scene, shots: localShots.filter(s => s.scene_id === scene.id) })).filter(g => g.shots.length > 0)
    : [{ scene: null, shots: localShots }]
  const scenelessShots = localShots.filter(s => !s.scene_id)
  if (scenes.length > 0 && scenelessShots.length > 0) groupedShots.push({ scene: null, shots: scenelessShots })

  const colSpan = 2 + stages.length + 1

  return (
    <>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          stage={ctxMenu.stage}
          onHide={handleHideStage}
          onRename={ctxMenu.onRename}
          onDelete={handleDeleteStage}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="pv-wrapper">
        {stages.length === 0 && (
          <div className="pv-no-stages">
            No pipeline stages configured.{' '}
            <button className="link-btn" onClick={onManageStages}>Set up stages</button>
          </div>
        )}

        <table className="pv-table">
          <thead>
            <tr>
              <th className="pv-th-shot">Shot</th>
              <th className="pv-th-status">Status</th>
              {stages.map(s => (
                <StageHeader
                  key={s.id}
                  stage={s}
                  shots={localShots}
                  widths={widths}
                  onWidthChange={handleWidthChange}
                  onWidthSave={handleWidthSave}
                  onContextMenu={handleContextMenu}
                  onRename={handleRenameStage}
                />
              ))}
              <th className="pv-th-assignee" style={{ width: 140 }}>Assigned To</th>
              <th className="pv-th-add">
                <button className="pv-add-stage-btn" onClick={onManageStages} title="Add stage">
                  <Plus size={12} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedShots.map(({ scene, shots: groupShots }) => (
              <React.Fragment key={scene?.id || 'no-scene'}>
                {scene && (
                  <tr className="pv-scene-row">
                    <td colSpan={colSpan + 1} className="pv-scene-cell">{scene.name}</td>
                  </tr>
                )}
                {groupShots.map(shot => {
                  const status = statuses.find(s => s.id === shot.status_id)
                  return (
                    <tr key={shot.id} className="pv-row">
                      <td className="pv-td-shot" onClick={() => setSelectedShot(shot)}>
                        <div className="pv-shot-title">
                          {shot.shot_number && <span className="pv-shot-num">#{shot.shot_number}</span>}
                          {shot.title}
                        </div>
                      </td>
                      <td className="pv-td-status">
                        {status && (
                          <span className="pv-status-chip"
                            style={{ background: status.color + '22', color: status.color, borderColor: status.color + '55' }}>
                            {status.name}
                          </span>
                        )}
                      </td>
                      {stages.map(stage => (
                        <StageCell
                          key={stage.id}
                          shot={shot}
                          stage={stage}
                          onUpdate={handleCellUpdate}
                          width={widths[stage.id] || stage.width || 120}
                        />
                      ))}
                      <AssigneeCell
                        shot={shot}
                        teamMembers={teamMembers}
                        onAssign={assignedTo => handleAssign(shot.id, assignedTo)}
                      />
                      <td className="pv-td-add" />
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {localShots.length === 0 && (
          <div className="pv-empty">No shots yet. Add them in the Shot List view.</div>
        )}
      </div>

      {selectedShot && (
        <ShotDetailPanel
          shotId={selectedShot.id}
          statuses={statuses}
          scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={updatedShot => { onShotUpdate(updatedShot.id, updatedShot); setSelectedShot(updatedShot) }}
          onDelete={id => { onShotDelete(id); setSelectedShot(null) }}
        />
      )}
    </>
  )
}
