import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Presigned GET URL (thumbnail) ─────────────────────────────────────────
const enc = new TextEncoder()

async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function presignGet(
  endpoint: string, bucket: string, key: string,
  accessKeyId: string, secretAccessKey: string, region: string,
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
  qp.set('response-cache-control', 'max-age=3600')

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
    const canSign  = !!(ENDPOINT && BUCKET && ACCESS && SECRET)

    const url = new URL(req.url)
    const id         = url.searchParams.get('id')
    const projectId  = url.searchParams.get('projectId')
    const folderId   = url.searchParams.get('folderId')
    const limitParam = url.searchParams.get('limit')

    async function getProjectRole(pId: string): Promise<string | null> {
      const { data: proj } = await supabase.from('media_projects').select('user_id').eq('id', pId).single()
      if (!proj) return null
      if (proj.user_id === user!.id) return 'owner'
      const { data: mem } = await supabase.from('media_team_members').select('role').eq('project_id', pId).eq('user_id', user!.id).single()
      return mem?.role ?? null
    }

    // Add presigned thumbnail URL to an asset (if it has a thumbnail key)
    async function withThumbnail(asset: any): Promise<any> {
      if (!canSign || !asset?.wasabi_thumbnail_key) return asset
      try {
        const thumbnailUrl = await presignGet(ENDPOINT, BUCKET, asset.wasabi_thumbnail_key, ACCESS, SECRET, REGION, 3600)
        return { ...asset, thumbnailUrl }
      } catch {
        return asset
      }
    }

    if (req.method === 'GET') {
      // Single asset
      if (id) {
        const { data, error } = await supabase
          .from('media_assets')
          .select('*, media_asset_versions(*)')
          .eq('id', id).single()
        if (error || !data) return json({ error: 'Not found' }, 404)
        if (data.user_id !== user.id) {
          const role = await getProjectRole(data.project_id)
          if (!role) return json({ error: 'Forbidden' }, 403)
        }
        return json({ asset: await withThumbnail(data) })
      }

      // List by project
      if (projectId) {
        const role = await getProjectRole(projectId)
        if (!role) return json({ error: 'Forbidden' }, 403)

        let q = supabase.from('media_assets').select('*, media_projects(name)').eq('project_id', projectId)
        if (folderId === 'null' || folderId === 'root') q = q.is('folder_id', null)
        else if (folderId) q = q.eq('folder_id', folderId)
        q = q.order('created_at', { ascending: false })
        if (limitParam) q = q.limit(parseInt(limitParam))
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        const assets = await Promise.all((data || []).map(withThumbnail))
        return json({ assets })
      }

      // All user's own assets
      let q = supabase.from('media_assets').select('*, media_projects(name)').eq('user_id', user.id)
      q = q.order('created_at', { ascending: false })
      if (limitParam) q = q.limit(parseInt(limitParam))
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      const assets = await Promise.all((data || []).map(withThumbnail))
      return json({ assets })
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const body = await req.json()

      const { data: existing } = await supabase.from('media_assets')
        .select('user_id, project_id, version, share_token, wasabi_key, wasabi_thumbnail_key')
        .eq('id', id).single()
      if (!existing) return json({ error: 'Not found' }, 404)
      if (existing.user_id !== user.id) {
        const role = await getProjectRole(existing.project_id)
        if (role !== 'editor' && role !== 'owner') return json({ error: 'Forbidden' }, 403)
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      const ALLOWED = ['name', 'status', 'folder_id', 'share_enabled', 'wasabi_key', 'wasabi_thumbnail_key', 'wasabi_status', 'duration', 'width', 'height', 'notes']
      for (const key of ALLOWED) {
        if (key in body) updates[key] = body[key]
      }

      if (body.share_enabled && !existing.share_token) {
        updates.share_token = randomHex(16)
      }

      if (body.version_bump) {
        await supabase.from('media_asset_versions').insert({
          asset_id: id,
          version_number: existing.version,
          wasabi_key: existing.wasabi_key,
          wasabi_thumbnail_key: existing.wasabi_thumbnail_key,
          uploaded_by: user.id,
        })
        updates.version = ((existing.version as number) || 1) + 1
      }

      const { data, error } = await supabase.from('media_assets').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ asset: await withThumbnail(data) })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { data: asset } = await supabase.from('media_assets').select('user_id, project_id').eq('id', id).single()
      if (!asset) return json({ error: 'Not found' }, 404)
      if (asset.user_id !== user.id) {
        const role = await getProjectRole(asset.project_id)
        if (role !== 'editor' && role !== 'owner') return json({ error: 'Forbidden' }, 403)
      }

      const { error } = await supabase.from('media_assets').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
