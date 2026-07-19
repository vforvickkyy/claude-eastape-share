import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// Logging in through an editor/reviewer share link grants the visitor real,
// persistent project access (like accepting an invite) instead of leaving
// them stuck in the read-only public preview.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { token } = await req.json()
    if (!token) return json({ error: 'Token required' }, 400)

    const { data: link } = await supabase
      .from('share_links')
      .select('id, project_id, role, created_by, expires_at')
      .or(`token.eq.${token},short_token.eq.${token}`)
      .single()

    if (!link) return json({ error: 'Share link not found' }, 404)
    if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'Share link expired' }, 410)
    if (!link.project_id) return json({ error: 'This link is not a project share' }, 400)

    const role = link.role || 'viewer'

    const { data: project } = await supabase.from('projects').select('user_id').eq('id', link.project_id).single()
    if (!project) return json({ error: 'Project not found' }, 404)

    if (project.user_id === user.id) {
      // Already the owner — nothing to grant
      return json({ ok: true, projectId: link.project_id, role: 'owner' })
    }

    const { data: existing } = await supabase
      .from('project_members')
      .select('id, role, accepted')
      .eq('project_id', link.project_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      if (!existing.accepted) {
        await supabase.from('project_members').update({ accepted: true }).eq('id', existing.id)
      }
      return json({ ok: true, projectId: link.project_id, role: existing.role })
    }

    const { error: insertErr } = await supabase.from('project_members').insert({
      project_id: link.project_id,
      user_id: user.id,
      role,
      accepted: true,
      invited_by: link.created_by,
    })
    if (insertErr) return json({ error: insertErr.message }, 500)

    return json({ ok: true, projectId: link.project_id, role })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
