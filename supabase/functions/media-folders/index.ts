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
    const projectId = url.searchParams.get('projectId')
    const parentId = url.searchParams.get('parentId')

    // ── Helper: get user's role in a project ─────────────────────────────────
    async function getProjectRole(pId: string): Promise<string | null> {
      const { data: proj } = await supabase.from('media_projects').select('user_id').eq('id', pId).single()
      if (!proj) return null
      if (proj.user_id === user!.id) return 'owner'
      const { data: mem } = await supabase.from('media_team_members').select('role').eq('project_id', pId).eq('user_id', user!.id).single()
      return mem?.role ?? null
    }

    if (req.method === 'GET') {
      if (id) {
        // Single folder — allow if owner or team member
        const { data, error } = await supabase.from('media_folders').select('*').eq('id', id).single()
        if (error || !data) return json({ error: 'Not found' }, 404)
        if (data.user_id !== user.id) {
          const role = await getProjectRole(data.project_id)
          if (!role) return json({ error: 'Forbidden' }, 403)
        }
        return json({ folder: data })
      }

      if (projectId) {
        const role = await getProjectRole(projectId)
        if (!role) return json({ error: 'Forbidden' }, 403)

        let q = supabase.from('media_folders').select('*').eq('project_id', projectId)
        if (parentId === 'null' || parentId === 'root') q = q.is('parent_folder_id', null)
        else if (parentId) q = q.eq('parent_folder_id', parentId)
        const { data, error } = await q.order('name')
        if (error) return json({ error: error.message }, 500)
        return json({ folders: data })
      }

      // Fallback — user's own folders
      let q = supabase.from('media_folders').select('*').eq('user_id', user.id)
      if (parentId === 'null' || parentId === 'root') q = q.is('parent_folder_id', null)
      else if (parentId) q = q.eq('parent_folder_id', parentId)
      const { data, error } = await q.order('name')
      if (error) return json({ error: error.message }, 500)
      return json({ folders: data })
    }

    if (req.method === 'POST') {
      const { name, projectId: pId, parentFolderId } = await req.json()
      if (!name || !pId) return json({ error: 'name and projectId required' }, 400)

      const role = await getProjectRole(pId)
      if (role !== 'owner' && role !== 'editor') return json({ error: 'Forbidden' }, 403)

      const { data, error } = await supabase
        .from('media_folders')
        .insert({ name, project_id: pId, parent_folder_id: parentFolderId || null, user_id: user.id })
        .select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data }, 201)
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const { name } = await req.json()
      const { data: folder } = await supabase.from('media_folders').select('user_id, project_id').eq('id', id).single()
      if (!folder) return json({ error: 'Not found' }, 404)
      if (folder.user_id !== user.id) {
        const role = await getProjectRole(folder.project_id)
        if (role !== 'owner' && role !== 'editor') return json({ error: 'Forbidden' }, 403)
      }
      const { data, error } = await supabase.from('media_folders').update({ name }).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { data: folder } = await supabase.from('media_folders').select('user_id, project_id').eq('id', id).single()
      if (!folder) return json({ error: 'Not found' }, 404)
      if (folder.user_id !== user.id) {
        const role = await getProjectRole(folder.project_id)
        if (role !== 'owner' && role !== 'editor') return json({ error: 'Forbidden' }, 403)
      }
      const { error } = await supabase.from('media_folders').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
