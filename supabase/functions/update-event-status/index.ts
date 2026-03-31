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

    const { event_id, new_status } = await req.json()
    if (!event_id || !new_status) throw new Error('event_id e new_status são obrigatórios')

    const validStatuses = ['ativo', 'em_andamento', 'finalizado', 'cancelado']
    if (!validStatuses.includes(new_status)) throw new Error(`Status inválido: ${new_status}`)

    // --- Validation for finalization ---
    if (new_status === 'finalizado') {
      const pendingItems: string[] = []

      // 1. Checklist VTR - all items must be checked
      const { data: checklistItems } = await supabaseAdmin
        .from('checklist_items')
        .select('id, is_checked, item_type')
        .eq('event_id', event_id)

      if (!checklistItems || checklistItems.length === 0) {
        pendingItems.push('Checklist da VTR: nenhum item registrado')
      } else {
        const unchecked = checklistItems.filter(i => !i.is_checked)
        if (unchecked.length > 0) {
          pendingItems.push(`Checklist da VTR: ${unchecked.length} item(ns) não marcado(s)`)
        }
      }

      // 2. Transport - must have departure/arrival times and km
      const { data: transport } = await supabaseAdmin
        .from('transport_records')
        .select('*')
        .eq('event_id', event_id)
        .maybeSingle()

      if (!transport) {
        pendingItems.push('Transporte: registro não encontrado')
      } else {
        const transportMissing: string[] = []
        if (!transport.departure_time) transportMissing.push('horário de saída')
        if (!transport.arrival_time) transportMissing.push('horário de chegada')
        if (transport.initial_km === null || transport.initial_km === undefined) transportMissing.push('KM inicial')
        if (transport.final_km === null || transport.final_km === undefined) transportMissing.push('KM final')
        if (transportMissing.length > 0) {
          pendingItems.push(`Transporte: faltam ${transportMissing.join(', ')}`)
        }
      }

      // 3. If patients exist, validate role-based sections
      const { data: patients } = await supabaseAdmin
        .from('patients')
        .select('id, name')
        .eq('event_id', event_id)
        .is('deleted_at', null)

      if (patients && patients.length > 0) {
        // Get participants and their roles
        const { data: participants } = await supabaseAdmin
          .from('event_participants')
          .select('role')
          .eq('event_id', event_id)

        const roles = new Set((participants || []).map(p => p.role))

        // For each patient, check required sections based on assigned roles
        for (const patient of patients) {
          // If there's a nurse/tech → nursing evolution required
          if (roles.has('enfermeiro') || roles.has('tecnico')) {
            const { data: nursing } = await supabaseAdmin
              .from('nursing_evolutions')
              .select('id')
              .eq('event_id', event_id)
              .eq('patient_id', patient.id)
              .limit(1)

            if (!nursing || nursing.length === 0) {
              pendingItems.push(`Evolução de Enfermagem: pendente para paciente "${patient.name}"`)
            }
          }

          // If there's a doctor → medical evolution required
          if (roles.has('medico')) {
            const { data: medical } = await supabaseAdmin
              .from('medical_evolutions')
              .select('id')
              .eq('event_id', event_id)
              .eq('patient_id', patient.id)
              .limit(1)

            if (!medical || medical.length === 0) {
              pendingItems.push(`Evolução Médica: pendente para paciente "${patient.name}"`)
            }
          }
        }
      }

      // Block finalization if there are pending items
      if (pendingItems.length > 0) {
        return new Response(JSON.stringify({
          error: 'Não é possível finalizar o evento. Itens pendentes:\n• ' + pendingItems.join('\n• '),
          pending_items: pendingItems,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // --- Update status ---
    const { error } = await supabaseAdmin.from('events').update({
      status: new_status,
      updated_at: new Date().toISOString(),
    }).eq('id', event_id)

    if (error) throw new Error(`Erro ao atualizar evento: ${error.message}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    const status = err.message?.includes('Não é possível finalizar') ? 400 : 400
    return new Response(JSON.stringify({ error: err.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
