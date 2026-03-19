import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)

    if (req.method === 'GET') {
      if (!projectId) return json({ error: 'projectId required' }, 400)

      const { data: activity, error } = await supabase
        .from('project_activity')
        .select('*, profiles:user_id(full_name, avatar_url)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return json({ error: error.message }, 500)
      return json({ activity: activity || [] })
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { project_id, action, entity_type, entity_id, entity_name, metadata } = body
      if (!project_id || !action) return json({ error: 'project_id and action required' }, 400)

      const { data: entry, error } = await supabase.from('project_activity').insert({
        project_id, user_id: user.id, action, entity_type, entity_id, entity_name, metadata: metadata || {},
      }).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ activity: entry })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
