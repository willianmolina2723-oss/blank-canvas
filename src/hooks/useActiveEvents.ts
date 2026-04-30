import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Event, Ambulance as AmbulanceType } from '@/types/database';

export function useActiveEvents() {
  return useQuery({
    queryKey: ['active-events'],
    queryFn: async () => {
      // Get user info first (needed for role lookup)
      const { data: { user } } = await supabase.auth.getUser();

      const [eventsResult, profileResult] = await Promise.all([
        supabase
          .from('events')
          .select('*, ambulances(*)')
          .in('status', ['ativo', 'em_andamento'])
          .order('created_at', { ascending: false })
          .limit(10),
        user
          ? supabase
              .from('profiles')
              .select('id')
              .eq('user_id', user.id)
              .single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (eventsResult.error) throw eventsResult.error;

      const events = (eventsResult.data || []).map((e: any) => ({
        ...e,
        ambulance: e.ambulances || undefined,
      })) as (Event & { ambulance?: AmbulanceType })[];

      const eventIds = events.map(e => e.id);
      let counts: Record<string, number> = {};
      let userEventRoles: Record<string, string> = {};
      let eventStartDates: Record<string, string> = {};

      if (eventIds.length > 0) {
        // Fetch participants, user's participations, and event dates in parallel
        const participantsPromise = supabase
          .from('event_participants')
          .select('event_id')
          .in('event_id', eventIds);

        const datesPromise = supabase
          .from('event_dates')
          .select('event_id, start_time, date, ordem')
          .in('event_id', eventIds)
          .order('ordem', { ascending: true });

        const myParticipationsPromise = profileResult.data
          ? supabase
              .from('event_participants')
              .select('event_id, role')
              .in('event_id', eventIds)
              .eq('profile_id', profileResult.data.id)
          : Promise.resolve({ data: null });

        const [participantsResult, myResult, datesResult] = await Promise.all([
          participantsPromise,
          myParticipationsPromise,
          datesPromise,
        ]);

        if (participantsResult.data) {
          participantsResult.data.forEach((p: any) => {
            counts[p.event_id] = (counts[p.event_id] || 0) + 1;
          });
        }

        if (myResult.data) {
          myResult.data.forEach((p: any) => {
            userEventRoles[p.event_id] = p.role;
          });
        }

        if (datesResult.data) {
          const today = new Date().toISOString().slice(0, 10);
          // Group by event_id
          const byEvent: Record<string, any[]> = {};
          datesResult.data.forEach((d: any) => {
            (byEvent[d.event_id] ||= []).push(d);
          });
          Object.entries(byEvent).forEach(([eid, list]) => {
            // Prefer today, else next future, else last past, else first
            const exact = list.find(d => d.date === today);
            const future = list.find(d => d.date >= today);
            const chosen = exact || future || list[list.length - 1] || list[0];
            if (chosen) eventStartDates[eid] = chosen.start_time;
          });
        }
      }

      return { events, participantCounts: counts, userEventRoles, eventStartDates };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
