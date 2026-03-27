import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign, TrendingUp, TrendingDown, Users, Pill, Package, AlertCircle, ArrowRight, Filter, Download, FileText, Fuel } from 'lucide-react';
import { startOfMonth, endOfMonth, parse, parseISO, differenceInMinutes } from 'date-fns';
import { formatBR } from '@/utils/dateFormat';

const db = supabase as any;
const DEFAULT_RATE = 18.60;
const DIESEL_PRICE = 6.25;

interface FinancialSummary {
  totalRevenue: number;
  totalCosts: number;
  totalStaffCosts: number;
  totalMedicationCosts: number;
  totalMaterialCosts: number;
  totalOtherCosts: number;
  totalFuelCosts: number;
  grossProfit: number;
  totalPending: number;
  totalPaid: number;
  pendingFreelancers: number;
  pendingReceivables: number;
}

export default function Financial() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => formatBR(new Date(), 'yyyy-MM'));
  const [selectedContractor, setSelectedContractor] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [summary, setSummary] = useState<FinancialSummary>({
    totalRevenue: 0, totalCosts: 0, totalStaffCosts: 0, totalMedicationCosts: 0,
    totalMaterialCosts: 0, totalOtherCosts: 0, totalFuelCosts: 0, grossProfit: 0,
    totalPending: 0, totalPaid: 0, pendingFreelancers: 0, pendingReceivables: 0,
  });
  const [events, setEvents] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [eventFinances, setEventFinances] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/');
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadContractors();
      loadFinancialData();
    }
  }, [selectedMonth, isAdmin]);

  const loadContractors = async () => {
    const { data } = await db.from('contractors').select('id, name').eq('is_active', true).order('name');
    setContractors(data || []);
  };

  const loadFinancialData = async () => {
    setIsLoading(true);
    try {
      const monthDate = parse(selectedMonth, 'yyyy-MM', new Date());
      const start = startOfMonth(monthDate).toISOString();
      const end = endOfMonth(monthDate).toISOString();

      // Fetch events by departure_time or created_at within month
      const { data: rawEvents } = await supabase
        .from('events')
        .select('id, code, status, location, created_at, departure_time, arrival_time, ambulance_id')
        .order('created_at', { ascending: false });

      // Filter events that belong to the selected month
      const eventsData = (rawEvents || []).filter(ev => {
        const refDate = ev.departure_time || ev.created_at;
        const d = new Date(refDate);
        return d >= new Date(start) && d <= new Date(end);
      });

      const eventIds = (eventsData || []).map(e => e.id);
      setEvents(eventsData || []);

      if (eventIds.length === 0) {
        setSummary({ totalRevenue: 0, totalCosts: 0, totalStaffCosts: 0, totalMedicationCosts: 0, totalMaterialCosts: 0, totalOtherCosts: 0, totalFuelCosts: 0, grossProfit: 0, totalPending: 0, totalPaid: 0, pendingFreelancers: 0, pendingReceivables: 0 });
        setEventFinances({});
        setIsLoading(false);
        return;
      }

      const [
        { data: finances },
        { data: staffCosts },
        { data: otherCosts },
        { data: costItems },
        { data: transports },
        { data: participants },
        { data: checklistItems },
        { data: ambulancesData },
      ] = await Promise.all([
        db.from('event_finances').select('*').in('event_id', eventIds),
        db.from('event_staff_costs').select('*').in('event_id', eventIds),
        db.from('event_other_costs').select('*').in('event_id', eventIds),
        db.from('cost_items').select('*').eq('is_active', true),
        supabase.from('transport_records').select('event_id, departure_time, arrival_time, initial_km, final_km').in('event_id', eventIds),
        supabase.from('event_participants').select('event_id, profile_id').in('event_id', eventIds),
        supabase.from('checklist_items').select('item_name, item_type, notes, cost_item_id, event_id').in('event_id', eventIds).in('item_type', ['consumo_medicamentos', 'materiais']),
        supabase.from('ambulances').select('id, km_per_liter'),
      ]);

      // Build transport minutes per event
      const transportByEvent = new Map<string, number>();
      (transports || []).forEach((t: any) => {
        if (!t.departure_time || !t.arrival_time) return;
        try {
          const dep = parseISO(t.departure_time);
          let arr = parseISO(t.arrival_time);
          if (arr < dep) arr = new Date(arr.getTime() + 24 * 60 * 60 * 1000);
          const mins = differenceInMinutes(arr, dep);
          if (mins > 0) transportByEvent.set(t.event_id, mins);
        } catch {}
      });
      // Fallback to event times
      (eventsData || []).forEach((ev: any) => {
        if (!transportByEvent.has(ev.id) && ev.departure_time && ev.arrival_time) {
          try {
            const dep = parseISO(ev.departure_time);
            let arr = parseISO(ev.arrival_time);
            if (arr < dep) arr = new Date(arr.getTime() + 24 * 60 * 60 * 1000);
            const mins = differenceInMinutes(arr, dep);
            if (mins > 0) transportByEvent.set(ev.id, mins);
          } catch {}
        }
      });

      // Staff cost map by event+profile
      const staffCostMap = new Map<string, any>();
      (staffCosts || []).forEach((sc: any) => { staffCostMap.set(`${sc.event_id}_${sc.profile_id}`, sc); });

      // Calculate total staff costs using hours × rate
      let totalStaffCosts = 0;
      (participants || []).forEach((p: any) => {
        const minutes = transportByEvent.get(p.event_id) || 0;
        const sc = staffCostMap.get(`${p.event_id}_${p.profile_id}`);
        const rate = sc && Number(sc.base_value) > 0 ? Number(sc.base_value) : DEFAULT_RATE;
        const extras = sc ? Number(sc.extras) || 0 : 0;
        const discounts = sc ? Number(sc.discounts) || 0 : 0;
        totalStaffCosts += (minutes / 60) * rate + extras - discounts;
      });

      // Insumo costs from checklist_items
      const costItemIdMap = new Map((costItems || []).map((c: any) => [c.id, Number(c.unit_cost)]));
      const costItemNameMap = new Map((costItems || []).map((c: any) => [c.name.toLowerCase(), Number(c.unit_cost)]));
      let medCosts = 0, matCosts = 0;
      (checklistItems || []).forEach((ci: any) => {
        const q = parseInt(ci.notes || '0') || 0;
        if (q <= 0) return;
        const uc: number = ci.cost_item_id
          ? Number(costItemIdMap.get(ci.cost_item_id) ?? 0)
          : Number(costItemNameMap.get(String(ci.item_name || '').toLowerCase()) ?? 0);
        if (ci.item_type === 'consumo_medicamentos') medCosts += uc * q;
        else matCosts += uc * q;
      });

      // Fuel costs: km driven × diesel price / km_per_liter
      const ambulanceMap = new Map((ambulancesData || []).map((a: any) => [a.id, Number(a.km_per_liter) || 0]));
      let totalFuelCosts = 0;
      (eventsData || []).forEach((ev: any) => {
        if (!ev.ambulance_id) return;
        const kmPerLiter = ambulanceMap.get(ev.ambulance_id);
        if (!kmPerLiter || kmPerLiter <= 0) return;
        // Find transport record for this event
        const tr = (transports || []).find((t: any) => t.event_id === ev.id);
        if (!tr || !tr.initial_km || !tr.final_km) return;
        const kmDriven = Number(tr.final_km) - Number(tr.initial_km);
        if (kmDriven > 0) {
          totalFuelCosts += (kmDriven / kmPerLiter) * DIESEL_PRICE;
        }
      });

      const financeMap: Record<string, any> = {};
      (finances || []).forEach((f: any) => { financeMap[f.event_id] = f; });
      setEventFinances(financeMap);

      const financeIds = (finances || []).map((f: any) => f.id);
      let payments: any[] = [];
      if (financeIds.length > 0) {
        const { data: p } = await db.from('event_finance_payments').select('*').in('event_finance_id', financeIds).eq('cancelled', false);
        payments = p || [];
      }

      const totalRevenue = (finances || []).reduce((sum: number, f: any) => sum + Number(f.contract_value) - Number(f.discounts) + Number(f.additions), 0);
      const totalOtherCosts = (otherCosts || []).reduce((sum: number, o: any) => sum + Number(o.amount), 0);

      // Calculate paid: from payment records + auto-paid events (status='pago' without records)
      let totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      (finances || []).forEach((f: any) => {
        if (f.status === 'pago') {
          const finPayments = payments.filter((p: any) => p.event_finance_id === f.id);
          if (finPayments.length === 0) {
            totalPaid += Number(f.contract_value) - Number(f.discounts) + Number(f.additions);
          }
        }
      });

      const totalCosts = totalStaffCosts + medCosts + matCosts + totalOtherCosts + totalFuelCosts;

      // Pending freelancers - those not yet paid for this month
      const { data: paidFP } = await db.from('freelancer_payments').select('total_amount').eq('reference_month', `${selectedMonth}-01`).eq('status', 'pago').eq('cancelled', false);
      const paidFreelancerTotal = (paidFP || []).reduce((s: number, p: any) => s + Number(p.total_amount), 0);
      const pendingFreelancers = totalStaffCosts - paidFreelancerTotal;

      const pendingReceivables = totalRevenue - totalPaid;

      setSummary({
        totalRevenue, totalCosts, totalStaffCosts, totalMedicationCosts: medCosts,
        totalMaterialCosts: matCosts, totalOtherCosts, totalFuelCosts,
        grossProfit: totalRevenue - totalCosts,
        totalPending: Math.max(0, pendingReceivables), totalPaid,
        pendingFreelancers: Math.max(0, pendingFreelancers),
        pendingReceivables: Math.max(0, pendingReceivables),
      });
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: formatBR(d, 'yyyy-MM'), label: formatBR(d, 'MMMM yyyy') });
    }
    return options;
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (selectedContractor !== 'all') {
        const fin = eventFinances[ev.id];
        if (!fin || fin.contractor_id !== selectedContractor) return false;
      }
      if (selectedStatus !== 'all') {
        const fin = eventFinances[ev.id];
        if (!fin) return selectedStatus === 'pendente';
        if (fin.status !== selectedStatus) return false;
      }
      return true;
    });
  }, [events, selectedContractor, selectedStatus, eventFinances]);

  const exportCSV = () => {
    const rows = [
      ['Evento', 'Local', 'Status', 'Receita', 'Custo Equipe', 'Outros Custos', 'Lucro'],
      ...filteredEvents.map(ev => {
        const fin = eventFinances[ev.id];
        const revenue = fin ? Number(fin.contract_value) - Number(fin.discounts) + Number(fin.additions) : 0;
        return [ev.code, ev.location || '', ev.status, revenue.toFixed(2), '0', '0', revenue.toFixed(2)];
      }),
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return <MainLayout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }

  if (!isAdmin) return null;

  const topCards = [
    { title: 'Receita do Mês', value: summary.totalRevenue, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { title: 'Custos do Mês', value: summary.totalCosts, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
    { title: 'Lucro Bruto', value: summary.grossProfit, icon: DollarSign, color: summary.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600', bg: summary.grossProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30' },
  ];

  const detailCards = [
    { title: 'Pago Freelancers', value: summary.totalStaffCosts, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { title: 'Medicamentos', value: summary.totalMedicationCosts, icon: Pill, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { title: 'Materiais', value: summary.totalMaterialCosts, icon: Package, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { title: 'Outros Custos', value: summary.totalOtherCosts, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
    { title: 'Combustível', value: summary.totalFuelCosts, icon: Fuel, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
    { title: 'Pend. Freelancers', value: summary.pendingFreelancers, icon: Users, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30' },
    { title: 'A Receber', value: summary.pendingReceivables, icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30' },
    { title: 'Recebido', value: summary.totalPaid, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Financeiro</h1>
              <p className="text-sm text-muted-foreground">Controle financeiro de eventos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedContractor} onValueChange={setSelectedContractor}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Contratante" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Contratantes</SelectItem>
              {contractors.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="parcial">Parcial</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Top 3 Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {topCards.map((card) => (
                <Card key={card.title}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg ${card.bg}`}>
                        <card.icon className={`h-4 w-4 ${card.color}`} />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">{card.title}</span>
                    </div>
                    <p className={`text-xl font-bold ${card.color}`}>{formatCurrency(card.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Detail Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {detailCards.map((card) => (
                <Card key={card.title}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1 rounded ${card.bg}`}>
                        <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground">{card.title}</span>
                    </div>
                    <p className={`text-sm font-bold ${card.color}`}>{formatCurrency(card.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Events */}
            <Card>
              <CardHeader><CardTitle className="text-base">Eventos do Mês ({filteredEvents.length})</CardTitle></CardHeader>
              <CardContent>
                {filteredEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum evento neste mês</p>
                ) : (
                  <div className="space-y-2">
                    {filteredEvents.map((event) => {
                      const fin = eventFinances[event.id];
                      const revenue = fin ? Number(fin.contract_value) - Number(fin.discounts) + Number(fin.additions) : 0;
                      return (
                        <button key={event.id} onClick={() => navigate(`/admin/financial/event/${event.id}`)}
                          className="w-full flex items-center justify-between p-3 rounded-xl border hover:bg-muted/50 transition-colors text-left">
                          <div>
                            <p className="text-sm font-bold">{event.code}</p>
                            <p className="text-xs text-muted-foreground">{event.location || 'Sem local'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {revenue > 0 && <span className="text-xs font-semibold text-emerald-600">{formatCurrency(revenue)}</span>}
                            <Badge variant="outline" className="text-[10px]">{fin?.status || 'sem dados'}</Badge>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button variant="outline" className="h-auto py-4" onClick={() => navigate('/admin/financial/payments')}>
                <Users className="h-5 w-5 mr-2" />
                <div className="text-left"><p className="font-semibold text-sm">Pagamentos</p><p className="text-xs text-muted-foreground">Freelancers</p></div>
              </Button>
              <Button variant="outline" className="h-auto py-4" onClick={() => navigate('/admin/financial/receivables')}>
                <TrendingUp className="h-5 w-5 mr-2" />
                <div className="text-left"><p className="font-semibold text-sm">Recebimentos</p><p className="text-xs text-muted-foreground">Contratantes</p></div>
              </Button>
              <Button variant="outline" className="h-auto py-4" onClick={() => navigate('/admin/financial/costs')}>
                <Package className="h-5 w-5 mr-2" />
                <div className="text-left"><p className="font-semibold text-sm">Tabela de Custos</p><p className="text-xs text-muted-foreground">Medicamentos e Materiais</p></div>
              </Button>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
