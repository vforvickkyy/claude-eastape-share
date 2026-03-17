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
    const search = url.searchParams.get('search') || ''
    const filter = url.searchParams.get('filter') || 'all'
    const sort = url.searchParams.get('sort') || 'newest'
    const offset = (page - 1) * limit

    let q = supabase.from('profiles')
      .select('id, email, full_name, avatar_url, is_admin, is_suspended, created_at, user_plans(is_active, started_at, plans(id, name, storage_limit_gb))', { count: 'exact' })

    if (search) q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    if (filter === 'suspended') q = q.eq('is_suspended', true)
    if (filter === 'admins') q = q.eq('is_admin', true)
    q = q.order('created_at', { ascending: sort === 'oldest' })
    q = q.range(offset, offset + limit - 1)

    const { data: profiles, count, error } = await q
    if (error) return json({ error: error.message }, 500)

    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    const authMap = Object.fromEntries((authUsers || []).map(u => [u.id, u]))

    const users = (profiles || []).map((p: any) => ({
      ...p,
      last_sign_in_at: authMap[p.id]?.last_sign_in_at || null,
      email_confirmed_at: authMap[p.id]?.email_confirmed_at || null,
      plan: p.user_plans?.find((up: any) => up.is_active)?.plans || null,
    }))

    return json({ users, total: count || 0, page, limit })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
