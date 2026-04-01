import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
  differenceInMinutes,
  addDays,
  addMonths,
  subMonths,
  eachWeekOfInterval,
  max,
  min,
} from 'date-fns';
import { formatBR } from '@/utils/dateFormat';
import {
  DollarSign,
  Clock,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
  Users,
  Loader2,
  Download,
  TrendingUp,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { ROLE_LABELS } from '@/types/database';
import type { AppRole } from '@/types/database';

interface EventEntry {
  eventId: string;
  eventCode: string;
  departure: string | null;
  arrival: string | null;
  minutes: number;
  paid: boolean;
}

interface ParticipantHours {
  profileId: string;
  fullName: string;
  email: string | null;
  professionalId: string | null;
  role: AppRole;
  events: EventEntry[];
  totalMinutes: number;
  hourlyRate: number;
  totalPay: number;
}

interface WeekInfo {
  weekStart: Date;
  weekEnd: Date;
  clampedStart: Date;
  clampedEnd: Date;
  label: string;
  paymentDate: Date;
  paymentLabel: string;
}

const DEFAULT_RATES: Record<AppRole, number> = {
  admin: 100,
  medico: 100,
  enfermeiro: 35,
  tecnico: 20,
  condutor: 18,
};

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Get actual calendar weeks for a given month */
function getMonthWeeks(monthDate: Date): WeekInfo[] {
  const mStart = startOfMonth(monthDate);
  const mEnd = endOfMonth(monthDate);

  const weekStarts = eachWeekOfInterval(
    { start: mStart, end: mEnd },
    { weekStartsOn: 1 }
  );

  return weekStarts.map((ws) => {
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    const clampedStart = max([ws, mStart]);
    const clampedEnd = min([we, mEnd]);
    // Payment date = Wednesday after the week ends
    const paymentDate = addDays(we, 3); // Sunday + 3 = Wednesday
    return {
      weekStart: ws,
      weekEnd: we,
      clampedStart,
      clampedEnd,
      label: `${formatBR(clampedStart, "dd/MM")} - ${formatBR(clampedEnd, "dd/MM")}`,
      paymentDate,
      paymentLabel: formatBR(paymentDate, "EEEE dd/MM/yyyy"),
    };
  });
}

export default function PayrollPage() {
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());
  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [participants, setParticipants] = useState<ParticipantHours[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [rates, setRates] = useState<Record<string, number>>({});
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [editRateValue, setEditRateValue] = useState('');
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set());
  const [paidEvents, setPaidEvents] = useState<Set<string>>(new Set()); // "profileId:eventId"
  const { toast } = useToast();

  // Compute actual weeks for the current month
  const weeks = useMemo(() => getMonthWeeks(currentMonthDate), [currentMonthDate]);

  // Ensure activeWeekIndex is within bounds
  useEffect(() => {
    if (activeWeekIndex >= weeks.length) {
      setActiveWeekIndex(Math.max(0, weeks.length - 1));
    }
  }, [weeks, activeWeekIndex]);

  // Find current week on month change
  useEffect(() => {
    const now = new Date();
    const mStart = startOfMonth(currentMonthDate);
    const mEnd = endOfMonth(currentMonthDate);
    if (now >= mStart && now <= mEnd) {
      // Find the week that contains today
      const idx = weeks.findIndex(w => now >= w.clampedStart && now <= w.clampedEnd);
      setActiveWeekIndex(idx >= 0 ? idx : 0);
    } else {
      setActiveWeekIndex(0);
    }
  }, [currentMonthDate]);

  const currentWeek = weeks[activeWeekIndex] || weeks[0];

  const periodStart = currentWeek?.clampedStart;
  const periodEnd = currentWeek?.clampedEnd;

  const goToPrevWeek = () => {
    if (activeWeekIndex > 0) {
      setActiveWeekIndex(i => i - 1);
    } else {
      // Go to previous month, last week
      setCurrentMonthDate(d => {
        const prev = subMonths(d, 1);
        const prevWeeks = getMonthWeeks(prev);
        setActiveWeekIndex(prevWeeks.length - 1);
        return prev;
      });
    }
  };

  const goToNextWeek = () => {
    if (activeWeekIndex < weeks.length - 1) {
      setActiveWeekIndex(i => i + 1);
    } else {
      // Go to next month, first week
      setCurrentMonthDate(d => {
        setActiveWeekIndex(0);
        return addMonths(d, 1);
      });
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [currentMonthDate, activeWeekIndex]);

  const fetchPayrollData = async () => {
    if (!currentWeek) return;
    setIsLoading(true);
    try {
      const { data: transports, error: transportError } = await supabase
        .from('transport_records')
        .select('id, event_id, departure_time, arrival_time')
        .gte('departure_time', periodStart.toISOString())
        .lte('departure_time', periodEnd.toISOString());

      if (transportError) throw transportError;

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, code, departure_time, arrival_time, status')
        .gte('departure_time', periodStart.toISOString())
        .lte('departure_time', periodEnd.toISOString())
        .in('status', ['finalizado', 'em_andamento', 'ativo']);

      if (eventsError) throw eventsError;

      if (!events || events.length === 0) {
        setParticipants([]);
        setIsLoading(false);
        return;
      }

      const eventIds = events.map(e => e.id);

      const transportByEvent = new Map<string, { departure: string | null; arrival: string | null }>();
      for (const t of transports || []) {
        transportByEvent.set(t.event_id, {
          departure: t.departure_time,
          arrival: t.arrival_time,
        });
      }

      const { data: participantsData, error: participantsError } = await supabase
        .from('event_participants')
        .select('*, profile:profiles(*)')
        .in('event_id', eventIds);

      if (participantsError) throw participantsError;

      const participantMap = new Map<string, ParticipantHours>();

      for (const p of participantsData || []) {
        const profile = p.profile as any;
        if (!profile) continue;

        const event = events.find(e => e.id === p.event_id);
        if (!event) continue;

        const transport = transportByEvent.get(event.id);

        let departure: string | null = null;
        let arrival: string | null = null;
        let minutes = 0;

        if (transport?.departure && transport?.arrival) {
          const depDate = parseISO(transport.departure);
          let arrDate = parseISO(transport.arrival);
          if (arrDate < depDate) {
            arrDate = new Date(arrDate.getTime() + 24 * 60 * 60 * 1000);
          }
          const transportMinutes = differenceInMinutes(arrDate, depDate);
          if (transportMinutes > 0) {
            departure = transport.departure;
            arrival = transport.arrival;
            minutes = transportMinutes;
          }
        }

        if (minutes === 0 && event.departure_time && event.arrival_time) {
          departure = event.departure_time;
          arrival = event.arrival_time;
          try {
            let depDate = parseISO(event.departure_time);
            let arrDate = parseISO(event.arrival_time);
            if (arrDate < depDate) {
              arrDate = new Date(arrDate.getTime() + 24 * 60 * 60 * 1000);
            }
            minutes = Math.max(0, differenceInMinutes(arrDate, depDate));
          } catch { minutes = 0; }
        }

        const key = profile.id;
        if (!participantMap.has(key)) {
          const role = p.role as AppRole;
          const savedRate = rates[key];
          const hourlyRate = savedRate ?? DEFAULT_RATES[role] ?? 60;

          participantMap.set(key, {
            profileId: profile.id,
            fullName: profile.full_name,
            email: profile.email,
            professionalId: profile.professional_id,
            role,
            events: [],
            totalMinutes: 0,
            hourlyRate,
            totalPay: 0,
          });
        }

        const entry = participantMap.get(key)!;
        const paidKey = `${profile.id}:${event.id}`;
        entry.events.push({ eventId: event.id, eventCode: event.code, departure, arrival, minutes, paid: paidEvents.has(paidKey) });
        entry.totalMinutes += minutes;
        entry.totalPay = (entry.totalMinutes / 60) * entry.hourlyRate;
      }

      setParticipants(Array.from(participantMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes));
    } catch (error) {
      console.error('Payroll fetch error:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os dados de pagamento.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = useMemo(() => participants.filter(p =>
    p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ROLE_LABELS[p.role]?.toLowerCase().includes(searchTerm.toLowerCase())
  ), [participants, searchTerm]);

  const totals = useMemo(() => ({
    hours: filtered.reduce((sum, p) => sum + p.totalMinutes, 0),
    pay: filtered.reduce((sum, p) => sum + p.totalPay, 0),
    people: filtered.length,
    events: new Set(filtered.flatMap(p => p.events.map(e => e.eventId))).size,
  }), [filtered]);

  const startEditRate = (profileId: string, currentRate: number) => {
    setEditingRate(profileId);
    setEditRateValue(String(currentRate));
  };

  const saveRate = (profileId: string) => {
    const newRate = parseFloat(editRateValue);
    if (isNaN(newRate) || newRate < 0) return;
    setRates(prev => ({ ...prev, [profileId]: newRate }));
    setParticipants(prev => prev.map(p => {
      if (p.profileId !== profileId) return p;
      return { ...p, hourlyRate: newRate, totalPay: (p.totalMinutes / 60) * newRate };
    }));
    setEditingRate(null);
  };

  const toggleExpand = (profileId: string) => {
    setExpandedProfiles(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const toggleEventPaid = (profileId: string, eventId: string) => {
    const key = `${profileId}:${eventId}`;
    setPaidEvents(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // Update participant event paid status
    setParticipants(prev => prev.map(p => {
      if (p.profileId !== profileId) return p;
      return {
        ...p,
        events: p.events.map(ev =>
          ev.eventId === eventId ? { ...ev, paid: !ev.paid } : ev
        ),
      };
    }));
  };

  const markAllEventsPaid = (profileId: string) => {
    const participant = participants.find(p => p.profileId === profileId);
    if (!participant) return;
    setPaidEvents(prev => {
      const next = new Set(prev);
      participant.events.forEach(ev => next.add(`${profileId}:${ev.eventId}`));
      return next;
    });
    setParticipants(prev => prev.map(p => {
      if (p.profileId !== profileId) return p;
      return { ...p, events: p.events.map(ev => ({ ...ev, paid: true })) };
    }));
    toast({ title: 'Sucesso', description: `Todos os eventos de ${participant.fullName} marcados como pagos.` });
  };

  const getRoleBadgeClass = (role: AppRole) => {
    const map: Record<AppRole, string> = {
      admin: 'bg-destructive/10 text-destructive border-destructive/20',
      medico: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      enfermeiro: 'bg-green-500/10 text-green-600 border-green-500/20',
      tecnico: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
      condutor: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
    };
    return map[role] || '';
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const exportCSV = () => {
    const rows = [
      ['Nome', 'Cargo', 'Eventos', 'Horas Trabalhadas', 'Valor/hora (R$)', 'Total (R$)'],
      ...filtered.map(p => [
        p.fullName,
        ROLE_LABELS[p.role],
        String(p.events.length),
        formatHours(p.totalMinutes),
        p.hourlyRate.toFixed(2),
        p.totalPay.toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folha-semana${activeWeekIndex + 1}-${periodStart ? formatBR(periodStart, 'dd-MM-yyyy') : 'unknown'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const monthLabel = formatBR(currentMonthDate, "MMMM 'de' yyyy");

  if (!currentWeek) return null;

  return (
    <MainLayout>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-3 rounded-xl bg-primary/10">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Folha de Pagamento</h1>
              <p className="text-sm text-muted-foreground capitalize">{monthLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={() => setCurrentMonthDate(d => subMonths(d, 1))} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Mês
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentMonthDate(d => addMonths(d, 1))} className="gap-1">
              Mês
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {/* Week Navigation - Carousel Style */}
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between gap-4">
              <Button variant="ghost" size="icon" onClick={goToPrevWeek}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="text-center flex-1">
                <p className="font-bold text-foreground text-lg">
                  Semana {activeWeekIndex + 1}: {currentWeek.label}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Pagamento: <span className="text-primary font-medium capitalize">{currentWeek.paymentLabel}</span>
                  {' · '}
                  {totals.people} colaborador(es)
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={goToNextWeek}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            {/* Dot indicators */}
            <div className="flex justify-center gap-2 mt-4">
              {weeks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveWeekIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === activeWeekIndex
                      ? 'bg-primary scale-125'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                  aria-label={`Semana ${i + 1}`}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Colaboradores</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totals.people}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Eventos</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totals.events}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total de Horas</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{formatHours(totals.hours)}</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1 border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between lg:block">
              <div className="flex items-center gap-2 mb-0 lg:mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary/80 font-medium">Total a Pagar</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                {totals.pay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar colaborador, cargo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Collaborator Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum evento encontrado nesta semana</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Navegue para outra semana</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => {
              const isExpanded = expandedProfiles.has(p.profileId);
              const paidCount = p.events.filter(ev => ev.paid).length;
              const unpaidPay = p.events.filter(ev => !ev.paid).reduce((s, ev) => s + (ev.minutes / 60) * p.hourlyRate, 0);

              return (
              <Card key={p.profileId} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Avatar + Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 text-lg font-bold text-muted-foreground">
                        {getInitials(p.fullName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground truncate">{p.fullName}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeClass(p.role)}`}>
                            {ROLE_LABELS[p.role]}
                          </span>
                          {paidCount > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {paidCount}/{p.events.length} pago(s)
                            </Badge>
                          )}
                        </div>
                        {p.email && (
                          <p className="text-xs text-muted-foreground truncate mb-2">{p.email}</p>
                        )}
                        <button
                          className="flex flex-wrap gap-1 cursor-pointer hover:opacity-80"
                          onClick={() => toggleExpand(p.profileId)}
                        >
                          {p.events.slice(0, 4).map(ev => (
                            <span key={ev.eventId} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs ${ev.paid ? 'bg-primary/10 text-primary line-through' : 'bg-muted text-muted-foreground'}`}>
                              <Calendar className="h-3 w-3" />
                              {ev.eventCode}
                              {ev.minutes > 0 && (
                                <span className={`font-medium ${ev.paid ? 'text-primary' : 'text-foreground'}`}>· {formatHours(ev.minutes)}</span>
                              )}
                              {ev.paid && <Check className="h-3 w-3" />}
                              {!ev.departure || !ev.arrival ? (
                                <span className="text-destructive">sem horário</span>
                              ) : null}
                            </span>
                          ))}
                          {p.events.length > 4 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground">
                              +{p.events.length - 4} eventos
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Hours + Pay */}
                    <div className="flex flex-row sm:flex-col gap-4 sm:gap-2 sm:items-end flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border pt-3 sm:pt-0 sm:pl-4">
                      <div className="flex-1 sm:flex-none text-center sm:text-right">
                        <div className="flex items-center gap-1 text-muted-foreground justify-center sm:justify-end mb-0.5">
                          <Clock className="h-3 w-3" />
                          <span className="text-xs">Horas</span>
                        </div>
                        <p className="font-bold text-foreground">{formatHours(p.totalMinutes)}</p>
                      </div>

                      {/* Hourly Rate Editable */}
                      <div className="flex-1 sm:flex-none text-center sm:text-right">
                        <div className="text-xs text-muted-foreground mb-0.5">Valor/hora</div>
                        {editingRate === p.profileId ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">R$</span>
                            <Input
                              className="h-7 w-20 text-sm px-2"
                              value={editRateValue}
                              onChange={e => setEditRateValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveRate(p.profileId); if (e.key === 'Escape') setEditingRate(null); }}
                              autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveRate(p.profileId)}>
                              <Check className="h-3 w-3 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRate(null)}>
                              <X className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary transition-colors"
                            onClick={() => startEditRate(p.profileId, p.hourlyRate)}
                          >
                            R$ {p.hourlyRate.toFixed(2)}
                            <Edit2 className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>

                      {/* Total */}
                      <div className="flex-1 sm:flex-none text-center sm:text-right">
                        <div className="text-xs text-muted-foreground mb-0.5">Total</div>
                        <p className="font-bold text-primary text-lg">
                          {p.totalPay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        {paidCount > 0 && paidCount < p.events.length && (
                          <p className="text-[10px] text-muted-foreground">
                            Pendente: {unpaidPay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable per-event detail */}
                  {p.events.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <button
                        className="text-xs text-primary font-medium flex items-center gap-1 mb-2"
                        onClick={() => toggleExpand(p.profileId)}
                      >
                        {isExpanded ? <ChevronLeft className="h-3 w-3 rotate-90" /> : <ChevronRight className="h-3 w-3 rotate-90" />}
                        {isExpanded ? 'Recolher eventos' : `Ver ${p.events.length} eventos separadamente`}
                      </button>

                      {isExpanded && (
                        <div className="space-y-2">
                          {p.events.map(ev => {
                            const evPay = (ev.minutes / 60) * p.hourlyRate;
                            return (
                              <div key={ev.eventId} className={`flex items-center justify-between p-3 rounded-lg ${ev.paid ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}>
                                <div className="flex items-center gap-3">
                                  <div>
                                    <p className={`text-sm font-semibold ${ev.paid ? 'text-primary line-through' : 'text-foreground'}`}>
                                      {ev.eventCode}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {ev.departure ? formatBR(parseISO(ev.departure), 'dd/MM HH:mm') : '—'} → {ev.arrival ? formatBR(parseISO(ev.arrival), 'HH:mm') : '—'}
                                      {ev.minutes > 0 && ` · ${formatHours(ev.minutes)}`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-sm font-bold ${ev.paid ? 'text-primary' : 'text-foreground'}`}>
                                    {evPay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant={ev.paid ? 'default' : 'outline'}
                                    className="text-xs h-7 gap-1"
                                    onClick={() => toggleEventPaid(p.profileId, ev.eventId)}
                                  >
                                    {ev.paid ? <><Check className="h-3 w-3" /> Pago</> : 'Marcar pago'}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                          {paidCount < p.events.length && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs mt-1"
                              onClick={() => markAllEventsPaid(p.profileId)}
                            >
                              <Check className="h-3 w-3 mr-1" /> Marcar todos como pago
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Single event: show pay button inline */}
                  {p.events.length === 1 && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-end">
                      <Button
                        size="sm"
                        variant={p.events[0].paid ? 'default' : 'outline'}
                        className="text-xs h-7 gap-1"
                        onClick={() => toggleEventPaid(p.profileId, p.events[0].eventId)}
                      >
                        {p.events[0].paid ? <><Check className="h-3 w-3" /> Pago</> : 'Marcar pago'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
