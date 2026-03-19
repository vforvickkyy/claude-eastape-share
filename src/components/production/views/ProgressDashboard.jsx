import React from 'react'

export default function ProgressDashboard({ shots, statuses, scenes }) {
  const total = shots.length

  // Count by status
  const byStatus = statuses.map(s => ({
    ...s,
    count: shots.filter(sh => sh.status_id === s.id).length,
  }))
  const noStatus = shots.filter(sh => !sh.status_id).length

  // Count by scene
  const byScene = scenes.map(sc => ({
    ...sc,
    count: shots.filter(sh => sh.scene_id === sc.id).length,
    done: shots.filter(sh => sh.scene_id === sc.id && statuses.find(s => s.id === sh.status_id && s.name.toLowerCase() === 'done')).length,
  }))

  // Overdue shots
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdue = shots.filter(sh => sh.due_date && new Date(sh.due_date) < today && sh.status_id !== statuses.find(s => s.name.toLowerCase() === 'done')?.id)

  // Completion %
  const doneStatus = statuses.find(s => s.name.toLowerCase() === 'done')
  const doneCount = doneStatus ? shots.filter(sh => sh.status_id === doneStatus.id).length : 0
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className="progress-dashboard">
      {/* Summary cards */}
      <div className="progress-cards">
        <div className="progress-card">
          <div className="progress-card-value">{total}</div>
          <div className="progress-card-label">Total Shots</div>
        </div>
        <div className="progress-card">
          <div className="progress-card-value">{doneCount}</div>
          <div className="progress-card-label">Completed</div>
        </div>
        <div className="progress-card">
          <div className="progress-card-value" style={{ color: overdue.length > 0 ? '#ef4444' : undefined }}>{overdue.length}</div>
          <div className="progress-card-label">Overdue</div>
        </div>
        <div className="progress-card">
          <div className="progress-card-value">{pct}%</div>
          <div className="progress-card-label">Done</div>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="progress-section">
        <div className="progress-section-title">Overall Progress</div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${pct}%`, background: '#10b981' }}
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{doneCount} of {total} shots done</div>
      </div>

      {/* By status */}
      {byStatus.length > 0 && (
        <div className="progress-section">
          <div className="progress-section-title">By Status</div>
          {byStatus.map(s => (
            <div key={s.id} className="progress-status-row">
              <span className="progress-status-dot" style={{ background: s.color }} />
              <span className="progress-status-name">{s.name}</span>
              <div className="progress-mini-track">
                <div
                  className="progress-mini-fill"
                  style={{ width: total > 0 ? `${(s.count / total) * 100}%` : '0%', background: s.color }}
                />
              </div>
              <span className="progress-status-count">{s.count}</span>
            </div>
          ))}
          {noStatus > 0 && (
            <div className="progress-status-row">
              <span className="progress-status-dot" style={{ background: '#6b7280' }} />
              <span className="progress-status-name">No status</span>
              <div className="progress-mini-track">
                <div className="progress-mini-fill" style={{ width: total > 0 ? `${(noStatus / total) * 100}%` : '0%', background: '#6b7280' }} />
              </div>
              <span className="progress-status-count">{noStatus}</span>
            </div>
          )}
        </div>
      )}

      {/* By scene */}
      {byScene.length > 0 && (
        <div className="progress-section">
          <div className="progress-section-title">By Scene</div>
          {byScene.map(sc => {
            const scenePct = sc.count > 0 ? Math.round((sc.done / sc.count) * 100) : 0
            return (
              <div key={sc.id} className="progress-scene-row">
                <span className="progress-scene-name">{sc.name}</span>
                <div className="progress-mini-track">
                  <div className="progress-mini-fill" style={{ width: `${scenePct}%`, background: '#6366f1' }} />
                </div>
                <span className="progress-status-count">{sc.done}/{sc.count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Overdue list */}
      {overdue.length > 0 && (
        <div className="progress-section">
          <div className="progress-section-title" style={{ color: '#ef4444' }}>Overdue Shots</div>
          {overdue.map(sh => (
            <div key={sh.id} className="progress-overdue-row">
              <span style={{ flex: 1 }}>{sh.title}</span>
              <span style={{ fontSize: 12, color: '#ef4444' }}>
                {new Date(sh.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
