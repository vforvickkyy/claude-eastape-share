import React, { useState, useRef, useEffect } from 'react'
import {
  FilmSlate, Link, PlusCircle, CaretDown, CaretRight,
  DotsThree, Pencil, Trash, ListBullets, Play, X as XIcon,
} from '@phosphor-icons/react'
import ShotDetailPanel from '../ShotDetailPanel'
import MediaBrowserModal from '../MediaBrowserModal'
import ShotMediaViewerModal from '../ShotMediaViewerModal'
import BulkAddShotsModal from '../BulkAddShotsModal'
import { productionApi } from '../../../lib/api'

const SCENE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#f59e0b','#ef4444','#ec4899',
]

function getSceneColor(idx) {
  return SCENE_COLORS[idx % SCENE_COLORS.length]
}

function pipelineCompletion(shot, stages) {
  if (!stages?.length) return null
  return Math.round(stages.reduce((acc, s) => acc + (shot.pipeline_stages?.[s.name] ?? 0), 0) / stages.length)
}

function groupCompletion(shots, stages) {
  if (!shots.length || !stages?.length) return null
  const vals = shots.map(s => pipelineCompletion(s, stages)).filter(v => v !== null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function completionColor(pct) {
  if (pct === null) return 'var(--t4)'
  if (pct >= 80) return '#22c55e'
  if (pct >= 40) return '#f59e0b'
  return 'var(--t3)'
}

function nextShotNumber(groupShots, scene) {
  const nums = groupShots.map(s => s.shot_number).filter(Boolean)
  if (nums.length) {
    const last = nums[nums.length - 1]
    const m = last.match(/^(.*?)(\d+)$/)
    if (m) return m[1] + String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0')
  }
  const initial = (scene?.name || 'S').charAt(0).toUpperCase()
  return `${initial}${String(groupShots.length + 1).padStart(2, '0')}`
}

function formatDuration(secs) {
  if (!secs) return null
  const m = Math.floor(secs / 60)
  const s = String(Math.floor(secs % 60)).padStart(2, '0')
  return `${m}:${s}`
}

// ── Scene Menu ───────────────────────────────────────────────────────
function SceneMenu({ scene, onEdit, onBulkAdd, onDelete, onClose }) {
  const ref = useRef()
  useEffect(() => {
    function h(e) { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="scg-menu" ref={ref}>
      <button className="scg-menu-item" onClick={() => { onEdit(); onClose() }}>
        <Pencil size={13} /> Edit Scene Name
      </button>
      <button className="scg-menu-item" onClick={() => { onBulkAdd(); onClose() }}>
        <ListBullets size={13} /> Bulk Add Shots
      </button>
      <div className="scg-menu-sep" />
      <button className="scg-menu-item scg-menu-item--danger" onClick={() => { onDelete(); onClose() }}>
        <Trash size={13} /> Delete Scene
      </button>
    </div>
  )
}

// ── Scene Group Header ────────────────────────────────────────────────
function SceneGroupHeader({
  scene, shots, stages, color, collapsed,
  onToggle, onBulkAdd, onEdit, onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing]   = useState(false)
  const [editName, setEditName] = useState(scene?.name || '')
  const inputRef = useRef()

  const pct = groupCompletion(shots, stages)

  function handleEditSave() {
    if (editName.trim() && onEdit) onEdit(editName.trim())
    setEditing(false)
  }

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  return (
    <div className="scg-header" style={{ '--scene-color': color }}>
      <div className="scg-header-left">
        <button className="scg-collapse-btn" onClick={onToggle}>
          {collapsed ? <CaretRight size={13} weight="bold" /> : <CaretDown size={13} weight="bold" />}
        </button>
        <span className="scg-color-dot" style={{ background: color }} />
        {editing ? (
          <input
            ref={inputRef}
            className="scg-name-input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleEditSave}
            onKeyDown={e => {
              if (e.key === 'Enter') handleEditSave()
              if (e.key === 'Escape') { setEditName(scene?.name || ''); setEditing(false) }
            }}
          />
        ) : (
          <span className="scg-name" onDoubleClick={() => setEditing(true)}>
            {scene ? scene.name : 'Ungrouped'}
          </span>
        )}
        <span className="scg-shot-count">{shots.length} shot{shots.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="scg-header-right">
        {pct !== null && (
          <div className="scg-progress">
            <div className="scg-progress-track">
              <div className="scg-progress-fill" style={{ width: `${pct}%`, background: completionColor(pct) }} />
            </div>
            <span className="scg-progress-pct" style={{ color: completionColor(pct) }}>{pct}%</span>
          </div>
        )}
        <button className="btn-ghost btn-xs scg-quick-btn" onClick={() => {}}>
          + Quick Add
        </button>
        {scene && (
          <button className="btn-primary btn-xs scg-bulk-btn" onClick={onBulkAdd}>
            Bulk Add
          </button>
        )}
        {scene && (
          <div style={{ position: 'relative' }}>
            <button className="scg-menu-trigger" onClick={() => setMenuOpen(v => !v)}>
              <DotsThree size={16} weight="bold" />
            </button>
            {menuOpen && (
              <SceneMenu
                scene={scene}
                onEdit={() => setEditing(true)}
                onBulkAdd={onBulkAdd}
                onDelete={onDelete}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Quick Add Card ────────────────────────────────────────────────────
function QuickAddCard({ scene, sceneShots, onCreate }) {
  const [active, setActive] = useState(false)
  const [value,  setValue]  = useState('')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  async function submit() {
    if (!value.trim() || adding) return
    setAdding(true)
    try {
      const shotNum = nextShotNumber(sceneShots, scene)
      await onCreate({ title: value.trim(), shot_number: shotNum, scene_id: scene?.id || null })
      setValue('')
    } finally {
      setAdding(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') { setValue(''); setActive(false) }
  }

  if (active) {
    return (
      <div className="scg-quick-card scg-quick-card--active">
        <input
          ref={inputRef}
          className="scg-quick-input"
          placeholder="Shot name…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKey}
        />
        <div className="scg-quick-hint">Enter to add · Esc to cancel</div>
        <button className="btn-primary btn-xs" onClick={submit} disabled={!value.trim() || adding}>
          Add
        </button>
      </div>
    )
  }

  return (
    <button className="scg-quick-card" onClick={() => setActive(true)}>
      <PlusCircle size={26} weight="duotone" />
      <span>Add Shot</span>
    </button>
  )
}

// ── Shot Card ─────────────────────────────────────────────────────────
function ShotCard({ shot, status, stages, onClick, onLink, onReview, onUnlink }) {
  const [hovering, setHovering] = useState(false)
  const pct      = pipelineCompletion(shot, stages)
  const hasLinked = !!shot.thumbnail_media_id          // file is linked (may have no thumb yet)
  const hasThumb  = hasLinked && !!shot.thumbnailUrl   // has actual image to display
  const dur = formatDuration(shot.linkedMediaDuration)

  return (
    <div
      className="shot-card"
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Thumbnail area */}
      <div className={`sc-thumb ${!hasLinked ? 'sc-thumb--empty' : ''}`}>
        {hasThumb ? (
          <>
            <img
              src={shot.thumbnailUrl}
              alt={shot.title}
              loading="lazy"
              onError={e => { e.target.style.display = 'none' }}
            />
            <div className={`sc-play-overlay ${hovering ? 'sc-play-overlay--visible' : ''}`}>
              <button
                className="sc-play-btn"
                onClick={e => { e.stopPropagation(); onReview() }}
                title="Review"
              >
                <Play size={28} weight="fill" />
              </button>
            </div>
            {status && (
              <span className="sc-badge sc-badge--status" style={{ background: status.color }}>
                {status.name}
              </span>
            )}
            {dur && <span className="sc-badge sc-badge--dur sc-badge--bl">{dur}</span>}
          </>
        ) : hasLinked ? (
          // File linked but no thumbnail generated yet
          <>
            <div className="sc-linked-no-thumb">
              <FilmSlate size={32} weight="duotone" />
              {shot.linkedMediaName && (
                <span className="sc-linked-no-thumb-name">{shot.linkedMediaName}</span>
              )}
            </div>
            <div className={`sc-play-overlay ${hovering ? 'sc-play-overlay--visible' : ''}`}>
              <button
                className="sc-play-btn"
                onClick={e => { e.stopPropagation(); onReview() }}
                title="Review"
              >
                <Play size={28} weight="fill" />
              </button>
            </div>
            {status && (
              <span className="sc-badge sc-badge--status" style={{ background: status.color }}>
                {status.name}
              </span>
            )}
          </>
        ) : (
          <div className="sc-no-thumb">
            <FilmSlate size={36} weight="duotone" />
            <span>No file linked</span>
            <button
              className="sc-link-file-btn"
              onClick={e => { e.stopPropagation(); onLink() }}
            >
              <Link size={11} /> Link File
            </button>
          </div>
        )}
        {shot.shot_number && (
          <span className="sc-shot-num">#{shot.shot_number}</span>
        )}
        {hasLinked && hovering && (
          <button
            className="sc-relink-btn"
            title="Change file"
            onClick={e => { e.stopPropagation(); onLink() }}
          >
            <Link size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="sc-body">
        <div className="sc-title">{shot.title}</div>
        {!hasLinked && status && (
          <div className="sc-meta">
            <span className="sc-status" style={{ background: status.color + '22', color: status.color, borderColor: status.color + '55' }}>
              {status.name}
            </span>
          </div>
        )}
        {pct !== null && (
          <div className="sc-pipeline">
            <div className="sc-pipeline-track">
              <div className="sc-pipeline-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="sc-pipeline-pct">{pct}%</span>
          </div>
        )}
        {/* Linked file row */}
        {hasLinked && shot.linkedMediaName && (
          <div className="sc-linked-row">
            <Link size={10} style={{ flexShrink: 0, color: 'var(--t3)' }} />
            <span className="sc-linked-name">{shot.linkedMediaName}</span>
            <button
              className="sc-unlink-btn"
              title="Unlink file"
              onClick={e => { e.stopPropagation(); onUnlink() }}
            >
              <XIcon size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ShotCardsView ────────────────────────────────────────────────
export default function ShotCardsView({
  projectId, statuses, scenes, stages, shots, columns,
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload,
}) {
  const collapseKey = `ets_scene_collapse_${projectId}`

  const [collapsed,    setCollapsed]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(collapseKey)) || {} } catch { return {} }
  })
  const [selectedShot, setSelectedShot] = useState(null)
  const [linkingShot,  setLinkingShot]  = useState(null)
  const [reviewModal,  setReviewModal]  = useState(null) // { mediaId, shotName, shotNumber }
  const [bulkAddScene, setBulkAddScene] = useState(null)
  const [localShots,   setLocalShots]   = useState(shots)

  // Keep local shots in sync when parent updates
  useEffect(() => { setLocalShots(shots) }, [shots])

  function toggleCollapse(sceneId) {
    setCollapsed(prev => {
      const next = { ...prev, [sceneId || '__ungrouped__']: !prev[sceneId || '__ungrouped__'] }
      localStorage.setItem(collapseKey, JSON.stringify(next))
      return next
    })
  }

  // Group shots by scene
  const shotsByScene = {}
  for (const shot of localShots) {
    const key = shot.scene_id || '__ungrouped__'
    if (!shotsByScene[key]) shotsByScene[key] = []
    shotsByScene[key].push(shot)
  }

  const groups = [
    ...scenes.map((scene, idx) => ({
      scene, idx,
      shots: shotsByScene[scene.id] || [],
      color: getSceneColor(idx),
    })),
  ]
  const ungrouped = shotsByScene['__ungrouped__'] || []
  if (ungrouped.length > 0) {
    groups.push({ scene: null, idx: groups.length, shots: ungrouped, color: 'var(--t4)' })
  }

  async function handleQuickCreate({ title, shot_number, scene_id }) {
    await onShotCreate({ title, shot_number, scene_id, position: localShots.length })
  }

  async function handleEditScene(scene, newName) {
    await productionApi.updateScene(scene.id, { name: newName })
    onReload()
  }

  async function handleDeleteScene(scene) {
    const sceneShots = shotsByScene[scene.id] || []
    const msg = sceneShots.length > 0
      ? `Delete scene "${scene.name}" and its ${sceneShots.length} shot${sceneShots.length !== 1 ? 's' : ''}?`
      : `Delete scene "${scene.name}"?`
    if (!window.confirm(msg)) return
    if (sceneShots.length > 0) {
      for (const s of sceneShots) await onShotDelete(s.id)
    }
    await productionApi.deleteScene(scene.id)
    onReload()
  }

  // Immediate local state update when media is linked
  function handleMediaLinked(data) {
    setLocalShots(prev => prev.map(shot =>
      shot.id === data.shotId
        ? {
            ...shot,
            thumbnail_media_id:  data.mediaId,
            thumbnailUrl:        data.thumbnailUrl,
            linkedMediaName:     data.linkedMediaName,
            linkedMediaDuration: data.linkedMediaDuration,
            linkedMediaMimeType: data.linkedMediaMimeType,
            linkedMediaReady:    data.linkedMediaReady,
          }
        : shot
    ))
  }

  // Immediate local state update when media is unlinked
  async function handleUnlink(shot) {
    const name = shot.linkedMediaName || 'this file'
    if (!window.confirm(`Unlink "${name}" from "${shot.title}"?`)) return
    try {
      await productionApi.unlinkMedia(shot.id)
      setLocalShots(prev => prev.map(s =>
        s.id === shot.id
          ? { ...s, thumbnail_media_id: null, thumbnailUrl: null, linkedMediaName: null, linkedMediaDuration: null, linkedMediaMimeType: null, linkedMediaReady: false }
          : s
      ))
    } catch (e) {
      alert('Unlink failed: ' + e.message)
    }
  }

  // Empty state
  if (localShots.length === 0 && scenes.length === 0) {
    return (
      <div className="scg-empty">
        <FilmSlate size={40} weight="duotone" style={{ opacity: 0.2 }} />
        <p>No shots yet. Add a scene or use Quick Add to get started.</p>
        <button className="btn-primary" onClick={() => onSceneCreate('Scene 1')}>
          Create First Scene
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="scg-container">
        {groups.map(({ scene, idx, shots: groupShots, color }) => {
          const sceneId = scene?.id || null
          const isCollapsed = !!collapsed[sceneId || '__ungrouped__']

          return (
            <div key={sceneId || '__ungrouped__'} className="scg-group">
              <SceneGroupHeader
                scene={scene}
                shots={groupShots}
                stages={stages}
                color={color}
                collapsed={isCollapsed}
                onToggle={() => toggleCollapse(sceneId)}
                onBulkAdd={() => setBulkAddScene(scene)}
                onEdit={newName => scene && handleEditScene(scene, newName)}
                onDelete={() => scene && handleDeleteScene(scene)}
              />

              {!isCollapsed && (
                <div className="shot-cards-grid">
                  {groupShots.map(shot => {
                    const status = statuses.find(s => s.id === shot.status_id)
                    return (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        status={status}
                        stages={stages}
                        onClick={() => setSelectedShot(shot)}
                        onLink={() => setLinkingShot(shot)}
                        onReview={() => shot.thumbnail_media_id && setReviewModal({
                          mediaId:    shot.thumbnail_media_id,
                          shotName:   shot.title,
                          shotNumber: shot.shot_number,
                        })}
                        onUnlink={() => handleUnlink(shot)}
                      />
                    )
                  })}
                  <QuickAddCard
                    scene={scene}
                    sceneShots={groupShots}
                    onCreate={handleQuickCreate}
                  />
                </div>
              )}

              {isCollapsed && (
                <div className="scg-collapsed-row" onClick={() => toggleCollapse(sceneId)}>
                  <span className="scg-collapsed-info">
                    {groupShots.length} shot{groupShots.length !== 1 ? 's' : ''} hidden
                  </span>
                  <span className="scg-collapsed-expand">Click to expand</span>
                </div>
              )}
            </div>
          )
        })}

        <button
          className="scg-add-scene-btn"
          onClick={() => {
            const name = window.prompt('Scene name:')
            if (name?.trim()) onSceneCreate(name.trim())
          }}
        >
          <PlusCircle size={16} weight="duotone" /> Add Scene
        </button>
      </div>

      {selectedShot && (
        <ShotDetailPanel
          shotId={selectedShot.id}
          statuses={statuses}
          scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={updatedShot => { onShotUpdate(updatedShot.id, updatedShot); setSelectedShot(updatedShot) }}
          onDelete={id => { onShotDelete(id); setSelectedShot(null) }}
        />
      )}

      {linkingShot && (
        <MediaBrowserModal
          projectId={projectId}
          shotId={linkingShot.id}
          shotName={linkingShot.title}
          currentLinkedMediaId={linkingShot.thumbnail_media_id || null}
          onLinked={handleMediaLinked}
          onClose={() => setLinkingShot(null)}
        />
      )}

      {reviewModal && (
        <ShotMediaViewerModal
          projectId={projectId}
          mediaId={reviewModal.mediaId}
          shotName={reviewModal.shotName}
          shotNumber={reviewModal.shotNumber}
          onClose={() => setReviewModal(null)}
        />
      )}

      {bulkAddScene !== undefined && bulkAddScene !== false && (
        <BulkAddShotsModal
          projectId={projectId}
          scene={bulkAddScene}
          scenes={scenes}
          shots={localShots}
          onCreated={newShots => {
            for (const s of newShots) onShotUpdate(s.id, s)
            onReload()
          }}
          onClose={() => setBulkAddScene(false)}
        />
      )}
    </>
  )
}
