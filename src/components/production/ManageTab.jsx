import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  ListBullets, SlidersHorizontal, SpinnerGap, Warning, Plus,
  FilmSlate, Funnel, DownloadSimple, Rows, SquaresFour,
  CaretLeft, CaretRight,
} from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'
import { useProject } from '../../context/ProjectContext'

import ShotListView from './views/ShotListView'
import ShotCardView from './views/ShotCardView'
import ColumnManager from './ColumnManager'

const SCENE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#f59e0b','#ef4444','#ec4899',
]

export default function ManageTab() {
  const { id: projectId }              = useParams()
  const { canEdit, canDelete }         = useProject()

  const [statuses,        setStatuses]        = useState([])
  const [scenes,          setScenes]          = useState([])
  const [columns,         setColumns]         = useState([])
  const [shots,           setShots]           = useState([])
  const [teamMembers,     setTeamMembers]     = useState([])
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(null)
  const [seeding,         setSeeding]         = useState(false)
  const [seedError,       setSeedError]       = useState(null)
  const [seeded,          setSeeded]          = useState(false)
  const [showColMgr,      setShowColMgr]      = useState(false)
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [addingScene,     setAddingScene]     = useState(false)
  const [newSceneName,    setNewSceneName]    = useState('')
  const [viewMode,        setViewMode]        = useState(() => localStorage.getItem(`manage-view-${projectId}`) || 'list')
  const [sideCollapsed,   setSideCollapsed]   = useState(() => localStorage.getItem(`manage-side-${projectId}`) === '1')
  const newSceneInputRef = useRef(null)
  const [hiddenCols, setHiddenCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`list-cols-${projectId}`)) || {} } catch { return {} }
  })

  function setView(v) {
    setViewMode(v)
    localStorage.setItem(`manage-view-${projectId}`, v)
  }
  function toggleSide() {
    setSideCollapsed(c => {
      localStorage.setItem(`manage-side-${projectId}`, c ? '0' : '1')
      return !c
    })
  }

  function toggleHideCol(colId, hidden) {
    setHiddenCols(prev => {
      const next = { ...prev, [colId]: hidden }
      localStorage.setItem(`list-cols-${projectId}`, JSON.stringify(next))
      return next
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [stsRes, scnRes, colRes, shotsRes, membersRes] = await Promise.all([
        productionApi.listStatuses(projectId),
        productionApi.listScenes(projectId),
        productionApi.listColumns(projectId),
        productionApi.listShotsWithMedia(projectId),
        productionApi.getProjectMembers(projectId).catch(() => ({ members: [] })),
      ])
      setStatuses(stsRes.statuses    || [])
      setScenes(scnRes.scenes        || [])
      setColumns(colRes.columns      || [])
      setShots(shotsRes.shots        || [])
      setTeamMembers(membersRes.members || [])
    } catch (err) {
      setLoadError(err?.message || 'Failed to load production data')
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleSeed() {
    setSeeding(true)
    setSeedError(null)
    try {
      await productionApi.seed(projectId)
      setSeeded(true)
      await load()
    } catch (err) {
      setSeedError(err?.message || 'Setup failed. Please try again.')
    }
    setSeeding(false)
  }

  async function createShot(body) {
    const res  = await productionApi.createShot(projectId, body)
    const shot = res.shot
    setShots(prev => [...prev, { ...shot, linked_media_id: null, linked_media_name: null }])
    return shot
  }

  async function updateShot(id, body) {
    const res  = await productionApi.updateShot(id, body)
    const shot = res.shot
    setShots(prev => prev.map(s => s.id === id ? { ...s, ...shot } : s))
    return shot
  }

  async function deleteShot(id) {
    await productionApi.deleteShot(id)
    setShots(prev => prev.filter(s => s.id !== id))
  }

  async function createScene(name) {
    const res = await productionApi.createScene(projectId, { name, position: scenes.length })
    const newScene = res.scene
    setScenes(prev => [...prev, newScene])
    setSelectedSceneId(newScene.id)
    return newScene
  }

  function startAddScene() {
    setAddingScene(true)
    setNewSceneName('')
    setTimeout(() => newSceneInputRef.current?.focus(), 50)
  }

  async function commitAddScene(e) {
    e?.preventDefault()
    const name = newSceneName.trim()
    setAddingScene(false)
    setNewSceneName('')
    if (name) {
      try { await createScene(name) } catch {}
    }
  }

  function cancelAddScene() {
    setAddingScene(false)
    setNewSceneName('')
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="manage-loading">
      <SpinnerGap size={28} className="spin" />
    </div>
  )

  if (loadError) return (
    <div className="manage-empty">
      <Warning size={40} weight="duotone" style={{ color: '#f87171', marginBottom: 12 }} />
      <h3>Failed to load</h3>
      <p style={{ color: '#f87171' }}>{loadError}</p>
      <button className="btn-primary" onClick={load}>Retry</button>
    </div>
  )

  // ── Empty / first-time seed ──────────────────────────────────────────
  const isEmpty = statuses.length === 0 && !seeded
  if (isEmpty) return (
    <div className="manage-empty">
      <ListBullets size={48} weight="duotone" style={{ opacity: 0.2, marginBottom: 12 }} />
      <h3>Set up Production Management</h3>
      <p>Create your shot list, track progress, and manage your production workflow.</p>
      {seedError && (
        <p style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>{seedError}</p>
      )}
      <button className="btn-primary" onClick={handleSeed} disabled={seeding}>
        {seeding ? <><SpinnerGap size={14} className="spin" /> Setting up…</> : 'Get Started'}
      </button>
    </div>
  )

  const filteredShots = selectedSceneId
    ? shots.filter(s => s.scene_id === selectedSceneId)
    : shots

  const activeSceneName = selectedSceneId
    ? scenes.find(s => s.id === selectedSceneId)?.name
    : 'All Shots'

  const sharedProps = {
    projectId, statuses, scenes, columns,
    shots: filteredShots,
    filterSceneId: selectedSceneId,
    teamMembers,
    canEdit,
    canDelete,
    onShotCreate:  canEdit   ? createShot  : null,
    onShotUpdate:  canEdit   ? updateShot  : null,
    onShotDelete:  canDelete ? deleteShot  : null,
    onSceneCreate: canEdit   ? createScene : null,
    onReload:      load,
    hiddenCols,
    onManageColumns: () => setShowColMgr(true),
  }

  return (
    <div className="manage-tab">
      {/* ── Scene Sidebar ────────────────────────────────── */}
      <div className={`manage-sidebar ${sideCollapsed ? 'collapsed' : ''}`}>
        <div className="manage-sidebar-header">
          {!sideCollapsed && <span>Scenes</span>}
          <button className="manage-side-toggle" onClick={toggleSide} title={sideCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sideCollapsed ? <CaretRight size={12} weight="bold" /> : <CaretLeft size={12} weight="bold" />}
          </button>
        </div>

        <nav className="manage-sidebar-nav">
          <button
            className={`manage-sidebar-item ${!selectedSceneId ? 'active' : ''}`}
            onClick={() => setSelectedSceneId(null)}
            title="All Shots"
          >
            <ListBullets size={13} weight="duotone" className="manage-sidebar-icon" />
            {!sideCollapsed && (
              <div className="manage-sidebar-text">
                <span className="manage-sidebar-label">All Shots</span>
              </div>
            )}
            <span className="manage-sidebar-count">{shots.length}</span>
          </button>

          {scenes.map((scene, idx) => {
            const color = SCENE_COLORS[idx % SCENE_COLORS.length]
            const count = shots.filter(s => s.scene_id === scene.id).length
            return (
              <button
                key={scene.id}
                className={`manage-sidebar-item ${selectedSceneId === scene.id ? 'active' : ''}`}
                onClick={() => setSelectedSceneId(scene.id)}
                title={scene.name}
              >
                <FilmSlate size={13} weight="duotone" className="manage-sidebar-icon" style={{ color }} />
                {!sideCollapsed && (
                  <div className="manage-sidebar-text">
                    <span className="manage-sidebar-label">{scene.name}</span>
                    <span className="manage-sidebar-sub">
                      {scene.location ? scene.location.toUpperCase() : '—'}
                    </span>
                  </div>
                )}
                <span className="manage-sidebar-count">{count}</span>
              </button>
            )
          })}
        </nav>

        {canEdit && !sideCollapsed && (
          <div className="manage-sidebar-footer">
            {addingScene ? (
              <form onSubmit={commitAddScene} style={{ padding: '4px 8px' }}>
                <input
                  ref={newSceneInputRef}
                  value={newSceneName}
                  onChange={e => setNewSceneName(e.target.value)}
                  onBlur={commitAddScene}
                  onKeyDown={e => { if (e.key === 'Escape') cancelAddScene() }}
                  placeholder="Scene name…"
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.07)',
                    border: '1px solid var(--accent-soft)', borderRadius: 6,
                    color: 'var(--text)', fontSize: 12, padding: '5px 8px', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </form>
            ) : (
              <button className="manage-sidebar-add" onClick={startAddScene}>
                <Plus size={12} weight="bold" /> New Scene
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Main Content ─────────────────────────────────── */}
      <div className="manage-content">
        <div className="manage-toolbar">
          <div className="manage-stats">
            <span className="manage-stat-total">{filteredShots.length} SHOTS</span>
            {statuses.slice(0, 4).map(s => {
              const cnt = filteredShots.filter(sh => sh.status_id === s.id).length
              if (cnt === 0) return null
              return (
                <span key={s.id} className="manage-stat-chip" style={{ '--sc': s.color || 'var(--accent)' }}>
                  {cnt} {(s.name || '').toUpperCase()}
                </span>
              )
            })}
          </div>
          <div className="manage-toolbar-right">
            {/* View toggle */}
            <div className="manage-view-toggle">
              <button
                className={`manage-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setView('list')}
                title="List view"
              >
                <Rows size={14} weight="duotone" />
              </button>
              <button
                className={`manage-view-btn ${viewMode === 'card' ? 'active' : ''}`}
                onClick={() => setView('card')}
                title="Card view"
              >
                <SquaresFour size={14} weight="duotone" />
              </button>
            </div>
            <button className="btn-ghost" disabled title="Filter (coming soon)">
              <Funnel size={13} weight="duotone" /> Filter
            </button>
            <button className="btn-ghost" disabled title="Export CSV (coming soon)">
              <DownloadSimple size={13} weight="duotone" /> Export
            </button>
            {canEdit && viewMode === 'list' && (
              <button className="btn-ghost" onClick={() => setShowColMgr(true)}>
                <SlidersHorizontal size={13} /> Columns
              </button>
            )}
          </div>
        </div>

        {viewMode === 'list'
          ? <ShotListView {...sharedProps} />
          : <ShotCardView
              projectId={projectId}
              statuses={statuses}
              scenes={scenes}
              shots={filteredShots}
              filterSceneId={selectedSceneId}
              canEdit={canEdit}
              canDelete={canDelete}
              onShotCreate={canEdit   ? createShot  : null}
              onShotUpdate={canEdit   ? updateShot  : null}
              onShotDelete={canDelete ? deleteShot  : null}
              onReload={load}
            />
        }
      </div>

      {showColMgr && (
        <ColumnManager
          projectId={projectId}
          columns={columns}
          hiddenCols={hiddenCols}
          onToggleHide={toggleHideCol}
          onClose={() => setShowColMgr(false)}
          onSaved={cols => setColumns(cols)}
        />
      )}
    </div>
  )
}
