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

function toAmzDate(now: Date): { date: string; datetime: string } {
  const iso = now.toISOString()
  const date = iso.slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + iso.slice(11, 19).replace(/:/g, '') + 'Z'
  return { date, datetime }
}

async function signingKey(secret: string, date: string, region: string): Promise<ArrayBuffer> {
  const kDate    = await hmac(`AWS4${secret}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  return hmac(kService, 'aws4_request')
}

/** Presign a GET or PUT for a single object (no body or unsigned body) */
async function presignUrl(
  method: 'GET' | 'PUT',
  endpoint: string, bucket: string, key: string,
  extraQp: Record<string, string>,
  accessKeyId: string, secretAccessKey: string, region: string,
  expiresIn = 3600,
): Promise<string> {
  const now = new Date()
  const { date, datetime } = toAmzDate(now)
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const credentialScope = `${date}/${region}/s3/aws4_request`

  const rawQp: Record<string, string> = {
    'X-Amz-Algorithm':    'AWS4-HMAC-SHA256',
    'X-Amz-Credential':   `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date':         datetime,
    'X-Amz-Expires':      String(expiresIn),
    'X-Amz-SignedHeaders':'host',
    ...extraQp,
  }

  // Sort by percent-encoded key name (AWS4 requirement)
  const sorted = Object.entries(rawQp).sort(([a], [b]) => {
    const ea = encodeURIComponent(a), eb = encodeURIComponent(b)
    return ea < eb ? -1 : ea > eb ? 1 : 0
  })
  const canonicalQs = sorted.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const canonicalRequest = [method, `/${bucket}/${encodedKey}`, canonicalQs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const reqHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(reqHashBuf)].join('\n')
  const kSign = await signingKey(secretAccessKey, date, region)
  const sig = hex(await hmac(kSign, stringToSign))

  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

/** Sign and execute a server-side POST to Wasabi (used for initiate + complete) */
async function wasabiPost(
  endpoint: string, bucket: string, key: string,
  queryString: string,  // e.g. "uploads" or "uploadId=xxx"
  contentType: string,
  body: string | null,
  accessKeyId: string, secretAccessKey: string, region: string,
): Promise<Response> {
  const now = new Date()
  const { date, datetime } = toAmzDate(now)
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const credentialScope = `${date}/${region}/s3/aws4_request`

  const bodyBytes = body ? enc.encode(body) : new Uint8Array(0)
  const bodyHashBuf = await crypto.subtle.digest('SHA-256', bodyBytes)
  const bodyHash = hex(bodyHashBuf)

  // Build canonical query string — parse and re-sort the query params
  const qpPairs = queryString
    ? queryString.split('&').map(p => {
        const eq = p.indexOf('=')
        return eq === -1 ? [p, ''] : [p.slice(0, eq), p.slice(eq + 1)]
      })
    : []
  const sortedQp = qpPairs.sort(([a], [b]) => {
    const ea = encodeURIComponent(a), eb = encodeURIComponent(b)
    return ea < eb ? -1 : ea > eb ? 1 : 0
  })
  const canonicalQs = sortedQp.map(([k, v]) => `${encodeURIComponent(decodeURIComponent(k))}=${encodeURIComponent(decodeURIComponent(v))}`).join('&')

  const signedHeaders = 'content-type;host;x-amz-date'
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${datetime}\n`
  const canonicalRequest = ['POST', `/${bucket}/${encodedKey}`, canonicalQs, canonicalHeaders, signedHeaders, bodyHash].join('\n')
  const reqHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(reqHashBuf)].join('\n')
  const kSign = await signingKey(secretAccessKey, date, region)
  const sig = hex(await hmac(kSign, stringToSign))
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`

  const sep = queryString ? '?' : ''
  return fetch(`${endpoint}/${bucket}/${encodedKey}${sep}${queryString}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-amz-date': datetime,
      'Authorization': authHeader,
    },
    body: body ?? undefined,
  })
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

    const url    = new URL(req.url)
    const action = url.searchParams.get('action')

    // ── INITIATE ─────────────────────────────────────────────────────────────
    if (action === 'initiate') {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
      const body = await req.json()
      const { name, size, type: mimeType, folderId } = body
      if (!name || !size) return json({ error: 'name and size required' }, 400)

      const { usedBytes, limitBytes, limitGb, planName } = await getStorageUsage(supabase, user.id)
      if (usedBytes + (size || 0) > limitBytes) {
        return json({ error: `Storage quota exceeded. Your ${planName} plan includes ${limitGb} GB.`, code: 'STORAGE_QUOTA_EXCEEDED' }, 402)
      }

      const ct = mimeType || 'application/octet-stream'
      const safeName = name.replace(/\\/g, '/').split('/').pop()!
        .replace(/[^\w.\-() ]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 255) || 'file'
      const fileId   = crypto.randomUUID()
      const ext      = safeName.split('.').pop()?.toLowerCase() || 'bin'
      const wasabiKey = `drive/${user.id}/${fileId}.${ext}`
      const isMedia   = ct.startsWith('image/') || ct.startsWith('video/')
      const thumbnailKey = isMedia ? `drive/thumbnails/${fileId}.jpg` : null

      // Initiate multipart upload at Wasabi (signed POST)
      const initRes = await wasabiPost(ENDPOINT, BUCKET, wasabiKey, 'uploads', ct, null, ACCESS, SECRET, REGION)
      if (!initRes.ok) {
        const errText = await initRes.text()
        return json({ error: `Failed to initiate multipart upload (${initRes.status}): ${errText}` }, 500)
      }
      const xmlText = await initRes.text()
      const uploadIdMatch = xmlText.match(/<UploadId>([^<]+)<\/UploadId>/)
      if (!uploadIdMatch) return json({ error: 'No UploadId in Wasabi response' }, 500)
      const uploadId = uploadIdMatch[1]

      // Insert DB record
      const { error: dbErr } = await supabase.from('drive_files').insert({
        id: fileId, user_id: user.id, folder_id: folderId || null,
        name: safeName, wasabi_key: wasabiKey, file_size: size || 0, mime_type: ct,
        thumbnail_key: thumbnailKey,
      })
      if (dbErr) {
        // Abort the zombie multipart upload
        await wasabiPost(ENDPOINT, BUCKET, wasabiKey, `uploadId=${encodeURIComponent(uploadId)}`, 'application/octet-stream', null, ACCESS, SECRET, REGION)
        return json({ error: 'DB error: ' + dbErr.message }, 500)
      }

      let thumbnailPresignedUrl: string | null = null
      if (thumbnailKey) {
        try { thumbnailPresignedUrl = await presignUrl('PUT', ENDPOINT, BUCKET, thumbnailKey, {}, ACCESS, SECRET, REGION) } catch {}
      }

      return json({ uploadId, fileId, wasabiKey, thumbnailPresignedUrl })
    }

    // ── PRESIGN PART ─────────────────────────────────────────────────────────
    if (action === 'presign-part') {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
      const { uploadId, wasabiKey, partNumber } = await req.json()
      if (!uploadId || !wasabiKey || !partNumber) return json({ error: 'uploadId, wasabiKey, partNumber required' }, 400)

      // Verify ownership
      const { data: f } = await supabase.from('drive_files').select('user_id').eq('wasabi_key', wasabiKey).single()
      if (!f || f.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const partUrl = await presignUrl('PUT', ENDPOINT, BUCKET, wasabiKey, {
        partNumber: String(partNumber),
        uploadId,
      }, ACCESS, SECRET, REGION)

      return json({ partUrl })
    }

    // ── COMPLETE ─────────────────────────────────────────────────────────────
    if (action === 'complete') {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
      const { uploadId, wasabiKey, fileId, parts } = await req.json()
      if (!uploadId || !wasabiKey || !fileId || !parts?.length) return json({ error: 'uploadId, wasabiKey, fileId, parts required' }, 400)

      const { data: f } = await supabase.from('drive_files').select('user_id').eq('id', fileId).single()
      if (!f || f.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const partsXml = (parts as { partNumber: number; etag: string }[])
        .sort((a, b) => a.partNumber - b.partNumber)
        .map(p => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}</ETag></Part>`)
        .join('')
      const completeXml = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`

      const completeRes = await wasabiPost(
        ENDPOINT, BUCKET, wasabiKey,
        `uploadId=${encodeURIComponent(uploadId)}`,
        'application/xml', completeXml,
        ACCESS, SECRET, REGION,
      )

      if (!completeRes.ok) {
        const errText = await completeRes.text()
        return json({ error: `Failed to complete multipart upload (${completeRes.status}): ${errText}` }, 500)
      }

      return json({ ok: true })
    }

    // ── ABORT ─────────────────────────────────────────────────────────────────
    if (action === 'abort') {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
      const { uploadId, wasabiKey, fileId } = await req.json()
      if (!uploadId || !wasabiKey) return json({ error: 'uploadId and wasabiKey required' }, 400)

      if (fileId) {
        const { data: f } = await supabase.from('drive_files').select('user_id').eq('id', fileId).single()
        if (f?.user_id === user.id) {
          await supabase.from('drive_files').delete().eq('id', fileId)
        }
      }

      // DELETE ?uploadId=xxx aborts the multipart upload in S3
      try {
        const now = new Date()
        const { date, datetime } = toAmzDate(now)
        const host = new URL(ENDPOINT).host
        const encodedKey = wasabiKey.split('/').map((s: string) => encodeURIComponent(s)).join('/')
        const credentialScope = `${date}/${REGION}/s3/aws4_request`
        const encodedUploadId = encodeURIComponent(uploadId)
        const canonicalQs = `uploadId=${encodedUploadId}`
        const signedHeaders = 'host;x-amz-date'
        const canonicalHeaders = `host:${host}\nx-amz-date:${datetime}\n`
        const emptyHash = hex(await crypto.subtle.digest('SHA-256', new Uint8Array(0)))
        const canonicalRequest = ['DELETE', `/${BUCKET}/${encodedKey}`, canonicalQs, canonicalHeaders, signedHeaders, emptyHash].join('\n')
        const reqHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
        const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(reqHashBuf)].join('\n')
        const kSign = await signingKey(SECRET, date, REGION)
        const sig = hex(await hmac(kSign, stringToSign))
        const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`
        await fetch(`${ENDPOINT}/${BUCKET}/${encodedKey}?${canonicalQs}`, {
          method: 'DELETE',
          headers: { 'x-amz-date': datetime, 'Authorization': authHeader },
        })
      } catch {}

      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
