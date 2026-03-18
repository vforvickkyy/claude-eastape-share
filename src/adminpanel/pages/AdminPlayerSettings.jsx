import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Check, Warning, CircleNotch, Eye, Palette,
  PlayCircle, SpeakerHigh, TextT, ArrowsOut,
} from '@phosphor-icons/react'
import VideoPlayer from '../../components/media/VideoPlayer'
import { invalidatePlayerSettingsCache, PLAYER_DEFAULTS } from '../../hooks/usePlayerSettings'
import '../../styles/videojs-theme.css'

/* ─── helpers ───────────────────────────────────────────────── */
function getAuth() {
  const s = JSON.parse(localStorage.getItem('ets_auth') || '{}')
  return s.access_token
}

async function saveSetting(key, value) {
  const token = getAuth()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-setting`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(value) }),
    }
  )
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Save failed') }
  // Bust the settings cache so VideoPlayer picks up changes on next render
  invalidatePlayerSettingsCache()
}

async function loadSettings() {
  const token = getAuth()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/platform_settings?key=like.player_%25&select=key,value`,
    { headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
  )
  const rows = await res.json()
  const map = { ...PLAYER_DEFAULTS }
  if (Array.isArray(rows)) rows.forEach(r => { map[r.key] = r.value })
  return map
}

/* ─── UI atoms ───────────────────────────────────────────────── */
const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '7px 12px', color: 'var(--t1)',
  fontSize: 13, outline: 'none',
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="admin-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
      <span className="admin-toggle-slider" />
    </label>
  )
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [onDone])
  const c = type === 'success'
    ? { bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)', color: '#4ade80' }
    : { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', color: '#f87171' }
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: c.bg, border: `1px solid ${c.border}`, color: c.color, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 999, display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(8px)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
      {type === 'success' ? <Check size={14} /> : <Warning size={14} />}
      {message}
    </div>
  )
}

function Section({ icon, title, children }) {
  return (
    <div className="admin-section" style={{ marginBottom: 20 }}>
      <div className="admin-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}{title}
      </div>
      <div className="admin-section-body">{children}</div>
    </div>
  )
}

function Row({ label, description, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', marginBottom: 2 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function Spinner() {
  return <CircleNotch size={14} style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
}

/* ─── Playback rates multi-select ───────────────────────────── */
const RATE_OPTIONS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '1.75', '2', '2.5', '3']

function RatesSelector({ value, onChange }) {
  const selected = value.split(',').map(s => s.trim()).filter(Boolean)
  function toggle(r) {
    const next = selected.includes(r) ? selected.filter(x => x !== r) : [...selected, r]
    next.sort((a, b) => Number(a) - Number(b))
    onChange(next.join(','))
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {RATE_OPTIONS.map(r => (
        <button
          key={r}
          onClick={() => toggle(r)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            border: selected.includes(r) ? '1px solid var(--admin-accent)' : '1px solid var(--border)',
            background: selected.includes(r) ? 'rgba(249,115,22,0.12)' : 'var(--bg)',
            color: selected.includes(r) ? 'var(--admin-accent)' : 'var(--t2)',
            transition: 'all 0.15s',
          }}
        >
          {r}×
        </button>
      ))}
    </div>
  )
}

/* ─── Color picker row ───────────────────────────────────────── */
function ColorRow({ label, description, value, onSave, saving }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <Row label={label} description={description}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {saving && <Spinner />}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: local, border: '2px solid var(--border)', flexShrink: 0 }} />
          <input
            type="color"
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => onSave(local)}
            style={{ position: 'absolute', left: 0, top: 0, width: 28, height: 28, opacity: 0, cursor: 'pointer' }}
          />
          <input
            style={{ ...inputStyle, width: 110, fontFamily: 'monospace' }}
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => /^#[0-9a-f]{6}$/i.test(local) && onSave(local)}
          />
        </div>
      </div>
    </Row>
  )
}

