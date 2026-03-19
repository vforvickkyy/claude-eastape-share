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
    const fileId    = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')
    const folderId  = url.searchParams.get('folderId')
    const category  = url.searchParams.get('category')

    // GET
    if (req.method === 'GET') {
      if (!projectId) return json({ error: 'projectId required' }, 400)

      const { data: project } = await supabase.from('projects').select('user_id').eq('id', projectId).single()
      if (!project) return json({ error: 'Project not found' }, 404)
      if (project.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      let q = supabase.from('project_files').select('*').eq('project_id', projectId).eq('is_trashed', false).order('created_at', { ascending: false })
      if (folderId && folderId !== 'root') q = q.eq('folder_id', folderId)
      else if (folderId === 'root') q = q.is('folder_id', null)
      if (category) q = q.eq('file_category', category)

      const { data: files, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ files: files || [] })
    }

    // PUT — update file metadata
    if (req.method === 'PUT') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const { data: file } = await supabase.from('project_files').select('user_id, project_id').eq('id', fileId).single()
      if (!file) return json({ error: 'Not found' }, 404)
      if (file.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', file.project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member || member.role === 'viewer' || member.role === 'reviewer') return json({ error: 'Forbidden' }, 403)
      }

      const body = await req.json()
      const allowed = ['name', 'folder_id', 'file_category']
      const updates: any = { updated_at: new Date().toISOString() }
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]

      const { data: updated, error } = await supabase.from('project_files').update(updates).eq('id', fileId).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ file: updated })
    }

    // DELETE — trash or hard delete
    if (req.method === 'DELETE') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const { data: file } = await supabase.from('project_files').select('user_id, project_id').eq('id', fileId).single()
      if (!file) return json({ error: 'Not found' }, 404)
      if (file.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', file.project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member || member.role === 'viewer' || member.role === 'reviewer') return json({ error: 'Forbidden' }, 403)
      }

      const hardDelete = url.searchParams.get('hard') === 'true'
      if (hardDelete) {
        await supabase.from('project_files').delete().eq('id', fileId)
      } else {
        await supabase.from('project_files').update({ is_trashed: true, trashed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', fileId)
      }
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
