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

    const { event_id, new_status, event_date_id: rawDateId } = await req.json()
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

    // Resolve event_date_id (optional). If informed, validate it belongs to event.
    let event_date_id: string | null = null
    if (rawDateId) {
      const { data: ed } = await supabaseAdmin
        .from('event_dates').select('id').eq('id', rawDateId).eq('event_id', event_id).maybeSingle()
      if (!ed) throw new Error('event_date_id inválido para este evento')
      event_date_id = ed.id
    }

    // Helper: get total dates count for event
    const { count: totalDatesCount } = await supabaseAdmin
      .from('event_dates').select('id', { count: 'exact', head: true }).eq('event_id', event_id)
    const isMultiDate = (totalDatesCount ?? 0) > 1

    // Helper: find transport row matching scope (date-specific first, fallback legacy NULL)
    const findTransport = async () => {
      if (event_date_id) {
        const { data: t1 } = await supabaseAdmin
          .from('transport_records').select('id, departure_time, arrival_time')
          .eq('event_id', event_id).eq('event_date_id', event_date_id).maybeSingle()
        if (t1) return t1
        // Legacy fallback: claim NULL row for this date
        const { data: t2 } = await supabaseAdmin
          .from('transport_records').select('id, departure_time, arrival_time')
          .eq('event_id', event_id).is('event_date_id', null).maybeSingle()
        if (t2) {
          await supabaseAdmin.from('transport_records').update({ event_date_id, updated_at: now }).eq('id', t2.id)
          return t2
        }
        return null
      }
      const { data: t } = await supabaseAdmin
        .from('transport_records').select('id, departure_time, arrival_time')
        .eq('event_id', event_id).maybeSingle()
      return t
    }

    // --- When starting event (em_andamento) ---
    if (new_status === 'em_andamento') {
      // Update event-level only when no specific date OR single-date event
      if (!event_date_id || !isMultiDate) {
        await supabaseAdmin.from('events').update({
          departure_time: now, status: new_status, updated_at: now,
        }).eq('id', event_id)
      }

      // Mark date status if scoped
      if (event_date_id) {
        await supabaseAdmin.from('event_dates').update({
          status: 'em_andamento', updated_at: now,
        }).eq('id', event_date_id)
      }

      const transport = await findTransport()
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
      const scopeLabel = event_date_id ? 'desta data' : 'do evento'

      // Build filter for date-scoped queries
      const applyDateFilter = (q: any) =>
        event_date_id ? q.eq('event_date_id', event_date_id) : q

      // 1. Checklist VTR
      const { data: checklistItems } = await applyDateFilter(
        supabaseAdmin.from('checklist_items').select('id, is_checked, item_type, notes, item_name').eq('event_id', event_id)
      )

      if (!checklistItems || checklistItems.length === 0) {
        pendingItems.push(`Checklist da VTR ${scopeLabel}: nenhum item registrado`)
      } else {
        const vtrItems = checklistItems.filter((i: any) => {
          const t = i.item_type as string
          return t !== 'psicotropicos' && t !== 'medications' && t !== 'consumo_medicamentos'
            && t !== 'materiais' && t !== 'uti' && t !== 'uti_confirmed'
            && t !== 'checklist_confirmed' && t !== 'videos_confirmed'
            && t !== 'psicotropicos_confirmed' && !t.startsWith('video_')
            && !t.startsWith('fuel_')
        })
        const unchecked = vtrItems.filter((i: any) => !i.is_checked)
        if (unchecked.length > 0) {
          pendingItems.push(`Checklist da VTR ${scopeLabel}: ${unchecked.length} item(ns) não marcado(s)`)
        }
      }

      // 1b. Psicotrópicos
      const psychoItems = (checklistItems || []).filter((i: any) => (i.item_type as string) === 'psicotropicos')
      if (psychoItems.length === 0) {
        pendingItems.push(`Medicamentos ${scopeLabel}: inventário de psicotrópicos não foi preenchido`)
      } else {
        const semQuantidade = psychoItems.filter((i: any) => {
          const qty = parseInt((i.notes as string) || '0') || 0
          return qty < 1
        })
        if (semQuantidade.length > 0) {
          pendingItems.push(`Medicamentos ${scopeLabel}: ${semQuantidade.length} medicamento(s) sem quantidade informada`)
        }
      }

      // 2. Transport (date-scoped or event-scoped)
      const transportFinal = await findTransport()
      if (!transportFinal) {
        pendingItems.push(`Transporte ${scopeLabel}: registro não encontrado`)
      }

      // 3. Patients & evolutions (date-scoped when applicable)
      const { data: patients } = await applyDateFilter(
        supabaseAdmin.from('patients').select('id, name').eq('event_id', event_id).is('deleted_at', null)
      )

      if (patients && patients.length > 0) {
        const { data: participants } = await supabaseAdmin
          .from('event_participants').select('role').eq('event_id', event_id)
        const roles = new Set((participants || []).map((p: any) => p.role))

        for (const patient of patients) {
          if (roles.has('enfermeiro') || roles.has('tecnico')) {
            const { data: nursing } = await applyDateFilter(
              supabaseAdmin.from('nursing_evolutions').select('id')
                .eq('event_id', event_id).eq('patient_id', patient.id).limit(1)
            )
            if (!nursing || nursing.length === 0) {
              pendingItems.push(`Evolução de Enfermagem ${scopeLabel}: pendente para paciente "${patient.name}"`)
            }
          }
          if (roles.has('medico')) {
            const { data: medical } = await applyDateFilter(
              supabaseAdmin.from('medical_evolutions').select('id')
                .eq('event_id', event_id).eq('patient_id', patient.id).limit(1)
            )
            if (!medical || medical.length === 0) {
              pendingItems.push(`Evolução Médica ${scopeLabel}: pendente para paciente "${patient.name}"`)
            }
          }
        }
      }

      if (pendingItems.length > 0) {
        return new Response(JSON.stringify({
          error: 'Não é possível finalizar. Itens pendentes:\n• ' + pendingItems.join('\n• '),
          pending_items: pendingItems,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Mark date as finalized if scoped
      if (event_date_id) {
        await supabaseAdmin.from('event_dates').update({
          status: 'finalizado', updated_at: now,
        }).eq('id', event_date_id)
      }

      // Finalize event-level when:
      // - no scope provided, OR
      // - this is the last remaining non-finalized date
      let finalizeEventLevel = !event_date_id
      if (event_date_id && isMultiDate) {
        const { count: remaining } = await supabaseAdmin
          .from('event_dates').select('id', { count: 'exact', head: true })
          .eq('event_id', event_id).neq('status', 'finalizado')
        finalizeEventLevel = (remaining ?? 0) === 0
      } else if (event_date_id && !isMultiDate) {
        finalizeEventLevel = true
      }

      if (finalizeEventLevel) {
        await supabaseAdmin.from('events').update({
          arrival_time: now, status: new_status, updated_at: now,
        }).eq('id', event_id)
      }

      if (transportFinal) {
        await supabaseAdmin.from('transport_records').update({ arrival_time: now, updated_at: now }).eq('id', transportFinal.id)
      }

      // --- Recompute event_assignments paid hours ---
      try {
        const { data: eventRow } = await supabaseAdmin
          .from('events').select('id, departure_time, arrival_time, empresa_id')
          .eq('id', event_id).maybeSingle()

        const partsQuery = supabaseAdmin.from('event_participants').select('profile_id, role').eq('event_id', event_id)
        const { data: parts } = await partsQuery

        const schedQuery = supabaseAdmin.from('event_role_schedules').select('*').eq('event_id', event_id)
        const { data: roleScheds } = event_date_id ? await schedQuery.eq('event_date_id', event_date_id) : await schedQuery

        for (const part of parts || []) {
          const roleSched = (roleScheds || []).find((r: any) => r.role === part.role)
          let scheduled_start = eventRow?.departure_time ?? null
          let scheduled_end = eventRow?.arrival_time ?? null
          let schedule_source: 'event_default' | 'role_schedule' = 'event_default'
          if (roleSched && roleSched.use_event_default === false) {
            scheduled_start = roleSched.start_time
            scheduled_end = roleSched.end_time
            schedule_source = 'role_schedule'
          }

          // Find existing assignment scoped to date when applicable
          let existingQuery = supabaseAdmin.from('event_assignments').select('id, schedule_source')
            .eq('event_id', event_id).eq('profile_id', part.profile_id).eq('role', part.role)
          if (event_date_id) existingQuery = existingQuery.eq('event_date_id', event_date_id)
          const { data: existing } = await existingQuery.maybeSingle()

          const { data: recebe } = await supabaseAdmin.rpc('resolve_recebe_deslocamento', {
            _profile_id: part.profile_id, _role: part.role,
          })

          const baseStart = (existing?.schedule_source === 'manual') ? null : scheduled_start
          const baseEnd = (existing?.schedule_source === 'manual') ? null : scheduled_end

          const paid_start = recebe ? (transportFinal?.departure_time ?? baseStart ?? scheduled_start) : (baseStart ?? scheduled_start)
          const paid_end = recebe ? (now ?? baseEnd ?? scheduled_end) : (baseEnd ?? scheduled_end)

          if (existing) {
            await supabaseAdmin.from('event_assignments').update({
              paid_start, paid_end, recebe_deslocamento_resolvido: !!recebe,
              ...(existing.schedule_source === 'manual' ? {} : { scheduled_start, scheduled_end, schedule_source }),
            }).eq('id', existing.id)
          } else {
            await supabaseAdmin.from('event_assignments').insert({
              event_id, profile_id: part.profile_id, role: part.role,
              event_date_id,
              scheduled_start, scheduled_end, schedule_source,
              paid_start, paid_end, recebe_deslocamento_resolvido: !!recebe,
              empresa_id: eventRow?.empresa_id ?? null,
            })
          }
        }
      } catch (e) {
        console.error('[update-event-status] recompute assignments failed:', e)
      }

      return new Response(JSON.stringify({ success: true, finalized_event: finalizeEventLevel }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Other status changes (ativo, cancelado) ---
    if (event_date_id) {
      await supabaseAdmin.from('event_dates').update({
        status: new_status, updated_at: now,
      }).eq('id', event_date_id)
    } else {
      const { error } = await supabaseAdmin.from('events').update({
        status: new_status, updated_at: now,
      }).eq('id', event_id)
      if (error) throw new Error(`Erro ao atualizar evento: ${error.message}`)
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
