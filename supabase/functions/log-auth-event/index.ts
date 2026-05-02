import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const ALLOWED_EVENTS = new Set([
  'login_success',
  'login_failure',
  'logout',
  'password_reset',
  'password_change',
])

function clip(value: unknown, max = 250): string | null {
  if (value === null || value === undefined) return null
  const s = String(value)
  return s.length > max ? s.slice(0, max) : s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await req.json().catch(() => ({}))
    const event_type = clip(body?.event_type, 50) || 'auth_event'
    const email = clip(body?.email, 254)
    const success = Boolean(body?.success)
    const error_message = clip(body?.error_message, 500)

    // Validate event type — reject anything not in allowlist
    if (!ALLOWED_EVENTS.has(event_type)) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Try to authenticate the caller
    let verifiedUserId: string | null = null
    let verifiedEmail: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const { data } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
      if (data?.user) {
        verifiedUserId = data.user.id
        verifiedEmail = data.user.email ?? null
      }
    }

    // Successful events MUST come from an authenticated session, and the
    // logged email must match the authenticated user. Failed logins / password
    // resets may be unauthenticated by nature, so we accept but mark them as
    // unverified to prevent log forgery.
    const isVerified =
      verifiedUserId !== null &&
      (!email || !verifiedEmail || email.toLowerCase() === verifiedEmail.toLowerCase())

    if (event_type === 'login_success' || event_type === 'logout') {
      if (!isVerified) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: event_type,
      table_name: 'auth',
      record_id: (isVerified ? verifiedUserId : email) || 'unknown',
      user_id: verifiedUserId,
      new_data: {
        email: isVerified ? verifiedEmail : email,
        success,
        error_message,
        verified: isVerified,
      },
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch {
    // Fire-and-forget - never block auth flow
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
