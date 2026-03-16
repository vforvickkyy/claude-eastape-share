import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const folderId = url.searchParams.get('folderId')
    const trash = url.searchParams.get('trash')
    const limit = parseInt(url.searchParams.get('limit') ?? '100')
    const isTrash = trash === 'true'

    let query = supabase
      .from('shares')
      .select('id, token, file_name, file_url, file_size, created_at, expires_at, folder_id, is_trashed, trashed_at, storage_deleted')
      .eq('user_id', user.id)
      .eq('is_trashed', isTrash)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!isTrash && folderId) {
      query = query.eq('folder_id', folderId)
    } else if (!isTrash && !folderId) {
      query = query.is('folder_id', null)
    }

    const { data: files, error: filesError } = await query
    if (filesError) return json({ error: filesError.message }, 500)

    const shareMap: Record<string, { token: string; created_at: string; expires_at: string; folder_id: string | null; is_trashed: boolean; trashed_at: string | null; files: { id: string; name: string; size: number; url: string; storage_deleted: boolean }[] }> = {}
    for (const file of files || []) {
      if (!shareMap[file.token]) {
        shareMap[file.token] = {
          token: file.token,
          created_at: file.created_at,
          expires_at: file.expires_at,
          folder_id: file.folder_id,
          is_trashed: file.is_trashed,
          trashed_at: file.trashed_at,
          files: [],
        }
      }
      shareMap[file.token].files.push({ id: file.id, name: file.file_name, size: file.file_size, url: file.file_url, storage_deleted: file.storage_deleted })
    }

    const shares = Object.values(shareMap)

    let folders: unknown[] = []
    if (!isTrash) {
      let folderQuery = supabase.from('folders').select('id, name, parent_id, created_at').eq('user_id', user.id).order('name')
      if (folderId) {
        folderQuery = folderQuery.eq('parent_id', folderId)
      } else {
        folderQuery = folderQuery.is('parent_id', null)
      }
      const { data: folderData } = await folderQuery
      folders = folderData || []
    }

    return json({ shares, folders })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
