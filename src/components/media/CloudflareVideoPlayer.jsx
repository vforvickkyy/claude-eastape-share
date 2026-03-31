import React, { useState, useEffect, useRef } from 'react'
import { cloudflareApi } from '../../lib/api'

export default function CloudflareVideoPlayer({
  mediaId,
  cloudflareUid,
  cloudflareStatus: initialStatus,
  fallbackUrl,
  onStatusChange,
}) {
  const [status, setStatus] = useState(initialStatus || 'processing')
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!cloudflareUid) return
    if (status === 'ready' || status === 'error') return

    // Check immediately
    cloudflareApi.getStatus(cloudflareUid, mediaId).then(result => {
      if (result.success) {
        setStatus(result.status)
        onStatusChange?.(result.status)
        if (result.status === 'ready' || result.status === 'error') return
        // Start polling
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
      }
    }).catch(() => {})

    return () => clearInterval(intervalRef.current)
  }, [cloudflareUid, mediaId])

  if (status === 'processing' || status === 'pending') {
    return (
      <div style={{
        width: '100%', aspectRatio: '16/9', background: '#13131a',
        borderRadius: '12px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          border: '3px solid rgba(124,58,237,0.2)',
          borderTop: '3px solid #7c3aed',
          animation: 'cf-spin 1s linear infinite',
        }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: '15px', fontWeight: '600', margin: '0 0 4px' }}>
            Processing video...
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>
            This usually takes 30–60 seconds
          </p>
        </div>
        <div style={{
          background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: '999px', padding: '4px 12px',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#7c3aed', animation: 'cf-pulse 1.5s ease-in-out infinite',
          }} />
          <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '500' }}>
            Auto-refreshing
          </span>
        </div>
        <style>{`
          @keyframes cf-spin { 0% { transform:rotate(0deg) } 100% { transform:rotate(360deg) } }
          @keyframes cf-pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        `}</style>
      </div>
    )
  }

  if (status === 'error' || !cloudflareUid) {
    if (fallbackUrl) {
      return (
        <div style={{ width: '100%' }}>
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px', padding: '8px 12px', marginBottom: '8px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '14px' }}>⚠️</span>
            <p style={{ color: '#fca5a5', fontSize: '13px', margin: 0 }}>
              Streaming unavailable. Playing original file.
            </p>
          </div>
          <video controls style={{ width: '100%', borderRadius: '12px', background: '#000' }} src={fallbackUrl} />
        </div>
      )
    }
    return (
      <div style={{
        width: '100%', aspectRatio: '16/9', background: '#13131a', borderRadius: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(239,68,68,0.3)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>❌</p>
          <p style={{ color: '#fca5a5', fontSize: '14px', margin: 0 }}>Video processing failed</p>
        </div>
      </div>
    )
  }

  // Ready — Cloudflare iframe
  return (
    <div style={{
      width: '100%', aspectRatio: '16/9', borderRadius: '12px',
      overflow: 'hidden', background: '#000', position: 'relative',
    }}>
      <iframe
        src={`https://iframe.cloudflarestream.com/${cloudflareUid}?autoplay=false&letterboxColor=transparent&primaryColor=%237c3aed`}
        style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
