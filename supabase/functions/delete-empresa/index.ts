import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// All tables with empresa_id FK to empresas (ordered: dependents first)
const EMPRESA_TABLES = [
  'dispatch_materials', 'dispatch_medications', 'dispatch_occurrences', 'dispatch_reports',
  'event_finance_payments', 'event_finances', 'event_staff_costs', 'event_other_costs',
  'freelancer_payments', 'transport_records', 'digital_signatures',
  'medical_evolutions', 'nursing_evolutions', 'checklist_items',
  'maintenance_logs', 'opportunity_registrations', 'opportunities',
  'reviews', 'patients', 'cost_items', 'events', 'ambulances', 'contractors',
  'audit_logs', 'data_changelog', 'email_logs', 'user_invites',
  'user_roles',
]

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

    const { data: profiles } = await supabaseAdmin.from('profiles').select('id, user_id').eq('empresa_id', empresa_id)
    const userIds = (profiles || []).map((p: any) => p.user_id).filter(Boolean)
    const profileIds = (profiles || []).map((p: any) => p.id).filter(Boolean)

    // Delete from all empresa-scoped tables
    const errors: string[] = []
    for (const tbl of EMPRESA_TABLES) {
      const { error } = await supabaseAdmin.from(tbl).delete().eq('empresa_id', empresa_id)
      if (error && !error.message?.includes('does not exist')) {
        errors.push(`${tbl}: ${error.message}`)
      }
    }

    // Detach profiles before user deletion (avoid FK block)
    if (profileIds.length > 0) {
      await supabaseAdmin.from('profiles').update({ empresa_id: null }).in('id', profileIds)
    }

    // Delete auth users (cascades profiles via auth.users FK)
    for (const uid of userIds) {
      try { await supabaseAdmin.auth.admin.deleteUser(uid) } catch {}
    }

    // Final cleanup of any orphan profiles
    await supabaseAdmin.from('profiles').delete().eq('empresa_id', empresa_id)

    // Delete empresa
    const { error } = await supabaseAdmin.from('empresas').delete().eq('id', empresa_id)
    if (error) throw new Error(`Erro ao excluir empresa: ${error.message}${errors.length ? ' | Limpeza: ' + errors.join('; ') : ''}`)

    return new Response(JSON.stringify({ success: true, cleanup_warnings: errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
