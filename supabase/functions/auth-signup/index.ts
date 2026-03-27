import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/sendEmail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const body = await req.json()
    const { action, email, token } = body

    // ── VERIFY OTP ────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      if (!email || !token) return new Response(JSON.stringify({ error: 'email and token required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      })

      if (error) {
        const msg = error.message?.toLowerCase() || ''
        if (msg.includes('expired') || msg.includes('invalid') || msg.includes('otp')) {
          return new Response(JSON.stringify({ error: 'Invalid or expired code. Please request a new one.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const userId = data.user?.id
      if (userId) {
        // Ensure profile exists with onboarding fields
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

        // Send welcome email (non-fatal) — fires after OTP verified, not on signup
        await sendEmail({
          to: email,
          template: 'welcome',
          data: { name: data.user?.user_metadata?.full_name || email.split('@')[0] }
        })
      }

      return new Response(JSON.stringify({ success: true, session: data.session, user: data.user }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── RESEND OTP ────────────────────────────────────────────────────
    if (action === 'resend_otp') {
      if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      })

      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── SIGNUP (default) ──────────────────────────────────────────────
    const { email: signupEmail, password, fullName } = body
    if (!signupEmail || !password) return new Response(JSON.stringify({ error: 'Email and password are required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: signupEmail,
      password,
      user_metadata: { full_name: fullName || '' },
      email_confirm: false,  // force OTP verification
    })

    if (createError) {
      const msg = createError.message?.toLowerCase() || ''
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already exists')) {
        return new Response(JSON.stringify({ error: 'An account with this email already exists. Please sign in instead.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Send OTP email via Supabase (triggers "Confirm signup" email template)
    await supabase.auth.resend({
      type: 'signup',
      email: signupEmail,
    })

    return new Response(JSON.stringify({ success: true, email: signupEmail, requiresVerification: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
