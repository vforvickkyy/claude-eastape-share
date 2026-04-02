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

async function presignGetSimple(
  endpoint: string, bucket: string, key: string,
  accessKeyId: string, secretAccessKey: string, region: string,
  expiresIn = 14400,
): Promise<string> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
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
  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')
  const kDate = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  const kSign = await hmac(kService, 'aws4_request')
  const sig = hex(await hmac(kSign, stringToSign))
  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

async function presignGet(
  endpoint: string, bucket: string, key: string, fileName: string,
  accessKeyId: string, secretAccessKey: string, region: string,
  expiresIn = 3600,
): Promise<string> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const credentialScope = `${date}/${region}/s3/aws4_request`

  const safeFileName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_')
  const qp = new URLSearchParams()
  qp.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
  qp.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`)
  qp.set('X-Amz-Date', datetime)
  qp.set('X-Amz-Expires', String(expiresIn))
  qp.set('X-Amz-SignedHeaders', 'host')
  qp.set('response-content-disposition', `attachment; filename="${safeFileName}"`)
  const sortedQp = Array.from(qp.entries()).sort(([a], [b]) => a < b ? -1 : 1)
  const canonicalQs = sortedQp.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')
  const kDate = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  const kSign = await hmac(kService, 'aws4_request')
  const sig = hex(await hmac(kSign, stringToSign))
  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const url = new URL(req.url)

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = (Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? '')
    const ACCESS   = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? '')
    const SECRET   = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? '')
    const REGION   = (Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1')
    if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET) return json({ error: 'Storage not configured' }, 500)

    const mediaId    = url.searchParams.get('media_id') || url.searchParams.get('asset_id')
    const fileId     = url.searchParams.get('file_id')
    const driveId    = url.searchParams.get('drive_id')
    const shareToken = url.searchParams.get('share_token')
    const dlType     = url.searchParams.get('type') || 'view'

    // ── PROJECT MEDIA ─────────────────────────────────────────────────────────
    if (mediaId) {
      // Public share token access
      if (shareToken) {
        const { data: link } = await supabase.from('share_links').select('*, project_media(*)').eq('token', shareToken).single()
        if (!link) return json({ error: 'Share link not found' }, 404)
        if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'Share link expired' }, 410)
        if (dlType === 'download' && !link.allow_download) return json({ error: 'Download not allowed' }, 403)

        let media = link.project_media
        if (!media || media.id !== mediaId) {
          // Folder/project-level share: verify asset belongs to shared scope
          let q = supabase.from('project_media').select('*').eq('id', mediaId)
          if (link.project_id) q = q.eq('project_id', link.project_id)
          else return json({ error: 'Asset not found' }, 404)
          const { data: m } = await q.single()
          if (!m) return json({ error: 'Asset not found' }, 404)
          media = m
        }

        supabase.from('share_links').update({ view_count: (link.view_count || 0) + 1 }).eq('id', link.id).then(() => {})

        const mediaUrl = dlType === 'view'
          ? await presignGetSimple(ENDPOINT, BUCKET, media.wasabi_key, ACCESS, SECRET, REGION, 14400)
          : await presignGet(ENDPOINT, BUCKET, media.wasabi_key, media.name, ACCESS, SECRET, REGION, 3600)
        const thumbnailUrl = media.wasabi_thumbnail_key
          ? await presignGetSimple(ENDPOINT, BUCKET, media.wasabi_thumbnail_key, ACCESS, SECRET, REGION, 3600)
          : null
        return json({ url: mediaUrl, thumbnailUrl, asset: media })
      }

      // Authenticated access
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
      })
      const { data: { user }, error: authErr } = await authClient.auth.getUser()
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

      const { data: media } = await supabase.from('project_media').select('*').eq('id', mediaId).single()
      if (!media) return json({ error: 'Media not found' }, 404)
      if (media.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', media.project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      // Allow presigning a specific wasabi_key (e.g. a previous version key) — still auth-gated via mediaId
      const wasabiKey      = url.searchParams.get('wasabi_key')      || media.wasabi_key
      const thumbnailKey   = url.searchParams.get('wasabi_thumb_key') || media.wasabi_thumbnail_key
      const mediaUrl = dlType === 'view'
        ? await presignGetSimple(ENDPOINT, BUCKET, wasabiKey, ACCESS, SECRET, REGION, 14400)
        : await presignGet(ENDPOINT, BUCKET, wasabiKey, media.name, ACCESS, SECRET, REGION, 3600)
      const thumbnailUrl = thumbnailKey
        ? await presignGetSimple(ENDPOINT, BUCKET, thumbnailKey, ACCESS, SECRET, REGION, 3600)
        : null
      return json({ url: mediaUrl, thumbnailUrl, asset: media })
    }

    // ── PROJECT FILE ──────────────────────────────────────────────────────────
    if (fileId) {
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
      })
      const { data: { user }, error: authErr } = await authClient.auth.getUser()
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

      const { data: file } = await supabase.from('project_files').select('*').eq('id', fileId).single()
      if (!file) return json({ error: 'File not found' }, 404)
      if (file.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', file.project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      const fileUrl = await presignGet(ENDPOINT, BUCKET, file.wasabi_key, file.name, ACCESS, SECRET, REGION, 3600)
      return json({ url: fileUrl, fileName: file.name })
    }

    // ── DRIVE FILE ────────────────────────────────────────────────────────────
    if (driveId) {
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
      })
      const { data: { user }, error: authErr } = await authClient.auth.getUser()
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

      const { data: file } = await supabase.from('drive_files').select('*').eq('id', driveId).eq('user_id', user.id).single()
      if (!file) return json({ error: 'File not found' }, 404)

      const fileUrl = await presignGet(ENDPOINT, BUCKET, file.wasabi_key, file.name, ACCESS, SECRET, REGION, 3600)
      return json({ url: fileUrl, fileName: file.name })
    }

    return json({ error: 'No file identifier provided' }, 400)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
