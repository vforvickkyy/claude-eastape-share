import React, { useState } from 'react'
import {
  X, Trash, DotsSixVertical, Plus, SpinnerGap, CheckFat,
} from '@phosphor-icons/react'
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
  {
    name: 'Standard Production',
    stages: ['Pre-Production', 'Shooting', 'Rough Cut', 'Review', 'Final Cut', 'Delivery'],
  },
  {
    name: 'Animation Pipeline',
    stages: ['Concept', 'Storyboard', 'Animatic', 'Animation', 'Compositing', 'Output'],
  },
  {
    name: 'Simple 3-Stage',
    stages: ['In Progress', 'Review', 'Done'],
  },
]

function ColorDot({ color, selected, onClick }) {
  return (
    <button
      className={`psm-color-dot ${selected ? 'psm-color-dot--selected' : ''}`}
      style={{ background: color }}
      onClick={onClick}
      type="button"
      title={color}
    >
      {selected && <CheckFat size={10} weight="fill" style={{ color: '#fff' }} />}
    </button>
  )
}

function StatusOptionRow({ opt, onChange, onRemove }) {
  return (
    <div className="psm-sopt-row">
      <input
        type="color"
        className="psm-sopt-color"
        value={opt.color}
        onChange={e => onChange({ ...opt, color: e.target.value })}
        title="Option color"
      />
      <input
        className="psm-sopt-input"
        value={opt.label}
        onChange={e => onChange({ ...opt, label: e.target.value })}
        placeholder="Option label…"
      />
      <button className="psm-sopt-remove" onClick={onRemove} type="button" title="Remove">
        <X size={11} />
      </button>
    </div>
  )
}

