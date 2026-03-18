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

async function presignGet(
  endpoint: string,
  bucket: string,
  key: string,
  fileName: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  expiresIn = 120,
  inline = false,
): Promise<string> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'

  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const service = 's3'
  const credentialScope = `${date}/${region}/${service}/aws4_request`

  const qp = new URLSearchParams()
  qp.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
  qp.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`)
  qp.set('X-Amz-Date', datetime)
  qp.set('X-Amz-Expires', String(expiresIn))
  qp.set('X-Amz-SignedHeaders', 'host')
  qp.set('response-cache-control', 'no-store')
  if (inline) {
    qp.set('response-content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  } else {
    qp.set('response-content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  }

  const sortedQp = Array.from(qp.entries()).sort(([a], [b]) => a < b ? -1 : 1)
  const canonicalQs = sortedQp.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'

  const canonicalRequest = [
    'GET',
    `/${bucket}/${encodedKey}`,
    canonicalQs,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

async function s3Delete(
  endpoint: string,
  bucket: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
): Promise<void> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'

  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const service = 's3'
  const credentialScope = `${date}/${region}/${service}/aws4_request`
  const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${datetime}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = ['DELETE', `/${bucket}/${encodedKey}`, '', canonicalHeaders, signedHeaders, emptyHash].join('\n')
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`

  await fetch(`${endpoint}/${bucket}/${encodedKey}`, {
    method: 'DELETE',
    headers: { Host: host, 'x-amz-date': datetime, 'x-amz-content-sha256': emptyHash, Authorization: authorization },
  })
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const url = new URL(req.url)
    const assetId   = url.searchParams.get('asset_id')
    const shareToken = url.searchParams.get('share_token')
    const dlType    = url.searchParams.get('type') || 'view'   // 'view' | 'download'

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = (Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? '')
    const ACCESS   = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? '')
    const SECRET   = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? '')
    const REGION   = (Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1')

    // ── MEDIA ASSET PATH ─────────────────────────────────────────────────────
    if (assetId) {
      // Public share token access
      if (shareToken) {
        const { data: link } = await supabase
          .from('media_share_links')
          .select('*, media_assets(*)')
          .eq('token', shareToken)
          .single()

        if (!link) return json({ error: 'Share link not found' }, 404)
        if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'Share link expired' }, 410)
        if (dlType === 'download' && !link.allow_download) return json({ error: 'Download not allowed' }, 403)

        const asset = link.media_assets
        if (!asset || asset.id !== assetId) return json({ error: 'Asset not found' }, 404)

        // Increment view count (fire and forget)
        supabase.from('media_share_links').update({ view_count: (link.view_count || 0) + 1 }).eq('id', link.id).then(() => {})

        const isInline = dlType === 'view'
        const viewUrl = await presignGet(ENDPOINT, BUCKET, asset.wasabi_key, asset.name, ACCESS, SECRET, REGION, 14400, isInline)
        let thumbnailUrl: string | null = null
        if (asset.wasabi_thumbnail_key) {
          thumbnailUrl = await presignGet(ENDPOINT, BUCKET, asset.wasabi_thumbnail_key, asset.name + '.jpg', ACCESS, SECRET, REGION, 3600, true)
        }

        return json({ url: viewUrl, thumbnailUrl, asset })
      }

      // Authenticated access
      const authHeader = req.headers.get('Authorization') ?? ''
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
      const { data: { user }, error: authErr } = await authClient.auth.getUser()
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

      const { data: asset, error: assetErr } = await supabase.from('media_assets').select('*').eq('id', assetId).single()
      if (assetErr || !asset) return json({ error: 'Asset not found' }, 404)

      // Verify ownership or team membership
      if (asset.user_id !== user.id) {
        const { data: member } = await supabase.from('media_team_members').select('role').eq('project_id', asset.project_id).eq('user_id', user.id).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      const isInline = dlType === 'view'
      const viewUrl = await presignGet(ENDPOINT, BUCKET, asset.wasabi_key, asset.name, ACCESS, SECRET, REGION, 14400, isInline)
      let thumbnailUrl: string | null = null
      if (asset.wasabi_thumbnail_key) {
        thumbnailUrl = await presignGet(ENDPOINT, BUCKET, asset.wasabi_thumbnail_key, asset.name + '.jpg', ACCESS, SECRET, REGION, 3600, true)
      }

      return json({ url: viewUrl, thumbnailUrl, asset })
    }

    // ── DRIVE DOWNLOAD PATH (original logic) ──────────────────────────────────
    const token  = url.searchParams.get('token')
    const fileId = url.searchParams.get('fileId')
    if (!token || !fileId) return json({ error: 'token and fileId are required' }, 400)

    const { data, error } = await supabase
      .from('shares')
      .select('id, file_name, file_url, file_size, expires_at, token, storage_deleted')
      .eq('token', token)
      .eq('id', fileId)
      .single()

    if (error || !data) return json({ error: 'File not found' }, 404)
    if (data.storage_deleted) return json({ error: 'This file has already been downloaded and permanently deleted from our servers.', reason: 'downloaded' }, 410)
    if (data.expires_at && new Date(data.expires_at) < new Date()) return json({ error: 'This share link has expired' }, 410)

    if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET) {
      return json({ error: 'Storage not configured' }, 500)
    }

    const presignedUrl = await presignGet(ENDPOINT, BUCKET, data.file_url, data.file_name, ACCESS, SECRET, REGION)

    const { data: batchFiles } = await supabase.from('shares').select('id, file_url').eq('token', data.token)

    await supabase.from('shares')
      .update({ storage_deleted: true, storage_deleted_at: new Date().toISOString() })
      .eq('token', data.token)

    if (batchFiles?.length && ENDPOINT && BUCKET && ACCESS && SECRET) {
      Promise.allSettled(
        batchFiles.map((f: { file_url: string }) => s3Delete(ENDPOINT, BUCKET, f.file_url, ACCESS, SECRET, REGION))
      ).catch(() => {})
    }

    return json({ url: presignedUrl, fileName: data.file_name })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
