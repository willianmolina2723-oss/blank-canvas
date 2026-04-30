import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/database';

interface ComputeInput {
  eventId: string;
  profileId: string;
  role: AppRole;
  /**
   * Quando informado, recalcula apenas o assignment desta data.
   * Quando ausente, recalcula todas as datas do evento (ou o assignment legado sem data).
   */
  eventDateId?: string | null;
}

/**
 * Recalcula `event_assignments.paid_*` para um participante em uma data específica.
 *
 * Lógica:
 * 1) base_start/end:
 *    - manual / role_schedule → assignment.scheduled_*
 *    - event_default          → event_dates.start_time/end_time (fallback: events.departure_time/arrival_time)
 * 2) recebe_desloc = resolve_recebe_deslocamento(profile, role) (RPC)
 * 3) Se recebe_desloc:
 *      paid_start = transport.departure_time (real, da mesma data se houver) ?? base_start
 *      paid_end   = transport.arrival_time   (real, da mesma data se houver) ?? base_end
 */
export async function recomputeAssignmentPaidHours(input: ComputeInput): Promise<void> {
  const { eventId, profileId, role, eventDateId = null } = input;

  // Carrega event base (cache)
  const { data: eventData } = await supabase
    .from('events')
    .select('id, departure_time, arrival_time, empresa_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!eventData) return;

  // Carrega event_date específica (se houver)
  let eventDate: any = null;
  if (eventDateId) {
    const { data } = await (supabase as any)
      .from('event_dates')
      .select('*')
      .eq('id', eventDateId)
      .maybeSingle();
    eventDate = data;
  }

  // Lookup role schedule por (event_id, role, event_date_id) com fallback para schedule global do evento
  let roleSchedule: any = null;
  if (eventDateId) {
    const { data } = await (supabase as any)
      .from('event_role_schedules')
      .select('*')
      .eq('event_id', eventId)
      .eq('role', role)
      .eq('event_date_id', eventDateId)
      .maybeSingle();
    roleSchedule = data;
  }
  if (!roleSchedule) {
    const { data } = await (supabase as any)
      .from('event_role_schedules')
      .select('*')
      .eq('event_id', eventId)
      .eq('role', role)
      .is('event_date_id', null)
      .maybeSingle();
    roleSchedule = data;
  }

  // Carrega assignment atual (cria se não existir) — chave: (event_id, profile_id, role, event_date_id)
  let q = (supabase as any)
    .from('event_assignments')
    .select('*')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('role', role);
  q = eventDateId ? q.eq('event_date_id', eventDateId) : q.is('event_date_id', null);
  let { data: assignment } = await q.maybeSingle();

  // Defaults vindos da data ou do evento
  const defaultStart = eventDate?.start_time || eventData.departure_time;
  const defaultEnd = eventDate?.end_time || eventData.arrival_time;

  if (!assignment) {
    let scheduled_start = defaultStart;
    let scheduled_end = defaultEnd;
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
        event_date_id: eventDateId,
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
    baseStart = defaultStart;
    baseEnd = defaultEnd;
    // Se data atual define horário diferente do que está armazenado, atualiza scheduled_*
    if (
      (assignment.scheduled_start !== defaultStart || assignment.scheduled_end !== defaultEnd) &&
      defaultStart &&
      defaultEnd
    ) {
      await (supabase as any)
        .from('event_assignments')
        .update({ scheduled_start: defaultStart, scheduled_end: defaultEnd })
        .eq('id', assignment.id);
    }
  }

  // 3) Resolve deslocamento
  const { data: recebeDesloc } = await (supabase as any).rpc('resolve_recebe_deslocamento', {
    _profile_id: profileId,
    _role: role,
  });

  let paidStart = baseStart;
  let paidEnd = baseEnd;

  if (recebeDesloc) {
    // Busca transport real preferindo a mesma data
    let transport: any = null;
    if (eventDateId) {
      const { data } = await supabase
        .from('transport_records')
        .select('departure_time, arrival_time')
        .eq('event_id', eventId)
        .eq('event_date_id' as any, eventDateId as any)
        .maybeSingle();
      transport = data;
    }
    if (!transport) {
      const { data } = await supabase
        .from('transport_records')
        .select('departure_time, arrival_time')
        .eq('event_id', eventId)
        .maybeSingle();
      transport = data;
    }

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

/**
 * Recalcula assignments de todos os participantes do evento, expandindo por todas as datas.
 * Se o evento não tem datas em event_dates, mantém comportamento legado (event_date_id = null).
 */
export async function recomputeAllAssignmentsForEvent(eventId: string): Promise<void> {
  const { data: participants } = await supabase
    .from('event_participants')
    .select('profile_id, role')
    .eq('event_id', eventId);

  if (!participants || participants.length === 0) return;

  const { data: dates } = await (supabase as any)
    .from('event_dates')
    .select('id')
    .eq('event_id', eventId)
    .order('ordem');

  const dateIds: (string | null)[] = dates && dates.length > 0 ? dates.map((d: any) => d.id as string) : [null];

  const tasks: Promise<void>[] = [];
  for (const p of participants) {
    for (const eventDateId of dateIds) {
      tasks.push(
        recomputeAssignmentPaidHours({
          eventId,
          profileId: p.profile_id,
          role: p.role as AppRole,
          eventDateId,
        }),
      );
    }
  }
  await Promise.all(tasks);
}
