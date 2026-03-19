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
    const projectId = url.searchParams.get('id')

    // GET — list projects or get one
    if (req.method === 'GET') {
      if (projectId) {
        // Single project with counts
        const { data: project, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
        if (error || !project) return json({ error: 'Project not found' }, 404)
        if (project.user_id !== user.id) {
          const { data: member } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).eq('accepted', true).single()
          if (!member) return json({ error: 'Forbidden' }, 403)
        }
        // Fetch counts
        const [filesRes, mediaRes, membersRes] = await Promise.all([
          supabase.from('project_files').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('is_trashed', false),
          supabase.from('project_media').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('is_trashed', false),
          supabase.from('project_members').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
        ])
        return json({ project, file_count: filesRes.count ?? 0, media_count: mediaRes.count ?? 0, member_count: membersRes.count ?? 0 })
      }

      // List all projects for user (owned + member)
      const { data: owned } = await supabase.from('projects').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      const { data: memberRows } = await supabase.from('project_members').select('project_id, role').eq('user_id', user.id).eq('accepted', true)
      const memberProjectIds = (memberRows || []).map((m: any) => m.project_id).filter((id: string) => !(owned || []).find((p: any) => p.id === id))
      let memberProjects: any[] = []
      if (memberProjectIds.length > 0) {
        const { data } = await supabase.from('projects').select('*').in('id', memberProjectIds).order('updated_at', { ascending: false })
        memberProjects = data || []
      }
      const projects = [...(owned || []), ...memberProjects]
      return json({ projects })
    }

    // POST — create project
    if (req.method === 'POST') {
      const body = await req.json()
      const { name, description, color, icon, client_name, client_email, due_date } = body
      if (!name?.trim()) return json({ error: 'name required' }, 400)

      const { data: project, error } = await supabase.from('projects').insert({
        user_id: user.id, name: name.trim(), description, color: color || '#6366f1',
        icon: icon || '🎬', client_name, client_email, due_date,
      }).select().single()
      if (error) return json({ error: error.message }, 500)

      // Log activity
      await supabase.from('project_activity').insert({
        project_id: project.id, user_id: user.id, action: 'created_project',
        entity_type: 'project', entity_id: project.id, entity_name: project.name,
      })

      return json({ project })
    }

    // PUT — update project
    if (req.method === 'PUT') {
      if (!projectId) return json({ error: 'id required' }, 400)
      const { data: project } = await supabase.from('projects').select('user_id').eq('id', projectId).single()
      if (!project) return json({ error: 'Not found' }, 404)
      if (project.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const body = await req.json()
      const allowed = ['name', 'description', 'color', 'icon', 'status', 'client_name', 'client_email', 'due_date']
      const updates: any = { updated_at: new Date().toISOString() }
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]

      const { data: updated, error } = await supabase.from('projects').update(updates).eq('id', projectId).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ project: updated })
    }

    // DELETE — delete project
    if (req.method === 'DELETE') {
      if (!projectId) return json({ error: 'id required' }, 400)
      const { data: project } = await supabase.from('projects').select('user_id').eq('id', projectId).single()
      if (!project) return json({ error: 'Not found' }, 404)
      if (project.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const { error } = await supabase.from('projects').delete().eq('id', projectId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
