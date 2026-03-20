import React, { useState } from 'react'
import { SquaresFour, Kanban, PlayCircle, SpinnerGap } from '@phosphor-icons/react'

const CHOICES = [
  {
    id: 'cards',
    icon: <SquaresFour size={40} weight="duotone" />,
    title: 'Shot Cards',
    description: 'Visual card grid with thumbnails and pipeline progress. Best for a quick visual overview of all shots.',
    accent: '#7c3aed',
  },
  {
    id: 'pipeline',
    icon: <Kanban size={40} weight="duotone" />,
    title: 'Pipeline View',
    description: 'Track each shot through production stages. See completion at a glance across your whole pipeline.',
    accent: '#2563eb',
  },
  {
    id: 'review',
    icon: <PlayCircle size={40} weight="duotone" />,
    title: 'Shot Review',
    description: 'Fullscreen review mode with pipeline stages and comments side by side. Great for client sessions.',
    accent: '#059669',
  },
]

export default function FirstTimeExperience({ onChoose }) {
  const [saving, setSaving] = useState(null)

  async function handleChoose(viewId) {
    setSaving(viewId)
    try {
      await onChoose(viewId)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fte-overlay">
      <div className="fte-inner">
        <h2 className="fte-title">Choose your default view</h2>
        <p className="fte-sub">Pick how you want to work — you can switch anytime from the toolbar.</p>
        <div className="fte-cards">
          {CHOICES.map(c => (
            <button
              key={c.id}
              className={`fte-card ${saving === c.id ? 'fte-card--saving' : ''}`}
              style={{ '--fte-accent': c.accent }}
              onClick={() => handleChoose(c.id)}
              disabled={!!saving}
            >
              <div className="fte-card-icon">{c.icon}</div>
              <div className="fte-card-title">{c.title}</div>
              <div className="fte-card-desc">{c.description}</div>
              <div className="fte-card-cta">
                {saving === c.id
                  ? <><SpinnerGap size={13} className="spin" /> Setting up…</>
                  : 'Use this view →'}
              </div>
            </button>
          ))}
        </div>
        <p className="fte-skip">
          Or start with{' '}
          {['list', 'calendar', 'progress'].map((v, i, a) => (
            <React.Fragment key={v}>
              <button
                className="fte-link"
                onClick={() => handleChoose(v)}
                disabled={!!saving}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
              {i < a.length - 1 ? ', ' : ''}
            </React.Fragment>
          ))}
          {' '}view
        </p>
      </div>
    </div>
  )
}
