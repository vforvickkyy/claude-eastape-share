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

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const assetId = url.searchParams.get('assetId')

    if (req.method === 'GET') {
      if (!assetId) return json({ error: 'assetId required' }, 400)

      const { data: asset } = await supabase.from('media_assets').select('id, user_id').eq('id', assetId).single()
      if (!asset) return json({ error: 'Asset not found' }, 404)

      const { data, error } = await supabase
        .from('media_comments')
        .select('*, profiles:user_id (id, raw_user_meta_data->full_name as full_name, raw_user_meta_data->avatar_url as avatar_url, email)')
        .eq('asset_id', assetId)
        .order('created_at')

      if (error) {
        const { data: simple, error: e2 } = await supabase.from('media_comments').select('*').eq('asset_id', assetId).order('created_at')
        if (e2) return json({ error: e2.message }, 500)
        return json({ comments: simple })
      }
      return json({ comments: data })
    }

    if (req.method === 'POST') {
      const { assetId: aid, body, timestampSeconds, parentCommentId } = await req.json()
      if (!aid || !body) return json({ error: 'assetId and body required' }, 400)

      const { data, error } = await supabase
        .from('media_comments')
        .insert({ asset_id: aid, user_id: user.id, body, timestamp_seconds: timestampSeconds ?? null, parent_comment_id: parentCommentId ?? null })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ comment: data }, 201)
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('resolved' in body) updates.resolved = body.resolved
      if ('body' in body) updates.body = body.body

      const { data, error } = await supabase.from('media_comments').update(updates).eq('id', id).eq('user_id', user.id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ comment: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('media_comments').delete().eq('id', id).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
