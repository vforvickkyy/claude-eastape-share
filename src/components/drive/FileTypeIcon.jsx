import React from 'react'

const EXT_VIDEO  = new Set(['mp4','mov','avi','mkv','webm','m4v','flv','wmv','r3d','mxf'])
const EXT_IMAGE  = new Set(['jpg','jpeg','png','gif','webp','svg','avif','bmp','tiff','exr','psd','raw'])
const EXT_AUDIO  = new Set(['mp3','wav','ogg','flac','aac','m4a','wma','opus','aiff'])
const EXT_ZIP    = new Set(['zip','rar','7z','tar','gz','bz2','xz','tgz'])
const EXT_CODE   = new Set(['js','ts','jsx','tsx','py','go','rs','html','css','json','yaml','yml','sh','bash','md'])
const EXT_DOC    = new Set(['doc','docx','odt','rtf','pdf'])
const EXT_SHEET  = new Set(['xls','xlsx','csv','ods'])
const EXT_SLIDE  = new Set(['ppt','pptx','odp'])
const EXT_TEXT   = new Set(['txt','log','ini','cfg','conf'])

function classify(mimeType, fileName) {
  const ext  = (fileName?.split('.').pop() || '').toLowerCase()
  const mime = mimeType || ''
  if (mime.startsWith('video/') || EXT_VIDEO.has(ext))  return { kind: 'video',   hue: 270, bg: '#7c3aedcc' }
  if (mime.startsWith('image/') || EXT_IMAGE.has(ext))  return { kind: 'image',   hue: 220, bg: '#2563ebcc' }
  if (mime.startsWith('audio/') || EXT_AUDIO.has(ext))  return { kind: 'audio',   hue: 160, bg: '#059669cc' }
  if (mime === 'application/pdf' || ext === 'pdf')       return { kind: 'doc',     hue: 10,  bg: '#dc2626cc' }
  if (EXT_ZIP.has(ext))                                  return { kind: 'archive', hue: 40,  bg: '#d97706cc' }
  if (EXT_CODE.has(ext))                                 return { kind: 'code',    hue: 195, bg: '#0891b2cc' }
  if (EXT_DOC.has(ext) || EXT_SHEET.has(ext) || EXT_SLIDE.has(ext)) return { kind: 'doc', hue: 220, bg: '#2563ebcc' }
  if (EXT_TEXT.has(ext))                                 return { kind: 'doc',     hue: 240, bg: '#6b7280cc' }
  return { kind: 'file', hue: 240, bg: '#374151cc' }
}

export function getFileCategory(mimeType, fileName) {
  const ext  = (fileName?.split('.').pop() || '').toLowerCase()
  const mime = mimeType || ''
  if (mime.startsWith('video/') || EXT_VIDEO.has(ext)) return 'video'
  if (mime.startsWith('image/') || EXT_IMAGE.has(ext)) return 'image'
  if (mime.startsWith('audio/') || EXT_AUDIO.has(ext)) return 'audio'
  if (mime === 'application/pdf' || EXT_DOC.has(ext) || EXT_SHEET.has(ext) || EXT_SLIDE.has(ext) || EXT_TEXT.has(ext) || ext === 'pdf') return 'document'
  return 'other'
}

/**
 * DriveThumbnail — full-bleed SVG placeholder card (16:9, matches handoff Thumb).
 * Used as the thumbnail background in grid file cards when no real preview exists.
 */
export function DriveThumbnail({ mimeType, fileName, seed }) {
  const { kind, hue } = classify(mimeType, fileName)
  const s  = seed != null ? seed : ((fileName ? fileName.charCodeAt(0) + fileName.length : 0))
  const h1 = (hue + (s * 13) % 30) % 360
  const h2 = (hue - 10 + 360) % 360
  const ext = (fileName?.split('.').pop() || '').toUpperCase()
  const gid = `dg${s}${kind}`
  const pid = `dp${s}${kind}`

  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`oklch(0.24 0.05 ${h1})`} />
          <stop offset="1" stopColor={`oklch(0.14 0.03 ${h2})`} />
        </linearGradient>
        <pattern id={pid} width="6" height="6" patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${(s * 13) % 180})`}>
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="160" height="90" fill={`url(#${gid})`} />
      <rect width="160" height="90" fill={`url(#${pid})`} />

      {kind === 'video' && (
        <g opacity="0.55">
          <circle cx="80" cy="45" r="13" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
          <path d="M76 39 L88 45 L76 51 Z" fill="rgba(255,255,255,0.5)" />
        </g>
      )}
      {kind === 'image' && (
        <g opacity="0.5">
          <rect x="58" y="32" width="44" height="28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" rx="2" />
          <circle cx="68" cy="42" r="2.5" fill="rgba(255,255,255,0.3)" />
          <path d="M60 56 L72 46 L84 54 L100 42 L100 60 L60 60 Z" fill="rgba(255,255,255,0.18)" />
        </g>
      )}
      {kind === 'audio' && (
        <g opacity="0.5">
          <rect x="71" y="35" width="4" height="18" rx="2" fill="rgba(255,255,255,0.4)" />
          <rect x="79" y="30" width="4" height="28" rx="2" fill="rgba(255,255,255,0.45)" />
          <rect x="87" y="38" width="4" height="12" rx="2" fill="rgba(255,255,255,0.35)" />
        </g>
      )}
      {(kind === 'doc' || kind === 'archive' || kind === 'code' || kind === 'file') && (
        <g opacity="0.4">
          <rect x="64" y="28" width="32" height="36" rx="2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <line x1="70" y1="38" x2="90" y2="38" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
          <line x1="70" y1="44" x2="90" y2="44" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
          <line x1="70" y1="50" x2="82" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        </g>
      )}
      {ext && (
        <text x="6" y="84" fontFamily="ui-monospace, monospace" fontSize="6"
          fill="rgba(255,255,255,0.45)" letterSpacing="0.05em">{ext}</text>
      )}
    </svg>
  )
}

/** Small square icon badge — used in list rows, toasts, type columns. */
export default function FileTypeIcon({ mimeType, fileName, size = 40 }) {
  const { bg } = classify(mimeType, fileName)
  return (
    <div style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.2),
      background: bg, flexShrink: 0,
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <DriveThumbnail mimeType={mimeType} fileName={fileName} />
    </div>
  )
}
