import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/database';

interface ComputeInput {
  eventId: string;
  profileId: string;
  role: AppRole;
}

/**
 * Recalcula `event_assignments.paid_*` para um participante específico.
 * Lógica:
 * 1) base_start/end:
 *    - manual / role_schedule → assignment.scheduled_*
 *    - event_default          → events.departure_time / arrival_time
 * 2) recebe_desloc = resolve_recebe_deslocamento(profile, role) (RPC)
 * 3) Se recebe_desloc:
 *      paid_start = transport.departure_time (real) ?? base_start
 *      paid_end   = transport.arrival_time   (real) ?? base_end
 *    Senão:
 *      paid_start = base_start
 *      paid_end   = base_end
 */
export async function recomputeAssignmentPaidHours(input: ComputeInput): Promise<void> {
  const { eventId, profileId, role } = input;

  // 1) Carrega assignment atual (cria se não existir)
  let { data: assignment } = await (supabase as any)
    .from('event_assignments')
    .select('*')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('role', role)
    .maybeSingle();

  // Carrega event base
  const { data: eventData } = await supabase
    .from('events')
    .select('id, departure_time, arrival_time, empresa_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!eventData) return;

  // Lookup role schedule
  const { data: roleSchedule } = await (supabase as any)
    .from('event_role_schedules')
    .select('*')
    .eq('event_id', eventId)
    .eq('role', role)
    .maybeSingle();

  // Cria assignment se ausente
  if (!assignment) {
    let scheduled_start = eventData.departure_time;
    let scheduled_end = eventData.arrival_time;
    let schedule_source: 'event_default' | 'role_schedule' = 'event_default';

    if (roleSchedule && roleSchedule.use_event_default === false) {
      scheduled_start = roleSchedule.start_time;
      scheduled_end = roleSchedule.end_time;
      schedule_source = 'role_schedule';
    }

    const insertRes = await (supabase as any)
      .from('event_assignments')
      .insert({
        event_id: eventId,
        profile_id: profileId,
        role,
        scheduled_start,
        scheduled_end,
        schedule_source,
        empresa_id: eventData.empresa_id,
      })
      .select()
      .single();
    assignment = insertRes.data;
    if (!assignment) return;
  }

  // 2) Resolve base_start/end
  let baseStart: string | null = null;
  let baseEnd: string | null = null;

  if (assignment.schedule_source === 'manual' || assignment.schedule_source === 'role_schedule') {
    baseStart = assignment.scheduled_start;
    baseEnd = assignment.scheduled_end;
  } else {
    baseStart = eventData.departure_time;
    baseEnd = eventData.arrival_time;
  }

  // 3) Resolve deslocamento
  const { data: recebeDesloc } = await (supabase as any).rpc('resolve_recebe_deslocamento', {
    _profile_id: profileId,
    _role: role,
  });

  let paidStart = baseStart;
  let paidEnd = baseEnd;

  if (recebeDesloc) {
    const { data: transport } = await supabase
      .from('transport_records')
      .select('departure_time, arrival_time')
      .eq('event_id', eventId)
      .maybeSingle();

    if (transport?.departure_time) paidStart = transport.departure_time;
    if (transport?.arrival_time) paidEnd = transport.arrival_time;
  }

  // 4) Update assignment (trigger calcula paid_duration_minutes)
  await (supabase as any)
    .from('event_assignments')
    .update({
      paid_start: paidStart,
      paid_end: paidEnd,
      recebe_deslocamento_resolvido: !!recebeDesloc,
    })
    .eq('id', assignment.id);
}

/** Recalcula assignments de todos os participantes do evento. */
export async function recomputeAllAssignmentsForEvent(eventId: string): Promise<void> {
  const { data: participants } = await supabase
    .from('event_participants')
    .select('profile_id, role')
    .eq('event_id', eventId);

  if (!participants) return;
  await Promise.all(
    participants.map((p: any) =>
      recomputeAssignmentPaidHours({ eventId, profileId: p.profile_id, role: p.role as AppRole }),
    ),
  );
}
