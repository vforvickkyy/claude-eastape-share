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
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    const { data: { user } } = await authClient.auth.getUser()

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const assetId = url.searchParams.get('assetId')

    if (req.method === 'GET') {
      if (!assetId) return json({ error: 'assetId required' }, 400)
      if (!user) return json({ error: 'Unauthorized' }, 401)

      // Verify asset exists in new table
      const { data: asset } = await supabase.from('project_media').select('id, user_id').eq('id', assetId).single()
      if (!asset) return json({ error: 'Asset not found' }, 404)

      const { data, error } = await supabase
        .from('project_media_comments')
        .select('*, profiles:user_id (id, full_name, avatar_url)')
        .eq('media_id', assetId)
        .order('created_at')

      if (error) return json({ error: error.message }, 500)
      return json({ comments: data || [] })
    }

    if (req.method === 'POST') {
      const { assetId: aid, body, timestampSeconds, parentCommentId, shareToken, guestName } = await req.json()
      if (!aid || !body) return json({ error: 'assetId and body required' }, 400)

      // Guest comment via share token
      if (shareToken) {
        const { data: link } = await supabase.from('share_links').select('*').eq('token', shareToken).eq('project_media_id', aid).single()
        if (!link) return json({ error: 'Invalid share token' }, 403)
        if (!link.allow_comments) return json({ error: 'Comments not allowed on this link' }, 403)
        if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'Share link expired' }, 410)

        const { data, error } = await supabase
          .from('project_media_comments')
          .insert({ media_id: aid, user_id: null, guest_name: guestName?.trim() || 'Anonymous', body, timestamp_seconds: timestampSeconds ?? null, parent_comment_id: parentCommentId ?? null })
          .select()
          .single()
        if (error) return json({ error: error.message }, 500)
        return json({ comment: data }, 201)
      }

      // Authenticated comment
      if (!user) return json({ error: 'Unauthorized' }, 401)

      const { data, error } = await supabase
        .from('project_media_comments')
        .insert({ media_id: aid, user_id: user.id, body, timestamp_seconds: timestampSeconds ?? null, parent_comment_id: parentCommentId ?? null })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)

      // Send notifications (non-fatal)
      try {
        const [{ data: media }, { data: commenter }] = await Promise.all([
          supabase.from('project_media').select('user_id, name, project_id').eq('id', aid).single(),
          supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        ])

        const formatTs = (s: number) => {
          const m = Math.floor(s / 60)
          const sec = Math.floor(s % 60).toString().padStart(2, '0')
          return `${m}:${sec}`
        }

        const viewUrl = media?.project_id
          ? `https://claude-eastape-share.vercel.app/projects/${media.project_id}/media/${aid}`
          : `https://claude-eastape-share.vercel.app`

        // Notify media owner (if not themselves)
        if (media && media.user_id && media.user_id !== user.id) {
          await sendEmail({
            userId: media.user_id,
            notificationType: 'comments',
            template: 'commentAdded',
            data: {
              commenterName: commenter?.full_name || 'Someone',
              fileName: media.name || 'your file',
              commentBody: body.substring(0, 200),
              timestamp: timestampSeconds != null ? formatTs(timestampSeconds) : null,
              viewUrl,
            }
          })
        }

        // Check for @mentions and notify mentioned users
        const mentions = (body as string).match(/@([a-z0-9_]+)/gi) || []
        for (const mention of mentions) {
          const username = mention.slice(1).toLowerCase()
          const { data: mentionedUser } = await supabase
            .from('profiles').select('id').ilike('username', username).maybeSingle()
          if (mentionedUser && mentionedUser.id !== user.id) {
            await sendEmail({
              userId: mentionedUser.id,
              notificationType: 'mentions',
              template: 'mentionedInComment',
              data: {
                mentionerName: commenter?.full_name || 'Someone',
                fileName: media?.name || 'a file',
                commentBody: body.substring(0, 200),
                viewUrl,
              }
            })
          }
        }
      } catch {}

      return json({ comment: data }, 201)
    }

    if (!user) return json({ error: 'Unauthorized' }, 401)

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id required' }, 400)
      const body = await req.json()
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('resolved' in body) updates.resolved = body.resolved
      if ('body' in body) updates.body = body.body

      const { data: comment } = await supabase.from('project_media_comments').select('user_id, media_id').eq('id', id).single()
      if (!comment) return json({ error: 'Not found' }, 404)

      const isAuthor = comment.user_id === user.id
      let allowed = isAuthor
      if (!isAuthor) {
        const { data: asset } = await supabase.from('project_media').select('user_id').eq('id', comment.media_id).single()
        allowed = asset?.user_id === user.id
      }
      if (!allowed) return json({ error: 'Forbidden' }, 403)

      const { data, error } = await supabase.from('project_media_comments').update(updates).eq('id', id).select().single()
      if (error) return json({ error: error.message }, 500)
      return json({ comment: data })
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await supabase.from('project_media_comments').delete().eq('id', id).eq('user_id', user.id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
