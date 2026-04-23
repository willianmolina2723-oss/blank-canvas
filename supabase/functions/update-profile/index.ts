import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Check admin or super_admin
    const { data: saCheck } = await supabaseAdmin.from('super_admins').select('id').eq('user_id', caller.id).maybeSingle()
    const { data: roleCheck } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'admin').maybeSingle()
    if (!saCheck && !roleCheck) throw new Error('Apenas administradores podem atualizar perfis')

    const body = await req.json()
    const { profile_id, user_id, ...updates } = body

    const filter = profile_id ? { column: 'id', value: profile_id } : { column: 'user_id', value: user_id }
    if (!filter.value) throw new Error('profile_id ou user_id é obrigatório')

    const updateData: Record<string, unknown> = {}
    if (updates.full_name !== undefined) updateData.full_name = updates.full_name
    if (updates.phone !== undefined) updateData.phone = updates.phone
    if (updates.professional_id !== undefined) updateData.professional_id = updates.professional_id
    if (updates.avatar_url !== undefined) updateData.avatar_url = updates.avatar_url
    if (updates.valor_hora !== undefined) updateData.valor_hora = updates.valor_hora
    if (updates.recebe_deslocamento_override !== undefined) {
      const v = updates.recebe_deslocamento_override
      if (!['inherit', 'true', 'false'].includes(v)) {
        throw new Error('recebe_deslocamento_override inválido')
      }
      updateData.recebe_deslocamento_override = v
    }

    // Handle PIN: hash it server-side instead of storing plain text
    if (updates.pin_code !== undefined) {
      // Use the set_pin function to hash the PIN
      const targetUserId = user_id || (await supabaseAdmin.from('profiles').select('user_id').eq('id', profile_id).maybeSingle()).data?.user_id
      if (targetUserId) {
        await supabaseAdmin.rpc('set_pin', { _user_id: targetUserId, _pin: updates.pin_code || null })
      }
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin.from('profiles').update(updateData).eq(filter.column, filter.value)
      if (error) throw new Error(`Erro ao atualizar perfil: ${error.message}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
