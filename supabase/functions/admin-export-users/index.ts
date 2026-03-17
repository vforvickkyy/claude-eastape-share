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

    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, created_at, is_suspended, is_admin')
      .order('created_at', { ascending: false })

    const { data: userPlans } = await supabase
      .from('user_plans')
      .select('user_id, plans(name, price_monthly)')
      .eq('is_active', true)

    // Build map of userId → plan
    const planMap = Object.fromEntries((userPlans || []).map((up: any) => [up.user_id, up.plans]))

    const headers = ['ID', 'Name', 'Email', 'Plan', 'Suspended', 'Admin', 'Joined']
    const rows = (profiles || []).map((p: any) => [
      p.id, p.full_name || '', p.email || '',
      planMap[p.id]?.name || 'None',
      p.is_suspended ? 'Yes' : 'No',
      p.is_admin ? 'Yes' : 'No',
      p.created_at?.split('T')[0] || ''
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')

    await auditLog('Exported users CSV', 'user', 'all')

    return new Response(csv, {
      headers: {
        ...cors,
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="eastape-users.csv"'
      }
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
