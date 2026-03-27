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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    // Anon client used for auth flows (signUp, verifyOtp, resend)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const body = await req.json()
    const { action } = body

    // ── VERIFY OTP ────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      const { email, token } = body
      if (!email || !token) return json({ error: 'email and token required' }, 400)

      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      })

      if (error) {
        const msg = error.message?.toLowerCase() || ''
        if (msg.includes('expired') || msg.includes('invalid') || msg.includes('otp')) {
          return json({ error: 'Invalid or expired code. Please request a new one.' }, 400)
        }
        return json({ error: error.message }, 400)
      }

      const userId = data.user?.id
      if (userId) {
        // Ensure profile + onboarding fields exist
        await supabaseAdmin.from('profiles').upsert({
          id: userId,
          onboarding_completed: false,
          onboarding_step: 0,
          onboarding_dismissed: false,
        }, { onConflict: 'id' })

        // Auto-assign Free plan
        const { data: freePlan } = await supabaseAdmin
          .from('plans')
          .select('id')
          .ilike('name', 'free')
          .eq('is_active', true)
          .single()

        if (freePlan?.id) {
          await supabaseAdmin.from('user_plans').upsert({
            user_id: userId,
            plan_id: freePlan.id,
            is_active: true,
            started_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
        }

        // Welcome email fires here, after OTP verified — not on signup
        await sendEmail({
          to: email,
          template: 'welcome',
          data: { name: data.user?.user_metadata?.full_name || email.split('@')[0] }
        })
      }

      return json({ success: true, session: data.session, user: data.user })
    }

    // ── RESEND OTP ────────────────────────────────────────────────────
    if (action === 'resend_otp') {
      const { email } = body
      if (!email) return json({ error: 'email required' }, 400)

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      })

      if (error) return json({ error: error.message }, 400)

      return json({ success: true })
    }

    // ── SIGNUP (default) ──────────────────────────────────────────────
    // Uses supabase.auth.signUp() — NOT admin.createUser — so that Supabase
    // automatically sends the OTP email when "Confirm email" is ON in dashboard.
    const { email, password, fullName } = body
    if (!email || !password) return json({ error: 'Email and password are required.' }, 400)

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || '' },
      },
    })

    if (signupError) {
      const msg = signupError.message?.toLowerCase() || ''
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already exists')) {
        return json({ error: 'An account with this email already exists. Please sign in instead.' }, 400)
      }
      return json({ error: signupError.message }, 400)
    }

    // SECURITY: Never return a session on signup.
    // User must verify their email via OTP before gaining access.
    // (When "Confirm email" is ON in Supabase Dashboard, data.session is always null here.)
    return json({ success: true, email, requiresVerification: true })

  } catch (err) {
    console.error('auth-signup error:', err)
    return json({ error: err.message }, 500)
  }
})
