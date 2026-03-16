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

    if (req.method === 'GET') {
      if (id) {
        const { data, error } = await supabase
          .from('media_assets')
          .select('*, media_asset_versions(*), media_comments(count)')
          .eq('id', id)
          .eq('user_id', user.id)
          .single()
        if (error) return json({ error: 'Not found' }, 404)
        return json({ asset: data })
      }

      let q = supabase.from('media_assets').select('*').eq('user_id', user.id)
      if (projectId) q = q.eq('project_id', projectId)
      if (folderId === 'null' || folderId === 'root') q = q.is('folder_id', null)
      else if (folderId) q = q.eq('folder_id', folderId)

      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)
      return json({ assets: data })
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

      const ALLOWED = ['name', 'status', 'folder_id', 'share_enabled', 'bunny_video_guid', 'bunny_video_status', 'bunny_playback_url', 'bunny_thumbnail_url', 'duration', 'notes']
      for (const key of ALLOWED) {
        if (key in body) updates[key] = body[key]
      }

      if (body.share_enabled && !body.share_token) {
        const { data: existing } = await supabase.from('media_assets').select('share_token').eq('id', id).single()
        if (!existing?.share_token) updates.share_token = randomHex(16)
      }

      if (body.version_bump) {
        // Save current version snapshot before bumping
        const { data: current } = await supabase
          .from('media_assets')
          .select('version, bunny_video_guid, bunny_playback_url, bunny_thumbnail_url')
          .eq('id', id).single()
        if (current) {
          await supabase.from('media_asset_versions').insert({
            asset_id: id,
            version_number: current.version,
            bunny_video_guid: current.bunny_video_guid,
            bunny_playback_url: current.bunny_playback_url,
            bunny_thumbnail_url: current.bunny_thumbnail_url,
            uploaded_by: user.id,
          })
        }
        updates.version = ((current?.version as number) || 1) + 1
      }

      const { data, error } = await supabase
        .from('media_assets')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ asset: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)

      const { data: asset } = await supabase.from('media_assets').select('bunny_video_guid').eq('id', id).single()
      if (asset?.bunny_video_guid && Deno.env.get('BUNNY_STREAM_API_KEY') && Deno.env.get('BUNNY_STREAM_LIBRARY_ID')) {
        fetch(
          `https://video.bunnycdn.com/library/${Deno.env.get('BUNNY_STREAM_LIBRARY_ID')}/videos/${asset.bunny_video_guid}`,
          { method: 'DELETE', headers: { AccessKey: Deno.env.get('BUNNY_STREAM_API_KEY')! } }
        ).catch(() => {})
      }

      const { error } = await supabase.from('media_assets').delete().eq('id', id).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
