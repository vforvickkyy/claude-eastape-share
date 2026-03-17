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

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()

    const [
      { count: totalUsers },
      { count: newToday },
      { count: activePlans },
      { count: totalFiles },
      { count: totalVideos },
      { count: totalProjects },
      { count: totalComments },
      { data: storageData },
      { data: recentUsers },
      { data: recentActivity },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
      supabase.from('user_plans').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('shares').select('*', { count: 'exact', head: true }).eq('is_trashed', false),
      supabase.from('media_assets').select('*', { count: 'exact', head: true }),
      supabase.from('media_projects').select('*', { count: 'exact', head: true }),
      supabase.from('media_comments').select('*', { count: 'exact', head: true }),
      supabase.from('shares').select('file_size').eq('is_trashed', false),
      supabase.from('profiles').select('id, full_name, email, avatar_url, created_at, is_suspended, is_admin, user_plans(is_active, plans(name))').order('created_at', { ascending: false }).limit(10),
      supabase.from('admin_audit_logs').select('*, profiles(full_name, email)').order('created_at', { ascending: false }).limit(20),
    ])

    const totalStorageBytes = (storageData || []).reduce((sum: number, s: any) => sum + (s.file_size || 0), 0)

    return json({
      stats: {
        total_users: totalUsers || 0,
        new_today: newToday || 0,
        active_plans: activePlans || 0,
        total_files: totalFiles || 0,
        total_videos: totalVideos || 0,
        total_projects: totalProjects || 0,
        total_comments: totalComments || 0,
        storage_bytes: totalStorageBytes,
      },
      recent_users: recentUsers || [],
      recent_activity: recentActivity || [],
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
