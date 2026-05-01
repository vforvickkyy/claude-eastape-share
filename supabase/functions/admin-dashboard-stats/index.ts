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

    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 7)
    const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30)
    const prevMonthStart = new Date(now); prevMonthStart.setDate(now.getDate() - 60)

    const [
      { count: totalUsers },
      { count: newToday },
      { count: newThisWeek },
      { count: newThisMonth },
      { count: newPrevMonth },
      { count: activePlans },
      { count: totalDriveFiles },
      { count: totalProjectMedia },
      { count: totalProjects },
      { count: totalComments },
      { data: driveStorageData },
      { data: mediaStorageData },
      { data: recentUsers },
      { data: recentActivity },
      { count: cfReady },
      { count: cfProcessing },
      { count: cfFailed },
      { count: suspendedUsers },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekStart.toISOString()),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', prevMonthStart.toISOString()).lt('created_at', monthStart.toISOString()),
      supabase.from('user_plans').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('drive_files').select('*', { count: 'exact', head: true }).eq('is_trashed', false),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('is_trashed', false),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('media_comments').select('*', { count: 'exact', head: true }),
      supabase.from('drive_files').select('file_size').eq('is_trashed', false),
      supabase.from('project_media').select('file_size').eq('is_trashed', false),
      supabase.from('profiles')
        .select('id, full_name, email, avatar_url, created_at, is_suspended, is_admin, user_plans(is_active, plans(name, storage_limit_gb))')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('admin_audit_logs')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('cloudflare_status', 'ready'),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('cloudflare_status', 'processing'),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('cloudflare_status', 'error'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
    ])

    const driveStorageBytes = (driveStorageData || []).reduce((sum: number, f: any) => sum + (f.file_size || 0), 0)
    const mediaStorageBytes = (mediaStorageData || []).reduce((sum: number, f: any) => sum + (f.file_size || 0), 0)
    const totalStorageBytes = driveStorageBytes + mediaStorageBytes

    // Growth rate: % change in signups month over month
    const growthRate = newPrevMonth && newPrevMonth > 0
      ? Math.round(((newThisMonth || 0) - newPrevMonth) / newPrevMonth * 100)
      : null

    // Per-user storage breakdown (top 10)
    const [{ data: driveByUser }, { data: mediaByUser }, { data: allProfiles }] = await Promise.all([
      supabase.from('drive_files').select('user_id, file_size').eq('is_trashed', false),
      supabase.from('project_media').select('user_id, file_size').eq('is_trashed', false),
      supabase.from('profiles').select('id, full_name, email, avatar_url, user_plans(is_active, plans(name, storage_limit_gb))'),
    ])

    const storageByUser: Record<string, { drive: number, media: number }> = {}
    for (const f of (driveByUser || [])) {
      if (!f.user_id) continue
      if (!storageByUser[f.user_id]) storageByUser[f.user_id] = { drive: 0, media: 0 }
      storageByUser[f.user_id].drive += f.file_size || 0
    }
    for (const f of (mediaByUser || [])) {
      if (!f.user_id) continue
      if (!storageByUser[f.user_id]) storageByUser[f.user_id] = { drive: 0, media: 0 }
      storageByUser[f.user_id].media += f.file_size || 0
    }

    const topUsersByStorage = (allProfiles || [])
      .map((p: any) => {
        const usage = storageByUser[p.id] || { drive: 0, media: 0 }
        const plan = (p.user_plans || []).find((up: any) => up.is_active)?.plans
        const limitGb = plan?.storage_limit_gb ?? 2
        const totalBytes = usage.drive + usage.media
        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          avatar_url: p.avatar_url,
          plan_name: plan?.name || 'Free',
          storage_limit_gb: limitGb,
          total_bytes: totalBytes,
          drive_bytes: usage.drive,
          media_bytes: usage.media,
          pct: Math.min(100, Math.round(totalBytes / (limitGb * 1024 * 1024 * 1024) * 100)),
        }
      })
      .filter((u: any) => u.total_bytes > 0)
      .sort((a: any, b: any) => b.total_bytes - a.total_bytes)
      .slice(0, 8)

    return json({
      stats: {
        total_users: totalUsers || 0,
        suspended_users: suspendedUsers || 0,
        new_today: newToday || 0,
        new_this_week: newThisWeek || 0,
        new_this_month: newThisMonth || 0,
        growth_rate: growthRate,
        active_plans: activePlans || 0,
        total_drive_files: totalDriveFiles || 0,
        total_project_media: totalProjectMedia || 0,
        total_projects: totalProjects || 0,
        total_comments: totalComments || 0,
        storage_bytes: totalStorageBytes,
        drive_storage_bytes: driveStorageBytes,
        media_storage_bytes: mediaStorageBytes,
        cf_ready: cfReady || 0,
        cf_processing: cfProcessing || 0,
        cf_failed: cfFailed || 0,
      },
      recent_users: recentUsers || [],
      recent_activity: recentActivity || [],
      top_users_by_storage: topUsersByStorage,
    })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
