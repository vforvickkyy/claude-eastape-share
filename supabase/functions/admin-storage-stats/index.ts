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
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const search = url.searchParams.get('search') || ''
    const offset = (page - 1) * limit

    // Overview: total bytes and files
    const { data: shareStats } = await supabase
      .from('shares')
      .select('file_size')
      .eq('is_trashed', false)

    const totalBytes = (shareStats || []).reduce((sum: number, s: any) => sum + (s.file_size || 0), 0)
    const totalFiles = (shareStats || []).length

    // Per-user breakdown
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, user_plans(is_active, plan_id, plans(id, name, storage_limit_gb))')
      .order('email')

    // Get all shares grouped by user
    const { data: allShares } = await supabase
      .from('shares')
      .select('user_id, file_size')
      .eq('is_trashed', false)

    // Group shares by user_id
    const sharesByUser: Record<string, { count: number, bytes: number }> = {}
    for (const s of (allShares || [])) {
      if (!s.user_id) continue
      if (!sharesByUser[s.user_id]) sharesByUser[s.user_id] = { count: 0, bytes: 0 }
      sharesByUser[s.user_id].count++
      sharesByUser[s.user_id].bytes += s.file_size || 0
    }

    let userStats = (profiles || []).map((p: any) => {
      const activePlan = p.user_plans?.find((up: any) => up.is_active)?.plans
      const usage = sharesByUser[p.id] || { count: 0, bytes: 0 }
      return {
        id: p.id, email: p.email, full_name: p.full_name, avatar_url: p.avatar_url,
        file_count: usage.count,
        total_bytes: usage.bytes,
        storage_limit_gb: activePlan?.storage_limit_gb || 5,
        plan_name: activePlan?.name || 'Free',
      }
    })

    if (search) {
      const q = search.toLowerCase()
      userStats = userStats.filter((u: any) =>
        u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q)
      )
    }

    userStats.sort((a: any, b: any) => b.total_bytes - a.total_bytes)

    // Find largest file
    const { data: largestFile } = await supabase
      .from('shares')
      .select('file_size, filename')
      .eq('is_trashed', false)
      .order('file_size', { ascending: false })
      .limit(1)
      .single()

    return json({
      overview: {
        total_bytes: totalBytes,
        total_files: totalFiles,
        user_count: (profiles || []).length,
        largest_file_bytes: largestFile?.file_size || 0,
        largest_file_name: largestFile?.filename || null,
      },
      users: userStats.slice(offset, offset + limit),
      total: userStats.length,
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
