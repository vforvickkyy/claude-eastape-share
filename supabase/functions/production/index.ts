import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url      = new URL(req.url)
    const resource = url.searchParams.get('resource') // statuses | scenes | columns | shots | shot_assets | shot_comments
    const projectId = url.searchParams.get('project_id')
    const id       = url.searchParams.get('id')
    const shotId   = url.searchParams.get('shot_id')

    // Helper: verify caller is member or owner of project
    async function canAccess(pid: string): Promise<boolean> {
      const { data: proj } = await supabase.from('projects').select('user_id').eq('id', pid).single()
      if (proj?.user_id === user.id) return true
      const { data: mem } = await supabase.from('project_members').select('id').eq('project_id', pid).eq('user_id', user.id).single()
      return !!mem
    }

    async function isOwner(pid: string): Promise<boolean> {
      const { data: proj } = await supabase.from('projects').select('user_id').eq('id', pid).single()
      return proj?.user_id === user.id
    }

    // ── STATUSES ──────────────────────────────────────────────────────
    if (resource === 'statuses') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('production_statuses')
          .select('*')
          .eq('project_id', projectId)
          .order('position')
        if (error) return json({ error: error.message }, 500)
        return json({ statuses: data })
      }

      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)

      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase
          .from('production_statuses')
          .insert({ project_id: projectId, name: body.name, color: body.color || '#6366f1', position: body.position ?? 0 })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ status: data }, 201)
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json()
        const allowed = ['name', 'color', 'position']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase
          .from('production_statuses').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ status: data })
      }

      if (req.method === 'DELETE' && id) {
        await supabase.from('production_statuses').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── SCENES ────────────────────────────────────────────────────────
    if (resource === 'scenes') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('production_scenes')
          .select('*')
          .eq('project_id', projectId)
          .order('position')
        if (error) return json({ error: error.message }, 500)
        return json({ scenes: data })
      }

      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)

      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase
          .from('production_scenes')
          .insert({ project_id: projectId, name: body.name, description: body.description || null, position: body.position ?? 0 })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ scene: data }, 201)
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json()
        const allowed = ['name', 'description', 'position']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase
          .from('production_scenes').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ scene: data })
      }

      if (req.method === 'DELETE' && id) {
        await supabase.from('production_scenes').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── COLUMNS ───────────────────────────────────────────────────────
    if (resource === 'columns') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('shot_columns')
          .select('*')
          .eq('project_id', projectId)
          .order('position')
        if (error) return json({ error: error.message }, 500)
        return json({ columns: data })
      }

      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)

      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase
          .from('shot_columns')
          .insert({ project_id: projectId, name: body.name, type: body.type || 'text', options: body.options || null, position: body.position ?? 0 })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ column: data }, 201)
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json()
        const allowed = ['name', 'type', 'options', 'position']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase
          .from('shot_columns').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ column: data })
      }

      if (req.method === 'DELETE' && id) {
        await supabase.from('shot_columns').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── SHOTS ─────────────────────────────────────────────────────────
    if (resource === 'shots') {
      if (req.method === 'GET') {
        // Single shot
        if (id) {
          const { data, error } = await supabase
            .from('production_shots')
            .select('*, production_scenes(*), production_statuses(*)')
            .eq('id', id)
            .single()
          if (error || !data) return json({ error: 'Not found' }, 404)
          if (!(await canAccess(data.project_id))) return json({ error: 'Forbidden' }, 403)
          return json({ shot: data })
        }
        // List for project
        if (!projectId) return json({ error: 'project_id required' }, 400)
        if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
        const sceneId = url.searchParams.get('scene_id')
        let q = supabase
          .from('production_shots')
          .select('*, production_scenes(*), production_statuses(*)')
          .eq('project_id', projectId)
          .order('position')
        if (sceneId) q = q.eq('scene_id', sceneId)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ shots: data })
      }

      if (req.method === 'POST') {
        if (!projectId) return json({ error: 'project_id required' }, 400)
        if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
        const body = await req.json()
        const { data, error } = await supabase
          .from('production_shots')
          .insert({
            project_id:  projectId,
            scene_id:    body.scene_id    || null,
            status_id:   body.status_id   || null,
            title:       body.title,
            description: body.description || null,
            shot_number: body.shot_number || null,
            due_date:    body.due_date    || null,
            assigned_to: body.assigned_to || null,
            position:    body.position    ?? 0,
            custom_data: body.custom_data || {},
          })
          .select('*, production_scenes(*), production_statuses(*)')
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ shot: data }, 201)
      }

      if ((req.method === 'PUT' || req.method === 'PATCH') && id) {
        const { data: existing } = await supabase.from('production_shots').select('project_id').eq('id', id).single()
        if (!existing) return json({ error: 'Not found' }, 404)
        if (!(await canAccess(existing.project_id))) return json({ error: 'Forbidden' }, 403)
        const body = await req.json()
        const allowed = ['scene_id', 'status_id', 'title', 'description', 'shot_number', 'due_date', 'assigned_to', 'position', 'custom_data']
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase
          .from('production_shots')
          .update(updates)
          .eq('id', id)
          .select('*, production_scenes(*), production_statuses(*)')
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ shot: data })
      }

      if (req.method === 'DELETE' && id) {
        const { data: existing } = await supabase.from('production_shots').select('project_id').eq('id', id).single()
        if (!existing) return json({ error: 'Not found' }, 404)
        if (!(await isOwner(existing.project_id))) return json({ error: 'Forbidden' }, 403)
        await supabase.from('production_shots').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── SHOT COMMENTS ─────────────────────────────────────────────────
    if (resource === 'shot_comments') {
      if (!shotId) return json({ error: 'shot_id required' }, 400)
      const { data: shot } = await supabase.from('production_shots').select('project_id').eq('id', shotId).single()
      if (!shot) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(shot.project_id))) return json({ error: 'Forbidden' }, 403)

      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('shot_comments')
          .select('*, profiles:user_id(display_name, avatar_url)')
          .eq('shot_id', shotId)
          .order('created_at')
        if (error) return json({ error: error.message }, 500)
        return json({ comments: data })
      }

      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase
          .from('shot_comments')
          .insert({ shot_id: shotId, user_id: user.id, body: body.body })
          .select('*, profiles:user_id(display_name, avatar_url)')
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ comment: data }, 201)
      }

      if (req.method === 'DELETE' && id) {
        await supabase.from('shot_comments').delete().eq('id', id).eq('user_id', user.id)
        return json({ ok: true })
      }
    }

    // ── SEED ──────────────────────────────────────────────────────────
    if (resource === 'seed' && req.method === 'POST') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
      await supabase.rpc('seed_production', { p_project_id: projectId })
      return json({ ok: true })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
