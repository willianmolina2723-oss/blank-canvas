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

    console.log('[create-user] criando auth user para', email)
    // Create auth user
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (createError) {
      console.error('[create-user] auth.admin.createUser falhou:', createError)
      throw new Error(`Erro ao criar usuário: ${createError.message}`)
    }

    const userId = authData.user.id
    const empresaId = callerProfile?.empresa_id || null
    console.log('[create-user] auth user criado', userId, 'empresa', empresaId)

    // Update profile with extra data (profile is auto-created by trigger)
    const { error: profileError } = await supabaseAdmin.from('profiles').update({
      professional_id: professional_id || null,
      phone: phone || null,
      empresa_id: empresaId,
      must_change_password: true,
    }).eq('user_id', userId)
    if (profileError) {
      console.error('[create-user] update profile falhou:', profileError)
      // rollback
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
      throw new Error(`Erro ao atualizar perfil: ${profileError.message}`)
    }

    // Assign roles
    if (roles && roles.length > 0) {
      const roleInserts = roles.map((role: string) => ({
        user_id: userId,
        role,
        empresa_id: empresaId,
      }))
      const { error: rolesError } = await supabaseAdmin.from('user_roles').insert(roleInserts)
      if (rolesError) {
        console.error('[create-user] insert roles falhou:', rolesError)
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
        throw new Error(`Erro ao atribuir funções: ${rolesError.message}`)
      }
    }

    // Registrar convite
    await supabaseAdmin.from('user_invites').upsert({
      user_id: userId,
      empresa_id: empresaId,
      invite_status: 'pending',
      sent_at: new Date().toISOString(),
      last_sent_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // Enviar e-mail de convite via send-email
    let emailSent = false
    try {
      const APP_URL = Deno.env.get('APP_URL') || 'https://sistemasaph.com.br'

      // Gerar link de definição de senha (recovery)
      let setupUrl: string | undefined
      try {
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${APP_URL}/reset-password` },
        })
        setupUrl = linkData?.properties?.action_link
      } catch (_e) {
        // ignore — vai cair no fallback de senha provisória
      }

      // Importação dinâmica do template (no diretório _shared)
      const { renderInviteEmail } = await import('../_shared/email-templates/invite.ts')
      const { subject, html } = renderInviteEmail({
        fullName: full_name,
        email,
        setupUrl,
        tempPassword: setupUrl ? undefined : tempPassword,
        appUrl: APP_URL,
      })

      const { data: sendRes, error: sendErr } = await supabaseAdmin.functions.invoke('send-email', {
        body: {
          type: 'invite',
          to: email,
          subject,
          html,
          user_id: userId,
          empresa_id: empresaId,
        },
      })
      emailSent = Boolean(sendRes?.success) && !sendErr
    } catch (e) {
      console.error('Falha ao enviar e-mail de convite:', e)
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      temp_password: tempPassword,
      email_queued: emailSent,
      email_sent: emailSent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[create-user] erro fatal:', err?.message, err?.stack)
    return new Response(JSON.stringify({ error: err.message || 'Erro desconhecido' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
