import React, { useState, useRef } from 'react'
import { X, DownloadSimple, Eye, CaretLeft, CaretRight, FilmSlate } from '@phosphor-icons/react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ── Constants ────────────────────────────────────────────────────────────────
const PAGE_MM = { A4: [297, 210], Letter: [279, 216], A3: [420, 297] }
const EXPORT_W = 840 // CSS px; captured at scale:2 → 1680px image

const BUILT_IN_COLS = [
  { id: 'thumb',    label: 'Thumbnail',   dflt: true  },
  { id: 'name',     label: 'Shot Name',   dflt: true,  required: true },
  { id: 'status',   label: 'Status',      dflt: true  },
  { id: 'assigned', label: 'Assigned To', dflt: true  },
  { id: 'scene',    label: 'Scene',       dflt: false },
]

// ── Pure helpers ─────────────────────────────────────────────────────────────
function getPageH(pageSize, orientation, w = EXPORT_W) {
  const [pw, ph] = PAGE_MM[pageSize]
  const [lw, lh] = orientation === 'landscape' ? [pw, ph] : [ph, pw]
  return Math.round(w * lh / lw)
}

function thumbDims(thumbSize, density) {
  const c = density === 'compact'
  if (thumbSize === 'small')  return { w: c ? 42 : 50,  h: c ? 26 : 32 }
  if (thumbSize === 'medium') return { w: c ? 64 : 76,  h: c ? 38 : 46 }
  if (thumbSize === 'large')  return { w: c ? 90 : 108, h: c ? 54 : 66 }
  return { w: 0, h: 0 }
}

function rowH(thumbSize, density) {
  const { h } = thumbDims(thumbSize, density)
  const pad = density === 'compact' ? 10 : 16
  return Math.max(20, h) + pad
}

function sStyle(color, dark) {
  const c = color || (dark ? '#a4a4ac' : '#9ca3af')
  return { bg: c + '22', border: c + '55', color: c, dot: c }
}

function tok(dark) {
  return dark ? {
    bg: '#0c0c0e', card: '#111114', headBg: '#08080a',
    bdr: 'rgba(255,255,255,0.07)', bdr2: 'rgba(255,255,255,0.11)',
    t1: '#ececee', t2: '#a4a4ac', t3: '#6f6f78', t4: '#4a4a52',
    acc: '#E8943A', accSoft: 'rgba(232,148,58,0.14)', accBdr: 'rgba(232,148,58,0.25)',
    alt: 'rgba(255,255,255,0.015)', grpBg: '#0a0a0c',
    mono: "'JetBrains Mono',ui-monospace,monospace",
    font: "'Inter',system-ui,sans-serif",
  } : {
    bg: '#ffffff', card: '#ffffff', headBg: '#fafafa',
    bdr: '#e8e8ec', bdr2: '#d4d4d8',
    t1: '#18181b', t2: '#52525b', t3: '#a1a1aa', t4: '#d4d4d8',
    acc: '#d97706', accSoft: 'rgba(217,119,6,0.08)', accBdr: 'rgba(217,119,6,0.2)',
    alt: '#fafafa', grpBg: '#f0f0f3',
    mono: "'JetBrains Mono',ui-monospace,monospace",
    font: "'Inter',system-ui,sans-serif",
  }
}

