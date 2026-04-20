import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, Clock, Calendar, DollarSign, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import { Badge } from '@/components/ui/badge';
import { useDefaultRates } from '@/hooks/useDefaultRates';

interface ForecastEvent {
  id: string;
  code: string;
  description: string | null;
  location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
}

// Returns Monday of the week containing a given date
function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function EarningsForecast() {
  const { profile, roles } = useAuth();
  const { getRate } = useDefaultRates();
  const [weekEvents, setWeekEvents] = useState<ForecastEvent[]>([]);
  const [monthEvents, setMonthEvents] = useState<ForecastEvent[]>([]);
  const [valorHora, setValorHora] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Default to next week's Monday
  const initialMonday = useMemo(() => {
    const m = startOfWeekMonday(new Date());
    m.setDate(m.getDate() + 7);
    return m;
  }, []);
  const [weekStart, setWeekStart] = useState<Date>(initialMonday);

  // Month filter (yyyy-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [weekStart]);

  useEffect(() => {
    if (!profile) return;
    loadValorHora();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    loadWeek();
  }, [profile, weekStart]);

  useEffect(() => {
    if (!profile) return;
    loadMonth();
  }, [profile, selectedMonth]);

  const loadValorHora = async () => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('valor_hora')
      .eq('id', profile!.id)
      .single();
    const profileValorHora = (profileData as any)?.valor_hora || 0;
    const mainRole = roles.find(r => r !== 'admin') || roles[0] || 'condutor';
    setValorHora(profileValorHora > 0 ? profileValorHora : getRate(mainRole));
  };

  const loadEventsInRange = async (start: Date, end: Date): Promise<ForecastEvent[]> => {
    const { data: participations } = await supabase
      .from('event_participants')
      .select('event_id')
      .eq('profile_id', profile!.id);

    if (!participations || participations.length === 0) return [];
    const eventIds = participations.map(p => p.event_id);

    const { data: eventsData } = await supabase
      .from('events')
      .select('id, code, description, location, departure_time, arrival_time, status')
      .in('id', eventIds)
      .in('status', ['ativo', 'em_andamento', 'finalizado'])
      .gte('departure_time', start.toISOString())
      .lte('departure_time', end.toISOString())
      .order('departure_time', { ascending: true });

    return (eventsData as ForecastEvent[]) || [];
  };

  const loadWeek = async () => {
    setIsLoading(true);
    try {
      const data = await loadEventsInRange(weekStart, weekEnd);
      setWeekEvents(data);
    } catch (err) {
      console.error('Error loading week:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMonth = async () => {
    try {
      const [y, m] = selectedMonth.split('-').map(Number);
      const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      const data = await loadEventsInRange(start, end);
      setMonthEvents(data);
    } catch (err) {
      console.error('Error loading month:', err);
    }
  };

  const calcHours = (departure: string | null, arrival: string | null): number => {
    if (!departure || !arrival) return 0;
    const diff = new Date(arrival).getTime() - new Date(departure).getTime();
    return Math.max(0, diff / (1000 * 60 * 60));
  };

  const { totalHours, totalEarnings, eventDetails } = useMemo(() => {
    let totalH = 0;
    const details = weekEvents.map(ev => {
      const hours = calcHours(ev.departure_time, ev.arrival_time);
      totalH += hours;
      return { ...ev, hours, earnings: hours * valorHora };
    });
    return { totalHours: totalH, totalEarnings: totalH * valorHora, eventDetails: details };
  }, [weekEvents, valorHora]);

  const monthSummary = useMemo(() => {
    let hours = 0;
    monthEvents.forEach(ev => { hours += calcHours(ev.departure_time, ev.arrival_time); });
    return { hours, earnings: hours * valorHora, count: monthEvents.length };
  }, [monthEvents, valorHora]);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ value, label: formatBR(d, 'MMMM yyyy') });
    }
    return opts;
  }, []);

  const goPrevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };
  const goNextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };
  const goCurrentWeek = () => {
    setWeekStart(startOfWeekMonday(new Date()));
  };

  if (isLoading && weekEvents.length === 0) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Previsão de Ganhos</h1>
            <p className="text-sm text-muted-foreground">
              Semana de {formatBR(weekStart, 'dd/MM')} a {formatBR(weekEnd, 'dd/MM/yyyy')}
            </p>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goCurrentWeek}>
              Semana atual
            </Button>
            <Button variant="outline" size="sm" onClick={goNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor/Hora</p>
                  <p className="text-lg font-bold">
                    {valorHora > 0 ? `R$ ${valorHora.toFixed(2)}` : 'Não definido'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                  <Clock className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Horas Previstas</p>
                  <p className="text-lg font-bold">{totalHours.toFixed(1)}h</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Previsão da Semana</p>
                  <p className="text-xl font-bold text-primary">
                    R$ {totalEarnings.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Month filter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Ganhos no Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-3 gap-3 flex-1">
                <div>
                  <p className="text-xs text-muted-foreground">Eventos</p>
                  <p className="text-lg font-bold">{monthSummary.count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Horas</p>
                  <p className="text-lg font-bold">{monthSummary.hours.toFixed(1)}h</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-primary">R$ {monthSummary.earnings.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Eventos da Semana ({weekEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weekEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum evento nesta semana.
              </p>
            ) : (
              <div className="space-y-3">
                {eventDetails.map(ev => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{ev.code}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {ev.status === 'ativo' ? 'Ativo' : ev.status === 'em_andamento' ? 'Em Andamento' : 'Finalizado'}
                        </Badge>
                      </div>
                      {ev.location && (
                        <p className="text-xs text-muted-foreground truncate">{ev.location}</p>
                      )}
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        {ev.departure_time && (
                          <span>Saída: {formatBR(new Date(ev.departure_time), "dd/MM HH:mm")}</span>
                        )}
                        {ev.arrival_time && (
                          <span>Chegada: {formatBR(new Date(ev.arrival_time), "dd/MM HH:mm")}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className="text-xs text-muted-foreground">{ev.hours.toFixed(1)}h</p>
                      <p className="font-bold text-sm text-primary">R$ {ev.earnings.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
