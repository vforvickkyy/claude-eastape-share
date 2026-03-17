import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function jsonErr(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    const assetId = url.searchParams.get('assetId')

    const LIBRARY_ID = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')
    const BUNNY_API_KEY = Deno.env.get('BUNNY_STREAM_API_KEY')
    // Optional: set BUNNY_CDN_HOSTNAME to skip the library API lookup (e.g. "vz-abc123.b-cdn.net")
    let CDN_HOSTNAME = Deno.env.get('BUNNY_CDN_HOSTNAME') ?? ''

    if (!LIBRARY_ID || !BUNNY_API_KEY) return jsonErr('Bunny not configured', 500)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let bunnyGuid = ''
    let assetName = 'video'

    if (token) {
      // ── Share token path (no auth required) ─────────────────────────────────
      const { data: link } = await supabase
        .from('media_share_links')
        .select('asset_id, folder_id, project_id, allow_download, expires_at')
        .eq('token', token)
        .single()

      if (!link) return jsonErr('Share link not found', 404)
      if (link.expires_at && new Date(link.expires_at) < new Date()) return jsonErr('Link expired', 410)
      if (!link.allow_download) return jsonErr('Download not permitted for this link', 403)

      // If assetId provided (folder/project share), verify the asset belongs to the shared scope
      const targetAssetId = assetId || link.asset_id
      if (!targetAssetId) return jsonErr('No asset specified', 400)

      const { data: asset } = await supabase
        .from('media_assets')
        .select('bunny_video_guid, name, project_id, folder_id')
        .eq('id', targetAssetId)
        .single()

      if (!asset?.bunny_video_guid) return jsonErr('Asset not found', 404)

      // If this is a folder/project share, confirm the asset is within scope
      if (assetId && link.asset_id !== assetId) {
        if (link.project_id && asset.project_id !== link.project_id) return jsonErr('Asset not in shared project', 403)
        if (link.folder_id && asset.folder_id !== link.folder_id) return jsonErr('Asset not in shared folder', 403)
      }

      bunnyGuid = asset.bunny_video_guid
      assetName = asset.name || 'video'

    } else if (assetId) {
      // ── Authenticated path ────────────────────────────────────────────────────
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: { user }, error: authErr } = await authClient.auth.getUser()
      if (authErr || !user) return jsonErr('Unauthorized', 401)

      const { data: asset } = await supabase
        .from('media_assets')
        .select('bunny_video_guid, name, user_id, project_id')
        .eq('id', assetId)
        .single()

      if (!asset) return jsonErr('Asset not found', 404)

      // Check ownership or team membership
      if (asset.user_id !== user.id) {
        const { data: proj } = await supabase
          .from('media_projects')
          .select('user_id')
          .eq('id', asset.project_id)
          .single()
        if (!proj) return jsonErr('Forbidden', 403)
        if (proj.user_id !== user.id) {
          const { data: mem } = await supabase
            .from('media_team_members')
            .select('role')
            .eq('project_id', asset.project_id)
            .eq('user_id', user.id)
            .single()
          if (!mem) return jsonErr('Forbidden', 403)
        }
      }

      bunnyGuid = asset.bunny_video_guid
      assetName = asset.name || 'video'

    } else {
      return jsonErr('token or assetId required', 400)
    }

    // ── Resolve CDN hostname ────────────────────────────────────────────────────
    if (!CDN_HOSTNAME) {
      const libRes = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}`, {
        headers: { AccessKey: BUNNY_API_KEY },
      })
      if (!libRes.ok) return jsonErr('Failed to fetch Bunny library info', 500)
      const lib = await libRes.json()
      // lib.PullZone is the pull zone name (e.g. "vz-abc123")
      CDN_HOSTNAME = lib.PullZone ? `${lib.PullZone}.b-cdn.net` : ''
      if (!CDN_HOSTNAME) return jsonErr('Could not determine CDN hostname', 500)
    }

    // ── Try resolutions from highest to lowest ──────────────────────────────────
    const resolutions = ['1080p', '720p', '480p', '360p', '240p', 'original']
    let fileRes: Response | null = null

    for (const res of resolutions) {
      const cdnUrl = res === 'original'
        ? `https://${CDN_HOSTNAME}/${bunnyGuid}/original`
        : `https://${CDN_HOSTNAME}/${bunnyGuid}/play_${res}.mp4`

      const r = await fetch(cdnUrl)
      if (r.ok) {
        fileRes = r
        break
      }
    }

    if (!fileRes) return jsonErr('Video file not available on CDN', 404)

    // ── Return the stream with download headers ────────────────────────────────
    const safeName = assetName.replace(/[^\w\s.-]/g, '').trim() || 'video'
    const filename = `${safeName}.mp4`
    const encodedFilename = encodeURIComponent(filename)

    return new Response(fileRes.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': fileRes.headers.get('Content-Length') ?? '',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
