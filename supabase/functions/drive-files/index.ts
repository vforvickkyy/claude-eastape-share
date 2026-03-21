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
    const fileId   = url.searchParams.get('id')
    const folderId = url.searchParams.get('folderId')
    const trashed  = url.searchParams.get('trashed') === 'true'

    // GET ?resource=storage — storage usage summary
    if (req.method === 'GET' && url.searchParams.get('resource') === 'storage') {
      const [driveRes, projFilesRes, projMediaRes, planRes] = await Promise.all([
        supabase.from('drive_files').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('project_files').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('project_media').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('user_plans').select('plans(storage_limit_gb)').eq('user_id', user.id).eq('is_active', true).single(),
      ])
      const usedBytes = [
        ...(driveRes.data || []),
        ...(projFilesRes.data || []),
        ...(projMediaRes.data || []),
      ].reduce((s: number, r: any) => s + (r.file_size || 0), 0)
      const limitGb = (planRes.data as any)?.plans?.storage_limit_gb ?? 2
      return json({ used_bytes: usedBytes, limit_bytes: limitGb * 1024 * 1024 * 1024, limit_gb: limitGb })
    }

    // GET — list files
    if (req.method === 'GET') {
      let q = supabase.from('drive_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (trashed) {
        q = q.eq('is_trashed', true)
      } else {
        q = q.eq('is_trashed', false)
        if (folderId && folderId !== 'root') q = q.eq('folder_id', folderId)
        else q = q.is('folder_id', null)
      }
      const { data: files, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ files: files || [] })
    }

    // PUT — rename, move, trash, restore
    if (req.method === 'PUT') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const allowed = ['name', 'folder_id', 'is_trashed', 'trashed_at']
      const updates: any = { updated_at: new Date().toISOString() }
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]
      if (body.is_trashed === false) updates.trashed_at = null

      const { data: updated, error } = await supabase.from('drive_files').update(updates).eq('id', fileId).eq('user_id', user.id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ file: updated })
    }

    // DELETE — permanent delete
    if (req.method === 'DELETE') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('drive_files').delete().eq('id', fileId).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
