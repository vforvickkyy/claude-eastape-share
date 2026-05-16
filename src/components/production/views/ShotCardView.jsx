import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilmSlate, DotsThree, Plus, CaretDown, CaretRight } from '@phosphor-icons/react'
import { projectMediaApi } from '../../../lib/api'

const SCENE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#f59e0b','#ef4444','#ec4899',
]

function ShotCard({ shot, statuses, scenes, mediaThumbs, projectId, onEdit, onDelete, canEdit, canDelete, sceneColor }) {
  const navigate   = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef    = useRef()

  useEffect(() => {
    if (!menuOpen) return
    const h = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const status   = statuses.find(s => s.id === shot.status_id)
  const scene    = scenes.find(s => s.id === shot.scene_id)
  const thumbUrl = shot.linked_cloudflare_uid
    ? `https://videodelivery.net/${shot.linked_cloudflare_uid}/thumbnails/thumbnail.jpg`
    : (mediaThumbs[shot.thumbnail_media_id] || null)
  const linkedId = shot.linked_media_id || shot.thumbnail_media_id
  const color    = sceneColor || '#6366f1'

  return (
    <div className="shot-card" onClick={() => onEdit(shot)}>
      {/* Thumbnail */}
      <div
        className="shot-card-thumb"
        style={{
          background: thumbUrl
            ? undefined
            : `linear-gradient(135deg, color-mix(in oklch, ${color} 48%, #0a0a0c), color-mix(in oklch, ${color} 14%, #0a0a0c))`,
          cursor: linkedId ? 'pointer' : 'default',
        }}
        onClick={e => { if (linkedId) { e.stopPropagation(); navigate(`/projects/${projectId}/media/${linkedId}`, { state: { from: 'manage' } }) }}}
      >
        {thumbUrl
          ? <img src={thumbUrl} alt="" className="shot-card-img" onError={e => { e.target.style.display = 'none' }} />
          : <FilmSlate size={24} weight="duotone" style={{ color, opacity: 0.4 }} />
        }
        {/* Hover overlay with play */}
        {linkedId && (
          <div className="shot-card-play">
            <div className="shot-card-play-btn">▶</div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="shot-card-body">
        <div className="shot-card-title-row">
          {shot.shot_number && <span className="shot-card-num">#{shot.shot_number}</span>}
          <span className="shot-card-title">{shot.title}</span>
          <div className="shot-card-menu-wrap" ref={menuRef} onClick={e => e.stopPropagation()}>
            <button
              className="shot-card-menu-btn"
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            >
              <DotsThree size={14} weight="bold" />
            </button>
            {menuOpen && (
              <div className="shot-card-menu">
                {linkedId && (
                  <button onClick={() => { setMenuOpen(false); navigate(`/projects/${projectId}/media/${linkedId}`, { state: { from: 'manage' } }) }}>
                    ▶  Open Video
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => { setMenuOpen(false); onEdit(shot) }}>
                    ✏️  Edit Details
                  </button>
                )}
                {canDelete && (
                  <button className="danger" onClick={() => { setMenuOpen(false); onDelete(shot) }}>
                    🗑  Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shot-card-meta">
          {status
            ? <span className="shot-card-status" style={{ background: status.color + '22', border: `1px solid ${status.color}55`, color: status.color }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: status.color, display: 'inline-block', marginRight: 4 }} />
                {status.name}
              </span>
            : <span className="shot-card-status" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--t4)' }}>—</span>
          }
          {scene && (
            <span className="shot-card-scene" style={{ color, background: `${color}14`, border: `1px solid ${color}30` }}>
              {scene.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ShotCardView({
  projectId, statuses, scenes, shots,
  filterSceneId = null,
  onShotCreate, onShotUpdate, onShotDelete, onReload,
  canEdit, canDelete,
}) {
  const [mediaThumbs, setMediaThumbs] = useState({})
  const [collapsed,   setCollapsed]   = useState({})
  const [selectedShot, setSelectedShot] = useState(null)

  useEffect(() => {
    projectMediaApi.list({ projectId })
      .then(d => {
        const map = {}
        for (const a of (d.assets || [])) { if (a.thumbnailUrl) map[a.id] = a.thumbnailUrl }
        setMediaThumbs(map)
      })
      .catch(() => {})
  }, [projectId])

  function toggleCollapse(id) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleDelete(shot) {
    if (!window.confirm(`Delete shot "${shot.title}"?`)) return
    try { await onShotDelete(shot.id) } catch {}
  }

  // Build scene color map
  const sceneColorMap = {}
  scenes.forEach((s, i) => { sceneColorMap[s.id] = SCENE_COLORS[i % SCENE_COLORS.length] })

  // Flat mode (single scene selected)
  if (filterSceneId) {
    const color = sceneColorMap[filterSceneId] || SCENE_COLORS[0]
    return (
      <div className="shot-card-area">
        <div className="shot-card-grid">
          {shots.map(shot => (
            <ShotCard
              key={shot.id}
              shot={shot}
              statuses={statuses}
              scenes={scenes}
              mediaThumbs={mediaThumbs}
              projectId={projectId}
              onEdit={setSelectedShot}
              onDelete={handleDelete}
              canEdit={canEdit}
              canDelete={canDelete}
              sceneColor={color}
            />
          ))}
          {canEdit && (
            <button
              className="shot-card-add"
              onClick={() => onShotCreate({ title: 'New Shot', scene_id: filterSceneId })}
            >
              <Plus size={20} weight="duotone" />
              <span>Add Shot</span>
            </button>
          )}
        </div>

        {selectedShot && (
          <ShotDetailPanelLazy
            shotId={selectedShot.id}
            statuses={statuses}
            scenes={scenes}
            onClose={() => setSelectedShot(null)}
            onUpdate={canEdit   ? u => { onShotUpdate(u.id, u); setSelectedShot(u) } : null}
            onDelete={canDelete ? id => { onShotDelete(id); setSelectedShot(null)  } : null}
          />
        )}
      </div>
    )
  }

  // Grouped mode
  const groups = scenes.map((scene, idx) => ({
    scene, color: SCENE_COLORS[idx % SCENE_COLORS.length],
    shots: shots.filter(s => s.scene_id === scene.id),
  }))
  const ungrouped = shots.filter(s => !s.scene_id)
  if (ungrouped.length > 0) groups.push({ scene: null, color: 'var(--t4)', shots: ungrouped })

  return (
    <div className="shot-card-area">
      {groups.map(({ scene, color, shots: groupShots }) => {
        const gid = scene?.id || '__ungrouped__'
        const isCollapsed = !!collapsed[gid]
        return (
          <div key={gid} className="shot-card-group">
            <div
              className="shot-card-group-header"
              onClick={() => toggleCollapse(gid)}
              style={{ borderTop: `1px solid ${color}22` }}
            >
              <span style={{ color, opacity: 0.7 }}>
                {isCollapsed ? <CaretRight size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
              </span>
              <span className="shot-card-group-name">{scene?.name ?? 'Ungrouped'}</span>
              <span className="shot-card-group-count" style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}>
                {groupShots.length}
              </span>
              {scene && canEdit && (
                <button
                  className="shot-card-group-add"
                  onClick={e => { e.stopPropagation(); onShotCreate({ title: 'New Shot', scene_id: scene.id }) }}
                  onMouseEnter={e => { e.currentTarget.style.color = color }}
                  onMouseLeave={e => { e.currentTarget.style.color = '' }}
                >
                  <Plus size={11} weight="bold" /> Add shot
                </button>
              )}
            </div>

            {!isCollapsed && (
              <div className="shot-card-grid">
                {groupShots.map(shot => (
                  <ShotCard
                    key={shot.id}
                    shot={shot}
                    statuses={statuses}
                    scenes={scenes}
                    mediaThumbs={mediaThumbs}
                    projectId={projectId}
                    onEdit={setSelectedShot}
                    onDelete={handleDelete}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    sceneColor={color}
                  />
                ))}
                {canEdit && scene && (
                  <button
                    className="shot-card-add"
                    onClick={() => onShotCreate({ title: 'New Shot', scene_id: scene.id })}
                  >
                    <Plus size={18} weight="duotone" />
                    <span>Add Shot</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {selectedShot && (
        <ShotDetailPanelLazy
          shotId={selectedShot.id}
          statuses={statuses}
          scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={canEdit   ? u => { onShotUpdate(u.id, u); setSelectedShot(u) } : null}
          onDelete={canDelete ? id => { onShotDelete(id); setSelectedShot(null)  } : null}
        />
      )}
    </div>
  )
}

// Lazy-loaded detail panel to avoid circular dep issues
function ShotDetailPanelLazy(props) {
  const [Panel, setPanel] = useState(null)
  useEffect(() => {
    import('../ShotDetailPanel').then(m => setPanel(() => m.default))
  }, [])
  if (!Panel) return null
  return <Panel {...props} />
}
