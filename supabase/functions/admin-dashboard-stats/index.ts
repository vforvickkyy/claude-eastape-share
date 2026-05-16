import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    // ── Time range ────────────────────────────────────────────────────────────
    const url = new URL(req.url)
    const range = url.searchParams.get('range') || '30d'
    const customFrom = url.searchParams.get('from')
    const customTo   = url.searchParams.get('to')

    const now = new Date()
    let rangeStart: Date
    const msMap: Record<string, number> = {
      '24h': 86_400_000,
      '7d':  604_800_000,
      '30d': 2_592_000_000,
      '90d': 7_776_000_000,
    }
    if (range === 'custom' && customFrom) {
      rangeStart = new Date(customFrom)
    } else {
      rangeStart = new Date(now.getTime() - (msMap[range] ?? msMap['30d']))
    }
    const rangeEnd = (range === 'custom' && customTo) ? new Date(customTo) : now

    // Previous period (same duration) for growth comparison
    const periodMs        = rangeEnd.getTime() - rangeStart.getTime()
    const prevRangeStart  = new Date(rangeStart.getTime() - periodMs)

    // ── Parallel DB queries ───────────────────────────────────────────────────
    const [
      { count: totalUsers },
      { count: suspendedUsers },
      { count: newUsersInRange },
      { count: newUsersPrevPeriod },
      { count: activePlans },
      { count: totalDriveFiles },
      { count: totalProjectMedia },
      { count: totalProjects },
      { count: newProjectsInRange },
      { count: totalComments },
      { count: newCommentsInRange },
      { count: cfReady },
      { count: cfProcessing },
      { count: cfFailed },
      { data: driveStorageData },
      { data: mediaStorageData },
      { data: activePlanRows },
      { data: recentSignups },
      { data: recentProjectsRaw },
      { data: auditActivity },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .gte('created_at', rangeStart.toISOString()).lte('created_at', rangeEnd.toISOString()),
      supabase.from('profiles').select('*', { count: 'exact', head: true })
        .gte('created_at', prevRangeStart.toISOString()).lt('created_at', rangeStart.toISOString()),
      supabase.from('user_plans').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('drive_files').select('*', { count: 'exact', head: true }).eq('is_trashed', false),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('is_trashed', false),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true })
        .gte('created_at', rangeStart.toISOString()).lte('created_at', rangeEnd.toISOString()),
      supabase.from('media_comments').select('*', { count: 'exact', head: true }),
      supabase.from('media_comments').select('*', { count: 'exact', head: true })
        .gte('created_at', rangeStart.toISOString()).lte('created_at', rangeEnd.toISOString()),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('cloudflare_status', 'ready'),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('cloudflare_status', 'processing'),
      supabase.from('project_media').select('*', { count: 'exact', head: true }).eq('cloudflare_status', 'error'),
      supabase.from('drive_files').select('file_size').eq('is_trashed', false),
      supabase.from('project_media').select('file_size').eq('is_trashed', false),
      supabase.from('user_plans').select('is_active, plans(name)').eq('is_active', true),
      supabase.from('profiles')
        .select('id, full_name, email, avatar_url, created_at, is_suspended, user_plans(is_active, plans(name))')
        .gte('created_at', rangeStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(12),
      supabase.from('projects')
        .select('id, name, created_at, user_id, profiles:user_id(full_name, email, avatar_url)')
        .gte('created_at', rangeStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(12),
      supabase.from('admin_audit_logs')
        .select('id, action, target_type, created_at, metadata, profiles(full_name, email, avatar_url)')
        .gte('created_at', rangeStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    // ── Storage totals ────────────────────────────────────────────────────────
    const driveStorageBytes = (driveStorageData || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)
    const mediaStorageBytes = (mediaStorageData || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)
    const totalStorageBytes = driveStorageBytes + mediaStorageBytes

    // ── Growth rate ───────────────────────────────────────────────────────────
    const growthRate = (newUsersPrevPeriod ?? 0) > 0
      ? Math.round(((newUsersInRange ?? 0) - (newUsersPrevPeriod ?? 0)) / (newUsersPrevPeriod ?? 1) * 100)
      : null

    // ── Plan distribution ─────────────────────────────────────────────────────
    const planCounts: Record<string, number> = {}
    for (const up of (activePlanRows || [])) {
      const name = (up as any).plans?.name || 'Paid'
      planCounts[name] = (planCounts[name] || 0) + 1
    }
    const freeUserCount = (totalUsers || 0) - (activePlans || 0)

    // ── Cloudflare Stream API ─────────────────────────────────────────────────
    const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
    const CF_API_TOKEN  = Deno.env.get('CLOUDFLARE_API_TOKEN')
    let cfMinutesStored   = 0
    let cfMinutesStreamed  = 0

    if (CF_ACCOUNT_ID && CF_API_TOKEN) {
      const cfH = { 'Authorization': `Bearer ${CF_API_TOKEN}` }
      const [storageRes, analyticsRes] = await Promise.allSettled([
        fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/storage-usage`,
          { headers: cfH }
        ),
        fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/analytics/views?metrics[]=minutesViewedByStream&since=${rangeStart.toISOString()}&until=${rangeEnd.toISOString()}`,
          { headers: cfH }
        ),
      ])
      if (storageRes.status === 'fulfilled' && storageRes.value.ok) {
        const d = await storageRes.value.json()
        cfMinutesStored = d.result?.totalStorageMinutes ?? 0
      }
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
        const d = await analyticsRes.value.json()
        cfMinutesStreamed = d.result?.totals?.minutesViewedByStream ?? 0
      }
    }

    // ── Platform activity feed (unified timeline) ─────────────────────────────
    type ActivityItem = {
      id: string; type: string; created_at: string
      actor_name: string; actor_avatar: string | null
      description: string; detail: string | null
    }
    const platformActivity: ActivityItem[] = []

    for (const u of (recentSignups || [])) {
      platformActivity.push({
        id: `signup_${u.id}`,
        type: 'signup',
        created_at: u.created_at,
        actor_name: (u as any).full_name || (u as any).email || 'Unknown',
        actor_avatar: (u as any).avatar_url || null,
        description: 'joined the platform',
        detail: (u as any).email || null,
      })
    }
    for (const p of (recentProjectsRaw || [])) {
      platformActivity.push({
        id: `project_${p.id}`,
        type: 'project_create',
        created_at: p.created_at,
        actor_name: (p.profiles as any)?.full_name || (p.profiles as any)?.email || 'Unknown',
        actor_avatar: (p.profiles as any)?.avatar_url || null,
        description: 'created project',
        detail: p.name || null,
      })
    }
    for (const a of (auditActivity || [])) {
      platformActivity.push({
        id: `audit_${(a as any).id}`,
        type: (a as any).action?.toLowerCase().includes('delete') ? 'delete' : 'admin',
        created_at: (a as any).created_at,
        actor_name: (a as any).profiles?.full_name || (a as any).profiles?.email || 'Admin',
        actor_avatar: (a as any).profiles?.avatar_url || null,
        description: (a as any).action || '',
        detail: (a as any).target_type || null,
      })
    }
    platformActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // ── Top users by storage ──────────────────────────────────────────────────
    const [{ data: driveByUser }, { data: mediaByUser }, { data: allProfiles }] = await Promise.all([
      supabase.from('drive_files').select('user_id, file_size').eq('is_trashed', false),
      supabase.from('project_media').select('user_id, file_size').eq('is_trashed', false),
      supabase.from('profiles').select('id, full_name, email, avatar_url, user_plans(is_active, plans(name, storage_limit_gb))'),
    ])

    const storageByUser: Record<string, { drive: number; media: number }> = {}
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
        const usage   = storageByUser[p.id] || { drive: 0, media: 0 }
        const plan    = (p.user_plans || []).find((up: any) => up.is_active)?.plans
        const limitGb = plan?.storage_limit_gb ?? 2
        const total   = usage.drive + usage.media
        return {
          id: p.id, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url,
          plan_name: plan?.name || 'Free',
          storage_limit_gb: limitGb,
          total_bytes: total, drive_bytes: usage.drive, media_bytes: usage.media,
          pct: Math.min(100, Math.round(total / (limitGb * 1024 * 1024 * 1024) * 100)),
        }
      })
      .filter((u: any) => u.total_bytes > 0)
      .sort((a: any, b: any) => b.total_bytes - a.total_bytes)
      .slice(0, 8)

    return json({
      stats: {
        total_users:          totalUsers        || 0,
        suspended_users:      suspendedUsers    || 0,
        new_users_in_range:   newUsersInRange   || 0,
        growth_rate:          growthRate,
        active_plans:         activePlans       || 0,
        free_users:           freeUserCount,
        plan_distribution:    planCounts,
        total_drive_files:    totalDriveFiles   || 0,
        total_project_media:  totalProjectMedia || 0,
        total_projects:       totalProjects     || 0,
        new_projects_in_range: newProjectsInRange || 0,
        total_comments:       totalComments     || 0,
        new_comments_in_range: newCommentsInRange || 0,
        storage_bytes:        totalStorageBytes,
        drive_storage_bytes:  driveStorageBytes,
        media_storage_bytes:  mediaStorageBytes,
        cf_ready:             cfReady           || 0,
        cf_processing:        cfProcessing      || 0,
        cf_failed:            cfFailed          || 0,
        cf_minutes_stored:    cfMinutesStored,
        cf_minutes_streamed:  cfMinutesStreamed,
      },
      platform_activity:    platformActivity.slice(0, 30),
      recent_signups:       recentSignups      || [],
      top_users_by_storage: topUsersByStorage,
    })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
