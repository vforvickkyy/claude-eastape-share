import React, { useEffect, useState, useMemo } from 'react'
import {
  X, Image, FilmSlate, File, MagnifyingGlass, SpinnerGap,
  Check, LinkBreak, Star,
} from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'

const TYPE_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'video',    label: 'Video' },
  { id: 'image',    label: 'Image' },
  { id: 'audio',    label: 'Audio' },
  { id: 'document', label: 'Document' },
]

function mimeToType(mime) {
  if (!mime) return 'document'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

function MediaIcon({ mime, size = 20 }) {
  const t = mimeToType(mime)
  if (t === 'video') return <FilmSlate size={size} weight="duotone" />
  if (t === 'image') return <Image     size={size} weight="duotone" />
  return <File size={size} weight="duotone" />
}

function formatDuration(secs) {
  if (!secs) return null
  const m = Math.floor(secs / 60)
  const s = String(Math.floor(secs % 60)).padStart(2, '0')
  return `${m}:${s}`
}

export default function MediaBrowserModal({ projectId, shot, onLinked, onClose }) {
  const [media,       setMedia]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('all')
  const [unlinkedOnly, setUnlinkedOnly] = useState(false)
  const [selected,    setSelected]    = useState([]) // array of media ids
  const [linking,     setLinking]     = useState(false)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    productionApi.getProjectMedia(projectId)
      .then(r => setMedia(r.media || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [projectId])

  const filtered = useMemo(() => {
    return media.filter(m => {
      if (search && !m.name?.toLowerCase().includes(search.toLowerCase())) return false
      if (typeFilter !== 'all' && mimeToType(m.mime_type) !== typeFilter) return false
      if (unlinkedOnly && m.is_linked && m.linked_shot_id !== shot.id) return false
      return true
    })
  }, [media, search, typeFilter, unlinkedOnly, shot.id])

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function isLinkedToThisShot(m) {
    return (shot.linked_media_ids || []).includes(m.id)
  }

  async function handleLink(isHero) {
    if (!selected.length || linking) return
    setLinking(true)
    setError(null)
    try {
      let lastUpdated = null
      for (let i = 0; i < selected.length; i++) {
        const mediaId = selected[i]
        const hero = isHero && i === 0 // first selected = hero if hero mode
        const res = await productionApi.linkMedia(shot.id, mediaId, hero, 'take')
        if (res?.shot) lastUpdated = res.shot
      }
      onLinked(lastUpdated)
    } catch (e) {
      setError(e.message)
      setLinking(false)
    }
  }

  return (
    <div className="mbm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mbm-panel">
        {/* Header */}
        <div className="mbm-header">
          <span className="mbm-title">
            Link File to <em>{shot.title}</em>
          </span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Controls */}
        <div className="mbm-controls">
          <div className="mbm-search-row">
            <MagnifyingGlass size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
            <input
              className="mbm-search"
              placeholder="Search files…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="mbm-filter-row">
            <div className="mbm-type-tabs">
              {TYPE_FILTERS.map(f => (
                <button
                  key={f.id}
                  className={`mbm-type-tab ${typeFilter === f.id ? 'active' : ''}`}
                  onClick={() => setTypeFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="mbm-toggle">
              <input
                type="checkbox"
                checked={unlinkedOnly}
                onChange={e => setUnlinkedOnly(e.target.checked)}
              />
              <span>Unlinked only</span>
            </label>
          </div>
        </div>

        {/* Grid */}
        <div className="mbm-grid">
          {loading && (
            <div className="mbm-loading">
              <SpinnerGap size={22} className="spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="mbm-empty">
              {search || typeFilter !== 'all' ? 'No files match your filters.' : 'No media in this project yet.'}
            </div>
          )}
          {filtered.map(m => {
            const linkedHere = isLinkedToThisShot(m)
            const linkedElsewhere = m.is_linked && m.linked_shot_id !== shot.id
            const isSelected = selected.includes(m.id)
            const dur = formatDuration(m.duration)

            return (
              <button
                key={m.id}
                className={`mbm-item
                  ${isSelected ? 'mbm-item--selected' : ''}
                  ${linkedHere ? 'mbm-item--linked-here' : ''}
                  ${linkedElsewhere ? 'mbm-item--linked-other' : ''}
                `}
                onClick={() => toggleSelect(m.id)}
              >
                <div className="mbm-thumb-wrap">
                  {m.thumbnail_url
                    ? <img src={m.thumbnail_url} alt={m.name} className="mbm-thumb" />
                    : (
                      <div className="mbm-thumb mbm-thumb--placeholder">
                        <MediaIcon mime={m.mime_type} size={24} />
                      </div>
                    )
                  }
                  {dur && <span className="mbm-dur">{dur}</span>}
                  {isSelected && (
                    <div className="mbm-check"><Check size={13} weight="bold" /></div>
                  )}
                  {linkedHere && !isSelected && (
                    <div className="mbm-check mbm-check--linked"><Star size={12} weight="fill" /></div>
                  )}
                </div>
                <div className="mbm-item-name">{m.name}</div>
                {linkedElsewhere && (
                  <div className="mbm-linked-badge">→ {m.linked_shot_name || 'other shot'}</div>
                )}
                {linkedHere && (
                  <div className="mbm-linked-badge mbm-linked-badge--here">Already linked</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="mbm-footer">
          {error && <span className="mbm-error">{error}</span>}
          <span className="mbm-sel-count">
            {selected.length > 0 ? `${selected.length} selected` : ''}
          </span>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-ghost"
            onClick={() => handleLink(false)}
            disabled={!selected.length || linking}
          >
            {linking ? <SpinnerGap size={12} className="spin" /> : 'Link as Take'}
          </button>
          <button
            className="btn-primary"
            onClick={() => handleLink(true)}
            disabled={!selected.length || linking}
          >
            {linking
              ? <><SpinnerGap size={13} className="spin" /> Linking…</>
              : <><Star size={13} weight="fill" /> Link as Hero</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
