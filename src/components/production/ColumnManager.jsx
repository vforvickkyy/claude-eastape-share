import React, { useState, useRef, useEffect } from 'react'
import { X, Trash, DotsSixVertical, Plus, SpinnerGap, Eye, EyeSlash } from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'

const PRESET_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981','#84cc16',
  '#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b',
]

const TYPE_OPTS = [
  { value: 'text',     label: 'Text'     },
  { value: 'number',   label: 'Number'   },
  { value: 'date',     label: 'Date'     },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select',   label: 'Select'   },
]

// ── Color picker dot ──────────────────────────────────────────────────
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
        style={{ width: 18, height: 18, borderRadius: '50%', background: color, border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer', flexShrink: 0 }}
        title="Change color"
      />
      {open && (
        <div style={{ position: 'absolute', left: 0, top: 24, zIndex: 9999, background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5,20px)', gap: 5 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }}
              style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: color === c ? '2px solid #fff' : 'none', outlineOffset: 2 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Column row ────────────────────────────────────────────────────────
function ColRow({ col, isHidden, onHide, onShow, onDelete, onUpdate, isDragging, isOver }) {
  const [name,       setName]       = useState(col.name)
  const [color,      setColor]      = useState(col.color || '#6366f1')
  const [type,       setType]       = useState(col.type || 'text')
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const orig  = useRef({ name: col.name, color: col.color || '#6366f1', type: col.type || 'text' })
  const dirty = name !== orig.current.name || color !== orig.current.color || type !== orig.current.type

  async function save(overrides = {}) {
    const n = overrides.name  ?? name
    const c = overrides.color ?? color
    const t = overrides.type  ?? type
    if (!n.trim() || saving) return
    setSaving(true)
    try {
      await onUpdate(col.id, { name: n.trim(), color: c, type: t })
      orig.current = { name: n.trim(), color: c, type: t }
    } finally { setSaving(false) }
  }

  if (confirmDel) return (
    <div style={{ background: '#1e1225', border: '1px solid #ef444455', borderRadius: 10, padding: '10px 14px', margin: '3px 0' }}>
      <div style={{ fontSize: 13, color: '#f87171', marginBottom: 8 }}>
        Delete <strong>{col.name}</strong>? All data in this column will be lost.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost btn-xs" onClick={() => setConfirmDel(false)}>Cancel</button>
        <button
          onClick={() => onDelete(col.id)}
          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
          Delete permanently
        </button>
      </div>
    </div>
  )

  return (
    <div style={{
      background: isDragging ? '#2a2a4a' : isOver ? '#1a2a3a' : isHidden ? '#111120' : '#16162a',
      border: `1px solid ${isOver ? '#6366f1' : isHidden ? '#1e1e2e' : '#2a2a3a'}`,
      borderRadius: 10, margin: '3px 0',
      opacity: isDragging ? 0.5 : isHidden ? 0.65 : 1,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
        {/* Drag handle */}
        <span style={{ color: 'var(--t4)', cursor: 'grab', display: 'flex', flexShrink: 0 }}>
          <DotsSixVertical size={15} weight="bold" />
        </span>

        <ColorDot color={color} onChange={c => { setColor(c); save({ color: c }) }} />

        {/* Name */}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          onBlur={() => { if (dirty) save() }}
          style={{ flex: 1, background: 'transparent', border: 'none', color: isHidden ? '#888' : '#e8e8ff', fontSize: 13, fontWeight: 500, outline: 'none', minWidth: 60 }}
        />

        {/* Type */}
        <select
          value={type}
          onChange={e => { setType(e.target.value); save({ type: e.target.value }) }}
          style={{ background: '#1e1e30', border: '1px solid #333', borderRadius: 6, color: '#aaa', fontSize: 11, padding: '3px 6px', cursor: 'pointer', flexShrink: 0 }}
        >
          {TYPE_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        {/* Save badge */}
        {dirty && (
          <button onClick={save} disabled={saving}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
            {saving ? <SpinnerGap size={11} className="spin" /> : 'Save'}
          </button>
        )}

        {/* Hide / Show */}
        {isHidden ? (
          <button type="button" title="Show column" onClick={() => onShow(col.id)}
            style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = '#10b981'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
          ><Eye size={14} /></button>
        ) : (
          <button type="button" title="Hide column" onClick={() => onHide(col.id)}
            style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
          ><EyeSlash size={14} /></button>
        )}

        {/* Delete */}
        <button type="button" title="Delete column" onClick={() => setConfirmDel(true)}
          style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
        ><Trash size={13} /></button>
      </div>
    </div>
  )
}

// ── Add column row ────────────────────────────────────────────────────
function AddColRow({ onAdd }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [color,  setColor]  = useState('#6366f1')
  const [type,   setType]   = useState('text')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    if (!name.trim() || adding) return
    setAdding(true)
    try {
      await onAdd({ name: name.trim(), color, type })
      setName(''); setColor('#6366f1'); setType('text'); setOpen(false)
    } finally { setAdding(false) }
  }

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: '1px dashed #333', borderRadius: 8, color: 'var(--t4)', padding: '8px 14px', cursor: 'pointer', fontSize: 12, margin: '6px 0' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#a5b4fc' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = 'var(--t4)' }}
    >
      <Plus size={13} /> Add Column
    </button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#16162a', border: '1px solid #6366f1', borderRadius: 10, margin: '4px 0' }}>
      <ColorDot color={color} onChange={setColor} />
      <input
        autoFocus value={name} placeholder="Column name…"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false) }}
        style={{ flex: 1, background: 'transparent', border: 'none', color: '#e8e8ff', fontSize: 13, outline: 'none' }}
      />
      <select value={type} onChange={e => setType(e.target.value)}
        style={{ background: '#1e1e30', border: '1px solid #333', borderRadius: 6, color: '#aaa', fontSize: 11, padding: '3px 6px', cursor: 'pointer' }}>
        {TYPE_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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

// ── Main ColumnManager modal ──────────────────────────────────────────
export default function ColumnManager({ projectId, columns: initialCols, hiddenCols = {}, onToggleHide, onClose, onSaved }) {
  const [cols,    setCols]  = useState([...initialCols].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
  const dragIdx  = useRef(null)
  const [overIdx, setOverIdx] = useState(null)

  async function handleUpdate(id, body) {
    const updated = cols.map(c => c.id === id ? { ...c, ...body } : c)
    setCols(updated)
    onSaved(updated)
    await productionApi.updateColumn(id, body).catch(() => {})
  }

  async function handleDelete(id) {
    const updated = cols.filter(c => c.id !== id)
    setCols(updated)
    onSaved(updated)
    await productionApi.deleteColumn(id).catch(() => {})
  }

  async function handleAdd(body) {
    const res     = await productionApi.createColumn(projectId, { ...body, position: cols.length })
    const updated = [...cols, res.column]
    setCols(updated)
    onSaved(updated)
  }

  // ── Drag reorder ──────────────────────────────────────────────────
  function onDragStart(idx) { dragIdx.current = idx }
  function onDragOver(e, idx) { e.preventDefault(); setOverIdx(idx) }
  function onDragLeave() { setOverIdx(null) }

  async function onDrop(dropIdx) {
    const from = dragIdx.current
    dragIdx.current = null; setOverIdx(null)
    if (from === null || from === dropIdx) return

    const reordered = [...cols]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(dropIdx, 0, moved)
    const withPos = reordered.map((c, i) => ({ ...c, position: i }))

    setCols(withPos)
    onSaved(withPos)

    // Persist positions in background
    withPos.forEach(c => productionApi.updateColumn(c.id, { position: c.position }).catch(() => {}))
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: 14, width: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e1e2e' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#e8e8ff' }}>List Columns</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Fixed columns (always visible) */}
          <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Fixed columns
          </div>
          {[
            { label: 'Thumbnail', color: '#404050' },
            { label: 'Shot Name', color: '#6366f1' },
            { label: 'Status',    color: '#10b981' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#111120', border: '1px solid #1e1e2e', borderRadius: 10, margin: '3px 0', opacity: 0.6 }}>
              <span style={{ color: 'var(--t4)', display: 'flex', flexShrink: 0 }}><DotsSixVertical size={15} weight="bold" /></span>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#888' }}>{f.label}</span>
              <span style={{ fontSize: 10, color: 'var(--t4)', background: '#1e1e30', border: '1px solid #2a2a3a', borderRadius: 5, padding: '3px 8px' }}>Fixed</span>
            </div>
          ))}

          {/* Custom columns */}
          <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, margin: '16px 0 8px' }}>
            Custom columns — drag to reorder
          </div>

          {cols.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--t3)', padding: '8px 0 4px' }}>
              No custom columns yet. Add one below.
            </div>
          )}

          <div>
            {cols.map((col, idx) => (
              <div
                key={col.id}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDragLeave={onDragLeave}
                onDrop={() => onDrop(idx)}
              >
                <ColRow
                  col={col}
                  isHidden={!!hiddenCols[col.id]}
                  onHide={id => onToggleHide(id, true)}
                  onShow={id => onToggleHide(id, false)}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                  isDragging={dragIdx.current === idx}
                  isOver={overIdx === idx && dragIdx.current !== idx}
                />
              </div>
            ))}
          </div>

          <AddColRow onAdd={handleAdd} />
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e1e2e', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-primary" style={{ padding: '8px 24px', fontSize: 13 }}>Done</button>
        </div>
      </div>
    </div>
  )
}
