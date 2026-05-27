import { useState, useRef } from 'react'

/**
 * Hover-scrub using Cloudflare Stream's per-frame thumbnail API.
 * As the cursor moves across the thumbnail, a different frame is shown.
 *
 * Key behavior: we update the src on an already-rendered <img> element.
 * The browser keeps displaying the previous frame until the next loads,
 * giving flicker-free scrubbing with no sprite-sheet parsing required.
 *
 * Usage:
 *   const { frameUrl, thumbRef, onMouseEnter, onMouseMove, onMouseLeave } =
 *     useHoverScrub(cloudflareUid, duration)
 *
 *   <div ref={thumbRef} onMouseEnter={onMouseEnter} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
 *     <img src={poster} />
 *     {frameUrl && <div className="scrub-overlay"><img className="scrub-frame-img" src={frameUrl} alt="" /></div>}
 *   </div>
 */
export default function useHoverScrub(cloudflareUid, duration) {
  const [frameUrl,   setFrameUrl]   = useState(null)
  const thumbRef     = useRef(null)
  const lastUpdateMs = useRef(0)
  const lastT        = useRef(-1)

  function cfThumb(t) {
    return `https://videodelivery.net/${cloudflareUid}/thumbnails/thumbnail.jpg?time=${t}s&width=320`
  }

  function onMouseEnter() {
    if (!cloudflareUid) return
    // Preload the very first frame so there's no delay on first move
    new Image().src = cfThumb(0.5)
  }

  function onMouseMove(e) {
    if (!cloudflareUid) return

    // Throttle to ~10 fps — enough for smooth feel, avoids hammering the CDN
    const now = Date.now()
    if (now - lastUpdateMs.current < 100) return

    const el = thumbRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct  = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width))
    const t    = parseFloat((pct * (duration || 30)).toFixed(1))

    if (t === lastT.current) return
    lastT.current      = t
    lastUpdateMs.current = now
    setFrameUrl(cfThumb(t))
  }

  function onMouseLeave() {
    setFrameUrl(null)
    lastT.current = -1
  }

  return { frameUrl, thumbRef, onMouseEnter, onMouseMove, onMouseLeave }
}
