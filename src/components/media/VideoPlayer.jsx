import { useEffect, useRef, forwardRef, useImperativeHandle, useId } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import usePlayerSettings from '../../hooks/usePlayerSettings'

const WATERMARK_POSITIONS = {
  'top-left':     { top: 10, left: 12 },
  'top-right':    { top: 10, right: 12 },
  'bottom-left':  { bottom: 44, left: 12 },
  'bottom-right': { bottom: 44, right: 12 },
}

const VideoPlayer = forwardRef(({ src, mimeType, poster, initialTime, onTimeUpdate, onReady }, ref) => {
  const videoRef  = useRef(null)
  const playerRef = useRef(null)
  const styleRef  = useRef(null)
  const uid       = useId().replace(/:/g, '')          // unique CSS scope id
  const settings  = usePlayerSettings()

  useImperativeHandle(ref, () => ({
    seekTo:         (time) => { playerRef.current?.currentTime(time) },
    getCurrentTime: ()     => playerRef.current?.currentTime() || 0,
    pause:          ()     => playerRef.current?.pause(),
    play:           ()     => playerRef.current?.play(),
  }))

  // Derived settings
  const accent       = settings.player_accent_color      || '#7c3aed'
  const autoplay     = settings.player_autoplay           === 'true'
  const loop         = settings.player_loop               === 'true'
  const muted        = settings.player_muted              === 'true'
  const volume       = Math.max(0, Math.min(100, Number(settings.player_volume ?? 80))) / 100
  const preload      = settings.player_preload            || 'metadata'
  const rates        = (settings.player_playback_rates    || '0.5,0.75,1,1.25,1.5,2')
                         .split(',').map(Number).filter(Boolean)
  const showWater    = settings.player_show_watermark     === 'true'
  const waterText    = settings.player_watermark_text     || 'Eastape'
  const waterPos     = WATERMARK_POSITIONS[settings.player_watermark_position] || WATERMARK_POSITIONS['top-right']
  const bigPlay      = settings.player_big_play_button    !== 'false'

  // Inject scoped accent-color CSS
  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style')
      document.head.appendChild(styleRef.current)
    }
    const a  = accent
    const a2 = a + 'cc'
    styleRef.current.textContent = `
      #${uid} .vjs-play-progress,
      #${uid} .vjs-volume-level { background-color: ${a} !important; }
      #${uid} .vjs-play-progress:before { color: ${a} !important; }
      #${uid} .vjs-big-play-button {
        background: ${a2} !important;
        border-color: ${a}88 !important;
        ${!bigPlay ? 'display:none!important;' : ''}
      }
      #${uid} .vjs-big-play-button:hover { background: ${a} !important; }
    `
    return () => { styleRef.current?.remove(); styleRef.current = null }
  }, [accent, bigPlay, uid])

  // Init player once
  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      playerRef.current = videojs(videoRef.current, {
        controls:      true,
        fluid:         true,
        responsive:    true,
        preload,
        autoplay,
        loop,
        muted,
        poster,
        playbackRates: rates,
        sources:       src ? [{ src, type: mimeType || 'video/mp4' }] : [],
      })
      playerRef.current.volume(volume)
      playerRef.current.on('timeupdate', () => {
        onTimeUpdate?.(playerRef.current.currentTime())
      })
      playerRef.current.on('ready', () => { onReady?.() })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update src/poster when they change
  useEffect(() => {
    if (playerRef.current && src) {
      playerRef.current.src([{ src, type: mimeType || 'video/mp4' }])
      if (poster) playerRef.current.poster(poster)
      if (initialTime > 0) {
        playerRef.current.one('loadedmetadata', () => {
          playerRef.current?.currentTime(initialTime)
        })
      }
    }
  }, [src, poster]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup
  useEffect(() => {
    return () => {
      playerRef.current?.dispose()
      playerRef.current = null
    }
  }, [])

  return (
    <div id={uid} data-vjs-player style={{ width: '100%', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered"
        playsInline
      />
      {showWater && (
        <div style={{
          position: 'absolute',
          ...waterPos,
          pointerEvents: 'none',
          zIndex: 10,
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.05em',
          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          userSelect: 'none',
        }}>
          {waterText}
        </div>
      )}
    </div>
  )
})

VideoPlayer.displayName = 'VideoPlayer'
export default VideoPlayer
