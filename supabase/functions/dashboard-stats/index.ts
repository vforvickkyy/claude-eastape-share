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
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const uid = user.id

    const [projectsRes, driveFilesRes, projectFilesRes, projectMediaRes, recentFilesRes, recentMediaRes, activityRes] = await Promise.all([
      supabase.from('projects').select('id, name, color, icon, status, client_name, due_date, updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(10),
      supabase.from('drive_files').select('file_size').eq('user_id', uid).eq('is_trashed', false),
      supabase.from('project_files').select('file_size').eq('user_id', uid).eq('is_trashed', false),
      supabase.from('project_media').select('file_size, type').eq('user_id', uid).eq('is_trashed', false),
      supabase.from('drive_files').select('*').eq('user_id', uid).eq('is_trashed', false).order('created_at', { ascending: false }).limit(8),
      supabase.from('project_media').select('*, projects(name, color)').eq('user_id', uid).eq('is_trashed', false).order('created_at', { ascending: false }).limit(6),
      supabase.from('project_activity').select('*, profiles:user_id(full_name, avatar_url)').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
    ])

    const driveBytes   = (driveFilesRes.data || []).reduce((s: number, r: any) => s + (r.file_size || 0), 0)
    const filesBytes   = (projectFilesRes.data || []).reduce((s: number, r: any) => s + (r.file_size || 0), 0)
    const mediaBytes   = (projectMediaRes.data || []).reduce((s: number, r: any) => s + (r.file_size || 0), 0)
    const totalBytes   = driveBytes + filesBytes + mediaBytes
    const videoCount   = (projectMediaRes.data || []).filter((m: any) => m.type === 'video').length

    return json({
      stats: {
        project_count: (projectsRes.data || []).length,
        file_count: (driveFilesRes.data || []).length + (projectFilesRes.data || []).length,
        video_count: videoCount,
        storage_bytes: totalBytes,
      },
      recent_projects: projectsRes.data || [],
      recent_files: recentFilesRes.data || [],
      recent_media: recentMediaRes.data || [],
      activity: activityRes.data || [],
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
