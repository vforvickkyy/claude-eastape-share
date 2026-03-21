import React, { useState, useRef, useEffect } from 'react'
import { X, Trash, DotsSixVertical, Plus, SpinnerGap, Eye, EyeSlash, CaretDown, CaretRight } from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'

const PRESET_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981','#84cc16',
  '#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b',
]
const CELL_TYPES = [
  { id: 'checkbox',   label: 'Checkbox'   },
  { id: 'percentage', label: 'Percentage' },
  { id: 'status',     label: 'Status'     },
]
const DEFAULT_STATUS_OPTIONS = [
  { label: 'Done',        color: '#10b981' },
  { label: 'In Progress', color: '#f59e0b' },
  { label: 'Pending',     color: '#64748b' },
]
const PRESETS = [
  { name: 'Standard Production', stages: ['Pre-Production','Shooting','Rough Cut','Review','Final Cut','Delivery'] },
  { name: 'Animation Pipeline',  stages: ['Concept','Storyboard','Animatic','Animation','Compositing','Output'] },
  { name: 'Simple 3-Stage',      stages: ['In Progress','Review','Done'] },
]

// ── Tiny color dot (click to pick) ─────────────────────────────────
function ColorDot({ color, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    if (!open) return
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div style={{ position: 'relative', flexShrink: 0 }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: 18, height: 18, borderRadius: '50%', background: color,
          border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer', flexShrink: 0,
        }}
        title="Change color"
      />
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: 24, zIndex: 9999,
          background: '#1e1e2e', border: '1px solid #333', borderRadius: 8,
          padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5,20px)', gap: 5,
        }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c} type="button"
              onClick={() => { onChange(c); setOpen(false) }}
              style={{
                width: 20, height: 20, borderRadius: '50%', background: c, border: 'none',
                cursor: 'pointer', outline: color === c ? '2px solid #fff' : 'none', outlineOffset: 2,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Status options mini-editor ──────────────────────────────────────
function StatusOptsEditor({ options, onChange }) {
  return (
    <div style={{ padding: '8px 12px 4px 38px', borderTop: '1px solid #2a2a3a' }}>
      <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        Status options
      </div>
      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <input type="color" value={opt.color}
            onChange={e => onChange(options.map((o, idx) => idx === i ? { ...o, color: e.target.value } : o))}
            style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
          <input
            value={opt.label} placeholder="Label…"
            onChange={e => onChange(options.map((o, idx) => idx === i ? { ...o, label: e.target.value } : o))}
            style={{
              flex: 1, background: '#1a1a2e', border: '1px solid #333', borderRadius: 5,
              padding: '3px 8px', color: '#fff', fontSize: 12,
            }}
          />
          <button type="button" onClick={() => onChange(options.filter((_, idx) => idx !== i))}
            style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 2 }}>
            <X size={11} />
          </button>
        </div>
      ))}
      <button type="button"
        onClick={() => onChange([...options, { label: '', color: '#6366f1' }])}
        style={{ fontSize: 11, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Plus size={10} /> Add option
      </button>
    </div>
  )
}

