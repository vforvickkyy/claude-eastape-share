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
function hex(buf: ArrayBuffer) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('') }
async function hmac(key: ArrayBuffer | string, msg: string) {
  const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}
async function presignViewUrl(endpoint: string, bucket: string, key: string, access: string, secret: string, region: string, expiresIn = 7200) {
  const now = new Date()
  const date = now.toISOString().slice(0,10).replace(/-/g,'')
  const datetime = date + 'T' + now.toISOString().slice(11,19).replace(/:/g,'') + 'Z'
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const scope = `${date}/${region}/s3/aws4_request`
  const qp = new URLSearchParams()
  qp.set('X-Amz-Algorithm','AWS4-HMAC-SHA256')
  qp.set('X-Amz-Credential',`${access}/${scope}`)
  qp.set('X-Amz-Date', datetime)
  qp.set('X-Amz-Expires', String(expiresIn))
  qp.set('X-Amz-SignedHeaders','host')
  const sorted = Array.from(qp.entries()).sort(([a],[b]) => a<b?-1:1)
  const cqs = sorted.map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const cr = ['GET',`/${bucket}/${encodedKey}`,cqs,`host:${host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n')
  const hb = await crypto.subtle.digest('SHA-256', enc.encode(cr))
  const sts = ['AWS4-HMAC-SHA256',datetime,scope,hex(hb)].join('\n')
  const kD = await hmac(`AWS4${secret}`,date), kR = await hmac(kD,region), kS = await hmac(kR,'s3'), kSi = await hmac(kS,'aws4_request')
  return `${endpoint}/${bucket}/${encodedKey}?${cqs}&X-Amz-Signature=${hex(await hmac(kSi,sts))}`
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

    const url = new URL(req.url)
    const fileId   = url.searchParams.get('id')
    const folderId = url.searchParams.get('folderId')
    const trashed  = url.searchParams.get('trashed') === 'true'

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? ''
    const ACCESS   = Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? ''
    const SECRET   = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? ''
    const REGION   = Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1'
    const canSign  = !!(ENDPOINT && BUCKET && ACCESS && SECRET)

    // GET ?resource=storage — storage usage summary
    if (req.method === 'GET' && url.searchParams.get('resource') === 'storage') {
      const [driveRes, projFilesRes, projMediaRes, planRes] = await Promise.all([
        supabase.from('drive_files').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('project_files').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('project_media').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('user_plans').select('plans(storage_limit_gb)').eq('user_id', user.id).eq('is_active', true).single(),
      ])
      const usedBytes = [
        ...(driveRes.data || []),
        ...(projFilesRes.data || []),
        ...(projMediaRes.data || []),
      ].reduce((s: number, r: any) => s + (r.file_size || 0), 0)
      const limitGb = (planRes.data as any)?.plans?.storage_limit_gb ?? 2
      return json({ used_bytes: usedBytes, limit_bytes: limitGb * 1024 * 1024 * 1024, limit_gb: limitGb })
    }

    // GET — list files
    if (req.method === 'GET') {
      let q = supabase.from('drive_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (trashed) {
        q = q.eq('is_trashed', true)
      } else {
        q = q.eq('is_trashed', false)
        if (folderId && folderId !== 'root') q = q.eq('folder_id', folderId)
        else q = q.is('folder_id', null)
      }
      const { data: files, error } = await q
      if (error) return json({ error: error.message }, 500)

      // Presign thumbnail URLs for image/video files
      const enriched = canSign
        ? await Promise.all((files || []).map(async (f: any) => {
            const thumbKey = f.thumbnail_key || (f.mime_type?.startsWith('image/') ? f.wasabi_key : null)
            if (!thumbKey) return f
            const thumbnailUrl = await presignViewUrl(ENDPOINT, BUCKET, thumbKey, ACCESS, SECRET, REGION).catch(() => null)
            return { ...f, thumbnailUrl }
          }))
        : (files || [])

      return json({ files: enriched })
    }

    // PUT — rename, move, trash, restore
    if (req.method === 'PUT') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const allowed = ['name', 'folder_id', 'is_trashed', 'trashed_at', 'thumbnail_key']
      const updates: any = { updated_at: new Date().toISOString() }
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]
      if (body.is_trashed === false) updates.trashed_at = null

      const { data: updated, error } = await supabase.from('drive_files').update(updates).eq('id', fileId).eq('user_id', user.id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ file: updated })
    }

    // DELETE — permanent delete
    if (req.method === 'DELETE') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('drive_files').delete().eq('id', fileId).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
