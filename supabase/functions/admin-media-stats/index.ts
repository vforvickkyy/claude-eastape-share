import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)
    const adminId = user.id

    async function auditLog(action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
      await supabase.from('admin_audit_logs').insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, metadata })
    }

    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const status = url.searchParams.get('status') || 'all'
    const search = url.searchParams.get('search') || ''
    const offset = (page - 1) * limit

    // Overview counts
    const [
      { count: total },
      { count: ready },
      { count: processing },
      { count: failed }
    ] = await Promise.all([
      supabase.from('media_assets').select('*', { count: 'exact', head: true }),
      supabase.from('media_assets').select('*', { count: 'exact', head: true }).eq('bunny_video_status', 'ready'),
      supabase.from('media_assets').select('*', { count: 'exact', head: true }).eq('bunny_video_status', 'uploading'),
      supabase.from('media_assets').select('*', { count: 'exact', head: true }).eq('bunny_video_status', 'error'),
    ])

    // Size and duration totals
    const { data: sizeData } = await supabase.from('media_assets').select('file_size, duration')
    const totalSize = (sizeData || []).reduce((s: number, a: any) => s + (a.file_size || 0), 0)
    const totalSeconds = (sizeData || []).reduce((s: number, a: any) => s + (a.duration || 0), 0)

    // Videos list with owner and project
    let q = supabase.from('media_assets')
      .select('id, name, bunny_video_status, bunny_video_guid, bunny_thumbnail_url, bunny_playback_url, duration, file_size, created_at, user_id, project_id, profiles(full_name, email), media_projects(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status !== 'all') q = q.eq('bunny_video_status', status)
    if (search) q = q.or(`name.ilike.%${search}%`)

    const { data: videos, count: videosCount } = await q

    // Failed uploads
    const { data: failedUploads } = await supabase
      .from('media_assets')
      .select('id, name, created_at, user_id, profiles(full_name, email)')
      .eq('bunny_video_status', 'error')
      .order('created_at', { ascending: false })
      .limit(20)

    return json({
      overview: { total, ready, processing, failed, total_size: totalSize, total_seconds: totalSeconds },
      videos: videos || [],
      videos_total: videosCount || 0,
      failed_uploads: failedUploads || [],
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
