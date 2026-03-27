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

    const body = await req.json()
    const { action, user_id, user_ids } = body
    
    if (!action) throw new Error('action é obrigatório')

    // Handle list action separately
    if (action === 'list') {
      if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
        return new Response(JSON.stringify({ users: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const users: Record<string, { isSuspended: boolean }> = {}
      for (const uid of user_ids) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid)
        const { data: profile } = await supabaseAdmin.from('profiles').select('deleted_at').eq('user_id', uid).maybeSingle()
        users[uid] = { 
          isSuspended: !!profile?.deleted_at || !!authUser?.user?.banned_until 
        }
      }
      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!user_id) throw new Error('user_id é obrigatório')
    if (user_id === caller.id) throw new Error('Não é possível modificar sua própria conta')

    switch (action) {
      case 'suspend': {
        await supabaseAdmin.from('profiles').update({
          deleted_at: new Date().toISOString(),
          deleted_by: caller.id,
        }).eq('user_id', user_id)
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
