import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, Calendar, ChevronLeft, ChevronRight, Filter, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import { Badge } from '@/components/ui/badge';
import { useDefaultRates } from '@/hooks/useDefaultRates';
import {
  parseISO,
  differenceInMinutes,
  startOfMonth,
  endOfMonth,
  endOfDay,
  addDays,
  subDays,
  getDay,
} from 'date-fns';

interface ForecastEvent {
  id: string;
  code: string;
  description: string | null;
  location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
  event_date: string;
  minutes: number;
  earnings: number;
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function calcMinutes(departure: string | null, arrival: string | null): number {
  if (!departure || !arrival) return 0;
  try {
    const dep = parseISO(departure);
    let arr = parseISO(arrival);
    if (arr < dep) arr = new Date(arr.getTime() + 24 * 60 * 60 * 1000);
    const mins = differenceInMinutes(arr, dep);
    return mins > 0 ? mins : 0;
  } catch { return 0; }
}

function getCurrentWedWeekStart(): Date {
  const now = new Date();
  const day = getDay(now);
  const daysBack = (day + 4) % 7;
  const wed = subDays(now, daysBack);
  wed.setHours(0, 0, 0, 0);
  return wed;
}

function getWeekFromOffset(offset: number): { displayStart: Date; displayEnd: Date; payDate: Date } {
  const currentWed = getCurrentWedWeekStart();
  const displayStart = addDays(currentWed, offset * 7);
  const displayEnd = addDays(displayStart, 6);
  const payDate = addDays(displayStart, 7);
  return { displayStart, displayEnd, payDate };
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function EarningsForecast() {
  const { profile, roles } = useAuth();
  const { getRate } = useDefaultRates();
  const [allEvents, setAllEvents] = useState<ForecastEvent[]>([]);
  const [valorHora, setValorHora] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => formatBR(new Date(), 'yyyy-MM'));
  const [viewMode, setViewMode] = useState<'semana' | 'mes'>('semana');
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    loadValorHora();
  }, [profile]);

  useEffect(() => {
    if (!profile || valorHora === 0) {
      // still load events even when valorHora=0 so list shows
    }
    if (!profile) return;
    loadData();
  }, [profile, selectedMonth, weekOffset, viewMode, valorHora]);

  const loadValorHora = async () => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('valor_hora')
      .eq('id', profile!.id)
      .single();
    const profileValorHora = (profileData as any)?.valor_hora || 0;
    const mainRole = roles.find((r) => r !== 'admin') || roles[0] || 'condutor';
    setValorHora(profileValorHora > 0 ? profileValorHora : getRate(mainRole));
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: participations } = await supabase
        .from('event_participants')
        .select('event_id')
        .eq('profile_id', profile!.id);

      if (!participations || participations.length === 0) {
        setAllEvents([]);
        return;
      }
      const eventIds = participations.map((p: any) => p.event_id);

      // Load assignments (paid_duration_minutes is the source of truth when present)
      const { data: assignmentsData } = await (supabase as any)
        .from('event_assignments')
        .select('event_id, paid_duration_minutes, paid_start, paid_end')
        .eq('profile_id', profile!.id)
        .in('event_id', eventIds);

      const assignmentMap = new Map<string, { minutes: number | null; paidStart: string | null; paidEnd: string | null }>();
      (assignmentsData || []).forEach((a: any) => {
        assignmentMap.set(a.event_id, {
          minutes: a.paid_duration_minutes,
          paidStart: a.paid_start,
          paidEnd: a.paid_end,
        });
      });

      const { data: rawEvents } = await supabase
        .from('events')
        .select('id, code, description, location, departure_time, arrival_time, status, created_at')
        .in('id', eventIds)
        .in('status', ['ativo', 'em_andamento', 'finalizado'])
        .order('departure_time', { ascending: true, nullsFirst: false });

      // Load event dates to use real event date (not created_at)
      const { data: eventDatesData } = await supabase
        .from('event_dates')
        .select('event_id, start_time, date, ordem')
        .in('event_id', eventIds)
        .order('ordem', { ascending: true });

      const todayStr = new Date().toISOString().slice(0, 10);
      const eventDateMap = new Map<string, string>();
      const datesByEvent: Record<string, any[]> = {};
      (eventDatesData || []).forEach((d: any) => {
        (datesByEvent[d.event_id] ||= []).push(d);
      });
      Object.entries(datesByEvent).forEach(([eid, list]) => {
        const exact = list.find(d => d.date === todayStr);
        const future = list.find(d => d.date >= todayStr);
        const chosen = exact || future || list[list.length - 1] || list[0];
        if (chosen) eventDateMap.set(eid, chosen.start_time);
      });

      // Filtrar apenas eventos cujo financeiro do contratante está marcado como pago
      const { data: financesData } = await supabase
        .from('event_finances')
        .select('event_id, status')
        .in('event_id', eventIds);
      const paidEventIds = new Set(
        (financesData || [])
          .filter((f: any) => f.status === 'pago')
          .map((f: any) => f.event_id),
      );

      const events: ForecastEvent[] = (rawEvents || [])
        .filter((ev: any) => paidEventIds.has(ev.id))
        .map((ev: any) => {
          const assignment = assignmentMap.get(ev.id);
          const minutes = assignment?.minutes != null
            ? assignment.minutes
            : calcMinutes(ev.departure_time, ev.arrival_time);
          // Prefer event_dates start_time, fallback to event.departure_time, then created_at
          const eventDate = eventDateMap.get(ev.id) || ev.departure_time || ev.created_at;
          return {
            id: ev.id,
            code: ev.code,
            description: ev.description,
            location: ev.location,
            departure_time: assignment?.paidStart || ev.departure_time,
            arrival_time: assignment?.paidEnd || ev.arrival_time,
            status: ev.status,
            event_date: eventDate,
            minutes,
            earnings: (minutes / 60) * valorHora,
          };
        });

      setAllEvents(events);
    } catch (err) {
      console.error('Error loading earnings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ value: formatBR(d, 'yyyy-MM'), label: formatBR(d, 'MMMM yyyy') });
    }
    for (let i = 1; i <= (11 - now.getMonth()); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.unshift({ value: formatBR(d, 'yyyy-MM'), label: formatBR(d, 'MMMM yyyy') });
    }
    return opts;
  }, []);

  // Month totals (always based on selectedMonth filter)
  const monthTotals = useMemo(() => {
    const mStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const mEnd = endOfMonth(mStart);
    const inMonth = allEvents.filter((ev) => {
      const d = new Date(ev.event_date);
      return d >= mStart && d <= mEnd;
    });
    const minutes = inMonth.reduce((s, e) => s + e.minutes, 0);
    const total = inMonth.reduce((s, e) => s + e.earnings, 0);
    return { count: inMonth.length, minutes, total };
  }, [allEvents, selectedMonth]);

  if (isLoading && allEvents.length === 0) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const renderEventCard = (ev: ForecastEvent) => {
    const isExpanded = expandedEventId === ev.id;
    return (
      <Card key={ev.id}>
        <CardContent className="p-4">
          <button className="w-full text-left" onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">{ev.code}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {ev.status === 'ativo' ? 'Ativo' : ev.status === 'em_andamento' ? 'Em Andamento' : 'Finalizado'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {ev.minutes > 0 ? formatHours(ev.minutes) : '--'} • {formatBR(new Date(ev.event_date), 'dd/MM')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <p className="font-bold text-base text-primary whitespace-nowrap">{fmt(ev.earnings)}</p>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </button>

          {isExpanded && (
            <div className="mt-3 pt-3 border-t space-y-2 text-xs">
              {ev.location && <p className="text-muted-foreground">📍 {ev.location}</p>}
              <div className="flex flex-wrap gap-3">
                {ev.departure_time && <span>Saída: <strong>{formatBR(new Date(ev.departure_time), 'dd/MM HH:mm')}</strong></span>}
                {ev.arrival_time && <span>Chegada: <strong>{formatBR(new Date(ev.arrival_time), 'dd/MM HH:mm')}</strong></span>}
              </div>
              {ev.minutes > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {fmt(valorHora)}/h × {formatHours(ev.minutes)} = {fmt(ev.earnings)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Previsão de Ganhos</h1>
              <p className="text-sm text-muted-foreground">Apenas eventos já pagos pelo contratante</p>
            </div>
          </div>
        </div>

        {/* Filters - same pattern as FinancialPayments */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
          </Select>

          <div className="flex rounded-2xl border bg-muted/30 p-1.5 gap-1">
            <button
              onClick={() => { setViewMode('semana'); setWeekOffset(0); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewMode === 'semana' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Calendar className="h-4 w-4" />
              Semanal
            </button>
            <button
              onClick={() => setViewMode('mes')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewMode === 'mes' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Calendar className="h-4 w-4" />
              Mensal
            </button>
          </div>
        </div>

        {/* Month Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Mês</p>
            <p className="text-lg font-bold text-primary">{fmt(monthTotals.total)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Eventos</p>
            <p className="text-lg font-bold text-foreground">{monthTotals.count}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Horas Totais</p>
            <p className="text-lg font-bold text-foreground">{formatHours(monthTotals.minutes)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Valor/Hora</p>
            <p className="text-lg font-bold text-foreground">{valorHora > 0 ? fmt(valorHora) : '--'}</p>
          </CardContent></Card>
        </div>

        {viewMode === 'semana' ? (
          (() => {
            const w = getWeekFromOffset(weekOffset);
            const weekStart = w.displayStart;
            const weekEnd = endOfDay(w.displayEnd);
            const weekEvents = allEvents.filter((ev) => {
              const d = new Date(ev.event_date);
              return d >= weekStart && d <= weekEnd;
            });
            const weekMinutes = weekEvents.reduce((s, e) => s + e.minutes, 0);
            const weekTotal = weekEvents.reduce((s, e) => s + e.earnings, 0);

            return (
              <div className="space-y-4">
                {/* Week navigation */}
                <div className="flex items-center justify-between py-2">
                  <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setWeekOffset(o => o - 1)}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div className="text-center">
                    <p className="font-bold text-lg">
                      {formatBR(w.displayStart, "dd 'de' MMM")} - {formatBR(w.displayEnd, "dd 'de' MMM")}
                    </p>
                    {weekOffset === 0 && <p className="text-sm text-muted-foreground">Semana atual</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setWeekOffset(o => o + 1)}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>

                {/* Week summary */}
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Eventos</p>
                    <p className="text-lg font-bold">{weekEvents.length}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Horas</p>
                    <p className="text-lg font-bold">{formatHours(weekMinutes)}</p>
                  </CardContent></Card>
                  <Card className="border-primary/20 bg-primary/5"><CardContent className="p-3 text-center">
                    <p className="text-xs text-primary/80">Total Semana</p>
                    <p className="text-lg font-bold text-primary">{fmt(weekTotal)}</p>
                  </CardContent></Card>
                </div>

                {weekEvents.length > 0 ? (
                  <div className="space-y-3">
                    {weekEvents.map(renderEventCard)}
                  </div>
                ) : (
                  <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum evento nesta semana</CardContent></Card>
                )}
              </div>
            );
          })()
        ) : (
          <div className="space-y-3">
            {(() => {
              const mStart = startOfMonth(parseISO(`${selectedMonth}-01`));
              const mEnd = endOfMonth(mStart);
              const monthEvents = allEvents.filter((ev) => {
                const d = new Date(ev.event_date);
                return d >= mStart && d <= mEnd;
              });
              if (monthEvents.length === 0) {
                return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum evento neste mês</CardContent></Card>;
              }
              return monthEvents.map(renderEventCard);
            })()}
          </div>
        )}

        {valorHora === 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-3">
              <p className="text-sm text-destructive">
                ⚠️ Seu valor/hora ainda não foi definido. Peça ao administrador para configurar seu valor na gestão de usuários.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