function StageRow({ stage, onDelete, onUpdate }) {
  const [editing,       setEditing]       = useState(false)
  const [name,          setName]          = useState(stage.name)
  const [color,         setColor]         = useState(stage.color || '#6366f1')
  const [cellType,      setCellType]      = useState(stage.cell_type || 'checkbox')
  const [statusOptions, setStatusOptions] = useState(
    Array.isArray(stage.status_options) && stage.status_options.length > 0
      ? stage.status_options
      : DEFAULT_STATUS_OPTIONS
  )
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onUpdate(stage.id, {
        name: name.trim(),
        color,
        cell_type: cellType,
        status_options: cellType === 'status' ? statusOptions : [],
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function addStatusOption() {
    setStatusOptions(prev => [...prev, { label: '', color: '#6366f1' }])
  }
  function removeStatusOption(i) {
    setStatusOptions(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateStatusOption(i, opt) {
    setStatusOptions(prev => prev.map((o, idx) => idx === i ? opt : o))
  }

  const cellTypeLabel = CELL_TYPES.find(t => t.id === (stage.cell_type || 'checkbox'))?.label || '☑ Checkbox'

  return (
    <div className="psm-stage-row">
      <span className="psm-drag-handle"><DotsSixVertical size={14} weight="bold" /></span>

      {editing ? (
        <div className="psm-stage-edit">
          <div className="psm-stage-edit-top">
            <input
              className="psm-stage-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
              placeholder="Stage name…"
            />
            <select
              className="psm-type-select"
              value={cellType}
              onChange={e => setCellType(e.target.value)}
            >
              {CELL_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="psm-color-row">
            {PRESET_COLORS.map(c => (
              <ColorDot key={c} color={c} selected={color === c} onClick={() => setColor(c)} />
            ))}
          </div>

          {cellType === 'status' && (
            <div className="psm-status-opts">
              <div className="psm-status-opts-label">Status options</div>
              {statusOptions.map((opt, i) => (
                <StatusOptionRow
                  key={i}
                  opt={opt}
                  onChange={updated => updateStatusOption(i, updated)}
                  onRemove={() => removeStatusOption(i)}
                />
              ))}
              <button className="psm-sopt-add" type="button" onClick={addStatusOption}>
                <Plus size={11} /> Add option
              </button>
            </div>
          )}

          <div className="psm-stage-edit-actions">
            <button className="btn-primary btn-xs" onClick={save} disabled={saving}>
              {saving ? <SpinnerGap size={12} className="spin" /> : 'Save'}
            </button>
            <button className="btn-ghost btn-xs" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <span className="psm-stage-dot" style={{ background: color }} />
          <span className="psm-stage-name" onClick={() => setEditing(true)}>{name}</span>
          <span className="psm-type-badge">{cellTypeLabel}</span>
          {stage.is_final_stage && <span className="psm-final-badge">Final</span>}
          <button className="psm-del-btn" onClick={() => onDelete(stage.id)} title="Delete stage">
            <Trash size={13} />
          </button>
        </>
      )}
    </div>
  )
}

export default function PipelineStageManager({ projectId, stages: initialStages, onClose, onSaved }) {
  const [stages,   setStages]   = useState(initialStages)
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newType,  setNewType]  = useState('checkbox')
  const [adding,   setAdding]   = useState(false)

  async function handleAdd() {
    if (!newName.trim() || adding) return
    setAdding(true)
    try {
      const r = await productionApi.createPipelineStage(projectId, {
        name: newName.trim(),
        color: newColor,
        cell_type: newType,
        status_options: newType === 'status' ? DEFAULT_STATUS_OPTIONS : [],
        order_index: stages.length,
      })
      const updated = [...stages, r.stage]
      setStages(updated)
      onSaved(updated)
      setNewName('')
      setNewColor('#6366f1')
      setNewType('checkbox')
    } finally {
      setAdding(false)
    }
  }

  async function handleUpdate(id, body) {
    const r = await productionApi.updatePipelineStage(id, body)
    const updated = stages.map(s => s.id === id ? r.stage : s)
    setStages(updated)
    onSaved(updated)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this pipeline stage? Shot progress data for this stage will be lost.')) return
    try {
      await productionApi.deletePipelineStage(id)
      const updated = stages.filter(s => s.id !== id)
      setStages(updated)
      onSaved(updated)
    } catch {}
  }

  async function applyPreset(preset) {
    if (!window.confirm(`Apply "${preset.name}" preset? This will add ${preset.stages.length} stages.`)) return
    const colors = PRESET_COLORS
    for (let i = 0; i < preset.stages.length; i++) {
      const r = await productionApi.createPipelineStage(projectId, {
        name: preset.stages[i],
        color: colors[i % colors.length],
        cell_type: 'checkbox',
        status_options: [],
        order_index: stages.length + i,
        is_final_stage: i === preset.stages.length - 1,
      })
      setStages(prev => [...prev, r.stage])
    }
    const r2 = await productionApi.listPipelineStages(projectId)
    setStages(r2.stages || [])
    onSaved(r2.stages || [])
  }

  return (
    <div className="psm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="psm-panel">
        <div className="psm-header">
          <span className="psm-title">Pipeline Stages</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="psm-body">
          {stages.length === 0 && (
            <div className="psm-empty">
              <p>No stages yet. Add one below or use a preset.</p>
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
            {stages.map(s => (
              <StageRow key={s.id} stage={s} onDelete={handleDelete} onUpdate={handleUpdate} />
            ))}
          </div>

          {/* Add new stage */}
          <div className="psm-add-row">
            <div className="psm-color-row">
              {PRESET_COLORS.map(c => (
                <ColorDot key={c} color={c} selected={newColor === c} onClick={() => setNewColor(c)} />
              ))}
            </div>
            <div className="psm-add-input-row">
              <input
                className="psm-stage-input"
                placeholder="New stage name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              />
              <select
                className="psm-type-select"
                value={newType}
                onChange={e => setNewType(e.target.value)}
              >
                {CELL_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <button className="btn-primary btn-xs" onClick={handleAdd} disabled={adding || !newName.trim()}>
                {adding ? <SpinnerGap size={12} className="spin" /> : <><Plus size={12} /> Add</>}
              </button>
            </div>
          </div>

          {stages.length > 0 && (
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
        </div>
      </div>
    </div>
  )
}
