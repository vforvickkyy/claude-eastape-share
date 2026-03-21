import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UploadSimple, CheckCircle, X, Warning, Minus,
} from '@phosphor-icons/react'
import { useUpload } from '../../context/UploadContext'
import FileTypeIcon from './FileTypeIcon'

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusIcon({ status }) {
  if (status === 'done')      return <CheckCircle size={14} weight="fill" color="#10b981" />
  if (status === 'error')     return <Warning size={14} weight="fill" color="#ef4444" />
  if (status === 'cancelled') return <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>
  return null
}

export default function UploadProgressPanel() {
  const {
    uploads, isMinimized, isVisible,
    activeCount, doneCount, totalCount, overallPct,
    cancelUpload, clearCompleted, dismissAll,
    toggleMinimize, clearAutoHide,
  } = useUpload()

  if (!isVisible || uploads.length === 0) return null

  const allDone = activeCount === 0 && uploads.every(u => u.status !== 'pending')
  const headerLabel = allDone
    ? `${doneCount} upload${doneCount !== 1 ? 's' : ''} complete`
    : `Uploading ${activeCount} of ${totalCount} file${totalCount !== 1 ? 's' : ''}`

  return (
    <AnimatePresence>
      <motion.div
        key="upload-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.25 }}
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, width: isMinimized ? 'auto' : 320 }}
        onMouseEnter={clearAutoHide}
      >
        {isMinimized ? (
          /* ── Pill ── */
          <button
            onClick={toggleMinimize}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 999, padding: '0 16px', height: 40, cursor: 'pointer',
              color: 'var(--t1)', fontSize: 13,
            }}
          >
            <UploadSimple size={15} weight="duotone" color="#7c3aed" />
            <span>{allDone ? `${doneCount} done` : `${overallPct}%`}</span>
            <span style={{ color: 'var(--t3)', fontSize: 11 }}>{headerLabel}</span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, marginLeft: 4 }}
              onClick={e => { e.stopPropagation(); dismissAll() }}
            >
              <X size={13} color="var(--t3)" />
            </button>
          </button>
        ) : (
          /* ── Full panel ── */
          <div style={{
            background: '#13131a', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: '#1a1a24',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UploadSimple size={15} weight="duotone" color="#7c3aed" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{headerLabel}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {allDone && (
                  <button
                    className="icon-btn"
                    onClick={clearCompleted}
                    title="Clear completed"
                    style={{ fontSize: 11, color: 'var(--t3)' }}
                  >
                    Clear
                  </button>
                )}
                <button className="icon-btn" onClick={toggleMinimize} title="Minimize">
                  <Minus size={13} />
                </button>
                <button className="icon-btn" onClick={dismissAll} title="Close">
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* File list */}
            <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
              {uploads.map((u, i) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  style={{ padding: '6px 14px' }}
                  className="upload-row"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileTypeIcon fileName={u.name} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 4,
                      }}>
                        <span style={{
                          fontSize: 12, color: 'var(--t1)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: 175,
                        }}>{u.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {u.status === 'uploading' && (
                            <>
                              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{u.progress}%</span>
                              <button
                                className="icon-btn"
                                onClick={() => cancelUpload(u.id)}
                                style={{ opacity: 0.5 }}
                                title="Cancel"
                              >
                                <X size={11} />
                              </button>
                            </>
                          )}
                          <StatusIcon status={u.status} />
                          {u.status === 'error' && (
                            <span style={{ fontSize: 10, color: '#ef4444', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {u.error}
                            </span>
                          )}
                          {u.status === 'cancelled' && (
                            <span style={{ fontSize: 10, color: 'var(--t3)' }}>Cancelled</span>
                          )}
                        </div>
                      </div>
                      {(u.status === 'uploading' || u.status === 'pending') && (
                        <div style={{
                          marginTop: 4, height: 3, borderRadius: 2,
                          background: 'rgba(255,255,255,0.08)',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${u.progress}%`,
                            background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
                            transition: 'width 0.2s',
                          }} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer overall bar */}
            {!allDone && (
              <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{doneCount} of {totalCount} complete</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{overallPct}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${overallPct}%`,
                    background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
