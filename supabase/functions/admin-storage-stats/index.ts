import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    const url    = new URL(req.url)
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  || '1'))
    const limit  = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '50')))
    const search = url.searchParams.get('search') || ''
    const offset = (page - 1) * limit

    const { data, error } = await supabase.rpc('admin_storage_stats', {
      p_search: search,
      p_limit:  limit,
      p_offset: offset,
    })

    if (error) {
      console.error('admin_storage_stats rpc error:', JSON.stringify(error))
      return json({ error: error.message }, 500)
    }

    return json(data)
  } catch (err: any) {
    console.error('admin-storage-stats fatal:', err?.message, err?.stack)
    return json({ error: err?.message ?? 'Unknown error' }, 500)
  }
})
