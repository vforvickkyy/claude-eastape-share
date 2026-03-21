import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Plus, Trash, ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { projectsApi, productionApi, membersApi } from '../lib/api'

const COLOR_OPTS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']

const PRESETS = [
  {
    id: 'vfx',
    label: 'VFX Production',
    emoji: '✨',
    desc: 'Complex visual effects pipeline with review rounds',
    color: '#6366f1',
    statuses: ['Not Started','In Progress','VFX Review','Revision','Approved'],
    statusColors: ['#64748b','#3b82f6','#a855f7','#f59e0b','#10b981'],
    stages: ['Pre-Viz','Asset Build','Comp','Render','Delivery'],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    emoji: '📺',
    desc: 'Full commercial production from shoot to delivery',
    color: '#ec4899',
    statuses: ['Not Started','In Progress','Client Review','Revision','Approved','Delivered'],
    statusColors: ['#64748b','#3b82f6','#a855f7','#f59e0b','#10b981','#6366f1'],
    stages: ['Pre-Production','Shoot','Offline Edit','Online','Color','Delivery'],
  },
  {
    id: 'wedding',
    label: 'Wedding Film',
    emoji: '💍',
    desc: 'Wedding video workflow from ceremony to final film',
    color: '#f59e0b',
    statuses: ['Not Started','Filming','Rough Cut','Review','Revision','Delivered'],
    statusColors: ['#64748b','#3b82f6','#f59e0b','#a855f7','#ef4444','#10b981'],
    stages: ['Ceremony','Reception','Edit','Color Grade','Review','Export'],
  },
  {
    id: 'social',
    label: 'Social Content',
    emoji: '📱',
    desc: 'Fast-paced content for Instagram, TikTok & YouTube',
    color: '#10b981',
    statuses: ['Draft','Editing','Ready','Posted','Archived','Revision'],
    statusColors: ['#64748b','#3b82f6','#10b981','#a855f7','#94a3b8','#f59e0b'],
    stages: ['Script','Shoot','Edit','Thumbnail','Schedule','Published'],
  },
  {
    id: 'music',
    label: 'Music Video',
    emoji: '🎵',
    desc: 'Music video production from concept to release',
    color: '#8b5cf6',
    statuses: ['Not Started','Filming','Rough Cut','Color','Mix','Delivered'],
    statusColors: ['#64748b','#3b82f6','#f59e0b','#a855f7','#ec4899','#10b981'],
    stages: ['Concept','Shoot','Rough Cut','Color Grade','Final Mix','Delivery'],
  },
  {
    id: 'blank',
    label: 'Blank',
    emoji: '⬜',
    desc: 'Start from scratch with minimal setup',
    color: '#475569',
    statuses: ['To Do','In Progress','Done'],
    statusColors: ['#64748b','#3b82f6','#10b981'],
    stages: [],
  },
]

const ROLES = ['viewer','reviewer','editor','admin']

const slideVariants = {
  enter: dir => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  dir => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
}

