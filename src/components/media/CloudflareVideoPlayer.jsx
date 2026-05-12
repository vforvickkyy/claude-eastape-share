import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import {
  Play, Pause, SkipBack, SkipForward,
  Square, Repeat, FrameCorners,
  SpeakerSimpleHigh, SpeakerSimpleLow, SpeakerSimpleX,
} from '@phosphor-icons/react'
import { cloudflareApi } from '../../lib/api'

let qualityLevelsLoaded = false
async function loadQualityLevels() {
  if (qualityLevelsLoaded) return
  try {
    await import('videojs-contrib-quality-levels')
    qualityLevelsLoaded = true
  } catch {}
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

function fmt(s) {
  if (!s && s !== 0) return '0:00'
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

const CloudflareVideoPlayer = forwardRef(function CloudflareVideoPlayer({
  mediaId,
  cloudflareUid,
  cloudflareStatus: initialStatus,
  fallbackUrl,
  startTime,
  comments = [],
  onStatusChange,
  onTimeUpdate,
  onPlay,
  onPause,
  onDurationChange,
}, ref) {
  const [status, setStatus] = useState(initialStatus || 'processing')

  const videoRef     = useRef(null)
  const playerRef    = useRef(null)
  const containerRef = useRef(null)
  const progressRef  = useRef(null)
  const intervalRef  = useRef(null)
  const speedMenuRef = useRef(null)
  const volWrapRef   = useRef(null)
  const qMenuRef     = useRef(null)

  const [playing,   setPlaying]   = useState(false)
  const [curTime,   setCurTime]   = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [volume,    setVolume]    = useState(1)
  const [muted,     setMuted]     = useState(false)
  const [loop,      setLoop]      = useState(true)
  const [speed,     setSpeed]     = useState(1)
  const [showSpeed, setShowSpeed] = useState(false)
  const [showVol,   setShowVol]   = useState(false)
  const [qualities, setQualities] = useState([])
  const [activeQ,   setActiveQ]   = useState(-1)
  const [showQ,     setShowQ]     = useState(false)
  const [hoverX,    setHoverX]    = useState(null)
  const [hoverTime, setHoverTime] = useState(0)

  // ── Ref API ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    seekTo:          (t) => { playerRef.current?.currentTime(t) },
    getCurrentTime:  ()  => playerRef.current?.currentTime() || 0,
    getDuration:     ()  => playerRef.current?.duration()    || 0,
    isPaused:        ()  => playerRef.current?.paused()      ?? true,
    play:            ()  => { const p = playerRef.current?.play(); p?.catch?.(() => {}) },
    pause:           ()  => { playerRef.current?.pause() },
    setPlaybackRate: (r) => { playerRef.current?.playbackRate(r) },
    setVolume:       (v) => { playerRef.current?.volume(v) },
    setMuted:        (b) => { playerRef.current?.muted(b) },
    setLoop:         (b) => { playerRef.current?.loop(b); setLoop(b) },
    requestFullscreen: () => {
      const el = containerRef.current
      if (el?.requestFullscreen) el.requestFullscreen()
      else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    },
  }))

  // ── Poll for processing status ────────────────────────────────────
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

  // ── Init Video.js when ready ──────────────────────────────────────
  useEffect(() => {
    if (status !== 'ready' || !cloudflareUid || !videoRef.current || playerRef.current) return

    const src = `https://videodelivery.net/${cloudflareUid}/manifest/video.m3u8`

    loadQualityLevels().then(() => {
      if (!videoRef.current) return

      const player = videojs(videoRef.current, {
        controls:       false,
        controlBar:     false,
        bigPlayButton:  false,
        fill:           true,
        preload:        'auto',
        loop:           true,
        muted:          false,
        playbackRates:  SPEEDS,
        sources:        [{ src, type: 'application/x-mpegURL' }],
      })

      playerRef.current = player

      // Quality levels
      try {
        const ql = player.qualityLevels()
        ql.on('addqualitylevel', () => {
          const levels = []
          for (let i = 0; i < ql.length; i++) {
            if (ql[i].height) levels.push({ index: i, height: ql[i].height })
          }
          // Deduplicate by height, highest first
          const seen = new Set()
          const unique = []
          levels.sort((a, b) => b.height - a.height).forEach(l => {
            if (!seen.has(l.height)) { seen.add(l.height); unique.push(l) }
          })
          setQualities(unique)
        })
      } catch {}

      player.on('timeupdate', () => {
        const t = player.currentTime()
        setCurTime(t)
        onTimeUpdate?.(t)
      })
      player.on('durationchange', () => {
        const d = player.duration()
        if (d && d > 0) { setDuration(d); onDurationChange?.(d) }
      })
      player.on('play',    () => { setPlaying(true);  onPlay?.() })
      player.on('playing', () => { setPlaying(true);  onPlay?.() })
      player.on('pause',   () => { setPlaying(false); onPause?.() })
      player.on('ended',   () => { setPlaying(false); onPause?.() })
      player.on('volumechange', () => {
        setVolume(player.volume())
        setMuted(player.muted())
      })

      if (startTime > 0) {
        player.one('loadedmetadata', () => player.currentTime(startTime))
      }
    })

    return () => {
      clearInterval(intervalRef.current)
      playerRef.current?.dispose()
      playerRef.current = null
    }
  }, [status, cloudflareUid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close menus on outside click ─────────────────────────────────
  useEffect(() => {
    if (!showSpeed && !showQ) return
    function onDown(e) {
      if (showSpeed && speedMenuRef.current && !speedMenuRef.current.contains(e.target)) setShowSpeed(false)
      if (showQ     && qMenuRef.current     && !qMenuRef.current.contains(e.target))     setShowQ(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showSpeed, showQ])

  // ── Keyboard controls ─────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'ready') return
    function onKey(e) {
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return
      if (!containerRef.current?.closest('body')) return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          toggleMute()
          break
        case 'ArrowLeft':
          e.preventDefault()
          frameBack()
          break
        case 'ArrowRight':
          e.preventDefault()
          frameForward()
          break
        default: break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [status, muted]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Control handlers ──────────────────────────────────────────────
  function togglePlay() {
    if (!playerRef.current) return
    if (playerRef.current.paused()) {
      const p = playerRef.current.play(); p?.catch?.(() => {})
    } else {
      playerRef.current.pause()
    }
  }

  function stop() {
    playerRef.current?.pause()
    playerRef.current?.currentTime(0)
  }

  function frameBack()    { playerRef.current?.currentTime(Math.max(0,            (playerRef.current?.currentTime() || 0) - 1 / 24)) }
  function frameForward() { playerRef.current?.currentTime(Math.min(duration || 0, (playerRef.current?.currentTime() || 0) + 1 / 24)) }

  function toggleMute() {
    const next = !muted; setMuted(next); playerRef.current?.muted(next)
  }

  function handleVolume(v) {
    const val = parseFloat(v)
    setVolume(val); playerRef.current?.volume(val)
    if (val === 0)        { setMuted(true);  playerRef.current?.muted(true)  }
    else if (muted)       { setMuted(false); playerRef.current?.muted(false) }
  }

  function setSpeedVal(r) {
    setSpeed(r); playerRef.current?.playbackRate(r); setShowSpeed(false)
  }

  function toggleLoop() {
    const next = !loop; setLoop(next); playerRef.current?.loop(next)
  }

  function setQuality(uiIdx) {
    setActiveQ(uiIdx); setShowQ(false)
    try {
      const ql = playerRef.current?.qualityLevels()
      if (!ql) return
      if (uiIdx === -1) {
        for (let i = 0; i < ql.length; i++) ql[i].enabled = true
      } else {
        const targetH = qualities[uiIdx]?.height
        for (let i = 0; i < ql.length; i++) {
          ql[i].enabled = ql[i].height === targetH
        }
      }
    } catch {}
  }

  function handleSeek(e) {
    const val = parseFloat(e.target.value)
    playerRef.current?.currentTime(val); setCurTime(val)
  }

  function handleProgressHover(e) {
    if (!progressRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const x    = e.clientX - rect.left
    const pct  = Math.max(0, Math.min(1, x / rect.width))
    setHoverX(x); setHoverTime(pct * duration)
  }

  // ── Render helpers ────────────────────────────────────────────────
  const pct = duration > 0 ? (curTime / duration) * 100 : 0
  const VolumeIcon = (muted || volume === 0) ? SpeakerSimpleX
                   : volume < 0.5            ? SpeakerSimpleLow
                   :                           SpeakerSimpleHigh

  const progressWidth = progressRef.current?.offsetWidth || 400
  const thumbPreviewLeft = Math.max(80, Math.min(hoverX ?? 0, progressWidth - 80))

  // ── Processing state ──────────────────────────────────────────────
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
        <style>{`@keyframes cf-spin { 0% { transform:rotate(0deg) } 100% { transform:rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Error / no uid state ──────────────────────────────────────────
  if (status === 'error' || !cloudflareUid) {
    if (fallbackUrl) {
      return (
        <div style={{ width: '100%', height: '100%' }}>
          <video controls style={{ width: '100%', height: '100%', background: '#000' }} src={fallbackUrl} />
        </div>
      )
    }
    return (
      <div style={{ width: '100%', height: '100%', background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Video unavailable</p>
      </div>
    )
  }

  // ── Ready — Video.js player ───────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}
    >
      {/* Video.js fills entire container — click to play/pause */}
      <div
        className="cf-vjs-wrap"
        data-vjs-player
        style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          className="video-js"
          playsInline
        />
      </div>

      {/* Controls bar — overlay at the bottom */}
      <div className="vc-bar" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        {/* Scrub / progress */}
        <div
          ref={progressRef}
          className="vc-progress"
          onMouseMove={handleProgressHover}
          onMouseLeave={() => setHoverX(null)}
        >
          <div className="vc-progress-bg">
            <div className="vc-progress-fill" style={{ width: `${pct}%` }} />
            {duration > 0 && comments.map(c =>
              c.timestamp_seconds != null && (
                <div
                  key={c.id}
                  className="vc-marker"
                  style={{ left: `${(c.timestamp_seconds / duration) * 100}%` }}
                  title={c.body?.slice(0, 60)}
                />
              )
            )}
          </div>
          <input
            type="range" min={0} max={duration || 100} step={0.05}
            value={curTime}
            onChange={handleSeek}
            className="vc-scrub-input"
          />
          {/* Thumbnail hover preview */}
          {hoverX != null && cloudflareUid && duration > 0 && (
            <div className="vc-thumb-preview" style={{ left: thumbPreviewLeft }}>
              <img
                src={`https://videodelivery.net/${cloudflareUid}/thumbnails/thumbnail.jpg?time=${Math.max(0.1, hoverTime).toFixed(1)}s&width=160`}
                alt=""
                draggable={false}
                loading="eager"
              />
              <div className="vc-thumb-time">{fmt(hoverTime)}</div>
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="vc-controls">
          <div className="vc-left">
            <button className="vc-btn" onClick={frameBack}    title="Frame back (-1f)"><SkipBack    size={13} /></button>
            <button className="vc-btn vc-play-btn" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
            </button>
            <button className="vc-btn" onClick={frameForward} title="Frame forward (+1f)"><SkipForward size={13} /></button>
            <button className="vc-btn" onClick={stop}         title="Stop"><Square size={12} weight="fill" /></button>
            <span className="vc-time">{fmt(curTime)} / {fmt(duration)}</span>
          </div>

          <div className="vc-right">
            {/* Loop */}
            <button
              className={`vc-btn${loop ? ' vc-active' : ''}`}
              onClick={toggleLoop}
              title="Loop"
            >
              <Repeat size={14} />
            </button>

            {/* Volume */}
            <div
              ref={volWrapRef}
              className="vc-vol-wrap"
              onMouseEnter={() => setShowVol(true)}
              onMouseLeave={() => setShowVol(false)}
            >
              <button className="vc-btn" onClick={toggleMute}>
                <VolumeIcon size={14} />
              </button>
              {showVol && (
                <div className="vc-vol-popup">
                  <input
                    type="range" min={0} max={1} step={0.02}
                    value={muted ? 0 : volume}
                    onChange={e => handleVolume(e.target.value)}
                    className="vc-vol-slider"
                    style={{ '--vol-pct': `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Speed */}
            <div className="vc-speed-wrap" ref={speedMenuRef}>
              <button className="vc-btn vc-speed-btn" onClick={() => setShowSpeed(p => !p)}>
                {speed}×
              </button>
              {showSpeed && (
                <div className="vc-speed-menu">
                  {SPEEDS.map(r => (
                    <button
                      key={r}
                      className={`vc-speed-item${speed === r ? ' active' : ''}`}
                      onClick={() => setSpeedVal(r)}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality */}
            {qualities.length > 0 && (
              <div className="vc-speed-wrap" ref={qMenuRef}>
                <button className="vc-btn vc-speed-btn" onClick={() => setShowQ(p => !p)}>
                  {activeQ === -1 ? 'Auto' : `${qualities[activeQ]?.height}p`}
                </button>
                {showQ && (
                  <div className="vc-speed-menu">
                    <button
                      className={`vc-speed-item${activeQ === -1 ? ' active' : ''}`}
                      onClick={() => setQuality(-1)}
                    >
                      Auto
                    </button>
                    {qualities.map((q, i) => (
                      <button
                        key={q.height}
                        className={`vc-speed-item${activeQ === i ? ' active' : ''}`}
                        onClick={() => setQuality(i)}
                      >
                        {q.height}p
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button
              className="vc-btn"
              onClick={() => {
                const el = containerRef.current
                if (el?.requestFullscreen) el.requestFullscreen()
                else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
              }}
              title="Fullscreen"
            >
              <FrameCorners size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

export default CloudflareVideoPlayer
