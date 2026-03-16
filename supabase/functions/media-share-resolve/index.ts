import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    const password = url.searchParams.get('password')
    if (!token) return json({ error: 'token required' }, 400)

    const { data: link, error } = await supabase.from('media_share_links').select('*').eq('token', token).single()
    if (error || !link) return json({ error: 'Share link not found' }, 404)

    if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'This share link has expired' }, 410)

    if (link.password) {
      if (!password) return json({ error: 'Password required', passwordRequired: true }, 401)
      if (password !== link.password) return json({ error: 'Incorrect password' }, 403)
    }

    supabase.from('media_share_links').update({ view_count: (link.view_count || 0) + 1 }).eq('token', token).then(() => {}).catch(() => {})

    const payload = { allowDownload: link.allow_download, allowComments: link.allow_comments, expiresAt: link.expires_at }

    if (link.asset_id) {
      const { data: asset } = await supabase
        .from('media_assets')
        .select('id, name, type, bunny_video_guid, bunny_video_status, bunny_playback_url, bunny_thumbnail_url, duration, file_size, status, mime_type, created_at')
        .eq('id', link.asset_id)
        .single()
      if (!asset) return json({ error: 'Asset not found' }, 404)

      let comments: unknown[] = []
      if (link.allow_comments) {
        const { data: c } = await supabase.from('media_comments').select('*').eq('asset_id', link.asset_id).order('created_at')
        comments = c || []
      }
      return json({ ...payload, type: 'asset', asset, comments })
    }

    if (link.folder_id) {
      const { data: folder } = await supabase.from('media_folders').select('id, name, project_id, created_at').eq('id', link.folder_id).single()
      const { data: assets } = await supabase.from('media_assets').select('id, name, type, bunny_thumbnail_url, duration, status, created_at').eq('folder_id', link.folder_id)
      return json({ ...payload, type: 'folder', folder, assets: assets || [] })
    }

    if (link.project_id) {
      const { data: project } = await supabase.from('media_projects').select('id, name, description, color, created_at').eq('id', link.project_id).single()
      const { data: assets } = await supabase.from('media_assets').select('id, name, type, bunny_thumbnail_url, duration, status, created_at').eq('project_id', link.project_id)
      return json({ ...payload, type: 'project', project, assets: assets || [] })
    }

    return json({ error: 'Share link has no target' }, 500)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
