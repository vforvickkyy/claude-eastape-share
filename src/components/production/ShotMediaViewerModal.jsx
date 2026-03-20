import React, { useEffect, useState, useRef } from 'react'
import { X, ArrowLeft, SpinnerGap, FilmSlate, MusicNote } from '@phosphor-icons/react'
import { projectMediaApi } from '../../lib/api'
import CommentsPanel from '../media/CommentsPanel'
import VideoPlayer from '../media/VideoPlayer'
import '../../styles/videojs-theme.css'

export default function ShotMediaViewerModal({ projectId, mediaId, shotName, shotNumber, onClose }) {
  const [loading,     setLoading]     = useState(true)
  const [videoSrc,    setVideoSrc]    = useState(null)
  const [thumbSrc,    setThumbSrc]    = useState(null)
  const [mimeType,    setMimeType]    = useState(null)
  const [error,       setError]       = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const playerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    projectMediaApi.getViewUrl(mediaId)
      .then(({ url, thumbnailUrl, mime_type }) => {
        if (cancelled) return
        setVideoSrc(url || null)
        setThumbSrc(thumbnailUrl || null)
        setMimeType(mime_type || null)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mediaId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function seekTo(seconds) {
    playerRef.current?.seekTo(seconds)
  }

  const isVideo = mimeType?.startsWith('video/')
  const isImage = mimeType?.startsWith('image/')
  const isAudio = mimeType?.startsWith('audio/')

  return (
    <div className="smvm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="smvm-panel">
        {/* Header */}
        <div className="smvm-header">
          <button className="smvm-back-btn btn-ghost" onClick={onClose}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="smvm-header-info">
            {shotNumber && <span className="smvm-shot-num">#{shotNumber}</span>}
            <span className="smvm-shot-name">{shotName}</span>
          </div>
          <button className="icon-btn smvm-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Content: player left, comments right */}
        <div className="smvm-content">
          <div className="smvm-player-wrap">
            {loading && (
              <div className="smvm-state">
                <SpinnerGap size={32} className="spin" />
              </div>
            )}
            {!loading && error && (
              <div className="smvm-state">
                <FilmSlate size={40} weight="duotone" style={{ opacity: 0.3 }} />
                <p style={{ marginTop: 12, color: 'var(--t3)', fontSize: 13 }}>{error}</p>
              </div>
            )}
            {!loading && !error && videoSrc && isVideo && (
              <VideoPlayer
                ref={playerRef}
                src={videoSrc}
                mimeType={mimeType}
                poster={thumbSrc}
                onTimeUpdate={setCurrentTime}
              />
            )}
            {!loading && !error && videoSrc && isImage && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#000' }}>
                <img src={videoSrc} alt={shotName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            )}
            {!loading && !error && videoSrc && isAudio && (
              <div className="smvm-state" style={{ flexDirection: 'column' }}>
                <MusicNote size={48} weight="duotone" style={{ color: 'var(--purple-l)' }} />
                <p style={{ marginTop: 12, color: 'var(--t2)', fontSize: 13 }}>{shotName}</p>
                <audio controls src={videoSrc} style={{ width: '100%', maxWidth: 420, marginTop: 16 }} />
              </div>
            )}
          </div>

          <div className="smvm-sidebar">
            <CommentsPanel
              assetId={mediaId}
              currentTime={currentTime}
              onSeek={seekTo}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
