import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Native AWS Signature V4 presigned PUT URL ─────────────────────────────
async function presignPut(
  endpoint: string,   // e.g. https://s3.us-east-1.wasabisys.com
  bucket: string,
  key: string,
  contentType: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  expiresIn = 3600,
): Promise<string> {
  const enc = new TextEncoder()

  const now = new Date()
  const date    = now.toISOString().slice(0, 10).replace(/-/g, '')          // YYYYMMDD
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z' // YYYYMMDDTHHmmssZ

  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const canonicalUri = `/${bucket}/${encodedKey}`
  const service = 's3'
  const credentialScope = `${date}/${region}/${service}/aws4_request`

  // Query string params (must be sorted alphabetically for canonical form)
  const qp = new URLSearchParams()
  qp.set('X-Amz-Algorithm',     'AWS4-HMAC-SHA256')
  qp.set('X-Amz-Credential',    `${accessKeyId}/${credentialScope}`)
  qp.set('X-Amz-Date',          datetime)
  qp.set('X-Amz-Expires',       String(expiresIn))
  qp.set('X-Amz-SignedHeaders', 'host')
  // URLSearchParams sorts by insertion order, so sort manually
  const sortedQp = Array.from(qp.entries()).sort(([a], [b]) => a < b ? -1 : 1)
  const canonicalQs = sortedQp.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQs,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const hashedReq = hex(hashBuf)

  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hashedReq].join('\n')

  async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
    const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
    const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return crypto.subtle.sign('HMAC', k, enc.encode(msg))
  }

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const ENDPOINT  = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET    = (Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? '')
    const ACCESS    = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? '')
    const SECRET    = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? '')
    const REGION    = (Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1')

    if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET) {
      return json({ error: 'Storage not configured' }, 500)
    }

    const SHARE_TTL = 7 * 24 * 60 * 60

    const { files, userId, folderId } = await req.json()
    if (!files || !Array.isArray(files) || files.length === 0) return json({ error: 'No files provided' }, 400)
    if (files.length > 20) return json({ error: 'Max 20 files per share' }, 400)

    const tokenBytes = new Uint8Array(16)
    crypto.getRandomValues(tokenBytes)
    const token    = hex(tokenBytes.buffer)
    const expiresAt = new Date(Date.now() + SHARE_TTL * 1000).toISOString()

    const uploads = await Promise.all(files.map(async (file: { name: string; type: string; size: number }) => {
      const safeName = file.name
        .replace(/\\/g, '/')
        .split('/').pop()!
        .replace(/[^\w.\-() ]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 255) || 'file'

      const s3Key = `shares/${token}/${safeName}`
      const ct = file.type || 'application/octet-stream'
      const presignedUrl = await presignPut(ENDPOINT, BUCKET, s3Key, ct, ACCESS, SECRET, REGION)
      return { originalName: file.name, safeName, s3Key, size: file.size, type: ct, presignedUrl }
    }))

    const rows = uploads.map(u => ({
      token,
      file_name: u.safeName,
      file_url:  u.s3Key,
      file_size: u.size,
      expires_at: expiresAt,
      user_id:   userId || user.id,
      folder_id: folderId || null,
    }))

    const { error: dbError } = await supabase.from('shares').insert(rows)
    if (dbError) return json({ error: 'Database error', detail: dbError.message }, 500)

    return json({
      token,
      uploads: uploads.map(u => ({ name: u.originalName, presignedUrl: u.presignedUrl, size: u.size })),
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
