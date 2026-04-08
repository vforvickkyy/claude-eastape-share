/**
 * Toast notification system.
 * Usage: import { showToast } from '../ui/Toast'
 *        showToast('Message', 'success')
 *        showToast('Undo?', 'info', { action: { label: 'Undo', onClick: fn }, duration: 5000 })
 *
 * Wrap app root with <ToastProvider> once.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle, Warning, Info, X } from '@phosphor-icons/react'

const ToastContext = createContext(null)

// Global singleton so showToast() works outside React tree
const _bus = { fn: null }
export function showToast(message, type = 'info', opts = {}) {
  _bus.fn?.(message, type, opts)
}

const ICONS = {
  success: <CheckCircle size={16} weight="fill" style={{ color: '#10b981', flexShrink: 0 }} />,
  error:   <Warning    size={16} weight="fill" style={{ color: '#ef4444', flexShrink: 0 }} />,
  warning: <Warning    size={16} weight="fill" style={{ color: '#f59e0b', flexShrink: 0 }} />,
  info:    <Info       size={16} weight="fill" style={{ color: '#3b82f6', flexShrink: 0 }} />,
}
const BG = {
  success: 'rgba(16,185,129,0.12)',
  error:   'rgba(239,68,68,0.12)',
  warning: 'rgba(245,158,11,0.12)',
  info:    'rgba(59,130,246,0.12)',
}
const BORDER = {
  success: 'rgba(16,185,129,0.25)',
  error:   'rgba(239,68,68,0.25)',
  warning: 'rgba(245,158,11,0.25)',
  info:    'rgba(59,130,246,0.25)',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((message, type = 'info', opts = {}) => {
    const id = crypto.randomUUID()
    const duration = opts.duration ?? 3500
    setToasts(prev => [...prev.slice(-4), { id, message, type, action: opts.action || null }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
  }, [])

  const remove = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  useEffect(() => { _bus.fn = show; return () => { _bus.fn = null } }, [show])

  return (
    <ToastContext.Provider value={{ show, remove }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: BG[t.type] || BG.info,
              border: `1px solid ${BORDER[t.type] || BORDER.info}`,
              borderRadius: 10, padding: '10px 14px',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
              minWidth: 260, maxWidth: 380,
              pointerEvents: 'auto',
              animation: 'toastIn 0.2s ease',
            }}
          >
            {ICONS[t.type]}
            <span style={{ fontSize: 13, color: '#fff', flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action.onClick(); remove(t.id) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: '#a78bfa', fontWeight: 600,
                  padding: '0 4px', flexShrink: 0, whiteSpace: 'nowrap',
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => remove(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(-12px) scale(0.96)}to{opacity:1;transform:none}}`}</style>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
