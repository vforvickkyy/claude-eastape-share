/**
 * ShareModal — Google Drive-style share dialog for drive files and folders.
 * Props:
 *   item: { id, name, type: 'file' | 'folder' }
 *   onClose: () => void
 */
import React, { useState, useEffect } from 'react'
import { X, Link, Check, Eye, DownloadSimple, Lock, ClockCountdown, Copy } from '@phosphor-icons/react'
import { shareLinksApi } from '../../lib/api'
import { showToast } from '../ui/Toast'

const ACCESS_OPTS = [
  { value: 'view',     label: 'Can view' },
  { value: 'download', label: 'Can view + download' },
]

const EXPIRY_OPTS = [
  { value: '',    label: 'No expiry' },
  { value: '1d',  label: '1 day' },
  { value: '7d',  label: '7 days' },
  { value: '30d', label: '30 days' },
]

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export default function ShareModal({ item, onClose }) {
  const [loading, setLoading]       = useState(true)
  const [saving,  setSaving]        = useState(false)
  const [copied,  setCopied]        = useState(false)
  const [link,    setLink]          = useState(null)  // existing share_links row
  const [shareUrl, setShareUrl]     = useState('')

  // Settings
  const [allowDownload, setAllowDownload] = useState(true)
  const [expiry,        setExpiry]        = useState('')
  const [password,      setPassword]      = useState('')
  const [showPw,        setShowPw]        = useState(false)
  const [pwMode,        setPwMode]        = useState(false) // true = password tab active

  const isFile   = item.type === 'file'
  const isFolder = item.type === 'folder'

  // Load existing share link on open
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = isFile
          ? await shareLinksApi.listForDriveFile(item.id)
          : await shareLinksApi.listForDriveFolder(item.id)
        if (!mounted) return
        const existing = res.links?.[0]
        if (existing) {
          setLink(existing)
          setShareUrl(`${window.location.origin}/share/${existing.token}`)
          setAllowDownload(existing.allow_download ?? true)
          if (existing.password) setPwMode(true)
        }
      } catch {}
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [item.id])

  async function generateOrUpdate() {
    setSaving(true)
    try {
      const expiresAt = expiry === '1d'  ? addDays(1)
                      : expiry === '7d'  ? addDays(7)
                      : expiry === '30d' ? addDays(30)
                      : null
      const opts = {
        allow_download: allowDownload,
        expires_at: expiresAt,
        password: (pwMode && password) ? password : null,
        file_name: item.name,
      }

      if (link) {
        // Update existing link
        const res = await shareLinksApi.update(link.id, {
          allow_download: allowDownload,
          expires_at: expiresAt,
          password: (pwMode && password) ? password : link.password || null,
        })
        setLink(res.link)
        showToast('Share settings updated', 'success')
      } else {
        // Create new link
        const res = isFile
          ? await shareLinksApi.createForDriveFile(item.id, opts)
          : await shareLinksApi.createForDriveFolder(item.id, opts)
        setLink(res.link)
        setShareUrl(`${window.location.origin}/share/${res.link.token}`)
        showToast('Share link created', 'success')
      }
    } catch (err) {
      showToast(err.message || 'Failed to create share link', 'error')
    }
    setSaving(false)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Could not copy to clipboard', 'error')
    }
  }

  async function revokeLink() {
    if (!link) return
    if (!confirm('Remove this share link? Anyone with the link will lose access.')) return
    try {
      await shareLinksApi.delete(link.id)
      setLink(null)
      setShareUrl('')
      showToast('Share link removed', 'info')
    } catch (err) {
      showToast(err.message || 'Failed to remove link', 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ width: 500, maxWidth: '96vw', display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        {/* Header */}
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
            Share "{item.name}"
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : (
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Access level */}
            <div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Access</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {ACCESS_OPTS.map(opt => {
                  const isActive = opt.value === 'download' ? allowDownload : !allowDownload
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setAllowDownload(opt.value === 'download')}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${isActive ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        background: isActive ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                        color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      {opt.value === 'view' ? <Eye size={14} /> : <DownloadSimple size={14} />}
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Expiry */}
            <div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <ClockCountdown size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Expiry
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {EXPIRY_OPTS.map(opt => {
                  const isActive = expiry === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setExpiry(opt.value)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        border: `1px solid ${isActive ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        background: isActive ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                        color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Password protection */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                  <Lock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Password protection
                </p>
                <button
                  onClick={() => { setPwMode(p => !p); setPassword('') }}
                  style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                    border: `1px solid ${pwMode ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    background: pwMode ? 'rgba(124,58,237,0.15)' : 'transparent',
                    color: pwMode ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {pwMode ? 'On' : 'Off'}
                </button>
              </div>
              {pwMode && (
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-field"
                    type={showPw ? 'text' : 'password'}
                    placeholder={link?.password ? 'Leave blank to keep existing password' : 'Set a password…'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ width: '100%', paddingRight: 60, fontSize: 13 }}
                  />
                  <button
                    onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}
            </div>

            {/* Share link field */}
            {shareUrl ? (
              <div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Link size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Share link
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    readOnly
                    value={shareUrl}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 7, padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,0.6)',
                      outline: 'none', fontFamily: 'monospace',
                    }}
                    onClick={e => e.target.select()}
                  />
                  <button
                    className={copied ? 'btn-primary' : 'btn-ghost'}
                    style={{ flexShrink: 0, gap: 5, fontSize: 12 }}
                    onClick={copyLink}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 4 }}>
              <div>
                {link && (
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                    onClick={revokeLink}
                  >
                    Remove link
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" onClick={onClose}>Done</button>
                <button
                  className="btn-primary"
                  disabled={saving}
                  onClick={generateOrUpdate}
                  style={{ gap: 5 }}
                >
                  {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Link size={13} />}
                  {link ? 'Update settings' : 'Generate link'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
