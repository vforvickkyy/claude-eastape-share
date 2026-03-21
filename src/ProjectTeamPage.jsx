import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  UserPlus, Trash, Users, Crown, EnvelopeSimple,
  PencilSimple, Check, X, UserCirclePlus, SpinnerGap,
  IdentificationCard,
} from '@phosphor-icons/react'
import { useProject } from './context/ProjectContext'
import { membersApi } from './lib/api'

const ROLES = ['viewer', 'reviewer', 'editor', 'admin']

const ROLE_META = {
  owner:    { label: 'Owner',    bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)'  },
  admin:    { label: 'Admin',    bg: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  editor:   { label: 'Editor',   bg: 'rgba(99,102,241,0.15)', color: '#818cf8', border: 'rgba(99,102,241,0.3)' },
  reviewer: { label: 'Reviewer', bg: 'rgba(6,182,212,0.15)',  color: '#22d3ee', border: 'rgba(6,182,212,0.3)'  },
  viewer:   { label: 'Viewer',   bg: 'rgba(100,116,139,0.15)',color: '#94a3b8', border: 'rgba(100,116,139,0.3)' },
}

function RoleBadge({ role }) {
  const m = ROLE_META[role] || ROLE_META.viewer
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: m.bg, color: m.color, border: `1px solid ${m.border}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {role === 'owner' && <Crown size={10} weight="fill" />}
      {m.label}
    </span>
  )
}

function Avatar({ member, size = 40 }) {
  const profile  = member.profiles || {}
  const name     = member.display_name || profile.full_name || member.invited_email || 'Unknown'
  const initial  = name.charAt(0).toUpperCase()
  const colors   = ['#6366f1','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6']
  const bg       = colors[(name.charCodeAt(0) || 0) % colors.length]

  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.08)' }}>
      {profile.avatar_url
        ? <img src={profile.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff' }}>{initial}</div>
      }
    </div>
  )
}

// ── Inline role editor for a member ──────────────────────────────────
function RoleSelect({ member, onUpdate }) {
  const [val, setVal] = useState(member.role)

  async function change(newRole) {
    setVal(newRole)
    await onUpdate(member.id, { role: newRole })
  }

  if (member.role === 'owner') return <RoleBadge role="owner" />

  return (
    <select
      value={val}
      onChange={e => change(e.target.value)}
      style={{
        background: ROLE_META[val]?.bg || 'rgba(100,116,139,0.15)',
        color: ROLE_META[val]?.color || '#94a3b8',
        border: `1px solid ${ROLE_META[val]?.border || 'rgba(100,116,139,0.3)'}`,
        borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
        cursor: 'pointer', outline: 'none', appearance: 'none',
      }}
    >
      {ROLES.map(r => <option key={r} value={r} style={{ background: '#1a1a2e', color: '#e8e8ff' }}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
    </select>
  )
}

// ── Add manually modal ────────────────────────────────────────────────
function AddManualModal({ onAdd, onClose }) {
  const [name,     setName]     = useState('')
  const [position, setPosition] = useState('')
  const [email,    setEmail]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      await onAdd({ display_name: name.trim(), position: position.trim(), email: email.trim(), is_manual: true })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add member')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f0f1a', border: '1px solid #2a2a3a', borderRadius: 16, width: 440, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #1e1e2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCirclePlus size={16} style={{ color: '#818cf8' }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8ff' }}>Add Team Member</div>
              <div style={{ fontSize: 11, color: 'var(--t4)' }}>Not a platform user — tracked manually</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>Name *</label>
            <input
              autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex Johnson"
              style={{ width: '100%', background: '#16162a', border: '1px solid #2a2a3a', borderRadius: 8, color: '#e8e8ff', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#2a2a3a'}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>Position / Role</label>
            <input
              value={position} onChange={e => setPosition(e.target.value)}
              placeholder="e.g. Compositor, VFX Artist"
              style={{ width: '100%', background: '#16162a', border: '1px solid #2a2a3a', borderRadius: 8, color: '#e8e8ff', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#2a2a3a'}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>Email <span style={{ color: 'var(--t4)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="e.g. alex@studio.com"
              style={{ width: '100%', background: '#16162a', border: '1px solid #2a2a3a', borderRadius: 8, color: '#e8e8ff', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#2a2a3a'}
            />
          </div>

          {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 14, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--t3)', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} style={{ background: saving || !name.trim() ? 'rgba(99,102,241,0.4)' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: saving || !name.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <SpinnerGap size={13} className="spin" /> : <Check size={13} weight="bold" />}
              {saving ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Member card ───────────────────────────────────────────────────────
function MemberCard({ member, isOwner, onUpdate, onRemove }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const profile  = member.profiles || {}
  const name     = member.display_name || profile.full_name || member.invited_email || 'Unknown'
  const email    = member.invited_email || profile.email || ''
  const isPending = !member.accepted && !member.is_manual
  const isManual  = !!member.is_manual

  return (
    <div style={{
      background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 12,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#2a2a3a'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#1e1e2e'}
    >
      <Avatar member={member} size={44} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          {isPending && (
            <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '1px 7px', fontWeight: 600, flexShrink: 0 }}>Pending</span>
          )}
          {isManual && (
            <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: 10, padding: '1px 7px', fontWeight: 600, flexShrink: 0 }}>Manual</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          {member.position && (
            <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 500 }}>{member.position}</span>
          )}
          {email && (
            <span style={{ fontSize: 11, color: 'var(--t4)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <EnvelopeSimple size={11} /> {email}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isOwner
          ? <RoleSelect member={member} onUpdate={onUpdate} />
          : <RoleBadge role={member.role} />
        }

        {isOwner && member.role !== 'owner' && (
          confirmDel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '4px 8px' }}>
              <span style={{ fontSize: 11, color: '#f87171', whiteSpace: 'nowrap' }}>Remove?</span>
              <button onClick={() => onRemove(member.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Yes</button>
              <button onClick={() => setConfirmDel(false)} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: '2px 4px', fontSize: 11 }}>No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              title="Remove member"
              style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 5, display: 'flex', borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}
            >
              <Trash size={14} />
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function ProjectTeamPage() {
  const { id: projectId } = useParams()
  const { isOwner }       = useProject()

  const [members,     setMembers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState('viewer')
  const [inviting,    setInviting]    = useState(false)
  const [inviteErr,   setInviteErr]   = useState('')
  const [showManual,  setShowManual]  = useState(false)

  const load = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    membersApi.list(projectId)
      .then(d => setMembers(d.members || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviteErr(''); setInviting(true)
    try {
      await membersApi.invite({ project_id: projectId, email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail(''); setInviteRole('viewer')
      load()
    } catch (err) {
      setInviteErr(err.message || 'Failed to invite')
    } finally { setInviting(false) }
  }

  async function handleManualAdd(body) {
    await membersApi.invite({ project_id: projectId, ...body })
    load()
  }

  async function handleUpdate(id, body) {
    await membersApi.update(id, body).catch(() => {})
    setMembers(ms => ms.map(m => m.id === id ? { ...m, ...body } : m))
  }

  async function handleRemove(id) {
    await membersApi.remove(id).catch(() => {})
    setMembers(ms => ms.filter(m => m.id !== id))
  }

  const realMembers   = members.filter(m => !m.is_manual)
  const manualMembers = members.filter(m => m.is_manual)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#e8e8ff' }}>Team</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t4)' }}>
            {members.length} member{members.length !== 1 ? 's' : ''} on this project
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowManual(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
          >
            <UserCirclePlus size={15} /> Add Manually
          </button>
        )}
      </div>

      {/* Invite form */}
      {isOwner && (
        <div style={{ background: '#13131f', border: '1px solid #1e1e2e', borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserPlus size={13} /> Invite by Email
          </div>
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              placeholder="teammate@email.com"
              style={{ flex: 1, minWidth: 200, background: '#0d0d18', border: '1px solid #2a2a3a', borderRadius: 8, color: '#e8e8ff', fontSize: 13, padding: '8px 12px', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#2a2a3a'}
              required
            />
            <select
              value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              style={{ background: '#0d0d18', border: '1px solid #2a2a3a', borderRadius: 8, color: '#e8e8ff', fontSize: 13, padding: '8px 12px', cursor: 'pointer', outline: 'none' }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <button
              type="submit" disabled={inviting || !inviteEmail.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: inviting ? 'rgba(99,102,241,0.5)' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: inviting ? 'default' : 'pointer' }}
            >
              {inviting ? <SpinnerGap size={13} className="spin" /> : <UserPlus size={13} weight="bold" />}
              {inviting ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
          {inviteErr && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#f87171', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
              {inviteErr}
            </div>
          )}
        </div>
      )}

      {/* Members list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <SpinnerGap size={28} className="spin" style={{ color: '#6366f1' }} />
        </div>
      ) : (
        <>
          {/* App users / invited */}
          {realMembers.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>
                Members · {realMembers.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {realMembers.map(m => (
                  <MemberCard key={m.id} member={m} isOwner={isOwner} onUpdate={handleUpdate} onRemove={handleRemove} />
                ))}
              </div>
            </div>
          )}

          {/* Manual members */}
          {manualMembers.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>
                Manual / External · {manualMembers.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {manualMembers.map(m => (
                  <MemberCard key={m.id} member={m} isOwner={isOwner} onUpdate={handleUpdate} onRemove={handleRemove} />
                ))}
              </div>
            </div>
          )}

          {members.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 0', color: 'var(--t4)', textAlign: 'center' }}>
              <Users size={48} weight="duotone" style={{ opacity: 0.15, marginBottom: 14 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>No team members yet</div>
              <div style={{ fontSize: 13 }}>Invite teammates by email or add them manually.</div>
            </div>
          )}
        </>
      )}

      {/* Manual add modal */}
      {showManual && (
        <AddManualModal
          onAdd={handleManualAdd}
          onClose={() => setShowManual(false)}
        />
      )}
    </div>
  )
}