// ── Pagination ───────────────────────────────────────────────────────────────
function paginate(shots, scenes, cfg) {
  const { thumbSize, density, pageSize, orientation,
    includeHeader, includeSummary, titleText, subtitleText, groupByScene } = cfg

  const rH      = rowH(thumbSize, density)
  const gHdr    = density === 'compact' ? 27 : 33
  const tblHdr  = density === 'compact' ? 30 : 37
  const ftH     = 40
  const pageH   = getPageH(pageSize, orientation, EXPORT_W)

  let topH = tblHdr + ftH
  if (includeHeader)           topH += 76
  if (titleText || subtitleText) topH += 64
  if (includeSummary)          topH += 44

  const firstAvail  = Math.max(rH, pageH - topH)
  const subseqAvail = Math.max(rH, pageH - tblHdr - ftH)

  // Build flat item list
  const flat = []
  if (groupByScene) {
    const grps = []
    const seen = {}
    shots.forEach(s => {
      const sc = scenes.find(x => x.id === s.scene_id)
      const key  = sc?.id  || '__none'
      const name = sc?.name || 'Unassigned'
      if (!seen[key]) { seen[key] = true; grps.push({ key, name, shots: [] }) }
      grps.find(g => g.key === key).shots.push(s)
    })
    grps.forEach(g => {
      flat.push({ type: 'group', name: g.name, count: g.shots.length })
      g.shots.forEach(s => flat.push({ type: 'shot', shot: s }))
    })
  } else {
    shots.forEach(s => flat.push({ type: 'shot', shot: s }))
  }

  if (!flat.length) return [{ items: [], pageNum: 1, totalPages: 1, isFirst: true }]

  const pages = []
  let cur = [], curH = 0

  flat.forEach(item => {
    const avail = pages.length === 0 ? firstAvail : subseqAvail
    const iH    = item.type === 'group' ? gHdr : rH
    if (curH + iH > avail && cur.length > 0) {
      pages.push(cur); cur = []; curH = 0
    }
    cur.push(item); curH += iH
  })
  if (cur.length > 0) pages.push(cur)
  if (!pages.length) pages.push([])

  const total = pages.length
  return pages.map((items, i) => ({ items, pageNum: i + 1, totalPages: total, isFirst: i === 0 }))
}

