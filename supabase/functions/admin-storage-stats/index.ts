import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return json({ error: 'Forbidden' }, 403)

    const url = new URL(req.url)
    const page   = parseInt(url.searchParams.get('page')   || '1')
    const limit  = parseInt(url.searchParams.get('limit')  || '50')
    const search = url.searchParams.get('search') || ''
    const offset = (page - 1) * limit

    // All drive files + project media (active, not trashed)
    const [{ data: driveFiles }, { data: mediaFiles }] = await Promise.all([
      supabase.from('drive_files').select('user_id, file_size, mime_type').eq('is_trashed', false),
      supabase.from('project_media').select('user_id, file_size, mime_type').eq('is_trashed', false),
    ])

    const totalDriveBytes  = (driveFiles  || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)
    const totalMediaBytes  = (mediaFiles  || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)
    const totalBytes       = totalDriveBytes + totalMediaBytes
    const totalFiles       = (driveFiles || []).length + (mediaFiles || []).length

    // Group by user
    const byUser: Record<string, { drive_bytes: number, media_bytes: number, drive_count: number, media_count: number }> = {}
    for (const f of (driveFiles || [])) {
      if (!f.user_id) continue
      if (!byUser[f.user_id]) byUser[f.user_id] = { drive_bytes: 0, media_bytes: 0, drive_count: 0, media_count: 0 }
      byUser[f.user_id].drive_bytes += f.file_size || 0
      byUser[f.user_id].drive_count++
    }
    for (const f of (mediaFiles || [])) {
      if (!f.user_id) continue
      if (!byUser[f.user_id]) byUser[f.user_id] = { drive_bytes: 0, media_bytes: 0, drive_count: 0, media_count: 0 }
      byUser[f.user_id].media_bytes += f.file_size || 0
      byUser[f.user_id].media_count++
    }

    // Profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')

    const profileIds = (profiles || []).map((p: any) => p.id)

    // User plans
    const { data: userPlans } = profileIds.length > 0
      ? await supabase.from('user_plans').select('user_id, plans(id, name, storage_limit_gb)').in('user_id', profileIds).eq('is_active', true)
      : { data: [] }

    const planByUser: Record<string, any> = {}
    for (const up of (userPlans || [])) planByUser[(up as any).user_id] = (up as any).plans

    // Largest single file
    const [{ data: largestDrive }, { data: largestMedia }] = await Promise.all([
      supabase.from('drive_files').select('file_size, filename').eq('is_trashed', false).order('file_size', { ascending: false }).limit(1).single().catch(() => ({ data: null })),
      supabase.from('project_media').select('file_size, name').eq('is_trashed', false).order('file_size', { ascending: false }).limit(1).single().catch(() => ({ data: null })),
    ])

    const largestFile = (largestDrive?.file_size || 0) >= (largestMedia?.file_size || 0)
      ? { bytes: largestDrive?.file_size || 0, name: largestDrive?.filename || null }
      : { bytes: largestMedia?.file_size || 0, name: largestMedia?.name || null }

    let userStats = (profiles || []).map((p: any) => {
      const plan  = planByUser[p.id]
      const usage = byUser[p.id] || { drive_bytes: 0, media_bytes: 0, drive_count: 0, media_count: 0 }
      const limitGb = plan?.storage_limit_gb ?? 2
      const totalBytes = usage.drive_bytes + usage.media_bytes
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        plan_name: plan?.name || 'Free',
        storage_limit_gb: limitGb,
        total_bytes: totalBytes,
        drive_bytes: usage.drive_bytes,
        media_bytes: usage.media_bytes,
        drive_count: usage.drive_count,
        media_count: usage.media_count,
        file_count: usage.drive_count + usage.media_count,
        pct: Math.min(100, Math.round(totalBytes / (limitGb * 1024 * 1024 * 1024) * 100)),
      }
    })

    if (search) {
      const q = search.toLowerCase()
      userStats = userStats.filter((u: any) =>
        u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q)
      )
    }

    userStats.sort((a: any, b: any) => b.total_bytes - a.total_bytes)
    const avgBytes = userStats.length > 0
      ? Math.round(totalBytes / userStats.length)
      : 0

    return json({
      overview: {
        total_bytes: totalBytes,
        drive_bytes: totalDriveBytes,
        media_bytes: totalMediaBytes,
        total_files: totalFiles,
        user_count: (profiles || []).length,
        avg_bytes_per_user: avgBytes,
        largest_file_bytes: largestFile.bytes,
        largest_file_name: largestFile.name,
      },
      users: userStats.slice(offset, offset + limit),
      total: userStats.length,
    })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
