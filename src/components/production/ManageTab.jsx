import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { ListBullets, CalendarBlank, ChartBar, SlidersHorizontal, SpinnerGap, Warning } from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'
import ShotListView from './views/ShotListView'
import CalendarView from './views/CalendarView'
import ProgressDashboard from './views/ProgressDashboard'
import ColumnManager from './ColumnManager'

const VIEWS = [
  { id: 'list',     label: 'Shot List', icon: <ListBullets   size={15} weight="duotone" /> },
  { id: 'calendar', label: 'Calendar',  icon: <CalendarBlank size={15} weight="duotone" /> },
  { id: 'progress', label: 'Progress',  icon: <ChartBar      size={15} weight="duotone" /> },
]

export default function ManageTab() {
  const { id: projectId } = useParams()
  const [view,       setView]       = useState('list')
  const [statuses,   setStatuses]   = useState([])
  const [scenes,     setScenes]     = useState([])
  const [columns,    setColumns]    = useState([])
  const [shots,      setShots]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState(null)
  const [seeding,    setSeeding]    = useState(false)
  const [seedError,  setSeedError]  = useState(null)
  const [seeded,     setSeeded]     = useState(false)
  const [showColMgr, setShowColMgr] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [stsRes, scnRes, colRes, shotsRes] = await Promise.all([
        productionApi.listStatuses(projectId),
        productionApi.listScenes(projectId),
        productionApi.listColumns(projectId),
        productionApi.listShots(projectId),
      ])
      setStatuses(stsRes.statuses || [])
      setScenes(scnRes.scenes || [])
      setColumns(colRes.columns || [])
      setShots(shotsRes.shots || [])
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

  // Shot CRUD helpers passed down to children
  async function createShot(body) {
    const res = await productionApi.createShot(projectId, body)
    const shot = res.shot
    setShots(prev => [...prev, shot])
    return shot
  }

  async function updateShot(id, body) {
    const res = await productionApi.updateShot(id, body)
    const shot = res.shot
    setShots(prev => prev.map(s => s.id === id ? shot : s))
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

  // First-time: no statuses means unseeded
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
        {seeding ? (
          <><SpinnerGap size={14} className="spin" /> Setting up…</>
        ) : 'Get Started'}
      </button>
    </div>
  )

  const sharedProps = {
    projectId, statuses, scenes, columns, shots,
    onShotCreate: createShot,
    onShotUpdate: updateShot,
    onShotDelete: deleteShot,
    onSceneCreate: createScene,
    onReload: load,
  }

  return (
    <div className="manage-tab">
      {/* Toolbar */}
      <div className="manage-toolbar">
        <div className="manage-view-switcher">
          {VIEWS.map(v => (
            <button
              key={v.id}
              className={`manage-view-btn ${view === v.id ? 'active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>
        <div className="manage-toolbar-right">
          <button className="btn-ghost" onClick={() => setShowColMgr(true)}>
            <SlidersHorizontal size={14} /> Columns
          </button>
        </div>
      </div>

      {/* View */}
      {view === 'list'     && <ShotListView     {...sharedProps} />}
      {view === 'calendar' && <CalendarView      {...sharedProps} />}
      {view === 'progress' && <ProgressDashboard {...sharedProps} />}

      {showColMgr && (
        <ColumnManager
          projectId={projectId}
          columns={columns}
          onClose={() => setShowColMgr(false)}
          onSaved={cols => setColumns(cols)}
        />
      )}
    </div>
  )
}
