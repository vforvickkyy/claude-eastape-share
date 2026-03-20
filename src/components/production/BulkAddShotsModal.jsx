import React, { useState, useMemo, useEffect } from 'react'
import { X, SpinnerGap, Check, Warning } from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'

const PADDING_OPTIONS = [
  { label: '1 digit (1, 2, 3)', value: 1 },
  { label: '2 digits (01, 02)',  value: 2 },
  { label: '3 digits (001)',     value: 3 },
]
const SEPARATOR_OPTIONS = [
  { label: 'Underscore (_)', value: '_' },
  { label: 'Dash (-)',       value: '-' },
  { label: 'Dot (.)',        value: '.' },
  { label: 'None',           value: '' },
]

// Auto-match algorithm: score each media against a shot name
function scoreMatch(shotName, mediaName) {
  const sn = shotName.toLowerCase().replace(/\.[^.]+$/, '').trim()
  const mn = mediaName.toLowerCase().replace(/\.[^.]+$/, '').trim()
  if (sn === mn) return 100
  if (mn.includes(sn) || sn.includes(mn)) return 85
  const sWords = sn.split(/[\s_\-\.]+/)
  const mWords = mn.split(/[\s_\-\.]+/)
  if (sWords[0] && mWords[0] && sWords[0] === mWords[0]) return 55
  return 0
}

function autoMatch(shotNames, mediaList) {
  return shotNames.map(name => {
    let best = null, bestScore = 0
    for (const m of mediaList) {
      const score = scoreMatch(name, m.name || '')
      if (score > bestScore) { bestScore = score; best = m }
    }
    return {
      name,
      media: bestScore >= 75 ? best : null,
      score: bestScore,
      suggestion: bestScore >= 50 && bestScore < 75 ? best : null,
    }
  })
}

