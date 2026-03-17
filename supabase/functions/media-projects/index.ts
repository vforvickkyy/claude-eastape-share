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
      // Single project — owner or team member
      if (id) {
        const { data: owned } = await supabase
          .from('media_projects')
          .select('*, media_assets(count), media_team_members(count)')
          .eq('id', id).eq('user_id', user.id).single()
        if (owned) return json({ project: { ...owned, member_role: 'owner', is_shared: false } })

        const { data: mem } = await supabase
          .from('media_team_members')
          .select('role, media_projects(*, media_assets(count), media_team_members(count))')
          .eq('project_id', id).eq('user_id', user.id).single()
        if (mem?.media_projects) {
          return json({ project: { ...(mem.media_projects as Record<string, unknown>), member_role: mem.role, is_shared: true } })
        }
        return json({ error: 'Not found' }, 404)
      }

      // List — owned projects + projects user is invited to
      const [{ data: ownProjects }, { data: memberRows }] = await Promise.all([
        supabase.from('media_projects')
          .select('*, media_assets(count), media_team_members(count)')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
        supabase.from('media_team_members')
          .select('role, media_projects(*, media_assets(count), media_team_members(count))')
          .eq('user_id', user.id),
      ])

      const owned = (ownProjects || []).map(p => ({ ...p, member_role: 'owner', is_shared: false }))
      const shared = (memberRows || [])
        .filter(r => r.media_projects)
        .map(r => ({ ...(r.media_projects as Record<string, unknown>), member_role: r.role, is_shared: true }))

      return json({ projects: [...owned, ...shared] })
    }

    if (req.method === 'POST') {
      const { name, description, color } = await req.json()
      if (!name) return json({ error: 'name is required' }, 400)

      const { data, error } = await supabase
        .from('media_projects')
        .insert({ name, description, color: color || '#7c3aed', user_id: user.id })
        .select().single()
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
        .from('media_projects').update(updates).eq('id', id).eq('user_id', user.id).select().single()
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