// ── Single PDF Page ──────────────────────────────────────────────────────────
function PDFPage({ pageData, allShots, statuses, scenes, customCols, teamMembers, colMap, cfg, pw, ph }) {
  const {
    theme, density, thumbSize,
    includeHeader, includeSummary, includeTimestamp, includeLogo,
    exportName, projectName, clientName, mediaCount, memberCount,
    titleText, subtitleText, titleAlign,
    rowBorders, pageBorderStyle,
  } = cfg

  const dark    = theme === 'dark'
  const compact = density === 'compact'
  const T       = tok(dark)
  const td      = thumbDims(thumbSize, density)
  const showTh  = thumbSize !== 'off' && colMap.thumb

  // Build CSS grid
  const parts = []
  if (showTh) parts.push(`${td.w + 10}px`)
  if (colMap.name)     parts.push('2fr')
  if (colMap.status)   parts.push('1.15fr')
  if (colMap.assigned) parts.push('1.15fr')
  if (colMap.scene)    parts.push('1.15fr')
  customCols.forEach(c => { if (colMap['c_' + c.id]) parts.push('1fr') })
  const grid = parts.join(' ') || '1fr'

  // Table header labels
  const hdrCols = []
  if (showTh)          hdrCols.push({ id: '_t', lbl: '' })
  if (colMap.name)     hdrCols.push({ id: 'name',     lbl: 'Shot Name'   })
  if (colMap.status)   hdrCols.push({ id: 'status',   lbl: 'Status'      })
  if (colMap.assigned) hdrCols.push({ id: 'assigned', lbl: 'Assigned To' })
  if (colMap.scene)    hdrCols.push({ id: 'scene',    lbl: 'Scene'       })
  customCols.forEach(c => { if (colMap['c_' + c.id]) hdrCols.push({ id: 'c_' + c.id, lbl: c.name || '' }) })

  // Status counts for summary
  const stCounts = {}
  allShots.forEach(s => {
    const st = statuses.find(x => x.id === s.status_id)
    const n = st?.name || 'Unknown'
    stCounts[n] = (stCounts[n] || 0) + 1
  })

  const rPad    = compact ? '5px 14px' : '8px 14px'
  const rBorder = rowBorders ? `1px solid ${T.bdr}` : '1px solid transparent'

  // Cell sub-components (inline for simplicity)
  const StatusPill = ({ shot }) => {
    const st = statuses.find(x => x.id === shot.status_id)
    if (!st) return <span style={{ color: T.t4, fontFamily: T.mono, fontSize: compact ? 9 : 10 }}>—</span>
    const s = sStyle(st.color, dark)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: compact ? 9 : 10, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
        {st.name}
      </span>
    )
  }

  const MemberCell = ({ shot }) => {
    const mc  = customCols.find(c => c.type === 'team')
    const uid = mc ? shot.custom_data?.[mc.name] : null
    const m   = uid ? teamMembers.find(x => x.user_id === uid) : null
    const nm  = m ? (m.full_name || m.username || 'Unknown') : null
    if (!nm) return <span style={{ color: T.t4, fontFamily: T.mono, fontSize: 10 }}>—</span>
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.t2 }}>
        <div style={{ width: compact ? 18 : 20, height: compact ? 18 : 20, borderRadius: '50%', flexShrink: 0, background: dark ? 'rgba(232,148,58,0.15)' : 'rgba(217,119,6,0.1)', border: `1px solid ${T.accBdr}`, display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 700, fontFamily: T.mono, color: T.acc }}>
          {nm[0].toUpperCase()}
        </div>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</span>
      </div>
    )
  }

  const CellVal = ({ shot, col }) => {
    const val = shot.custom_data?.[col.name]
    if (val == null || val === '') return <span style={{ color: T.t4, fontSize: compact ? 10 : 11 }}>—</span>
    if (col.type === 'checkbox') return (
      <div style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${val ? T.acc : T.bdr2}`, background: val ? T.accSoft : 'transparent', display: 'grid', placeItems: 'center' }}>
        {val && <svg width="7" height="7" viewBox="0 0 14 14" fill="none" stroke={T.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l3 3 7-6"/></svg>}
      </div>
    )
    if (col.type === 'select') {
      const vals = Array.isArray(val) ? val : [val]
      return <div style={{ display: 'flex', gap: 3 }}>{vals.map((v, i) => <span key={i} style={{ padding: '1px 6px', borderRadius: 999, fontSize: compact ? 9 : 10, background: dark ? 'rgba(163,163,163,0.1)' : '#f3f4f6', border: `1px solid ${dark ? 'rgba(163,163,163,0.2)' : '#e5e7eb'}`, color: T.t2, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{v}</span>)}</div>
    }
    if (col.type === 'team') {
      const m = teamMembers.find(x => x.user_id === val)
      return <span style={{ color: T.t2, fontSize: compact ? 10 : 11 }}>{m ? (m.full_name || m.username || val) : val}</span>
    }
    return <span style={{ color: T.t2, fontSize: compact ? 10 : 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</span>
  }

  let rowIdx = 0
  const rows = pageData.items.map((item, i) => {
    if (item.type === 'group') {
      return (
        <div key={'g' + i} style={{ padding: compact ? '7px 14px' : '9px 14px', background: T.grpBg, borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: compact ? 11 : 12 }}>
          <span style={{ fontWeight: 600, color: T.t1 }}>{item.name}</span>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.acc, padding: '1px 7px', borderRadius: 999, background: T.accSoft, border: `1px solid ${T.accBdr}` }}>{item.count}</span>
        </div>
      )
    }
    const shot   = item.shot
    const tUrl   = shot.linked_cloudflare_uid ? `https://videodelivery.net/${shot.linked_cloudflare_uid}/thumbnails/thumbnail.jpg` : null
    const sc     = scenes.find(x => x.id === shot.scene_id)
    const ri     = rowIdx++
    return (
      <div key={shot.id || i} style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center', gap: 8, padding: rPad, fontSize: compact ? 11 : 12, borderBottom: rBorder, background: ri % 2 === 1 ? T.alt : 'transparent' }}>
        {showTh && (
          <div style={{ width: td.w, height: td.h, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: T.headBg, border: `1px solid ${T.bdr}` }}>
            {tUrl
              ? <img src={tUrl} alt="" style={{ width: td.w, height: td.h, objectFit: 'cover', display: 'block' }} crossOrigin="anonymous" />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FilmSlate size={Math.round(td.h * 0.4)} weight="duotone" style={{ color: T.t4 }} /></div>
            }
          </div>
        )}
        {colMap.name     && <div style={{ fontWeight: 500, color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.title || '—'}</div>}
        {colMap.status   && <div><StatusPill shot={shot} /></div>}
        {colMap.assigned && <MemberCell shot={shot} />}
        {colMap.scene    && <div style={{ fontFamily: T.mono, fontSize: compact ? 10 : 11, color: T.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc?.name || '—'}</div>}
        {customCols.map(col => colMap['c_' + col.id] ? <div key={col.id}><CellVal shot={shot} col={col} /></div> : null)}
      </div>
    )
  })

  // Page border overlay
  const bdrMap = { thin: `1px solid ${T.bdr2}`, medium: `2px solid ${T.bdr2}`, none: 'none' }
  const outerBdr = bdrMap[pageBorderStyle] || 'none'

  return (
    <div style={{
      width: pw, height: ph, background: T.bg, fontFamily: T.font, color: T.t1,
      WebkitFontSmoothing: 'antialiased', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', boxSizing: 'border-box',
      border: outerBdr, position: 'relative',
    }}>
      {/* Project header — first page only */}
      {pageData.isFirst && includeHeader && (
        <div style={{ padding: '15px 22px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', gap: 16, background: T.headBg, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            {clientName && <div style={{ fontFamily: T.mono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.t4, marginBottom: 3 }}>{clientName}</div>}
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em', color: T.t1, marginBottom: 4 }}>{projectName || 'Untitled Project'}</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.t3 }}>
              {mediaCount > 0 && <span>{mediaCount} media</span>}
              {mediaCount > 0 && memberCount > 0 && <span style={{ color: T.t4 }}>·</span>}
              {memberCount > 0 && <span>{memberCount} members</span>}
            </div>
          </div>
          {includeLogo && (
            <img src="/logo.svg" alt="" crossOrigin="anonymous"
              style={{ height: 16, width: 'auto', opacity: dark ? 1 : 0.8, filter: dark ? 'none' : 'brightness(0.3)' }}
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
        </div>
      )}

      {/* Title / subtitle — first page only */}
      {pageData.isFirst && (titleText || subtitleText) && (
        <div style={{ padding: '13px 22px', borderBottom: `1px solid ${T.bdr}`, background: T.card, flexShrink: 0, textAlign: titleAlign || 'left' }}>
          {titleText   && <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginBottom: subtitleText ? 4 : 0 }}>{titleText}</div>}
          {subtitleText && <div style={{ fontSize: 11.5, color: T.t3 }}>{subtitleText}</div>}
        </div>
      )}

      {/* Summary bar — first page only */}
      {pageData.isFirst && includeSummary && (
        <div style={{ padding: '9px 22px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.t1 }}>{allShots.length} shots</span>
          {Object.entries(stCounts).map(([name, count]) => {
            const st = statuses.find(x => x.name === name)
            const s  = sStyle(st?.color, dark)
            return (
              <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: T.mono, color: s.color, fontWeight: 500 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />{count} {name}
              </span>
            )
          })}
        </div>
      )}

      {/* Table header — every page */}
      <div style={{ display: 'grid', gridTemplateColumns: grid, alignItems: 'center', gap: 8, padding: compact ? '7px 14px' : '9px 14px', borderBottom: `1px solid ${T.bdr2}`, background: T.headBg, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.t4, fontWeight: 600, flexShrink: 0 }}>
        {hdrCols.map(col => <span key={col.id}>{col.lbl}</span>)}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflow: 'hidden' }}>{rows}</div>

      {/* Footer — every page */}
      <div style={{ padding: '9px 22px', borderTop: `1px solid ${T.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.headBg, fontSize: 10, color: T.t4, flexShrink: 0 }}>
        <span style={{ fontFamily: T.mono }}>
          {includeTimestamp ? `Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · ` : ''}
          {exportName || 'Eastape Studio Export'}
        </span>
        <span style={{ fontFamily: T.mono, fontWeight: 600 }}>{pageData.pageNum} / {pageData.totalPages}</span>
      </div>
    </div>
  )
}

// ── Main Modal ───────────────────────────────────────────────────────────────
export default function ExportPdfModal({
  onClose, shots = [], scenes = [], statuses = [], columns = [],
  teamMembers = [], projectName = '', clientName = '',
  mediaCount = 0, memberCount = 0,
}) {
  const defaultName = projectName ? `${projectName} — Shot Report` : 'Shot Report'

  const [step,           setStep]           = useState(0)
  const [exporting,      setExporting]      = useState(false)
  const [previewPageIdx, setPreviewPageIdx] = useState(0)
  const [capturePageData, setCapturePageData] = useState(null)
  const captureRef = useRef(null)

  const [exportName,       setExportName]       = useState(defaultName)
  const [titleText,        setTitleText]        = useState('')
  const [subtitleText,     setSubtitleText]     = useState('')
  const [titleAlign,       setTitleAlign]       = useState('left')
  const [includeHeader,    setIncludeHeader]    = useState(true)
  const [includeSummary,   setIncludeSummary]   = useState(true)
  const [includeTimestamp, setIncludeTimestamp] = useState(true)
  const [includeLogo,      setIncludeLogo]      = useState(true)
  const [groupByScene,     setGroupByScene]     = useState(true)
  const [pageSize,         setPageSize]         = useState('A4')
  const [orientation,      setOrientation]      = useState('landscape')
  const [pdfTheme,         setPdfTheme]         = useState('dark')
  const [density,          setDensity]          = useState('comfortable')
  const [thumbSize,        setThumbSize]        = useState('small')
  const [rowBorders,       setRowBorders]       = useState(true)
  const [pageBorderStyle,  setPageBorderStyle]  = useState('thin')
  const [filterStatusId,   setFilterStatusId]   = useState('all')
  const [filterSceneId,    setFilterSceneId]    = useState('all')

  const [colMap, setColMap] = useState(() => {
    const m = {}
    BUILT_IN_COLS.forEach(c => { m[c.id]         = c.dflt })
    columns.forEach(c =>       { m['c_' + c.id]  = true   })
    return m
  })

  const filteredShots = shots.filter(s => {
    if (filterStatusId !== 'all' && s.status_id !== filterStatusId) return false
    if (filterSceneId  !== 'all' && s.scene_id  !== filterSceneId)  return false
    return true
  })

  const cfg = {
    theme: pdfTheme, density, thumbSize, groupByScene,
    includeHeader, includeSummary, includeTimestamp, includeLogo,
    exportName, projectName, clientName, mediaCount, memberCount,
    titleText, subtitleText, titleAlign,
    rowBorders, pageBorderStyle,
  }

  const pages = paginate(filteredShots, scenes, cfg)
  const exportPageH = getPageH(pageSize, orientation, EXPORT_W)

  const activeColCount = Object.values(colMap).filter(Boolean).length

  function toggleCol(id) {
    const bi = BUILT_IN_COLS.find(c => c.id === id)
    if (bi?.required) return
    setColMap(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const wait = ms => new Promise(r => setTimeout(r, ms))

  async function handleExport() {
    setExporting(true)
    await wait(50) // let React flush setExporting before we take control

    try {
      const [pw, ph] = PAGE_MM[pageSize]
      const [lw, lh] = orientation === 'landscape' ? [pw, ph] : [ph, pw]
      const pdf = new jsPDF({ orientation, unit: 'mm', format: [lw, lh] })

      for (let i = 0; i < pages.length; i++) {
        setCapturePageData(pages[i])
        await wait(150) // wait for React to render the page into captureRef

        if (!captureRef.current) continue
        if (i > 0) pdf.addPage()

        const canvas = await html2canvas(captureRef.current, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: pdfTheme === 'dark' ? '#0c0c0e' : '#ffffff',
          logging: false,
          width: EXPORT_W,
          height: exportPageH,
        })
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, lw, lh)
      }

      const fname = (exportName || 'export').replace(/[^a-z0-9_\-. ]/gi, '_') + '.pdf'
      pdf.save(fname)
    } catch (err) {
      console.error('PDF export failed:', err)
    }
    setCapturePageData(null)
    setExporting(false)
  }

  // ── UI sub-components ──────────────────────────────────────────────────────
  const Toggle = ({ on, onClick, disabled }) => (
    <div onClick={disabled ? undefined : onClick} style={{
      width: 34, height: 18, borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
      background: on ? '#E8943A' : 'rgba(255,255,255,0.08)',
      border: `1px solid ${on ? 'rgba(232,148,58,0.5)' : 'rgba(255,255,255,0.12)'}`,
      position: 'relative', transition: 'all 0.2s', flexShrink: 0,
      opacity: disabled ? 0.4 : 1,
    }}>
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#fff', position: 'absolute', top: 2, left: on ? 18 : 2, transition: 'left 0.2s' }} />
    </div>
  )

  const RadioGroup = ({ opts, value, onChange, small }) => (
    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: 2 }}>
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          padding: small ? '4px 9px' : '5px 11px',
          fontSize: small ? 10.5 : 11, borderRadius: 5, border: 'none',
          background: value === o.v ? 'rgba(255,255,255,0.1)' : 'transparent',
          color: value === o.v ? '#ececee' : '#6f6f78',
          cursor: 'pointer', fontWeight: value === o.v ? 500 : 400,
          transition: 'all 0.15s', fontFamily: 'inherit',
        }}>{o.l}</button>
      ))}
    </div>
  )

  const sec   = { border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, background: 'rgba(255,255,255,0.02)', marginBottom: 12, overflow: 'hidden' }
  const sHead = { padding: '9px 13px', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4a4a52', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }
  const sRow  = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12.5 }
  const sLast = { ...sRow, borderBottom: 'none' }
  const lbl   = { flex: 1, color: '#a4a4ac', fontSize: 12.5 }
  const inp   = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '7px 10px', fontSize: 12.5, color: '#ececee', outline: 'none', width: '100%', fontFamily: 'inherit' }
  const sel   = { ...inp, width: 'auto', minWidth: 130, cursor: 'pointer', paddingRight: 26 }

  // Preview dimensions
  const previewW = 668
  const previewH = Math.round(getPageH(pageSize, orientation, EXPORT_W) * (previewW / EXPORT_W))
  const previewScale = previewW / EXPORT_W
  const curPage = pages[Math.min(previewPageIdx, pages.length - 1)]

  return (
    <>
      {/* ── Single-page capture div — only mounted during export ── */}
      {capturePageData && (
        <div style={{ position: 'fixed', left: -99999, top: 0, zIndex: -1, pointerEvents: 'none' }}>
          <div ref={captureRef}>
            <PDFPage
              pageData={capturePageData}
              allShots={filteredShots}
              statuses={statuses}
              scenes={scenes}
              customCols={columns}
              teamMembers={teamMembers}
              colMap={colMap}
              cfg={cfg}
              pw={EXPORT_W}
              ph={exportPageH}
            />
          </div>
        </div>
      )}

      {/* ── Modal overlay ── */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,4,6,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, paddingBottom: 40, overflow: 'auto' }}
        onClick={onClose}
      >
        <div
          style={{ width: 730, maxWidth: '95vw', background: '#0f0f14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px rgba(0,0,0,0.8)', overflow: 'hidden', maxHeight: 'calc(100vh - 80px)' }}
          onClick={e => e.stopPropagation()}
        >

          {/* ── Header ── */}
          <div style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 13, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(232,148,58,0.12)', border: '1px solid rgba(232,148,58,0.25)', display: 'grid', placeItems: 'center', color: '#E8943A', flexShrink: 0 }}>
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
                    onClick={() => { if (i === 0 || filteredShots.length > 0) { setStep(i); setPreviewPageIdx(0) } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 10px', borderRadius: 6, background: step === i ? 'rgba(255,255,255,0.07)' : 'transparent', border: `1px solid ${step === i ? 'rgba(255,255,255,0.1)' : 'transparent'}` }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, fontSize: 10, fontWeight: 600, display: 'grid', placeItems: 'center', fontFamily: "'JetBrains Mono',monospace", background: step === i ? '#E8943A' : 'rgba(255,255,255,0.06)', color: step === i ? '#1a0f04' : '#6f6f78' }}>{i + 1}</div>
                    <span style={{ fontSize: 11.5, color: step === i ? '#ececee' : '#6f6f78' }}>{s}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#6f6f78', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

            {/* ══ STEP 0: SETTINGS ══ */}
            {step === 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>

                {/* LEFT */}
                <div>
                  {/* Document */}
                  <div style={sec}>
                    <div style={sHead}>Document</div>
                    <div style={{ padding: '10px 13px 13px' }}>
                      <div style={{ fontSize: 11, color: '#6f6f78', marginBottom: 5 }}>Export name</div>
                      <input style={inp} value={exportName} onChange={e => setExportName(e.target.value)} placeholder="e.g. Chardikala — Shot Report" />
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <div style={sec}>
                    <div style={{ ...sHead, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Title Block</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: '#6f6f78', textTransform: 'none', letterSpacing: 0 }}>shows below header</span>
                    </div>
                    <div style={{ padding: '10px 13px 0' }}>
                      <div style={{ fontSize: 11, color: '#6f6f78', marginBottom: 5 }}>Title</div>
                      <input style={{ ...inp, marginBottom: 10 }} value={titleText} onChange={e => setTitleText(e.target.value)} placeholder="Optional title…" />
                      <div style={{ fontSize: 11, color: '#6f6f78', marginBottom: 5 }}>Subtitle</div>
                      <input style={{ ...inp, marginBottom: 10 }} value={subtitleText} onChange={e => setSubtitleText(e.target.value)} placeholder="Optional subtitle…" />
                    </div>
                    <div style={sLast}>
                      <span style={lbl}>Alignment</span>
                      <RadioGroup opts={[{ l: 'Left', v: 'left' }, { l: 'Center', v: 'center' }, { l: 'Right', v: 'right' }]} value={titleAlign} onChange={setTitleAlign} small />
                    </div>
                  </div>

                  {/* Header & Details */}
                  <div style={sec}>
                    <div style={sHead}>Header &amp; Details</div>
                    <div style={sRow}><span style={lbl}>Project header</span><Toggle on={includeHeader} onClick={() => setIncludeHeader(v => !v)} /></div>
                    <div style={sRow}><span style={lbl}>Status summary bar</span><Toggle on={includeSummary} onClick={() => setIncludeSummary(v => !v)} /></div>
                    <div style={sRow}><span style={lbl}>Logo</span><Toggle on={includeLogo} onClick={() => setIncludeLogo(v => !v)} /></div>
                    <div style={sLast}><span style={lbl}>Export timestamp</span><Toggle on={includeTimestamp} onClick={() => setIncludeTimestamp(v => !v)} /></div>
                  </div>

                  {/* Columns */}
                  <div style={sec}>
                    <div style={{ ...sHead, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Columns</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: '#6f6f78', textTransform: 'none', letterSpacing: 0 }}>{activeColCount} selected</span>
                    </div>
                    {BUILT_IN_COLS.map((col, i) => (
                      <div key={col.id} style={i === BUILT_IN_COLS.length - 1 && columns.length === 0 ? sLast : sRow}>
                        <span style={{ ...lbl, color: col.required ? '#ececee' : colMap[col.id] ? '#c0c0c8' : '#6f6f78' }}>
                          {col.label}
                          {col.required && <span style={{ marginLeft: 6, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: '#E8943A', letterSpacing: '0.04em' }}>REQUIRED</span>}
                        </span>
                        <Toggle on={colMap[col.id]} onClick={() => toggleCol(col.id)} disabled={col.required} />
                      </div>
                    ))}
                    {columns.map((col, i) => (
                      <div key={col.id} style={i === columns.length - 1 ? sLast : sRow}>
                        <span style={{ ...lbl, color: colMap['c_' + col.id] ? '#c0c0c8' : '#6f6f78' }}>{col.name || `Column ${i + 1}`}</span>
                        <Toggle on={colMap['c_' + col.id]} onClick={() => toggleCol('c_' + col.id)} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT */}
                <div>
                  {/* Page Settings */}
                  <div style={sec}>
                    <div style={sHead}>Page Settings</div>
                    <div style={sRow}><span style={lbl}>Size</span><RadioGroup opts={[{ l: 'A4', v: 'A4' }, { l: 'Letter', v: 'Letter' }, { l: 'A3', v: 'A3' }]} value={pageSize} onChange={setPageSize} /></div>
                    <div style={sLast}><span style={lbl}>Orientation</span><RadioGroup opts={[{ l: 'Landscape', v: 'landscape' }, { l: 'Portrait', v: 'portrait' }]} value={orientation} onChange={setOrientation} /></div>
                  </div>

                  {/* Layout */}
                  <div style={sec}>
                    <div style={sHead}>Layout</div>
                    <div style={sRow}><span style={lbl}>Theme</span><RadioGroup opts={[{ l: 'Dark', v: 'dark' }, { l: 'Light', v: 'light' }]} value={pdfTheme} onChange={setPdfTheme} /></div>
                    <div style={sRow}><span style={lbl}>Density</span><RadioGroup opts={[{ l: 'Comfortable', v: 'comfortable' }, { l: 'Compact', v: 'compact' }]} value={density} onChange={setDensity} /></div>
                    <div style={sRow}><span style={lbl}>Thumbnails</span><RadioGroup opts={[{ l: 'Off', v: 'off' }, { l: 'Small', v: 'small' }, { l: 'Medium', v: 'medium' }, { l: 'Large', v: 'large' }]} value={thumbSize} onChange={setThumbSize} /></div>
                    <div style={sLast}><span style={lbl}>Group by scene</span><Toggle on={groupByScene} onClick={() => setGroupByScene(v => !v)} /></div>
                  </div>

                  {/* Borders */}
                  <div style={sec}>
                    <div style={sHead}>Borders</div>
                    <div style={sRow}><span style={lbl}>Row dividers</span><Toggle on={rowBorders} onClick={() => setRowBorders(v => !v)} /></div>
                    <div style={sLast}>
                      <span style={lbl}>Page border</span>
                      <RadioGroup opts={[{ l: 'None', v: 'none' }, { l: 'Thin', v: 'thin' }, { l: 'Medium', v: 'medium' }]} value={pageBorderStyle} onChange={setPageBorderStyle} small />
                    </div>
                  </div>

                  {/* Filter */}
                  <div style={sec}>
                    <div style={sHead}>Filter Shots</div>
                    <div style={sRow}>
                      <span style={lbl}>Status</span>
                      <select style={sel} value={filterStatusId} onChange={e => setFilterStatusId(e.target.value)}>
                        <option value="all">All statuses</option>
                        {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div style={sLast}>
                      <span style={lbl}>Scene</span>
                      <select style={sel} value={filterSceneId} onChange={e => setFilterSceneId(e.target.value)}>
                        <option value="all">All scenes</option>
                        {scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Export summary */}
                  <div style={{ border: '1px solid rgba(232,148,58,0.25)', borderRadius: 10, background: 'rgba(232,148,58,0.06)', padding: '13px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#E8943A', marginBottom: 10 }}>Export summary</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[
                        ['Shots',   filteredShots.length],
                        ['Columns', activeColCount],
                        ['Pages',   pages.length],
                        ['Format',  `${pageSize} ${orientation === 'landscape' ? 'L' : 'P'}`],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                          <span style={{ color: '#6f6f78' }}>{l}</span>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, color: '#ececee' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ STEP 1: PREVIEW ══ */}
            {step === 1 && (
              <div>
                {/* Info bar + page nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, color: '#6f6f78' }}>
                  <Eye size={13} />
                  <span>Page {previewPageIdx + 1} of {pages.length} · {filteredShots.length} shots</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setPreviewPageIdx(p => Math.max(0, p - 1))}
                      disabled={previewPageIdx === 0}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: previewPageIdx === 0 ? '#4a4a52' : '#a4a4ac', display: 'grid', placeItems: 'center', cursor: previewPageIdx === 0 ? 'not-allowed' : 'pointer' }}
                    >
                      <CaretLeft size={12} />
                    </button>
                    <button
                      onClick={() => setPreviewPageIdx(p => Math.min(pages.length - 1, p + 1))}
                      disabled={previewPageIdx >= pages.length - 1}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: previewPageIdx >= pages.length - 1 ? '#4a4a52' : '#a4a4ac', display: 'grid', placeItems: 'center', cursor: previewPageIdx >= pages.length - 1 ? 'not-allowed' : 'pointer' }}
                    >
                      <CaretRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Scaled page preview */}
                <div style={{ width: previewW, height: previewH, overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: EXPORT_W }}>
                    {curPage && (
                      <PDFPage
                        pageData={curPage}
                        allShots={filteredShots}
                        statuses={statuses}
                        scenes={scenes}
                        customCols={columns}
                        teamMembers={teamMembers}
                        colMap={colMap}
                        cfg={cfg}
                        pw={EXPORT_W}
                        ph={exportPageH}
                      />
                    )}
                  </div>
                </div>

                {/* Page dots */}
                {pages.length > 1 && (
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 12 }}>
                    {pages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewPageIdx(i)}
                        style={{ width: i === previewPageIdx ? 18 : 6, height: 6, borderRadius: 3, border: 'none', background: i === previewPageIdx ? '#E8943A' : 'rgba(255,255,255,0.15)', cursor: 'pointer', transition: 'all 0.2s', padding: 0 }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Footer ── */}
          <div style={{ padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
            {step === 1 && (
              <button onClick={() => setStep(0)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a4a4ac', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                <CaretLeft size={12} /> Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a4a4ac', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            {step === 0 ? (
              <button
                onClick={() => { setStep(1); setPreviewPageIdx(0) }}
                disabled={filteredShots.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, border: 'none', background: filteredShots.length === 0 ? 'rgba(232,148,58,0.3)' : '#E8943A', color: filteredShots.length === 0 ? 'rgba(255,255,255,0.4)' : '#1a0f04', fontSize: 12.5, fontWeight: 600, cursor: filteredShots.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                Preview <CaretRight size={12} />
              </button>
            ) : (
              <button
                onClick={handleExport}
                disabled={exporting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, border: 'none', background: exporting ? 'rgba(232,148,58,0.5)' : '#E8943A', color: '#1a0f04', fontSize: 12.5, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                <DownloadSimple size={13} />
                {exporting ? 'Exporting…' : `Export PDF (${pages.length} ${pages.length === 1 ? 'page' : 'pages'})`}
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
