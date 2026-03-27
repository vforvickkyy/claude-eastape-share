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
    const linkId    = url.searchParams.get('id')
    const projectId = url.searchParams.get('projectId')
    const mediaId   = url.searchParams.get('mediaId')

    // GET — list share links
    if (req.method === 'GET') {
      let q = supabase.from('share_links').select('*, project_media(*), project_files(name, mime_type)').eq('created_by', user.id).order('created_at', { ascending: false })
      if (projectId) q = q.eq('project_id', projectId)
      if (mediaId)   q = q.eq('project_media_id', mediaId)
      const { data: links, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ links: links || [] })
    }

    // POST — create share link
    if (req.method === 'POST') {
      const body = await req.json()
      const { project_media_id, project_file_id, project_id, allow_download, allow_comments, password, expires_at, recipient_email, share_message, file_name } = body

      if (!project_media_id && !project_file_id && !project_id) {
        return json({ error: 'One of project_media_id, project_file_id, or project_id required' }, 400)
      }

      const { data: link, error } = await supabase.from('share_links').insert({
        created_by: user.id, project_media_id, project_file_id, project_id,
        allow_download: allow_download ?? true,
        allow_comments: allow_comments ?? false,
        password: password || null, expires_at: expires_at || null,
      }).select().single()
      if (error) return json({ error: error.message }, 500)

      const baseUrl = Deno.env.get('SITE_URL') || 'https://claude-eastape-share.vercel.app'
      const shareUrl = `${baseUrl}/share/${link.token}`

      // Send share email if recipient provided (non-fatal)
      if (recipient_email) {
        try {
          const { data: sharer } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          const displayName = file_name || (project_media_id ? 'a video' : project_file_id ? 'a file' : 'a project')
          const expiresFormatted = expires_at
            ? new Date(expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : null
          await sendEmail({
            to: recipient_email,
            template: 'shareLink',
            data: {
              sharedBy: sharer?.full_name || 'Someone',
              fileName: displayName,
              shareUrl,
              message: share_message || null,
              expiresAt: expiresFormatted,
            }
          })
        } catch {}
      }

      return json({ link, shareUrl })
    }

    // PUT — update (toggle allow_download, etc.)
    if (req.method === 'PUT') {
      if (!linkId) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const allowed = ['allow_download', 'allow_comments', 'password', 'expires_at']
      const updates: any = {}
      for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]

      const { data: updated, error } = await supabase.from('share_links').update(updates).eq('id', linkId).eq('created_by', user.id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ link: updated })
    }

    // DELETE — revoke link
    if (req.method === 'DELETE') {
      if (!linkId) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('share_links').delete().eq('id', linkId).eq('created_by', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
