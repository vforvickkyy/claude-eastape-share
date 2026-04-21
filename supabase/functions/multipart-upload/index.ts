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

function isoDate(now: Date) {
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

/**
 * Generate a presigned URL for any method (GET, PUT, POST, DELETE).
 * Uses UNSIGNED-PAYLOAD so no body hash is required in the signature.
 * The actual body (if any) is sent un-signed — Wasabi accepts this for multipart ops.
 */
async function presign(
  method: string,
  endpoint: string, bucket: string, key: string,
  extraQp: Record<string, string>,
  accessKeyId: string, secretAccessKey: string, region: string,
  expiresIn = 3600,
): Promise<string> {
  const now = new Date()
  const { date, datetime } = isoDate(now)
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const credentialScope = `${date}/${region}/s3/aws4_request`

  const qpObj: Record<string, string> = {
    'X-Amz-Algorithm':    'AWS4-HMAC-SHA256',
    'X-Amz-Credential':   `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date':         datetime,
    'X-Amz-Expires':      String(expiresIn),
    'X-Amz-SignedHeaders':'host',
    ...extraQp,
  }

  const sorted = Object.entries(qpObj).sort(([a], [b]) => {
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
    // Returns: { initiateUrl, fileId, wasabiKey, thumbnailPresignedUrl }
    // Client calls initiateUrl with POST to get uploadId from Wasabi XML response.
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
      const fileId    = crypto.randomUUID()
      const ext       = safeName.split('.').pop()?.toLowerCase() || 'bin'
      const wasabiKey = `drive/${user.id}/${fileId}.${ext}`
      const isMedia   = ct.startsWith('image/') || ct.startsWith('video/')
      const thumbnailKey = isMedia ? `drive/thumbnails/${fileId}.jpg` : null

      // Insert DB record now (we'll delete it on abort)
      const { error: dbErr } = await supabase.from('drive_files').insert({
        id: fileId, user_id: user.id, folder_id: folderId || null,
        name: safeName, wasabi_key: wasabiKey, file_size: size || 0, mime_type: ct,
        thumbnail_key: thumbnailKey,
      })
      if (dbErr) return json({ error: 'DB error: ' + dbErr.message }, 500)

      // Generate presigned URL for CreateMultipartUpload (POST ?uploads).
      // Client will POST to this URL and parse the XML to get the uploadId.
      const initiateUrl = await presign('POST', ENDPOINT, BUCKET, wasabiKey, { 'uploads': '' }, ACCESS, SECRET, REGION, 300)

      let thumbnailPresignedUrl: string | null = null
      if (thumbnailKey) {
        try { thumbnailPresignedUrl = await presign('PUT', ENDPOINT, BUCKET, thumbnailKey, {}, ACCESS, SECRET, REGION) } catch {}
      }

      return json({ initiateUrl, fileId, wasabiKey, thumbnailPresignedUrl })
    }

    // ── PRESIGN PART ─────────────────────────────────────────────────────────
    if (action === 'presign-part') {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
      const { uploadId, wasabiKey, partNumber } = await req.json()
      if (!uploadId || !wasabiKey || !partNumber) return json({ error: 'uploadId, wasabiKey, partNumber required' }, 400)

      // Verify ownership
      const { data: f } = await supabase.from('drive_files').select('user_id').eq('wasabi_key', wasabiKey).single()
      if (!f || f.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const partUrl = await presign('PUT', ENDPOINT, BUCKET, wasabiKey, {
        partNumber: String(partNumber),
        uploadId,
      }, ACCESS, SECRET, REGION, 3600)

      return json({ partUrl })
    }

    // ── COMPLETE ─────────────────────────────────────────────────────────────
    // Server-side: build and send the CompleteMultipartUpload XML to Wasabi.
    if (action === 'complete') {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405)
      const { uploadId, wasabiKey, fileId, parts } = await req.json()
      if (!uploadId || !wasabiKey || !fileId || !parts?.length) return json({ error: 'uploadId, wasabiKey, fileId, parts required' }, 400)

      const { data: f } = await supabase.from('drive_files').select('user_id').eq('id', fileId).single()
      if (!f || f.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const partsXml = (parts as { partNumber: number; etag: string }[])
        .sort((a, b) => a.partNumber - b.partNumber)
        .map(p => {
          const etag = p.etag.replace(/"/g, '').replace(/&quot;/g, '')
          return `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${etag}"</ETag></Part>`
        })
        .join('')
      const completeXml = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`

      // Sign the complete POST with Authorization header
      const now = new Date()
      const { date, datetime } = isoDate(now)
      const host = new URL(ENDPOINT).host
      const encodedKey = wasabiKey.split('/').map((s: string) => encodeURIComponent(s)).join('/')
      const credentialScope = `${date}/${REGION}/s3/aws4_request`
      const encodedUploadId = encodeURIComponent(uploadId)

      const bodyHash = hex(await crypto.subtle.digest('SHA-256', enc.encode(completeXml)))

      // Wasabi requires x-amz-content-sha256 to be signed
      const signedHeaderNames = 'host;x-amz-content-sha256;x-amz-date'
      const canonicalHeaders  = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${datetime}\n`

      const canonicalRequest = [
        'POST',
        `/${BUCKET}/${encodedKey}`,
        `uploadId=${encodedUploadId}`,
        canonicalHeaders,
        signedHeaderNames,
        bodyHash,
      ].join('\n')

      const reqHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
      const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(reqHashBuf)].join('\n')
      const kSign = await signingKey(SECRET, date, REGION)
      const sig = hex(await hmac(kSign, stringToSign))
      const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${sig}`

      const completeRes = await fetch(
        `${ENDPOINT}/${BUCKET}/${encodedKey}?uploadId=${encodedUploadId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml',
            'x-amz-date': datetime,
            'x-amz-content-sha256': bodyHash,
            'Authorization': authHeader,
          },
          body: completeXml,
        },
      )

      if (!completeRes.ok) {
        const errText = await completeRes.text()
        return json({ error: `Complete failed (${completeRes.status}): ${errText}` }, 500)
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
        if (f?.user_id === user.id) await supabase.from('drive_files').delete().eq('id', fileId)
      }

      // Abort the multipart upload at Wasabi
      try {
        const now = new Date()
        const { date, datetime } = isoDate(now)
        const host = new URL(ENDPOINT).host
        const encodedKey = wasabiKey.split('/').map((s: string) => encodeURIComponent(s)).join('/')
        const credentialScope = `${date}/${REGION}/s3/aws4_request`
        const encodedUploadId = encodeURIComponent(uploadId)
        const emptyHash = hex(await crypto.subtle.digest('SHA-256', new Uint8Array(0)))
        const signedHeaderNames = 'host;x-amz-content-sha256;x-amz-date'
        const canonicalHeaders  = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${datetime}\n`
        const canonicalRequest = ['DELETE', `/${BUCKET}/${encodedKey}`, `uploadId=${encodedUploadId}`, canonicalHeaders, signedHeaderNames, emptyHash].join('\n')
        const reqHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
        const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(reqHashBuf)].join('\n')
        const kSign = await signingKey(SECRET, date, REGION)
        const sig = hex(await hmac(kSign, stringToSign))
        const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${sig}`
        await fetch(`${ENDPOINT}/${BUCKET}/${encodedKey}?uploadId=${encodedUploadId}`, {
          method: 'DELETE',
          headers: { 'x-amz-date': datetime, 'x-amz-content-sha256': emptyHash, 'Authorization': authHeader },
        })
      } catch {}

      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
