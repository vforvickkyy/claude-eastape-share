import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Native AWS Signature V4 signed request ────────────────────────────────────
const enc = new TextEncoder()

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
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
  const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb924 27ae41e4649b934ca495991b7852b855'.replace(' ', '')

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${datetime}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'DELETE',
    `/${bucket}/${encodedKey}`,
    '',
    canonicalHeaders,
    signedHeaders,
    emptyHash,
  ].join('\n')

  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const hashedReq = hex(hashBuf)
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hashedReq].join('\n')

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`

  await fetch(`${endpoint}/${bucket}/${encodedKey}`, {
    method: 'DELETE',
    headers: {
      Host: host,
      'x-amz-date': datetime,
      'x-amz-content-sha256': emptyHash,
      Authorization: authorization,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return json({ error: 'Token is required.' }, 400)

    const { data: rows, error: fetchError } = await supabase
      .from('shares')
      .select('id, file_url')
      .eq('token', token)
      .eq('user_id', user.id)

    if (fetchError) return json({ error: fetchError.message }, 500)
    if (!rows || rows.length === 0) return json({ error: 'Share not found.' }, 404)

    if (req.method === 'PUT') {
      const { action, folderId, name } = await req.json()

      if (action === 'trash') {
        const { error } = await supabase.from('shares').update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq('token', token).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      if (action === 'restore') {
        const { error } = await supabase.from('shares').update({ is_trashed: false, trashed_at: null }).eq('token', token).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      if (action === 'move') {
        const { error } = await supabase.from('shares').update({ folder_id: folderId || null }).eq('token', token).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      if (action === 'rename') {
        if (!name?.trim()) return json({ error: 'Name is required.' }, 400)
        const { error } = await supabase.from('shares').update({ file_name: name.trim() }).eq('id', rows[0].id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
      return json({ error: 'Unknown action.' }, 400)
    }

    if (req.method === 'DELETE') {
      const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
      const BUCKET   = (Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? '')
      const ACCESS   = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? '')
      const SECRET   = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? '')
      const REGION   = (Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1')

      if (ENDPOINT && BUCKET && ACCESS && SECRET) {
        await Promise.allSettled(
          rows.map((r: { file_url: string }) => s3Delete(ENDPOINT, BUCKET, r.file_url, ACCESS, SECRET, REGION))
        )
      }

      const { error } = await supabase.from('shares').delete().eq('token', token).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
