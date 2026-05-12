import React from 'react'
import { useUpload } from '../../context/UploadContext'

function fmtSpeed(bps) {
  if (!bps || bps <= 0) return null
  if (bps < 1024)        return `${bps} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}
function fmtEta(sec) {
  if (!sec || sec <= 0) return null
  if (sec < 60)  return `${sec}s left`
  const m = Math.floor(sec / 60), s = sec % 60
  if (m < 60)    return s > 0 ? `${m}m ${s}s left` : `${m}m left`
  return `${Math.floor(m / 60)}h ${m % 60}m left`
}

function typeIcon(name) {
  const ext = (name?.split('.').pop() || '').toLowerCase()
  if (['mp4','mov','avi','mkv','webm','r3d','mxf'].includes(ext)) return 'video'
  if (['mp3','wav','ogg','flac','aac','m4a','aiff'].includes(ext)) return 'audio'
  if (['jpg','jpeg','png','gif','webp','tiff','exr','psd'].includes(ext)) return 'image'
  return 'file'
}

function ThumbIcon({ type, done }) {
  if (done) return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l3.5 3.5L13 5" />
    </svg>
  )
  if (type === 'video') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3.5" width="9" height="9" rx="1" />
      <path d="M11 6l3-1.5v7L11 10" />
    </svg>
  )
  if (type === 'audio') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="2" height="6" rx=".5" />
      <rect x="7" y="3" width="2" height="10" rx=".5" />
      <rect x="11" y="6" width="2" height="4" rx=".5" />
    </svg>
  )
  if (type === 'image') return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <circle cx="6" cy="7" r="1.2" />
      <path d="M2.5 11l3-3 2.5 2.5L11 7.5l2.5 2.5" />
    </svg>
  )
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10.5V2M5 5l3-3 3 3M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" />
    </svg>
  )
}

export default function UploadProgressPanel() {
  const {
    uploads, isMinimized, isVisible,
    activeCount, doneCount, totalCount, overallPct,
    cancelUpload, dismissAll, toggleMinimize, clearAutoHide,
  } = useUpload()

  if (!isVisible || uploads.length === 0) return null

  const allDone = activeCount === 0 && uploads.every(u => u.status !== 'pending')
  const overall = overallPct ?? 0

  return (
    <div
      className={`upload-toast${isMinimized ? ' minimized' : ''}`}
      onMouseEnter={clearAutoHide}
    >
      {/* Header */}
      <div className="ut-head">
        <div className="ut-head-l">
          {allDone ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 8l3.5 3.5L13 5" />
            </svg>
          ) : (
            <span className="ut-spinner"><span /><span /><span /></span>
          )}
          <span className="ut-title">
            {allDone
              ? <><b>{doneCount}</b> upload{doneCount !== 1 ? 's' : ''} complete</>
              : <>Uploading <b>{activeCount}</b> of <b>{totalCount}</b> file{totalCount !== 1 ? 's' : ''}</>
            }
          </span>
        </div>
        <div className="ut-head-r">
          <button className="icon-btn" onClick={toggleMinimize} title={isMinimized ? 'Expand' : 'Minimize'}>
            {isMinimized ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10l4-4 4 4" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
            )}
          </button>
          <button className="icon-btn" onClick={dismissAll} title="Close">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="ut-list">
        {uploads.map(u => {
          const done    = u.status === 'done' || u.progress >= 100
          const errored = u.status === 'error'
          const pct     = u.progress ?? 0
          const speed   = fmtSpeed(u.speed)
          const eta     = fmtEta(u.eta)
          const type    = typeIcon(u.name)
          const subLine = done
            ? (u.size ? `${(u.size / (1024 * 1024)).toFixed(1)} MB` : 'Complete')
            : errored
            ? (u.error || 'Upload failed')
            : [speed, eta].filter(Boolean).join(' · ') || 'Uploading…'

          return (
            <div key={u.id} className={`ut-row${done ? ' done' : ''}`}>
              <div className="ut-row-thumb">
                <ThumbIcon type={type} done={done} />
              </div>
              <div className="ut-row-meta">
                <div className="ut-row-name">
                  <span title={u.name}>{u.name}</span>
                  <span className="pct">{done ? 'Done' : errored ? 'Error' : `${Math.round(pct)}%`}</span>
                </div>
                <div className="ut-row-sub">{subLine}</div>
                <div className="ut-row-bar">
                  <div className="ut-row-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
              <button
                className="icon-btn small"
                onClick={() => !done && cancelUpload(u.id)}
                title={done ? 'Done' : 'Cancel'}
              >
                {done ? (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3.5 3.5L13 5" /></svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer overall bar */}
      <div className="ut-foot">
        <span className="ut-foot-l">{doneCount} of {totalCount} complete</span>
        <span className="ut-foot-r">{Math.round(overall)}%</span>
        <div className="ut-foot-bar">
          <div className="ut-foot-bar-fill" style={{ width: `${overall}%` }} />
        </div>
      </div>
    </div>
  )
}
