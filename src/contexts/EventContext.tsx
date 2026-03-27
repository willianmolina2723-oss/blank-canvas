import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Event, Patient, ChecklistItem, NursingEvolution, MedicalEvolution, TransportRecord, EventParticipant, Profile, AppRole } from '@/types/database';

interface EventWithDetails extends Event {
  participants?: (EventParticipant & { profile?: Profile })[];
  patient?: Patient;
  checklist_items?: ChecklistItem[];
  nursing_evolutions?: NursingEvolution[];
  medical_evolutions?: MedicalEvolution[];
  transport_record?: TransportRecord;
}

interface EventContextType {
  currentEvent: EventWithDetails | null;
  isLoading: boolean;
  error: string | null;
  loadEvent: (eventId: string) => Promise<void>;
  clearEvent: () => void;
  refreshEvent: () => Promise<void>;
  userEventRole: AppRole | null;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export function EventProvider({ children }: { children: React.ReactNode }) {
  const [currentEvent, setCurrentEvent] = useState<EventWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEventRole, setUserEventRole] = useState<AppRole | null>(null);

  const loadEvent = useCallback(async (eventId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Load event with all related data
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();

      if (eventError) throw eventError;
      if (!event) {
        setError('Evento não encontrado');
        return;
      }

      // Load participants
      const { data: participants } = await supabase
        .from('event_participants')
        .select(`
          *,
          profile:profiles(*)
        `)
        .eq('event_id', eventId);

      // Load patient
      const { data: patient } = await supabase
        .from('patients')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();

      // Load checklist items
      const { data: checklistItems } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      // Load nursing evolutions
      const { data: nursingEvolutions } = await supabase
        .from('nursing_evolutions')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      // Load medical evolutions
      const { data: medicalEvolutions } = await supabase
        .from('medical_evolutions')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      // Load transport record
      const { data: transportRecord } = await supabase
        .from('transport_records')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();

      // Get current user's role in this event
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileData) {
          const userParticipant = participants?.find(p => p.profile_id === profileData.id);
          setUserEventRole(userParticipant?.role as AppRole || null);
        }
      }

      setCurrentEvent({
        ...event,
        participants: participants as (EventParticipant & { profile?: Profile })[] || [],
        patient: patient as Patient || undefined,
        checklist_items: checklistItems as ChecklistItem[] || [],
        nursing_evolutions: nursingEvolutions as NursingEvolution[] || [],
        medical_evolutions: medicalEvolutions as MedicalEvolution[] || [],
        transport_record: transportRecord as TransportRecord || undefined,
      } as EventWithDetails);
    } catch (err) {
      console.error('Error loading event:', err);
      setError('Erro ao carregar evento');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearEvent = useCallback(() => {
    setCurrentEvent(null);
    setUserEventRole(null);
    setError(null);
  }, []);

  const refreshEvent = useCallback(async () => {
    if (currentEvent?.id) {
      await loadEvent(currentEvent.id);
    }
  }, [currentEvent?.id, loadEvent]);

  return (
    <EventContext.Provider
      value={{
        currentEvent,
        isLoading,
        error,
        loadEvent,
        clearEvent,
        refreshEvent,
        userEventRole,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEvent() {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
}
