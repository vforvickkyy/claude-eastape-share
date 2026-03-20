import React, { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, ArrowRight, FilmSlate, X, SpinnerGap, PaperPlaneTilt,
  CheckCircle, ChatCircle, Play,
} from '@phosphor-icons/react'
import { productionApi } from '../../../lib/api'

function PipelinePanel({ shot, stages, onUpdate }) {
  const [vals, setVals]   = useState({})
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    setVals(shot.pipeline_stages || {})
  }, [shot.id])

  async function handleSave(stageName, v) {
    setSaving(stageName)
    try {
      await onUpdate(shot.id, stageName, Number(v))
    } finally {
      setSaving(null)
    }
  }

  if (!stages?.length) {
    return (
      <div className="srm-section">
        <div className="srm-section-title">Pipeline</div>
        <p style={{ fontSize: 12, color: 'var(--t3)' }}>No stages configured.</p>
      </div>
    )
  }

  return (
    <div className="srm-section">
      <div className="srm-section-title">Pipeline</div>
      {stages.map(stage => {
        const pct = vals[stage.name] ?? 0
        return (
          <div key={stage.id} className="srm-stage-row">
            <div className="srm-stage-header">
              <span className="srm-stage-dot" style={{ background: stage.color || '#6366f1' }} />
              <span className="srm-stage-name">{stage.name}</span>
              <span className="srm-stage-pct">{pct}%</span>
            </div>
            <div className="srm-stage-bar">
              <div
                className="srm-stage-fill"
                style={{ width: `${pct}%`, background: stage.color || '#6366f1' }}
              />
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={vals[stage.name] ?? 0}
              onChange={e => setVals(v => ({ ...v, [stage.name]: Number(e.target.value) }))}
              onMouseUp={() => handleSave(stage.name, vals[stage.name] ?? 0)}
              onTouchEnd={() => handleSave(stage.name, vals[stage.name] ?? 0)}
              className="srm-stage-slider"
            />
          </div>
        )
      })}
    </div>
  )
}

function CommentsPanel({ shot }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [body, setBody]         = useState('')
  const [posting, setPosting]   = useState(false)
  const bottomRef = useRef()

  useEffect(() => {
    setLoading(true)
    productionApi.listComments(shot.id)
      .then(r => setComments(r.comments || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shot.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  async function submit(e) {
    e.preventDefault()
    if (!body.trim() || posting) return
    setPosting(true)
    try {
      const r = await productionApi.createComment(shot.id, { body: body.trim() })
      setComments(prev => [...prev, r.comment])
      setBody('')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="srm-section srm-comments">
      <div className="srm-section-title">
        <ChatCircle size={13} weight="duotone" /> Comments
      </div>
      <div className="srm-comments-list">
        {loading && <SpinnerGap size={16} className="spin" style={{ margin: '12px auto', display: 'block' }} />}
        {!loading && comments.length === 0 && (
          <p className="srm-no-comments">No comments yet.</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="srm-comment">
            <div className="srm-comment-author">{c.profiles?.display_name || 'Unknown'}</div>
            <div className="srm-comment-body">{c.body}</div>
            <div className="srm-comment-time">
              {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="srm-comment-form" onSubmit={submit}>
        <input
          className="srm-comment-input"
          placeholder="Add a comment…"
          value={body}
          onChange={e => setBody(e.target.value)}
        />
        <button type="submit" className="srm-comment-send" disabled={!body.trim() || posting}>
          {posting ? <SpinnerGap size={14} className="spin" /> : <PaperPlaneTilt size={14} weight="fill" />}
        </button>
      </form>
    </div>
  )
}

function ShotMedia({ shot }) {
  const [mediaInfo, setMediaInfo] = useState(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (!shot?.thumbnail_media_id) { setMediaInfo(null); return }
    setLoading(true)
    productionApi.getMediaUrl(shot.thumbnail_media_id)
      .then(r => setMediaInfo(r))
      .catch(() => setMediaInfo(null))
      .finally(() => setLoading(false))
  }, [shot?.thumbnail_media_id])

  if (loading) {
    return (
      <div className="srm-media-inner srm-no-thumb">
        <SpinnerGap size={32} className="spin" />
      </div>
    )
  }

  if (mediaInfo?.url && mediaInfo?.mime_type?.startsWith('video/')) {
    return (
      <video
        key={mediaInfo.url}
        src={mediaInfo.url}
        controls
        poster={shot.thumbnailUrl || undefined}
        className="srm-video"
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
    )
  }

  if (shot.thumbnailUrl) {
    return <img src={shot.thumbnailUrl} alt={shot.title} className="srm-thumb-img" />
  }

  return (
    <div className="srm-media-inner srm-no-thumb">
      <FilmSlate size={56} weight="duotone" />
      <span>No thumbnail linked</span>
    </div>
  )
}

export default function ShotReviewMode({
  shots, statuses, scenes, stages,
  onShotUpdate, onShotDelete, onReload,
  onClose,
}) {
  const [idx, setIdx]   = useState(0)
  const shot = shots[idx] || null

  function prev() { setIdx(i => Math.max(0, i - 1)) }
  function next() { setIdx(i => Math.min(shots.length - 1, i + 1)) }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      if (e.key === 'Escape')     { onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function handleStageSave(shotId, stageName, progress) {
    await productionApi.updateShotPipeline(shotId, stageName, progress)
    await onReload()
  }

  if (!shot) return null

  const status = statuses.find(s => s.id === shot.status_id)
  const scene  = scenes.find(s => s.id === shot.scene_id)

  return (
    <div className="srm-overlay">
      {/* Left — media */}
      <div className="srm-left">
        <div className="srm-media">
          <ShotMedia shot={shot} />
        </div>

        <div className="srm-shot-info">
          <div className="srm-shot-meta">
            {shot.shot_number && <span className="srm-shot-num">#{shot.shot_number}</span>}
            {status && (
              <span className="srm-status-chip" style={{ background: status.color + '22', color: status.color }}>
                {status.name}
              </span>
            )}
            {scene && <span className="srm-scene">{scene.name}</span>}
          </div>
          <h2 className="srm-shot-title">{shot.title}</h2>
          {shot.description && <p className="srm-shot-desc">{shot.description}</p>}
        </div>

        {/* Nav */}
        <div className="srm-nav">
          <button className="srm-nav-btn" onClick={prev} disabled={idx === 0}>
            <ArrowLeft size={18} />
          </button>
          <span className="srm-nav-count">{idx + 1} / {shots.length}</span>
          <button className="srm-nav-btn" onClick={next} disabled={idx === shots.length - 1}>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {/* Right — pipeline + comments */}
      <div className="srm-right">
        <div className="srm-right-header">
          <span className="srm-right-title">Review</span>
          <button className="srm-close-btn" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="srm-right-scroll">
          <PipelinePanel shot={shot} stages={stages} onUpdate={handleStageSave} />
          <CommentsPanel shot={shot} />
        </div>
      </div>
    </div>
  )
}