// ── Tab 1: Named List ─────────────────────────────────────────────────
function NamedListTab({ scene, projectMedia, onCreate, onClose }) {
  const [text,      setText]      = useState('')
  const [autoMatch_, setAutoMatch_] = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState(null)

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const matches = useMemo(() => {
    if (!autoMatch_ || !lines.length) return []
    return autoMatch(lines, projectMedia)
  }, [text, autoMatch_, projectMedia])

  async function handleCreate() {
    if (!lines.length || creating) return
    setCreating(true)
    setError(null)
    try {
      const initial = (scene?.name || 'S').charAt(0).toUpperCase()
      const shots = lines.map((name, i) => {
        const m = matches.find(x => x.name === name)
        return {
          name,
          shot_number: `${initial}${String(i + 1).padStart(2, '0')}`,
          thumbnail_media_id: m?.media?.id || null,
          linked_media_ids: m?.media ? [m.media.id] : [],
        }
      })
      const res = await productionApi.bulkCreateShots(
        scene?.project_id || shots[0]?.project_id,
        scene?.id || null,
        shots,
      )
      onCreate(res.shots || [])
    } catch (e) {
      setError(e.message)
      setCreating(false)
    }
  }

  return (
    <div className="bam-tab-body">
      <label className="bam-label">Type shot names (one per line)</label>
      <textarea
        className="bam-textarea"
        rows={10}
        placeholder={'Tower_01\nTower_02\nTower_03\n...'}
        value={text}
        onChange={e => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="bam-count">{lines.length > 0 ? `${lines.length} shot${lines.length !== 1 ? 's' : ''} will be created` : 'Enter names above'}</div>

      <label className="bam-checkbox-row">
        <input type="checkbox" checked={autoMatch_} onChange={e => setAutoMatch_(e.target.checked)} />
        <span>Auto-match files by name</span>
      </label>

      {autoMatch_ && matches.length > 0 && (
        <div className="bam-matches">
          <div className="bam-matches-title">File matches:</div>
          {matches.map(m => (
            <div key={m.name} className="bam-match-row">
              <span className="bam-match-name">{m.name}</span>
              {m.media ? (
                <span className="bam-match-found"><Check size={11} weight="bold" /> {m.media.name}</span>
              ) : m.suggestion ? (
                <span className="bam-match-suggest">~ {m.suggestion.name}</span>
              ) : (
                <span className="bam-match-none">no match</span>
              )}
            </div>
          ))}
          <div className="bam-match-summary">
            Found {matches.filter(m => m.media).length} of {matches.length} matches
          </div>
        </div>
      )}

      {error && <div className="bam-error"><Warning size={13} /> {error}</div>}

      <div className="bam-footer">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleCreate} disabled={!lines.length || creating}>
          {creating ? <><SpinnerGap size={13} className="spin" /> Creating…</> : `Create ${lines.length} Shot${lines.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

// ── Tab 2: Auto Generate ──────────────────────────────────────────────
function AutoGenerateTab({ scene, projectMedia, onCreate, onClose }) {
  const [prefix,    setPrefix]    = useState('')
  const [start,     setStart]     = useState(1)
  const [count,     setCount]     = useState(10)
  const [padding,   setPadding]   = useState(2)
  const [separator, setSeparator] = useState('_')
  const [autoMatch_, setAutoMatch_] = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState(null)

  const generated = useMemo(() => {
    const n = Math.min(Math.max(1, count || 1), 100)
    return Array.from({ length: n }, (_, i) => {
      const num = String(start + i).padStart(padding, '0')
      return prefix ? `${prefix}${separator}${num}` : num
    })
  }, [prefix, start, count, padding, separator])

  const matches = useMemo(() => {
    if (!autoMatch_) return []
    return autoMatch(generated, projectMedia)
  }, [generated, autoMatch_, projectMedia])

  const preview = generated.length <= 5
    ? generated.join(', ')
    : `${generated.slice(0, 3).join(', ')} … ${generated[generated.length - 1]}`

  async function handleCreate() {
    if (!generated.length || creating) return
    setCreating(true)
    setError(null)
    try {
      const initial = (scene?.name || 'S').charAt(0).toUpperCase()
      const shots = generated.map((name, i) => {
        const m = matches.find(x => x.name === name)
        return {
          name,
          shot_number: `${initial}${String(i + 1).padStart(2, '0')}`,
          thumbnail_media_id: m?.media?.id || null,
          linked_media_ids: m?.media ? [m.media.id] : [],
        }
      })
      const res = await productionApi.bulkCreateShots(
        scene?.project_id,
        scene?.id || null,
        shots,
      )
      onCreate(res.shots || [])
    } catch (e) {
      setError(e.message)
      setCreating(false)
    }
  }

  return (
    <div className="bam-tab-body">
      <div className="bam-gen-grid">
        <div className="bam-field">
          <label>Prefix</label>
          <input className="bam-input" placeholder="e.g. Tower" value={prefix} onChange={e => setPrefix(e.target.value)} />
        </div>
        <div className="bam-field">
          <label>Start #</label>
          <input className="bam-input bam-input--sm" type="number" min={1} value={start} onChange={e => setStart(Number(e.target.value))} />
        </div>
        <div className="bam-field">
          <label>Count</label>
          <input className="bam-input bam-input--sm" type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} />
        </div>
        <div className="bam-field">
          <label>Padding</label>
          <select className="bam-input" value={padding} onChange={e => setPadding(Number(e.target.value))}>
            {PADDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="bam-field">
          <label>Separator</label>
          <select className="bam-input" value={separator} onChange={e => setSeparator(e.target.value)}>
            {SEPARATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bam-preview">
        <div className="bam-preview-label">Will create {generated.length} shots:</div>
        <div className="bam-preview-names">{preview}</div>
      </div>

      <label className="bam-checkbox-row">
        <input type="checkbox" checked={autoMatch_} onChange={e => setAutoMatch_(e.target.checked)} />
        <span>Auto-match files by name</span>
      </label>

      {autoMatch_ && matches.length > 0 && (
        <div className="bam-matches">
          <div className="bam-matches-title">
            Found {matches.filter(m => m.media).length} of {matches.length} matches
          </div>
          {matches.filter(m => m.media).slice(0, 5).map(m => (
            <div key={m.name} className="bam-match-row">
              <span className="bam-match-name">{m.name}</span>
              <span className="bam-match-found"><Check size={11} weight="bold" /> {m.media.name}</span>
            </div>
          ))}
          {matches.filter(m => m.media).length > 5 && (
            <div className="bam-match-more">+{matches.filter(m => m.media).length - 5} more matches</div>
          )}
        </div>
      )}

      {error && <div className="bam-error"><Warning size={13} /> {error}</div>}

      <div className="bam-footer">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleCreate} disabled={!generated.length || creating}>
          {creating ? <><SpinnerGap size={13} className="spin" /> Generating…</> : `Generate ${generated.length} Shots`}
        </button>
      </div>
    </div>
  )
}

// ── Tab 3: Copy from Scene ────────────────────────────────────────────
function CopySceneTab({ scene, scenes, shots, onCreate, onClose }) {
  const [sourceId, setSourceId] = useState('')
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState(null)

  const otherScenes = scenes.filter(s => s.id !== scene?.id)
  const sourceShots = shots.filter(s => s.scene_id === sourceId)

  async function handleCopy() {
    if (!sourceId || !sourceShots.length || creating) return
    setCreating(true)
    setError(null)
    try {
      const shotData = sourceShots.map(s => ({
        name: s.title,
        shot_number: s.shot_number,
        thumbnail_media_id: null,
        linked_media_ids: [],
      }))
      const res = await productionApi.bulkCreateShots(
        scene?.project_id,
        scene?.id || null,
        shotData,
      )
      onCreate(res.shots || [])
    } catch (e) {
      setError(e.message)
      setCreating(false)
    }
  }

  return (
    <div className="bam-tab-body">
      <div className="bam-field">
        <label>Copy shot names from scene</label>
        <select className="bam-input" value={sourceId} onChange={e => setSourceId(e.target.value)}>
          <option value="">Select a scene…</option>
          {otherScenes.map(s => {
            const n = shots.filter(sh => sh.scene_id === s.id).length
            return <option key={s.id} value={s.id}>{s.name} ({n} shots)</option>
          })}
        </select>
      </div>

      {sourceId && (
        <div className="bam-preview">
          <div className="bam-preview-label">{sourceShots.length} shots will be copied:</div>
          <div className="bam-copy-list">
            {sourceShots.slice(0, 8).map(s => (
              <div key={s.id} className="bam-copy-item">{s.title}</div>
            ))}
            {sourceShots.length > 8 && <div className="bam-copy-more">+{sourceShots.length - 8} more</div>}
          </div>
        </div>
      )}

      {error && <div className="bam-error"><Warning size={13} /> {error}</div>}

      <div className="bam-footer">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleCopy} disabled={!sourceId || !sourceShots.length || creating}>
          {creating ? <><SpinnerGap size={13} className="spin" /> Copying…</> : `Copy ${sourceShots.length} Shots`}
        </button>
      </div>
    </div>
  )
}

// ── Main BulkAddShotsModal ────────────────────────────────────────────
export default function BulkAddShotsModal({ projectId, scene, scenes, shots, onCreated, onClose }) {
  const [tab,          setTab]          = useState('list')
  const [projectMedia, setProjectMedia] = useState([])
  const [mediaLoading, setMediaLoading] = useState(true)

  useEffect(() => {
    productionApi.getProjectMedia(projectId)
      .then(r => setProjectMedia(r.media || []))
      .catch(() => {})
      .finally(() => setMediaLoading(false))
  }, [projectId])

  const sceneName = scene?.name || 'Ungrouped'

  function handleCreated(newShots) {
    onCreated(newShots || [])
    onClose()
  }

  const commonProps = { scene, projectMedia, onCreate: handleCreated, onClose }

  return (
    <div className="bam-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bam-panel">
        <div className="bam-header">
          <span className="bam-title">Add Shots to <em>{sceneName}</em></span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="bam-tabs">
          {[
            { id: 'list',     label: 'Named List'     },
            { id: 'generate', label: 'Auto Generate'  },
            { id: 'copy',     label: 'Copy from Scene' },
          ].map(t => (
            <button
              key={t.id}
              className={`bam-tab-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bam-body">
          {mediaLoading
            ? <div style={{ padding: 40, textAlign: 'center' }}><SpinnerGap size={20} className="spin" /></div>
            : tab === 'list'     ? <NamedListTab   {...commonProps} />
            : tab === 'generate' ? <AutoGenerateTab {...commonProps} />
            : <CopySceneTab scene={scene} scenes={scenes} shots={shots} onCreate={handleCreated} onClose={onClose} />
          }
        </div>
      </div>
    </div>
  )
}
