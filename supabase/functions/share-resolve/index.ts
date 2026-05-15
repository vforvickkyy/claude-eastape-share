import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
async function presignGet(endpoint: string, bucket: string, key: string, accessKeyId: string, secretAccessKey: string, region: string, expiresIn = 14400, fileName?: string): Promise<string> {
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
  if (fileName) {
    const safeFileName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_')
    qp.set('response-content-disposition', `attachment; filename="${safeFileName}"`)
  }
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

// Check if folderId is a descendant of (or equal to) ancestorId in drive_folders
async function isDescendantOf(supabase: ReturnType<typeof createClient>, folderId: string, ancestorId: string): Promise<boolean> {
  let cur = folderId
  for (let i = 0; i < 25; i++) {
    if (cur === ancestorId) return true
    const { data: f } = await supabase.from('drive_folders').select('parent_id').eq('id', cur).single()
    if (!f || !f.parent_id) return false
    cur = f.parent_id
  }
  return false
}

// Check if folderId is a descendant of (or equal to) ancestorId in project_folders
async function isProjectFolderDescendantOf(supabase: ReturnType<typeof createClient>, folderId: string, ancestorId: string): Promise<boolean> {
  let cur = folderId
  for (let i = 0; i < 25; i++) {
    if (cur === ancestorId) return true
    const { data: f } = await supabase.from('project_folders').select('parent_id').eq('id', cur).single()
    if (!f || !f.parent_id) return false
    cur = f.parent_id
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const url = new URL(req.url)
    const token       = url.searchParams.get('token')
    const password    = url.searchParams.get('password')
    const subFolderId = url.searchParams.get('subfolder_id')
    if (!token) return json({ error: 'Token required' }, 400)

    const { data: link, error } = await supabase
      .from('share_links')
      .select('*, project_media(*), projects(id, name, color, icon), drive_files(id, name, mime_type, file_size, wasabi_key, thumbnail_key), drive_folders(id, name), project_folders(id, name)')
      .or(`token.eq.${token},short_token.eq.${token}`)
      .single()

    if (error || !link) return json({ error: 'Share link not found' }, 404)
    if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'Share link expired' }, 410)
    if (link.password) {
      if (!password) return json({ error: 'Password required', passwordRequired: true }, 401)
      if (link.password !== password) return json({ error: 'Incorrect password' }, 401)
    }

    // Increment view count (non-blocking)
    supabase.from('share_links')
      .update({ view_count: (link.view_count || 0) + 1, last_accessed_at: new Date().toISOString() })
      .eq('id', link.id)
      .then(() => {})

    const wEndpoint = (Deno.env.get('AWS_ENDPOINT') ?? Deno.env.get('WASABI_ENDPOINT') ?? '').replace(/\/$/, '') || 'https://s3.ap-southeast-1.wasabisys.com'
    const wBucket   = Deno.env.get('AWS_BUCKET_NAME') ?? Deno.env.get('WASABI_BUCKET') ?? ''
    const wKey      = Deno.env.get('AWS_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY_ID') ?? Deno.env.get('WASABI_ACCESS_KEY') ?? ''
    const wSecret   = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_ACCESS_KEY') ?? Deno.env.get('WASABI_SECRET_KEY') ?? ''
    const wRegion   = Deno.env.get('AWS_REGION') ?? Deno.env.get('WASABI_REGION') ?? 'ap-southeast-1'

    async function signMedia(media: any) {
      let videoUrl: string | null = null
      let thumbnailUrl: string | null = null
      if (media.wasabi_key && wKey) {
        try { videoUrl = await presignGet(wEndpoint, wBucket, media.wasabi_key, wKey, wSecret, wRegion) } catch {}
      }
      const thumbKey = media.wasabi_thumbnail_key ||
        (media.type === 'image' || media.mime_type?.startsWith('image/') ? media.wasabi_key : null)
      if (thumbKey && wKey) {
        try { thumbnailUrl = await presignGet(wEndpoint, wBucket, thumbKey, wKey, wSecret, wRegion) } catch {}
      }
      return { ...media, videoUrl, thumbnailUrl }
    }

    // ── Single media asset share ──────────────────────────────────────────────
    if (link.project_media_id && link.project_media) {
      const asset = await signMedia(link.project_media)
      let comments: unknown[] = []
      if (link.allow_comments) {
        const { data: rows } = await supabase
          .from('project_media_comments')
          .select('*, profiles:user_id(full_name, avatar_url)')
          .eq('media_id', asset.id)
          .order('created_at')
        comments = rows || []
      }
      return json({ asset, allowDownload: link.allow_download ?? true, allowComments: link.allow_comments ?? false, comments })
    }

    // ── Project-level share ───────────────────────────────────────────────────
    if (link.project_id && !link.project_media_id) {
      const { data: assets } = await supabase
        .from('project_media')
        .select('id, name, type, mime_type, wasabi_key, wasabi_thumbnail_key, wasabi_status, duration, file_size, status, cloudflare_uid, cloudflare_status')
        .eq('project_id', link.project_id)
        .eq('is_trashed', false)
        .order('created_at', { ascending: false })
      const enriched = await Promise.all((assets || []).map(signMedia))
      return json({ type: 'project', project: link.projects, assets: enriched, allowDownload: link.allow_download ?? true })
    }

    // ── Drive file share ──────────────────────────────────────────────────────
    if (link.drive_file_id && link.drive_files) {
      const f = link.drive_files
      let downloadUrl: string | null = null
      let thumbnailUrl: string | null = null
      if (f.wasabi_key && wKey) {
        try { downloadUrl = await presignGet(wEndpoint, wBucket, f.wasabi_key, wKey, wSecret, wRegion, 14400, f.name) } catch {}
      }
      const thumbKey = f.thumbnail_key || (f.mime_type?.startsWith('image/') ? f.wasabi_key : null)
      if (thumbKey && wKey) {
        try { thumbnailUrl = await presignGet(wEndpoint, wBucket, thumbKey, wKey, wSecret, wRegion) } catch {}
      }
      return json({ type: 'drive_file', file: { ...f, downloadUrl, thumbnailUrl }, allowDownload: link.allow_download ?? true })
    }

    // ── Drive folder share ────────────────────────────────────────────────────
    if (link.drive_folder_id && link.drive_folders) {
      const rootFolder = link.drive_folders

      let listFolderId = link.drive_folder_id
      let currentFolder: any = rootFolder

      if (subFolderId && subFolderId !== link.drive_folder_id) {
        const ok = await isDescendantOf(supabase, subFolderId, link.drive_folder_id)
        if (!ok) return json({ error: 'Access denied' }, 403)
        const { data: sf } = await supabase.from('drive_folders').select('id, name, parent_id').eq('id', subFolderId).single()
        if (!sf) return json({ error: 'Subfolder not found' }, 404)
        listFolderId = subFolderId
        currentFolder = sf
      }

      const [filesResult, subfoldersResult] = await Promise.all([
        supabase.from('drive_files')
          .select('id, name, mime_type, file_size, wasabi_key, thumbnail_key, created_at')
          .eq('folder_id', listFolderId)
          .eq('is_trashed', false)
          .order('name'),
        supabase.from('drive_folders')
          .select('id, name, created_at')
          .eq('parent_id', listFolderId)
          .order('name'),
      ])

      const enrichedFiles = await Promise.all((filesResult.data || []).map(async (f: any) => {
        let downloadUrl: string | null = null
        let thumbnailUrl: string | null = null
        if (f.wasabi_key && wKey) {
          try { downloadUrl = await presignGet(wEndpoint, wBucket, f.wasabi_key, wKey, wSecret, wRegion, 14400, f.name) } catch {}
        }
        const thumbKey = f.thumbnail_key || (f.mime_type?.startsWith('image/') ? f.wasabi_key : null)
        if (thumbKey && wKey) {
          try { thumbnailUrl = await presignGet(wEndpoint, wBucket, thumbKey, wKey, wSecret, wRegion) } catch {}
        }
        return { ...f, downloadUrl, thumbnailUrl }
      }))

      return json({
        type: 'drive_folder',
        rootFolder,
        currentFolder,
        subfolders: subfoldersResult.data || [],
        files: enrichedFiles,
        allowDownload: link.allow_download ?? true,
      })
    }

    // ── Project folder share ──────────────────────────────────────────────────
    if (link.project_folder_id && link.project_folders) {
      const rootFolder = link.project_folders

      let listFolderId = link.project_folder_id
      let currentFolder: any = rootFolder

      if (subFolderId && subFolderId !== link.project_folder_id) {
        const ok = await isProjectFolderDescendantOf(supabase, subFolderId, link.project_folder_id)
        if (!ok) return json({ error: 'Access denied' }, 403)
        const { data: sf } = await supabase.from('project_folders').select('id, name, parent_id').eq('id', subFolderId).single()
        if (!sf) return json({ error: 'Subfolder not found' }, 404)
        listFolderId = subFolderId
        currentFolder = sf
      }

      const [mediaResult, filesResult, subfoldersResult] = await Promise.all([
        supabase.from('project_media')
          .select('id, name, type, mime_type, wasabi_key, wasabi_thumbnail_key, file_size, created_at')
          .eq('folder_id', listFolderId)
          .eq('is_trashed', false)
          .order('name'),
        supabase.from('project_files')
          .select('id, name, mime_type, wasabi_key, thumbnail_key, file_size, created_at')
          .eq('folder_id', listFolderId)
          .order('name'),
        supabase.from('project_folders')
          .select('id, name, created_at')
          .eq('parent_id', listFolderId)
          .order('name'),
      ])

      // Sign media files
      const signedMedia = await Promise.all((mediaResult.data || []).map(async (m: any) => {
        let downloadUrl: string | null = null
        let thumbnailUrl: string | null = null
        if (m.wasabi_key && wKey) {
          try { downloadUrl = await presignGet(wEndpoint, wBucket, m.wasabi_key, wKey, wSecret, wRegion, 14400, m.name) } catch {}
        }
        const thumbKey = m.wasabi_thumbnail_key || (m.type === 'image' || m.mime_type?.startsWith('image/') ? m.wasabi_key : null)
        if (thumbKey && wKey) {
          try { thumbnailUrl = await presignGet(wEndpoint, wBucket, thumbKey, wKey, wSecret, wRegion) } catch {}
        }
        return { ...m, downloadUrl, thumbnailUrl }
      }))

      // Sign raw files
      const signedFiles = await Promise.all((filesResult.data || []).map(async (f: any) => {
        let downloadUrl: string | null = null
        let thumbnailUrl: string | null = null
        if (f.wasabi_key && wKey) {
          try { downloadUrl = await presignGet(wEndpoint, wBucket, f.wasabi_key, wKey, wSecret, wRegion, 14400, f.name) } catch {}
        }
        const thumbKey = f.thumbnail_key || (f.mime_type?.startsWith('image/') ? f.wasabi_key : null)
        if (thumbKey && wKey) {
          try { thumbnailUrl = await presignGet(wEndpoint, wBucket, thumbKey, wKey, wSecret, wRegion) } catch {}
        }
        return { ...f, downloadUrl, thumbnailUrl }
      }))

      // Merge and sort all files by name
      const allFiles = [...signedMedia, ...signedFiles].sort((a, b) => (a.name || '').localeCompare(b.name || ''))

      return json({
        type: 'project_folder',
        rootFolder,
        currentFolder,
        subfolders: subfoldersResult.data || [],
        files: allFiles,
        allowDownload: link.allow_download ?? true,
        allowComments: link.allow_comments ?? false,
      })
    }

    return json({ error: 'Invalid share link' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
