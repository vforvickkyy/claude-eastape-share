import React from 'react'
import {
  FileVideo, FileImage, FileAudio, FilePdf,
  FileZip, FileCode, FileText, File,
} from '@phosphor-icons/react'

const EXT_VIDEO  = new Set(['mp4','mov','avi','mkv','webm','m4v','flv','wmv'])
const EXT_IMAGE  = new Set(['jpg','jpeg','png','gif','webp','svg','avif','bmp','tiff'])
const EXT_AUDIO  = new Set(['mp3','wav','ogg','flac','aac','m4a','wma','opus'])
const EXT_ZIP    = new Set(['zip','rar','7z','tar','gz','bz2','xz','tgz'])
const EXT_CODE   = new Set(['js','ts','jsx','tsx','py','go','rs','html','css','json','yaml','yml','sh','bash','md'])
const EXT_DOC    = new Set(['doc','docx','odt','rtf'])
const EXT_SHEET  = new Set(['xls','xlsx','csv','ods'])
const EXT_SLIDE  = new Set(['ppt','pptx','odp'])
const EXT_TEXT   = new Set(['txt','log','ini','cfg','conf'])

function classify(mimeType, fileName) {
  const ext = (fileName?.split('.').pop() || '').toLowerCase()
  const mime = mimeType || ''

  if (mime.startsWith('video/') || EXT_VIDEO.has(ext))  return { bg: '#7c3aed', Icon: FileVideo }
  if (mime.startsWith('image/') || EXT_IMAGE.has(ext))  return { bg: '#2563eb', Icon: FileImage }
  if (mime.startsWith('audio/') || EXT_AUDIO.has(ext))  return { bg: '#059669', Icon: FileAudio }
  if (mime === 'application/pdf' || ext === 'pdf')       return { bg: '#dc2626', Icon: FilePdf }
  if (EXT_ZIP.has(ext))                                  return { bg: '#d97706', Icon: FileZip }
  if (EXT_CODE.has(ext))                                 return { bg: '#0891b2', Icon: FileCode }
  if (EXT_DOC.has(ext))                                  return { bg: '#2563eb', Icon: FileText }
  if (EXT_SHEET.has(ext))                                return { bg: '#16a34a', Icon: FileText }
  if (EXT_SLIDE.has(ext))                                return { bg: '#ea580c', Icon: FileText }
  if (EXT_TEXT.has(ext))                                 return { bg: '#6b7280', Icon: FileText }
  return { bg: '#374151', Icon: File }
}

export function getFileCategory(mimeType, fileName) {
  const ext = (fileName?.split('.').pop() || '').toLowerCase()
  const mime = mimeType || ''
  if (mime.startsWith('video/') || EXT_VIDEO.has(ext)) return 'video'
  if (mime.startsWith('image/') || EXT_IMAGE.has(ext)) return 'image'
  if (mime.startsWith('audio/') || EXT_AUDIO.has(ext)) return 'audio'
  if (mime === 'application/pdf' || EXT_DOC.has(ext) || EXT_SHEET.has(ext) || EXT_SLIDE.has(ext) || EXT_TEXT.has(ext) || ext === 'pdf') return 'document'
  return 'other'
}

export default function FileTypeIcon({ mimeType, fileName, size = 40 }) {
  const { bg, Icon } = classify(mimeType, fileName)
  const iconSize = Math.round(size * 0.48)
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.2),
      background: bg + 'cc', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={iconSize} weight="duotone" color="#fff" />
    </div>
  )
}
