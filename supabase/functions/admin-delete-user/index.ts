import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
    if (!profile?.is_admin) return json({ error: 'Forbidden: admin only' }, 403)

    async function auditLog(action: string, targetType: string, targetId: string, metadata = {}) {
      await supabase.from('admin_audit_logs').insert({ admin_id: user!.id, action, target_type: targetType, target_id: targetId, metadata })
    }

    if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405)

    const body = await req.json()
    const { userId } = body
    if (!userId) return json({ error: 'userId is required' }, 400)

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId)
    if (deleteErr) return json({ error: deleteErr.message }, 500)

    await auditLog(`Deleted user ${userId}`, 'user', userId)

    return json({ ok: true })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
