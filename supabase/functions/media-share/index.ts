import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
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
      const { data, error } = await supabase.from('media_share_links').select('*').eq('asset_id', assetId).eq('created_by', user.id).order('created_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)
      return json({ links: data })
    }

    if (req.method === 'POST') {
      const { assetId: aid, folderId, projectId, password, expiresAt, allowDownload = true, allowComments = false } = await req.json()
      if (!aid && !folderId && !projectId) return json({ error: 'assetId, folderId, or projectId required' }, 400)

      const token = randomHex(20)
      const { data, error } = await supabase
        .from('media_share_links')
        .insert({
          asset_id:       aid      || null,
          folder_id:      folderId || null,
          project_id:     projectId || null,
          token,
          created_by:     user.id,
          password:       password  || null,
          expires_at:     expiresAt || null,
          allow_download: allowDownload,
          allow_comments: allowComments,
        })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)

      const frontendUrl = Deno.env.get('FRONTEND_URL') || ''
      const shareUrl = `${frontendUrl}/media/share/${token}`
      return json({ link: data, shareUrl }, 201)
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('media_share_links').delete().eq('id', id).eq('created_by', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
