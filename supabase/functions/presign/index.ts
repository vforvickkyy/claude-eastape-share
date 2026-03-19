import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const enc = new TextEncoder()

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}

async function presignPut(
  endpoint: string, bucket: string, key: string,
  accessKeyId: string, secretAccessKey: string, region: string, expiresIn = 3600,
): Promise<string> {
  const now = new Date()
  const date     = now.toISOString().slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const credentialScope = `${date}/${region}/s3/aws4_request`

  const qp = new URLSearchParams()
  qp.set('X-Amz-Algorithm',     'AWS4-HMAC-SHA256')
  qp.set('X-Amz-Credential',    `${accessKeyId}/${credentialScope}`)
  qp.set('X-Amz-Date',          datetime)
  qp.set('X-Amz-Expires',       String(expiresIn))
  qp.set('X-Amz-SignedHeaders', 'host')
  const sortedQp = Array.from(qp.entries()).sort(([a], [b]) => a < b ? -1 : 1)
  const canonicalQs = sortedQp.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const canonicalRequest = ['PUT', `/${bucket}/${encodedKey}`, canonicalQs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')

  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

function detectType(mime: string): string {
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

async function getStorageUsage(supabase: any, userId: string) {
  const [driveRes, projectFilesRes, projectMediaRes, planRes] = await Promise.all([
    supabase.from('drive_files').select('file_size').eq('user_id', userId).eq('is_trashed', false),
    supabase.from('project_files').select('file_size').eq('user_id', userId).eq('is_trashed', false),
    supabase.from('project_media').select('file_size').eq('user_id', userId).eq('is_trashed', false),
    supabase.from('user_plans').select('plans(storage_limit_gb, display_name)').eq('user_id', userId).eq('is_active', true).single(),
  ])
  const usedBytes = [
    ...(driveRes.data || []),
    ...(projectFilesRes.data || []),
    ...(projectMediaRes.data || []),
  ].reduce((s: number, r: any) => s + (r.file_size || 0), 0)
  const limitGb    = (planRes.data as any)?.plans?.storage_limit_gb ?? 2
  const limitBytes = limitGb * 1024 * 1024 * 1024
  const planName   = (planRes.data as any)?.plans?.display_name ?? 'Free'
  return { usedBytes, limitBytes, limitGb, planName }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = (Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? '')
    const ACCESS   = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? '')
    const SECRET   = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? '')
    const REGION   = (Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1')
    if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET) return json({ error: 'Storage not configured' }, 500)

    const body = await req.json()
    const uploadType = body.upload_type // 'project_media' | 'project_file' | 'drive'

    // ── PROJECT MEDIA UPLOAD ───────────────────────────────────────────────────
    if (uploadType === 'project_media' || uploadType === 'media') {
      const { filename, filesize, mimetype, project_id, folder_id } = body
      if (!filename || !project_id) return json({ error: 'filename and project_id required' }, 400)

      // Verify project access
      const { data: project } = await supabase.from('projects').select('user_id').eq('id', project_id).single()
      if (!project) return json({ error: 'Project not found' }, 404)
      if (project.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      const { usedBytes, limitBytes, limitGb, planName } = await getStorageUsage(supabase, user.id)
      if (usedBytes + (filesize || 0) > limitBytes) {
        return json({ error: `Storage quota exceeded. Your ${planName} plan includes ${limitGb} GB.`, code: 'STORAGE_QUOTA_EXCEEDED', used_bytes: usedBytes, limit_bytes: limitBytes }, 402)
      }

      const mediaId = crypto.randomUUID()
      const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
      const wasabiKey    = `media/${user.id}/${project_id}/${mediaId}.${ext}`
      const thumbnailKey = `media/thumbnails/${mediaId}.jpg`
      const ct = mimetype || 'application/octet-stream'

      const { error: dbErr } = await supabase.from('project_media').insert({
        id: mediaId, project_id, folder_id: folder_id || null, user_id: user.id,
        name: filename, type: detectType(ct), wasabi_key: wasabiKey,
        wasabi_thumbnail_key: thumbnailKey, wasabi_status: 'uploading',
        file_size: filesize || null, mime_type: ct,
      })
      if (dbErr) return json({ error: 'DB error: ' + dbErr.message }, 500)

      const uploadUrl = await presignPut(ENDPOINT, BUCKET, wasabiKey, ACCESS, SECRET, REGION)
      return json({ uploadUrl, assetId: mediaId, mediaId, wasabiKey, thumbnailKey })
    }

    // ── PROJECT FILE UPLOAD ────────────────────────────────────────────────────
    if (uploadType === 'project_file') {
      const { filename, filesize, mimetype, project_id, folder_id, file_category } = body
      if (!filename || !project_id) return json({ error: 'filename and project_id required' }, 400)

      const { data: project } = await supabase.from('projects').select('user_id').eq('id', project_id).single()
      if (!project) return json({ error: 'Project not found' }, 404)
      if (project.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member || member.role === 'viewer' || member.role === 'reviewer') return json({ error: 'Forbidden' }, 403)
      }

      const { usedBytes, limitBytes, limitGb, planName } = await getStorageUsage(supabase, user.id)
      if (usedBytes + (filesize || 0) > limitBytes) {
        return json({ error: `Storage quota exceeded. Your ${planName} plan includes ${limitGb} GB.`, code: 'STORAGE_QUOTA_EXCEEDED' }, 402)
      }

      const fileId = crypto.randomUUID()
      const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
      const wasabiKey = `projects/${project_id}/files/${fileId}.${ext}`
      const ct = mimetype || 'application/octet-stream'

      const { error: dbErr } = await supabase.from('project_files').insert({
        id: fileId, project_id, folder_id: folder_id || null, user_id: user.id,
        name: filename, wasabi_key: wasabiKey, file_size: filesize || null,
        mime_type: ct, file_category: file_category || 'general',
      })
      if (dbErr) return json({ error: 'DB error: ' + dbErr.message }, 500)

      const uploadUrl = await presignPut(ENDPOINT, BUCKET, wasabiKey, ACCESS, SECRET, REGION)
      return json({ uploadUrl, fileId, wasabiKey })
    }

    // ── DRIVE UPLOAD ───────────────────────────────────────────────────────────
    const { files, folderId } = body
    if (!files || !Array.isArray(files) || files.length === 0) return json({ error: 'No files provided' }, 400)
    if (files.length > 20) return json({ error: 'Max 20 files per upload' }, 400)

    const { usedBytes, limitBytes, limitGb, planName } = await getStorageUsage(supabase, user.id)
    const newBytes = files.reduce((s: number, f: any) => s + (f.size || 0), 0)
    if (usedBytes + newBytes > limitBytes) {
      return json({ error: `Storage quota exceeded. Your ${planName} plan includes ${limitGb} GB.`, code: 'STORAGE_QUOTA_EXCEEDED', used_bytes: usedBytes, limit_bytes: limitBytes }, 402)
    }

    const uploads = await Promise.all(files.map(async (file: { name: string; type: string; size: number }) => {
      const safeName = file.name.replace(/\\/g, '/').split('/').pop()!
        .replace(/[^\w.\-() ]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 255) || 'file'
      const fileId   = crypto.randomUUID()
      const ext      = safeName.split('.').pop()?.toLowerCase() || 'bin'
      const wasabiKey = `drive/${user.id}/${fileId}.${ext}`
      const ct = file.type || 'application/octet-stream'
      const uploadUrl = await presignPut(ENDPOINT, BUCKET, wasabiKey, ACCESS, SECRET, REGION)

      const { error: dbErr } = await supabase.from('drive_files').insert({
        id: fileId, user_id: user.id, folder_id: folderId || null,
        name: safeName, wasabi_key: wasabiKey, file_size: file.size || 0, mime_type: ct,
      })
      if (dbErr) throw new Error('DB error: ' + dbErr.message)

      return { fileId, name: file.name, safeName, wasabiKey, uploadUrl, size: file.size }
    }))

    return json({ uploads: uploads.map(u => ({ name: u.name, presignedUrl: u.uploadUrl, size: u.size, fileId: u.fileId })) })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
