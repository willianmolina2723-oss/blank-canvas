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
    const { data: roleCheck } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'admin').maybeSingle()
    if (!saCheck && !roleCheck) throw new Error('Apenas administradores podem gerenciar usuários')

    const { action, user_id } = await req.json()
    if (!action || !user_id) throw new Error('action e user_id são obrigatórios')

    if (user_id === caller.id) throw new Error('Não é possível modificar sua própria conta')

    switch (action) {
      case 'suspend': {
        // Soft delete - set deleted_at
        await supabaseAdmin.from('profiles').update({
          deleted_at: new Date().toISOString(),
          deleted_by: caller.id,
        }).eq('user_id', user_id)
        // Ban the auth user
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: '876000h' })
        break
      }
      case 'restore': {
        await supabaseAdmin.from('profiles').update({
          deleted_at: null,
          deleted_by: null,
        }).eq('user_id', user_id)
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
        break
      }
      case 'delete': {
        await supabaseAdmin.auth.admin.deleteUser(user_id)
        break
      }
      default:
        throw new Error(`Ação inválida: ${action}`)
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
