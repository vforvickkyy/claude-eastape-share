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

    const { data: userPlan } = await supabase
      .from('user_plans')
      .select('*, plans(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!userPlan) {
      return json({
        plan: null,
        plan_name: 'Free',
        storage_limit_gb: 5,
        max_files: 100,
        max_videos: 5,
        max_team_members: 1,
        drive_enabled: true,
        media_enabled: false,
        sharing_enabled: true,
        features: ['Drive', 'Basic Sharing', '5GB Storage'],
      })
    }

    return json({
      plan: userPlan.plans,
      plan_name: userPlan.plans?.name || 'Free',
      storage_limit_gb: userPlan.plans?.storage_limit_gb || 5,
      max_files: userPlan.plans?.max_files || 100,
      max_videos: userPlan.plans?.max_videos || 5,
      max_team_members: userPlan.plans?.max_team_members || 1,
      drive_enabled: userPlan.plans?.drive_enabled ?? true,
      media_enabled: userPlan.plans?.media_enabled ?? false,
      sharing_enabled: userPlan.plans?.sharing_enabled ?? true,
      features: userPlan.plans?.features || [],
    })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
