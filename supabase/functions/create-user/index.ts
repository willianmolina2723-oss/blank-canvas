import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function generateTempPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%&*'
  const all = upper + lower + digits + special

  let pw = ''
  pw += upper[Math.floor(Math.random() * upper.length)]
  pw += lower[Math.floor(Math.random() * lower.length)]
  pw += digits[Math.floor(Math.random() * digits.length)]
  pw += special[Math.floor(Math.random() * special.length)]
  for (let i = 4; i < 12; i++) {
    pw += all[Math.floor(Math.random() * all.length)]
  }
  return pw.split('').sort(() => Math.random() - 0.5).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) throw new Error('Não autorizado')

    // Get caller profile to know empresa_id
    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('empresa_id').eq('user_id', caller.id).maybeSingle()

    // Check if caller is admin or super_admin
    const { data: saCheck } = await supabaseAdmin.from('super_admins').select('id').eq('user_id', caller.id).maybeSingle()
    const { data: roleCheck } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'admin').maybeSingle()
    if (!saCheck && !roleCheck) throw new Error('Apenas administradores podem criar usuários')

    const { email, full_name, professional_id, phone, roles } = await req.json()
    if (!email || !full_name) throw new Error('Email e nome são obrigatórios')

    const tempPassword = generateTempPassword()

    // Create auth user
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (createError) throw new Error(`Erro ao criar usuário: ${createError.message}`)

    const userId = authData.user.id
    const empresaId = callerProfile?.empresa_id || null

    // Update profile with extra data (profile is auto-created by trigger)
    await supabaseAdmin.from('profiles').update({
      professional_id: professional_id || null,
      phone: phone || null,
      empresa_id: empresaId,
      must_change_password: true,
    }).eq('user_id', userId)

    // Assign roles
    if (roles && roles.length > 0) {
      const roleInserts = roles.map((role: string) => ({
        user_id: userId,
        role,
        empresa_id: empresaId,
      }))
      await supabaseAdmin.from('user_roles').insert(roleInserts)
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      temp_password: tempPassword,
      email_queued: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
