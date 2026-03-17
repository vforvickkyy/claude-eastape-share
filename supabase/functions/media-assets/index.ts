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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')
    const folderId = url.searchParams.get('folderId')
    const limitParam = url.searchParams.get('limit')

    // ── Helper: get user's role in a project (null = no access) ──────────────
    async function getProjectRole(pId: string): Promise<string | null> {
      const { data: proj } = await supabase.from('media_projects').select('user_id').eq('id', pId).single()
      if (!proj) return null
      if (proj.user_id === user!.id) return 'owner'
      const { data: mem } = await supabase.from('media_team_members').select('role').eq('project_id', pId).eq('user_id', user!.id).single()
      return mem?.role ?? null
    }

    if (req.method === 'GET') {
      // Single asset by id
      if (id) {
        const { data, error } = await supabase
          .from('media_assets')
          .select('*, media_asset_versions(*), media_comments(count)')
          .eq('id', id).single()
        if (error || !data) return json({ error: 'Not found' }, 404)
        // Allow if owner or team member
        if (data.user_id !== user.id) {
          const role = await getProjectRole(data.project_id)
          if (!role) return json({ error: 'Forbidden' }, 403)
        }
        return json({ asset: data })
      }

      // List — if projectId given, check access; else return user's own assets
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
        return json({ assets: data })
      }

      // No projectId — return all user's own assets
      let q = supabase.from('media_assets').select('*, media_projects(name)').eq('user_id', user.id)
      q = q.order('created_at', { ascending: false })
      if (limitParam) q = q.limit(parseInt(limitParam))
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ assets: data })
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const body = await req.json()

      // Check if user can edit this asset
      const { data: existing } = await supabase.from('media_assets').select('user_id, project_id, version, share_token, bunny_video_guid, bunny_playback_url, bunny_thumbnail_url').eq('id', id).single()
      if (!existing) return json({ error: 'Not found' }, 404)
      if (existing.user_id !== user.id) {
        const role = await getProjectRole(existing.project_id)
        if (role !== 'editor' && role !== 'owner') return json({ error: 'Forbidden' }, 403)
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      const ALLOWED = ['name', 'status', 'folder_id', 'share_enabled', 'bunny_video_guid', 'bunny_video_status', 'bunny_playback_url', 'bunny_thumbnail_url', 'duration', 'notes']
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
          bunny_video_guid: existing.bunny_video_guid,
          bunny_playback_url: existing.bunny_playback_url,
          bunny_thumbnail_url: existing.bunny_thumbnail_url,
          uploaded_by: user.id,
        })
        updates.version = ((existing.version as number) || 1) + 1
      }

      const { data, error } = await supabase.from('media_assets').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ asset: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { data: asset } = await supabase.from('media_assets').select('user_id, project_id, bunny_video_guid').eq('id', id).single()
      if (!asset) return json({ error: 'Not found' }, 404)
      if (asset.user_id !== user.id) {
        const role = await getProjectRole(asset.project_id)
        if (role !== 'editor' && role !== 'owner') return json({ error: 'Forbidden' }, 403)
      }

      if (asset.bunny_video_guid && Deno.env.get('BUNNY_STREAM_API_KEY') && Deno.env.get('BUNNY_STREAM_LIBRARY_ID')) {
        fetch(
          `https://video.bunnycdn.com/library/${Deno.env.get('BUNNY_STREAM_LIBRARY_ID')}/videos/${asset.bunny_video_guid}`,
          { method: 'DELETE', headers: { AccessKey: Deno.env.get('BUNNY_STREAM_API_KEY')! } }
        ).catch(() => {})
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