// ── Active Stage Row ────────────────────────────────────────────────
function ActiveStageRow({ stage, onHide, onDelete, onUpdate, isDragging, isOver, dragHandleProps }) {
  const [name,    setName]    = useState(stage.name)
  const [color,   setColor]   = useState(stage.color || '#6366f1')
  const [type,    setType]    = useState(stage.cell_type || 'checkbox')
  const [sopts,   setSopts]   = useState(
    Array.isArray(stage.status_options) && stage.status_options.length
      ? stage.status_options : DEFAULT_STATUS_OPTIONS
  )
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const orig = useRef({ name: stage.name, color: stage.color || '#6366f1', type: stage.cell_type || 'checkbox' })
  const dirty = name !== orig.current.name || color !== orig.current.color || type !== orig.current.type

  async function save(overrides = {}) {
    const n = overrides.name ?? name
    const c = overrides.color ?? color
    const t = overrides.type ?? type
    const s = overrides.sopts ?? sopts
    if (!n.trim() || saving) return
    setSaving(true)
    try {
      await onUpdate(stage.id, { name: n.trim(), color: c, cell_type: t, status_options: t === 'status' ? s : [] })
      orig.current = { name: n.trim(), color: c, type: t }
    } finally { setSaving(false) }
  }

  async function handleTypeChange(newType) {
    setType(newType)
    // auto-save immediately so the change persists without needing to click Save
    await save({ type: newType })
  }

  if (confirmDel) return (
    <div style={{
      background: '#1e1225', border: '1px solid #ef444455', borderRadius: 10,
      padding: '10px 14px', margin: '3px 0',
    }}>
      <div style={{ fontSize: 13, color: '#f87171', marginBottom: 8 }}>
        Delete <strong>{stage.name}</strong> permanently? All progress data will be lost.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost btn-xs" onClick={() => setConfirmDel(false)}>Cancel</button>
        <button
          onClick={() => onDelete(stage.id)}
          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
          Delete permanently
        </button>
      </div>
    </div>
  )

  return (
    <div style={{
      background: isDragging ? '#2a2a4a' : isOver ? '#1a2a3a' : '#16162a',
      border: `1px solid ${isOver ? '#6366f1' : '#2a2a3a'}`,
      borderRadius: 10, margin: '3px 0',
      opacity: isDragging ? 0.5 : 1,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
        {/* Drag handle */}
        <span {...dragHandleProps} style={{ color: 'var(--t4)', cursor: 'grab', display: 'flex', flexShrink: 0 }}>
          <DotsSixVertical size={15} weight="bold" />
        </span>

        <ColorDot color={color} onChange={c => { setColor(c) }} />

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          onBlur={() => { if (dirty) save() }}
          style={{
            flex: 1, background: 'transparent', border: 'none', color: '#e8e8ff',
            fontSize: 13, fontWeight: 500, outline: 'none', minWidth: 60,
          }}
        />

        <select
          value={type}
          onChange={e => handleTypeChange(e.target.value)}
          style={{
            background: '#1e1e30', border: '1px solid #333', borderRadius: 6,
            color: '#aaa', fontSize: 11, padding: '3px 6px', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {CELL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        {dirty && (
          <button
            onClick={save} disabled={saving}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
            {saving ? <SpinnerGap size={11} className="spin" /> : 'Save'}
          </button>
        )}

        <button
          type="button" title="Hide column"
          onClick={() => onHide(stage.id)}
          style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
        >
          <EyeSlash size={14} />
        </button>

        <button
          type="button" title="Delete stage"
          onClick={() => setConfirmDel(true)}
          style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
        >
          <Trash size={13} />
        </button>
      </div>

      {type === 'status' && (
        <StatusOptsEditor options={sopts} onChange={o => { setSopts(o) }} />
      )}
    </div>
  )
}

// ── Hidden Stage Row ─────────────────────────────────────────────────
function HiddenStageRow({ stage, onShow, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const typeLabel = CELL_TYPES.find(t => t.id === (stage.cell_type || 'checkbox'))?.label || 'Checkbox'

  if (confirmDel) return (
    <div style={{ background: '#1e1225', border: '1px solid #ef444455', borderRadius: 8, padding: '8px 12px', margin: '2px 0' }}>
      <div style={{ fontSize: 12, color: '#f87171', marginBottom: 6 }}>Delete <strong>{stage.name}</strong>?</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn-ghost btn-xs" onClick={() => setConfirmDel(false)}>Cancel</button>
        <button onClick={() => onDelete(stage.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
          Delete
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, background: '#111120', margin: '2px 0', opacity: 0.7 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color || '#64748b', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: '#aaa' }}>{stage.name}</span>
      <span style={{ fontSize: 10, color: 'var(--t4)', background: '#1e1e30', borderRadius: 4, padding: '2px 6px' }}>{typeLabel}</span>
      <button type="button" title="Restore" onClick={() => onShow(stage.id)}
        style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3, display: 'flex' }}
        onMouseEnter={e => e.currentTarget.style.color = '#10b981'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
      ><Eye size={14} /></button>
      <button type="button" title="Delete" onClick={() => setConfirmDel(true)}
        style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3, display: 'flex' }}
        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
      ><Trash size={13} /></button>
    </div>
  )
}

// ── Add Stage Row ────────────────────────────────────────────────────
function AddStageRow({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [color,  setColor]  = useState('#6366f1')
  const [type,   setType]   = useState('checkbox')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    if (!name.trim() || adding) return
    setAdding(true)
    try {
      await onAdd({ name: name.trim(), color, cell_type: type, status_options: type === 'status' ? DEFAULT_STATUS_OPTIONS : [] })
      setName(''); setColor('#6366f1'); setType('checkbox'); setOpen(false)
    } finally { setAdding(false) }
  }

  if (!open) return (
    <button
      type="button" onClick={() => setOpen(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        background: 'none', border: '1px dashed #333', borderRadius: 8,
        color: 'var(--t4)', padding: '8px 14px', cursor: 'pointer', fontSize: 12, margin: '6px 0',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#a5b4fc' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = 'var(--t4)' }}
    >
      <Plus size={13} /> Add Stage
    </button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#16162a', border: '1px solid #6366f1', borderRadius: 10, margin: '4px 0' }}>
      <ColorDot color={color} onChange={setColor} />
      <input
        autoFocus value={name} placeholder="Stage name…"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false) }}
        style={{ flex: 1, background: 'transparent', border: 'none', color: '#e8e8ff', fontSize: 13, outline: 'none' }}
      />
      <select value={type} onChange={e => setType(e.target.value)}
        style={{ background: '#1e1e30', border: '1px solid #333', borderRadius: 6, color: '#aaa', fontSize: 11, padding: '3px 6px', cursor: 'pointer' }}>
        {CELL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <button onClick={handleAdd} disabled={adding || !name.trim()}
        style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', opacity: !name.trim() ? 0.5 : 1 }}>
        {adding ? <SpinnerGap size={11} className="spin" /> : 'Add'}
      </button>
      <button onClick={() => setOpen(false)}
        style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3 }}>
        <X size={14} />
      </button>
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────
export default function PipelineStageManager({ projectId, stages: initialStages, onClose, onSaved }) {
  const [allStages,      setAllStages]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [hiddenExpanded, setHiddenExpanded] = useState(false)

  // Drag state
  const dragIdx  = useRef(null)
  const [overIdx, setOverIdx] = useState(null)

  useEffect(() => {
    productionApi.listAllPipelineStages(projectId)
      .then(r => setAllStages(r.stages || []))
      .catch(() => setAllStages(initialStages))
      .finally(() => setLoading(false))
  }, [projectId])

  const active = allStages.filter(s => !s.is_hidden)
  const hidden = allStages.filter(s => s.is_hidden)

  function notify(stages) { onSaved(stages.filter(s => !s.is_hidden)) }

  async function handleUpdate(id, body) {
    const r = await productionApi.updatePipelineStage(id, body)
    const updated = allStages.map(s => s.id === id ? r.stage : s)
    setAllStages(updated); notify(updated)
  }

  async function handleHide(id) {
    // Optimistic
    const updated = allStages.map(s => s.id === id ? { ...s, is_hidden: true } : s)
    setAllStages(updated); notify(updated)
    try { await productionApi.hideStage(id) }
    catch { const r = await productionApi.listAllPipelineStages(projectId); setAllStages(r.stages || []) }
  }

  async function handleShow(id) {
    const updated = allStages.map(s => s.id === id ? { ...s, is_hidden: false } : s)
    setAllStages(updated); notify(updated)
    try { await productionApi.showStage(id) }
    catch { const r = await productionApi.listAllPipelineStages(projectId); setAllStages(r.stages || []) }
  }

  async function handleDelete(id) {
    const updated = allStages.filter(s => s.id !== id)
    setAllStages(updated); notify(updated)
    try { await productionApi.deletePipelineStage(id) }
    catch { const r = await productionApi.listAllPipelineStages(projectId); setAllStages(r.stages || []) }
  }

  async function handleAdd(body) {
    const r = await productionApi.createPipelineStage(projectId, { ...body, order_index: active.length })
    const updated = [...allStages, r.stage]
    setAllStages(updated); notify(updated)
  }

  // ── Drag reorder ─────────────────────────────────────────────────
  function onDragStart(idx) { dragIdx.current = idx }
  function onDragOver(e, idx) { e.preventDefault(); setOverIdx(idx) }
  function onDragLeave() { setOverIdx(null) }

  async function onDrop(dropIdx) {
    const from = dragIdx.current
    dragIdx.current = null; setOverIdx(null)
    if (from === null || from === dropIdx) return

    // Reorder active array
    const reordered = [...active]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(dropIdx, 0, moved)

    // Assign new order_index values
    const withNewOrder = reordered.map((s, i) => ({ ...s, order_index: i }))

    // Merge back into allStages (preserve hidden)
    const hiddenStages = allStages.filter(s => s.is_hidden)
    const updated = [...withNewOrder, ...hiddenStages]
    setAllStages(updated); notify(updated)

    // Save to DB
    try {
      await productionApi.reorderPipelineStages(projectId, withNewOrder.map((s, i) => ({ id: s.id, order_index: i })))
    } catch {
      const r = await productionApi.listAllPipelineStages(projectId)
      setAllStages(r.stages || [])
    }
  }

  async function applyPreset(preset) {
    if (!window.confirm(`Apply "${preset.name}" preset? This will add ${preset.stages.length} stages.`)) return
    for (let i = 0; i < preset.stages.length; i++) {
      await productionApi.createPipelineStage(projectId, {
        name: preset.stages[i], color: PRESET_COLORS[i % PRESET_COLORS.length],
        cell_type: 'checkbox', status_options: [], order_index: allStages.length + i,
        is_final_stage: i === preset.stages.length - 1,
      })
    }
    const r2 = await productionApi.listAllPipelineStages(projectId)
    const updated = r2.stages || []
    setAllStages(updated); notify(updated)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: 14,
        width: 580, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e1e2e' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#e8e8ff' }}>Pipeline Stages</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <SpinnerGap size={24} className="spin" style={{ color: '#6366f1' }} />
            </div>
          ) : (
            <>
              {/* Active columns label */}
              <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Active Columns
              </div>

              {active.length === 0 && (
                <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 12 }}>
                  No active stages. Add one below or use a preset:
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {PRESETS.map(p => (
                      <button key={p.name} onClick={() => applyPreset(p)}
                        style={{ background: '#1e1e30', border: '1px solid #333', borderRadius: 6, color: '#aaa', fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Draggable active list */}
              <div>
                {active.map((s, idx) => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={e => onDragOver(e, idx)}
                    onDragLeave={onDragLeave}
                    onDrop={() => onDrop(idx)}
                  >
                    <ActiveStageRow
                      stage={s}
                      onHide={handleHide}
                      onDelete={handleDelete}
                      onUpdate={handleUpdate}
                      isDragging={dragIdx.current === idx}
                      isOver={overIdx === idx && dragIdx.current !== idx}
                      dragHandleProps={{}}
                    />
                  </div>
                ))}
              </div>

              <AddStageRow onAdd={handleAdd} />

              {active.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11, color: 'var(--t4)', cursor: 'pointer', marginBottom: 6, userSelect: 'none' }}>
                    Apply a preset
                  </summary>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {PRESETS.map(p => (
                      <button key={p.name} onClick={() => applyPreset(p)}
                        style={{ background: '#1e1e30', border: '1px solid #333', borderRadius: 6, color: '#aaa', fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </details>
              )}

              {/* Hidden columns */}
              {hidden.length > 0 && (
                <div style={{ marginTop: 16, borderTop: '1px solid #1e1e2e', paddingTop: 12 }}>
                  <button
                    onClick={() => setHiddenExpanded(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}
                  >
                    {hiddenExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
                    Hidden Columns ({hidden.length})
                  </button>
                  {hiddenExpanded && hidden.map(s => (
                    <HiddenStageRow key={s.id} stage={s} onShow={handleShow} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e1e2e', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-primary" style={{ padding: '8px 24px', fontSize: 13 }}>Done</button>
        </div>
      </div>
    </div>
  )
}
