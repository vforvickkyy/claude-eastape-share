import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/sendEmail.ts'

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
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
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
      // GET / POST require project_id; PUT / DELETE look it up from the scene row
      if (req.method === 'GET' || req.method === 'POST') {
        if (!projectId) return json({ error: 'project_id required' }, 400)
        if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
        if (req.method === 'GET') {
          const { data, error } = await supabase.from('production_scenes').select('*').eq('project_id', projectId).order('position')
          if (error) return json({ error: error.message }, 500)
          return json({ scenes: data })
        }
        if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
        const body = await req.json()
        const { data, error } = await supabase.from('production_scenes')
          .insert({ project_id: projectId, name: body.name, description: body.description || null, position: body.position ?? 0 })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ scene: data }, 201)
      }
      if ((req.method === 'PUT' || req.method === 'DELETE') && id) {
        const { data: sceneRow } = await supabase.from('production_scenes').select('project_id').eq('id', id).single()
        if (!sceneRow) return json({ error: 'Not found' }, 404)
        if (!(await canAccess(sceneRow.project_id))) return json({ error: 'Forbidden' }, 403)
        if (!(await isOwner(sceneRow.project_id))) return json({ error: 'Forbidden' }, 403)
        if (req.method === 'DELETE') {
          await supabase.from('production_scenes').delete().eq('id', id)
          return json({ ok: true })
        }
        const body = await req.json()
        const allowed = ['name', 'description', 'position']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase.from('production_scenes').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ scene: data })
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

        // Send shot assigned email if assigned_to changed (non-fatal)
        if ('assigned_to' in body && body.assigned_to && body.assigned_to !== user.id) {
          try {
            const [{ data: assigner }, { data: project }] = await Promise.all([
              supabase.from('profiles').select('full_name').eq('id', user.id).single(),
              supabase.from('projects').select('name').eq('id', existing.project_id).single(),
            ])
            const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            await sendEmail({
              userId: body.assigned_to,
              notificationType: 'shot_assigned',
              template: 'shotAssigned',
              data: {
                assignedBy: assigner?.full_name || 'Someone',
                shotName: data.title || 'Untitled Shot',
                shotNumber: data.shot_number || null,
                projectName: project?.name || 'a project',
                dueDate: data.due_date ? formatDate(data.due_date) : null,
                priority: data.custom_data?.priority || null,
                projectUrl: `https://claude-eastape-share.vercel.app/projects/${existing.project_id}`,
              }
            })
          } catch {}
        }

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
      // GET: project_id required
      if (req.method === 'GET') {
        if (!projectId) return json({ error: 'project_id required' }, 400)
        if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
        const showHidden = url.searchParams.get('show_hidden') === 'true'
        let q = supabase.from('pipeline_stages').select('*').eq('project_id', projectId).order('order_index')
        if (!showHidden) q = q.eq('is_hidden', false)
        const { data, error } = await q
        if (error) return json({ error: error.message }, 500)
        return json({ stages: data })
      }

      // POST: project_id required
      if (req.method === 'POST') {
        if (!projectId) return json({ error: 'project_id required' }, 400)
        if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
        if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
        const body = await req.json()
        const { data, error } = await supabase.from('pipeline_stages')
          .insert({
            project_id: projectId, name: body.name,
            color: body.color || '#6366f1', order_index: body.order_index ?? 0,
            is_final_stage: body.is_final_stage ?? false,
            cell_type: body.cell_type || 'checkbox',
            status_options: body.status_options || [],
            width: body.width || 120,
          })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ stage: data }, 201)
      }

      // PATCH: reorder (needs project_id) or update single by id
      if (req.method === 'PATCH') {
        const body = await req.json()
        if (body.reorder && Array.isArray(body.items)) {
          if (!projectId) return json({ error: 'project_id required' }, 400)
          if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
          if (!(await isOwner(projectId))) return json({ error: 'Forbidden' }, 403)
          for (const item of body.items) {
            await supabase.from('pipeline_stages').update({ order_index: item.order_index }).eq('id', item.id)
          }
          return json({ ok: true })
        }
        // Update single stage — look up project_id from stage id
        const patchId = id || body.id
        if (patchId) {
          const { data: stg } = await supabase.from('pipeline_stages').select('project_id').eq('id', patchId).single()
          if (!stg) return json({ error: 'Not found' }, 404)
          if (!(await isOwner(stg.project_id))) return json({ error: 'Forbidden' }, 403)
          const allowed = ['name', 'color', 'order_index', 'is_final_stage', 'cell_type', 'status_options', 'is_hidden', 'width']
          const updates: Record<string, unknown> = {}
          for (const k of allowed) if (k in body) updates[k] = body[k]
          const { data, error } = await supabase.from('pipeline_stages').update(updates).eq('id', patchId).select().single()
          if (error) return json({ error: error.message }, 500)
          return json({ stage: data })
        }
      }

      // PUT: update single stage by id — look up project_id from stage
      if (req.method === 'PUT' && id) {
        const { data: stg } = await supabase.from('pipeline_stages').select('project_id').eq('id', id).single()
        if (!stg) return json({ error: 'Not found' }, 404)
        if (!(await isOwner(stg.project_id))) return json({ error: 'Forbidden' }, 403)
        const body = await req.json()
        const allowed = ['name', 'color', 'order_index', 'is_final_stage', 'cell_type', 'status_options', 'is_hidden', 'width']
        const updates: Record<string, unknown> = {}
        for (const k of allowed) if (k in body) updates[k] = body[k]
        const { data, error } = await supabase.from('pipeline_stages').update(updates).eq('id', id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ stage: data })
      }

      // DELETE: look up project_id from stage id
      if (req.method === 'DELETE' && id) {
        const { data: stage } = await supabase.from('pipeline_stages').select('name, project_id').eq('id', id).single()
        if (!stage) return json({ error: 'Not found' }, 404)
        if (!(await isOwner(stage.project_id))) return json({ error: 'Forbidden' }, 403)
        await supabase.from('pipeline_stages').delete().eq('id', id)
        // Clean stage key from all shots in the project
        if (stage?.name) {
          const { data: affectedShots } = await supabase.from('production_shots')
            .select('id, pipeline_stages')
            .eq('project_id', stage.project_id)
            .not('pipeline_stages', 'is', null)
          for (const shot of (affectedShots || [])) {
            const ps = shot.pipeline_stages as Record<string, unknown>
            if (ps && stage.name in ps) {
              const cleaned = { ...ps }
              delete cleaned[stage.name]
              await supabase.from('production_shots').update({ pipeline_stages: cleaned }).eq('id', shot.id)
            }
          }
        }
        return json({ ok: true })
      }
    }

    // ── PROJECT MEMBERS LIST ──────────────────────────────────────────
    if (resource === 'project_members_list') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
      const { data: members } = await supabase
        .from('project_members')
        .select('user_id, role, profiles:user_id(full_name, avatar_url)')
        .eq('project_id', projectId).eq('accepted', true)
      return json({ members: (members || []).map((m: any) => ({
        user_id: m.user_id, role: m.role,
        full_name: m.profiles?.full_name || null,
        avatar_url: m.profiles?.avatar_url || null,
      })) })
    }

    // ── SHOTS WITH MEDIA ─────────────────────────────────────────────
    if (resource === 'shots_with_media') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)

      const { data: shots, error: shotsErr } = await supabase
        .from('production_shots')
        .select('*, production_scenes(*), production_statuses(*)')
        .eq('project_id', projectId).order('position')
      if (shotsErr) return json({ error: shotsErr.message }, 500)

      const { data: stages } = await supabase.from('pipeline_stages')
        .select('*').eq('project_id', projectId).eq('is_hidden', false).order('order_index')

      // Batch fetch linked media names
      const linkedIds = (shots || []).map((s: any) => s.thumbnail_media_id).filter(Boolean)
      const mediaMap: Record<string, string> = {}
      if (linkedIds.length > 0) {
        const { data: mediaRows } = await supabase
          .from('project_media').select('id, name').in('id', linkedIds)
        for (const m of (mediaRows || [])) mediaMap[m.id] = m.name
      }

      // Batch fetch assignee profile info
      const assigneeIds = [...new Set((shots || []).map((s: any) => s.assigned_to).filter(Boolean))]
      const profileMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
      if (assigneeIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name, avatar_url').in('id', assigneeIds)
        for (const p of (profiles || [])) profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }
      }

      const shotsWithMedia = (shots || []).map((shot: any) => {
        const mid = shot.thumbnail_media_id
        const profile = shot.assigned_to ? profileMap[shot.assigned_to] : null
        return {
          ...shot,
          linked_media_id:    mid && mediaMap[mid] ? mid : null,
          linked_media_name:  mid && mediaMap[mid] ? mediaMap[mid] : null,
          assigned_to_name:   profile?.full_name || null,
          assigned_to_avatar: profile?.avatar_url || null,
          custom_assignee:    shot.custom_assignee || null,
        }
      })

      return json({ shots: shotsWithMedia, stages: stages || [] })
    }

    // ── SHOT PIPELINE (update pipeline_stages JSONB on a shot) ────────
    if (resource === 'shot_pipeline') {
      if (req.method !== 'PATCH') return json({ error: 'Method not allowed' }, 405)
      const sid = shotId || url.searchParams.get('shot_id')
      if (!sid) return json({ error: 'shot_id required' }, 400)
      const body = await req.json()
      const { stage_name, value, progress } = body
      // Accept 'value' (new) or 'progress' (legacy) — value wins
      const cellValue = value !== undefined ? value : progress
      if (!stage_name || cellValue === undefined) return json({ error: 'stage_name and value required' }, 400)

      const { data: existing } = await supabase.from('production_shots').select('project_id, pipeline_stages').eq('id', sid).single()
      if (!existing) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(existing.project_id))) return json({ error: 'Forbidden' }, 403)

      const currentStages = (existing.pipeline_stages as Record<string, unknown>) || {}
      const updatedStages = { ...currentStages, [stage_name]: cellValue }

      const { data, error } = await supabase.from('production_shots')
        .update({ pipeline_stages: updatedStages, updated_at: new Date().toISOString() })
        .eq('id', sid).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ shot: data })
    }

    // ── UPDATE SHOT (assignee, custom_assignee, etc.) ─────────────────
    if (resource === 'update_shot') {
      if (req.method !== 'PATCH') return json({ error: 'Method not allowed' }, 405)
      const sid = shotId || url.searchParams.get('shot_id')
      if (!sid) return json({ error: 'shot_id required' }, 400)
      const { data: existing } = await supabase.from('production_shots')
        .select('project_id, assigned_to, title, shot_number, due_date, custom_data').eq('id', sid).single()
      if (!existing) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(existing.project_id))) return json({ error: 'Forbidden' }, 403)
      const body = await req.json()
      const allowed = ['assigned_to', 'custom_assignee']
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of allowed) if (k in body) updates[k] = body[k]
      const { data, error } = await supabase.from('production_shots').update(updates).eq('id', sid).select().single()
      if (error) return json({ error: error.message }, 500)

      // Send shot assigned email if assigned_to changed to a different user (non-fatal)
      if ('assigned_to' in body && body.assigned_to &&
          body.assigned_to !== existing.assigned_to &&
          body.assigned_to !== user.id) {
        try {
          const [{ data: assigner }, { data: project }] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('id', user.id).single(),
            supabase.from('projects').select('name').eq('id', existing.project_id).single(),
          ])
          const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          sendEmail({
            userId: body.assigned_to,
            notificationType: 'shot_assigned',
            template: 'shotAssigned',
            data: {
              assignedBy: assigner?.full_name || 'Someone',
              shotName: existing.title || 'Untitled Shot',
              shotNumber: existing.shot_number || null,
              projectName: project?.name || 'a project',
              dueDate: existing.due_date ? formatDate(existing.due_date) : null,
              priority: existing.custom_data?.priority || null,
              projectUrl: `https://claude-eastape-share.vercel.app/projects/${existing.project_id}`,
            }
          }).catch(err => console.error('Shot assigned email failed:', err))
        } catch {}
      }

      return json({ shot: data })
    }

    // ── CUSTOM ASSIGNEES ──────────────────────────────────────────────
    if (resource === 'custom_assignees') {
      if (!projectId && req.method === 'GET') return json({ error: 'project_id required' }, 400)

      if (req.method === 'GET') {
        if (!(await canAccess(projectId!))) return json({ error: 'Forbidden' }, 403)
        const { data: customAssignees } = await supabase
          .from('project_custom_assignees').select('*')
          .eq('project_id', projectId).order('created_at')
        const { data: members } = await supabase
          .from('project_members')
          .select('user_id, role, profiles:user_id(full_name, avatar_url)')
          .eq('project_id', projectId).eq('accepted', true)
        return json({ teamMembers: (members || []).map((m: any) => ({
          user_id: m.user_id, role: m.role,
          full_name: m.profiles?.full_name || null,
          avatar_url: m.profiles?.avatar_url || null,
        })), customAssignees: customAssignees || [] })
      }

      if (req.method === 'POST') {
        const body = await req.json()
        const pid = body.project_id || projectId
        if (!pid) return json({ error: 'project_id required' }, 400)
        if (!(await canAccess(pid))) return json({ error: 'Forbidden' }, 403)
        const { data, error } = await supabase.from('project_custom_assignees')
          .insert({ project_id: pid, name: body.name }).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ assignee: data }, 201)
      }

      if (req.method === 'DELETE') {
        const aid = id || url.searchParams.get('id')
        if (!aid) return json({ error: 'id required' }, 400)
        const { data: existing } = await supabase.from('project_custom_assignees')
          .select('project_id').eq('id', aid).single()
        if (!existing) return json({ error: 'Not found' }, 404)
        if (!(await canAccess(existing.project_id))) return json({ error: 'Forbidden' }, 403)
        await supabase.from('project_custom_assignees').delete().eq('id', aid)
        return json({ ok: true })
      }
    }

    // ── PROJECT VIEW (save default_manage_view / hidden_builtin_cols) ──
    if (resource === 'project_view') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      if (!(await canAccess(projectId))) return json({ error: 'Forbidden' }, 403)
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const body = await req.json()
        const patch: Record<string, unknown> = {}
        if (body.default_manage_view) patch.default_manage_view = body.default_manage_view
        if (body.hidden_builtin_cols !== undefined) patch.hidden_builtin_cols = body.hidden_builtin_cols
        if (Object.keys(patch).length === 0) return json({ error: 'Nothing to update' }, 400)
        const { error } = await supabase.from('projects').update(patch).eq('id', projectId)
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
        .select('project_id').eq('id', sid).single()
      if (!shot) return json({ error: 'Not found' }, 404)
      if (!(await canAccess(shot.project_id))) return json({ error: 'Forbidden' }, 403)

      // Verify media belongs to the same project
      const { data: mediaRec } = await supabase.from('project_media')
        .select('id, name').eq('id', mid).eq('project_id', shot.project_id).single()
      if (!mediaRec) return json({ error: 'Media not found in this project' }, 404)

      await supabase.from('production_shots')
        .update({ thumbnail_media_id: mid, updated_at: new Date().toISOString() })
        .eq('id', sid)

      return json({ success: true, shot_id: sid, media_id: mid, media_name: mediaRec.name })
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
          try {
            await supabase.from('shot_assets').insert({
              shot_id: sh.id, project_media_id: thumbId, is_hero: true, label: 'hero',
            })
          } catch (_) {}
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

      // Check which media items are linked via thumbnail_media_id (source of truth)
      const { data: linkedShots } = await supabase
        .from('production_shots')
        .select('thumbnail_media_id, title')
        .eq('project_id', projectId)
        .not('thumbnail_media_id', 'is', null)
      const linkedMap: Record<string, string> = {}
      for (const s of (linkedShots || [])) {
        if (s.thumbnail_media_id) linkedMap[s.thumbnail_media_id] = s.title
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
          linked_shot_name: linkedMap[m.id] || null,
        }
      }))

      return json({ media: result })
    }

    // ── SEED ─────────────────────────────────────────────────────────
    if (resource === 'seed' && req.method === 'POST') {
      if (!projectId) return json({ error: 'project_id required' }, 400)
      const owner = await isOwner(projectId)
      if (!owner) return json({ error: 'Forbidden' }, 403)

      let bodyData: { preset_type?: string } = {}
      try { bodyData = await req.json() } catch {}
      const presetType = bodyData.preset_type || 'blank'

      type StatusDef = { name: string; color: string; position: number }
      type StageDef  = { name: string; color: string; order_index: number; is_final_stage: boolean }
      type ColDef    = { name: string; type: string; options?: string[]; position: number }

      const STATUSES: Record<string, StatusDef[]> = {
        vfx:        [{ name:'Not Started',color:'#64748b',position:0},{name:'In Progress',color:'#3b82f6',position:1},{name:'In Review',color:'#f97316',position:2},{name:'Approved',color:'#10b981',position:3},{name:'Delivered',color:'#06b6d4',position:4}],
        commercial: [{ name:'Not Started',color:'#64748b',position:0},{name:'Filming',color:'#f59e0b',position:1},{name:'Editing',color:'#8b5cf6',position:2},{name:'Client Review',color:'#f97316',position:3},{name:'Approved',color:'#10b981',position:4},{name:'Delivered',color:'#06b6d4',position:5}],
        wedding:    [{ name:'Not Started',color:'#64748b',position:0},{name:'Filmed',color:'#3b82f6',position:1},{name:'Editing',color:'#8b5cf6',position:2},{name:'Color',color:'#f59e0b',position:3},{name:'Review',color:'#f97316',position:4},{name:'Delivered',color:'#10b981',position:5}],
        social:     [{ name:'Idea',color:'#64748b',position:0},{name:'Scripting',color:'#8b5cf6',position:1},{name:'Production',color:'#f59e0b',position:2},{name:'Editing',color:'#3b82f6',position:3},{name:'Review',color:'#f97316',position:4},{name:'Posted',color:'#10b981',position:5}],
        music:      [{ name:'Not Started',color:'#64748b',position:0},{name:'Filming',color:'#f59e0b',position:1},{name:'Syncing',color:'#8b5cf6',position:2},{name:'Editing',color:'#3b82f6',position:3},{name:'Review',color:'#f97316',position:4},{name:'Delivered',color:'#10b981',position:5}],
        blank:      [{ name:'Not Started',color:'#64748b',position:0},{name:'In Progress',color:'#3b82f6',position:1},{name:'Done',color:'#10b981',position:2}],
      }
      const STAGES: Record<string, StageDef[]> = {
        vfx:        [{name:'KEY',color:'#3b82f6',order_index:0,is_final_stage:false},{name:'RENDERS',color:'#8b5cf6',order_index:1,is_final_stage:false},{name:'COMP',color:'#10b981',order_index:2,is_final_stage:false},{name:'CHECK',color:'#f59e0b',order_index:3,is_final_stage:false},{name:'DELIVER',color:'#06b6d4',order_index:4,is_final_stage:true}],
        commercial: [{name:'SHOOT',color:'#f59e0b',order_index:0,is_final_stage:false},{name:'OFFLINE',color:'#8b5cf6',order_index:1,is_final_stage:false},{name:'ONLINE',color:'#3b82f6',order_index:2,is_final_stage:false},{name:'COLOR',color:'#10b981',order_index:3,is_final_stage:false},{name:'AUDIO',color:'#f97316',order_index:4,is_final_stage:false},{name:'DELIVER',color:'#06b6d4',order_index:5,is_final_stage:true}],
        wedding:    [{name:'FILMED',color:'#3b82f6',order_index:0,is_final_stage:false},{name:'CULLED',color:'#8b5cf6',order_index:1,is_final_stage:false},{name:'EDITED',color:'#f59e0b',order_index:2,is_final_stage:false},{name:'COLOR',color:'#10b981',order_index:3,is_final_stage:false},{name:'AUDIO',color:'#f97316',order_index:4,is_final_stage:false},{name:'DELIVERED',color:'#06b6d4',order_index:5,is_final_stage:true}],
        social:     [{name:'SCRIPT',color:'#8b5cf6',order_index:0,is_final_stage:false},{name:'SHOOT',color:'#f59e0b',order_index:1,is_final_stage:false},{name:'EDIT',color:'#3b82f6',order_index:2,is_final_stage:false},{name:'CAPTION',color:'#10b981',order_index:3,is_final_stage:false},{name:'CLIENT',color:'#f97316',order_index:4,is_final_stage:false},{name:'POST',color:'#06b6d4',order_index:5,is_final_stage:true}],
        music:      [{name:'SHOOT',color:'#f59e0b',order_index:0,is_final_stage:false},{name:'SYNC',color:'#8b5cf6',order_index:1,is_final_stage:false},{name:'EDIT',color:'#3b82f6',order_index:2,is_final_stage:false},{name:'COLOR',color:'#10b981',order_index:3,is_final_stage:false},{name:'VFX',color:'#f97316',order_index:4,is_final_stage:false},{name:'DELIVER',color:'#06b6d4',order_index:5,is_final_stage:true}],
        blank:      [],
      }
      const COLUMNS: Record<string, ColDef[]> = {
        vfx:        [{name:'Shot Type',type:'select',options:['Wide','Medium','CU','ECU','POV','Aerial'],position:0},{name:'Camera Movement',type:'select',options:['Static','Pan','Tilt','Dolly','Handheld'],position:1},{name:'Frames',type:'number',position:2},{name:'VFX Notes',type:'text',position:3}],
        commercial: [{name:'Shot Type',type:'select',options:['Wide','Medium','CU','Insert','Aerial'],position:0},{name:'Location',type:'text',position:1},{name:'Lens',type:'text',position:2},{name:'Notes',type:'text',position:3}],
        wedding:    [{name:'Moment',type:'text',position:0},{name:'Time of Day',type:'text',position:1},{name:'Location',type:'text',position:2},{name:'B-Roll',type:'checkbox',position:3}],
        social:     [{name:'Platform',type:'select',options:['Instagram','TikTok','YouTube','Twitter','LinkedIn'],position:0},{name:'Format',type:'select',options:['Landscape','Portrait','Square'],position:1},{name:'Duration',type:'number',position:2},{name:'Caption',type:'text',position:3}],
        music:      [{name:'Shot Type',type:'select',options:['Wide','Medium','CU','Performance','BTS'],position:0},{name:'Artist',type:'text',position:1},{name:'Playback',type:'checkbox',position:2},{name:'Lip Sync',type:'checkbox',position:3}],
        blank:      [],
      }

      const statuses = STATUSES[presetType] ?? STATUSES['blank']
      const stages   = STAGES[presetType]   ?? []
      const columns  = COLUMNS[presetType]  ?? []

      if (statuses.length > 0) {
        const { error: sErr } = await supabase.from('production_statuses').insert(statuses.map(s => ({ project_id: projectId, ...s })))
        if (sErr) return json({ error: sErr.message }, 500)
      }
      if (stages.length > 0) {
        const { error: stErr } = await supabase.from('pipeline_stages').insert(stages.map(s => ({ project_id: projectId, ...s, cell_type: 'checkbox', status_options: [], width: 120 })))
        if (stErr) return json({ error: stErr.message }, 500)
      }
      if (columns.length > 0) {
        const { error: cErr } = await supabase.from('shot_columns').insert(columns.map(c => ({ project_id: projectId, name: c.name, type: c.type, options: c.options ?? null, position: c.position })))
        if (cErr) return json({ error: cErr.message }, 500)
      }
      return json({ ok: true })
    }

    return json({ error: 'Not found' }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