/* ─── Main page ─────────────────────────────────────────────── */
export default function AdminPlayerSettings() {
  const [s, setS]       = useState(PLAYER_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(null)
  const [toast,   setToast]   = useState(null)
  const [previewKey, setPreviewKey] = useState(0)
  const playerRef = useRef(null)

  function showToast(msg, type = 'success') { setToast({ msg, type, id: Date.now() }) }

  useEffect(() => {
    loadSettings()
      .then(data => { setS(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = useCallback(async (key, value) => {
    setSaving(key)
    try {
      await saveSetting(key, value)
      setS(prev => ({ ...prev, [key]: String(value) }))
      showToast('Saved')
      // Refresh preview player
      setPreviewKey(k => k + 1)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(null)
    }
  }, [])

  function bool(key) { return s[key] === 'true' }
  function isSaving(key) { return saving === key }

  if (loading) {
    return (
      <div>
        <div className="admin-page-title">Player Settings</div>
        <div className="admin-page-sub">Customize the video player appearance and behavior.</div>
        <div style={{ color: 'var(--t3)', fontSize: 13, padding: '40px 0' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="admin-page-title">Player Settings</div>
      <div className="admin-page-sub">Customize the video player appearance and behavior across the entire platform.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* LEFT — settings panels */}
        <div>

          {/* Appearance */}
          <Section icon={<Palette size={15} weight="duotone" />} title="Appearance">
            <ColorRow
              label="Accent Color"
              description="Progress bar, volume, and button highlight color."
              value={s.player_accent_color}
              onSave={v => save('player_accent_color', v)}
              saving={isSaving('player_accent_color')}
            />
            <Row label="Big Play Button" description="Show large centered play button before video starts.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isSaving('player_big_play_button') && <Spinner />}
                <Toggle
                  checked={bool('player_big_play_button')}
                  onChange={v => save('player_big_play_button', v ? 'true' : 'false')}
                  disabled={!!saving}
                />
              </div>
            </Row>
          </Section>

          {/* Playback */}
          <Section icon={<PlayCircle size={15} weight="duotone" />} title="Playback">
            <Row label="Autoplay" description="Start playing as soon as the page loads (browser may block).">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isSaving('player_autoplay') && <Spinner />}
                <Toggle checked={bool('player_autoplay')} onChange={v => save('player_autoplay', v ? 'true' : 'false')} disabled={!!saving} />
              </div>
            </Row>
            <Row label="Loop" description="Automatically restart video when it ends.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isSaving('player_loop') && <Spinner />}
                <Toggle checked={bool('player_loop')} onChange={v => save('player_loop', v ? 'true' : 'false')} disabled={!!saving} />
              </div>
            </Row>
            <Row label="Muted by Default" description="Start videos muted (required for autoplay in most browsers).">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isSaving('player_muted') && <Spinner />}
                <Toggle checked={bool('player_muted')} onChange={v => save('player_muted', v ? 'true' : 'false')} disabled={!!saving} />
              </div>
            </Row>
            <Row label="Default Volume" description={`${s.player_volume}%`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isSaving('player_volume') && <Spinner />}
                <input
                  type="range" min={0} max={100}
                  value={s.player_volume}
                  onChange={e => setS(prev => ({ ...prev, player_volume: e.target.value }))}
                  onMouseUp={e => save('player_volume', e.target.value)}
                  onTouchEnd={e => save('player_volume', e.target.value)}
                  style={{ width: 120, accentColor: s.player_accent_color }}
                />
                <span style={{ fontSize: 12, color: 'var(--t2)', minWidth: 32 }}>{s.player_volume}%</span>
              </div>
            </Row>
            <Row label="Preload" description="How much video data to load before the user presses play.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isSaving('player_preload') && <Spinner />}
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={s.player_preload}
                  onChange={e => save('player_preload', e.target.value)}
                  disabled={!!saving}
                >
                  <option value="metadata">Metadata only (fast)</option>
                  <option value="auto">Auto (load video)</option>
                  <option value="none">None (save bandwidth)</option>
                </select>
              </div>
            </Row>
            <Row label="Playback Speeds" description="Speed options available in the player.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                {isSaving('player_playback_rates') && <Spinner />}
                <RatesSelector
                  value={s.player_playback_rates}
                  onChange={v => { setS(p => ({ ...p, player_playback_rates: v })); save('player_playback_rates', v) }}
                />
              </div>
            </Row>
          </Section>

          {/* Audio */}
          <Section icon={<SpeakerHigh size={15} weight="duotone" />} title="Watermark / Branding">
            <Row label="Show Watermark" description="Display a text watermark on top of the player.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isSaving('player_show_watermark') && <Spinner />}
                <Toggle checked={bool('player_show_watermark')} onChange={v => save('player_show_watermark', v ? 'true' : 'false')} disabled={!!saving} />
              </div>
            </Row>
            {bool('player_show_watermark') && (
              <>
                <Row label="Watermark Text" description="Text shown as the watermark overlay.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isSaving('player_watermark_text') && <Spinner />}
                    <input
                      style={{ ...inputStyle, width: 160 }}
                      defaultValue={s.player_watermark_text}
                      onBlur={e => save('player_watermark_text', e.target.value)}
                    />
                  </div>
                </Row>
                <Row label="Watermark Position" description="Where to place the watermark on the video.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isSaving('player_watermark_position') && <Spinner />}
                    <select
                      style={{ ...inputStyle, cursor: 'pointer' }}
                      value={s.player_watermark_position}
                      onChange={e => save('player_watermark_position', e.target.value)}
                      disabled={!!saving}
                    >
                      <option value="top-left">Top Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="bottom-right">Bottom Right</option>
                    </select>
                  </div>
                </Row>
              </>
            )}
          </Section>
        </div>

        {/* RIGHT — live preview */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div className="admin-section">
            <div className="admin-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={15} weight="duotone" /> Live Preview
            </div>
            <div className="admin-section-body">
              <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>
                This is how the player will look with current settings applied.
                Settings sync to all players on the platform instantly.
              </p>
              <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                <VideoPlayer
                  key={previewKey}
                  ref={playerRef}
                  src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                  mimeType="video/mp4"
                  poster="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg"
                />
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)' }}>
                  <span>Accent</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: s.player_accent_color, display: 'inline-block' }} />
                    {s.player_accent_color}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)' }}>
                  <span>Speeds</span><span>{s.player_playback_rates}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)' }}>
                  <span>Watermark</span><span>{s.player_show_watermark === 'true' ? `"${s.player_watermark_text}" @ ${s.player_watermark_position}` : 'off'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)' }}>
                  <span>Autoplay / Loop / Muted</span>
                  <span>{s.player_autoplay === 'true' ? '✓' : '✗'} / {s.player_loop === 'true' ? '✓' : '✗'} / {s.player_muted === 'true' ? '✓' : '✗'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast key={toast.id} message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
