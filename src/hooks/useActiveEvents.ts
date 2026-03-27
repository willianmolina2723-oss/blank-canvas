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

      if (eventIds.length > 0) {
        // Fetch participants and user's participations in parallel
        const participantsPromise = supabase
          .from('event_participants')
          .select('event_id')
          .in('event_id', eventIds);

        const myParticipationsPromise = profileResult.data
          ? supabase
              .from('event_participants')
              .select('event_id, role')
              .in('event_id', eventIds)
              .eq('profile_id', profileResult.data.id)
          : Promise.resolve({ data: null });

        const [participantsResult, myResult] = await Promise.all([
          participantsPromise,
          myParticipationsPromise,
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
      }

      return { events, participantCounts: counts, userEventRoles };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
