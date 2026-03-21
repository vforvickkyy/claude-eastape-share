import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/

async function validateAndSaveUsername(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  rawUsername: string
): Promise<{ error?: string; username?: string; username_changed_at?: string }> {
  const uname = rawUsername.toLowerCase().trim()
  if (!USERNAME_RE.test(uname)) {
    return { error: 'Username must be 3-20 characters. Letters, numbers, _ and - only.' }
  }
  const { data: reserved } = await supabase
    .from('reserved_usernames').select('username').eq('username', uname).maybeSingle()
  if (reserved) return { error: 'This username is not available.' }

  const { data: existing } = await supabase
    .from('profiles').select('id').ilike('username', uname).neq('id', userId).maybeSingle()
  if (existing) return { error: 'Username is already taken.' }

  const { data: profile } = await supabase
    .from('profiles').select('username_changed_at').eq('id', userId).maybeSingle()
  if (profile?.username_changed_at) {
    const daysSince = (Date.now() - new Date(profile.username_changed_at).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 30) {
      const daysLeft = Math.ceil(30 - daysSince)
      return { error: `You can change username again in ${daysLeft} days.` }
    }
  }
  return { username: uname, username_changed_at: new Date().toISOString() }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const url = new URL(req.url)

    // ── Public: check username availability (no auth required) ──
    if (req.method === 'GET' && url.searchParams.get('action') === 'check_username') {
      const uname = (url.searchParams.get('username') || '').toLowerCase()
      if (!USERNAME_RE.test(uname)) return json({ available: false, reason: 'invalid' })

      const { data: reserved } = await supabase
        .from('reserved_usernames').select('username').eq('username', uname).maybeSingle()
      if (reserved) return json({ available: false, reason: 'reserved' })

      const { data: existing } = await supabase
        .from('profiles').select('id').ilike('username', uname).maybeSingle()
      return json({ available: !existing, reason: existing ? 'taken' : null })
    }

    // ── All other requests require auth ──
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ── GET profile ──
    if (req.method === 'GET') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, username_changed_at, role, onboarding_completed, onboarding_step, onboarding_dismissed')
        .eq('id', user.id).maybeSingle()
      return json({
        id:                   user.id,
        email:                user.email,
        name:                 user.user_metadata?.full_name || '',
        company:              user.user_metadata?.company   || '',
        avatarUrl:            user.user_metadata?.avatar_url || null,
        createdAt:            user.created_at,
        username:             profile?.username             || null,
        username_changed_at:  profile?.username_changed_at  || null,
        role:                 profile?.role                 || null,
        onboarding_completed: profile?.onboarding_completed ?? false,
        onboarding_step:      profile?.onboarding_step      ?? 0,
        onboarding_dismissed: profile?.onboarding_dismissed ?? false,
      })
    }

    // ── PATCH: update profile fields (onboarding, username, role, company) ──
    if (req.method === 'PATCH') {
      const body = await req.json()
      const profileUpdates: Record<string, unknown> = {}

      if (body.role !== undefined)                 profileUpdates.role = body.role
      if (body.onboarding_completed !== undefined) profileUpdates.onboarding_completed = body.onboarding_completed
      if (body.onboarding_step !== undefined)      profileUpdates.onboarding_step = body.onboarding_step
      if (body.onboarding_dismissed !== undefined) profileUpdates.onboarding_dismissed = body.onboarding_dismissed

      // Username with full validation
      if (body.username !== undefined && body.username !== '') {
        const result = await validateAndSaveUsername(supabase, user.id, body.username)
        if (result.error) return json({ error: result.error }, 400)
        profileUpdates.username = result.username
        profileUpdates.username_changed_at = result.username_changed_at
      }

      // company / full_name → update user_metadata
      if (body.company !== undefined || body.full_name !== undefined) {
        const metaUpdates: Record<string, string> = {}
        if (body.company !== undefined)   metaUpdates.company   = body.company
        if (body.full_name !== undefined) metaUpdates.full_name = body.full_name
        await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, ...metaUpdates }
        })
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { error: updateErr } = await supabase
          .from('profiles').update(profileUpdates).eq('id', user.id)
        if (updateErr) return json({ error: updateErr.message }, 400)
      }

      const { data: updated } = await supabase
        .from('profiles')
        .select('username, username_changed_at, role, onboarding_completed, onboarding_step, onboarding_dismissed')
        .eq('id', user.id).maybeSingle()
      return json({ ...updated })
    }

    // ── PUT: legacy actions (info, password, username-via-action) ──
    if (req.method === 'PUT') {
      const body = await req.json()
      const { action } = body

      if (action === 'info') {
        const { name, company, avatarUrl } = body
        const metadata = {
          ...user.user_metadata,
          full_name: (name    ?? user.user_metadata?.full_name ?? '').trim(),
          company:   (company ?? user.user_metadata?.company   ?? '').trim(),
        }
        if (avatarUrl !== undefined) metadata.avatar_url = avatarUrl
        const { data, error } = await supabase.auth.admin.updateUserById(user.id, { user_metadata: metadata })
        if (error) return json({ error: error.message }, 400)
        return json({
          name:      data.user.user_metadata?.full_name || '',
          company:   data.user.user_metadata?.company   || '',
          avatarUrl: data.user.user_metadata?.avatar_url || null,
        })
      }

      if (action === 'username') {
        const result = await validateAndSaveUsername(supabase, user.id, body.username || '')
        if (result.error) return json({ error: result.error }, 400)
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ username: result.username, username_changed_at: result.username_changed_at })
          .eq('id', user.id)
        if (updateErr) return json({ error: updateErr.message }, 400)
        return json({ username: result.username })
      }

      if (action === 'password') {
        const { newPassword, confirmPassword } = body
        if (!newPassword || newPassword.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400)
        if (newPassword !== confirmPassword) return json({ error: 'Passwords do not match.' }, 400)
        const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }

      return json({ error: 'Unknown action.' }, 400)
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
