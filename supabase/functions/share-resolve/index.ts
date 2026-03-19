import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    const token    = url.searchParams.get('token')
    const password = url.searchParams.get('password')
    if (!token) return json({ error: 'Token required' }, 400)

    const { data: link, error } = await supabase
      .from('share_links')
      .select('*, project_media(*), project_files(id, name, file_size, mime_type, wasabi_key), projects(id, name, color, icon)')
      .eq('token', token)
      .single()

    if (error || !link) return json({ error: 'Share link not found' }, 404)
    if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'Share link expired' }, 410)
    if (link.password && link.password !== password) return json({ error: 'Password required', requires_password: true }, 401)

    // Increment view count
    supabase.from('share_links').update({ view_count: (link.view_count || 0) + 1 }).eq('id', link.id).then(() => {})

    // If it's a project-level share, return the project's media list
    if (link.project_id && !link.project_media_id && !link.project_file_id) {
      const { data: assets } = await supabase
        .from('project_media')
        .select('id, name, type, mime_type, wasabi_key, wasabi_thumbnail_key, wasabi_status, duration, status, created_at')
        .eq('project_id', link.project_id)
        .eq('is_trashed', false)
        .order('created_at', { ascending: false })

      return json({
        link: { ...link, password: undefined },
        type: 'project',
        project: link.projects,
        assets: assets || [],
      })
    }

    // If it's a media share
    if (link.project_media_id && link.project_media) {
      return json({
        link: { ...link, password: undefined },
        type: 'media',
        media: link.project_media,
      })
    }

    // If it's a file share
    if (link.project_file_id && link.project_files) {
      return json({
        link: { ...link, password: undefined },
        type: 'file',
        file: link.project_files,
      })
    }

    return json({ error: 'Invalid share link' }, 400)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
