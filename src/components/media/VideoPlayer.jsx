import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

const VideoPlayer = forwardRef(({ src, mimeType, poster, onTimeUpdate, onReady }, ref) => {
  const videoRef = useRef(null)
  const playerRef = useRef(null)

  useImperativeHandle(ref, () => ({
    seekTo: (time) => { playerRef.current?.currentTime(time) },
    getCurrentTime: () => playerRef.current?.currentTime() || 0,
    pause: () => playerRef.current?.pause(),
    play: () => playerRef.current?.play(),
  }))

  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      playerRef.current = videojs(videoRef.current, {
        controls: true,
        fluid: true,
        responsive: true,
        preload: 'metadata',
        poster,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        sources: src ? [{ src, type: mimeType || 'video/mp4' }] : [],
      })

      playerRef.current.on('timeupdate', () => {
        onTimeUpdate?.(playerRef.current.currentTime())
      })

      playerRef.current.on('ready', () => {
        onReady?.()
      })
    }
  }, [])

  useEffect(() => {
    if (playerRef.current && src) {
      playerRef.current.src([{ src, type: mimeType || 'video/mp4' }])
      if (poster) playerRef.current.poster(poster)
    }
  }, [src, poster])

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  }, [])

  return (
    <div data-vjs-player style={{ width: '100%', borderRadius: 12, overflow: 'hidden' }}>
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered"
        playsInline
      />
    </div>
  )
})

VideoPlayer.displayName = 'VideoPlayer'

export default VideoPlayer
