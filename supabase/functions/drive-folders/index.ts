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
    const folderId  = url.searchParams.get('id')
    const parentId  = url.searchParams.get('parentId')

    // GET
    if (req.method === 'GET') {
      let q = supabase.from('drive_folders').select('*').eq('user_id', user.id).order('name', { ascending: true })
      if (parentId && parentId !== 'root') q = q.eq('parent_id', parentId)
      else q = q.is('parent_id', null)
      const { data: folders, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ folders: folders || [] })
    }

    // POST — create folder
    if (req.method === 'POST') {
      const body = await req.json()
      if (!body.name?.trim()) return json({ error: 'name required' }, 400)
      const { data: folder, error } = await supabase.from('drive_folders').insert({
        user_id: user.id, name: body.name.trim(), parent_id: body.parent_id || null,
      }).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder })
    }

    // PUT — rename
    if (req.method === 'PUT') {
      if (!folderId) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const { data: updated, error } = await supabase.from('drive_folders').update({ name: body.name }).eq('id', folderId).eq('user_id', user.id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ folder: updated })
    }

    // DELETE
    if (req.method === 'DELETE') {
      if (!folderId) return json({ error: 'id required' }, 400)
      await supabase.from('drive_files').update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq('folder_id', folderId).eq('user_id', user.id)
      const { error } = await supabase.from('drive_folders').delete().eq('id', folderId).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
