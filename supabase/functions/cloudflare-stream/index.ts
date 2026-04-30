import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
const CF_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN')
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`

const cfHeaders = {
  'Authorization': `Bearer ${CF_API_TOKEN}`,
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Wasabi presign helpers ─────────────────────────────────────────────────
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
  endpoint: string, bucket: string, key: string,
  accessKeyId: string, secretAccessKey: string, region: string, expiresIn = 14400,
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
  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')

  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Auth check
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const { data: { user }, error: authErr } = await authClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const { action } = body

    // ACTION: Get a one-time upload URL from Cloudflare
    if (action === 'get_upload_url') {
      const { file_size, file_name, media_id } = body

      if (!file_size || !media_id) {
        return json({ error: 'file_size and media_id required' }, 400)
      }

      const cfResponse = await fetch(`${CF_BASE}/direct_upload`, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          maxDurationSeconds: 21600,
          meta: {
            name: file_name || media_id,
            eastape_media_id: media_id,
          },
          requireSignedURLs: false,
        })
      })

      const cfData = await cfResponse.json()

      if (!cfResponse.ok || !cfData.success) {
        console.error('Cloudflare upload URL error:', cfData)
        return json({ error: 'Failed to get Cloudflare upload URL', details: cfData }, 500)
      }

      const { uid, uploadURL } = cfData.result

      await supabase
        .from('project_media')
        .update({ cloudflare_uid: uid, cloudflare_status: 'pending' })
        .eq('id', media_id)

      return json({ success: true, upload_url: uploadURL, uid })
    }

    // ACTION: Ingest existing Wasabi video into Cloudflare Stream via URL pull
    if (action === 'ingest_from_url') {
      const { media_id } = body
      if (!media_id) return json({ error: 'media_id required' }, 400)

      // Load media record — verify ownership
      const { data: media, error: mediaErr } = await supabase
        .from('project_media')
        .select('wasabi_key, name, user_id, cloudflare_uid, cloudflare_status')
        .eq('id', media_id)
        .single()

      if (mediaErr || !media) return json({ error: 'Media not found' }, 404)
      if (media.user_id !== user.id) return json({ error: 'Forbidden' }, 403)
      if (!media.wasabi_key) return json({ error: 'No Wasabi key on record' }, 400)

      // If a CF uid exists, check its actual state before deciding to re-ingest
      if (media.cloudflare_uid) {
        const cfCheckRes = await fetch(`${CF_BASE}/${media.cloudflare_uid}`, { headers: cfHeaders })
        if (cfCheckRes.ok) {
          const cfCheckData = await cfCheckRes.json()
          const cfState = cfCheckData.result?.status?.state

          console.log(`CF uid ${media.cloudflare_uid} state: ${cfState}`)

          if (cfState === 'ready' || cfState === 'inprogress' || cfState === 'downloading') {
            // Already good — return existing uid
            return json({ success: true, uid: media.cloudflare_uid, already_exists: true, cf_state: cfState })
          }

          // 'pendingupload' or 'error' — stale placeholder, delete and re-ingest
          console.log(`Deleting stale CF video ${media.cloudflare_uid} (state: ${cfState})`)
          await fetch(`${CF_BASE}/${media.cloudflare_uid}`, { method: 'DELETE', headers: cfHeaders }).catch(() => {})
          await supabase.from('project_media')
            .update({ cloudflare_uid: null, cloudflare_status: null })
            .eq('id', media_id)
        } else {
          // CF returned an error for this uid (e.g. 404 — already deleted) — clear it
          await supabase.from('project_media')
            .update({ cloudflare_uid: null, cloudflare_status: null })
            .eq('id', media_id)
        }
      }

      // Wasabi credentials
      const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
      const BUCKET   = (Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? '')
      const ACCESS   = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? '')
      const SECRET   = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? '')
      const REGION   = (Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1')

      if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET) {
        return json({ error: 'Storage not configured' }, 500)
      }

      // Generate a 4-hour presigned GET URL so Cloudflare can pull the file
      const wasabiUrl = await presignGet(ENDPOINT, BUCKET, media.wasabi_key, ACCESS, SECRET, REGION, 14400)
      console.log(`Sending ingest request for media ${media_id}, wasabi key: ${media.wasabi_key}`)

      // Ask Cloudflare to pull-ingest from the URL
      const cfResponse = await fetch(`${CF_BASE}/copy`, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          url: wasabiUrl,
          meta: {
            name: media.name || media_id,
            eastape_media_id: media_id,
          },
        }),
      })

      const cfData = await cfResponse.json()
      console.log(`CF copy response status: ${cfResponse.status}, success: ${cfData.success}, state: ${cfData.result?.status?.state}`)

      if (!cfResponse.ok || !cfData.success) {
        console.error('Cloudflare ingest error:', JSON.stringify(cfData))
        return json({ error: 'Cloudflare ingest failed', details: cfData }, 500)
      }

      const uid = cfData.result?.uid
      if (!uid) return json({ error: 'No UID returned from Cloudflare' }, 500)

      const cfState = cfData.result?.status?.state || 'downloading'
      await supabase
        .from('project_media')
        .update({ cloudflare_uid: uid, cloudflare_status: 'processing' })
        .eq('id', media_id)

      return json({ success: true, uid, status: 'processing', cf_state: cfState })
    }

    // ACTION: Check status of a video
    if (action === 'get_status') {
      const { uid, media_id } = body

      if (!uid) return json({ error: 'uid required' }, 400)

      const cfResponse = await fetch(`${CF_BASE}/${uid}`, { headers: cfHeaders })
      const cfData = await cfResponse.json()

      if (!cfResponse.ok || !cfData.success) {
        return json({ error: 'Failed to get video status' }, 500)
      }

      const video = cfData.result
      const state = video.status?.state || 'processing'

      const mappedStatus =
        state === 'ready'        ? 'ready'      :
        state === 'error'        ? 'error'       :
        state === 'pendingupload'? 'pending'     :
        'processing'

      const thumbnailUrl = video.thumbnail || null
      const playbackUrl  = video.playback?.hls || null

      if (media_id) {
        await supabase
          .from('project_media')
          .update({
            cloudflare_status: mappedStatus,
            cloudflare_thumbnail_url: thumbnailUrl,
            cloudflare_playback_url: playbackUrl,
          })
          .eq('id', media_id)
      }

      return json({
        success: true,
        status: mappedStatus,
        uid,
        thumbnail_url: thumbnailUrl,
        playback_url: playbackUrl,
        duration: video.duration || null,
      })
    }

    // ACTION: Delete video from Cloudflare
    if (action === 'delete') {
      const { uid } = body

      if (!uid) return json({ error: 'uid required' }, 400)

      const cfResponse = await fetch(`${CF_BASE}/${uid}`, {
        method: 'DELETE',
        headers: cfHeaders,
      })

      if (!cfResponse.ok) {
        console.error('Cloudflare delete failed for uid:', uid)
        // Non-fatal
      }

      return json({ success: true })
    }

    return json({ error: 'Invalid action' }, 400)

  } catch (err) {
    console.error('cloudflare-stream error:', err)
    return json({ error: err.message }, 500)
  }
})
