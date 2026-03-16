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
    const parentId = url.searchParams.get('parentId')

    if (req.method === 'GET') {
      // Single folder by id
      if (id) {
        const { data, error } = await supabase.from('media_folders').select('*').eq('id', id).eq('user_id', user.id).single()
        if (error) return json({ error: error.message }, 500)
        return json({ folder: data })
      }
      let q = supabase.from('media_folders').select('*').eq('user_id', user.id)
      if (projectId) q = q.eq('project_id', projectId)
      if (parentId === 'null' || parentId === 'root') q = q.is('parent_folder_id', null)
      else if (parentId) q = q.eq('parent_folder_id', parentId)
      const { data, error } = await q.order('name')
      if (error) return json({ error: error.message }, 500)
      return json({ folders: data })
    }

    if (req.method === 'POST') {
      const { name, projectId: pId, parentFolderId } = await req.json()
      if (!name || !pId) return json({ error: 'name and projectId required' }, 400)

      const { data, error } = await supabase
        .from('media_folders')
        .insert({ name, project_id: pId, parent_folder_id: parentFolderId || null, user_id: user.id })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data }, 201)
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const { name } = await req.json()
      const { data, error } = await supabase.from('media_folders').update({ name }).eq('id', id).eq('user_id', user.id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('media_folders').delete().eq('id', id).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
