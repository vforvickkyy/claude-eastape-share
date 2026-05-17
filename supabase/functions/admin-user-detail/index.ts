import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    const { data: adminProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminProfile?.is_admin) return json({ error: 'Forbidden' }, 403)

    const url = new URL(req.url)
    const userId = url.searchParams.get('user_id')
    if (!userId) return json({ error: 'user_id required' }, 400)

    // ── GET: return user content + stats ─────────────────────────────────────
    if (req.method === 'GET') {
      const ago30 = new Date(Date.now() - 30 * 86400000).toISOString()

      const [
        profileRes,
        projectsRes,
        driveListRes,
        mediaListRes,
        driveBytesRes,
        mediaBytesRes,
        projCountRes,
        pfCountRes,
        driveCountRes,
        mediaCountRes,
        uploads30dRes,
      ] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
        supabase.from('projects').select('id,name,created_at,status').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabase.from('drive_files').select('id,filename,file_size,created_at').eq('user_id', userId).eq('is_trashed', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('project_media').select('id,name,file_size,created_at').eq('user_id', userId).eq('is_trashed', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('drive_files').select('file_size').eq('user_id', userId).eq('is_trashed', false),
        supabase.from('project_media').select('file_size').eq('user_id', userId).eq('is_trashed', false),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('project_files').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_trashed', false),
        supabase.from('drive_files').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_trashed', false),
        supabase.from('project_media').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_trashed', false),
        supabase.from('drive_files').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_trashed', false).gte('created_at', ago30),
      ])

      const driveFiles = driveListRes.data || []
      const mediaFiles = mediaListRes.data || []
      const driveBytes = (driveBytesRes.data || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)
      const mediaBytes = (mediaBytesRes.data || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)

      return json({
        username: profileRes.data?.username || null,
        projects: projectsRes.data || [],
        drive_files: driveFiles.map((f: any) => ({ ...f, name: f.filename || 'Untitled' })),
        project_media: mediaFiles,
        stats: {
          projects: projCountRes.count || 0,
          drive_files: driveCountRes.count || 0,
          project_media: mediaCountRes.count || 0,
          project_files: pfCountRes.count || 0,
          uploads_30d: uploads30dRes.count || 0,
          drive_bytes: driveBytes,
          media_bytes: mediaBytes,
          storage_bytes: driveBytes + mediaBytes,
        },
      })
    }

    // ── PATCH: update user profile ────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const body = await req.json()
      const errors: string[] = []

      // 1. Profile table updates (only columns that exist in profiles)
      const profileUpdates: Record<string, unknown> = {}
      if (body.full_name !== undefined)   profileUpdates.full_name   = body.full_name
      if (body.is_admin !== undefined)     profileUpdates.is_admin     = body.is_admin
      if (body.is_suspended !== undefined) profileUpdates.is_suspended = body.is_suspended
      if (body.username !== undefined && body.username !== '') {
        profileUpdates.username = (body.username as string).toLowerCase().trim()
        profileUpdates.username_changed_at = new Date().toISOString()
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileErr } = await supabase
          .from('profiles').update(profileUpdates).eq('id', userId)
        if (profileErr) errors.push('profile: ' + profileErr.message)
      }

      // 2. Sync full_name to auth user_metadata (best-effort, non-fatal)
      if (body.full_name !== undefined) {
        try {
          await supabase.auth.admin.updateUserById(userId, {
            user_metadata: { full_name: body.full_name }
          })
        } catch { /* non-fatal */ }
      }

      // 3. Plan change: deactivate current, insert new
      if (body.plan_id) {
        const { error: planDeactivateErr } = await supabase
          .from('user_plans').update({ is_active: false }).eq('user_id', userId)
        if (planDeactivateErr) errors.push('plan deactivate: ' + planDeactivateErr.message)

        const { error: planInsertErr } = await supabase
          .from('user_plans').insert({
            user_id: userId,
            plan_id: body.plan_id,
            is_active: true,
            started_at: new Date().toISOString(),
          })
        if (planInsertErr) errors.push('plan insert: ' + planInsertErr.message)
      }

      if (errors.length > 0) return json({ error: errors.join('; ') }, 400)

      try {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'admin_update_user',
          target_type: 'user',
          target_id: userId,
          metadata: { fields: Object.keys(body) },
        })
      } catch { /* non-fatal */ }

      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
