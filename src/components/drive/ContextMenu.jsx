/**
 * ContextMenu — right-click / ··· menu for Drive items.
 * Rendered as a portal so it always appears on top and
 * can position itself outside the scrolling content area.
 */
import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  // Position: keep inside viewport
  const menuW = 210
  const menuH = items.filter(i => !i.divider).length * 34 + items.filter(i => i.divider).length * 9 + 12
  const left = x + menuW > window.innerWidth  ? x - menuW : x
  const top  = y + menuH > window.innerHeight ? y - menuH : y

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    function onKey(e)  { if (e.key === 'Escape') onClose() }
    function onScroll() { onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const menu = (
    <div
      ref={ref}
      onContextMenu={e => e.preventDefault()}
      style={{
        position: 'fixed', left, top, zIndex: 9000,
        background: 'var(--bg-2)',
        border: '1px solid var(--line-2)',
        borderRadius: 11, padding: '5px',
        minWidth: menuW,
        boxShadow: '0 16px 48px rgba(0,0,0,0.65)',
        animation: 'ctxIn 0.12s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '3px 0' }} />
        ) : (
          <button
            key={i}
            onClick={e => { e.stopPropagation(); item.onClick() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '0 10px', height: 33,
              background: 'none', border: 'none', cursor: 'pointer',
              borderRadius: 7, fontSize: 13,
              color: item.danger ? '#f87171' : 'rgba(255,255,255,0.82)',
              gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: item.danger ? '#f87171' : 'rgba(255,255,255,0.5)', minWidth: 0 }}>
              {item.icon}
              <span style={{ color: item.danger ? '#f87171' : 'rgba(255,255,255,0.85)', fontSize: 13 }}>{item.label}</span>
            </span>
            {item.hint && (
              <span style={{
                fontSize: 10.5, color: 'rgba(255,255,255,0.25)',
                fontFamily: 'var(--mono, monospace)',
                background: 'rgba(255,255,255,0.06)',
                padding: '1px 5px', borderRadius: 4,
                flexShrink: 0,
              }}>{item.hint}</span>
            )}
          </button>
        )
      )}
      <style>{`@keyframes ctxIn{from{opacity:0;transform:scale(0.96) translateY(-4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  )

  return ReactDOM.createPortal(menu, document.body)
}
