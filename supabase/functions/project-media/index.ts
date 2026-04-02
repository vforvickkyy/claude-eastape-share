import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/sendEmail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
async function presignGetSimple(endpoint: string, bucket: string, key: string, accessKeyId: string, secretAccessKey: string, region: string, expiresIn = 3600): Promise<string> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const datetime = date + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const mediaId   = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')
    const folderId  = url.searchParams.get('folderId')
    const status    = url.searchParams.get('status')

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = (Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? '')
    const ACCESS   = (Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? '')
    const SECRET   = (Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? '')
    const REGION   = (Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1')
    const canPresign = !!(ENDPOINT && BUCKET && ACCESS && SECRET)

    // GET — list or single
    if (req.method === 'GET') {
      // Versions list for a specific asset
      if (mediaId && url.searchParams.get('versions') === '1') {
        const { data: media } = await supabase.from('project_media').select('user_id, project_id, version, wasabi_key, wasabi_thumbnail_key, cloudflare_uid, cloudflare_status, duration, file_size, created_at').eq('id', mediaId).single()
        if (!media) return json({ error: 'Not found' }, 404)
        if (media.user_id !== user.id) {
          const { data: member } = await supabase.from('project_members').select('role').eq('project_id', media.project_id).eq('user_id', user.id).eq('accepted', true).single()
          if (!member) return json({ error: 'Forbidden' }, 403)
        }
        const { data: versions } = await supabase.from('project_media_versions').select('*').eq('media_id', mediaId).order('version_number', { ascending: false })
        return json({ versions: versions || [], current_version: media.version || 1 })
      }

      if (mediaId) {
        const { data: media, error } = await supabase.from('project_media').select('*').eq('id', mediaId).single()
        if (error || !media) return json({ error: 'Not found' }, 404)
        if (media.user_id !== user.id) {
          const { data: member } = await supabase.from('project_members').select('role').eq('project_id', media.project_id).eq('user_id', user.id).eq('accepted', true).single()
          if (!member) return json({ error: 'Forbidden' }, 403)
        }
        return json({ media })
      }

      if (!projectId) return json({ error: 'projectId required' }, 400)

      // Verify access
      const { data: project } = await supabase.from('projects').select('user_id').eq('id', projectId).single()
      if (!project) return json({ error: 'Project not found' }, 404)
      if (project.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      let q = supabase.from('project_media').select('*').eq('project_id', projectId).eq('is_trashed', false).order('created_at', { ascending: false })
      if (folderId && folderId !== 'root') q = q.eq('folder_id', folderId)
      else if (folderId === 'root') q = q.is('folder_id', null)
      if (status) q = q.eq('status', status)

      const { data: assets, error } = await q
      if (error) return json({ error: error.message }, 500)

      // Add presigned thumbnail URLs
      const enriched = canPresign
        ? await Promise.all((assets || []).map(async (a: any) => {
            if (!a.wasabi_thumbnail_key) return a
            const thumbnailUrl = await presignGetSimple(ENDPOINT, BUCKET, a.wasabi_thumbnail_key, ACCESS, SECRET, REGION, 14400).catch(() => null)
            return { ...a, thumbnailUrl }
          }))
        : (assets || [])

      return json({ assets: enriched })
    }

    // PATCH — update a version label
    if (req.method === 'PATCH') {
      const versionId = url.searchParams.get('version_id')
      if (!versionId) return json({ error: 'version_id required' }, 400)
      const { data: version } = await supabase.from('project_media_versions').select('media_id').eq('id', versionId).single()
      if (!version) return json({ error: 'Not found' }, 404)
      const { data: media } = await supabase.from('project_media').select('user_id, project_id').eq('id', version.media_id).single()
      if (!media) return json({ error: 'Not found' }, 404)
      if (media.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', media.project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }
      const body = await req.json()
      const { error: patchErr } = await supabase.from('project_media_versions').update({ label: body.label ?? null }).eq('id', versionId)
      if (patchErr) return json({ error: patchErr.message }, 500)
      return json({ ok: true })
    }

    // PUT — update (status, name, etc.)
    if (req.method === 'PUT') {
      if (!mediaId) return json({ error: 'id required' }, 400)
      const { data: media } = await supabase.from('project_media').select('user_id, project_id, status, name, version, wasabi_key, wasabi_thumbnail_key, cloudflare_uid, cloudflare_status, duration, file_size').eq('id', mediaId).single()
      if (!media) return json({ error: 'Not found' }, 404)

      // Check access (owner or member with edit/review rights)
      if (media.user_id !== user.id) {
        const { data: member } = await supabase.from('project_members').select('role').eq('project_id', media.project_id).eq('user_id', user.id).eq('accepted', true).single()
        if (!member) return json({ error: 'Forbidden' }, 403)
      }

      const body = await req.json()
      const allowed = ['name', 'status', 'wasabi_status', 'wasabi_key', 'wasabi_thumbnail_key', 'cloudflare_uid', 'cloudflare_status', 'duration', 'width', 'height', 'folder_id', 'file_size', 'mime_type', 'notes']
      const updates: any = { updated_at: new Date().toISOString() }
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]

      // Version bump: save current state to versions table, then apply new file fields
      if (body.version_bump) {
        await supabase.from('project_media_versions').insert({
          media_id: mediaId,
          version_number: media.version || 1,
          wasabi_key: media.wasabi_key,
          wasabi_thumbnail_key: media.wasabi_thumbnail_key,
          cloudflare_uid: media.cloudflare_uid,
          cloudflare_status: media.cloudflare_status,
          duration: media.duration,
          file_size: media.file_size,
          uploaded_by: user.id,
        })
        updates.version = ((media.version as number) || 1) + 1
      }

      // Log status change
      if (body.status) {
        await supabase.from('project_activity').insert({
          project_id: media.project_id, user_id: user.id, action: 'changed_status',
          entity_type: 'project_media', entity_id: mediaId,
          metadata: { status: body.status },
        })
      }

      const { data: updated, error } = await supabase.from('project_media').update(updates).eq('id', mediaId).select().single()
      if (error) return json({ error: error.message }, 500)

      // Send status change email if status changed and changer is not the owner (non-fatal)
      if (body.status && body.status !== media.status && media.user_id && media.user_id !== user.id) {
        try {
          const [{ data: changer }, { data: project }] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('id', user.id).single(),
            supabase.from('projects').select('name').eq('id', media.project_id).single(),
          ])
          sendEmail({
            userId: media.user_id,
            notificationType: 'status_changes',
            template: 'statusChanged',
            data: {
              changedBy: changer?.full_name || 'Someone',
              fileName: media.name || 'your file',
              oldStatus: media.status || 'None',
              newStatus: body.status,
              projectName: project?.name || null,
              viewUrl: `https://claude-eastape-share.vercel.app/projects/${media.project_id}/media/${mediaId}`,
            }
          }).catch(err => console.error('Status email failed:', err))
        } catch {}
      }

      return json({ media: updated })
    }

    // DELETE — soft delete asset (trash) or hard delete a specific version
    if (req.method === 'DELETE') {
      const versionId = url.searchParams.get('version_id')
      if (versionId) {
        const { data: version } = await supabase.from('project_media_versions').select('media_id').eq('id', versionId).single()
        if (!version) return json({ error: 'Not found' }, 404)
        const { data: media } = await supabase.from('project_media').select('user_id, project_id').eq('id', version.media_id).single()
        if (!media) return json({ error: 'Not found' }, 404)
        if (media.user_id !== user.id) return json({ error: 'Forbidden' }, 403)
        await supabase.from('project_media_versions').delete().eq('id', versionId)
        return json({ ok: true })
      }
      if (!mediaId) return json({ error: 'id required' }, 400)
      const { data: media } = await supabase.from('project_media').select('user_id, project_id').eq('id', mediaId).single()
      if (!media) return json({ error: 'Not found' }, 404)
      if (media.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

      const hardDelete = url.searchParams.get('hard') === 'true'
      if (hardDelete) {
        await supabase.from('project_media').delete().eq('id', mediaId)
      } else {
        await supabase.from('project_media').update({ is_trashed: true, updated_at: new Date().toISOString() }).eq('id', mediaId)
      }
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
