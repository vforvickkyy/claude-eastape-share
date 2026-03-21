import React, { useState, useRef, useEffect } from 'react'
import { X, Trash, DotsSixVertical, Plus, SpinnerGap, Eye, EyeSlash, CaretDown, CaretRight } from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'

const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b',
]

const CELL_TYPES = [
  { id: 'checkbox',   label: '☑ Checkbox'   },
  { id: 'percentage', label: '% Percentage' },
  { id: 'status',     label: '◉ Status'     },
]

const DEFAULT_STATUS_OPTIONS = [
  { label: 'Done',        color: '#10b981' },
  { label: 'In Progress', color: '#f59e0b' },
  { label: 'Pending',     color: '#64748b' },
]

const PRESETS = [
  { name: 'Standard Production', stages: ['Pre-Production', 'Shooting', 'Rough Cut', 'Review', 'Final Cut', 'Delivery'] },
  { name: 'Animation Pipeline',  stages: ['Concept', 'Storyboard', 'Animatic', 'Animation', 'Compositing', 'Output'] },
  { name: 'Simple 3-Stage',      stages: ['In Progress', 'Review', 'Done'] },
]

// ── Color picker popover ────────────────────────────────────────────
function ColorPicker({ color, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    if (!open) return
    function h(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="psm-color-picker" ref={ref}>
      <button
        className="psm-color-dot-btn"
        style={{ background: color }}
        onClick={() => setOpen(v => !v)}
        type="button"
        title="Change color"
      />
      {open && (
        <div className="psm-color-popover">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              className={`psm-color-swatch ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false) }}
              type="button"
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Status options editor ────────────────────────────────────────────
function StatusOptionsEditor({ options, onChange }) {
  function add() { onChange([...options, { label: '', color: '#6366f1' }]) }
  function remove(i) { onChange(options.filter((_, idx) => idx !== i)) }
  function update(i, opt) { onChange(options.map((o, idx) => idx === i ? opt : o)) }
  return (
    <div className="psm-status-opts">
      <div className="psm-status-opts-label">Status options</div>
      {options.map((opt, i) => (
        <div key={i} className="psm-sopt-row">
          <input type="color" className="psm-sopt-color" value={opt.color}
            onChange={e => update(i, { ...opt, color: e.target.value })} />
          <input className="psm-sopt-input" value={opt.label} placeholder="Option label…"
            onChange={e => update(i, { ...opt, label: e.target.value })} />
          <button className="psm-sopt-remove" onClick={() => remove(i)} type="button"><X size={11} /></button>
        </div>
      ))}
      <button className="psm-sopt-add" type="button" onClick={add}>
        <Plus size={11} /> Add option
      </button>
    </div>
  )
}

// ── Active Stage Row ────────────────────────────────────────────────
function ActiveStageRow({ stage, onHide, onDelete, onUpdate }) {
  const [name,          setName]          = useState(stage.name)
  const [color,         setColor]         = useState(stage.color || '#6366f1')
  const [cellType,      setCellType]      = useState(stage.cell_type || 'checkbox')
  const [statusOptions, setStatusOptions] = useState(
    Array.isArray(stage.status_options) && stage.status_options.length > 0
      ? stage.status_options : DEFAULT_STATUS_OPTIONS
  )
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [dirty,       setDirty]       = useState(false)

  // track dirty state
  const orig = useRef({ name: stage.name, color: stage.color || '#6366f1', cellType: stage.cell_type || 'checkbox' })
  useEffect(() => {
    setDirty(name !== orig.current.name || color !== orig.current.color || cellType !== orig.current.cellType)
  }, [name, color, cellType])

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onUpdate(stage.id, {
        name: name.trim(), color, cell_type: cellType,
        status_options: cellType === 'status' ? statusOptions : [],
      })
      orig.current = { name: name.trim(), color, cellType }
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  if (confirmDel) {
    return (
      <div className="psm-stage-row psm-stage-row--confirm">
        <div className="psm-confirm-text">
          <Trash size={13} style={{ color: '#ef4444' }} />
          Delete <strong>{stage.name}</strong> permanently? All progress data will be lost.
        </div>
        <div className="psm-confirm-actions">
          <button className="btn-ghost btn-xs" onClick={() => setConfirmDel(false)}>Cancel</button>
          <button className="btn-danger btn-xs" onClick={() => onDelete(stage.id, stage.name)}>
            Delete permanently
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="psm-stage-row">
      <span className="psm-drag-handle"><DotsSixVertical size={14} weight="bold" /></span>
      <ColorPicker color={color} onChange={c => { setColor(c) }} />
      <input
        className="psm-stage-name-input"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        onBlur={() => { if (dirty) save() }}
      />
      <select
        className="psm-type-select"
        value={cellType}
        onChange={e => setCellType(e.target.value)}
      >
        {CELL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      {dirty && (
        <button className="btn-primary btn-xs" onClick={save} disabled={saving} title="Save">
          {saving ? <SpinnerGap size={11} className="spin" /> : 'Save'}
        </button>
      )}
      <button className="psm-icon-btn" onClick={() => onHide(stage.id)} title="Hide column">
        <EyeSlash size={14} />
      </button>
      <button className="psm-icon-btn psm-icon-btn--danger" onClick={() => setConfirmDel(true)} title="Delete stage">
        <Trash size={13} />
      </button>

      {cellType === 'status' && (
        <div className="psm-status-opts-wrap">
          <StatusOptionsEditor options={statusOptions} onChange={setStatusOptions} />
          {dirty && (
            <button className="btn-primary btn-xs" onClick={save} disabled={saving}>
              {saving ? <SpinnerGap size={11} className="spin" /> : 'Save options'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Hidden Stage Row ─────────────────────────────────────────────────
function HiddenStageRow({ stage, onShow, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const typeLabel = CELL_TYPES.find(t => t.id === (stage.cell_type || 'checkbox'))?.label || 'Checkbox'
  if (confirmDel) {
    return (
      <div className="psm-stage-row psm-stage-row--hidden psm-stage-row--confirm">
        <div className="psm-confirm-text">
          <Trash size={13} style={{ color: '#ef4444' }} />
          Delete <strong>{stage.name}</strong> permanently?
        </div>
        <div className="psm-confirm-actions">
          <button className="btn-ghost btn-xs" onClick={() => setConfirmDel(false)}>Cancel</button>
          <button className="btn-danger btn-xs" onClick={() => onDelete(stage.id, stage.name)}>Delete</button>
        </div>
      </div>
    )
  }
  return (
    <div className="psm-stage-row psm-stage-row--hidden">
      <span className="psm-stage-dot" style={{ background: stage.color || '#64748b' }} />
      <span className="psm-stage-name-static">{stage.name}</span>
      <span className="psm-type-badge">{typeLabel}</span>
      <button className="psm-icon-btn" onClick={() => onShow(stage.id)} title="Restore column">
        <Eye size={14} />
      </button>
      <button className="psm-icon-btn psm-icon-btn--danger" onClick={() => setConfirmDel(true)} title="Delete permanently">
        <Trash size={13} />
      </button>
    </div>
  )
}

// ── Add New Stage row ────────────────────────────────────────────────
function AddStageRow({ onAdd }) {
  const [name,    setName]    = useState('')
  const [color,   setColor]   = useState('#6366f1')
  const [type,    setType]    = useState('checkbox')
  const [adding,  setAdding]  = useState(false)
  const [visible, setVisible] = useState(false)

  async function handleAdd() {
    if (!name.trim() || adding) return
    setAdding(true)
    try {
      await onAdd({ name: name.trim(), color, cell_type: type, status_options: type === 'status' ? DEFAULT_STATUS_OPTIONS : [] })
      setName('')
      setColor('#6366f1')
      setType('checkbox')
      setVisible(false)
    } finally {
      setAdding(false)
    }
  }

  if (!visible) {
    return (
      <button className="psm-add-stage-btn" onClick={() => setVisible(true)}>
        <Plus size={13} /> Add Stage
      </button>
    )
  }

  return (
    <div className="psm-stage-row psm-stage-row--adding">
      <ColorPicker color={color} onChange={setColor} />
      <input
        className="psm-stage-name-input"
        placeholder="Stage name…"
        value={name}
        autoFocus
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setVisible(false) }}
      />
      <select className="psm-type-select" value={type} onChange={e => setType(e.target.value)}>
        {CELL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <button className="btn-primary btn-xs" onClick={handleAdd} disabled={adding || !name.trim()}>
        {adding ? <SpinnerGap size={11} className="spin" /> : 'Add'}
      </button>
      <button className="btn-ghost btn-xs" onClick={() => setVisible(false)}>Cancel</button>
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────
export default function PipelineStageManager({ projectId, stages: initialStages, onClose, onSaved }) {
  const [allStages,       setAllStages]       = useState([])
  const [hiddenExpanded,  setHiddenExpanded]  = useState(false)
  const [loading,         setLoading]         = useState(true)

  // Load all stages (including hidden) when modal opens
  useEffect(() => {
    productionApi.listAllPipelineStages(projectId)
      .then(r => setAllStages(r.stages || []))
      .catch(() => setAllStages(initialStages))
      .finally(() => setLoading(false))
  }, [projectId])

  const active = allStages.filter(s => !s.is_hidden)
  const hidden = allStages.filter(s => s.is_hidden)

  function notifyParent(stages) {
    const visibleStages = stages.filter(s => !s.is_hidden)
    onSaved(visibleStages)
  }

  async function handleUpdate(id, body) {
    const r = await productionApi.updatePipelineStage(id, body)
    const updated = allStages.map(s => s.id === id ? r.stage : s)
    setAllStages(updated)
    notifyParent(updated)
  }

  async function handleHide(id) {
    const r = await productionApi.hideStage(id)
    const updated = allStages.map(s => s.id === id ? r.stage : s)
    setAllStages(updated)
    notifyParent(updated)
  }

  async function handleShow(id) {
    const r = await productionApi.showStage(id)
    const updated = allStages.map(s => s.id === id ? r.stage : s)
    setAllStages(updated)
    notifyParent(updated)
  }

  async function handleDelete(id, stageName) {
    await productionApi.deletePipelineStage(id)
    const updated = allStages.filter(s => s.id !== id)
    setAllStages(updated)
    notifyParent(updated)
  }

  async function handleAdd(body) {
    const r = await productionApi.createPipelineStage(projectId, {
      ...body,
      order_index: active.length,
    })
    const updated = [...allStages, r.stage]
    setAllStages(updated)
    notifyParent(updated)
  }

  async function applyPreset(preset) {
    if (!window.confirm(`Apply "${preset.name}" preset? This will add ${preset.stages.length} stages.`)) return
    for (let i = 0; i < preset.stages.length; i++) {
      const r = await productionApi.createPipelineStage(projectId, {
        name: preset.stages[i],
        color: PRESET_COLORS[i % PRESET_COLORS.length],
        cell_type: 'checkbox',
        status_options: [],
        order_index: allStages.length + i,
        is_final_stage: i === preset.stages.length - 1,
      })
      setAllStages(prev => [...prev, r.stage])
    }
    const r2 = await productionApi.listAllPipelineStages(projectId)
    const updated = r2.stages || []
    setAllStages(updated)
    notifyParent(updated)
  }

  return (
    <div className="psm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="psm-panel">
        <div className="psm-header">
          <span className="psm-title">Pipeline Stages</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="psm-body">
          {loading ? (
            <div className="psm-loading"><SpinnerGap size={20} className="spin" /></div>
          ) : (
            <>
              {/* Active columns */}
              <div className="psm-section-label">Active Columns</div>
              {active.length === 0 && (
                <div className="psm-empty">
                  <p>No active stages. Add one below or use a preset.</p>
                  <div className="psm-presets">
                    {PRESETS.map(p => (
                      <button key={p.name} className="btn-ghost psm-preset-btn" onClick={() => applyPreset(p)}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="psm-stages-list">
                {active.map(s => (
                  <ActiveStageRow
                    key={s.id}
                    stage={s}
                    onHide={handleHide}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                  />
                ))}
              </div>

              <AddStageRow onAdd={handleAdd} />

              {active.length > 0 && (
                <details className="psm-presets-details">
                  <summary className="psm-presets-summary">Apply a preset</summary>
                  <div className="psm-presets">
                    {PRESETS.map(p => (
                      <button key={p.name} className="btn-ghost psm-preset-btn" onClick={() => applyPreset(p)}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </details>
              )}

              {/* Hidden columns */}
              {hidden.length > 0 && (
                <div className="psm-hidden-section">
                  <button
                    className="psm-section-label psm-section-label--btn"
                    onClick={() => setHiddenExpanded(v => !v)}
                  >
                    {hiddenExpanded ? <CaretDown size={11} /> : <CaretRight size={11} />}
                    Hidden Columns ({hidden.length})
                  </button>
                  {hiddenExpanded && (
                    <div className="psm-stages-list psm-stages-list--hidden">
                      {hidden.map(s => (
                        <HiddenStageRow
                          key={s.id}
                          stage={s}
                          onShow={handleShow}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="psm-footer">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
