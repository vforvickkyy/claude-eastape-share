import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  ListBullets, CalendarBlank, ChartBar, SlidersHorizontal,
  SpinnerGap, Warning, SquaresFour, Kanban, Gear,
} from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'
import { useProject } from '../../context/ProjectContext'

import FirstTimeExperience    from './FirstTimeExperience'
import ShotCardsView          from './views/ShotCardsView'
import PipelineView           from './views/PipelineView'
import ShotListView           from './views/ShotListView'
import CalendarView           from './views/CalendarView'
import ProgressDashboard      from './views/ProgressDashboard'
import ColumnManager          from './ColumnManager'
import PipelineStageManager   from './PipelineStageManager'

const VIEWS = [
  { id: 'cards',    label: 'Cards',    icon: <SquaresFour   size={14} weight="duotone" /> },
  { id: 'pipeline', label: 'Pipeline', icon: <Kanban        size={14} weight="duotone" /> },
  { id: 'list',     label: 'List',     icon: <ListBullets   size={14} weight="duotone" /> },
  { id: 'calendar', label: 'Calendar', icon: <CalendarBlank size={14} weight="duotone" /> },
  { id: 'progress', label: 'Progress', icon: <ChartBar      size={14} weight="duotone" /> },
]

export default function ManageTab() {
  const { id: projectId }         = useParams()
  const { project, refetch }      = useProject()

  const [view,            setView]            = useState(null)
  const [statuses,        setStatuses]        = useState([])
  const [scenes,          setScenes]          = useState([])
  const [columns,         setColumns]         = useState([])
  const [shots,           setShots]           = useState([])
  const [stages,          setStages]          = useState([])
  const [teamMembers,     setTeamMembers]     = useState([])
  const [customAssignees, setCustomAssignees] = useState([])
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(null)
  const [seeding,    setSeeding]    = useState(false)
  const [seedError,  setSeedError]  = useState(null)
  const [seeded,     setSeeded]     = useState(false)
  const [showColMgr, setShowColMgr] = useState(false)
  const [showStageMgr, setShowStageMgr] = useState(false)

  // Set initial view from project once loaded
  useEffect(() => {
    if (project?.default_manage_view && view === null) {
      setView(project.default_manage_view)
    }
  }, [project?.default_manage_view])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [stsRes, scnRes, colRes, shotsRes, stagesRes, assigneesRes] = await Promise.all([
        productionApi.listStatuses(projectId),
        productionApi.listScenes(projectId),
        productionApi.listColumns(projectId),
        productionApi.listShotsWithMedia(projectId),
        productionApi.listPipelineStages(projectId),
        productionApi.getAssignees(projectId).catch(() => ({ teamMembers: [], customAssignees: [] })),
      ])
      setStatuses(stsRes.statuses              || [])
      setScenes(scnRes.scenes                  || [])
      setColumns(colRes.columns                || [])
      setShots(shotsRes.shots                  || [])
      setStages(stagesRes.stages               || [])
      setTeamMembers(assigneesRes.teamMembers  || [])
      setCustomAssignees(assigneesRes.customAssignees || [])
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

  async function handleFTEChoose(chosenView) {
    await productionApi.saveDefaultView(projectId, chosenView)
    setView(chosenView)
    await refetch()
  }

  // Shot CRUD helpers
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
    setScenes(prev => [...prev, res.scene])
    return res.scene
  }

  // ── Loading ──────────────────────────────────────────────────────
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

  // ── Empty / first-time seed ──────────────────────────────────────
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

  // ── First Time Experience — choose default view ──────────────────
  const activeView = view || project?.default_manage_view
  if (!activeView) {
    return (
      <FirstTimeExperience onChoose={handleFTEChoose} />
    )
  }

  // ── Review mode is full-overlay, rendered differently ────────────
  const sharedProps = {
    projectId, statuses, scenes, stages, columns, shots,
    teamMembers, customAssignees,
    onShotCreate:  createShot,
    onShotUpdate:  updateShot,
    onShotDelete:  deleteShot,
    onSceneCreate: createScene,
    onReload:      load,
  }

  // If stored view is the old 'review' tab (now removed), fall back to cards
  const resolvedView = activeView === 'review' ? 'cards' : activeView

  return (
    <div className="manage-tab">
      {/* Toolbar */}
      <div className="manage-toolbar">
        <div className="manage-view-switcher">
          {VIEWS.map(v => (
            <button
              key={v.id}
              className={`manage-view-btn ${resolvedView === v.id ? 'active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>
        <div className="manage-toolbar-right">
          {(activeView === 'cards' || activeView === 'pipeline') && (
            <button className="btn-ghost" onClick={() => setShowStageMgr(true)}>
              <Gear size={14} /> Stages
            </button>
          )}
          <button className="btn-ghost" onClick={() => setShowColMgr(true)}>
            <SlidersHorizontal size={14} /> Columns
          </button>
        </div>
      </div>

      {/* View content */}
      {resolvedView === 'cards'    && <ShotCardsView {...sharedProps} />}
      {resolvedView === 'pipeline' && <PipelineView  {...sharedProps} onManageStages={() => setShowStageMgr(true)} />}
      {resolvedView === 'list'     && <ShotListView     {...sharedProps} />}
      {resolvedView === 'calendar' && <CalendarView      {...sharedProps} />}
      {resolvedView === 'progress' && <ProgressDashboard {...sharedProps} />}

      {showColMgr && (
        <ColumnManager
          projectId={projectId}
          columns={columns}
          onClose={() => setShowColMgr(false)}
          onSaved={cols => setColumns(cols)}
        />
      )}

      {showStageMgr && (
        <PipelineStageManager
          projectId={projectId}
          stages={stages}
          onClose={() => setShowStageMgr(false)}
          onSaved={updated => setStages(updated)}
        />
      )}
    </div>
  )
}
