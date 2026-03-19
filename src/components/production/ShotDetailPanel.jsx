import React, { useEffect, useState } from 'react'
import { X, Trash, Check, CaretDown, PaperPlaneTilt } from '@phosphor-icons/react'
import { productionApi } from '../../lib/api'

export default function ShotDetailPanel({ shotId, statuses, scenes, onClose, onUpdate, onDelete }) {
  const [shot,     setShot]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [editTitle, setEditTitle] = useState('')

  useEffect(() => {
    loadShot()
    loadComments()
  }, [shotId])

  async function loadShot() {
    setLoading(true)
    try {
      const res = await productionApi.getShot(shotId)
      setShot(res.shot)
      setEditTitle(res.shot.title)
    } catch {}
    setLoading(false)
  }

  async function loadComments() {
    try {
      const res = await productionApi.listComments(shotId)
      setComments(res.comments || [])
    } catch {}
  }

  async function save(fields) {
    setSaving(true)
    try {
      const res = await productionApi.updateShot(shotId, fields)
      setShot(res.shot)
      onUpdate(res.shot)
    } catch {}
    setSaving(false)
  }

  async function submitComment() {
    if (!newComment.trim()) return
    try {
      const res = await productionApi.createComment(shotId, { body: newComment.trim() })
      setComments(c => [...c, res.comment])
      setNewComment('')
    } catch {}
  }

  async function deleteComment(id) {
    await productionApi.deleteComment(shotId, id).catch(() => {})
    setComments(c => c.filter(cm => cm.id !== id))
  }

  if (loading || !shot) return (
    <div className="shot-detail-panel">
      <div className="shot-detail-header">
        <button className="icon-btn" onClick={onClose}><X size={16} /></button>
      </div>
      <div style={{ padding: 24, opacity: 0.5 }}>Loading…</div>
    </div>
  )

  const currentStatus = statuses.find(s => s.id === shot.status_id)
  const currentScene  = scenes.find(s => s.id === shot.scene_id)

  return (
    <div className="shot-detail-overlay" onClick={onClose}>
      <div className="shot-detail-panel" onClick={e => e.stopPropagation()}>
        <div className="shot-detail-header">
          <input
            className="shot-detail-title-input"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={() => editTitle.trim() && editTitle !== shot.title && save({ title: editTitle.trim() })}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost danger" onClick={() => onDelete(shot.id)}>
              <Trash size={14} />
            </button>
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="shot-detail-body">
          {/* Status */}
          <div className="shot-detail-field">
            <label>Status</label>
            <div className="shot-detail-status-wrap">
              <select
                className="input-field"
                value={shot.status_id || ''}
                onChange={e => save({ status_id: e.target.value || null })}
              >
                <option value="">No status</option>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Scene */}
          <div className="shot-detail-field">
            <label>Scene</label>
            <select
              className="input-field"
              value={shot.scene_id || ''}
              onChange={e => save({ scene_id: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Shot number */}
          <div className="shot-detail-field">
            <label>Shot #</label>
            <input
              className="input-field"
              defaultValue={shot.shot_number || ''}
              onBlur={e => save({ shot_number: e.target.value || null })}
              placeholder="e.g. 1A"
            />
          </div>

          {/* Due date */}
          <div className="shot-detail-field">
            <label>Due Date</label>
            <input
              className="input-field input-date"
              type="date"
              value={shot.due_date || ''}
              onChange={e => save({ due_date: e.target.value || null })}
            />
          </div>

          {/* Description */}
          <div className="shot-detail-field">
            <label>Description</label>
            <textarea
              className="input-field"
              rows={3}
              defaultValue={shot.description || ''}
              onBlur={e => save({ description: e.target.value || null })}
              placeholder="Shot description…"
            />
          </div>

          {/* Comments */}
          <div className="shot-detail-comments">
            <h4 className="shot-detail-section-title">Comments</h4>
            {comments.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>No comments yet.</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="shot-comment">
                <div className="shot-comment-author">
                  {c.profiles?.display_name || 'User'}
                  <span className="shot-comment-time">{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <div className="shot-comment-body">{c.body}</div>
                <button className="shot-comment-del" onClick={() => deleteComment(c.id)}>
                  <Trash size={11} />
                </button>
              </div>
            ))}
            <div className="shot-comment-input-row">
              <input
                className="input-field"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment…"
                onKeyDown={e => { if (e.key === 'Enter') submitComment() }}
              />
              <button className="btn-primary-sm" onClick={submitComment} disabled={!newComment.trim()}>
                <PaperPlaneTilt size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
