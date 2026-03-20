import React, { useEffect, useState } from 'react'
import {
  X, Image, FilmSlate, File, MagnifyingGlass, SpinnerGap, Link, Check,
} from '@phosphor-icons/react'
import { projectMediaApi, productionApi } from '../../lib/api'

function MediaIcon({ mime }) {
  if (!mime) return <File size={20} weight="duotone" />
  if (mime.startsWith('image/')) return <Image size={20} weight="duotone" />
  if (mime.startsWith('video/')) return <FilmSlate size={20} weight="duotone" />
  return <File size={20} weight="duotone" />
}

export default function MediaBrowserModal({ projectId, shot, onLinked, onClose }) {
  const [media,    setMedia]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(null)
  const [linking,  setLinking]  = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    projectMediaApi.list({ project_id: projectId, limit: 100 })
      .then(r => setMedia(r.media || r.assets || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [projectId])

  const filtered = media.filter(m =>
    !search || m.name?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleLink() {
    if (!selected || linking) return
    setLinking(true)
    setError(null)
    try {
      await productionApi.linkAsset(shot.id, {
        project_media_id: selected.id,
        label: selected.name,
      })
      onLinked()
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
            Link Media to <em>{shot.title}</em>
          </span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Search */}
        <div className="mbm-search-row">
          <MagnifyingGlass size={14} style={{ color: 'var(--t3)' }} />
          <input
            className="mbm-search"
            placeholder="Search media…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
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
              {search ? 'No media matching your search.' : 'No media in this project yet.'}
            </div>
          )}

          {filtered.map(m => (
            <button
              key={m.id}
              className={`mbm-item ${selected?.id === m.id ? 'mbm-item--selected' : ''}`}
              onClick={() => setSelected(prev => prev?.id === m.id ? null : m)}
            >
              {m.thumbnail_url
                ? <img src={m.thumbnail_url} alt={m.name} className="mbm-thumb" />
                : (
                  <div className="mbm-thumb mbm-thumb--placeholder">
                    <MediaIcon mime={m.mime_type} />
                  </div>
                )
              }
              <div className="mbm-item-name">{m.name}</div>
              {selected?.id === m.id && (
                <div className="mbm-check"><Check size={14} weight="bold" /></div>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mbm-footer">
          {error && <span className="mbm-error">{error}</span>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleLink}
            disabled={!selected || linking}
          >
            {linking
              ? <><SpinnerGap size={13} className="spin" /> Linking…</>
              : <><Link size={13} /> Link asset</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
