import { useState, useRef } from 'react'

// Number of frames to pre-fetch on hover. Each frame covers 1/FRAMES of the video.
// All FRAMES requests fire in parallel on mouseenter and are served from cache on mousemove.
const FRAMES = 12

export default function useHoverScrub(cloudflareUid, duration) {
  const [frameUrl,    setFrameUrl]    = useState(null)
  const thumbRef      = useRef(null)
  const lastFrame     = useRef(-1)
  const didPrefetch   = useRef(false)

  function cfThumb(t) {
    return `https://videodelivery.net/${cloudflareUid}/thumbnails/thumbnail.jpg?time=${t}s&width=320`
  }

  // Returns the centre timestamp for frame bucket i (guaranteed < duration).
  function frameTime(i, dur) {
    return parseFloat(((dur * (i + 0.5)) / FRAMES).toFixed(1))
  }

  function onMouseEnter() {
    if (!cloudflareUid || didPrefetch.current) return
    didPrefetch.current = true
    const dur = duration || 30
    // Fire all FRAMES requests in parallel once — mousemove will hit the cache.
    for (let i = 0; i < FRAMES; i++) {
      new Image().src = cfThumb(frameTime(i, dur))
    }
  }

  function onMouseMove(e) {
    if (!cloudflareUid) return
    const el = thumbRef.current
    if (!el) return
    const rect  = el.getBoundingClientRect()
    const pct   = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width))
    const frame = Math.floor(pct * FRAMES)
    if (frame === lastFrame.current) return
    lastFrame.current = frame
    setFrameUrl(cfThumb(frameTime(frame, duration || 30)))
  }

  function onMouseLeave() {
    setFrameUrl(null)
    lastFrame.current = -1
  }

  return { frameUrl, thumbRef, onMouseEnter, onMouseMove, onMouseLeave }
}
