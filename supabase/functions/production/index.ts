import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const enc = new TextEncoder()
function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
async function hmac(key: ArrayBuffer | string, msg: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}
async function presignGet(endpoint: string, bucket: string, key: string, accessKeyId: string, secretAccessKey: string, region: string, expiresIn = 3600): Promise<string> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map((s: string) => encodeURIComponent(s)).join('/')
  const credentialScope = `${date}/${region}/s3/aws4_request`
  const qp = new URLSearchParams()
  qp.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
  qp.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`)
  qp.set('X-Amz-Date', datetime)
  qp.set('X-Amz-Expires', String(expiresIn))
  qp.set('X-Amz-SignedHeaders', 'host')
  const sortedQp = Array.from(qp.entries()).sort(([a], [b]) => a < b ? -1 : 1)
  const canonicalQs = sortedQp.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, hex(hashBuf)].join('\n')
  const kDate = await hmac(`AWS4${secretAccessKey}`, date)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, 's3')
  const kSign = await hmac(kService, 'aws4_request')
  const sig = hex(await hmac(kSign, stringToSign))
  return `${endpoint}/${bucket}/${encodedKey}?${canonicalQs}&X-Amz-Signature=${sig}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url       = new URL(req.url)
    const resource  = url.searchParams.get('resource')
    const projectId = url.searchParams.get('project_id')
    const id        = url.searchParams.get('id')
    const shotId    = url.searchParams.get('shot_id')

    async function canAccess(pid: string): Promise<boolean> {
      const { data: proj } = await supabase.from('projects').select('user_id').eq('id', pid).single()
      if (proj?.user_id === user.id) return true
      const { data: mem } = await supabase.from('project_members').select('id').eq('project_id', pid).eq('user_id', user.id).single()
      return !!mem
    }
    async function isOwner(pid: string): Promise<boolean> {
      const { data: proj } = await supabase.from('projects').select('user_id').eq('id', pid).single()
      return proj?.user_id === user.id
    }

    // ── STATUSES ─────────────────────────────────────────────────────
    if (resource === 'statuses') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('production_statuses').select('*').eq('project_id', projectId).order('position')
        if (error) return json({ error: error.message }, 500)
        return json({ statuses: data })
      }
      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase.from('production_statuses')
          .insert({ project_id: projectId, name: body.name, color: body.color || '#6366f1', position: body.position ?? 0 })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ status: data }, 201)
      }
      if (req.method === 'PUT' && id) {
        const body = await req.json()
        const allowed = ['name', 'color', 'position']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase.from('production_statuses').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ status: data })
      }
      if (req.method === 'DELETE' && id) {
        await supabase.from('production_statuses').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── SCENES ───────────────────────────────────────────────────────
    if (resource === 'scenes') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('production_scenes').select('*').eq('project_id', projectId).order('position')
        if (error) return json({ error: error.message }, 500)
        return json({ scenes: data })
      }
      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase.from('production_scenes')
          .insert({ project_id: projectId, name: body.name, description: body.description || null, position: body.position ?? 0 })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ scene: data }, 201)
      }
      if (req.method === 'PUT' && id) {
        const body = await req.json()
        const allowed = ['name', 'description', 'position']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase.from('production_scenes').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ scene: data })
      }
      if (req.method === 'DELETE' && id) {
        await supabase.from('production_scenes').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── COLUMNS ──────────────────────────────────────────────────────
    if (resource === 'columns') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('shot_columns').select('*').eq('project_id', projectId).order('position')
        if (error) return json({ error: error.message }, 500)
        return json({ columns: data })
      }
      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase.from('shot_columns')
          .insert({ project_id: projectId, name: body.name, type: body.type || 'text', options: body.options || null, position: body.position ?? 0 })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ column: data }, 201)
      }
      if (req.method === 'PUT' && id) {
        const body = await req.json()
        const allowed = ['name', 'type', 'options', 'position']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase.from('shot_columns').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ column: data })
      }
      if (req.method === 'DELETE' && id) {
        await supabase.from('shot_columns').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── SHOTS ────────────────────────────────────────────────────────
    if (resource === 'shots') {
      if (req.method === 'GET') {
        if (id) {
          const { data, error } = await supabase.from('production_shots')
            .select('*, production_scenes(*), production_statuses(*)')
            .eq('id', id).single()
          if (error || !data) return json({ error: 'Not found' }, 404)
          if (!(await canAccess(data.project_id))) return json({ error: 'Forbidden' }, 403)
          return json({ shot: data })
        }
        if (!projectId) return json({ error: 'project_id required' }, 400)
        if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
        const sceneId = url.searchParams.get('scene_id')
        let q = supabase.from('production_shots')
          .select('*, production_scenes(*), production_statuses(*)')
          .eq('project_id', projectId).order('position')
        if (sceneId) q = q.eq('scene_id', sceneId)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ shots: data })
      }
      if (req.method === 'POST') {
        if (!projectId) return json({ error: 'project_id required' }, 400)
        if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
        const body = await req.json()
        const { data, error } = await supabase.from('production_shots')
          .insert({
            project_id: projectId, scene_id: body.scene_id || null, status_id: body.status_id || null,
            title: body.title, description: body.description || null, shot_number: body.shot_number || null,
            due_date: body.due_date || null, assigned_to: body.assigned_to || null,
            position: body.position ?? 0, custom_data: body.custom_data || {},
            thumbnail_media_id: body.thumbnail_media_id || null,
          })
          .select('*, production_scenes(*), production_statuses(*)').single()
        if (error) return json({ error: error.message }, 500)
        return json({ shot: data }, 201)
      }
      if ((req.method === 'PUT' || req.method === 'PATCH') && id) {
        const { data: existing } = await supabase.from('production_shots').select('project_id').eq('id', id).single()
        if (!existing) return json({ error: 'Not found' }, 404)
        if (!(await canAccess(existing.project_id))) return json({ error: 'Forbidden' }, 403)
        const body = await req.json()
        const allowed = ['scene_id', 'status_id', 'title', 'description', 'shot_number', 'due_date', 'assigned_to', 'position', 'custom_data', 'thumbnail_media_id', 'review_notes']
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase.from('production_shots').update(updates).eq('id', id)
          .select('*, production_scenes(*), production_statuses(*)').single()
        if (error) return json({ error: error.message }, 500)
        return json({ shot: data })
      }
      if (req.method === 'DELETE' && id) {
        const { data: existing } = await supabase.from('production_shots').select('project_id').eq('id', id).single()
        if (!existing) return json({ error: 'Not found' }, 404)
        if (!(await canAccess(existing.project_id))) return json({ error: 'Forbidden' }, 403)
        await supabase.from('production_shots').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── SHOT COMMENTS ────────────────────────────────────────────────
    if (resource === 'shot_comments') {
      if (!shotId) return json({ error: 'shot_id required' }, 400)
      const { data: shot } = await supabase.from('production_shots').select('project_id').eq('id', shotId).single()
      if (!shot) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(shot.project_id))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('shot_comments')
          .select('*, profiles:user_id(display_name, avatar_url)')
          .eq('shot_id', shotId).order('created_at')
        if (error) return json({ error: error.message }, 500)
        return json({ comments: data })
      }
      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase.from('shot_comments')
          .insert({ shot_id: shotId, user_id: user.id, body: body.body })
          .select('*, profiles:user_id(display_name, avatar_url)').single()
        if (error) return json({ error: error.message }, 500)
        return json({ comment: data }, 201)
      }
      if (req.method === 'DELETE' && id) {
        await supabase.from('shot_comments').delete().eq('id', id).eq('user_id', user.id)
        return json({ ok: true })
      }
    }

    // ── PIPELINE STAGES ──────────────────────────────────────────────
    if (resource === 'pipeline_stages') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('pipeline_stages').select('*').eq('project_id', projectId).order('order_index')
        if (error) return json({ error: error.message }, 500)
        return json({ stages: data })
      }
      if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase.from('pipeline_stages')
          .insert({ project_id: projectId, name: body.name, color: body.color || '#6366f1', order_index: body.order_index ?? 0, is_final_stage: body.is_final_stage ?? false })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ stage: data }, 201)
      }
      if (req.method === 'PUT' && id) {
        const body = await req.json()
        const allowed = ['name', 'color', 'order_index', 'is_final_stage']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase.from('pipeline_stages').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ stage: data })
      }
      if (req.method === 'PATCH') {
        const body = await req.json()
        if (body.reorder && Array.isArray(body.items)) {
          for (const item of body.items) {
            await supabase.from('pipeline_stages').update({ order_index: item.order_index }).eq('id', item.id)
          }
          return json({ ok: true })
        }
        if (id) {
          const allowed = ['name', 'color', 'order_index', 'is_final_stage']
          const updates: Record<string, unknown> = {}
          for (const k of allowed) if (k in body) updates[k] = body[k]
          const { data, error } = await supabase.from('pipeline_stages').update(updates).eq('id', id).select().single()
          if (error) return json({ error: error.message }, 500)
          return json({ stage: data })
        }
      }
      if (req.method === 'DELETE' && id) {
        await supabase.from('pipeline_stages').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── SHOTS WITH MEDIA (thumbnails + joined data) ───────────────────
    if (resource === 'shots_with_media') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      const { data: shots, error: shotsErr } = await supabase
        .from('production_shots')
        .select('*, production_scenes(*), production_statuses(*)')
        .eq('project_id', projectId).order('position')
      if (shotsErr) return json({ error: shotsErr.message }, 500)

      const { data: stages } = await supabase.from('pipeline_stages').select('*').eq('project_id', projectId).order('order_index')

      const wasabiEndpoint = Deno.env.get('WASABI_ENDPOINT') || 'https://s3.ap-southeast-1.wasabisys.com'
      const wasabiBucket   = Deno.env.get('WASABI_BUCKET')   || ''
      const wasabiKey      = Deno.env.get('WASABI_ACCESS_KEY') || ''
      const wasabiSecret   = Deno.env.get('WASABI_SECRET_KEY') || ''
      const wasabiRegion   = Deno.env.get('WASABI_REGION')   || 'ap-southeast-1'

      const enriched = await Promise.all((shots || []).map(async (shot: Record<string, unknown>) => {
        let thumbnailUrl = null
        let linkedMediaName = null
        let linkedMediaDuration = null
        let linkedMediaMimeType = null
        let linkedMediaReady = false
        if (shot.thumbnail_media_id) {
          const { data: media } = await supabase.from('project_media')
            .select('wasabi_key, wasabi_thumbnail_key, name, duration, mime_type, wasabi_status')
            .eq('id', shot.thumbnail_media_id).single()
          if (media) {
            linkedMediaName = media.name
            linkedMediaDuration = media.duration
            linkedMediaMimeType = media.mime_type
            linkedMediaReady = media.wasabi_status === 'ready'
            if (wasabiKey) {
              const thumbKey = media.wasabi_thumbnail_key || media.wasabi_key
              if (thumbKey) {
                try {
                  thumbnailUrl = await presignGet(wasabiEndpoint, wasabiBucket, thumbKey as string, wasabiKey, wasabiSecret, wasabiRegion, 7200)
                } catch {}
              }
            }
          }
        }
        const { count: assetCount } = await supabase.from('shot_assets')
          .select('id', { count: 'exact', head: true }).eq('shot_id', shot.id)
        return { ...shot, thumbnailUrl, assetCount: assetCount || 0, linkedMediaName, linkedMediaDuration, linkedMediaMimeType, linkedMediaReady }
      }))

      return json({ shots: enriched, stages: stages || [] })
    }

    // ── SHOT PIPELINE (update pipeline_stages JSONB on a shot) ────────
    if (resource === 'shot_pipeline') {
      if (req.method !== 'PATCH') return json({ error: 'Method not allowed' }, 405)
      const sid = shotId || url.searchParams.get('shot_id')
      if (!sid) return json({ error: 'shot_id required' }, 400)
      const body = await req.json()
      const { stage_name, progress } = body
      if (!stage_name || progress === undefined) return json({ error: 'stage_name and progress required' }, 400)

      const { data: existing } = await supabase.from('production_shots').select('project_id, pipeline_stages').eq('id', sid).single()
      if (!existing) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(existing.project_id))) return json({ error: 'Forbidden' }, 403)

      const currentStages = (existing.pipeline_stages as Record<string, number>) || {}
      const updatedStages = { ...currentStages, [stage_name]: Number(progress) }

      const { data, error } = await supabase.from('production_shots')
        .update({ pipeline_stages: updatedStages, updated_at: new Date().toISOString() })
        .eq('id', sid).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ shot: data })
    }

    // ── PROJECT VIEW (save default_manage_view) ───────────────────────
    if (resource === 'project_view') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const body = await req.json()
        if (!body.default_manage_view) return json({ error: 'default_manage_view required' }, 400)
        const { error } = await supabase.from('projects')
          .update({ default_manage_view: body.default_manage_view })
          .eq('id', projectId)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
    }

    // ── SHOT ASSETS (legacy link media to shots) ──────────────────────
    if (resource === 'shot_assets') {
      if (!shotId) return json({ error: 'shot_id required' }, 400)
      const { data: shot } = await supabase.from('production_shots').select('project_id').eq('id', shotId).single()
      if (!shot) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(shot.project_id))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('shot_assets').select('*, project_media(*)').eq('shot_id', shotId)
        if (error) return json({ error: error.message }, 500)
        return json({ assets: data })
      }
      if (req.method === 'POST') {
        const body = await req.json()
        const { data, error } = await supabase.from('shot_assets')
          .insert({ shot_id: shotId, project_media_id: body.project_media_id, label: body.label || null, is_hero: body.is_hero || false })
          .select('*, project_media(*)').single()
        if (error) return json({ error: error.message }, 500)
        // Auto-set thumbnail if none
        const { data: sh } = await supabase.from('production_shots').select('thumbnail_media_id').eq('id', shotId).single()
        if (!sh?.thumbnail_media_id && body.project_media_id) {
          await supabase.from('production_shots').update({ thumbnail_media_id: body.project_media_id }).eq('id', shotId)
        }
        return json({ asset: data }, 201)
      }
      if (req.method === 'DELETE' && id) {
        await supabase.from('shot_assets').delete().eq('id', id)
        return json({ ok: true })
      }
    }

    // ── LINK MEDIA ────────────────────────────────────────────────────
    if (resource === 'link_media' && req.method === 'POST') {
      const body = await req.json()
      const { shot_id: sid, media_id: mid } = body
      if (!sid || !mid) return json({ error: 'shot_id and media_id required' }, 400)

      const { data: shot } = await supabase.from('production_shots')
        .select('project_id, thumbnail_media_id')
        .eq('id', sid).single()
      if (!shot) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(shot.project_id))) return json({ error: 'Forbidden' }, 403)

      const { data: mediaRec } = await supabase.from('project_media')
        .select('wasabi_key, wasabi_thumbnail_key, name, duration, mime_type, wasabi_status')
        .eq('id', mid).single()
      if (!mediaRec) return json({ error: 'Media not found' }, 404)

      await supabase.from('production_shots')
        .update({ thumbnail_media_id: mid, updated_at: new Date().toISOString() })
        .eq('id', sid)

      // Upsert shot_asset record
      const { data: existingAsset } = await supabase.from('shot_assets')
        .select('id').eq('shot_id', sid).eq('project_media_id', mid).single()
      if (existingAsset) {
        await supabase.from('shot_assets').update({ is_hero: true }).eq('id', existingAsset.id)
      } else {
        await supabase.from('shot_assets').insert({
          shot_id: sid, project_media_id: mid, is_hero: true, label: 'take',
        })
      }

      const lmEndpoint = Deno.env.get('WASABI_ENDPOINT') || 'https://s3.ap-southeast-1.wasabisys.com'
      const lmBucket   = Deno.env.get('WASABI_BUCKET') || ''
      const lmKey      = Deno.env.get('WASABI_ACCESS_KEY') || ''
      const lmSecret   = Deno.env.get('WASABI_SECRET_KEY') || ''
      const lmRegion   = Deno.env.get('WASABI_REGION') || 'ap-southeast-1'

      let thumbnailUrl = null
      const thumbKey = mediaRec.wasabi_thumbnail_key ||
        (mediaRec.mime_type?.startsWith('image/') ? mediaRec.wasabi_key : null)
      if (thumbKey && lmKey) {
        try { thumbnailUrl = await presignGet(lmEndpoint, lmBucket, thumbKey as string, lmKey, lmSecret, lmRegion, 3600) } catch {}
      }

      return json({
        success: true,
        shot_id: sid,
        media_id: mid,
        thumbnailUrl,
        linkedMediaName: mediaRec.name,
        linkedMediaDuration: mediaRec.duration,
        linkedMediaMimeType: mediaRec.mime_type,
        linkedMediaReady: mediaRec.wasabi_status === 'ready',
      })
    }

    // ── UNLINK MEDIA ──────────────────────────────────────────────────
    if (resource === 'unlink_media' && (req.method === 'POST' || req.method === 'DELETE')) {
      let sid: string | null = null
      if (req.method === 'POST') {
        const body = await req.json()
        sid = body.shot_id
      } else {
        sid = url.searchParams.get('shot_id')
      }
      if (!sid) return json({ error: 'shot_id required' }, 400)

      const { data: shot } = await supabase.from('production_shots')
        .select('project_id').eq('id', sid).single()
      if (!shot) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(shot.project_id))) return json({ error: 'Forbidden' }, 403)

      await supabase.from('production_shots')
        .update({ thumbnail_media_id: null, updated_at: new Date().toISOString() })
        .eq('id', sid)
      await supabase.from('shot_assets').delete().eq('shot_id', sid).eq('is_hero', true)

      return json({ success: true, shot_id: sid })
    }

    // ── BULK CREATE SHOTS ─────────────────────────────────────────────
    if (resource === 'bulk_create_shots' && req.method === 'POST') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      const body = await req.json()
      const { scene_id, shots: shotsList } = body
      if (!Array.isArray(shotsList) || shotsList.length === 0) return json({ error: 'shots array required' }, 400)

      // Get first status for project
      const { data: firstStatus } = await supabase.from('production_statuses')
        .select('id').eq('project_id', projectId).order('position').limit(1).single()

      // Get max position in this project
      const { data: maxRow } = await supabase.from('production_shots')
        .select('position').eq('project_id', projectId)
        .order('position', { ascending: false }).limit(1).single()
      const maxPos = (maxRow?.position ?? -1) as number

      const created = []
      for (let i = 0; i < shotsList.length; i++) {
        const s = shotsList[i] as Record<string, unknown>
        const title = (s.name || s.title || 'New Shot') as string
        const thumbId = (s.thumbnail_media_id || null) as string | null

        const { data: sh, error: insertErr } = await supabase.from('production_shots')
          .insert({
            project_id: projectId,
            scene_id: scene_id || null,
            title,
            shot_number: (s.shot_number || null) as string | null,
            status_id: firstStatus?.id || null,
            thumbnail_media_id: thumbId,
            position: maxPos + i + 1,
            custom_data: {},
          })
          .select('*, production_scenes(*), production_statuses(*)')
          .single()

        if (insertErr || !sh) continue

        // Create shot_asset for hero media
        if (thumbId) {
          await supabase.from('shot_assets').insert({
            shot_id: sh.id, project_media_id: thumbId, is_hero: true, label: 'hero',
          }).catch(() => {})
        }

        created.push({ ...sh, thumbnailUrl: null, assetCount: thumbId ? 1 : 0 })
      }

      return json({ shots: created, count: created.length })
    }

    // ── PROJECT MEDIA LIST ────────────────────────────────────────────
    if (resource === 'project_media_list' && req.method === 'GET') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      const { data: media, error: mediaErr } = await supabase
        .from('project_media')
        .select('id, name, mime_type, type, file_size, wasabi_key, wasabi_thumbnail_key, duration')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (mediaErr) return json({ error: mediaErr.message }, 500)

      const { data: projectShots } = await supabase
        .from('production_shots').select('id, title').eq('project_id', projectId)
      const shotsById: Record<string, string> = {}
      for (const s of (projectShots || [])) shotsById[s.id] = s.title

      const shotIds = Object.keys(shotsById)
      let assetsData: Array<{ project_media_id: string; shot_id: string }> = []
      if (shotIds.length > 0) {
        const { data: assets } = await supabase.from('shot_assets')
          .select('project_media_id, shot_id').in('shot_id', shotIds)
        assetsData = assets || []
      }

      const linkedMap: Record<string, { shot_id: string; shot_name: string }> = {}
      for (const a of assetsData) {
        if (!linkedMap[a.project_media_id]) {
          linkedMap[a.project_media_id] = { shot_id: a.shot_id, shot_name: shotsById[a.shot_id] || '' }
        }
      }

      const wEndpoint = Deno.env.get('WASABI_ENDPOINT') || 'https://s3.ap-southeast-1.wasabisys.com'
      const wBucket   = Deno.env.get('WASABI_BUCKET') || ''
      const wKey      = Deno.env.get('WASABI_ACCESS_KEY') || ''
      const wSecret   = Deno.env.get('WASABI_SECRET_KEY') || ''
      const wRegion   = Deno.env.get('WASABI_REGION') || 'ap-southeast-1'

      const result = await Promise.all((media || []).map(async m => {
        let thumbnail_url = null
        const thumbKey = m.wasabi_thumbnail_key || (m.type === 'image' || m.mime_type?.startsWith('image/') ? m.wasabi_key : null)
        if (thumbKey && wKey) {
          try { thumbnail_url = await presignGet(wEndpoint, wBucket, thumbKey as string, wKey, wSecret, wRegion, 7200) } catch {}
        }
        return {
          ...m,
          thumbnail_url,
          is_linked: !!linkedMap[m.id],
          linked_shot_id: linkedMap[m.id]?.shot_id || null,
          linked_shot_name: linkedMap[m.id]?.shot_name || null,
        }
      }))

      return json({ media: result })
    }

    // ── SEED ─────────────────────────────────────────────────────────
    if (resource === 'seed' && req.method === 'POST') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      const owner = await isOwner(projectId)
      if (!owner) return json({ error: 'Forbidden' }, 403)
      const { error: rpcErr } = await supabase.rpc('seed_production', { p_id: projectId })
      if (rpcErr) return json({ error: rpcErr.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
