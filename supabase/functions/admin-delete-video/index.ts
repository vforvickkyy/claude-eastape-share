import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return json({ error: 'Forbidden: admin only' }, 403)

    async function auditLog(action: string, targetType: string, targetId: string, metadata = {}) {
      await supabase.from('admin_audit_logs').insert({ admin_id: user!.id, action, target_type: targetType, target_id: targetId, metadata })
    }

    if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405)

    const body = await req.json()
    const { assetId } = body
    if (!assetId) return json({ error: 'assetId is required' }, 400)

    const { data: asset } = await supabase.from('media_assets').select('name, bunny_video_guid, user_id').eq('id', assetId).single()
    if (!asset) return json({ error: 'Asset not found' }, 404)

    const LIBRARY_ID = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')
    const BUNNY_API_KEY = Deno.env.get('BUNNY_STREAM_API_KEY')

    if (asset.bunny_video_guid && LIBRARY_ID && BUNNY_API_KEY) {
      await fetch(
        `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${asset.bunny_video_guid}`,
        { method: 'DELETE', headers: { AccessKey: BUNNY_API_KEY } }
      ).catch(() => {})
    }

    await supabase.from('media_assets').delete().eq('id', assetId)

    await auditLog(`Deleted video: ${asset.name}`, 'video', assetId, { name: asset.name, bunny_guid: asset.bunny_video_guid })

    return json({ ok: true })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
