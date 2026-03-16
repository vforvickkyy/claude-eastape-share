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
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const assetId = url.searchParams.get('assetId')
    if (!assetId) return json({ error: 'assetId required' }, 400)

    const BUNNY_API_KEY    = Deno.env.get('BUNNY_STREAM_API_KEY')
    const BUNNY_LIBRARY_ID = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')
    const BUNNY_CDN_HOST   = Deno.env.get('BUNNY_STREAM_CDN_HOSTNAME')

    const { data: asset, error: dbErr } = await supabase
      .from('media_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', user.id)
      .single()

    if (dbErr || !asset) return json({ error: 'Asset not found' }, 404)

    if (asset.bunny_video_status === 'ready') {
      // Fix old-format playback URLs (pre-fix stored wrong path, not /embed/)
      if (BUNNY_LIBRARY_ID && asset.bunny_video_guid && asset.bunny_playback_url && !asset.bunny_playback_url.includes('/embed/')) {
        const fixedUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${asset.bunny_video_guid}`
        await supabase.from('media_assets').update({ bunny_playback_url: fixedUrl }).eq('id', assetId)
        return json({ status: 'ready', thumbnailUrl: asset.bunny_thumbnail_url, playbackUrl: fixedUrl, assetId })
      }
      return json({ status: 'ready', thumbnailUrl: asset.bunny_thumbnail_url, playbackUrl: asset.bunny_playback_url, assetId })
    }

    if (!asset.bunny_video_guid || !BUNNY_API_KEY || !BUNNY_LIBRARY_ID) {
      return json({ status: asset.bunny_video_status || 'uploading', assetId })
    }

    const bunnyRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${asset.bunny_video_guid}`,
      { headers: { AccessKey: BUNNY_API_KEY } }
    )

    if (!bunnyRes.ok) return json({ status: 'uploading', assetId })

    const video = await bunnyRes.json()

    if (video.status === 4) {
      const cdnHost      = BUNNY_CDN_HOST || `${BUNNY_LIBRARY_ID}.b-cdn.net`
      const thumbnailUrl = `https://${cdnHost}/${asset.bunny_video_guid}/thumbnail.jpg`
      const playbackUrl  = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${asset.bunny_video_guid}`
      const duration     = video.length || null

      await supabase.from('media_assets').update({
        bunny_video_status:  'ready',
        bunny_thumbnail_url: thumbnailUrl,
        bunny_playback_url:  playbackUrl,
        duration,
        updated_at: new Date().toISOString(),
      }).eq('id', assetId)

      return json({ status: 'ready', thumbnailUrl, playbackUrl, duration, assetId })
    }

    if (video.status === 5) {
      await supabase.from('media_assets').update({ bunny_video_status: 'error' }).eq('id', assetId)
      return json({ status: 'error', assetId })
    }

    return json({ status: 'uploading', assetId })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
