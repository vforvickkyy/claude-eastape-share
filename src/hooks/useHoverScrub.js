import { useState, useRef } from 'react'

// Module-level cache so each video's VTT is only fetched once across all card instances
const cache = new Map() // uid → SpriteData | 'loading' | null

function parseSecs(str) {
  const [h, m, s] = str.trim().split(':').map(Number)
  return h * 3600 + m * 60 + s
}

async function loadSprite(uid) {
  if (cache.has(uid)) return cache.get(uid)
  cache.set(uid, 'loading')
  try {
    const res = await fetch(`https://videodelivery.net/${uid}/thumbnails/sprite.vtt`)
    if (!res.ok) { cache.set(uid, null); return null }
    const vtt = await res.text()

    const frames = []
    // Each cue: timestamp line, then URL line ending with #xywh=x,y,w,h
    const re = /(\d+:\d+:\d+\.\d+) --> (\d+:\d+:\d+\.\d+)[^\r\n]*[\r\n]+[^\r\n]*#xywh=(\d+),(\d+),(\d+),(\d+)/g
    let m
    while ((m = re.exec(vtt)) !== null) {
      frames.push({
        start: parseSecs(m[1]),
        end:   parseSecs(m[2]),
        x: +m[3], y: +m[4], w: +m[5], h: +m[6],
      })
    }
    if (!frames.length) { cache.set(uid, null); return null }

    const totalW = Math.max(...frames.map(f => f.x + f.w))
    const totalH = Math.max(...frames.map(f => f.y + f.h))
    const data = {
      spriteUrl: `https://videodelivery.net/${uid}/thumbnails/sprite.jpg`,
      frames, totalW, totalH,
    }
    cache.set(uid, data)
    return data
  } catch {
    cache.set(uid, null)
    return null
  }
}

/**
 * Attach to a video thumbnail to show sprite-sheet hover scrubbing.
 * Only activates when cloudflareUid is truthy (i.e. video is ready).
 *
 * Usage:
 *   const { scrubBg, thumbRef, onMouseEnter, onMouseMove, onMouseLeave } = useHoverScrub(uid)
 *   <div ref={thumbRef} onMouseEnter={onMouseEnter} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
 *     <img src={thumbnail} />
 *     {scrubBg && <div className="scrub-overlay" style={scrubBg} />}
 *   </div>
 */
export default function useHoverScrub(cloudflareUid) {
  const [scrubBg, setScrubBg] = useState(null)
  const thumbRef = useRef(null)

  function onMouseEnter() {
    if (!cloudflareUid) return
    // Kick off fetch immediately so data is ready by the time the mouse moves
    if (!cache.has(cloudflareUid)) loadSprite(cloudflareUid)
  }

  function onMouseMove(e) {
    if (!cloudflareUid) return
    const data = cache.get(cloudflareUid)
    if (!data || data === 'loading') return

    const el = thumbRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

    // Map cursor position → time → frame
    const totalDur = data.frames[data.frames.length - 1].end
    const targetT  = pct * totalDur
    let frame = data.frames.find(f => targetT >= f.start && targetT < f.end)
    if (!frame) frame = data.frames[Math.min(Math.floor(pct * data.frames.length), data.frames.length - 1)]
    if (!frame) return

    // Scale sprite so one frame exactly fills the card width
    const scale = rect.width / frame.w
    setScrubBg({
      backgroundImage:    `url(${data.spriteUrl})`,
      backgroundPosition: `${-(frame.x * scale)}px ${-(frame.y * scale)}px`,
      backgroundSize:     `${data.totalW * scale}px ${data.totalH * scale}px`,
      backgroundRepeat:   'no-repeat',
    })
  }

  function onMouseLeave() {
    setScrubBg(null)
  }

  return { scrubBg, thumbRef, onMouseEnter, onMouseMove, onMouseLeave }
}
