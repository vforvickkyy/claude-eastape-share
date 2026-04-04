/**
 * DriveShareModal — create and manage share links for a drive file or folder.
 * Props:
 *   target: { id, name, type: 'file'|'folder' }
 *   onClose: () => void
 */
import React, { useEffect, useState } from 'react'
import {
  X, Link, Copy, CheckCircle, Trash, Lock, Globe, Users,
  UserCircleDashed, Eye, DownloadSimple, CalendarBlank,
} from '@phosphor-icons/react'
import { shareLinksApi } from '../../lib/api'

const SITE = window.location.origin

const ACCESS_OPTIONS = [
  { value: 'anyone',        icon: <Globe size={14} />,               label: 'Anyone with the link' },
  { value: 'authenticated', icon: <UserCircleDashed size={14} />,   label: 'Signed-in users only' },
]

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(iso) {
  if (!iso) return null
  const d = Date.now() - new Date(iso)
  const m = Math.round(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export default function DriveShareModal({ target, onClose }) {
  const [links,        setLinks]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [copied,       setCopied]       = useState(null) // link id

  // Form state
  const [accessType,   setAccessType]   = useState('anyone')
  const [allowDl,      setAllowDl]      = useState(true)
  const [password,     setPassword]     = useState('')
  const [expiresAt,    setExpiresAt]    = useState('')
  const [showPwField,  setShowPwField]  = useState(false)
  const [showExpField, setShowExpField] = useState(false)

  const isFolder = target.type === 'folder'

  useEffect(() => {
    if (isFolder) {
      shareLinksApi.listForDriveFolder(target.id)
        .then(d => setLinks(d.links || []))
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      shareLinksApi.listForDriveFile(target.id)
        .then(d => setLinks(d.links || []))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [target.id, isFolder])

  async function createLink() {
    setCreating(true)
    try {
      const opts = {
        allow_download: allowDl,
        access_type:    accessType,
        password:       showPwField && password ? password : null,
        expires_at:     showExpField && expiresAt ? new Date(expiresAt).toISOString() : null,
        file_name:      target.name,
      }
      const data = isFolder
        ? await shareLinksApi.createForDriveFolder(target.id, opts)
        : await shareLinksApi.createForDriveFile(target.id, opts)
      setLinks(prev => [data.link, ...prev])
    } catch (err) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function revokeLink(id) {
    await shareLinksApi.delete(id).catch(() => {})
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  function copyLink(link) {
    const url = `${SITE}/share/${link.token}`
    navigator.clipboard.writeText(url).catch(() => {})
    setCopied(link.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal" onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '96vw' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link size={16} style={{ color: 'var(--purple-l)' }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Share "{target.name}"</h3>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          {/* Create new link */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New link</p>

            {/* Access type */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--t3)', display: 'block', marginBottom: 6 }}>Who can access</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {ACCESS_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    className={`btn-ghost ${accessType === o.value ? 'active' : ''}`}
                    style={{ fontSize: 12, flex: 1, justifyContent: 'center', ...(accessType === o.value ? { background: 'rgba(124,58,237,0.15)', borderColor: 'var(--purple)', color: 'var(--purple-l)' } : {}) }}
                    onClick={() => setAccessType(o.value)}
                  >
                    {o.icon} {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Options row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={allowDl} onChange={e => setAllowDl(e.target.checked)} style={{ accentColor: 'var(--purple)' }} />
                <DownloadSimple size={13} /> Allow download
              </label>
              <button
                className="btn-ghost"
                style={{ fontSize: 12, ...(showPwField ? { color: 'var(--purple-l)', borderColor: 'var(--purple)' } : {}) }}
                onClick={() => setShowPwField(p => !p)}
              >
                <Lock size={13} /> Password
              </button>
              <button
                className="btn-ghost"
                style={{ fontSize: 12, ...(showExpField ? { color: 'var(--purple-l)', borderColor: 'var(--purple)' } : {}) }}
                onClick={() => setShowExpField(p => !p)}
              >
                <CalendarBlank size={13} /> Expiry
              </button>
            </div>

            {showPwField && (
              <input
                className="input-base"
                type="text"
                placeholder="Link password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ marginBottom: 8 }}
              />
            )}
            {showExpField && (
              <input
                className="input-base"
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={{ marginBottom: 8 }}
              />
            )}

            <button
              className="btn-primary-sm"
              onClick={createLink}
              disabled={creating}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {creating ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Generating…</> : <><Link size={13} /> Generate link</>}
            </button>
          </div>

          {/* Existing links */}
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active links {links.length > 0 && <span style={{ color: 'var(--t3)', fontWeight: 400 }}>({links.length})</span>}
          </p>

          {loading ? (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><span className="spinner" /></div>
          ) : links.length === 0 ? (
            <p style={{ color: 'var(--t3)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>No active links</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {links.map(link => {
                const expired = link.expires_at && new Date(link.expires_at) < new Date()
                const shareUrl = `${SITE}/share/${link.token}`
                return (
                  <div
                    key={link.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '10px 12px',
                      opacity: expired ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Globe size={12} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--t1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shareUrl}
                      </span>
                      <button className="btn-ghost" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => copyLink(link)}>
                        {copied === link.id ? <CheckCircle size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                        {copied === link.id ? 'Copied!' : 'Copy'}
                      </button>
                      <button className="icon-btn" onClick={() => revokeLink(link.id)} title="Revoke link" style={{ color: '#f87171' }}>
                        <Trash size={13} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {link.allow_download && (
                        <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <DownloadSimple size={10} /> Downloads on
                        </span>
                      )}
                      {link.password && (
                        <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Lock size={10} /> Password protected
                        </span>
                      )}
                      {link.view_count > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Eye size={10} /> {link.view_count} view{link.view_count !== 1 ? 's' : ''}
                          {link.last_accessed_at && ` · ${timeAgo(link.last_accessed_at)}`}
                        </span>
                      )}
                      {link.expires_at && (
                        <span style={{ fontSize: 10, color: expired ? '#f87171' : 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CalendarBlank size={10} /> {expired ? 'Expired' : 'Expires'} {formatDate(link.expires_at)}
                        </span>
                      )}
                      {link.access_type && link.access_type !== 'anyone' && (
                        <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Users size={10} /> {link.access_type === 'authenticated' ? 'Signed-in only' : link.access_type}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
