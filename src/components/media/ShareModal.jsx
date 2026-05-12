import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { X, Copy, CheckCircle, Eye, DownloadSimple, Lock, Trash } from "@phosphor-icons/react"
import { shareLinksApi } from "../../lib/api.js"

const EXPIRY_OPTIONS = [
  { label: "No expiry", days: 0 },
  { label: "1 day",     days: 1 },
  { label: "7 days",    days: 7 },
  { label: "30 days",   days: 30 },
]

function daysToExpiry(iso) {
  if (!iso) return 0
  const ms = new Date(iso).getTime() - Date.now()
  const d  = Math.round(ms / 86400000)
  if (d <= 1)  return 1
  if (d <= 7)  return 7
  if (d <= 30) return 30
  return 0
}

export default function ShareModal({ asset, onClose }) {
  const [link,     setLink]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [copied,   setCopied]   = useState(false)

  const [access,    setAccess]    = useState('view+download')
  const [expiry,    setExpiry]    = useState(0)
  const [pwEnabled, setPwEnabled] = useState(false)
  const [pw,        setPw]        = useState('')

  useEffect(() => {
    shareLinksApi.list({ mediaId: asset.id })
      .then(d => {
        const links = d.links || []
        if (links.length > 0) {
          const l = links[0]
          setLink(l)
          setAccess(l.allow_download !== false ? 'view+download' : 'view')
          setExpiry(daysToExpiry(l.expires_at))
          setPwEnabled(!!l.password_hash)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [asset.id])

  function getUrl(token) {
    return `${window.location.origin}/media/share/${token}`
  }

  async function upsertLink() {
    setSaving(true)
    try {
      const expiresAt = expiry > 0
        ? new Date(Date.now() + expiry * 86400000).toISOString()
        : null
      const payload = {
        allow_download: access === 'view+download',
        allow_comments: true,
        expires_at: expiresAt,
        password: (pwEnabled && pw) ? pw : null,
      }
      if (link) {
        const data = await shareLinksApi.update(link.id, payload)
        setLink(prev => ({ ...prev, ...(data.link || {}) }))
      } else {
        const data = await shareLinksApi.create({ project_media_id: asset.id, ...payload })
        setLink(data.link)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function removeLink() {
    if (!link) return
    await shareLinksApi.delete(link.id).catch(console.error)
    setLink(null)
    setPwEnabled(false)
    setPw('')
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(getUrl(link.token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="share-modal-v2"
        style={{ width: 420 }}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--line)',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>Share</div>
            <div style={{
              fontSize: 11.5, color: 'var(--text-4)', marginTop: 2,
              maxWidth: 310, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{asset.name}</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginTop: 1 }}><X size={15} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : (
          <>
            {/* ACCESS */}
            <div className="sm-section">
              <div className="sm-section-label">Access</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`sm-access-btn${access === 'view' ? ' active' : ''}`}
                  onClick={() => setAccess('view')}
                >
                  <Eye size={14} />
                  Can view
                </button>
                <button
                  className={`sm-access-btn${access === 'view+download' ? ' active' : ''}`}
                  onClick={() => setAccess('view+download')}
                >
                  <DownloadSimple size={14} />
                  Can view + download
                </button>
              </div>
            </div>

            <div className="sm-divider" />

            {/* EXPIRY */}
            <div className="sm-section">
              <div className="sm-section-label">Link expiry</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={opt.days}
                    className={`sm-pill${expiry === opt.days ? ' active' : ''}`}
                    onClick={() => setExpiry(opt.days)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm-divider" />

            {/* PASSWORD */}
            <div className="sm-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Lock size={14} style={{ color: 'var(--text-4)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Password protection</span>
                </div>
                <button
                  className={`sm-toggle${pwEnabled ? ' on' : ''}`}
                  onClick={() => setPwEnabled(p => !p)}
                >
                  {pwEnabled ? 'On' : 'Off'}
                </button>
              </div>
              {pwEnabled && (
                <input
                  className="form-input"
                  type="password"
                  placeholder="Set a password…"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  style={{ marginTop: 10 }}
                />
              )}
            </div>

            <div className="sm-divider" />

            {/* SHARE LINK */}
            <div className="sm-section">
              <div className="sm-section-label">Share link</div>
              {link ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="sm-url-input"
                    readOnly
                    value={getUrl(link.token)}
                    onFocus={e => e.target.select()}
                  />
                  <button
                    onClick={copy}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                      padding: '8px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                      background: copied ? 'var(--accent-tint)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${copied ? 'var(--accent-soft)' : 'var(--line-2)'}`,
                      color: copied ? 'var(--accent)' : 'var(--text-2)',
                      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {copied ? <CheckCircle size={13} weight="fill" /> : <Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-4)', margin: 0 }}>
                  No active link. Click "Create link" to generate one.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="sm-footer">
              {link ? (
                <button
                  onClick={removeLink}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                    background: 'none', border: '1px solid rgba(248,113,113,0.3)',
                    color: '#f87171', cursor: 'pointer', fontFamily: 'var(--font)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(248,113,113,0.08)'
                    e.currentTarget.style.borderColor = '#f87171'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'
                  }}
                >
                  <Trash size={12} />
                  Remove link
                </button>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                    background: 'none', border: '1px solid var(--line-2)',
                    color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line-strong)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-2)'}
                >
                  Done
                </button>
                <button
                  className="btn-primary"
                  style={{ padding: '7px 14px', fontSize: 12, height: 'auto' }}
                  onClick={upsertLink}
                  disabled={saving}
                >
                  {saving
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</>
                    : link ? 'Update settings' : 'Create link'
                  }
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
