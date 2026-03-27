import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Verify caller is super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !caller) throw new Error('Não autorizado')

    const { data: saCheck } = await supabaseAdmin
      .from('super_admins')
      .select('id')
      .eq('user_id', caller.id)
      .maybeSingle()
    if (!saCheck) throw new Error('Apenas super admins podem criar empresas')

    const { empresa, admin_email, admin_password, admin_name } = await req.json()

    // 1. Create empresa
    const { data: newEmpresa, error: empError } = await supabaseAdmin
      .from('empresas')
      .insert({
        nome_fantasia: empresa.nome_fantasia,
        razao_social: empresa.razao_social,
        cnpj: empresa.cnpj,
        telefone: empresa.telefone,
        email: empresa.email,
        plano: empresa.plano,
        valor_plano: empresa.valor_plano,
        limite_usuarios: empresa.limite_usuarios,
        data_vencimento: empresa.data_vencimento,
        data_inicio: new Date().toISOString().split('T')[0],
        status_assinatura: 'ATIVA',
      })
      .select()
      .single()

    if (empError) throw new Error(`Erro ao criar empresa: ${empError.message}`)

    // 2. Create admin user in auth
    const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true,
      user_metadata: { full_name: admin_name },
    })

    if (createUserError) {
      // Rollback empresa
      await supabaseAdmin.from('empresas').delete().eq('id', newEmpresa.id)
      throw new Error(`Erro ao criar usuário: ${createUserError.message}`)
    }

    const userId = authData.user.id

    // 3. Create profile
    await supabaseAdmin.from('profiles').insert({
      user_id: userId,
      full_name: admin_name,
      email: admin_email,
      empresa_id: newEmpresa.id,
      must_change_password: true,
    })

    // 4. Assign admin role
    await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role: 'admin',
    })

    return new Response(JSON.stringify({ success: true, empresa_id: newEmpresa.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
