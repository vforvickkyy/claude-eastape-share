import React, { useState } from 'react'
import {
  FilmSlate, CalendarBlank, Link, PlusCircle, Image,
} from '@phosphor-icons/react'
import ShotDetailPanel from '../ShotDetailPanel'
import MediaBrowserModal from '../MediaBrowserModal'

function PipelineBar({ stages, data }) {
  if (!stages?.length) return null
  const filled = stages.filter(s => (data?.[s.name] ?? 0) >= 100).length
  const overall = stages.length ? Math.round(stages.reduce((acc, s) => acc + (data?.[s.name] ?? 0), 0) / stages.length) : 0
  return (
    <div className="sc-pipeline">
      <div className="sc-pipeline-track">
        <div className="sc-pipeline-fill" style={{ width: `${overall}%` }} />
      </div>
      <span className="sc-pipeline-pct">{overall}%</span>
    </div>
  )
}

export default function ShotCardsView({
  projectId, statuses, scenes, stages, shots, columns,
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload,
}) {
  const [selectedShot, setSelectedShot] = useState(null)
  const [linkingShot, setLinkingShot]   = useState(null)

  return (
    <>
      <div className="shot-cards-grid">
        {shots.map(shot => {
          const status = statuses.find(s => s.id === shot.status_id)
          const scene  = scenes.find(s => s.id === shot.scene_id)
          return (
            <div
              key={shot.id}
              className="shot-card"
              onClick={() => setSelectedShot(shot)}
            >
              {/* Thumbnail */}
              <div className="sc-thumb">
                {shot.thumbnailUrl
                  ? <img src={shot.thumbnailUrl} alt={shot.title} loading="lazy" />
                  : (
                    <div className="sc-thumb-placeholder">
                      <FilmSlate size={28} weight="duotone" />
                    </div>
                  )
                }
                {shot.shot_number && (
                  <span className="sc-shot-num">#{shot.shot_number}</span>
                )}
                <button
                  className="sc-link-btn"
                  title="Link media asset"
                  onClick={e => { e.stopPropagation(); setLinkingShot(shot) }}
                >
                  <Link size={12} />
                </button>
              </div>

              {/* Body */}
              <div className="sc-body">
                <div className="sc-title">{shot.title}</div>
                <div className="sc-meta">
                  {status && (
                    <span className="sc-status" style={{ background: status.color + '22', color: status.color, borderColor: status.color + '55' }}>
                      {status.name}
                    </span>
                  )}
                  {scene && <span className="sc-scene">{scene.name}</span>}
                </div>
                {shot.due_date && (
                  <div className="sc-date">
                    <CalendarBlank size={11} />
                    {new Date(shot.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                )}
                <PipelineBar stages={stages} data={shot.pipeline_stages} />
                {shot.assetCount > 0 && (
                  <div className="sc-assets">
                    <Image size={11} /> {shot.assetCount} asset{shot.assetCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Add shot card */}
        <button
          className="shot-card shot-card--add"
          onClick={() => onShotCreate({ title: 'New Shot', position: shots.length })}
        >
          <PlusCircle size={30} weight="duotone" />
          <span>Add Shot</span>
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
          onLinked={() => { setLinkingShot(null); onReload() }}
          onClose={() => setLinkingShot(null)}
        />
      )}
    </>
  )
}
