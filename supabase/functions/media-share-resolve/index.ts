import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Presigned GET (no response-* overrides) ───────────────────────────────────
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
  const service = 's3'
  const credentialScope = `${date}/${region}/${service}/aws4_request`

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

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = Deno.env.get('AWS_BUCKET_NAME') ?? ''
    const ACCESS   = Deno.env.get('AWS_ACCESS_KEY_ID') ?? ''
    const SECRET   = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? ''
    const REGION   = Deno.env.get('AWS_REGION') ?? 'us-east-1'
    const canSign  = !!(ENDPOINT && BUCKET && ACCESS && SECRET)

    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    const password = url.searchParams.get('password')
    if (!token) return json({ error: 'token required' }, 400)

    const { data: link, error } = await supabase.from('media_share_links').select('*').eq('token', token).single()
    if (error || !link) return json({ error: 'Share link not found' }, 404)

    if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'This share link has expired' }, 410)

    if (link.password) {
      if (!password) return json({ error: 'Password required', passwordRequired: true }, 401)
      if (password !== link.password) return json({ error: 'Incorrect password' }, 403)
    }

    supabase.from('media_share_links')
      .update({ view_count: (link.view_count || 0) + 1, last_accessed_at: new Date().toISOString() })
      .eq('token', token).then(() => {}).catch(() => {})

    const payload = { allowDownload: link.allow_download, allowComments: link.allow_comments, expiresAt: link.expires_at }

    async function withUrls(asset: any) {
      if (!canSign || !asset) return asset
      const result: any = { ...asset }
      if (asset.wasabi_key && asset.wasabi_status === 'ready') {
        result.videoUrl = await presignGetSimple(ENDPOINT, BUCKET, asset.wasabi_key, ACCESS, SECRET, REGION, 14400).catch(() => null)
      }
      if (asset.wasabi_thumbnail_key) {
        result.thumbnailUrl = await presignGetSimple(ENDPOINT, BUCKET, asset.wasabi_thumbnail_key, ACCESS, SECRET, REGION, 3600).catch(() => null)
      }
      return result
    }

    if (link.asset_id) {
      const { data: asset } = await supabase
        .from('media_assets')
        .select('id, name, type, mime_type, wasabi_key, wasabi_thumbnail_key, wasabi_status, duration, file_size, status, created_at, notes')
        .eq('id', link.asset_id)
        .single()
      if (!asset) return json({ error: 'Asset not found' }, 404)

      let comments: unknown[] = []
      if (link.allow_comments) {
        const { data: c } = await supabase.from('media_comments').select('*').eq('asset_id', link.asset_id).order('created_at')
        comments = c || []
      }
      return json({ ...payload, type: 'asset', asset: await withUrls(asset), comments })
    }

    if (link.folder_id) {
      const { data: folder } = await supabase.from('media_folders').select('id, name, project_id, created_at').eq('id', link.folder_id).single()
      const { data: assets } = await supabase
        .from('media_assets')
        .select('id, name, type, mime_type, wasabi_key, wasabi_thumbnail_key, wasabi_status, duration, status, created_at')
        .eq('folder_id', link.folder_id)
      const withUrlsAll = await Promise.all((assets || []).map(withUrls))
      return json({ ...payload, type: 'folder', folder, assets: withUrlsAll })
    }

    if (link.project_id) {
      const { data: project } = await supabase.from('media_projects').select('id, name, description, color, created_at').eq('id', link.project_id).single()
      const { data: assets } = await supabase
        .from('media_assets')
        .select('id, name, type, mime_type, wasabi_key, wasabi_thumbnail_key, wasabi_status, duration, status, created_at')
        .eq('project_id', link.project_id)
      const withUrlsAll = await Promise.all((assets || []).map(withUrls))
      return json({ ...payload, type: 'project', project, assets: withUrlsAll })
    }

    return json({ error: 'Share link has no target' }, 500)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
