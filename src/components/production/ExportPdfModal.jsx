import React, { useState, useRef } from 'react'
import { X, DownloadSimple, Eye, CaretLeft, CaretRight, FilmSlate } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ── Built-in columns for the PDF export ─────────────────────────────────────
const BUILT_IN_COLS = [
  { id: 'thumb',    label: 'Thumbnail',   default: true  },
  { id: 'name',     label: 'Shot Name',   default: true,  required: true },
  { id: 'status',   label: 'Status',      default: true  },
  { id: 'assigned', label: 'Assigned To', default: true  },
  { id: 'scene',    label: 'Scene',       default: false },
]

// Page size dimensions in mm [width, height]
const PAGE_SIZES = { A4: [297, 210], Letter: [279, 216], A3: [420, 297] }

// ── Helpers ─────────────────────────────────────────────────────────────────
function statusStyle(color, dark) {
  const c = color || (dark ? '#a4a4ac' : '#9ca3af')
  const hex2 = (c + '28').slice(0, 9)
  return { bg: c + '22', border: c + '55', color: c, dot: c }
}

// ── PDF Preview Component ────────────────────────────────────────────────────
function PDFPreview({
  shots, statuses, scenes, columns, customColumns, teamMembers,
  theme, density, thumbSize, groupByScene,
  includeHeader, includeSummary, includeTimestamp, includeLogo,
  exportName, projectName, clientName, mediaCount, memberCount,
  isPreview = false,
}) {
  const dark = theme === 'dark'
  const compact = density === 'compact'

  const T = dark ? {
    bg: '#0c0c0e', card: '#111114', headBg: '#08080a',
    border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.11)',
    text: '#ececee', text2: '#a4a4ac', text3: '#6f6f78', text4: '#4a4a52',
    accent: '#E8943A', accentSoft: 'rgba(232,148,58,0.14)', accentBorder: 'rgba(232,148,58,0.25)',
    altRow: 'rgba(255,255,255,0.015)', groupBg: '#0a0a0c',
    mono: "'JetBrains Mono', ui-monospace, monospace",
    font: "'Inter', system-ui, sans-serif",
  } : {
    bg: '#ffffff', card: '#ffffff', headBg: '#fafafa',
    border: '#e8e8ec', border2: '#d4d4d8',
    text: '#18181b', text2: '#52525b', text3: '#a1a1aa', text4: '#d4d4d8',
    accent: '#d97706', accentSoft: 'rgba(217,119,6,0.08)', accentBorder: 'rgba(217,119,6,0.2)',
    altRow: '#fafafa', groupBg: '#f0f0f3',
    mono: "'JetBrains Mono', ui-monospace, monospace",
    font: "'Inter', system-ui, sans-serif",
  }

  const thumbW = thumbSize === 'small' ? 48 : thumbSize === 'medium' ? 72 : 0
  const thumbH = thumbSize === 'small' ? 28 : thumbSize === 'medium' ? 42 : 0
  const showThumb = thumbSize !== 'off' && columns.thumb

  // Build grid cols
  const gridCols = []
  if (showThumb) gridCols.push(`${thumbW + 8}px`)
  if (columns.name) gridCols.push('2fr')
  if (columns.status) gridCols.push('1.1fr')
  if (columns.assigned) gridCols.push('1.1fr')
  if (columns.scene) gridCols.push('1.1fr')
  customColumns.forEach(col => { if (columns['c_' + col.id]) gridCols.push('1fr') })

  // Active header labels
  const headerCols = []
  if (showThumb) headerCols.push({ id: 'thumb_spacer', label: '' })
  if (columns.name) headerCols.push({ id: 'name', label: 'Shot Name' })
  if (columns.status) headerCols.push({ id: 'status', label: 'Status' })
  if (columns.assigned) headerCols.push({ id: 'assigned', label: 'Assigned To' })
  if (columns.scene) headerCols.push({ id: 'scene', label: 'Scene' })
  customColumns.forEach(col => {
    if (columns['c_' + col.id]) headerCols.push({ id: 'c_' + col.id, label: col.label })
  })

  const statusCounts = {}
  shots.forEach(s => {
    const st = statuses.find(x => x.id === s.status_id)
    const name = st?.name || 'Unknown'
    statusCounts[name] = (statusCounts[name] || 0) + 1
  })

  const grouped = {}
  shots.forEach(s => {
    const sc = scenes.find(x => x.id === s.scene_id)
    const key = sc?.name || 'Unassigned'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  })

  const StatusPill = ({ shot }) => {
    const st = statuses.find(x => x.id === shot.status_id)
    if (!st) return <span style={{ color: T.text4, fontFamily: T.mono, fontSize: compact ? 9 : 10 }}>—</span>
    const sty = statusStyle(st.color, dark)
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 999, fontSize: compact ? 9 : 10,
        background: sty.bg, border: `1px solid ${sty.border}`, color: sty.color,
        fontFamily: T.mono, whiteSpace: 'nowrap',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: sty.dot, flexShrink: 0 }} />
        {st.name}
      </span>
    )
  }

  const AssignedCell = ({ shot }) => {
    const memberCol = customColumns.find(c => c.type === 'team')
    const userId = memberCol ? shot.custom_data?.[memberCol.name] : null
    const member = userId ? teamMembers.find(m => m.user_id === userId) : null
    const name = member ? (member.full_name || member.username || 'Unknown') : '—'
    if (name === '—') return <span style={{ color: T.text4, fontFamily: T.mono, fontSize: compact ? 10 : 11 }}>—</span>
    const initials = name.slice(0, 1).toUpperCase()
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.text2 }}>
        <div style={{
          width: compact ? 18 : 20, height: compact ? 18 : 20, borderRadius: '50%', flexShrink: 0,
          background: dark ? 'rgba(232,148,58,0.15)' : 'rgba(217,119,6,0.1)',
          border: `1px solid ${dark ? 'rgba(232,148,58,0.25)' : 'rgba(217,119,6,0.2)'}`,
          display: 'grid', placeItems: 'center',
          fontSize: 8, fontWeight: 600, fontFamily: T.mono, color: T.accent,
        }}>{initials}</div>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </div>
    )
  }

  const CustomCellValue = ({ shot, col }) => {
    const val = shot.custom_data?.[col.name]
    if (val == null || val === '') return <span style={{ color: T.text4, fontSize: compact ? 10 : 11 }}>—</span>

    if (col.type === 'checkbox') return (
      <div style={{
        width: 14, height: 14, borderRadius: 3,
        border: `1.5px solid ${val ? (dark ? '#4caf6e' : '#4caf50') : T.border2}`,
        background: val ? (dark ? 'rgba(76,175,110,0.15)' : 'rgba(76,175,80,0.1)') : 'transparent',
        display: 'grid', placeItems: 'center',
      }}>
        {val && (
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke={dark ? '#4caf6e' : '#4caf50'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l3.5 3.5L13 5" />
          </svg>
        )}
      </div>
    )

    if (col.type === 'select') {
      const vals = Array.isArray(val) ? val : [val]
      return (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {vals.map((v, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '1px 6px', borderRadius: 999, fontSize: compact ? 9 : 10,
              background: 'rgba(163,163,163,0.1)', border: '1px solid rgba(163,163,163,0.2)',
              color: T.text2, fontFamily: T.mono, whiteSpace: 'nowrap',
            }}>{v}</span>
          ))}
        </div>
      )
    }

    if (col.type === 'team') {
      const member = teamMembers.find(m => m.user_id === val)
      const name = member ? (member.full_name || member.username || 'Unknown') : val
      return <span style={{ color: T.text2, fontSize: compact ? 10 : 11 }}>{name}</span>
    }

    return <span style={{ color: T.text2, fontSize: compact ? 10 : 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</span>
  }

  const renderRow = (shot, idx) => {
    const thumbUrl = shot.linked_cloudflare_uid
      ? `https://videodelivery.net/${shot.linked_cloudflare_uid}/thumbnails/thumbnail.jpg`
      : null
    const sc = scenes.find(x => x.id === shot.scene_id)

    return (
      <div key={shot.id} style={{
        display: 'grid', gridTemplateColumns: gridCols.join(' '),
        alignItems: 'center', gap: 8,
        padding: compact ? '5px 14px' : '8px 14px',
        borderBottom: `1px solid ${T.border}`,
        background: idx % 2 === 1 ? T.altRow : 'transparent',
        fontSize: compact ? 11 : 12,
      }}>
        {showThumb && (
          <div style={{ width: thumbW, height: thumbH, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: T.headBg, border: `1px solid ${T.border}` }}>
            {thumbUrl
              ? <img src={thumbUrl} alt="" style={{ width: thumbW, height: thumbH, objectFit: 'cover', display: 'block' }} crossOrigin="anonymous" />
              : <div style={{ width: thumbW, height: thumbH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FilmSlate size={Math.round(thumbH * 0.35)} weight="duotone" style={{ color: T.text4 }} />
                </div>
            }
          </div>
        )}
        {columns.name && (
          <div style={{ fontWeight: 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shot.title || '—'}
          </div>
        )}
        {columns.status && <div><StatusPill shot={shot} /></div>}
        {columns.assigned && <AssignedCell shot={shot} />}
        {columns.scene && (
          <div style={{ fontFamily: T.mono, fontSize: compact ? 10 : 11, color: T.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sc?.name || '—'}
          </div>
        )}
        {customColumns.map(col => columns['c_' + col.id] ? (
          <div key={col.id}><CustomCellValue shot={shot} col={col} /></div>
        ) : null)}
      </div>
    )
  }

  const renderSceneGroup = (sceneName, sceneShots) => (
    <div key={sceneName}>
      <div style={{
        padding: compact ? '7px 14px' : '9px 14px',
        background: T.groupBg, borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 10, fontSize: compact ? 11 : 12,
      }}>
        <span style={{ fontWeight: 600, color: T.text }}>{sceneName}</span>
        <span style={{
          fontFamily: T.mono, fontSize: 10, color: T.accent,
          padding: '1px 7px', borderRadius: 999,
          background: T.accentSoft, border: `1px solid ${T.accentBorder}`,
        }}>{sceneShots.length}</span>
      </div>
      {sceneShots.map((shot, i) => renderRow(shot, i))}
    </div>
  )

  const activeColCount = Object.values(columns).filter(Boolean).length
  const pageCount = Math.max(1, Math.ceil(shots.length / (compact ? 20 : 12)))

  return (
    <div style={{
      background: T.bg, fontFamily: T.font, color: T.text,
      WebkitFontSmoothing: 'antialiased', padding: isPreview ? 0 : 32,
    }}>
      <div style={{
        background: T.card, borderRadius: isPreview ? 0 : 8,
        border: isPreview ? 'none' : `1px solid ${T.border}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        {includeHeader && (
          <div style={{
            padding: '20px 24px', borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', gap: 16,
            background: T.headBg,
          }}>
            <div style={{ flex: 1 }}>
              {clientName && (
                <div style={{
                  fontFamily: T.mono, fontSize: 9.5, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: T.text4, marginBottom: 4,
                }}>{clientName}</div>
              )}
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 6, color: T.text }}>
                {projectName || 'Untitled Project'}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: T.text3 }}>
                {mediaCount > 0 && <span>{mediaCount} media</span>}
                {mediaCount > 0 && memberCount > 0 && <span>·</span>}
                {memberCount > 0 && <span>{memberCount} members</span>}
              </div>
            </div>
            {includeLogo && (
              <img
                src="/logo.svg"
                alt="Eastape Studio"
                crossOrigin="anonymous"
                style={{ height: 18, width: 'auto', opacity: dark ? 1 : 0.85, filter: dark ? 'none' : 'brightness(0.3)' }}
                onError={e => { e.target.style.display = 'none' }}
              />
            )}
          </div>
        )}

        {/* Summary bar */}
        {includeSummary && (
          <div style={{
            padding: '12px 24px', borderBottom: `1px solid ${T.border}`,
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.text }}>
              {shots.length} shots
            </span>
            {Object.entries(statusCounts).map(([name, count]) => {
              const st = statuses.find(x => x.name === name)
              const sty = statusStyle(st?.color, dark)
              return (
                <span key={name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 10.5, fontFamily: T.mono, color: sty.color, fontWeight: 500,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: sty.dot }} />
                  {count} {name}
                </span>
              )
            })}
          </div>
        )}

        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols.join(' '),
          alignItems: 'center', gap: 8,
          padding: compact ? '7px 14px' : '9px 14px',
          borderBottom: `1px solid ${T.border2}`,
          background: T.headBg,
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: T.text4, fontWeight: 500,
        }}>
          {headerCols.map(col => (
            <span key={col.id}>{col.label}</span>
          ))}
        </div>

        {/* Rows */}
        {groupByScene
          ? Object.entries(grouped).map(([sc, scShots]) => renderSceneGroup(sc, scShots))
          : shots.map((shot, i) => renderRow(shot, i))
        }

        {/* Footer */}
        <div style={{
          padding: '12px 24px', borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: T.headBg, fontSize: 10, color: T.text4,
        }}>
          <span style={{ fontFamily: T.mono }}>
            {includeTimestamp && `Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · `}
            {exportName || 'Eastape Studio Export'}
          </span>
          <span style={{ fontFamily: T.mono }}>Page 1 of {pageCount}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Modal ───────────────────────────────────────────────────────────────
export default function ExportPdfModal({
  onClose,
  shots = [],
  scenes = [],
  statuses = [],
  columns = [],
  teamMembers = [],
  projectName = '',
  clientName = '',
  mediaCount = 0,
  memberCount = 0,
}) {
  const [step, setStep] = useState(0)
  const [exporting, setExporting] = useState(false)

  const defaultName = projectName ? `${projectName} — Shot Report` : 'Shot Report'
  const [exportName, setExportName] = useState(defaultName)
  const [includeHeader, setIncludeHeader] = useState(true)
  const [includeSummary, setIncludeSummary] = useState(true)
  const [includeTimestamp, setIncludeTimestamp] = useState(true)
  const [includeLogo, setIncludeLogo] = useState(true)
  const [groupByScene, setGroupByScene] = useState(true)
  const [pageSize, setPageSize] = useState('A4')
  const [orientation, setOrientation] = useState('landscape')
  const [pdfTheme, setPdfTheme] = useState('dark')
  const [density, setDensity] = useState('comfortable')
  const [thumbSize, setThumbSize] = useState('small')
  const [filterStatusId, setFilterStatusId] = useState('all')
  const [filterSceneId, setFilterSceneId] = useState('all')

  // column visibility map: built-in IDs + 'c_{col.id}' for custom
  const [colMap, setColMap] = useState(() => {
    const m = {}
    BUILT_IN_COLS.forEach(c => { m[c.id] = c.default })
    columns.forEach(c => { m['c_' + c.id] = true })
    return m
  })

  const previewRef = useRef(null)

  const customColumns = columns // project's custom columns

  const filteredShots = shots.filter(s => {
    if (filterStatusId !== 'all' && s.status_id !== filterStatusId) return false
    if (filterSceneId !== 'all' && s.scene_id !== filterSceneId) return false
    return true
  })

  const activeColCount = Object.values(colMap).filter(Boolean).length
  const pageCount = Math.max(1, Math.ceil(filteredShots.length / (density === 'compact' ? 20 : 12)))

  function toggleCol(id) {
    const bi = BUILT_IN_COLS.find(c => c.id === id)
    if (bi?.required) return
    setColMap(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleExport() {
    if (!previewRef.current) return
    setExporting(true)
    try {
      const [pw, ph] = PAGE_SIZES[pageSize]
      const pdf = new jsPDF({ orientation, unit: 'mm', format: [pw, ph] })
      const pdfW = orientation === 'landscape' ? pw : ph
      const pdfH = orientation === 'landscape' ? ph : pw

      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: pdfTheme === 'dark' ? '#0c0c0e' : '#ffffff',
        logging: false,
      })

      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const imgW = pdfW
      const imgH = (canvas.height * imgW) / canvas.width
      const pageH = pdfH

      let yOffset = 0
      let pageIndex = 0

      while (yOffset < imgH) {
        if (pageIndex > 0) pdf.addPage()
        const srcY = (yOffset / imgH) * canvas.height
        const srcH = Math.min((pageH / imgH) * canvas.height, canvas.height - srcY)
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = srcH
        const ctx = sliceCanvas.getContext('2d')
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92)
        const sliceH = (srcH / canvas.height) * imgH
        pdf.addImage(sliceData, 'JPEG', 0, 0, imgW, sliceH)
        yOffset += pageH
        pageIndex++
      }

      const fileName = (exportName || 'export').replace(/[^a-z0-9_\-. ]/gi, '_') + '.pdf'
      pdf.save(fileName)
    } catch (err) {
      console.error('PDF export failed:', err)
    }
    setExporting(false)
  }

  // ── Sub-components ───────────────────────────────────────────────────────
  const Toggle = ({ on, onClick, disabled }) => (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        width: 34, height: 18, borderRadius: 9,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? '#E8943A' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${on ? 'rgba(232,148,58,0.5)' : 'rgba(255,255,255,0.12)'}`,
        position: 'relative', transition: 'all 0.2s', flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        width: 12, height: 12, borderRadius: 6, background: '#fff',
        position: 'absolute', top: 2, left: on ? 18 : 2,
        transition: 'left 0.2s',
      }} />
    </div>
  )

  const RadioGroup = ({ options, value, onChange }) => (
    <div style={{
      display: 'flex', gap: 0,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 7, padding: 2,
    }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '5px 11px', fontSize: 11, borderRadius: 5, border: 'none',
            background: value === o.value ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: value === o.value ? '#ececee' : '#6f6f78',
            cursor: 'pointer', fontWeight: value === o.value ? 500 : 400,
            transition: 'all 0.15s', fontFamily: 'inherit',
          }}
        >{o.label}</button>
      ))}
    </div>
  )

  const sectionStyle = {
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
    marginBottom: 12,
    overflow: 'hidden',
  }
  const sectionHead = {
    padding: '9px 13px', fontSize: 10, fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.07em',
    color: '#4a4a52', borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.2)',
  }
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '9px 13px', borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: 12.5,
  }
  const lastRowStyle = { ...rowStyle, borderBottom: 'none' }
  const labelStyle = { flex: 1, color: '#a4a4ac', fontSize: 12.5 }

  const inputStyle = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 7, padding: '7px 10px', fontSize: 12.5,
    color: '#ececee', outline: 'none', width: '100%',
    fontFamily: 'inherit',
  }
  const selectStyle = {
    ...inputStyle, width: 'auto', minWidth: 120, cursor: 'pointer',
    paddingRight: 28,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,4,6,0.75)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 40, paddingBottom: 40, overflow: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 720, maxWidth: '95vw',
          background: '#0f0f14', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 80px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div style={{
          padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 13, flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'rgba(232,148,58,0.12)', border: '1px solid rgba(232,148,58,0.25)',
            display: 'grid', placeItems: 'center', color: '#E8943A', flexShrink: 0,
          }}>
            <DownloadSimple size={16} weight="duotone" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: '#ececee' }}>Export as PDF</div>
            <div style={{ fontSize: 11.5, color: '#6f6f78', marginTop: 1 }}>Configure columns, layout, and page settings</div>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {['Settings', 'Preview'].map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.1)' }} />}
                <div
                  onClick={() => { if (i === 1 && filteredShots.length > 0) setStep(1); else if (i === 0) setStep(0) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
                    background: step === i ? 'rgba(255,255,255,0.07)' : 'transparent',
                    border: `1px solid ${step === i ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, fontSize: 10, fontWeight: 600,
                    display: 'grid', placeItems: 'center', fontFamily: "'JetBrains Mono', monospace",
                    background: step === i ? '#E8943A' : 'rgba(255,255,255,0.06)',
                    color: step === i ? '#1a0f04' : '#6f6f78',
                  }}>{i + 1}</div>
                  <span style={{ fontSize: 11.5, color: step === i ? '#ececee' : '#6f6f78' }}>{s}</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'rgba(255,255,255,0.06)', color: '#6f6f78',
              display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {step === 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
              {/* LEFT */}
              <div>
                {/* Document name */}
                <div style={sectionStyle}>
                  <div style={sectionHead}>Document</div>
                  <div style={{ padding: '10px 13px 13px' }}>
                    <div style={{ fontSize: 11.5, color: '#6f6f78', marginBottom: 6 }}>Export name</div>
                    <input
                      style={inputStyle}
                      value={exportName}
                      onChange={e => setExportName(e.target.value)}
                      placeholder="Enter export name…"
                    />
                  </div>
                </div>

                {/* Header & Details */}
                <div style={sectionStyle}>
                  <div style={sectionHead}>Header &amp; Details</div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Project header</span>
                    <Toggle on={includeHeader} onClick={() => setIncludeHeader(v => !v)} />
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Status summary bar</span>
                    <Toggle on={includeSummary} onClick={() => setIncludeSummary(v => !v)} />
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Logo</span>
                    <Toggle on={includeLogo} onClick={() => setIncludeLogo(v => !v)} />
                  </div>
                  <div style={lastRowStyle}>
                    <span style={labelStyle}>Export timestamp</span>
                    <Toggle on={includeTimestamp} onClick={() => setIncludeTimestamp(v => !v)} />
                  </div>
                </div>

                {/* Columns */}
                <div style={sectionStyle}>
                  <div style={{ ...sectionHead, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Columns</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#6f6f78', textTransform: 'none', letterSpacing: 0 }}>
                      {activeColCount} selected
                    </span>
                  </div>
                  {BUILT_IN_COLS.map((col, i) => (
                    <div
                      key={col.id}
                      style={i === BUILT_IN_COLS.length - 1 && customColumns.length === 0 ? lastRowStyle : rowStyle}
                    >
                      <span style={{
                        ...labelStyle,
                        color: col.required ? '#ececee' : colMap[col.id] ? '#a4a4ac' : '#4a4a52',
                      }}>
                        {col.label}
                        {col.required && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#E8943A', letterSpacing: '0.04em' }}>REQUIRED</span>
                        )}
                      </span>
                      <Toggle on={colMap[col.id]} onClick={() => toggleCol(col.id)} disabled={col.required} />
                    </div>
                  ))}
                  {customColumns.map((col, i) => (
                    <div key={col.id} style={i === customColumns.length - 1 ? lastRowStyle : rowStyle}>
                      <span style={{ ...labelStyle, color: colMap['c_' + col.id] ? '#a4a4ac' : '#4a4a52' }}>
                        {col.label}
                      </span>
                      <Toggle on={colMap['c_' + col.id]} onClick={() => toggleCol('c_' + col.id)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT */}
              <div>
                {/* Page settings */}
                <div style={sectionStyle}>
                  <div style={sectionHead}>Page Settings</div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Size</span>
                    <RadioGroup
                      value={pageSize} onChange={setPageSize}
                      options={[{ label: 'A4', value: 'A4' }, { label: 'Letter', value: 'Letter' }, { label: 'A3', value: 'A3' }]}
                    />
                  </div>
                  <div style={lastRowStyle}>
                    <span style={labelStyle}>Orientation</span>
                    <RadioGroup
                      value={orientation} onChange={setOrientation}
                      options={[{ label: 'Landscape', value: 'landscape' }, { label: 'Portrait', value: 'portrait' }]}
                    />
                  </div>
                </div>

                {/* Layout */}
                <div style={sectionStyle}>
                  <div style={sectionHead}>Layout</div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Theme</span>
                    <RadioGroup
                      value={pdfTheme} onChange={setPdfTheme}
                      options={[{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }]}
                    />
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Density</span>
                    <RadioGroup
                      value={density} onChange={setDensity}
                      options={[{ label: 'Comfortable', value: 'comfortable' }, { label: 'Compact', value: 'compact' }]}
                    />
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Thumbnails</span>
                    <RadioGroup
                      value={thumbSize} onChange={setThumbSize}
                      options={[{ label: 'Off', value: 'off' }, { label: 'Small', value: 'small' }, { label: 'Medium', value: 'medium' }]}
                    />
                  </div>
                  <div style={lastRowStyle}>
                    <span style={labelStyle}>Group by scene</span>
                    <Toggle on={groupByScene} onClick={() => setGroupByScene(v => !v)} />
                  </div>
                </div>

                {/* Filter */}
                <div style={sectionStyle}>
                  <div style={sectionHead}>Filter</div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Status</span>
                    <select
                      style={selectStyle}
                      value={filterStatusId}
                      onChange={e => setFilterStatusId(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={lastRowStyle}>
                    <span style={labelStyle}>Scene</span>
                    <select
                      style={selectStyle}
                      value={filterSceneId}
                      onChange={e => setFilterSceneId(e.target.value)}
                    >
                      <option value="all">All scenes</option>
                      {scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Export summary */}
                <div style={{
                  border: '1px solid rgba(232,148,58,0.25)', borderRadius: 10,
                  background: 'rgba(232,148,58,0.06)', padding: 14,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#E8943A', marginBottom: 10 }}>
                    Export summary
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      ['Shots', filteredShots.length],
                      ['Columns', activeColCount],
                      ['Pages', `~${pageCount}`],
                      ['Format', `${pageSize} ${orientation === 'landscape' ? 'L' : 'P'}`],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                        <span style={{ color: '#6f6f78' }}>{l}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: '#ececee' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Step 2: Preview */
            <div>
              <div style={{
                fontSize: 11, color: '#6f6f78', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Eye size={13} />
                Preview of first page — {filteredShots.length} shots across ~{pageCount} pages
              </div>
              <div style={{
                borderRadius: 8, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
              }}>
                <div ref={previewRef}>
                  <PDFPreview
                    shots={filteredShots}
                    statuses={statuses}
                    scenes={scenes}
                    columns={colMap}
                    customColumns={customColumns}
                    teamMembers={teamMembers}
                    theme={pdfTheme}
                    density={density}
                    thumbSize={thumbSize}
                    groupByScene={groupByScene}
                    includeHeader={includeHeader}
                    includeSummary={includeSummary}
                    includeTimestamp={includeTimestamp}
                    includeLogo={includeLogo}
                    exportName={exportName}
                    projectName={projectName}
                    clientName={clientName}
                    mediaCount={mediaCount}
                    memberCount={memberCount}
                    isPreview
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,0,0,0.2)', flexShrink: 0,
        }}>
          {step === 1 && (
            <button
              onClick={() => setStep(0)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: '#a4a4ac',
                fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <CaretLeft size={12} /> Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: '#a4a4ac',
              fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Cancel</button>
          {step === 0 ? (
            <button
              onClick={() => setStep(1)}
              disabled={filteredShots.length === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 7, border: 'none',
                background: filteredShots.length === 0 ? 'rgba(232,148,58,0.3)' : '#E8943A',
                color: filteredShots.length === 0 ? 'rgba(255,255,255,0.4)' : '#1a0f04',
                fontSize: 12.5, fontWeight: 600, cursor: filteredShots.length === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Preview <CaretRight size={12} />
            </button>
          ) : (
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 7, border: 'none',
                background: exporting ? 'rgba(232,148,58,0.5)' : '#E8943A',
                color: '#1a0f04', fontSize: 12.5, fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              <DownloadSimple size={13} />
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
