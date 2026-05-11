/**
 * ShareModal — Google Drive-style share dialog for drive files and folders.
 * Props:
 *   item: { id, name, type: 'file' | 'folder' }
 *   onClose: () => void
 */
import React, { useState, useEffect } from 'react'
import { X, Link, Check, Eye, DownloadSimple, Lock, ClockCountdown, Copy, ShieldCheck } from '@phosphor-icons/react'
import { shareLinksApi } from '../../lib/api'
import { showToast } from '../ui/Toast'

const ACCESS_OPTS = [
  { value: 'view',     label: 'Can view',            icon: Eye },
  { value: 'download', label: 'Can view + download',  icon: DownloadSimple },
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
          setShareUrl(`${window.location.origin}/share/${existing.short_token || existing.token}`)
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
        setShareUrl(`${window.location.origin}/share/${res.link.short_token || res.link.token}`)
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
        className="modal share-modal-v2"
        onClick={e => e.stopPropagation()}
        style={{ width: 460, maxWidth: '96vw' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Link size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Share "{item.name}"
            </h3>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" style={{ width: 22, height: 22 }} />
          </div>
        ) : (
          <div style={{ padding: '4px 0 0' }}>

            {/* ── ACCESS ── */}
            <div className="sm-section">
              <p className="sm-section-label">Access</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {ACCESS_OPTS.map(opt => {
                  const isActive = opt.value === 'download' ? allowDownload : !allowDownload
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setAllowDownload(opt.value === 'download')}
                      className={`sm-access-btn${isActive ? ' active' : ''}`}
                    >
                      <Icon size={13} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="sm-divider" />

            {/* ── EXPIRY ── */}
            <div className="sm-section">
              <p className="sm-section-label">
                <ClockCountdown size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                Expiry
              </p>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {EXPIRY_OPTS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setExpiry(opt.value)}
                    className={`sm-pill${expiry === opt.value ? ' active' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm-divider" />

            {/* ── PASSWORD PROTECTION ── */}
            <div className="sm-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p className="sm-section-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={12} style={{ verticalAlign: 'middle' }} />
                  Password protection
                </p>
                <button
                  onClick={() => { setPwMode(p => !p); setPassword('') }}
                  className={`sm-toggle${pwMode ? ' on' : ''}`}
                >
                  {pwMode ? 'On' : 'Off'}
                </button>
              </div>
              {pwMode && (
                <div style={{ position: 'relative', marginTop: 10 }}>
                  <input
                    className="input-field"
                    type={showPw ? 'text' : 'password'}
                    placeholder={link?.password ? 'Leave blank to keep existing' : 'Enter password…'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ width: '100%', paddingRight: 56, fontSize: 13 }}
                  />
                  <button
                    onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-4)' }}
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}
            </div>

            <div className="sm-divider" />

            {/* ── SHARE LINK ── */}
            <div className="sm-section">
              <p className="sm-section-label">Share link</p>
              {shareUrl ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    readOnly
                    value={shareUrl}
                    className="sm-url-input"
                    onClick={e => e.target.select()}
                  />
                  <button
                    className={copied ? 'btn-primary' : 'btn-ghost'}
                    style={{ flexShrink: 0, gap: 5, fontSize: 12, height: 36 }}
                    onClick={copyLink}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-4)', padding: '2px 0' }}>No link generated yet</p>
              )}
            </div>

            {/* ── FOOTER ── */}
            <div className="sm-footer">
              <div>
                {link && (
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 12, color: '#f87171', borderColor: 'rgba(248,113,113,0.25)' }}
                    onClick={revokeLink}
                  >
                    Remove link
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>Done</button>
                <button
                  className="btn-primary"
                  disabled={saving}
                  onClick={generateOrUpdate}
                  style={{ gap: 5, fontSize: 12 }}
                >
                  {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Link size={13} />}
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
