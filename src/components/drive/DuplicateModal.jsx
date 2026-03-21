import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Warning } from '@phosphor-icons/react'
import { useUpload } from '../../context/UploadContext'
import FileTypeIcon from './FileTypeIcon'

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ACTIONS = ['replace', 'keepboth', 'skip']
const ACTION_LABELS = { replace: 'Replace', keepboth: 'Keep Both', skip: 'Skip' }

export default function DuplicateModal() {
  const { pendingDuplicates, resolveDuplicates, dismissDuplicates } = useUpload()
  if (!pendingDuplicates) return null

  const { files, existingFiles } = pendingDuplicates
  return (
    <DuplicateModalInner
      files={files}
      existingFiles={existingFiles}
      onResolve={resolveDuplicates}
      onCancel={dismissDuplicates}
    />
  )
}

function DuplicateModalInner({ files, existingFiles, onResolve, onCancel }) {
  const initial = Object.fromEntries(files.map(f => [f.name, 'keepboth']))
  const [decisions, setDecisions] = useState(initial)

  function setAll(action) {
    setDecisions(Object.fromEntries(files.map(f => [f.name, action])))
  }

  function handleContinue() {
    const resolved = files.map(f => {
      const existing = (existingFiles || []).find(e => e.name?.toLowerCase() === f.name?.toLowerCase())
      return { file: f, action: decisions[f.name], existingId: existing?.id }
    })
    onResolve(resolved)
  }

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="modal-box"
        style={{ maxWidth: 520 }}
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Warning size={16} weight="fill" color="#f59e0b" />
            <h3 style={{ margin: 0 }}>Duplicate files found</h3>
          </div>
          <button className="icon-btn" onClick={onCancel}><X size={15} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--t2)', margin: '0 0 12px' }}>
          These files already exist in this folder. Choose what to do with each:
        </p>

        {/* Bulk actions */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--t3)', alignSelf: 'center', marginRight: 4 }}>Apply to all:</span>
          {ACTIONS.map(a => (
            <button key={a} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setAll(a)}>
              {ACTION_LABELS[a]}
            </button>
          ))}
        </div>

        {/* Per-file list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {files.map(f => {
            const existing = (existingFiles || []).find(e => e.name?.toLowerCase() === f.name?.toLowerCase())
            return (
              <div key={f.name} style={{
                background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <FileTypeIcon fileName={f.name} mimeType={f.type} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                      New: {formatSize(f.size)}
                      {existing && <> · Existing: {formatSize(existing.file_size)}</>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ACTIONS.map(a => (
                    <label key={a} style={{
                      display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                      fontSize: 12, color: decisions[f.name] === a ? 'var(--accent)' : 'var(--t2)',
                    }}>
                      <input
                        type="radio"
                        name={`dup-${f.name}`}
                        value={a}
                        checked={decisions[f.name] === a}
                        onChange={() => setDecisions(d => ({ ...d, [f.name]: a }))}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      {ACTION_LABELS[a]}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleContinue}>Continue Upload</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
