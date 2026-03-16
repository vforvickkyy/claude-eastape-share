import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('media_projects')
        .select('*, media_assets(count), media_team_members(count)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)
      return json({ projects: data })
    }

    if (req.method === 'POST') {
      const { name, description, color } = await req.json()
      if (!name) return json({ error: 'name is required' }, 400)

      const { data, error } = await supabase
        .from('media_projects')
        .insert({ name, description, color: color || '#7c3aed', user_id: user.id })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ project: data }, 201)
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const { name, description, color } = await req.json()
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name) updates.name = name
      if (description !== undefined) updates.description = description
      if (color) updates.color = color

      const { data, error } = await supabase
        .from('media_projects')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ project: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('media_projects').delete().eq('id', id).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
