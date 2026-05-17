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
    const { data: adminProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminProfile?.is_admin) return json({ error: 'Forbidden' }, 403)

    const url = new URL(req.url)
    const page   = parseInt(url.searchParams.get('page')   || '1')
    const limit  = parseInt(url.searchParams.get('limit')  || '20')
    const search = url.searchParams.get('search') || ''
    const filter = url.searchParams.get('filter') || 'all'
    const sort   = url.searchParams.get('sort')   || 'newest'
    const offset = (page - 1) * limit

    // ── 0. Plan-based filter: resolve user IDs upfront ───────────────────────
    const knownFilters = ['all', 'suspended', 'admins']
    let planFilterIds: string[] | null = null
    if (!knownFilters.includes(filter)) {
      const { data: planUsers } = await supabase
        .from('user_plans')
        .select('user_id, plans!inner(name)')
        .eq('is_active', true)
        .ilike('plans.name', filter)
      planFilterIds = (planUsers || []).map((u: any) => u.user_id)
      if (planFilterIds.length === 0) {
        return json({ users: [], total: 0, page, limit, plan_counts: {} })
      }
    }

    // ── 1. Query profiles ────────────────────────────────────────────────────
    let q = supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, is_admin, is_suspended, created_at', { count: 'exact' })

    if (search) q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    if (planFilterIds !== null)       q = q.in('id', planFilterIds)
    else if (filter === 'suspended')  q = q.eq('is_suspended', true)
    else if (filter === 'admins')     q = q.eq('is_admin', true)

    q = q.order('created_at', { ascending: sort === 'oldest' })
    q = q.range(offset, offset + limit - 1)

    const { data: profiles, count, error } = await q
    if (error) return json({ error: error.message }, 500)

    const profileList = profiles || []
    const userIds = profileList.map((p: any) => p.id)

    // ── 2. Fetch active plans for this page of users ─────────────────────────
    let planMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: userPlans } = await supabase
        .from('user_plans')
        .select('user_id, plans(id, name, storage_limit_gb)')
        .in('user_id', userIds)
        .eq('is_active', true)
      for (const up of (userPlans || [])) {
        planMap[(up as any).user_id] = (up as any).plans
      }
    }

    // ── 3. Plan distribution counts (for tab badges) ─────────────────────────
    const { data: allPlanDist } = await supabase
      .from('user_plans')
      .select('plans(name)')
      .eq('is_active', true)
    const plan_counts: Record<string, number> = {}
    for (const up of (allPlanDist || [])) {
      const name = ((up as any).plans?.name || '').toLowerCase()
      if (name) plan_counts[name] = (plan_counts[name] || 0) + 1
    }

    // ── 4. Auth metadata (last_sign_in_at) ───────────────────────────────────
    let authMap: Record<string, any> = {}
    try {
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      authMap = Object.fromEntries((authUsers || []).map((u: any) => [u.id, u]))
    } catch (_) { /* non-fatal */ }

    // ── 5. Merge ─────────────────────────────────────────────────────────────
    const users = profileList.map((p: any) => ({
      ...p,
      last_sign_in_at:    authMap[p.id]?.last_sign_in_at    || null,
      email_confirmed_at: authMap[p.id]?.email_confirmed_at || null,
      plan: planMap[p.id] || null,
    }))

    return json({ users, total: count || 0, page, limit, plan_counts })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
