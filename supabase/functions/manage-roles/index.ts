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

    // Check if caller is super_admin or admin
    const { data: saCheck } = await supabaseAdmin.from('super_admins').select('id').eq('user_id', caller.id).maybeSingle()
    const isSuperAdmin = !!saCheck

    if (!isSuperAdmin) {
      const { data: roleCheck } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'admin').maybeSingle()
      if (!roleCheck) throw new Error('Apenas administradores podem gerenciar funções')
    }

    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('empresa_id').eq('user_id', caller.id).maybeSingle()

    const { user_id, roles } = await req.json()
    if (!user_id || !Array.isArray(roles)) throw new Error('user_id e roles são obrigatórios')

    // Prevent self-modification
    if (user_id === caller.id) throw new Error('Não é possível alterar suas próprias funções')

    // Validate target user belongs to same empresa (unless super admin)
    if (!isSuperAdmin) {
      const { data: targetProfile } = await supabaseAdmin.from('profiles').select('empresa_id').eq('user_id', user_id).maybeSingle()
      if (!targetProfile || targetProfile.empresa_id !== callerProfile?.empresa_id) {
        throw new Error('Usuário não pertence à sua organização')
      }

      // Non-super admins cannot assign admin role
      if (roles.includes('admin')) {
        throw new Error('Apenas Super Administradores podem atribuir a função de administrador')
      }
    }

    // Validate role values
    const validRoles = ['admin', 'condutor', 'enfermeiro', 'tecnico', 'medico']
    for (const role of roles) {
      if (!validRoles.includes(role)) throw new Error(`Função inválida: ${role}`)
    }

    const empresaId = callerProfile?.empresa_id || null

    // Get current roles
    const { data: currentRoles } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user_id)
    const currentRoleNames = (currentRoles || []).map(r => r.role)

    // Determine changes
    const rolesToAdd = roles.filter((r: string) => !currentRoleNames.includes(r))
    const rolesToRemove = currentRoleNames.filter(r => !roles.includes(r))

    // Remove roles
    for (const role of rolesToRemove) {
      await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id).eq('role', role)
    }

    // Add roles
    if (rolesToAdd.length > 0) {
      const inserts = rolesToAdd.map((role: string) => ({ user_id, role, empresa_id: empresaId }))
      await supabaseAdmin.from('user_roles').insert(inserts)
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
