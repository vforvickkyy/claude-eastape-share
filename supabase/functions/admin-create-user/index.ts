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

    const { email, password, full_name, plan_id, is_admin: makeAdmin } = await req.json()
    if (!email || !password) return json({ error: 'email and password required' }, 400)
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' }
    })
    if (createErr) return json({ error: createErr.message }, 400)
    const uid = newUser.user.id

    await supabase.from('profiles').upsert({
      id: uid, email, full_name: full_name || '', is_admin: makeAdmin || false
    })

    let targetPlanId = plan_id
    if (!targetPlanId) {
      const { data: freePlan } = await supabase.from('plans').select('id').eq('name', 'Free').single()
      targetPlanId = freePlan?.id
    }
    if (targetPlanId) {
      await supabase.from('user_plans').insert({ user_id: uid, plan_id: targetPlanId, is_active: true, assigned_by: adminId })
    }

    await auditLog(`Created user: ${email}`, 'user', uid, { email, full_name })
    return json({ user: { id: uid, email, full_name } }, 201)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
