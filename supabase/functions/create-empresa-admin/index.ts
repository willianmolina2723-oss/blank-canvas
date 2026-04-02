import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const DEFAULT_COST_ITEMS = [
  { name: 'AAS 100 mg', category: 'medicamento', unit: 'un', unit_cost: 0.10 },
  { name: 'Adrenalina 1mg/1ml', category: 'medicamento', unit: 'un', unit_cost: 2.50 },
  { name: 'Água Destilada 10 ml', category: 'medicamento', unit: 'un', unit_cost: 0.60 },
  { name: 'Aminofilina 240mg/10ml', category: 'medicamento', unit: 'un', unit_cost: 3.50 },
  { name: 'Amiodarona 150mg/3ml', category: 'medicamento', unit: 'un', unit_cost: 6.00 },
  { name: 'Atropina 0,50mg/1ml', category: 'medicamento', unit: 'un', unit_cost: 1.80 },
  { name: 'Atrovent gotas', category: 'medicamento', unit: 'un', unit_cost: 5.50 },
  { name: 'Bromoprida', category: 'medicamento', unit: 'un', unit_cost: 1.80 },
  { name: 'Bicarbonato de Sódio', category: 'medicamento', unit: 'un', unit_cost: 2.50 },
  { name: 'Brycanil 0.5mg/ml', category: 'medicamento', unit: 'un', unit_cost: 6.50 },
  { name: 'Buscopan Composto', category: 'medicamento', unit: 'un', unit_cost: 3.50 },
  { name: 'Buscopan Simples', category: 'medicamento', unit: 'un', unit_cost: 2.80 },
  { name: 'Captopril 25mg', category: 'medicamento', unit: 'un', unit_cost: 0.25 },
  { name: 'Cedilanide', category: 'medicamento', unit: 'un', unit_cost: 5.00 },
  { name: 'Cetoprofeno 100mg', category: 'medicamento', unit: 'un', unit_cost: 3.20 },
  { name: 'Dexametasona', category: 'medicamento', unit: 'un', unit_cost: 1.50 },
  { name: 'Diclofenaco', category: 'medicamento', unit: 'un', unit_cost: 1.50 },
  { name: 'Diclofenaco Potássio', category: 'medicamento', unit: 'un', unit_cost: 1.80 },
  { name: 'Dipirona 1g/2ml', category: 'medicamento', unit: 'un', unit_cost: 1.20 },
  { name: 'Dipirona comprimido', category: 'medicamento', unit: 'un', unit_cost: 0.20 },
  { name: 'Dopamina', category: 'medicamento', unit: 'un', unit_cost: 6.00 },
  { name: 'Dramin B6', category: 'medicamento', unit: 'un', unit_cost: 4.50 },
  { name: 'Dramin CP', category: 'medicamento', unit: 'un', unit_cost: 0.80 },
  { name: 'Epocler', category: 'medicamento', unit: 'un', unit_cost: 3.00 },
  { name: 'Fenergan', category: 'medicamento', unit: 'un', unit_cost: 3.50 },
  { name: 'Furosemida', category: 'medicamento', unit: 'un', unit_cost: 1.40 },
  { name: 'Flumazenil', category: 'medicamento', unit: 'un', unit_cost: 55.00 },
  { name: 'Glicose 50%', category: 'medicamento', unit: 'un', unit_cost: 2.00 },
  { name: 'Heparina', category: 'medicamento', unit: 'un', unit_cost: 8.00 },
  { name: 'Hidrocortisona', category: 'medicamento', unit: 'un', unit_cost: 3.50 },
  { name: 'Isordil', category: 'medicamento', unit: 'un', unit_cost: 1.00 },
  { name: 'Insulina Regular', category: 'medicamento', unit: 'un', unit_cost: 22.00 },
  { name: 'Lidocaína 2%', category: 'medicamento', unit: 'un', unit_cost: 3.00 },
  { name: 'Lidocaína Gel', category: 'medicamento', unit: 'un', unit_cost: 6.00 },
  { name: 'Loratadina', category: 'medicamento', unit: 'un', unit_cost: 0.40 },
  { name: 'Metoclopramida', category: 'medicamento', unit: 'un', unit_cost: 1.40 },
  { name: 'Narcan (Naloxona)', category: 'medicamento', unit: 'un', unit_cost: 18.00 },
  { name: 'Nausedron', category: 'medicamento', unit: 'un', unit_cost: 8.00 },
  { name: 'Omeprazol', category: 'medicamento', unit: 'un', unit_cost: 1.20 },
  { name: 'Paracetamol', category: 'medicamento', unit: 'un', unit_cost: 0.20 },
  { name: 'Pomada Sulfato de Prata', category: 'medicamento', unit: 'un', unit_cost: 12.00 },
  { name: 'Propranolol', category: 'medicamento', unit: 'un', unit_cost: 0.30 },
  { name: 'Ranitidina', category: 'medicamento', unit: 'un', unit_cost: 2.00 },
  { name: 'Seloken', category: 'medicamento', unit: 'un', unit_cost: 2.50 },
  { name: 'Glicerina 12%', category: 'medicamento', unit: 'un', unit_cost: 12.00 },
  { name: 'Ringer 500ml', category: 'medicamento', unit: 'un', unit_cost: 8.00 },
  { name: 'Soro Fisiológico 100ml', category: 'medicamento', unit: 'un', unit_cost: 4.00 },
  { name: 'Soro Fisiológico 250ml', category: 'medicamento', unit: 'un', unit_cost: 5.50 },
  { name: 'Soro Fisiológico 500ml', category: 'medicamento', unit: 'un', unit_cost: 7.00 },
  { name: 'Soro Glicose 250ml', category: 'medicamento', unit: 'un', unit_cost: 6.00 },
  { name: 'Soro Glicose 500ml', category: 'medicamento', unit: 'un', unit_cost: 7.50 },
  { name: 'Tenoxicam', category: 'medicamento', unit: 'un', unit_cost: 12.00 },
]

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

    // 3. Update profile (trigger handle_new_user already created it without empresa_id)
    const { error: profileUpdateError } = await supabaseAdmin.from('profiles').update({
      full_name: admin_name,
      email: admin_email,
      empresa_id: newEmpresa.id,
      must_change_password: true,
    }).eq('user_id', userId)

    // If update didn't match (trigger didn't fire yet), insert
    if (profileUpdateError) {
      await supabaseAdmin.from('profiles').insert({
        user_id: userId,
        full_name: admin_name,
        email: admin_email,
        empresa_id: newEmpresa.id,
        must_change_password: true,
      })
    }

    // 4. Assign admin role
    await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role: 'admin',
      empresa_id: newEmpresa.id,
    })

    // 5. Seed default cost items (medications)
    const costItems = DEFAULT_COST_ITEMS.map(item => ({
      ...item,
      empresa_id: newEmpresa.id,
    }))
    await supabaseAdmin.from('cost_items').insert(costItems)

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
