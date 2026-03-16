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

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const parentId = url.searchParams.get('parentId')

      let query = supabase.from('folders').select('id, name, parent_id, created_at').eq('user_id', user.id).order('name')
      if (parentId) {
        query = query.eq('parent_id', parentId)
      } else {
        query = query.is('parent_id', null)
      }

      const { data, error } = await query
      if (error) return json({ error: error.message }, 500)
      return json({ folders: data || [] })
    }

    if (req.method === 'POST') {
      const { name, parentId } = await req.json()
      if (!name?.trim()) return json({ error: 'Folder name is required.' }, 400)

      const { data, error } = await supabase
        .from('folders')
        .insert({ user_id: user.id, name: name.trim(), parent_id: parentId || null })
        .select()
        .single()

      if (error) return json({ error: error.message }, 500)
      return json({ folder: data }, 201)
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
