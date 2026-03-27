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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const { email, password } = await req.json()
    if (!email || !password) return json({ error: 'Email and password are required.' }, 400)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return json({ error: error.message }, 401)

    // CRITICAL SECURITY CHECK: Block unverified users from logging in.
    // Resend a fresh OTP so they can complete verification.
    if (!data.user.email_confirmed_at) {
      await supabase.auth.resend({ type: 'signup', email })
      await supabase.auth.signOut()
      return json({
        requiresVerification: true,
        email,
        message: 'Please verify your email first. A new code has been sent.',
      })
    }

    return json({ session: data.session })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})
