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

    const { key, value } = await req.json()
    if (!key || value === undefined) return json({ error: 'key and value required' }, 400)

    const { error } = await supabase.from('platform_settings')
      .upsert({ key, value, updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return json({ error: error.message }, 500)

    await auditLog(`Updated setting: ${key} = ${value}`, 'setting', key, { key, value })
    return json({ ok: true, key, value })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
