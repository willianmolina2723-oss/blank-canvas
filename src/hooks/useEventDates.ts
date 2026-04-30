import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { todayBrasilia } from '@/utils/dateFormat';

export interface EventDateRow {
  id: string;
  event_id: string;
  date: string;            // YYYY-MM-DD
  start_time: string;      // ISO timestamptz
  end_time: string;        // ISO timestamptz
  ordem: number;
  status: string;
  location_override: string | null;
  notes: string | null;
}

/**
 * Carrega event_dates de um evento e mantém a "data ativa" sincronizada
 * com o query param `?date=<event_date_id>`.
 *
 * Auto-seleção:
 *  1. param `?date=<id>` se válido
 *  2. data cuja `date` == hoje (Brasília)
 *  3. próxima data >= hoje
 *  4. última data
 *  5. primeira (fallback)
 */
export function useEventDates(eventId: string | undefined) {
  const [dates, setDates] = useState<EventDateRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let alive = true;
    if (!eventId) {
      setDates([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    supabase
      .from('event_dates')
      .select('*')
      .eq('event_id', eventId)
      .order('ordem', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('useEventDates load error:', error);
          setDates([]);
        } else {
          setDates((data || []) as EventDateRow[]);
        }
        setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [eventId]);

  const paramId = searchParams.get('date');

  const activeId = useMemo(() => {
    if (!dates.length) return null;
    if (paramId && dates.some(d => d.id === paramId)) return paramId;

    const today = todayBrasilia(); // YYYY-MM-DD
    const exact = dates.find(d => d.date === today);
    if (exact) return exact.id;

    const future = dates.find(d => d.date >= today);
    if (future) return future.id;

    return dates[dates.length - 1].id;
  }, [dates, paramId]);

  const activeDate = useMemo(
    () => dates.find(d => d.id === activeId) || null,
    [dates, activeId]
  );

  const setActiveId = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('date', id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return { dates, activeId, activeDate, setActiveId, isLoading };
}
