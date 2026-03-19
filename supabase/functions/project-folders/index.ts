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
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')

    // Verify project access helper
    async function hasProjectAccess(pid: string) {
      const { data: proj } = await supabase.from('projects').select('id, user_id').eq('id', pid).single()
      if (proj?.user_id === user!.id) return true
      const { data: mem } = await supabase.from('project_members').select('id').eq('project_id', pid).eq('user_id', user!.id).eq('accepted', true).single()
      return !!mem
    }

    if (req.method === 'GET') {
      if (id) {
        // Get single folder
        const { data, error } = await supabase.from('project_folders').select('*').eq('id', id).single()
        if (error || !data) return json({ error: 'Not found' }, 404)
        if (!(await hasProjectAccess(data.project_id))) return json({ error: 'Forbidden' }, 403)
        return json({ folder: data })
      }
      if (!projectId) return json({ error: 'projectId required' }, 400)
      if (!(await hasProjectAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      const { data, error } = await supabase
        .from('project_folders')
        .select('*')
        .eq('project_id', projectId)
        .order('name')
      if (error) return json({ error: error.message }, 500)
      return json({ folders: data || [] })
    }

    if (req.method === 'POST') {
      const { name, project_id, parent_id } = await req.json()
      if (!name || !project_id) return json({ error: 'name and project_id required' }, 400)
      if (!(await hasProjectAccess(project_id))) return json({ error: 'Forbidden' }, 403)

      const { data, error } = await supabase
        .from('project_folders')
        .insert({ name, project_id, parent_id: parent_id || null, user_id: user.id })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data }, 201)
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const { name, parent_id } = await req.json()
      const { data: folder } = await supabase.from('project_folders').select('project_id, user_id').eq('id', id).single()
      if (!folder) return json({ error: 'Not found' }, 404)
      if (folder.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name) updates.name = name
      if (parent_id !== undefined) updates.parent_id = parent_id || null

      const { data, error } = await supabase.from('project_folders').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { data: folder } = await supabase.from('project_folders').select('user_id').eq('id', id).single()
      if (!folder) return json({ error: 'Not found' }, 404)
      if (folder.user_id !== user.id) return json({ error: 'Forbidden' }, 403)
      const { error } = await supabase.from('project_folders').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
