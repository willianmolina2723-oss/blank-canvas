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
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, user_id').eq('empresa_id', empresa_id)
    const userIds = (profiles || []).map((p: any) => p.user_id).filter(Boolean)
    const profileIds = (profiles || []).map((p: any) => p.id).filter(Boolean)

    // Best-effort cleanup of tables that reference profiles/empresa without cascade
    const cleanupByEmpresa = [
      'event_staff_costs', 'freelancer_payments', 'event_assignments', 'event_role_schedules',
      'event_participants', 'event_recordings', 'transport_logs', 'transport_photos',
      'checklist_items', 'patients', 'medical_evolutions', 'nursing_evolutions',
      'material_consumption', 'medication_consumption', 'signatures', 'opportunities',
      'ambulances', 'maintenance_history', 'reviews', 'events', 'user_roles',
      'user_pins', 'push_subscriptions', 'audit_log', 'changelog', 'email_logs',
      'auth_events', 'app_config', 'default_rates'
    ]
    for (const tbl of cleanupByEmpresa) {
      await supabaseAdmin.from(tbl).delete().eq('empresa_id', empresa_id).then(() => {}, () => {})
    }

    // Detach profiles from empresa so FK no longer blocks deletion
    if (profileIds.length > 0) {
      await supabaseAdmin.from('profiles').update({ empresa_id: null }).in('id', profileIds)
    }

    // Delete auth users (cascade removes their profiles via auth.users FK)
    for (const uid of userIds) {
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {})
    }

    // Final safety: remove any remaining profiles tied to this empresa
    await supabaseAdmin.from('profiles').delete().eq('empresa_id', empresa_id).then(() => {}, () => {})

    // Delete empresa
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
