import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  FilmSlate, Link, PlusCircle, CaretDown, CaretRight,
  DotsThree, Pencil, Trash, ListBullets, ArrowsOut,
} from '@phosphor-icons/react'
import ShotDetailPanel from '../ShotDetailPanel'
import MediaBrowserModal from '../MediaBrowserModal'
import BulkAddShotsModal from '../BulkAddShotsModal'

// Palette for scenes without explicit color
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
  scene, shots, stages, color, collapsed, colorIdx,
  onToggle, onQuickAdd, onBulkAdd, onEdit, onDelete,
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
          {collapsed
            ? <CaretRight size={13} weight="bold" />
            : <CaretDown  size={13} weight="bold" />
          }
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
          <span
            className="scg-name"
            onDoubleClick={() => setEditing(true)}
          >
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

        <button className="btn-ghost btn-xs scg-quick-btn" onClick={onQuickAdd}>
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
        <button
          className="btn-primary btn-xs"
          onClick={submit}
          disabled={!value.trim() || adding}
        >
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
function ShotCard({ shot, status, stages, onClick, onLink }) {
  const pct = pipelineCompletion(shot, stages)
  const hasThumb = !!shot.thumbnailUrl

  return (
    <div className="shot-card" onClick={onClick}>
      {/* Thumbnail area */}
      <div className={`sc-thumb ${!hasThumb ? 'sc-thumb--empty' : ''}`}>
        {hasThumb ? (
          <>
            <img src={shot.thumbnailUrl} alt={shot.title} loading="lazy" />
            <div className="sc-thumb-overlay" />
            {status && (
              <span className="sc-badge sc-badge--status" style={{ background: status.color }}>
                {status.name}
              </span>
            )}
            {shot.assetCount > 1 && (
              <span className="sc-badge sc-badge--takes sc-badge--bl">
                {shot.assetCount} takes
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
        {hasThumb && (
          <button
            className="sc-link-btn"
            title="Link media asset"
            onClick={e => { e.stopPropagation(); onLink() }}
          >
            <Link size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="sc-body">
        <div className="sc-title">{shot.title}</div>
        {!hasThumb && status && (
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
      </div>
    </div>
  )
}

// ── Main ShotCardsView ────────────────────────────────────────────────
export default function ShotCardsView({
  projectId, statuses, scenes, stages, shots, columns,
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onShotMerge, onReload,
}) {
  const collapseKey = `ets_scene_collapse_${projectId}`

  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(collapseKey)) || {} } catch { return {} }
  })
  const [selectedShot,  setSelectedShot]  = useState(null)
  const [linkingShot,   setLinkingShot]   = useState(null)
  const [bulkAddScene,  setBulkAddScene]  = useState(null) // scene object | null for ungrouped

  function toggleCollapse(sceneId) {
    setCollapsed(prev => {
      const next = { ...prev, [sceneId || '__ungrouped__']: !prev[sceneId || '__ungrouped__'] }
      localStorage.setItem(collapseKey, JSON.stringify(next))
      return next
    })
  }

  // Group shots by scene
  const shotsByScene = {}
  for (const shot of shots) {
    const key = shot.scene_id || '__ungrouped__'
    if (!shotsByScene[key]) shotsByScene[key] = []
    shotsByScene[key].push(shot)
  }

  // Build ordered groups
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
  // If no scenes at all, show one flat group
  if (scenes.length === 0 && ungrouped.length > 0) {
    // Already pushed above; skip
  }

  async function handleQuickCreate({ title, shot_number, scene_id }) {
    await onShotCreate({ title, shot_number, scene_id, position: shots.length })
  }

  async function handleEditScene(scene, newName) {
    // Update scene name via API — reuse existing onSceneCreate as workaround
    // We don't have an updateScene in props, so call productionApi directly
    const { productionApi } = await import('../../../lib/api')
    await productionApi.updateScene(scene.id, { name: newName })
    onReload()
  }

  async function handleDeleteScene(scene) {
    const sceneShots = shotsByScene[scene.id] || []
    const msg = sceneShots.length > 0
      ? `Delete scene "${scene.name}" and its ${sceneShots.length} shot${sceneShots.length !== 1 ? 's' : ''}?`
      : `Delete scene "${scene.name}"?`
    if (!window.confirm(msg)) return
    const { productionApi } = await import('../../../lib/api')
    if (sceneShots.length > 0) {
      for (const s of sceneShots) await onShotDelete(s.id)
    }
    await productionApi.deleteScene(scene.id)
    onReload()
  }

  function handleLinkUpdate(updatedShot) {
    if (onShotMerge) {
      onShotMerge(updatedShot.id, updatedShot)
    } else {
      onShotUpdate(updatedShot.id, updatedShot)
    }
  }

  // Empty state
  if (shots.length === 0 && scenes.length === 0) {
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
                colorIdx={idx}
                collapsed={isCollapsed}
                onToggle={() => toggleCollapse(sceneId)}
                onQuickAdd={() => {/* handled inline by QuickAddCard */}}
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

        {/* Add new scene button */}
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
          shot={linkingShot}
          onLinked={updatedShot => {
            if (updatedShot) handleLinkUpdate(updatedShot)
            else onReload()
            setLinkingShot(null)
          }}
          onClose={() => setLinkingShot(null)}
        />
      )}

      {bulkAddScene !== undefined && bulkAddScene !== false && (
        <BulkAddShotsModal
          projectId={projectId}
          scene={bulkAddScene}
          scenes={scenes}
          shots={shots}
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
