import React, { useState, useRef, useEffect } from 'react'
import { CheckCircle, Gear } from '@phosphor-icons/react'
import { productionApi } from '../../../lib/api'
import ShotDetailPanel from '../ShotDetailPanel'
import PipelineStageManager from '../PipelineStageManager'

function ProgressCell({ shot, stage, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [val,  setVal]  = useState(shot.pipeline_stages?.[stage.name] ?? 0)
  const ref = useRef()

  useEffect(() => {
    setVal(shot.pipeline_stages?.[stage.name] ?? 0)
  }, [shot.pipeline_stages, stage.name])

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function save() {
    await onUpdate(shot.id, stage.name, Number(val))
    setOpen(false)
  }

  const pct = shot.pipeline_stages?.[stage.name] ?? 0

  return (
    <td className={`pv-cell ${pct >= 100 ? 'pv-cell--done' : ''}`}>
      <button className="pv-cell-btn" onClick={() => setOpen(v => !v)}>
        <div className="pv-cell-bar">
          <div className="pv-cell-fill" style={{ width: `${pct}%`, background: stage.color || '#6366f1' }} />
        </div>
        <span className="pv-cell-pct">{pct}%</span>
        {pct >= 100 && <CheckCircle size={13} weight="fill" style={{ color: '#22c55e', flexShrink: 0 }} />}
      </button>

      {open && (
        <div className="pv-popover" ref={ref}>
          <label className="pv-popover-label">{stage.name}</label>
          <input
            type="range" min={0} max={100} step={5}
            value={val}
            onChange={e => setVal(e.target.value)}
          />
          <div className="pv-popover-row">
            <span className="pv-popover-pct">{val}%</span>
            <button className="btn-primary btn-xs" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </td>
  )
}

export default function PipelineView({
  projectId, statuses, scenes, stages, shots, columns,
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload,
  onManageStages,
}) {
  const [selectedShot, setSelectedShot] = useState(null)
  const [updating, setUpdating] = useState(null)

  async function handleCellUpdate(shotId, stageName, progress) {
    const key = `${shotId}-${stageName}`
    setUpdating(key)
    try {
      await productionApi.updateShotPipeline(shotId, stageName, progress)
      await onReload()
    } finally {
      setUpdating(null)
    }
  }

  const groupedShots = scenes.length
    ? scenes.map(scene => ({
        scene,
        shots: shots.filter(s => s.scene_id === scene.id),
      })).filter(g => g.shots.length > 0)
    : [{ scene: null, shots }]

  // Also include shots without scene
  const scenelessShots = shots.filter(s => !s.scene_id)
  if (scenes.length > 0 && scenelessShots.length > 0) {
    groupedShots.push({ scene: null, shots: scenelessShots })
  }

  return (
    <>
      <div className="pv-wrapper">
        {stages.length === 0 && (
          <div className="pv-no-stages">
            No pipeline stages configured.{' '}
            <button className="link-btn" onClick={onManageStages}>Set up stages</button>
          </div>
        )}

        <table className="pv-table">
          <thead>
            <tr>
              <th className="pv-th-shot">Shot</th>
              <th className="pv-th-status">Status</th>
              {stages.map(s => (
                <th key={s.id} className="pv-th-stage">
                  <span className="pv-stage-dot" style={{ background: s.color || '#6366f1' }} />
                  {s.name}
                  {s.is_final_stage && <span className="pv-final-badge">Final</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedShots.map(({ scene, shots: groupShots }) => (
              <React.Fragment key={scene?.id || 'no-scene'}>
                {scene && (
                  <tr className="pv-scene-row">
                    <td colSpan={2 + stages.length} className="pv-scene-cell">
                      {scene.name}
                    </td>
                  </tr>
                )}
                {groupShots.map(shot => {
                  const status = statuses.find(s => s.id === shot.status_id)
                  return (
                    <tr key={shot.id} className="pv-row">
                      <td className="pv-td-shot" onClick={() => setSelectedShot(shot)}>
                        <div className="pv-shot-title">
                          {shot.shot_number && (
                            <span className="pv-shot-num">#{shot.shot_number}</span>
                          )}
                          {shot.title}
                        </div>
                      </td>
                      <td className="pv-td-status">
                        {status && (
                          <span
                            className="pv-status-chip"
                            style={{ background: status.color + '22', color: status.color, borderColor: status.color + '55' }}
                          >
                            {status.name}
                          </span>
                        )}
                      </td>
                      {stages.map(stage => (
                        <ProgressCell
                          key={stage.id}
                          shot={shot}
                          stage={stage}
                          onUpdate={handleCellUpdate}
                        />
                      ))}
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {shots.length === 0 && (
          <div className="pv-empty">No shots yet. Add them in the Shot List view.</div>
        )}
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
    </>
  )
}
