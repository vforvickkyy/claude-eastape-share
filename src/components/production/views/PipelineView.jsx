import React, { useState, useRef, useEffect, useCallback } from 'react'
import { CheckCircle, Check, MagnifyingGlass, Plus, X as XIcon, UserCircle } from '@phosphor-icons/react'
import { productionApi } from '../../../lib/api'
import ShotDetailPanel from '../ShotDetailPanel'

// ── Percentage Cell (unchanged behavior) ─────────────────────────────
function PercentageCell({ shot, stage, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [val,  setVal]  = useState(shot.pipeline_stages?.[stage.name] ?? 0)
  const ref = useRef()

  useEffect(() => {
    setVal(shot.pipeline_stages?.[stage.name] ?? 0)
  }, [shot.pipeline_stages, stage.name])

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function save() {
    await onUpdate(shot.id, stage.name, Number(val))
    setOpen(false)
  }

  const pct = Number(shot.pipeline_stages?.[stage.name] ?? 0)

  return (
    <td className={`pv-cell ${pct >= 100 ? 'pv-cell--done' : ''}`}>
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
          <input
            type="range" min={0} max={100} step={5}
            value={val}
            onChange={e => setVal(e.target.value)}
          />
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
function CheckboxCell({ shot, stage, onUpdate }) {
  const val    = shot.pipeline_stages?.[stage.name]
  const isDone = val === true || val === 1 || val === 100

  async function toggle() {
    await onUpdate(shot.id, stage.name, !isDone)
  }

  return (
    <td
      className="pv-cell pv-cell--checkbox"
      style={{ background: isDone ? 'rgba(16,185,129,0.12)' : undefined, cursor: 'pointer' }}
      onClick={toggle}
      title={isDone ? 'Mark not done' : 'Mark done'}
    >
      {isDone ? (
        <div className="pv-checkbox pv-checkbox--checked">
          <Check size={14} weight="bold" style={{ color: '#fff' }} />
        </div>
      ) : (
        <div className="pv-checkbox pv-checkbox--empty" />
      )}
    </td>
  )
}

// ── Status Cell ───────────────────────────────────────────────────────
function StatusCell({ shot, stage, onUpdate }) {
  const [open, setOpen] = useState(false)
  const ref  = useRef()
  const opts = Array.isArray(stage.status_options) ? stage.status_options : []
  const cur  = shot.pipeline_stages?.[stage.name] || null
  const curOpt = opts.find(o => o.label === cur) || null

  useEffect(() => {
    if (!open) return
    function handle(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function pick(label) {
    await onUpdate(shot.id, stage.name, label)
    setOpen(false)
  }

  return (
    <td className="pv-cell pv-cell--status" style={{ position: 'relative' }}>
      <button
        className="pv-status-cell-btn"
        onClick={() => setOpen(v => !v)}
        style={curOpt ? { background: curOpt.color + '22', color: curOpt.color, borderColor: curOpt.color + '55' } : undefined}
      >
        {curOpt ? (
          <><span className="pv-sopt-dot" style={{ background: curOpt.color }} />{curOpt.label}</>
        ) : (
          <span style={{ color: 'var(--t4)' }}>—</span>
        )}
      </button>
      {open && (
        <div className="pv-status-dropdown" ref={ref}>
          {opts.map(opt => (
            <button
              key={opt.label}
              className="pv-status-opt"
              onClick={() => pick(opt.label)}
            >
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

// ── Stage Cell dispatcher ─────────────────────────────────────────────
function StageCell({ shot, stage, onUpdate }) {
  const type = stage.cell_type || 'checkbox'
  if (type === 'percentage') return <PercentageCell shot={shot} stage={stage} onUpdate={onUpdate} />
  if (type === 'status')     return <StatusCell     shot={shot} stage={stage} onUpdate={onUpdate} />
  return <CheckboxCell shot={shot} stage={stage} onUpdate={onUpdate} />
}

// ── Assignee Dropdown ─────────────────────────────────────────────────
function AssigneeDropdown({ shot, teamMembers, customAssignees, projectId, onAssign, onAddCustom, onRemoveCustom, onClose }) {
  const [search,     setSearch]     = useState('')
  const [adding,     setAdding]     = useState(false)
  const [newName,    setNewName]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const ref = useRef()
  const inputRef = useRef()

  useEffect(() => {
    function handle(e) { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const q = search.toLowerCase()
  const filteredTeam   = teamMembers.filter(m => (m.full_name || '').toLowerCase().includes(q))
  const filteredCustom = customAssignees.filter(a => a.name.toLowerCase().includes(q))

  function initials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }

  async function handleAddCustom() {
    if (!newName.trim() || saving) return
    setSaving(true)
    try {
      const ca = await onAddCustom(newName.trim())
      await onAssign(null, ca.name)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pv-assignee-dropdown" ref={ref}>
      <div className="pv-assignee-search">
        <MagnifyingGlass size={12} style={{ color: 'var(--t3)', flexShrink: 0 }} />
        <input
          autoFocus
          className="pv-assignee-search-input"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filteredTeam.length > 0 && (
        <div className="pv-assignee-section">
          <div className="pv-assignee-section-label">TEAM MEMBERS</div>
          {filteredTeam.map(m => (
            <button
              key={m.user_id}
              className={`pv-assignee-opt ${shot.assigned_to === m.user_id ? 'active' : ''}`}
              onClick={() => { onAssign(m.user_id, null); onClose() }}
            >
              {m.avatar_url
                ? <img src={m.avatar_url} className="pv-assignee-avatar" alt={m.full_name} />
                : <div className="pv-assignee-initials">{initials(m.full_name)}</div>
              }
              <span>{m.full_name || 'Unnamed'}</span>
              {shot.assigned_to === m.user_id && <Check size={11} style={{ marginLeft: 'auto', color: '#6366f1' }} />}
            </button>
          ))}
        </div>
      )}

      {filteredCustom.length > 0 && (
        <div className="pv-assignee-section">
          <div className="pv-assignee-section-label">CUSTOM</div>
          {filteredCustom.map(a => (
            <div key={a.id} className="pv-assignee-opt-row">
              <button
                className={`pv-assignee-opt ${shot.custom_assignee === a.name ? 'active' : ''}`}
                onClick={() => { onAssign(null, a.name); onClose() }}
              >
                <div className="pv-assignee-initials">{initials(a.name)}</div>
                <span>{a.name}</span>
                {shot.custom_assignee === a.name && <Check size={11} style={{ marginLeft: 'auto', color: '#6366f1' }} />}
              </button>
              <button
                className="pv-assignee-remove"
                title="Remove"
                onClick={e => { e.stopPropagation(); onRemoveCustom(a.id) }}
              >
                <XIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(shot.assigned_to || shot.custom_assignee) && (
        <button className="pv-assignee-opt pv-assignee-unassign" onClick={() => { onAssign(null, null); onClose() }}>
          <XIcon size={11} /> Unassign
        </button>
      )}

      <div className="pv-assignee-add">
        {adding ? (
          <div className="pv-assignee-add-row">
            <input
              ref={inputRef}
              autoFocus
              className="pv-assignee-add-input"
              placeholder="Custom name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCustom(); if (e.key === 'Escape') setAdding(false) }}
            />
            <button className="btn-primary btn-xs" onClick={handleAddCustom} disabled={!newName.trim() || saving}>
              {saving ? '…' : 'Add'}
            </button>
          </div>
        ) : (
          <button className="pv-assignee-add-btn" onClick={() => setAdding(true)}>
            <Plus size={11} /> Add custom name…
          </button>
        )}
      </div>
    </div>
  )
}

// ── Assignee Cell ─────────────────────────────────────────────────────
function AssigneeCell({ shot, teamMembers, customAssignees, projectId, onAssign, onAddCustom, onRemoveCustom }) {
  const [open, setOpen] = useState(false)

  function initials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }

  const hasTeamAssignee   = !!shot.assigned_to
  const hasCustomAssignee = !!shot.custom_assignee
  const member = teamMembers.find(m => m.user_id === shot.assigned_to)

  return (
    <td className="pv-cell pv-cell--assignee" style={{ position: 'relative' }}>
      <button className="pv-assignee-cell-btn" onClick={() => setOpen(v => !v)}>
        {hasTeamAssignee && (
          <>
            {(shot.assigned_to_avatar || member?.avatar_url)
              ? <img src={shot.assigned_to_avatar || member?.avatar_url} className="pv-assignee-avatar" alt="" />
              : <div className="pv-assignee-initials">{initials(shot.assigned_to_name || member?.full_name)}</div>
            }
            <span className="pv-assignee-name">{shot.assigned_to_name || member?.full_name || 'Member'}</span>
          </>
        )}
        {hasCustomAssignee && !hasTeamAssignee && (
          <>
            <div className="pv-assignee-initials">{initials(shot.custom_assignee)}</div>
            <span className="pv-assignee-name">{shot.custom_assignee}</span>
          </>
        )}
        {!hasTeamAssignee && !hasCustomAssignee && (
          <span className="pv-assignee-empty">— Unassigned</span>
        )}
      </button>

      {open && (
        <AssigneeDropdown
          shot={shot}
          teamMembers={teamMembers}
          customAssignees={customAssignees}
          projectId={projectId}
          onAssign={onAssign}
          onAddCustom={onAddCustom}
          onRemoveCustom={onRemoveCustom}
          onClose={() => setOpen(false)}
        />
      )}
    </td>
  )
}

// ── Main PipelineView ─────────────────────────────────────────────────
export default function PipelineView({
  projectId, statuses, scenes, stages, shots, columns,
  teamMembers = [], customAssignees: initialCustomAssignees = [],
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload,
  onManageStages,
}) {
  const [selectedShot,    setSelectedShot]    = useState(null)
  const [localShots,      setLocalShots]      = useState(shots)
  const [customAssignees, setCustomAssignees] = useState(initialCustomAssignees)

  useEffect(() => { setLocalShots(shots) }, [shots])
  useEffect(() => { setCustomAssignees(initialCustomAssignees) }, [initialCustomAssignees])

  async function handleCellUpdate(shotId, stageName, value) {
    // Optimistic update
    setLocalShots(prev => prev.map(s =>
      s.id === shotId
        ? { ...s, pipeline_stages: { ...(s.pipeline_stages || {}), [stageName]: value } }
        : s
    ))
    try {
      await productionApi.updateShotPipeline(shotId, stageName, value)
    } catch {
      // revert on error
      await onReload()
    }
  }

  async function handleAssign(shotId, assignedTo, customAssignee) {
    setLocalShots(prev => prev.map(s =>
      s.id === shotId
        ? { ...s, assigned_to: assignedTo, custom_assignee: customAssignee,
            assigned_to_name: teamMembers.find(m => m.user_id === assignedTo)?.full_name || s.assigned_to_name,
            assigned_to_avatar: teamMembers.find(m => m.user_id === assignedTo)?.avatar_url || null,
          }
        : s
    ))
    try {
      await productionApi.updateShotAssignee(shotId, assignedTo, customAssignee)
    } catch {
      await onReload()
    }
  }

  async function handleAddCustomAssignee(name) {
    const r = await productionApi.addCustomAssignee(projectId, name)
    setCustomAssignees(prev => [...prev, r.assignee])
    return r.assignee
  }

  async function handleRemoveCustomAssignee(id) {
    setCustomAssignees(prev => prev.filter(a => a.id !== id))
    await productionApi.removeCustomAssignee(id).catch(() => {})
  }

  const groupedShots = scenes.length
    ? scenes.map(scene => ({
        scene,
        shots: localShots.filter(s => s.scene_id === scene.id),
      })).filter(g => g.shots.length > 0)
    : [{ scene: null, shots: localShots }]

  const scenelessShots = localShots.filter(s => !s.scene_id)
  if (scenes.length > 0 && scenelessShots.length > 0) {
    groupedShots.push({ scene: null, shots: scenelessShots })
  }

  const colSpan = 2 + stages.length + 1 // shot + status + stages + assignee

  return (
    <>
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
                <th key={s.id} className="pv-th-stage">
                  <span className="pv-stage-dot" style={{ background: s.color || '#6366f1' }} />
                  {s.name}
                  {s.is_final_stage && <span className="pv-final-badge">Final</span>}
                </th>
              ))}
              <th className="pv-th-assignee">Assigned To</th>
            </tr>
          </thead>
          <tbody>
            {groupedShots.map(({ scene, shots: groupShots }) => (
              <React.Fragment key={scene?.id || 'no-scene'}>
                {scene && (
                  <tr className="pv-scene-row">
                    <td colSpan={colSpan} className="pv-scene-cell">{scene.name}</td>
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
                          <span
                            className="pv-status-chip"
                            style={{ background: status.color + '22', color: status.color, borderColor: status.color + '55' }}
                          >
                            {status.name}
                          </span>
                        )}
                      </td>
                      {stages.map(stage => (
                        <StageCell key={stage.id} shot={shot} stage={stage} onUpdate={handleCellUpdate} />
                      ))}
                      <AssigneeCell
                        shot={shot}
                        teamMembers={teamMembers}
                        customAssignees={customAssignees}
                        projectId={projectId}
                        onAssign={(assignedTo, customAssignee) => handleAssign(shot.id, assignedTo, customAssignee)}
                        onAddCustom={handleAddCustomAssignee}
                        onRemoveCustom={handleRemoveCustomAssignee}
                      />
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
