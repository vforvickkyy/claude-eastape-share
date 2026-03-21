import React, { useState } from 'react'
import { X, Trash, Plus, Check } from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'

const TYPE_OPTS = [
  { value: 'text',     label: 'Text'     },
  { value: 'number',   label: 'Number'   },
  { value: 'date',     label: 'Date'     },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select',   label: 'Select'   },
]

export default function ColumnManager({ projectId, columns, onClose, onSaved }) {
  const [cols,    setCols]    = useState(columns)
  const [saving,  setSaving]  = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('text')

  async function addColumn() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await productionApi.createColumn(projectId, { name: newName.trim(), type: newType, position: cols.length })
      const updated = [...cols, res.column]
      setCols(updated)
      onSaved(updated)
      setNewName('')
      setNewType('text')
    } catch {}
    setSaving(false)
  }

  async function deleteColumn(id) {
    await productionApi.deleteColumn(id).catch(() => {})
    const updated = cols.filter(c => c.id !== id)
    setCols(updated)
    onSaved(updated)
  }

  async function updateColumn(id, body) {
    await productionApi.updateColumn(id, body).catch(() => {})
    const updated = cols.map(c => c.id === id ? { ...c, ...body } : c)
    setCols(updated)
    onSaved(updated)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Manage Columns</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '0 0 12px' }}>
          {cols.map(col => (
            <div key={col.id} className="col-mgr-row">
              <input
                className="input-field"
                defaultValue={col.name}
                onBlur={e => e.target.value.trim() && e.target.value !== col.name && updateColumn(col.id, { name: e.target.value.trim() })}
                style={{ flex: 1 }}
              />
              <select
                className="input-field"
                defaultValue={col.type}
                onChange={e => updateColumn(col.id, { type: e.target.value })}
                style={{ width: 110 }}
              >
                {TYPE_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button className="icon-btn danger" onClick={() => deleteColumn(col.id)}>
                <Trash size={14} />
              </button>
            </div>
          ))}

          {/* Add row */}
          <div className="col-mgr-row col-mgr-add">
            <input
              className="input-field"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Column name…"
              style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') addColumn() }}
            />
            <select
              className="input-field"
              value={newType}
              onChange={e => setNewType(e.target.value)}
              style={{ width: 110 }}
            >
              {TYPE_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button className="btn-primary-sm" onClick={addColumn} disabled={saving || !newName.trim()}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div style={{ padding: '8px 16px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
