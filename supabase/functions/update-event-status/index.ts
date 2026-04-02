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

    // Cross-tenant validation
    const { data: saCheck } = await supabaseAdmin.from('super_admins').select('id').eq('user_id', caller.id).maybeSingle()
    if (!saCheck) {
      const { data: callerProfile } = await supabaseAdmin.from('profiles').select('empresa_id').eq('user_id', caller.id).maybeSingle()
      const { data: eventRow } = await supabaseAdmin.from('events').select('empresa_id').eq('id', event_id).maybeSingle()
      if (!callerProfile || !eventRow || callerProfile.empresa_id !== eventRow.empresa_id) {
        throw new Error('Evento não pertence à sua organização')
      }
    }

    const now = new Date().toISOString()

    // --- When starting event (em_andamento): record departure_time on event and transport ---
    if (new_status === 'em_andamento') {
      // Set departure_time on events table
      await supabaseAdmin.from('events').update({
        departure_time: now,
        status: new_status,
        updated_at: now,
      }).eq('id', event_id)

      // Also update transport_records departure_time
      const { data: transport } = await supabaseAdmin.from('transport_records').select('id').eq('event_id', event_id).maybeSingle()
      if (transport) {
        await supabaseAdmin.from('transport_records').update({ departure_time: now, updated_at: now }).eq('id', transport.id)
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

      // 2. Transport - must exist (times are auto-filled, KM comes from checklist)
      const { data: transport } = await supabaseAdmin
        .from('transport_records')
        .select('id')
        .eq('event_id', event_id)
        .maybeSingle()

      if (!transport) {
        pendingItems.push('Transporte: registro não encontrado')
      }

      // 3. If patients exist, validate role-based sections
      const { data: patients } = await supabaseAdmin
        .from('patients')
        .select('id, name')
        .eq('event_id', event_id)
        .is('deleted_at', null)

      if (patients && patients.length > 0) {
        const { data: participants } = await supabaseAdmin
          .from('event_participants')
          .select('role')
          .eq('event_id', event_id)

        const roles = new Set((participants || []).map(p => p.role))

        for (const patient of patients) {
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

      // Set arrival_time on event and transport
      await supabaseAdmin.from('events').update({
        arrival_time: now,
        status: new_status,
        updated_at: now,
      }).eq('id', event_id)

      const { data: transportFinal } = await supabaseAdmin.from('transport_records').select('id').eq('event_id', event_id).maybeSingle()
      if (transportFinal) {
        await supabaseAdmin.from('transport_records').update({ arrival_time: now, updated_at: now }).eq('id', transportFinal.id)
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Other status changes (ativo, cancelado) ---
    const { error } = await supabaseAdmin.from('events').update({
      status: new_status,
      updated_at: now,
    }).eq('id', event_id)

    if (error) throw new Error(`Erro ao atualizar evento: ${error.message}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
