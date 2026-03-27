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

    const { data: saCheck } = await supabaseAdmin.from('super_admins').select('id').eq('user_id', caller.id).maybeSingle()
    if (!saCheck) throw new Error('Apenas super admins podem excluir empresas')

    const { empresa_id } = await req.json()
    if (!empresa_id) throw new Error('empresa_id é obrigatório')

    // Get all users from this empresa
    const { data: profiles } = await supabaseAdmin.from('profiles').select('user_id').eq('empresa_id', empresa_id)

    // Delete auth users
    if (profiles) {
      for (const p of profiles) {
        await supabaseAdmin.auth.admin.deleteUser(p.user_id)
      }
    }

    // Delete empresa (cascade should handle related records)
    const { error } = await supabaseAdmin.from('empresas').delete().eq('id', empresa_id)
    if (error) throw new Error(`Erro ao excluir empresa: ${error.message}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
