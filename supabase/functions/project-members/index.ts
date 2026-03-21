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
    const memberId  = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')

    // GET — list members
    if (req.method === 'GET') {
      if (!projectId) return json({ error: 'projectId required' }, 400)
      const { data: project } = await supabase.from('projects').select('user_id').eq('id', projectId).single()
      if (!project) return json({ error: 'Not found' }, 404)
      if (project.user_id !== user.id) {
        const { data: m } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).eq('accepted', true).single()
        if (!m) return json({ error: 'Forbidden' }, 403)
      }
      const { data: members, error } = await supabase
        .from('project_members')
        .select('*, profiles:user_id(full_name, avatar_url)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (error) return json({ error: error.message }, 500)
      return json({ members: members || [] })
    }

    // POST — invite or add manual member
    if (req.method === 'POST') {
      const body = await req.json()
      const { project_id, email, role, display_name, position, is_manual } = body
      if (!project_id) return json({ error: 'project_id required' }, 400)
      if (!is_manual && !email) return json({ error: 'email required for invite' }, 400)

      const { data: project } = await supabase.from('projects').select('user_id').eq('id', project_id).single()
      if (!project) return json({ error: 'Project not found' }, 404)
      if (project.user_id !== user.id) {
        const { data: m } = await supabase.from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!m || m.role !== 'admin') return json({ error: 'Forbidden' }, 403)
      }

      let insertData: Record<string, unknown> = {
        project_id,
        role:         role || 'viewer',
        invited_by:   user.id,
        display_name: display_name || null,
        position:     position || null,
        is_manual:    !!is_manual,
      }

      if (is_manual) {
        // Manual member — no user lookup, not accepted in the auth sense
        insertData.invited_email = email || null
        insertData.user_id       = null
        insertData.accepted      = true // manually added = immediately in team
      } else {
        // Real invite — look up user by email
        const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
        insertData.invited_email = email
        insertData.user_id       = profile?.id || null
        insertData.accepted      = !!profile?.id
      }

      const { data: member, error } = await supabase.from('project_members').insert(insertData).select('*').single()
      if (error) return json({ error: error.message }, 500)

      if (!is_manual) {
        await supabase.from('project_activity').insert({
          project_id, user_id: user.id, action: 'added_member',
          entity_type: 'member', entity_name: email,
        }).catch(() => {})
      }

      return json({ member }, 201)
    }

    // PUT — update role or details
    if (req.method === 'PUT') {
      if (!memberId) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const { data: member } = await supabase.from('project_members').select('project_id').eq('id', memberId).single()
      if (!member) return json({ error: 'Not found' }, 404)

      const { data: project } = await supabase.from('projects').select('user_id').eq('id', member.project_id).single()
      if (project?.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const updates: Record<string, unknown> = {}
      if (body.role         !== undefined) updates.role         = body.role
      if (body.display_name !== undefined) updates.display_name = body.display_name
      if (body.position     !== undefined) updates.position     = body.position

      const { data: updated, error } = await supabase.from('project_members').update(updates).eq('id', memberId).select('*').single()
      if (error) return json({ error: error.message }, 500)
      return json({ member: updated })
    }

    // DELETE — remove member
    if (req.method === 'DELETE') {
      if (!memberId) return json({ error: 'id required' }, 400)
      const { data: member } = await supabase.from('project_members').select('project_id, user_id').eq('id', memberId).single()
      if (!member) return json({ error: 'Not found' }, 404)

      const { data: project } = await supabase.from('projects').select('user_id').eq('id', member.project_id).single()
      if (project?.user_id !== user.id && member.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      await supabase.from('project_members').delete().eq('id', memberId)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
