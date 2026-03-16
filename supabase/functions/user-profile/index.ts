import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    if (req.method === 'GET') {
      return json({
        id:        user.id,
        email:     user.email,
        name:      user.user_metadata?.full_name || '',
        company:   user.user_metadata?.company   || '',
        avatarUrl: user.user_metadata?.avatar_url || null,
        createdAt: user.created_at,
      })
    }

    if (req.method === 'PUT') {
      const body = await req.json()
      const { action } = body

      if (action === 'info') {
        const { name, company, avatarUrl } = body
        const metadata = {
          ...user.user_metadata,
          full_name: (name    ?? user.user_metadata?.full_name  ?? '').trim(),
          company:   (company ?? user.user_metadata?.company    ?? '').trim(),
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
