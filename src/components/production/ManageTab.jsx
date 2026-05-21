import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  ListBullets, SlidersHorizontal, SpinnerGap, Warning, Plus,
  FilmSlate, Funnel, DownloadSimple, Rows, SquaresFour,
  CaretLeft, CaretRight, CaretDown, Trash, X,
} from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'
import { supabase } from '../../lib/supabaseClient'
import { useProject } from '../../context/ProjectContext'

import ShotListView from './views/ShotListView'
import ShotCardView from './views/ShotCardView'
import ColumnManager from './ColumnManager'
import ExportPdfModal from './ExportPdfModal'

const SCENE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#f59e0b','#ef4444','#ec4899',
]

function buildSceneTree(flatScenes) {
  const map = {}
  flatScenes.forEach(s => { map[s.id] = { ...s, children: [] } })
  const roots = []
  flatScenes.forEach(s => {
    if (s.parent_id && map[s.parent_id]) {
      map[s.parent_id].children.push(map[s.id])
    } else {
      roots.push(map[s.id])
    }
  })
  return roots
}

export default function ManageTab() {
  const { id: projectId }              = useParams()
  const { canEdit, canDelete, project, fileCounts } = useProject()

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
  const [showExport,      setShowExport]      = useState(false)
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [viewMode,        setViewMode]        = useState(() => localStorage.getItem(`manage-view-${projectId}`) || 'list')
  const [sideCollapsed,   setSideCollapsed]   = useState(() => localStorage.getItem(`manage-side-${projectId}`) === '1')
  const [hiddenCols, setHiddenCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`list-cols-${projectId}`)) || {} } catch { return {} }
  })

  // Scene add state — parentId: null = top-level, string = child
  const [addingSceneParent, setAddingSceneParent] = useState(undefined) // undefined = not adding
  const [newSceneName,      setNewSceneName]      = useState('')
  const newSceneInputRef = useRef(null)

  // Delete confirmation
  const [deletingScene, setDeletingScene] = useState(null)

  // Tree expand state
  const [expandedScenes, setExpandedScenes] = useState(new Set())
  const [hoverSceneId,   setHoverSceneId]   = useState(null)

  const sceneColorMap = useMemo(() => {
    const map = {}
    scenes.forEach((s, i) => { map[s.id] = SCENE_COLORS[i % SCENE_COLORS.length] })
    return map
  }, [scenes])

  const sceneTree = useMemo(() => buildSceneTree(scenes), [scenes])

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
  function toggleExpand(sceneId, e) {
    e?.stopPropagation()
    setExpandedScenes(prev => {
      const next = new Set(prev)
      if (next.has(sceneId)) next.delete(sceneId)
      else next.add(sceneId)
      return next
    })
  }

  function toggleHideCol(colId, hidden) {
    setHiddenCols(prev => {
      const next = { ...prev, [colId]: hidden }
      localStorage.setItem(`list-cols-${projectId}`, JSON.stringify(next))
      productionApi.saveBuiltinColVisibility(projectId, next).catch(() => {})
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
      const dbHidden = shotsRes.hidden_builtin_cols
      if (dbHidden && typeof dbHidden === 'object') {
        setHiddenCols(dbHidden)
        localStorage.setItem(`list-cols-${projectId}`, JSON.stringify(dbHidden))
      }
    } catch (err) {
      setLoadError(err?.message || 'Failed to load production data')
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`production-shots-${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'production_shots',
        filter: `project_id=eq.${projectId}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          load()
        } else if (payload.eventType === 'UPDATE') {
          setShots(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s))
        } else if (payload.eventType === 'DELETE') {
          setShots(prev => prev.filter(s => s.id !== payload.old.id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, load])

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

  async function createScene(name, parentId = null) {
    const res = await productionApi.createScene(projectId, { name, parent_id: parentId, position: scenes.length })
    const newScene = res.scene
    setScenes(prev => [...prev, newScene])
    if (parentId) setExpandedScenes(prev => new Set([...prev, parentId]))
    setSelectedSceneId(newScene.id)
    return newScene
  }

  function startAddScene(parentId = null) {
    setAddingSceneParent(parentId)
    setNewSceneName('')
    if (parentId) setExpandedScenes(prev => new Set([...prev, parentId]))
    setTimeout(() => newSceneInputRef.current?.focus(), 50)
  }

  async function commitAddScene(e) {
    e?.preventDefault()
    const name = newSceneName.trim()
    const parentId = addingSceneParent
    setAddingSceneParent(undefined)
    setNewSceneName('')
    if (name) {
      try { await createScene(name, parentId) } catch {}
    }
  }

  function cancelAddScene() {
    setAddingSceneParent(undefined)
    setNewSceneName('')
  }

  async function confirmDeleteScene() {
    if (!deletingScene) return
    const id = deletingScene.id
    setDeletingScene(null)
    try {
      await productionApi.deleteScene(id)
      // Remove the scene and reassign its children to the parent
      setScenes(prev => {
        const deleted = prev.find(s => s.id === id)
        return prev
          .filter(s => s.id !== id)
          .map(s => s.parent_id === id ? { ...s, parent_id: deleted?.parent_id || null } : s)
      })
      if (selectedSceneId === id) setSelectedSceneId(null)
    } catch {}
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

  function renderSceneItem(scene, depth = 0) {
    const color = sceneColorMap[scene.id] || '#6366f1'
    const count = shots.filter(s => s.scene_id === scene.id).length
    const hasChildren = scene.children?.length > 0
    const isExpanded = expandedScenes.has(scene.id)
    const isSelected = selectedSceneId === scene.id
    const isHovered = hoverSceneId === scene.id
    const isAddingChild = addingSceneParent === scene.id

    return (
      <React.Fragment key={scene.id}>
        <div
          className={`manage-sidebar-item ${isSelected ? 'active' : ''}`}
          style={sideCollapsed
            ? { paddingLeft: 0, justifyContent: 'center' }
            : { paddingLeft: 6 + depth * 14 }
          }
          onMouseEnter={() => setHoverSceneId(scene.id)}
          onMouseLeave={() => setHoverSceneId(null)}
          onClick={() => setSelectedSceneId(prev => prev === scene.id ? null : scene.id)}
        >
          {!sideCollapsed && (
            <button
              className="manage-sidebar-expand-btn"
              onClick={e => toggleExpand(scene.id, e)}
              title={isExpanded ? 'Collapse' : 'Expand'}
              style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
            >
              {isExpanded
                ? <CaretDown size={9} weight="bold" />
                : <CaretRight size={9} weight="bold" />
              }
            </button>
          )}

          <span
            className="manage-sidebar-color-dot"
            title={sideCollapsed ? scene.name : undefined}
            style={{ background: color, opacity: isSelected ? 1 : 0.55, width: sideCollapsed ? 9 : 7, height: sideCollapsed ? 9 : 7 }}
          />

          {!sideCollapsed && (
            <div className="manage-sidebar-text">
              <span className="manage-sidebar-label">{scene.name}</span>
            </div>
          )}

          {!sideCollapsed && <span className="manage-sidebar-count">{count}</span>}

          {canEdit && isHovered && !sideCollapsed && (
            <div className="manage-sidebar-actions">
              <button
                className="manage-sidebar-action-btn"
                onClick={e => { e.stopPropagation(); startAddScene(scene.id) }}
                title="Add sub-scene"
              >
                <Plus size={10} weight="bold" />
              </button>
              <button
                className="manage-sidebar-action-btn danger"
                onClick={e => { e.stopPropagation(); setDeletingScene(scene) }}
                title="Delete scene"
              >
                <Trash size={10} weight="bold" />
              </button>
            </div>
          )}
        </div>

        {/* Inline child input */}
        {isAddingChild && !sideCollapsed && (
          <form onSubmit={commitAddScene} className="manage-sidebar-inline-input" style={{ paddingLeft: 6 + (depth + 1) * 14 + 8 }}>
            <input
              ref={newSceneInputRef}
              value={newSceneName}
              onChange={e => setNewSceneName(e.target.value)}
              onBlur={commitAddScene}
              onKeyDown={e => { if (e.key === 'Escape') cancelAddScene() }}
              placeholder="Sub-scene name…"
              className="manage-sidebar-input"
            />
          </form>
        )}

        {/* Children */}
        {hasChildren && isExpanded && scene.children.map(child => renderSceneItem(child, depth + 1))}
      </React.Fragment>
    )
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
          {/* All Shots */}
          <div
            className={`manage-sidebar-item all-shots ${!selectedSceneId ? 'active' : ''}`}
            style={sideCollapsed ? { justifyContent: 'center' } : undefined}
            onClick={() => setSelectedSceneId(null)}
            title="All Shots"
          >
            <ListBullets size={sideCollapsed ? 15 : 13} weight="duotone" className="manage-sidebar-icon" />
            {!sideCollapsed && (
              <div className="manage-sidebar-text">
                <span className="manage-sidebar-label">All Shots</span>
              </div>
            )}
            {!sideCollapsed && <span className="manage-sidebar-count">{shots.length}</span>}
          </div>

          {/* Scene divider */}
          {scenes.length > 0 && !sideCollapsed && (
            <div className="manage-sidebar-divider" />
          )}

          {/* Scene tree */}
          {sceneTree.map(scene => renderSceneItem(scene, 0))}

          {/* Top-level add input */}
          {addingSceneParent === null && !sideCollapsed && (
            <form onSubmit={commitAddScene} className="manage-sidebar-inline-input" style={{ paddingLeft: 8 }}>
              <input
                ref={newSceneInputRef}
                value={newSceneName}
                onChange={e => setNewSceneName(e.target.value)}
                onBlur={commitAddScene}
                onKeyDown={e => { if (e.key === 'Escape') cancelAddScene() }}
                placeholder="Scene name…"
                className="manage-sidebar-input"
              />
            </form>
          )}
        </nav>

        {canEdit && !sideCollapsed && (
          <div className="manage-sidebar-footer">
            <button className="manage-sidebar-add" onClick={() => startAddScene(null)}>
              <Plus size={12} weight="bold" /> New Scene
            </button>
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
            <button className="btn-ghost" onClick={() => setShowExport(true)}>
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

      {showExport && (
        <ExportPdfModal
          onClose={() => setShowExport(false)}
          shots={filteredShots}
          scenes={scenes}
          statuses={statuses}
          columns={columns}
          teamMembers={teamMembers}
          projectName={project?.name || ''}
          clientName={project?.client_name || ''}
          mediaCount={fileCounts?.media_count || 0}
          memberCount={fileCounts?.member_count || 0}
        />
      )}

      {/* ── Delete Confirmation ───────────────────────────── */}
      {deletingScene && (
        <div className="manage-delete-overlay" onClick={() => setDeletingScene(null)}>
          <div className="manage-delete-dialog" onClick={e => e.stopPropagation()}>
            <div className="manage-delete-dialog-header">
              <span>Delete scene?</span>
              <button className="manage-delete-close" onClick={() => setDeletingScene(null)}>
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="manage-delete-dialog-body">
              <strong>"{deletingScene.name}"</strong> will be permanently removed.
              {shots.filter(s => s.scene_id === deletingScene.id).length > 0 && (
                <> The {shots.filter(s => s.scene_id === deletingScene.id).length} shots inside will be unlinked from this scene.</>
              )}
            </p>
            <div className="manage-delete-dialog-actions">
              <button className="btn-ghost" onClick={() => setDeletingScene(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDeleteScene}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
