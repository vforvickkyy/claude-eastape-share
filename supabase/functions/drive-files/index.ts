import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Wasabi signing helpers ──────────────────────────────────────────────────
const enc = new TextEncoder()
function hex(buf: ArrayBuffer) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('') }
async function hmac(key: ArrayBuffer | string, msg: string) {
  const raw = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}

async function presignViewUrl(endpoint: string, bucket: string, key: string, access: string, secret: string, region: string, expiresIn = 7200) {
  const now = new Date()
  const date = now.toISOString().slice(0,10).replace(/-/g,'')
  const datetime = date + 'T' + now.toISOString().slice(11,19).replace(/:/g,'') + 'Z'
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const scope = `${date}/${region}/s3/aws4_request`
  const qp = new URLSearchParams()
  qp.set('X-Amz-Algorithm','AWS4-HMAC-SHA256')
  qp.set('X-Amz-Credential',`${access}/${scope}`)
  qp.set('X-Amz-Date', datetime)
  qp.set('X-Amz-Expires', String(expiresIn))
  qp.set('X-Amz-SignedHeaders','host')
  const sorted = Array.from(qp.entries()).sort(([a],[b]) => a<b?-1:1)
  const cqs = sorted.map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const cr = ['GET',`/${bucket}/${encodedKey}`,cqs,`host:${host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n')
  const hb = await crypto.subtle.digest('SHA-256', enc.encode(cr))
  const sts = ['AWS4-HMAC-SHA256',datetime,scope,hex(hb)].join('\n')
  const kD = await hmac(`AWS4${secret}`,date), kR = await hmac(kD,region), kS = await hmac(kR,'s3'), kSi = await hmac(kS,'aws4_request')
  return `${endpoint}/${bucket}/${encodedKey}?${cqs}&X-Amz-Signature=${hex(await hmac(kSi,sts))}`
}

async function wasabiDelete(endpoint: string, bucket: string, key: string, access: string, secret: string, region: string) {
  const now = new Date()
  const date = now.toISOString().slice(0,10).replace(/-/g,'')
  const datetime = date + 'T' + now.toISOString().slice(11,19).replace(/:/g,'') + 'Z'
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  const scope = `${date}/${region}/s3/aws4_request`
  const canonicalRequest = ['DELETE',`/${bucket}/${encodedKey}`,'',`host:${host}\nx-amz-date:${datetime}\n`,'host;x-amz-date','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'].join('\n')
  const hb = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest))
  const sts = ['AWS4-HMAC-SHA256',datetime,scope,hex(hb)].join('\n')
  const kD = await hmac(`AWS4${secret}`,date), kR = await hmac(kD,region), kS = await hmac(kR,'s3'), kSi = await hmac(kS,'aws4_request')
  const sig = hex(await hmac(kSi,sts))
  const authHeader = `AWS4-HMAC-SHA256 Credential=${access}/${scope},SignedHeaders=host;x-amz-date,Signature=${sig}`
  try {
    await fetch(`${endpoint}/${bucket}/${encodedKey}`, {
      method: 'DELETE',
      headers: { 'Host': host, 'X-Amz-Date': datetime, 'Authorization': authHeader },
    })
  } catch {}
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
    const fileId   = url.searchParams.get('id')
    const folderId = url.searchParams.get('folderId')
    const trashed  = url.searchParams.get('trashed') === 'true'
    const action   = url.searchParams.get('action')

    const ENDPOINT = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '')
    const BUCKET   = Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? ''
    const ACCESS   = Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? ''
    const SECRET   = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? ''
    const REGION   = Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'us-east-1'
    const canSign  = !!(ENDPOINT && BUCKET && ACCESS && SECRET)

    // ── GET ─────────────────────────────────────────────────────────────────

    // Storage usage
    if (req.method === 'GET' && (url.searchParams.get('resource') === 'storage' || action === 'storage_usage')) {
      const [driveRes, projFilesRes, projMediaRes, planRes] = await Promise.all([
        supabase.from('drive_files').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('project_files').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('project_media').select('file_size').eq('user_id', user.id).eq('is_trashed', false),
        supabase.from('user_plans').select('plans(storage_limit_gb)').eq('user_id', user.id).eq('is_active', true).single(),
      ])
      const usedBytes = [
        ...(driveRes.data || []),
        ...(projFilesRes.data || []),
        ...(projMediaRes.data || []),
      ].reduce((s: number, r: any) => s + (r.file_size || 0), 0)
      const limitGb = (planRes.data as any)?.plans?.storage_limit_gb ?? 2
      return json({ used_bytes: usedBytes, limit_bytes: limitGb * 1024 * 1024 * 1024, limit_gb: limitGb, used_gb: usedBytes / (1024 * 1024 * 1024) })
    }

    // Folder tree — all user folders flat (client builds the tree)
    if (req.method === 'GET' && action === 'folder_tree') {
      const { data: folders, error } = await supabase
        .from('drive_folders')
        .select('id, name, parent_id, created_at')
        .eq('user_id', user.id)
        .order('name')
      if (error) return json({ error: error.message }, 500)
      return json({ folders: folders || [] })
    }

    // Recent files
    if (req.method === 'GET' && action === 'recent') {
      const limit = parseInt(url.searchParams.get('limit') || '20')
      const { data: files, error } = await supabase
        .from('drive_files')
        .select('*, drive_folders(name)')
        .eq('user_id', user.id)
        .eq('is_trashed', false)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) return json({ error: error.message }, 500)
      const enriched = canSign
        ? await Promise.all((files || []).map(async (f: any) => {
            const thumbKey = f.thumbnail_key || (f.mime_type?.startsWith('image/') ? f.wasabi_key : null)
            if (!thumbKey) return f
            const thumbnailUrl = await presignViewUrl(ENDPOINT, BUCKET, thumbKey, ACCESS, SECRET, REGION).catch(() => null)
            return { ...f, thumbnailUrl, folder_name: f.drive_folders?.name || null }
          }))
        : (files || []).map((f: any) => ({ ...f, folder_name: f.drive_folders?.name || null }))
      return json({ files: enriched })
    }

    // Search files + folders
    if (req.method === 'GET' && action === 'search') {
      const query = url.searchParams.get('query') || ''
      if (!query) return json({ files: [], folders: [] })
      const [filesRes, foldersRes] = await Promise.all([
        supabase.from('drive_files')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_trashed', false)
          .ilike('name', `%${query}%`)
          .order('updated_at', { ascending: false })
          .limit(50),
        supabase.from('drive_folders')
          .select('*')
          .eq('user_id', user.id)
          .ilike('name', `%${query}%`)
          .order('name')
          .limit(20),
      ])
      const enriched = canSign
        ? await Promise.all((filesRes.data || []).map(async (f: any) => {
            const thumbKey = f.thumbnail_key || (f.mime_type?.startsWith('image/') ? f.wasabi_key : null)
            if (!thumbKey) return f
            const thumbnailUrl = await presignViewUrl(ENDPOINT, BUCKET, thumbKey, ACCESS, SECRET, REGION).catch(() => null)
            return { ...f, thumbnailUrl }
          }))
        : (filesRes.data || [])
      return json({ files: enriched, folders: foldersRes.data || [] })
    }

    // Trash listing
    if (req.method === 'GET' && action === 'trash') {
      const { data: files, error } = await supabase
        .from('drive_files')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_trashed', true)
        .order('updated_at', { ascending: false })
      if (error) return json({ error: error.message }, 500)
      return json({ files: files || [] })
    }

    // Standard list
    if (req.method === 'GET') {
      let q = supabase.from('drive_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (trashed) {
        q = q.eq('is_trashed', true)
      } else {
        q = q.eq('is_trashed', false)
        if (folderId && folderId !== 'root') q = q.eq('folder_id', folderId)
        else q = q.is('folder_id', null)
      }
      const { data: files, error } = await q
      if (error) return json({ error: error.message }, 500)
      const enriched = canSign
        ? await Promise.all((files || []).map(async (f: any) => {
            const thumbKey = f.thumbnail_key || (f.mime_type?.startsWith('image/') ? f.wasabi_key : null)
            if (!thumbKey) return f
            const thumbnailUrl = await presignViewUrl(ENDPOINT, BUCKET, thumbKey, ACCESS, SECRET, REGION).catch(() => null)
            return { ...f, thumbnailUrl }
          }))
        : (files || [])
      return json({ files: enriched })
    }

    // ── PATCH — all mutation actions ────────────────────────────────────────
    if (req.method === 'PATCH') {
      const body = await req.json()
      const act = body.action

      // Rename file
      if (act === 'rename') {
        const { id, name } = body
        if (!id || !name) return json({ error: 'id and name required' }, 400)
        const { data, error } = await supabase.from('drive_files')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', user.id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ file: data })
      }

      // Rename folder
      if (act === 'rename_folder') {
        const { id, name } = body
        if (!id || !name) return json({ error: 'id and name required' }, 400)
        const { data, error } = await supabase.from('drive_folders')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', user.id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ folder: data })
      }

      // Move file to folder
      if (act === 'move') {
        const { id, folder_id } = body
        if (!id) return json({ error: 'id required' }, 400)
        const { data, error } = await supabase.from('drive_files')
          .update({ folder_id: folder_id || null, updated_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', user.id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ file: data })
      }

      // Move multiple files
      if (act === 'move_multiple') {
        const { ids, folder_id } = body
        if (!ids?.length) return json({ error: 'ids required' }, 400)
        const { error } = await supabase.from('drive_files')
          .update({ folder_id: folder_id || null, updated_at: new Date().toISOString() })
          .in('id', ids).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      // Restore from trash
      if (act === 'restore') {
        const { id } = body
        if (!id) return json({ error: 'id required' }, 400)
        const { data, error } = await supabase.from('drive_files')
          .update({ is_trashed: false, folder_id: null, trashed_at: null, updated_at: new Date().toISOString() })
          .eq('id', id).eq('user_id', user.id).select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ file: data })
      }

      // Permanent delete (single file + Wasabi cleanup)
      if (act === 'permanent_delete') {
        const { id } = body
        if (!id) return json({ error: 'id required' }, 400)
        const { data: f } = await supabase.from('drive_files').select('wasabi_key, thumbnail_key').eq('id', id).eq('user_id', user.id).single()
        const { error } = await supabase.from('drive_files').delete().eq('id', id).eq('user_id', user.id)
        if (error) return json({ error: error.message }, 500)
        if (f && canSign) {
          if (f.wasabi_key) await wasabiDelete(ENDPOINT, BUCKET, f.wasabi_key, ACCESS, SECRET, REGION)
          if (f.thumbnail_key) await wasabiDelete(ENDPOINT, BUCKET, f.thumbnail_key, ACCESS, SECRET, REGION)
        }
        return json({ ok: true })
      }

      // Empty trash — delete all trashed files + Wasabi objects
      if (act === 'empty_trash') {
        const { data: trashFiles } = await supabase.from('drive_files')
          .select('id, wasabi_key, thumbnail_key').eq('user_id', user.id).eq('is_trashed', true)
        const { error } = await supabase.from('drive_files').delete().eq('user_id', user.id).eq('is_trashed', true)
        if (error) return json({ error: error.message }, 500)
        if (canSign && trashFiles) {
          await Promise.allSettled(trashFiles.flatMap((f: any) => [
            f.wasabi_key   ? wasabiDelete(ENDPOINT, BUCKET, f.wasabi_key,   ACCESS, SECRET, REGION) : null,
            f.thumbnail_key? wasabiDelete(ENDPOINT, BUCKET, f.thumbnail_key,ACCESS, SECRET, REGION) : null,
          ].filter(Boolean)))
        }
        return json({ ok: true, count: trashFiles?.length || 0 })
      }

      // Trash folder (recursive — trash all contents)
      if (act === 'trash_folder') {
        const { id } = body
        if (!id) return json({ error: 'id required' }, 400)
        // Recursively collect all subfolder IDs
        async function collectSubfolderIds(parentId: string): Promise<string[]> {
          const { data: subs } = await supabase.from('drive_folders')
            .select('id').eq('parent_id', parentId).eq('user_id', user.id)
          if (!subs?.length) return [parentId]
          const children = await Promise.all(subs.map((s: any) => collectSubfolderIds(s.id)))
          return [parentId, ...children.flat()]
        }
        const allFolderIds = await collectSubfolderIds(id)
        // Trash all files in these folders
        await supabase.from('drive_files')
          .update({ is_trashed: true, trashed_at: new Date().toISOString() })
          .in('folder_id', allFolderIds).eq('user_id', user.id)
        // Delete the folder (and children cascade via FK)
        await supabase.from('drive_folders').delete().eq('id', id).eq('user_id', user.id)
        return json({ ok: true })
      }

      // Create folder
      if (act === 'create_folder') {
        const { name, parent_id } = body
        if (!name) return json({ error: 'name required' }, 400)
        const { data, error } = await supabase.from('drive_folders')
          .insert({ name, parent_id: parent_id || null, user_id: user.id })
          .select().single()
        if (error) return json({ error: error.message }, 500)
        return json({ folder: data })
      }

      return json({ error: 'Unknown action' }, 400)
    }

    // ── PUT — legacy file update (rename, move, trash, restore) ────────────
    if (req.method === 'PUT') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const allowed = ['name', 'folder_id', 'is_trashed', 'trashed_at', 'thumbnail_key']
      const updates: any = { updated_at: new Date().toISOString() }
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]
      if (body.is_trashed === false) updates.trashed_at = null
      const { data: updated, error } = await supabase.from('drive_files').update(updates).eq('id', fileId).eq('user_id', user.id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ file: updated })
    }

    // ── DELETE — permanent delete (legacy, by query param) ─────────────────
    if (req.method === 'DELETE') {
      if (!fileId) return json({ error: 'id required' }, 400)
      const { data: f } = await supabase.from('drive_files').select('wasabi_key, thumbnail_key').eq('id', fileId).eq('user_id', user.id).single()
      const { error } = await supabase.from('drive_files').delete().eq('id', fileId).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      if (f && canSign) {
        if (f.wasabi_key) await wasabiDelete(ENDPOINT, BUCKET, f.wasabi_key, ACCESS, SECRET, REGION)
        if (f.thumbnail_key) await wasabiDelete(ENDPOINT, BUCKET, f.thumbnail_key, ACCESS, SECRET, REGION)
      }
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
