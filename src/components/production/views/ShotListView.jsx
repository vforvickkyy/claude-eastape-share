import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FilmSlate, CheckCircle, Check, MagnifyingGlass, Plus, X as XIcon,
  CaretDown, CaretRight, DotsThree, Link as LinkIcon,
} from '@phosphor-icons/react'
import { productionApi, projectMediaApi } from '../../../lib/api'
import ShotDetailPanel from '../ShotDetailPanel'
import MediaBrowserModal from '../MediaBrowserModal'

const THUMB_W = 60
const SCENE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#84cc16','#f59e0b','#ef4444','#ec4899',
]

// ── Completion helpers ────────────────────────────────────────────────
function pipelineCompletion(shot, stages) {
  if (!stages?.length) return null
  const numStages = stages.filter(s => !s.builtin_key)
  if (!numStages.length) return null
  const vals = numStages.map(s => {
    const v = shot.pipeline_stages?.[s.name]
    if (s.cell_type === 'percentage') return Number(v || 0)
    if (s.cell_type === 'checkbox')   return (v === true || v === 1 || v === 100) ? 100 : 0
    return 0
  })
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
function groupCompletion(shots, stages) {
  if (!shots.length) return null
  const vals = shots.map(s => pipelineCompletion(s, stages)).filter(v => v !== null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
function completionColor(pct) {
  if (pct == null) return '#404050'
  if (pct >= 80)   return '#10b981'
  if (pct >= 40)   return '#f59e0b'
  return '#404050'
}

// ── Click-outside hook ────────────────────────────────────────────────
function useClickOutside(ref, close) {
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) close() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
}

// ── Percentage Cell ───────────────────────────────────────────────────
function PercentageCell({ shot, stage, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const [val,  setVal]  = useState(shot.pipeline_stages?.[stage.name] ?? 0)
  const ref = useRef()
  useEffect(() => { setVal(shot.pipeline_stages?.[stage.name] ?? 0) }, [shot.pipeline_stages, stage.name])
  useClickOutside(ref, () => setOpen(false))
  async function save() { await onUpdate(shot.id, stage.name, Number(val)); setOpen(false) }
  const pct   = Number(shot.pipeline_stages?.[stage.name] ?? 0)
  const color = stage.color || '#6366f1'
  return (
    <td style={{ width, minWidth: width, padding: 0, position: 'relative', verticalAlign: 'middle' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: '100%', padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer', minHeight: 48 }}
      >
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.2s' }} />
        </div>
        <span style={{ fontSize: 11, color: pct >= 100 ? '#22c55e' : 'var(--t3)', flexShrink: 0, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
        {pct >= 100 && <CheckCircle size={12} weight="fill" style={{ color: '#22c55e', flexShrink: 0 }} />}
      </button>
      {open && (
        <div ref={ref} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10, padding: 14, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 10, fontWeight: 600 }}>{stage.name}</div>
          <input type="range" min={0} max={100} step={5} value={val} onChange={e => setVal(e.target.value)} style={{ width: '100%', accentColor: color }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 13, color: '#e8e8ff', fontWeight: 600 }}>{val}%</span>
            <button onClick={save} style={{ background: color, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Save</button>
          </div>
        </div>
      )}
    </td>
  )
}

// ── Checkbox Cell ─────────────────────────────────────────────────────
function CheckboxCell({ shot, stage, onUpdate, width }) {
  const [hover, setHover] = useState(false)
  const val    = shot.pipeline_stages?.[stage.name]
  const isDone = val === true || val === 1 || val === 100
  const color  = stage.color || '#10b981'
  return (
    <td
      style={{ width, minWidth: width, textAlign: 'center', verticalAlign: 'middle', padding: 0, background: isDone ? color + '18' : hover ? 'rgba(255,255,255,0.03)' : undefined, cursor: 'pointer', transition: 'background 0.15s' }}
      onClick={e => { e.stopPropagation(); onUpdate(shot.id, stage.name, !isDone) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: isDone ? color : 'transparent', border: `2px solid ${isDone ? color : hover ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)'}`, transition: 'all 0.15s', boxShadow: isDone ? `0 0 8px ${color}55` : 'none' }}>
        {isDone && <Check size={13} weight="bold" style={{ color: '#fff' }} />}
      </div>
    </td>
  )
}

// ── Pipeline Status Cell ──────────────────────────────────────────────
function PipelineStatusCell({ shot, stage, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const ref   = useRef()
  const opts  = Array.isArray(stage.status_options) ? stage.status_options : []
  const cur   = shot.pipeline_stages?.[stage.name] || null
  const curOpt = opts.find(o => o.label === cur) || null
  useClickOutside(ref, () => setOpen(false))
  async function pick(label) { await onUpdate(shot.id, stage.name, label); setOpen(false) }
  return (
    <td style={{ width, minWidth: width, padding: '0 6px', verticalAlign: 'middle', position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: curOpt ? curOpt.color + '22' : 'rgba(255,255,255,0.04)', border: `1px solid ${curOpt ? curOpt.color + '55' : 'rgba(255,255,255,0.1)'}`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer', color: curOpt ? curOpt.color : 'var(--t4)', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden' }}
      >
        {curOpt ? (<><span style={{ width: 8, height: 8, borderRadius: '50%', background: curOpt.color, flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{curOpt.label}</span></>) : (<span style={{ marginLeft: 4 }}>—</span>)}
      </button>
      {open && (
        <div ref={ref} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 6, zIndex: 300, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', overflow: 'hidden', padding: 4 }}>
          {opts.length === 0 && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--t4)' }}>No options configured</div>}
          {opts.map(opt => (
            <button key={opt.label} onClick={() => pick(opt.label)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: cur === opt.label ? opt.color + '18' : 'none', border: 'none', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', color: cur === opt.label ? opt.color : '#d0d0f0', fontSize: 13, textAlign: 'left' }}
              onMouseEnter={e => { if (cur !== opt.label) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (cur !== opt.label) e.currentTarget.style.background = 'none' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{opt.label}</span>
              {cur === opt.label && <Check size={12} style={{ color: opt.color, flexShrink: 0 }} />}
            </button>
          ))}
          {cur && (<><div style={{ height: 1, background: '#2e2e4a', margin: '4px 0' }} /><button onClick={() => pick(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}><XIcon size={11} /> Clear</button></>)}
        </div>
      )}
    </td>
  )
}

// ── Team Member Picker ────────────────────────────────────────────────
function TeamMemberPicker({ shot, stage, teamMembers, onAssign, onClose }) {
  const [search, setSearch] = useState('')
  const ref = useRef()
  useClickOutside(ref, onClose)
  const q        = search.toLowerCase()
  const filtered = teamMembers.filter(m => (m.full_name || '').toLowerCase().includes(q))
  const cur      = shot.pipeline_stages?.[stage.name] || null
  function initials(name) {
    if (!name) return '?'
    const p = name.trim().split(' ')
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }
  return (
    <div ref={ref} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10, minWidth: 220, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px 6px', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{stage.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 8px' }}>
        <MagnifyingGlass size={12} style={{ color: 'var(--t4)', flexShrink: 0 }} />
        <input autoFocus value={search} placeholder="Search team…" onChange={e => setSearch(e.target.value)} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#e8e8ff', fontSize: 13 }} />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0 4px 4px' }}>
        {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--t4)', textAlign: 'center' }}>{teamMembers.length === 0 ? 'No team members yet' : 'No results'}</div>}
        {filtered.map(m => {
          const active = cur === m.user_id
          return (
            <button key={m.user_id} onClick={() => { onAssign(m.user_id); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: active ? 'rgba(99,102,241,0.15)' : 'none', border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none' }}
            >
              {m.avatar_url
                ? <img src={m.avatar_url} alt={m.full_name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 28, height: 28, borderRadius: '50%', background: stage.color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600, flexShrink: 0 }}>{initials(m.full_name)}</div>
              }
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, color: active ? '#a5b4fc' : '#e8e8ff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name || 'Unnamed'}</div>
                {m.role && <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'capitalize' }}>{m.role}</div>}
              </div>
              {active && <Check size={13} style={{ color: '#6366f1', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>
      {cur && (<><div style={{ height: 1, background: '#2e2e4a', margin: '0 8px' }} /><button onClick={() => { onAssign(null); onClose() }} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', padding: '9px 14px', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }} onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}><XIcon size={11} /> Unassign</button></>)}
    </div>
  )
}

function TeamCell({ shot, stage, teamMembers, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const ref    = useRef()
  const userId = shot.pipeline_stages?.[stage.name] || null
  const member = teamMembers.find(m => m.user_id === userId)
  const color  = stage.color || '#6366f1'
  function initials(n) {
    if (!n) return '?'
    const p = n.trim().split(' ')
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : n.slice(0, 2).toUpperCase()
  }
  return (
    <td style={{ width, minWidth: width, padding: '0 8px', verticalAlign: 'middle', position: 'relative' }}>
      <button ref={ref} onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, width: '100%' }}>
        {member ? (<>
          {member.avatar_url
            ? <img src={member.avatar_url} alt={member.full_name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 26, height: 26, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600, flexShrink: 0 }}>{initials(member.full_name)}</div>
          }
          <span style={{ fontSize: 12, color: '#d0d0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name?.split(' ')[0] || 'Member'}</span>
        </>) : (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginLeft: 4 }}>—</span>
        )}
      </button>
      {open && <TeamMemberPicker shot={shot} stage={stage} teamMembers={teamMembers} onAssign={uid => onUpdate(shot.id, stage.name, uid)} onClose={() => setOpen(false)} />}
    </td>
  )
}

// ── List-specific: Shot title cell with inline edit ───────────────────
function ListShotTitleCell({ shot, linkedId, onNameSave, width }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(shot.title)
  useEffect(() => { setDraft(shot.title) }, [shot.title])
  async function commit() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== shot.title) await onNameSave(shot.id, draft.trim())
  }
  return (
    <td style={{ width, minWidth: width, padding: '0 14px', verticalAlign: 'middle', height: 52, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
        {shot.shot_number && (
          <span style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600, flexShrink: 0, fontFamily: 'monospace' }}>#{shot.shot_number}</span>
        )}
        {linkedId && !editing && <LinkIcon size={12} style={{ color: '#7c3aed', flexShrink: 0 }} />}
        {editing ? (
          <input
            autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(shot.title) } }}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid #6366f1', borderRadius: 5, color: '#e8e8ff', fontSize: 13, padding: '3px 8px', outline: 'none' }}
          />
        ) : (
          <span
            style={{ fontSize: 13, color: '#e8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
            onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
          >
            {shot.title}
          </span>
        )}
      </div>
    </td>
  )
}

// ── List-specific: Interactive status badge ───────────────────────────
function InteractiveStatusCell({ shot, statuses, onUpdate, width }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const cur = statuses.find(s => s.id === shot.status_id)
  useClickOutside(ref, () => setOpen(false))
  return (
    <td style={{ width, minWidth: width, padding: '0 6px', verticalAlign: 'middle', position: 'relative' }}>
      <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: cur ? cur.color + '22' : 'rgba(255,255,255,0.04)', border: `1px solid ${cur ? cur.color + '55' : 'rgba(255,255,255,0.1)'}`, borderRadius: 20, padding: '3px 10px', cursor: 'pointer', color: cur ? cur.color : 'var(--t4)', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          {cur && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cur.color, flexShrink: 0 }} />}
          {cur ? cur.name : '—'}
        </button>
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: 4 }}>
            <button onClick={e => { e.stopPropagation(); onUpdate(shot.id, null); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6b7280' }} /> No status
            </button>
            {statuses.map(s => (
              <button key={s.id} onClick={e => { e.stopPropagation(); onUpdate(shot.id, s.id); setOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: shot.status_id === s.id ? s.color + '18' : 'none', border: 'none', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', color: shot.status_id === s.id ? s.color : '#d0d0f0', fontSize: 12 }}
                onMouseEnter={e => { if (shot.status_id !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { if (shot.status_id !== s.id) e.currentTarget.style.background = 'none' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{s.name}</span>
                {shot.status_id === s.id && <Check size={11} style={{ color: s.color }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </td>
  )
}

// ── Cell dispatcher ───────────────────────────────────────────────────
function ListStageCell({ shot, stage, statuses, teamMembers, onCellUpdate, onStatusUpdate, onNameSave, linkedId, width }) {
  const bk = stage.builtin_key
  if (bk === 'shot')   return <ListShotTitleCell   shot={shot} linkedId={linkedId} onNameSave={onNameSave} width={width} />
  if (bk === 'status') return <InteractiveStatusCell shot={shot} statuses={statuses} onUpdate={onStatusUpdate} width={width} />
  const type = stage.cell_type || 'checkbox'
  if (type === 'team')       return <TeamCell            shot={shot} stage={stage} teamMembers={teamMembers} onUpdate={onCellUpdate} width={width} />
  if (type === 'percentage') return <PercentageCell      shot={shot} stage={stage} onUpdate={onCellUpdate} width={width} />
  if (type === 'status')     return <PipelineStatusCell  shot={shot} stage={stage} onUpdate={onCellUpdate} width={width} />
  return <CheckboxCell shot={shot} stage={stage} onUpdate={onCellUpdate} width={width} />
}

// ── Column aggregate stat ─────────────────────────────────────────────
function stageStat(stage, shots) {
  if (stage.builtin_key) return null
  const type = stage.cell_type || 'checkbox'
  const vals  = shots.map(s => s.pipeline_stages?.[stage.name])
  if (type === 'checkbox') {
    const done = vals.filter(v => v === true || v === 1 || v === 100).length
    return `${done}/${shots.length}`
  }
  if (type === 'percentage') {
    const sum = vals.reduce((a, v) => a + Number(v || 0), 0)
    return `${Math.round(sum / Math.max(shots.length, 1))}% avg`
  }
  return null
}

// ── Stage header ──────────────────────────────────────────────────────
function StageHeader({ stage, shots, widths, sort, onSort, onWidthChange, onWidthSave, onContextMenu, onRename }) {
  const [hoverResize, setHoverResize] = useState(false)
  const [renaming,    setRenaming]    = useState(false)
  const [draftName,   setDraftName]   = useState(stage.name)
  const startX     = useRef(null)
  const startWidth = useRef(null)
  const w     = widths[stage.id] || stage.width || 120
  const color = stage.color || '#6366f1'
  const stat  = stageStat(stage, shots)
  const isSort = sort?.stageId === stage.id

  function onResizeDown(e) {
    e.preventDefault(); e.stopPropagation()
    startX.current = e.clientX; startWidth.current = w
    function onMove(e2) {
      const next = Math.min(400, Math.max(80, startWidth.current + e2.clientX - startX.current))
      onWidthChange(stage.id, next)
    }
    function onUp(e2) {
      const next = Math.min(400, Math.max(80, startWidth.current + e2.clientX - startX.current))
      onWidthSave(stage.id, next)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function commitRename() {
    if (draftName.trim() && draftName.trim() !== stage.name) {
      await productionApi.updatePipelineStage(stage.id, { name: draftName.trim() })
      onRename(stage.id, draftName.trim())
    }
    setRenaming(false)
  }

  return (
    <th
      style={{ width: w, minWidth: w, maxWidth: w, position: 'relative', background: color + '14', padding: 0, userSelect: 'none', borderLeft: '1px solid rgba(255,255,255,0.05)', cursor: onSort ? 'pointer' : 'default' }}
      onClick={onSort ? () => onSort(stage.id) : undefined}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, stage, () => setRenaming(true)) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 6px', overflow: 'hidden' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {renaming ? (
          <input
            autoFocus value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: `1px solid ${color}`, borderRadius: 4, color: '#e8e8ff', fontSize: 11, padding: '2px 6px', outline: 'none' }}
          />
        ) : (
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#c8c8e8', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stage.name}
              {isSort && <span style={{ marginLeft: 4, color }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
            </div>
            {stat && <div style={{ fontSize: 10, color, marginTop: 1, fontWeight: 500 }}>{stat}</div>}
          </div>
        )}
      </div>
      <div
        onMouseDown={onResizeDown}
        onMouseEnter={() => setHoverResize(true)}
        onMouseLeave={() => setHoverResize(false)}
        style={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 10, background: hoverResize ? color + '99' : 'transparent', transition: 'background 0.15s' }}
      />
    </th>
  )
}

// ── Context Menu ──────────────────────────────────────────────────────
function ContextMenu({ x, y, stage, onHide, onRename, onDelete, onClose }) {
  const ref = useRef()
  useClickOutside(ref, onClose)
  const item = (label, onClick, danger) => (
    <button
      onClick={() => { onClick(); onClose() }}
      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: danger ? '#f87171' : '#d0d0f0', borderRadius: 6 }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{label}</button>
  )
  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 9999, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10, padding: 4, minWidth: 180, boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}>
      {item('✏️  Rename', onRename)}
      {item('👁  Hide Column', () => onHide(stage.id))}
      {!stage.builtin_key && (
        <>
          <div style={{ height: 1, background: '#2e2e4a', margin: '4px 0' }} />
          {item('🗑  Delete Column', () => onDelete(stage.id, stage.name), true)}
        </>
      )}
    </div>
  )
}

// ── Actions Menu ──────────────────────────────────────────────────────
function ActionsMenu({ shot, linkedId, onOpen, onLink, onEdit, onDelete, onClose }) {
  const ref = useRef()
  useClickOutside(ref, onClose)
  const item = (label, onClick, danger = false) => (
    <button
      onClick={e => { e.stopPropagation(); onClick(); onClose() }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: danger ? '#f87171' : '#d0d0f0', textAlign: 'left' }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{label}</button>
  )
  return (
    <div ref={ref} style={{ position: 'absolute', right: 0, top: 'calc(100% + 2px)', zIndex: 400, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}>
      {linkedId && item('▶  Open Video', onOpen)}
      {item('🔗  Link File', onLink)}
      {item('✏️  Edit Details', onEdit)}
      <div style={{ height: 1, background: '#2e2e4a', margin: '4px 0' }} />
      {item('🗑  Delete Shot', onDelete, true)}
    </div>
  )
}

// ── Main ShotListView ─────────────────────────────────────────────────
export default function ShotListView({
  projectId, statuses, scenes, stages: initialStages, shots, columns,
  teamMembers = [],
  onShotCreate, onShotUpdate, onShotDelete, onSceneCreate, onReload, onManageStages,
}) {
  const navigate      = useNavigate()
  const collapseKey   = `ets_list_collapse_${projectId}`

  const [localShots,   setLocalShots]   = useState(shots)
  const [mediaThumbs,  setMediaThumbs]  = useState({})
  const [stages,       setStages]       = useState(initialStages)
  const [widths,       setWidths]       = useState({})
  const [collapsed,    setCollapsed]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(collapseKey)) || {} } catch { return {} }
  })
  const [sort,         setSort]         = useState({ stageId: null, dir: 'asc' })
  const [ctxMenu,      setCtxMenu]      = useState(null)
  const [selectedShot, setSelectedShot] = useState(null)
  const [linkingShot,  setLinkingShot]  = useState(null)
  const [actionMenu,   setActionMenu]   = useState(null)
  const widthSaveTimer = useRef({})

  useEffect(() => { setLocalShots(shots) }, [shots])
  useEffect(() => { setStages(initialStages) }, [initialStages])

  // Load thumbnails (same method as ShotCardsView)
  useEffect(() => {
    projectMediaApi.list({ projectId })
      .then(d => {
        const map = {}
        for (const a of (d.assets || [])) { if (a.thumbnailUrl) map[a.id] = a.thumbnailUrl }
        setMediaThumbs(map)
      })
      .catch(() => {})
  }, [projectId])

  // ── Collapse ───────────────────────────────────────────────────────
  function toggleCollapse(id) {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(collapseKey, JSON.stringify(next))
      return next
    })
  }

  // ── Sort ───────────────────────────────────────────────────────────
  function handleSort(stageId) {
    setSort(prev => prev.stageId === stageId
      ? { stageId, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { stageId, dir: 'asc' }
    )
  }

  function sortShots(arr) {
    if (!sort.stageId) return arr
    const stage = stages.find(s => s.id === sort.stageId)
    if (!stage) return arr
    return [...arr].sort((a, b) => {
      let av, bv
      if (stage.builtin_key === 'shot') {
        av = (a.title || '').toLowerCase(); bv = (b.title || '').toLowerCase()
      } else if (stage.builtin_key === 'status') {
        av = statuses.findIndex(s => s.id === a.status_id); bv = statuses.findIndex(s => s.id === b.status_id)
        if (av < 0) av = 999; if (bv < 0) bv = 999
      } else {
        av = a.pipeline_stages?.[stage.name] ?? ''; bv = b.pipeline_stages?.[stage.name] ?? ''
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }

  // ── Width ──────────────────────────────────────────────────────────
  function handleWidthChange(stageId, w) { setWidths(prev => ({ ...prev, [stageId]: w })) }
  function handleWidthSave(stageId, w) {
    clearTimeout(widthSaveTimer.current[stageId])
    widthSaveTimer.current[stageId] = setTimeout(() => productionApi.updateStageWidth(stageId, w).catch(() => {}), 600)
  }

  // ── Stage ops ──────────────────────────────────────────────────────
  function handleRenameStage(stageId, name) { setStages(prev => prev.map(s => s.id === stageId ? { ...s, name } : s)) }
  async function handleHideStage(stageId)   { await productionApi.hideStage(stageId).catch(() => {}); setStages(prev => prev.filter(s => s.id !== stageId)) }
  async function handleDeleteStage(stageId, stageName) {
    if (!window.confirm(`Delete "${stageName}" permanently? All progress data will be lost.`)) return
    await productionApi.deletePipelineStage(stageId).catch(() => {})
    setStages(prev => prev.filter(s => s.id !== stageId))
  }

  // ── Cell updates ───────────────────────────────────────────────────
  async function handleCellUpdate(shotId, stageName, value) {
    setLocalShots(prev => prev.map(s =>
      s.id === shotId ? { ...s, pipeline_stages: { ...(s.pipeline_stages || {}), [stageName]: value } } : s
    ))
    try { await productionApi.updateShotPipeline(shotId, stageName, value) }
    catch { await onReload() }
  }

  async function handleStatusUpdate(shotId, statusId) {
    setLocalShots(prev => prev.map(s => s.id === shotId ? { ...s, status_id: statusId } : s))
    try { await onShotUpdate(shotId, { status_id: statusId }) }
    catch { setLocalShots(shots) }
  }

  async function handleNameSave(shotId, title) {
    setLocalShots(prev => prev.map(s => s.id === shotId ? { ...s, title } : s))
    try { await onShotUpdate(shotId, { title }) }
    catch { setLocalShots(shots) }
  }

  async function handleDelete(shot) {
    if (!window.confirm(`Delete shot "${shot.title}"?`)) return
    setLocalShots(prev => prev.filter(s => s.id !== shot.id))
    try { await onShotDelete(shot.id) }
    catch { setLocalShots(shots) }
  }

  function handleMediaLinked(data) {
    setLocalShots(prev => prev.map(s =>
      s.id === data.shotId
        ? { ...s, thumbnail_media_id: data.mediaId, linked_media_id: data.mediaId, linked_media_name: data.mediaName }
        : s
    ))
  }

  // ── Groups ─────────────────────────────────────────────────────────
  const groups = [
    ...scenes.map((scene, idx) => ({
      scene, color: SCENE_COLORS[idx % SCENE_COLORS.length],
      shots: localShots.filter(s => s.scene_id === scene.id),
    })),
  ]
  const ungrouped = localShots.filter(s => !s.scene_id)
  if (ungrouped.length > 0) groups.push({ scene: null, color: 'var(--t4)', shots: ungrouped })

  const colCount = 1 + stages.length + 1 + 1 // thumb + stages + add-btn + actions

  return (
    <>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} stage={ctxMenu.stage}
          onHide={handleHideStage}
          onRename={ctxMenu.onRename}
          onDelete={handleDeleteStage}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>

          {/* Sticky header */}
          <thead>
            <tr style={{ background: '#0d0d15', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Thumbnail col — no label */}
              <th style={{ width: THUMB_W, minWidth: THUMB_W, maxWidth: THUMB_W }} />

              {/* Stage columns */}
              {stages.map(s => (
                <StageHeader
                  key={s.id}
                  stage={s}
                  shots={localShots}
                  widths={widths}
                  sort={sort}
                  onSort={handleSort}
                  onWidthChange={handleWidthChange}
                  onWidthSave={handleWidthSave}
                  onContextMenu={(e, stage, openRename) => setCtxMenu({ x: e.clientX, y: e.clientY, stage, onRename: openRename })}
                  onRename={handleRenameStage}
                />
              ))}

              {/* Add column ghost */}
              <th style={{ width: 40, padding: 0 }}>
                <button
                  onClick={onManageStages}
                  title="Manage columns"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, margin: '0 auto', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, cursor: 'pointer', color: 'var(--t4)' }}
                >
                  <Plus size={13} />
                </button>
              </th>

              {/* Actions */}
              <th style={{ width: 48, minWidth: 48 }} />
            </tr>
          </thead>

          <tbody>
            {groups.map(({ scene, color, shots: groupShots }) => {
              const groupId     = scene?.id || '__ungrouped__'
              const isCollapsed = !!collapsed[groupId]
              const sorted      = sortShots(groupShots)
              const pct         = groupCompletion(groupShots, stages)

              return (
                <React.Fragment key={groupId}>
                  {/* Scene group row */}
                  <tr
                    onClick={() => toggleCollapse(groupId)}
                    style={{ height: 40, cursor: 'pointer', background: 'rgba(255,255,255,0.025)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                  >
                    <td colSpan={colCount} style={{ padding: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 40 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--t4)', display: 'flex', flexShrink: 0 }}>
                            {isCollapsed ? <CaretRight size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
                          </span>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ff', userSelect: 'none' }}>
                            {scene ? scene.name : 'Ungrouped'}
                          </span>
                          <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '2px 8px', fontSize: 11, color: 'var(--t4)' }}>
                            {groupShots.length} shot{groupShots.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
                          {pct !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: completionColor(pct) }}>{pct}%</span>
                              <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: completionColor(pct), borderRadius: 2, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          )}
                          {scene && (
                            <button
                              onClick={() => onShotCreate({ title: 'New Shot', scene_id: scene.id, position: groupShots.length })}
                              style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 12, cursor: 'pointer', padding: '2px 6px', borderRadius: 5 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                              + Add Shot
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Shot rows */}
                  {!isCollapsed && sorted.map((shot, rowIdx) => {
                    const thumbUrl = mediaThumbs[shot.thumbnail_media_id] || null
                    const linkedId = shot.linked_media_id || shot.thumbnail_media_id

                    return (
                      <tr
                        key={shot.id}
                        onClick={() => setSelectedShot(shot)}
                        style={{ height: 52, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowIdx % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent', transition: 'background 150ms' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                          const btn = e.currentTarget.querySelector('.shot-action-btn')
                          if (btn) btn.style.opacity = '1'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = rowIdx % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent'
                          const btn = e.currentTarget.querySelector('.shot-action-btn')
                          if (btn) btn.style.opacity = '0'
                        }}
                      >
                        {/* Thumbnail */}
                        <td
                          style={{ width: THUMB_W, minWidth: THUMB_W, padding: '6px 8px', verticalAlign: 'middle' }}
                          onClick={e => { if (linkedId) { e.stopPropagation(); navigate(`/projects/${projectId}/media/${linkedId}`, { state: { from: 'manage' } }) } }}
                        >
                          <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', cursor: linkedId ? 'pointer' : 'default', flexShrink: 0 }}>
                            {thumbUrl
                              ? <img src={thumbUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                              : <div style={{ width: 44, height: 44, background: '#1a1a24', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <FilmSlate size={18} weight="duotone" style={{ color: '#404050' }} />
                                </div>
                            }
                          </div>
                        </td>

                        {/* Stage cells */}
                        {stages.map(stage => (
                          <ListStageCell
                            key={stage.id}
                            shot={shot}
                            stage={stage}
                            statuses={statuses}
                            teamMembers={teamMembers}
                            onCellUpdate={handleCellUpdate}
                            onStatusUpdate={handleStatusUpdate}
                            onNameSave={handleNameSave}
                            linkedId={linkedId}
                            width={widths[stage.id] || stage.width || 120}
                          />
                        ))}

                        {/* Add col ghost */}
                        <td style={{ width: 40 }} />

                        {/* Actions */}
                        <td
                          style={{ width: 48, minWidth: 48, padding: '0 4px', verticalAlign: 'middle', position: 'relative' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                            <button
                              className="shot-action-btn"
                              onClick={e => { e.stopPropagation(); setActionMenu(actionMenu === shot.id ? null : shot.id) }}
                              style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4, borderRadius: 5, display: 'flex', opacity: 0, transition: 'opacity 0.15s' }}
                            >
                              <DotsThree size={16} weight="bold" />
                            </button>
                            {actionMenu === shot.id && (
                              <ActionsMenu
                                shot={shot}
                                linkedId={linkedId}
                                onOpen={() => navigate(`/projects/${projectId}/media/${linkedId}`, { state: { from: 'manage' } })}
                                onLink={() => { setLinkingShot(shot); setActionMenu(null) }}
                                onEdit={() => { setSelectedShot(shot); setActionMenu(null) }}
                                onDelete={() => handleDelete(shot)}
                                onClose={() => setActionMenu(null)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add scene */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={() => { const name = window.prompt('Scene name:'); if (name?.trim()) onSceneCreate(name.trim()) }}
          style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 7, color: 'var(--t4)', fontSize: 12, padding: '6px 14px', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#a5b4fc' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'var(--t4)' }}
        >
          + Add Scene
        </button>
      </div>

      {selectedShot && (
        <ShotDetailPanel
          shotId={selectedShot.id} statuses={statuses} scenes={scenes}
          onClose={() => setSelectedShot(null)}
          onUpdate={u => { onShotUpdate(u.id, u); setSelectedShot(u) }}
          onDelete={id => { onShotDelete(id); setSelectedShot(null) }}
        />
      )}

      {linkingShot && (
        <MediaBrowserModal
          projectId={projectId}
          shotId={linkingShot.id}
          shotName={linkingShot.title}
          currentLinkedMediaId={linkingShot.linked_media_id || linkingShot.thumbnail_media_id || null}
          onLinked={handleMediaLinked}
          onClose={() => setLinkingShot(null)}
        />
      )}
    </>
  )
}
