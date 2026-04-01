import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { cloudflareApi } from '../../lib/api'

/**
 * CloudflareVideoPlayer
 *
 * forwardRef API (same shape as VideoPlayer):
 *   ref.seekTo(seconds)
 *   ref.getCurrentTime() → number
 *   ref.pause()
 *   ref.play()
 *
 * Communicates with the Cloudflare Stream iframe via postMessage
 * using the Stream Player API:
 * https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/using-the-player-api/
 */
const CloudflareVideoPlayer = forwardRef(function CloudflareVideoPlayer({
  mediaId,
  cloudflareUid,
  cloudflareStatus: initialStatus,
  fallbackUrl,
  onStatusChange,
  onTimeUpdate,
}, ref) {
  const [status, setStatus] = useState(initialStatus || 'processing')
  const iframeRef  = useRef(null)
  const intervalRef = useRef(null)
  const currentTimeRef = useRef(0)

  // ── postMessage helpers ──────────────────────────────────────────
  function cfPost(msg) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), '*')
  }

  // ── Imperative handle (same API as VideoPlayer) ──────────────────
  useImperativeHandle(ref, () => ({
    seekTo:         (t) => cfPost({ event: 'seek', time: t }),
    getCurrentTime: ()  => currentTimeRef.current,
    pause:          ()  => cfPost({ event: 'pause' }),
    play:           ()  => cfPost({ event: 'play' }),
  }))

  // ── Listen for timeupdate messages from the iframe ───────────────
  useEffect(() => {
    if (status !== 'ready') return

    function onMessage(e) {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (data?.event === 'timeupdate' && typeof data.currentTime === 'number') {
          currentTimeRef.current = data.currentTime
          onTimeUpdate?.(data.currentTime)
        }
      } catch {}
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [status, onTimeUpdate])

  // Request timeupdate events from the player once the iframe loads
  function onIframeLoad() {
    // Tell the Cloudflare player to send us timeupdate events
    cfPost({ event: 'addEventListener', type: 'timeupdate' })
    cfPost({ event: 'addEventListener', type: 'play' })
    cfPost({ event: 'addEventListener', type: 'pause' })
  }

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
            if (r.status === 'ready' || r.status === 'error') {
              clearInterval(intervalRef.current)
            }
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
        width: '100%', aspectRatio: '16/9', background: '#13131a',
        borderRadius: '12px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid rgba(124,58,237,0.2)',
          borderTop: '3px solid #7c3aed',
          animation: 'cf-spin 1s linear infinite',
        }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Processing video...</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>This usually takes 30–60 seconds</p>
        </div>
        <div style={{
          background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: 999, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', animation: 'cf-pulse 1.5s ease-in-out infinite' }} />
          <span style={{ color: '#a78bfa', fontSize: 12, fontWeight: 500 }}>Auto-refreshing</span>
        </div>
        <style>{`
          @keyframes cf-spin  { 0%   { transform:rotate(0deg)   } 100% { transform:rotate(360deg) } }
          @keyframes cf-pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        `}</style>
      </div>
    )
  }

  // ── Error / no uid state ─────────────────────────────────────────
  if (status === 'error' || !cloudflareUid) {
    if (fallbackUrl) {
      return (
        <div style={{ width: '100%' }}>
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>Streaming unavailable. Playing original file.</p>
          </div>
          <video controls style={{ width: '100%', borderRadius: 12, background: '#000' }} src={fallbackUrl} />
        </div>
      )
    }
    return (
      <div style={{
        width: '100%', aspectRatio: '16/9', background: '#13131a', borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(239,68,68,0.3)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>❌</p>
          <p style={{ color: '#fca5a5', fontSize: 14, margin: 0 }}>Video processing failed</p>
        </div>
      </div>
    )
  }

  // ── Ready — Cloudflare iframe with Stream API enabled ────────────
  return (
    <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', background: '#000', position: 'relative' }}>
      <iframe
        ref={iframeRef}
        src={`https://iframe.cloudflarestream.com/${cloudflareUid}?autoplay=false&letterboxColor=transparent&primaryColor=%237c3aed&enablejsapi=1`}
        style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        onLoad={onIframeLoad}
      />
    </div>
  )
})

export default CloudflareVideoPlayer
