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
  endpoint: string,
  bucket: string,
  key: string,
  contentType: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  expiresIn = 3600,
): Promise<string> {
  const now = new Date()
  const date     = now.toISOString().slice(0, 10).replace(/-/g, '')
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

  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'
  const canonicalRequest = ['PUT', `/${bucket}/${encodedKey}`, canonicalQs, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')

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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = Deno.env.get('AWS_BUCKET_NAME') ?? ''
    const ACCESS   = Deno.env.get('AWS_ACCESS_KEY_ID') ?? ''
    const SECRET   = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? ''
    const REGION   = Deno.env.get('AWS_REGION') ?? 'us-east-1'

    const { asset_id, thumbnail_base64, duration, width, height } = await req.json()
    if (!asset_id) return json({ error: 'asset_id required' }, 400)

    // Fetch the asset to verify ownership and get thumbnail key
    const { data: asset, error: assetErr } = await supabase
      .from('media_assets')
      .select('wasabi_thumbnail_key, user_id')
      .eq('id', asset_id)
      .eq('user_id', user.id)
      .single()

    if (assetErr || !asset) return json({ error: 'Asset not found or not authorized' }, 404)

    // Upload thumbnail to Wasabi if provided
    if (thumbnail_base64 && asset.wasabi_thumbnail_key && ENDPOINT && BUCKET && ACCESS && SECRET) {
      try {
        const thumbnailBuffer = Uint8Array.from(atob(thumbnail_base64), c => c.charCodeAt(0))
        const putUrl = await presignPut(ENDPOINT, BUCKET, asset.wasabi_thumbnail_key, 'image/jpeg', ACCESS, SECRET, REGION)
        await fetch(putUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: thumbnailBuffer,
        })
      } catch {
        // Thumbnail upload failure is non-fatal
      }
    }

    // Mark asset as ready
    const { data, error } = await supabase
      .from('media_assets')
      .update({
        wasabi_status: 'ready',
        duration: duration || null,
        width: width || null,
        height: height || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asset_id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return json({ error: error.message }, 500)

    return json({ asset: data })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
