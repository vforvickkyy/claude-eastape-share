import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    async function assertOwner(pId: string) {
      const { data, error } = await supabase.from('media_projects').select('id').eq('id', pId).eq('user_id', user!.id).single()
      if (error || !data) throw Object.assign(new Error('Forbidden'), { status: 403 })
    }

    if (req.method === 'GET') {
      if (!projectId) return json({ error: 'projectId required' }, 400)
      const { data, error } = await supabase.from('media_team_members').select('*').eq('project_id', projectId).order('created_at')
      if (error) return json({ error: error.message }, 500)
      return json({ members: data })
    }

    if (req.method === 'POST') {
      const { projectId: pId, email, role = 'viewer' } = await req.json()
      if (!pId || !email) return json({ error: 'projectId and email required' }, 400)

      try { await assertOwner(pId) } catch (e: unknown) { return json({ error: (e as Error).message }, (e as { status?: number }).status || 403) }

      const { data: users } = await supabase.auth.admin.listUsers()
      const invitee = users?.users?.find((u: { email: string }) => u.email === email)

      const { data, error } = await supabase
        .from('media_team_members')
        .insert({ project_id: pId, user_id: invitee?.id || null, invited_email: email, role, accepted: !!invitee })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ member: data }, 201)
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const { role } = await req.json()
      if (!role) return json({ error: 'role required' }, 400)

      const { data: member } = await supabase.from('media_team_members').select('project_id').eq('id', id).single()
      if (!member) return json({ error: 'Member not found' }, 404)

      try { await assertOwner(member.project_id) } catch (e: unknown) { return json({ error: (e as Error).message }, (e as { status?: number }).status || 403) }

      const { data, error } = await supabase.from('media_team_members').update({ role }).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ member: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { data: member } = await supabase.from('media_team_members').select('project_id').eq('id', id).single()
      if (!member) return json({ error: 'Member not found' }, 404)

      try { await assertOwner(member.project_id) } catch (e: unknown) { return json({ error: (e as Error).message }, (e as { status?: number }).status || 403) }

      const { error } = await supabase.from('media_team_members').delete().eq('id', id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
