import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Filter, Check, Download, ChevronDown, ChevronUp, Clock, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { parseISO, differenceInMinutes, startOfMonth, endOfMonth, addDays, endOfDay, isWithinInterval, getDay, subDays } from 'date-fns';
import { formatBR } from '@/utils/dateFormat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ROLE_LABELS } from '@/types/database';
import type { AppRole } from '@/types/database';

const db = supabase as any;

const DEFAULT_RATE = 18.60;

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  try { return formatBR(parseISO(iso), 'HH:mm'); } catch { return '--:--'; }
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

interface EventEntry {
  event_id: string;
  event_code: string;
  event_date: string;
  departure: string | null;
  arrival: string | null;
  minutes: number;
  total: number;
  base: number;
  extras: number;
  discounts: number;
  payment_type: string;
  hourlyRate: number;
}

interface PersonSummary {
  profile_id: string;
  name: string;
  email: string;
  professional_id: string;
  phone: string;
  role: string;
  hourlyRate: number;
  events: EventEntry[];
  total: number;
  totalMinutes: number;
}

interface WeekGroup {
  weekStart: Date;
  weekEnd: Date;
  displayStart: Date;
  displayEnd: Date;
  paymentDate: Date; // Wednesday
  label: string;
  persons: PersonSummary[];
  totalAmount: number;
  totalMinutes: number;
}

