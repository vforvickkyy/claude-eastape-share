import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { cloudflareApi } from '../../lib/api'

/**
 * CloudflareVideoPlayer — Cloudflare Stream iframe with full SDK control.
 *
 * Ref API:
 *   seekTo(s)            seek to seconds
 *   getCurrentTime()     → number
 *   getDuration()        → number
 *   isPaused()           → bool
 *   play()
 *   pause()
 *   setPlaybackRate(r)   0.25 – 2
 *   setVolume(v)         0 – 1
 *   setMuted(bool)
 *   setLoop(bool)
 *   requestFullscreen()
 *
 * Callbacks:
 *   onTimeUpdate(t)
 *   onPlay()
 *   onPause()
 *   onDurationChange(dur)
 *   onStatusChange(status)
 */
const CloudflareVideoPlayer = forwardRef(function CloudflareVideoPlayer({
  mediaId,
  cloudflareUid,
  cloudflareStatus: initialStatus,
  fallbackUrl,
  startTime,
  onStatusChange,
  onTimeUpdate,
  onPlay,
  onPause,
  onDurationChange,
}, ref) {
  const [status, setStatus] = useState(initialStatus || 'processing')
  const iframeRef      = useRef(null)
  const playerSdkRef   = useRef(null)
  const intervalRef    = useRef(null)
  const currentTimeRef = useRef(0)

  // ── postMessage fallback ─────────────────────────────────────────
  function cfPost(msg) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), '*')
  }

  // ── Imperative handle ────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    seekTo: (t) => {
      if (playerSdkRef.current) playerSdkRef.current.currentTime = t
      else cfPost({ event: 'seek', time: t })
    },
    getCurrentTime: () => currentTimeRef.current,
    getDuration: () => playerSdkRef.current?.duration ?? 0,
    isPaused: () => playerSdkRef.current?.paused ?? true,
    play: () => {
      if (playerSdkRef.current) {
        const p = playerSdkRef.current.play()
        if (p && p.catch) p.catch(() => {})
      } else {
        cfPost({ event: 'play' })
      }
    },
    pause: () => {
      if (playerSdkRef.current) playerSdkRef.current.pause()
      else cfPost({ event: 'pause' })
    },
    setPlaybackRate: (r) => {
      if (playerSdkRef.current) playerSdkRef.current.playbackRate = r
    },
    setVolume: (v) => {
      if (playerSdkRef.current) playerSdkRef.current.volume = v
    },
    setMuted: (b) => {
      if (playerSdkRef.current) playerSdkRef.current.muted = b
    },
    setLoop: (b) => {
      if (playerSdkRef.current) playerSdkRef.current.loop = b
    },
    requestFullscreen: () => {
      const el = iframeRef.current?.parentElement
      if (el?.requestFullscreen) el.requestFullscreen()
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    },
  }))

  // ── Load Cloudflare Stream SDK script (once per page) ────────────
  useEffect(() => {
    if (status !== 'ready') return
    if (document.querySelector('script[data-cf-stream-sdk]')) return
    const script = document.createElement('script')
    script.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js'
    script.setAttribute('data-cf-stream-sdk', '1')
    document.head.appendChild(script)
  }, [status])

  // ── Initialize SDK player once iframe fires onLoad ───────────────
  function onIframeLoad() {
    let attempts = 0
    const tryInit = () => {
      if (window.Stream && iframeRef.current) {
        try {
          const player = window.Stream(iframeRef.current)
          playerSdkRef.current = player

          if (startTime > 0) player.currentTime = startTime

          player.addEventListener('timeupdate', () => {
            const t = player.currentTime
            currentTimeRef.current = t
            onTimeUpdate?.(t)
          })
          player.addEventListener('play',    () => onPlay?.())
          player.addEventListener('playing', () => onPlay?.())
          player.addEventListener('pause',   () => onPause?.())
          player.addEventListener('ended',   () => onPause?.())
          player.addEventListener('durationchange', () => {
            const dur = player.duration
            if (dur && dur > 0) onDurationChange?.(dur)
          })
          // Sync initial states
          if (player.duration > 0) onDurationChange?.(player.duration)
          if (!player.paused) onPlay?.()
        } catch (e) {
          console.warn('CF Stream SDK init failed, using postMessage', e)
        }
      } else if (attempts < 20) {
        attempts++
        setTimeout(tryInit, 250)
      }
    }
    tryInit()
  }

  useEffect(() => {
    return () => {
      playerSdkRef.current = null
      clearInterval(intervalRef.current)
    }
  }, [])

  // ── Poll for processing status ───────────────────────────────────
  useEffect(() => {
    if (!cloudflareUid) return
    if (status === 'ready' || status === 'error') return

    cloudflareApi.getStatus(cloudflareUid, mediaId).then(result => {
      if (!result.success) return
      setStatus(result.status)
      onStatusChange?.(result.status)
      if (result.status === 'ready' || result.status === 'error') return

      intervalRef.current = setInterval(async () => {
        try {
          const r = await cloudflareApi.getStatus(cloudflareUid, mediaId)
          if (r.success) {
            setStatus(r.status)
            onStatusChange?.(r.status)
            if (r.status === 'ready' || r.status === 'error') clearInterval(intervalRef.current)
          }
        } catch {}
      }, 10000)
    }).catch(() => {})

    return () => clearInterval(intervalRef.current)
  }, [cloudflareUid, mediaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Processing state ─────────────────────────────────────────────
  if (status === 'processing' || status === 'pending') {
    return (
      <div style={{
        width: '100%', height: '100%', minHeight: 200,
        background: '#0a0a0c',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: '3px solid rgba(245,158,11,0.15)',
          borderTop: '3px solid var(--accent)',
          animation: 'cf-spin 1s linear infinite',
        }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Processing video…</p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, margin: 0 }}>Usually takes 30–60 seconds</p>
        </div>
        <style>{`
          @keyframes cf-spin  { 0% { transform:rotate(0deg) } 100% { transform:rotate(360deg) } }
        `}</style>
      </div>
    )
  }

  // ── Error / no uid state ─────────────────────────────────────────
  if (status === 'error' || !cloudflareUid) {
    if (fallbackUrl) {
      return (
        <div style={{ width: '100%', height: '100%' }}>
          <video controls style={{ width: '100%', height: '100%', background: '#000' }} src={fallbackUrl} />
        </div>
      )
    }
    return (
      <div style={{
        width: '100%', height: '100%', background: '#0a0a0c',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Video unavailable</p>
      </div>
    )
  }

  // ── Ready — iframe with controls disabled ────────────────────────
  function handleOverlayClick() {
    if (!playerSdkRef.current) return
    if (playerSdkRef.current.paused) {
      const p = playerSdkRef.current.play()
      if (p && p.catch) p.catch(() => {})
    } else {
      playerSdkRef.current.pause()
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      <iframe
        ref={iframeRef}
        src={`https://iframe.cloudflarestream.com/${cloudflareUid}?autoplay=false&controls=false&letterboxColor=transparent&primaryColor=%23f59e0b`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={onIframeLoad}
      />
      {/* Transparent overlay — captures clicks in parent DOM (user gesture) to toggle play/pause */}
      <div
        style={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 1 }}
        onClick={handleOverlayClick}
      />
    </div>
  )
})

export default CloudflareVideoPlayer
