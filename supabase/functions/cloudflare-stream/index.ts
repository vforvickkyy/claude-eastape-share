import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
const CF_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN')
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`

const cfHeaders = {
  'Authorization': `Bearer ${CF_API_TOKEN}`,
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Auth check
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )
  const { data: { user }, error: authErr } = await authClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const { action } = body

    // ACTION: Get a one-time upload URL from Cloudflare
    if (action === 'get_upload_url') {
      const { file_size, file_name, media_id } = body

      if (!file_size || !media_id) {
        return json({ error: 'file_size and media_id required' }, 400)
      }

      const cfResponse = await fetch(`${CF_BASE}/direct_upload`, {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          maxDurationSeconds: 21600,
          meta: {
            name: file_name || media_id,
            eastape_media_id: media_id,
          },
          requireSignedURLs: false,
        })
      })

      const cfData = await cfResponse.json()

      if (!cfResponse.ok || !cfData.success) {
        console.error('Cloudflare upload URL error:', cfData)
        return json({ error: 'Failed to get Cloudflare upload URL', details: cfData }, 500)
      }

      const { uid, uploadURL } = cfData.result

      await supabase
        .from('project_media')
        .update({ cloudflare_uid: uid, cloudflare_status: 'pending' })
        .eq('id', media_id)

      return json({ success: true, upload_url: uploadURL, uid })
    }

    // ACTION: Check status of a video
    if (action === 'get_status') {
      const { uid, media_id } = body

      if (!uid) return json({ error: 'uid required' }, 400)

      const cfResponse = await fetch(`${CF_BASE}/${uid}`, { headers: cfHeaders })
      const cfData = await cfResponse.json()

      if (!cfResponse.ok || !cfData.success) {
        return json({ error: 'Failed to get video status' }, 500)
      }

      const video = cfData.result
      const state = video.status?.state || 'processing'

      const mappedStatus =
        state === 'ready'        ? 'ready'      :
        state === 'error'        ? 'error'       :
        state === 'pendingupload'? 'pending'     :
        'processing'

      const thumbnailUrl = video.thumbnail || null
      const playbackUrl  = video.playback?.hls || null

      if (media_id) {
        await supabase
          .from('project_media')
          .update({
            cloudflare_status: mappedStatus,
            cloudflare_thumbnail_url: thumbnailUrl,
            cloudflare_playback_url: playbackUrl,
          })
          .eq('id', media_id)
      }

      return json({
        success: true,
        status: mappedStatus,
        uid,
        thumbnail_url: thumbnailUrl,
        playback_url: playbackUrl,
        duration: video.duration || null,
      })
    }

    // ACTION: Delete video from Cloudflare
    if (action === 'delete') {
      const { uid } = body

      if (!uid) return json({ error: 'uid required' }, 400)

      const cfResponse = await fetch(`${CF_BASE}/${uid}`, {
        method: 'DELETE',
        headers: cfHeaders,
      })

      if (!cfResponse.ok) {
        console.error('Cloudflare delete failed for uid:', uid)
        // Non-fatal
      }

      return json({ success: true })
    }

    return json({ error: 'Invalid action' }, 400)

  } catch (err) {
    console.error('cloudflare-stream error:', err)
    return json({ error: err.message }, 500)
  }
})
