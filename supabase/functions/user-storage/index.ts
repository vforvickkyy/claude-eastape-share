import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

    // ── 1. Drive bytes (shares not trashed, not storage-deleted) ─────────────
    const { data: driveData } = await supabase
      .from('shares')
      .select('file_size')
      .eq('user_id', user.id)
      .eq('is_trashed', false)
      .eq('storage_deleted', false)

    const drive_bytes = (driveData || []).reduce((sum: number, r: any) => sum + (r.file_size || 0), 0)

    // ── 2. Media bytes (all assets for this user) ─────────────────────────────
    const { data: mediaData } = await supabase
      .from('media_assets')
      .select('file_size')
      .eq('user_id', user.id)

    const media_bytes = (mediaData || []).reduce((sum: number, r: any) => sum + (r.file_size || 0), 0)

    const used_bytes = drive_bytes + media_bytes

    // ── 3. Plan limit ─────────────────────────────────────────────────────────
    const { data: userPlan } = await supabase
      .from('user_plans')
      .select('plans(name, display_name, storage_limit_gb)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    const plan: any = (userPlan as any)?.plans
    const limit_gb   = plan?.storage_limit_gb ?? 2   // Free default: 2 GB
    const limit_bytes = limit_gb * 1024 * 1024 * 1024

    return json({
      drive_bytes,
      media_bytes,
      used_bytes,
      limit_bytes,
      limit_gb,
      plan_name:    plan?.name         ?? 'free',
      display_name: plan?.display_name ?? 'Starter',
      percent_used: limit_bytes > 0 ? Math.min(100, Math.round((used_bytes / limit_bytes) * 100)) : 0,
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
