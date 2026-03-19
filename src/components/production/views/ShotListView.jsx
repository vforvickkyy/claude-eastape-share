import React, { useState, useRef } from 'react'
import {
  Plus, Trash, DotsThree, CaretDown, CaretRight,
  DotsSixVertical, Check, X, PencilSimple,
} from '@phosphor-icons/react'
import ShotDetailPanel from '../ShotDetailPanel'

export default function ShotListView({
  projectId, statuses, scenes, columns, shots,
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload,
}) {
  const [selectedShot,  setSelectedShot]  = useState(null)
  const [collapsed,     setCollapsed]     = useState({})
  const [addingScene,   setAddingScene]   = useState(false)
  const [newSceneName,  setNewSceneName]  = useState('')
  const [addingShot,    setAddingShot]    = useState(null) // sceneId or 'unassigned'
  const [newShotTitle,  setNewShotTitle]  = useState('')
  const [dragging,      setDragging]      = useState(null)
  const [dragOver,      setDragOver]      = useState(null)
  const dragItem = useRef(null)

  // Group shots by scene
  const unassigned = shots.filter(s => !s.scene_id)
  const byScene = scenes.map(scene => ({
    scene,
    shots: shots.filter(s => s.scene_id === scene.id),
  }))

  function getStatusMeta(shot) {
    return statuses.find(s => s.id === shot.status_id) || null
  }

  async function handleAddShot(sceneId) {
    if (!newShotTitle.trim()) return
    await onShotCreate({
      title:    newShotTitle.trim(),
      scene_id: sceneId === 'unassigned' ? null : sceneId,
      position: shots.filter(s => (sceneId === 'unassigned' ? !s.scene_id : s.scene_id === sceneId)).length,
    })
    setNewShotTitle('')
    setAddingShot(null)
  }

  async function handleAddScene() {
    if (!newSceneName.trim()) return
    await onSceneCreate(newSceneName.trim())
    setNewSceneName('')
    setAddingScene(false)
  }

  async function handleStatusChange(shotId, statusId) {
    await onShotUpdate(shotId, { status_id: statusId })
  }

  // Drag-to-reorder within same group
  function onDragStart(e, shot) {
    dragItem.current = shot
    setDragging(shot.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function onDrop(e, targetShot) {
    e.preventDefault()
    if (!dragItem.current || dragItem.current.id === targetShot.id) return
    const src = dragItem.current
    const tgt = targetShot
    // Swap positions within same context
    await Promise.all([
      onShotUpdate(src.id, { position: tgt.position }),
      onShotUpdate(tgt.id, { position: src.position }),
    ])
    dragItem.current = null
    setDragging(null)
    setDragOver(null)
  }

  function renderShotRow(shot) {
    const status = getStatusMeta(shot)
    return (
      <div
        key={shot.id}
        className={`shot-row ${dragging === shot.id ? 'dragging' : ''} ${dragOver === shot.id ? 'drag-over' : ''}`}
        draggable
        onDragStart={e => onDragStart(e, shot)}
        onDragOver={e => { e.preventDefault(); setDragOver(shot.id) }}
        onDragLeave={() => setDragOver(null)}
        onDrop={e => onDrop(e, shot)}
        onDragEnd={() => { setDragging(null); setDragOver(null) }}
        onClick={() => setSelectedShot(shot)}
      >
        <span className="shot-drag-handle" onClick={e => e.stopPropagation()}>
          <DotsSixVertical size={14} />
        </span>

        {shot.shot_number && (
          <span className="shot-number">{shot.shot_number}</span>
        )}

        <span className="shot-title">{shot.title}</span>

        <span className="shot-status-cell" onClick={e => e.stopPropagation()}>
          {status ? (
            <StatusPill shot={shot} statuses={statuses} onChange={handleStatusChange} />
          ) : (
            <StatusPill shot={shot} statuses={statuses} onChange={handleStatusChange} empty />
          )}
        </span>

        {shot.due_date && (
          <span className="shot-due">{new Date(shot.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        )}

        <button
          className="shot-delete-btn"
          onClick={e => { e.stopPropagation(); onShotDelete(shot.id) }}
        >
          <Trash size={13} />
        </button>
      </div>
    )
  }

  function renderAddShotRow(groupId) {
    if (addingShot !== groupId) {
      return (
        <button className="shot-add-btn" onClick={e => { e.stopPropagation(); setAddingShot(groupId); setNewShotTitle('') }}>
          <Plus size={13} /> Add shot
        </button>
      )
    }
    return (
      <div className="shot-add-row">
        <input
          className="shot-add-input"
          value={newShotTitle}
          onChange={e => setNewShotTitle(e.target.value)}
          placeholder="Shot title…"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddShot(groupId)
            if (e.key === 'Escape') { setAddingShot(null); setNewShotTitle('') }
          }}
        />
        <button className="icon-btn" onClick={() => handleAddShot(groupId)}><Check size={14} /></button>
        <button className="icon-btn" onClick={() => { setAddingShot(null); setNewShotTitle('') }}><X size={14} /></button>
      </div>
    )
  }

  return (
    <div className="shot-list-view">
      {/* Column headers */}
      <div className="shot-list-header">
        <span style={{ width: 14 }} />
        <span className="shot-col-title">Title</span>
        <span className="shot-col-status">Status</span>
        <span className="shot-col-due">Due</span>
        <span style={{ width: 28 }} />
      </div>

      {/* Unassigned shots */}
      {(unassigned.length > 0 || addingShot === 'unassigned') && (
        <div className="shot-group">
          <div className="shot-group-header">
            <span className="shot-group-name">Unassigned</span>
            <span className="shot-group-count">{unassigned.length}</span>
          </div>
          {unassigned.map(renderShotRow)}
          {renderAddShotRow('unassigned')}
        </div>
      )}

      {/* Scene groups */}
      {byScene.map(({ scene, shots: sceneShots }) => (
        <div key={scene.id} className="shot-group">
          <div
            className="shot-group-header"
            onClick={() => setCollapsed(c => ({ ...c, [scene.id]: !c[scene.id] }))}
          >
            {collapsed[scene.id] ? <CaretRight size={13} /> : <CaretDown size={13} />}
            <span className="shot-group-name">{scene.name}</span>
            <span className="shot-group-count">{sceneShots.length}</span>
          </div>
          {!collapsed[scene.id] && (
            <>
              {sceneShots.map(renderShotRow)}
              {renderAddShotRow(scene.id)}
            </>
          )}
        </div>
      ))}

      {/* Add scene */}
      <div className="shot-add-scene-area">
        {addingScene ? (
          <div className="shot-add-row">
            <input
              className="shot-add-input"
              value={newSceneName}
              onChange={e => setNewSceneName(e.target.value)}
              placeholder="Scene name…"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddScene()
                if (e.key === 'Escape') { setAddingScene(false); setNewSceneName('') }
              }}
            />
            <button className="icon-btn" onClick={handleAddScene}><Check size={14} /></button>
            <button className="icon-btn" onClick={() => { setAddingScene(false); setNewSceneName('') }}><X size={14} /></button>
          </div>
        ) : (
          <button className="shot-add-btn shot-add-scene-btn" onClick={() => setAddingScene(true)}>
            <Plus size={13} /> Add scene
          </button>
        )}
      </div>

      {/* Add shot (no scene) button when no unassigned yet */}
      {unassigned.length === 0 && addingShot !== 'unassigned' && (
        <div className="shot-add-scene-area">
          <button className="shot-add-btn" onClick={() => { setAddingShot('unassigned'); setNewShotTitle('') }}>
            <Plus size={13} /> Add shot
          </button>
        </div>
      )}

      {/* Shot detail panel */}
      {selectedShot && (
        <ShotDetailPanel
          shotId={selectedShot.id}
          statuses={statuses}
          scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={updatedShot => {
            onShotUpdate(updatedShot.id, updatedShot)
            setSelectedShot(updatedShot)
          }}
          onDelete={id => { onShotDelete(id); setSelectedShot(null) }}
        />
      )}
    </div>
  )
}

function StatusPill({ shot, statuses, onChange, empty }) {
  const [open, setOpen] = useState(false)
  const current = statuses.find(s => s.id === shot.status_id)

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="shot-status-pill"
        style={{ background: current ? current.color + '22' : 'transparent', color: current?.color || 'var(--t3)', borderColor: current ? current.color + '55' : 'var(--border)' }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      >
        {current ? <span className="shot-status-dot" style={{ background: current.color }} /> : null}
        {current ? current.name : 'No status'}
        <CaretDown size={9} />
      </button>
      {open && (
        <div className="shot-status-dropdown" onClick={e => e.stopPropagation()}>
          <button className="psd-opt" onClick={() => { onChange(shot.id, null); setOpen(false) }}>
            <span className="psd-dot" style={{ background: '#6b7280' }} /> No status
          </button>
          {statuses.map(s => (
            <button key={s.id} className={`psd-opt ${shot.status_id === s.id ? 'active' : ''}`}
              onClick={() => { onChange(shot.id, s.id); setOpen(false) }}
            >
              <span className="psd-dot" style={{ background: s.color }} />
              {s.name}
              {shot.status_id === s.id && <Check size={11} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