function getWeeksInMonth(month: string): { start: Date; end: Date; displayStart: Date; displayEnd: Date; payDate: Date }[] {
  const monthStart = startOfMonth(parseISO(`${month}-01`));
  const monthEnd = endOfMonth(monthStart);

  const dayOfWeek = getDay(monthStart);
  const daysBackToWed = (dayOfWeek + 4) % 7;
  const firstWed = addDays(monthStart, -daysBackToWed);

  const weeks: { start: Date; end: Date; displayStart: Date; displayEnd: Date; payDate: Date }[] = [];
  let cursor = firstWed;

  while (cursor <= monthEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = endOfDay(addDays(weekStart, 6));

    const clippedStart = weekStart < monthStart ? monthStart : weekStart;
    const clippedEnd = weekEnd > monthEnd ? endOfDay(monthEnd) : weekEnd;

    const payDate = addDays(weekStart, 7);

    weeks.push({
      start: clippedStart,
      end: clippedEnd,
      displayStart: weekStart,
      displayEnd: addDays(weekStart, 6),
      payDate,
    });
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

/** Get the current Wednesday-based week start */
function getCurrentWedWeekStart(): Date {
  const now = new Date();
  const day = getDay(now);
  const daysBack = (day + 4) % 7; // days since last Wednesday
  const wed = subDays(now, daysBack);
  wed.setHours(0, 0, 0, 0);
  return wed;
}

/** Get week start/end from an offset relative to the current week */
function getWeekFromOffset(offset: number): { displayStart: Date; displayEnd: Date; payDate: Date } {
  const currentWed = getCurrentWedWeekStart();
  const displayStart = addDays(currentWed, offset * 7);
  const displayEnd = addDays(displayStart, 6); // Tuesday
  const payDate = addDays(displayStart, 7); // Next Wednesday
  return { displayStart, displayEnd, payDate };
}

export default function FinancialPayments() {
  const { isAdmin, isLoading: authLoading, profile, empresa } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => formatBR(new Date(), 'yyyy-MM'));
  const [staffSummary, setStaffSummary] = useState<PersonSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [freelancerPayments, setFreelancerPayments] = useState<Record<string, any>>({});
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payingPerson, setPayingPerson] = useState<any>(null);
  const [payingEvent, setPayingEvent] = useState<EventEntry | null>(null);
  const [paymentForm, setPaymentForm] = useState({ payment_method: 'pix', payment_date: formatBR(new Date(), 'yyyy-MM-dd'), notes: '' });
  const [viewMode, setViewMode] = useState<'semana' | 'mes'>('semana');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/');
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    setWeekOffset(0);
  }, []);

  useEffect(() => {
    if (viewMode === 'semana') {
      setWeekOffset(0);
    }
  }, [viewMode]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [selectedMonth, isAdmin, weekOffset, viewMode]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let rangeStart: Date;
      let rangeEnd: Date;

      if (viewMode === 'semana') {
        // Load a wider range: current week offset ± 4 weeks to allow smooth navigation
        const weekData = getWeekFromOffset(weekOffset);
        rangeStart = addDays(weekData.displayStart, -28);
        rangeEnd = endOfDay(addDays(weekData.displayEnd, 28));
      } else {
        rangeStart = startOfMonth(parseISO(`${selectedMonth}-01`));
        rangeEnd = endOfMonth(rangeStart);
      }

      const { data: rawEvents } = await supabase
        .from('events')
        .select('id, code, departure_time, arrival_time, status, created_at')
        .in('status', ['finalizado', 'em_andamento', 'ativo']);

      const events = (rawEvents || []).filter(ev => {
        const refDate = ev.departure_time || ev.created_at;
        const d = new Date(refDate);
        return d >= rangeStart && d <= rangeEnd;
      });

      if (!events || events.length === 0) {
        setStaffSummary([]);
        setIsLoading(false);
        return;
      }

      const eventIds = events.map(e => e.id);

      const { data: transports } = await supabase
        .from('transport_records')
        .select('event_id, departure_time, arrival_time')
        .in('event_id', eventIds);

      const transportByEvent = new Map<string, { departure: string | null; arrival: string | null }>();
      (transports || []).forEach(t => {
        transportByEvent.set(t.event_id, { departure: t.departure_time, arrival: t.arrival_time });
      });

      const { data: participantsData } = await supabase
        .from('event_participants')
        .select('event_id, role, profile:profiles(id, full_name, email, professional_id, phone)')
        .in('event_id', eventIds);

      const { data: staffCosts } = await db.from('event_staff_costs')
        .select('event_id, profile_id, base_value, extras, discounts, payment_type')
        .in('event_id', eventIds);

      const staffCostMap = new Map<string, any>();
      (staffCosts || []).forEach((sc: any) => {
        staffCostMap.set(`${sc.event_id}_${sc.profile_id}`, sc);
      });

      const grouped: Record<string, PersonSummary> = {};

      for (const p of participantsData || []) {
        const prof = p.profile as any;
        if (!prof) continue;
        const pid = prof.id;
        const event = events.find(e => e.id === p.event_id);
        if (!event) continue;

        const transport = transportByEvent.get(event.id);
        const departure = transport?.departure || event.departure_time;
        const arrival = transport?.arrival || event.arrival_time;
        const minutes = calcMinutes(departure, arrival);

        const sc = staffCostMap.get(`${event.id}_${pid}`);
        const role = p.role as string;
        const hourlyRate = DEFAULT_RATE;
        const hasStaffCost = !!sc;
        const effectiveRate = hasStaffCost && Number(sc.base_value) > 0
          ? Number(sc.base_value)
          : hourlyRate;
        const extras = hasStaffCost ? (Number(sc.extras) || 0) : 0;
        const discounts = hasStaffCost ? (Number(sc.discounts) || 0) : 0;
        const costTotal = (minutes / 60) * effectiveRate + extras - discounts;

        const eventDate = event.departure_time || event.created_at;

        if (!grouped[pid]) {
          grouped[pid] = {
            profile_id: pid,
            name: prof.full_name || 'N/A',
            email: prof.email || '',
            professional_id: prof.professional_id || '',
            phone: prof.phone || '',
            role,
            hourlyRate,
            events: [],
            total: 0,
            totalMinutes: 0,
          };
        }

        grouped[pid].events.push({
          event_id: event.id,
          event_code: event.code,
          event_date: eventDate,
          departure, arrival, minutes,
          total: costTotal,
          base: hasStaffCost ? Number(sc.base_value) : 0,
          extras,
          discounts,
          payment_type: hasStaffCost ? sc.payment_type : 'por_hora',
          hourlyRate: effectiveRate,
        });
        grouped[pid].total += costTotal;
        grouped[pid].totalMinutes += minutes;
      }

      setStaffSummary(Object.values(grouped).sort((a, b) => b.totalMinutes - a.totalMinutes));

      const { data: fp } = await db.from('freelancer_payments').select('*')
        .eq('reference_month', `${selectedMonth}-01`).eq('cancelled', false);
      const fpMap: Record<string, any> = {};
      (fp || []).forEach((p: any) => { fpMap[p.profile_id] = p; });
      setFreelancerPayments(fpMap);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group persons/events by week
  const weekGroups: WeekGroup[] = useMemo(() => {
    const weeks = getWeeksInMonth(selectedMonth);
    return weeks.map((w, idx) => {
      const personsInWeek: Record<string, PersonSummary> = {};

      for (const person of staffSummary) {
        const weekEvents = person.events.filter(ev => {
          const d = new Date(ev.event_date);
          return isWithinInterval(d, { start: w.start, end: w.end });
        });

        if (weekEvents.length > 0) {
          personsInWeek[person.profile_id] = {
            ...person,
            events: weekEvents,
            total: weekEvents.reduce((s, e) => s + e.total, 0),
            totalMinutes: weekEvents.reduce((s, e) => s + e.minutes, 0),
          };
        }
      }

      const persons = Object.values(personsInWeek).sort((a, b) => b.totalMinutes - a.totalMinutes);

      return {
        weekStart: w.start,
        weekEnd: w.end,
        displayStart: w.displayStart,
        displayEnd: w.displayEnd,
        paymentDate: w.payDate,
        label: `Semana ${idx + 1}: ${formatBR(w.displayStart, 'dd/MM')} - ${formatBR(w.displayEnd, 'dd/MM')}`,
        persons,
        totalAmount: persons.reduce((s, p) => s + p.total, 0),
        totalMinutes: persons.reduce((s, p) => s + p.totalMinutes, 0),
      };
    });
  }, [staffSummary, selectedMonth]);

  const markAsPaid = async () => {
    if (!payingPerson) return;
    const amountToPay = payingEvent ? payingEvent.total : payingPerson.total;
    const notesPrefix = payingEvent ? `[Evento ${payingEvent.event_code}] ` : '';
    try {
      const existing = freelancerPayments[payingPerson.profile_id];
      if (existing && !payingEvent) {
        // Full payment update
        await db.from('freelancer_payments').update({
          status: 'pago', total_amount: amountToPay,
          payment_date: paymentForm.payment_date, payment_method: paymentForm.payment_method,
          notes: paymentForm.notes || null,
        }).eq('id', existing.id);
      } else {
        // Insert new payment record (for individual event or new full payment)
        await db.from('freelancer_payments').insert({
          profile_id: payingPerson.profile_id, reference_month: `${selectedMonth}-01`,
          total_amount: amountToPay, status: 'pago',
          payment_date: paymentForm.payment_date, payment_method: paymentForm.payment_method,
          notes: `${notesPrefix}${paymentForm.notes || ''}`.trim() || null,
          created_by: profile?.id || null,
          empresa_id: empresa?.id || null,
        });
      }
      setShowPayDialog(false);
      setPayingPerson(null);
      setPayingEvent(null);
      await loadData();
      toast({ title: 'Sucesso', description: payingEvent ? `Pagamento do evento ${payingEvent.event_code} registrado.` : 'Pagamento registrado.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: formatBR(d, 'yyyy-MM'), label: formatBR(d, 'MMMM yyyy') });
    }
    // Also add future months up to end of current year
    for (let i = 1; i <= (11 - now.getMonth()); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      options.unshift({ value: formatBR(d, 'yyyy-MM'), label: formatBR(d, 'MMMM yyyy') });
    }
    return options;
  }, []);

  const exportCSV = () => {
    const rows = [
      ['Semana', 'Pgto Quarta', 'Nome', 'Cargo', 'CPF/ID', 'Eventos', 'Horas Trabalhadas', 'Total', 'Status', 'Data Pgto', 'Método'],
      ...weekGroups.flatMap(wg =>
        wg.persons.map(p => {
          const fp = freelancerPayments[p.profile_id];
          return [wg.label, formatBR(wg.paymentDate, 'dd/MM/yyyy'), p.name, ROLE_LABELS[p.role as AppRole] || p.role, p.professional_id || '', String(p.events.length),
            formatHours(p.totalMinutes), p.total.toFixed(2),
            fp?.status === 'pago' ? 'Pago' : 'Pendente', fp?.payment_date || '', fp?.payment_method || ''];
        })
      ),
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagamentos-freelancers-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPendente = staffSummary.filter(p => freelancerPayments[p.profile_id]?.status !== 'pago').reduce((s, p) => s + p.total, 0);
  const totalPago = staffSummary.filter(p => freelancerPayments[p.profile_id]?.status === 'pago').reduce((s, p) => s + p.total, 0);
  const totalHours = staffSummary.reduce((s, p) => s + p.totalMinutes, 0);

  if (authLoading || isLoading) {
    return <MainLayout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }
  if (!isAdmin) return null;

  const renderPersonCard = (person: PersonSummary, weekPayDate?: Date) => {
    const fp = freelancerPayments[person.profile_id];
    const isPaid = fp?.status === 'pago';
    const isExpanded = expandedId === person.profile_id;

    return (
      <Card key={person.profile_id}>
        <CardContent className="p-4">
          <button className="w-full text-left" onClick={() => setExpandedId(isExpanded ? null : person.profile_id)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">{person.name}</p>
                  <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[person.role as AppRole] || person.role}</Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{formatHours(person.totalMinutes)} • {person.events.length} evento(s)</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="font-bold text-lg text-primary">{fmt(person.total)}</p>
                  <Badge variant={isPaid ? 'default' : 'destructive'} className="text-[10px]">
                    {isPaid ? 'Pago' : 'Pendente'}
                  </Badge>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </button>

          {isExpanded && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground">EVENTOS ({person.events.length})</h4>
              {person.events.map((ev, i) => (
                <div key={i} className="p-2 bg-muted/50 rounded space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{ev.event_code}</span>
                    <span className="font-semibold">{ev.total > 0 ? fmt(ev.total) : '--'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>Saída: <strong className="text-foreground">{formatTime(ev.departure)}</strong></span>
                    <span>Chegada: <strong className="text-foreground">{formatTime(ev.arrival)}</strong></span>
                    <span>Duração: <strong className="text-foreground">{ev.minutes > 0 ? formatHours(ev.minutes) : '--'}</strong></span>
                  </div>
                  {ev.hourlyRate && ev.minutes > 0 ? (
                    <p className="text-[10px] text-muted-foreground">
                      {fmt(ev.hourlyRate)}/h × {formatHours(ev.minutes)} = {fmt(ev.total)}
                      {ev.extras > 0 && ` + Extras: ${fmt(ev.extras)}`}
                      {ev.discounts > 0 && ` - Desc: ${fmt(ev.discounts)}`}
                    </p>
                  ) : null}
                  {/* Per-event pay button when person has multiple events and is not fully paid */}
                  {!isPaid && person.events.length > 1 && ev.total > 0 && (
                    <Button size="sm" variant="outline" className="w-full text-xs mt-1" onClick={() => {
                      setPayingPerson(person);
                      setPayingEvent(ev);
                      setPaymentForm(prev => ({
                        ...prev,
                        payment_date: weekPayDate ? formatBR(weekPayDate, 'yyyy-MM-dd') : formatBR(new Date(), 'yyyy-MM-dd'),
                        notes: '',
                      }));
                      setShowPayDialog(true);
                    }}>
                      <Check className="h-3 w-3 mr-1" /> Pagar este evento ({fmt(ev.total)})
                    </Button>
                  )}
                </div>
              ))}

              {isPaid && fp && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-xs font-semibold text-primary">Pago em {fp.payment_date} via {fp.payment_method}</p>
                  {fp.notes && <p className="text-xs text-primary/80 mt-1">{fp.notes}</p>}
                </div>
              )}

              {!isPaid && (
                <Button size="sm" className="w-full" onClick={() => {
                  setPayingPerson(person);
                  setPayingEvent(null);
                  setPaymentForm(prev => ({
                    ...prev,
                    payment_date: weekPayDate ? formatBR(weekPayDate, 'yyyy-MM-dd') : formatBR(new Date(), 'yyyy-MM-dd'),
                  }));
                  setShowPayDialog(true);
                }}>
                  <Check className="h-4 w-4 mr-1" /> Pagar Tudo ({fmt(person.total)})
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/financial')}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-xl font-bold">Pagamentos - Freelancers</h1>
              <p className="text-sm text-muted-foreground">Pagamentos semanais às quartas-feiras</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
          </Select>

          <div className="flex rounded-2xl border bg-muted/30 p-1.5 gap-1">
            <button
              onClick={() => setViewMode('semana')}
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

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Mês</p>
            <p className="text-lg font-bold text-primary">{fmt(totalPago + totalPendente)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pago</p>
            <p className="text-lg font-bold text-emerald-600">{fmt(totalPago)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="text-lg font-bold text-orange-600">{fmt(totalPendente)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Horas Totais</p>
            <p className="text-lg font-bold text-foreground">{formatHours(totalHours)}</p>
          </CardContent></Card>
        </div>

        {staffSummary.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum evento encontrado neste período</CardContent></Card>
        ) : viewMode === 'semana' ? (
          /* === WEEKLY VIEW with infinite navigation === */
          (() => {
            const currentWeekData = getWeekFromOffset(weekOffset);
            const weekStart = currentWeekData.displayStart;
            const weekEnd = endOfDay(currentWeekData.displayEnd);

            // Filter persons/events for this specific week
            const personsInWeek: PersonSummary[] = staffSummary.map(person => {
              const weekEvents = person.events.filter(ev => {
                const d = new Date(ev.event_date);
                return d >= weekStart && d <= weekEnd;
              });
              if (weekEvents.length === 0) return null;
              return {
                ...person,
                events: weekEvents,
                total: weekEvents.reduce((s, e) => s + e.total, 0),
                totalMinutes: weekEvents.reduce((s, e) => s + e.minutes, 0),
              };
            }).filter(Boolean) as PersonSummary[];

            const weekTotalMinutes = personsInWeek.reduce((s, p) => s + p.totalMinutes, 0);
            const weekTotalAmount = personsInWeek.reduce((s, p) => s + p.total, 0);

            return (
              <div className="space-y-4">
                {/* Week navigation */}
                <div className="flex items-center justify-between py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl"
                    onClick={() => setWeekOffset(o => o - 1)}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div className="text-center">
                    <p className="font-bold text-lg">
                      {formatBR(currentWeekData.displayStart, "dd 'de' MMM")} - {formatBR(currentWeekData.displayEnd, "dd 'de' MMM")}
                    </p>
                    {weekOffset === 0 && (
                      <p className="text-sm text-muted-foreground">Semana atual</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl"
                    onClick={() => setWeekOffset(o => o + 1)}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>

                {/* Week summary */}
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Colaboradores</p>
                    <p className="text-lg font-bold">{personsInWeek.length}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Horas</p>
                    <p className="text-lg font-bold">{formatHours(weekTotalMinutes)}</p>
                  </CardContent></Card>
                  <Card className="border-primary/20 bg-primary/5"><CardContent className="p-3 text-center">
                    <p className="text-xs text-primary/80">Total Semana</p>
                    <p className="text-lg font-bold text-primary">{fmt(weekTotalAmount)}</p>
                  </CardContent></Card>
                </div>

                {/* Person cards */}
                {personsInWeek.length > 0 ? (
                  <div className="space-y-3">
                    {personsInWeek.map(person =>
                      renderPersonCard(person, currentWeekData.payDate)
                    )}
                  </div>
                ) : (
                  <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum colaborador nesta semana</CardContent></Card>
                )}
              </div>
            );
          })()
        ) : (
          /* === MONTHLY VIEW (original flat list) === */
          <div className="space-y-3">
            {staffSummary.map(person => renderPersonCard(person))}
          </div>
        )}

        {/* Pay Dialog */}
        <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{payingEvent ? 'Pagar Evento Individual' : 'Registrar Pagamento'}</DialogTitle></DialogHeader>
            {payingPerson && (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-bold">{payingPerson.name}</p>
                  {payingEvent ? (
                    <div className="mt-1">
                      <p className="text-sm font-semibold text-primary">{payingEvent.event_code}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-lg font-bold text-primary">{fmt(payingEvent.total)}</p>
                        <span className="text-xs text-muted-foreground">{formatHours(payingEvent.minutes)} trabalhadas</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Total do colaborador na semana: {fmt(payingPerson.total)}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-lg font-bold text-primary">{fmt(payingPerson.total)}</p>
                      <span className="text-xs text-muted-foreground">{formatHours(payingPerson.totalMinutes)} trabalhadas • {payingPerson.events.length} evento(s)</span>
                    </div>
                  )}
                </div>
                <div><Label>Data do Pagamento</Label><Input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))} /></div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={paymentForm.payment_method} onValueChange={v => setPaymentForm(p => ({ ...p, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Observações</Label><Input value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} placeholder="Opcional" /></div>
                <Button className="w-full" onClick={markAsPaid}><Check className="h-4 w-4 mr-1" /> {payingEvent ? `Confirmar Pagamento (${fmt(payingEvent.total)})` : 'Confirmar Pagamento Total'}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
