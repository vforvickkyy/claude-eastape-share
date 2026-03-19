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
    const mediaId   = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')
    const folderId  = url.searchParams.get('folderId')
    const status    = url.searchParams.get('status')

    // GET — list or single
    if (req.method === 'GET') {
      if (mediaId) {
        const { data: media, error } = await supabase.from('project_media').select('*').eq('id', mediaId).single()
        if (error || !media) return json({ error: 'Not found' }, 404)
        if (media.user_id !== user.id) {
          const { data: member } = await supabase.from('project_members').select('role').eq('project_id', media.project_id).eq('user_id', user.id).eq('accepted', true).single()
          if (!member) return json({ error: 'Forbidden' }, 403)
        }
        return json({ media })
      }

      if (!projectId) return json({ error: 'projectId required' }, 400)

      // Verify access
      const { data: project } = await supabase.from('projects').select('user_id').eq('id', projectId).single()
      if (!project) return json({ error: 'Project not found' }, 404)
      if (project.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      let q = supabase.from('project_media').select('*').eq('project_id', projectId).eq('is_trashed', false).order('created_at', { ascending: false })
      if (folderId && folderId !== 'root') q = q.eq('folder_id', folderId)
      else if (folderId === 'root') q = q.is('folder_id', null)
      if (status) q = q.eq('status', status)

      const { data: assets, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ assets: assets || [] })
    }

    // PUT — update (status, name, etc.)
    if (req.method === 'PUT') {
      if (!mediaId) return json({ error: 'id required' }, 400)
      const { data: media } = await supabase.from('project_media').select('user_id, project_id').eq('id', mediaId).single()
      if (!media) return json({ error: 'Not found' }, 404)

      // Check access (owner or member with edit/review rights)
      if (media.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', media.project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      const body = await req.json()
      const allowed = ['name', 'status', 'wasabi_status', 'wasabi_thumbnail_key', 'duration', 'width', 'height', 'folder_id']
      const updates: any = { updated_at: new Date().toISOString() }
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]

      // Log status change
      if (body.status) {
        await supabase.from('project_activity').insert({
          project_id: media.project_id, user_id: user.id, action: 'changed_status',
          entity_type: 'project_media', entity_id: mediaId,
          metadata: { status: body.status },
        })
      }

      const { data: updated, error } = await supabase.from('project_media').update(updates).eq('id', mediaId).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ media: updated })
    }

    // DELETE — soft delete (trash)
    if (req.method === 'DELETE') {
      if (!mediaId) return json({ error: 'id required' }, 400)
      const { data: media } = await supabase.from('project_media').select('user_id, project_id').eq('id', mediaId).single()
      if (!media) return json({ error: 'Not found' }, 404)
      if (media.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const hardDelete = url.searchParams.get('hard') === 'true'
      if (hardDelete) {
        await supabase.from('project_media').delete().eq('id', mediaId)
      } else {
        await supabase.from('project_media').update({ is_trashed: true, updated_at: new Date().toISOString() }).eq('id', mediaId)
      }
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