export default function NewProjectModal({ onClose }) {
  const navigate = useNavigate()
  const [step, setStep]         = useState(0)
  const [dir,  setDir]          = useState(1)

  // Step 1
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [clientName,  setClientName]  = useState('')
  const [dueDate,     setDueDate]     = useState('')
  const [color,       setColor]       = useState(COLOR_OPTS[0])

  // Step 2
  const [preset, setPreset] = useState(null)

  // Step 3
  const [invites,     setInvites]     = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState('editor')

  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState(null)

  function go(next) {
    setDir(next > step ? 1 : -1)
    setStep(next)
  }

  function addInvite() {
    const e = inviteEmail.trim()
    if (!e || invites.find(i => i.email === e)) return
    setInvites(prev => [...prev, { email: e, role: inviteRole }])
    setInviteEmail('')
    setInviteRole('editor')
  }

  function removeInvite(email) {
    setInvites(prev => prev.filter(i => i.email !== email))
  }

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const selected = preset || PRESETS.find(p => p.id === 'blank')
      const d = await projectsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        client_name: clientName.trim() || undefined,
        due_date: dueDate || undefined,
        preset_type: selected.id,
      })
      const projectId = d.project.id

      // Seed production data
      await productionApi.seed(projectId, selected.id).catch(() => {})

      // Send invites
      await Promise.all(invites.map(inv =>
        membersApi.invite({ project_id: projectId, email: inv.email, role: inv.role }).catch(() => {})
      ))

      onClose()
      navigate(`/projects/${projectId}`)
    } catch (err) {
      setError(err?.message || 'Failed to create project')
      setCreating(false)
    }
  }

  const selectedPreset = preset || PRESETS[5] // blank default preview

  const canNext0 = name.trim().length > 0
  const canNext1 = true // preset optional, defaults to blank

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-box"
        style={{ maxWidth: 700, width: '95vw', padding: 0, overflow: 'hidden' }}
        initial={{ scale: 0.93, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New Project</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--t3)' }}>
              {step === 0 ? 'Project details' : step === 1 ? 'Choose a preset' : 'Invite teammates'}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '16px 24px 0' }}>
          {[0,1,2].map(s => (
            <React.Fragment key={s}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
                background: step > s ? 'var(--accent)' : step === s ? 'var(--accent)' : 'var(--bg3)',
                color: step >= s ? '#fff' : 'var(--t3)',
                transition: 'all 0.25s',
              }}>
                {step > s ? <Check size={12} weight="bold" /> : s + 1}
              </div>
              {s < 2 && (
                <div style={{
                  flex: 1, height: 2, background: step > s ? 'var(--accent)' : 'var(--bg3)',
                  transition: 'background 0.3s', margin: '0 6px',
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div style={{ position: 'relative', overflow: 'hidden', minHeight: 320 }}>
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              style={{ padding: '20px 24px' }}
            >
              {/* ── STEP 0: Details ── */}
              {step === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6, display: 'block' }}>Project Name *</label>
                    <input
                      className="input-field"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Brand Campaign 2025"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter' && canNext0) go(1) }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6, display: 'block' }}>Description</label>
                    <textarea
                      className="input-field"
                      rows={2}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Brief project description…"
                      style={{ resize: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6, display: 'block' }}>Client Name</label>
                      <input
                        className="input-field"
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6, display: 'block' }}>Due Date</label>
                      <input
                        className="input-field input-date"
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8, display: 'block' }}>Color</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {COLOR_OPTS.map(c => (
                        <button
                          key={c} type="button"
                          onClick={() => setColor(c)}
                          style={{
                            width: 28, height: 28, borderRadius: '50%', background: c, border: 'none',
                            cursor: 'pointer', outline: color === c ? `3px solid ${c}` : '3px solid transparent',
                            outlineOffset: 2, transition: 'outline 0.15s',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 1: Preset ── */}
              {step === 1 && (
                <div style={{ display: 'flex', gap: 16 }}>
                  {/* Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: '0 0 380px' }}>
                    {PRESETS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPreset(p)}
                        style={{
                          background: preset?.id === p.id ? 'var(--bg3)' : 'var(--bg2)',
                          border: `2px solid ${preset?.id === p.id ? p.color : 'var(--border)'}`,
                          borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                          transition: 'all 0.15s', position: 'relative',
                        }}
                      >
                        {preset?.id === p.id && (
                          <div style={{
                            position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%',
                            background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Check size={9} weight="bold" color="#fff" />
                          </div>
                        )}
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{p.emoji}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{p.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, lineHeight: 1.4 }}>{p.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Preview panel */}
                  <div style={{
                    flex: 1, background: 'var(--bg2)', borderRadius: 10, padding: 14,
                    border: '1px solid var(--border)', minWidth: 0,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{selectedPreset.emoji}</span>
                      <span>{selectedPreset.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>{selectedPreset.desc}</div>

                    {selectedPreset.statuses.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>STATUSES</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                          {selectedPreset.statuses.map((s, i) => (
                            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: selectedPreset.statusColors[i], flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: 'var(--t2)' }}>{s}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {selectedPreset.stages.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>PIPELINE STAGES</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {selectedPreset.stages.map(s => (
                            <span key={s} style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 99,
                              background: 'var(--bg3)', color: 'var(--t2)',
                            }}>{s}</span>
                          ))}
                        </div>
                      </>
                    )}

                    {selectedPreset.stages.length === 0 && selectedPreset.id === 'blank' && (
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                        Minimal setup — add your own statuses and pipeline stages.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP 2: Invite ── */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)' }}>
                    Invite teammates to collaborate. You can always do this later from project settings.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input-field"
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="teammate@email.com"
                      onKeyDown={e => { if (e.key === 'Enter') addInvite() }}
                      style={{ flex: 1 }}
                    />
                    <select
                      className="input-field"
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      style={{ width: 110 }}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={addInvite}
                      disabled={!inviteEmail.trim()}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>

                  {invites.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t3)', fontSize: 13 }}>
                      No teammates added yet — this step is optional.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {invites.map(inv => (
                        <div key={inv.email} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px',
                          border: '1px solid var(--border)',
                        }}>
                          <div>
                            <span style={{ fontSize: 13, color: 'var(--t1)' }}>{inv.email}</span>
                            <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 8, textTransform: 'capitalize' }}>{inv.role}</span>
                          </div>
                          <button className="icon-btn" onClick={() => removeInvite(inv.email)} style={{ opacity: 0.6 }}>
                            <Trash size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px', borderTop: '1px solid var(--border)',
        }}>
          <button
            className="btn-ghost"
            onClick={() => step > 0 ? go(step - 1) : onClose()}
          >
            {step > 0 ? <><ArrowLeft size={14} /> Back</> : 'Cancel'}
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {step < 2 && (
              <button
                className="btn-ghost"
                style={{ fontSize: 12, color: 'var(--t3)' }}
                onClick={() => go(step + 1)}
              >
                Skip
              </button>
            )}
            {step < 2 ? (
              <button
                className="btn-primary"
                onClick={() => go(step + 1)}
                disabled={step === 0 && !canNext0}
              >
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !name.trim()}
              >
                {creating ? 'Creating…' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
