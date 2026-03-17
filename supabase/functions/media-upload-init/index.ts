import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const BUNNY_API_KEY    = Deno.env.get('BUNNY_STREAM_API_KEY')
    const BUNNY_LIBRARY_ID = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')
    const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'

    const { projectId, folderId, name, size, mimeType, type = 'video' } = await req.json()
    if (!projectId || !name || !size) return json({ error: 'projectId, name, and size are required' }, 400)

    // ── Storage quota check ───────────────────────────────────────────────────
    const [driveRes, mediaRes, planRes] = await Promise.all([
      supabase.from('shares').select('file_size').eq('user_id', user.id).eq('is_trashed', false).eq('storage_deleted', false),
      supabase.from('media_assets').select('file_size').eq('user_id', user.id),
      supabase.from('user_plans').select('plans(storage_limit_gb, display_name)').eq('user_id', user.id).eq('is_active', true).single(),
    ])
    const driveBytes = (driveRes.data || []).reduce((s: number, r: any) => s + (r.file_size || 0), 0)
    const mediaBytes = (mediaRes.data || []).reduce((s: number, r: any) => s + (r.file_size || 0), 0)
    const usedBytes  = driveBytes + mediaBytes
    const limitGb    = (planRes.data as any)?.plans?.storage_limit_gb ?? 2
    const limitBytes = limitGb * 1024 * 1024 * 1024
    if (usedBytes + size > limitBytes) {
      const planName = (planRes.data as any)?.plans?.display_name ?? 'Free'
      return json({
        error: `Storage quota exceeded. Your ${planName} plan includes ${limitGb} GB. Used: ${(usedBytes / 1024 / 1024 / 1024).toFixed(2)} GB.`,
        code: 'STORAGE_QUOTA_EXCEEDED',
        used_bytes: usedBytes,
        limit_bytes: limitBytes,
      }, 402)
    }

    let uploadUrl: string | null = null
    let tusHeaders: Record<string, string> | null = null
    let guid: string | null = null

    if (BUNNY_API_KEY && BUNNY_LIBRARY_ID && type === 'video') {
      const createRes = await fetch(
        `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
        {
          method: 'POST',
          headers: { AccessKey: BUNNY_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: name }),
        }
      )

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => '')
        return json({ error: 'Failed to create video in Bunny Stream' }, 502)
      }

      const videoObj = await createRes.json()
      guid = videoObj.guid

      const expirationTime = Math.floor(Date.now() / 1000) + 3600
      const signature = await sha256Hex(`${BUNNY_LIBRARY_ID}${BUNNY_API_KEY}${expirationTime}${guid}`)

      uploadUrl = BUNNY_TUS_ENDPOINT
      tusHeaders = {
        AuthorizationSignature: signature,
        AuthorizationExpire:    String(expirationTime),
        VideoId:                guid!,
        LibraryId:              BUNNY_LIBRARY_ID,
      }
    }

    const { data: asset, error } = await supabase
      .from('media_assets')
      .insert({
        project_id:         projectId,
        folder_id:          folderId || null,
        user_id:            user.id,
        name,
        type,
        mime_type:          mimeType || null,
        file_size:          size,
        bunny_video_guid:   guid,
        bunny_video_status: guid ? 'uploading' : 'ready',
      })
      .select()
      .single()

    if (error) return json({ error: error.message }, 500)

    return json({ uploadUrl, tusHeaders, assetId: asset.id, guid }, 201)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
