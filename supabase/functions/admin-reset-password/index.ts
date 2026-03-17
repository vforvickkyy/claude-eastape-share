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

    const { email, user_id, mode, new_password } = await req.json()

    if (mode === 'force') {
      if (!user_id || !new_password) return json({ error: 'user_id and new_password required' }, 400)
      if (new_password.length < 8) return json({ error: 'Password must be at least 8 chars' }, 400)
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) return json({ error: error.message }, 400)
      await auditLog(`Force reset password for user ${user_id}`, 'user', user_id, { method: 'admin_force_reset' })
      return json({ ok: true, message: 'Password updated successfully' })
    }

    // mode === 'link' (default)
    if (!email) return json({ error: 'email required' }, 400)
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email })
    if (error) return json({ error: error.message }, 400)
    await auditLog(`Sent password reset to ${email}`, 'user', user_id || email, { email })
    return json({ link: data.properties.action_link, email })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
