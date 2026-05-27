import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Storage helpers ───────────────────────────────────────────────────────────
const enc = new TextEncoder()

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}

async function deleteWasabiObject(
  key: string, endpoint: string, bucket: string,
  accessKeyId: string, secretAccessKey: string, region: string,
): Promise<void> {
  const now      = new Date()
  const date     = now.toISOString().slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'
  const host     = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const credentialScope = `${date}/${region}/s3/aws4_request`
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // SHA-256 of empty body

  const canonicalRequest = [
    'DELETE',
    `/${bucket}/${encodedKey}`,
    '',
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetime}\n`,
    'host;x-amz-content-sha256;x-amz-date',
    payloadHash,
  ].join('\n')

  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')

  const kDate    = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion  = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  const kSign    = await hmac(kService, 'aws4_request')
  const sig      = hex(await hmac(kSign, stringToSign))

  await fetch(`${endpoint}/${bucket}/${encodedKey}`, {
    method: 'DELETE',
    headers: {
      'Host': host,
      'X-Amz-Date': datetime,
      'X-Amz-Content-SHA256': payloadHash,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
    },
  }).catch(() => {})
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
    const id = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')

    async function hasProjectAccess(pid: string) {
      const { data: proj } = await supabase.from('projects').select('id, user_id').eq('id', pid).single()
      if (proj?.user_id === user!.id) return true
      const { data: mem } = await supabase.from('project_members').select('id').eq('project_id', pid).eq('user_id', user!.id).eq('accepted', true).single()
      return !!mem
    }

    if (req.method === 'GET') {
      if (id) {
        const { data, error } = await supabase.from('project_folders').select('*').eq('id', id).single()
        if (error || !data) return json({ error: 'Not found' }, 404)
        if (!(await hasProjectAccess(data.project_id))) return json({ error: 'Forbidden' }, 403)
        return json({ folder: data })
      }
      if (!projectId) return json({ error: 'projectId required' }, 400)
      if (!(await hasProjectAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      const { data, error } = await supabase
        .from('project_folders')
        .select('*')
        .eq('project_id', projectId)
        .order('name')
      if (error) return json({ error: error.message }, 500)
      return json({ folders: data || [] })
    }

    if (req.method === 'POST') {
      const { name, project_id, parent_id } = await req.json()
      if (!name || !project_id) return json({ error: 'name and project_id required' }, 400)
      if (!(await hasProjectAccess(project_id))) return json({ error: 'Forbidden' }, 403)

      const { data, error } = await supabase
        .from('project_folders')
        .insert({ name, project_id, parent_id: parent_id || null, user_id: user.id })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data }, 201)
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const { name, parent_id } = await req.json()
      const { data: folder } = await supabase.from('project_folders').select('project_id, user_id').eq('id', id).single()
      if (!folder) return json({ error: 'Not found' }, 404)
      if (folder.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name) updates.name = name
      if (parent_id !== undefined) updates.parent_id = parent_id || null

      const { data, error } = await supabase.from('project_folders').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)

      const { data: folder } = await supabase.from('project_folders').select('user_id, project_id').eq('id', id).single()
      if (!folder) return json({ error: 'Not found' }, 404)

      // Auth: owner, project owner, or editor/manager member
      if (folder.user_id !== user.id) {
        const { data: project } = await supabase.from('projects').select('user_id').eq('id', folder.project_id).single()
        if (project?.user_id !== user.id) {
          const { data: member } = await supabase.from('project_members').select('role').eq('project_id', folder.project_id).eq('user_id', user.id).eq('accepted', true).single()
          if (!member || member.role === 'viewer' || member.role === 'reviewer') return json({ error: 'Forbidden' }, 403)
        }
      }

      // Collect this folder + all descendants
      const { data: allFolders } = await supabase
        .from('project_folders').select('id, parent_id').eq('project_id', folder.project_id)

      function descendants(pid: string): string[] {
        const kids = (allFolders || []).filter((f: any) => f.parent_id === pid).map((f: any) => f.id as string)
        return kids.flatMap((kid: string) => [kid, ...descendants(kid)])
      }
      const folderIds = [id, ...descendants(id)]

      // Load all media in these folders for storage cleanup
      const { data: mediaList } = await supabase
        .from('project_media')
        .select('id, wasabi_key, wasabi_thumbnail_key, cloudflare_uid')
        .in('folder_id', folderIds)
      const media = mediaList || []

      // Storage credentials
      const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
      const CF_API_TOKEN  = Deno.env.get('CLOUDFLARE_API_TOKEN')
      const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
      const BUCKET   = Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? ''
      const ACCESS   = Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? ''
      const SECRET   = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? ''
      const REGION   = Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1'

      // Delete from Cloudflare Stream + Wasabi in parallel
      await Promise.all(media.map(async (m: any) => {
        if (m.cloudflare_uid && CF_ACCOUNT_ID && CF_API_TOKEN) {
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${m.cloudflare_uid}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
          ).catch(() => {})
        }
        if (ENDPOINT && BUCKET && ACCESS && SECRET) {
          for (const key of [m.wasabi_key, m.wasabi_thumbnail_key].filter(Boolean)) {
            await deleteWasabiObject(key, ENDPOINT, BUCKET, ACCESS, SECRET, REGION)
          }
        }
      }))

      // Hard-delete media DB records (clear all FK references first)
      if (media.length > 0) {
        const mediaIds = media.map((m: any) => m.id)
        await Promise.all([
          supabase.from('project_media_versions').delete().in('media_id', mediaIds).catch(() => {}),
          supabase.from('project_media_comments').delete().in('media_id', mediaIds).catch(() => {}),
          supabase.from('share_links').delete().in('project_media_id', mediaIds).catch(() => {}),
          supabase.from('shot_assets').delete().in('project_media_id', mediaIds).catch(() => {}),
          supabase.from('production_shots').update({ thumbnail_media_id: null }).in('thumbnail_media_id', mediaIds).catch(() => {}),
          supabase.from('production_shots').update({ source_media_id: null }).in('source_media_id', mediaIds).catch(() => {}),
        ])
        await supabase.from('project_media').delete().in('id', mediaIds).catch(() => {})
      }

      // Clear all FK references to these folders before deleting them
      await Promise.all([
        // project_files in these folders
        supabase.from('project_files').delete().in('folder_id', folderIds).catch(() => {}),
        // share links pointing to these folders
        supabase.from('share_links').delete().in('project_folder_id', folderIds).catch(() => {}),
        // production scenes linked to these folders — null the link, keep the scene
        supabase.from('production_scenes').update({ source_folder_id: null }).in('source_folder_id', folderIds).catch(() => {}),
      ])

      // Delete all folders (descendants + root)
      const { error } = await supabase.from('project_folders').delete().in('id', folderIds)
      if (error) return json({ error: error.message }, 500)

      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
