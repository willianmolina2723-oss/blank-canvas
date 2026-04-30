import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, DollarSign, Users, Package, Plus, Save, Pill, Download, FileText, Clock, Fuel, RefreshCw, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { differenceInMinutes, parseISO } from 'date-fns';
import { useDefaultRates } from '@/hooks/useDefaultRates';
import { recomputeAllAssignmentsForEvent } from '@/utils/computePaidHours';
import { formatBR } from '@/utils/dateFormat';
import { useEventDates } from '@/hooks/useEventDates';
import { EventDateSelector } from '@/components/events/EventDateSelector';

const db = supabase as any;

export default function EventFinancial() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading, profile } = useAuth();
  const { toast } = useToast();
  const { getRate: getDefaultRate } = useDefaultRates();
  const { dates, activeId, activeDate, setActiveId } = useEventDates(id);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [contractors, setContractors] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [hasFullTransport, setHasFullTransport] = useState(false);
  const [insumoCosts, setInsumoCosts] = useState<{ medications: any[], materials: any[], totalMed: number, totalMat: number }>({ medications: [], materials: [], totalMed: 0, totalMat: 0 });
  const [transportMinutes, setTransportMinutes] = useState(0);
  const [fuelCost, setFuelCost] = useState({ kmDriven: 0, liters: 0, cost: 0, kmPerLiter: 0 });

  const [finance, setFinance] = useState({
    id: '', contractor_id: '', contract_value: 0, discounts: 0, additions: 0,
    payment_method: '', due_date: '', status: 'pendente', notes: '',
  });

  const [staffCosts, setStaffCosts] = useState<any[]>([]);
  const [otherCosts, setOtherCosts] = useState<any[]>([]);
  const [newOtherCost, setNewOtherCost] = useState({ category: '', description: '', amount: 0 });
  const [payments, setPayments] = useState<any[]>([]);
  const [newPayment, setNewPayment] = useState({ amount: 0, payment_date: '', payment_method: '', notes: '' });

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/');
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (id && isAdmin) loadData();
  }, [id, isAdmin]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [
        { data: eventData },
        { data: contractorsData },
        { data: participantsData },
        { data: financeData },
        { data: staffData },
        { data: otherData },
        { data: costItems },
        { data: transportData },
        { data: assignmentsData },
      ] = await Promise.all([
        supabase.from('events').select('*, ambulance:ambulances(*)').eq('id', id!).single(),
        db.from('contractors').select('*').eq('is_active', true).order('name'),
        supabase.from('event_participants').select('*, profile:profiles(*)').eq('event_id', id!),
        db.from('event_finances').select('*').eq('event_id', id!).maybeSingle(),
        db.from('event_staff_costs').select('*, profile:profiles(full_name, professional_id)').eq('event_id', id!),
        db.from('event_other_costs').select('*').eq('event_id', id!),
        db.from('cost_items').select('*').eq('is_active', true),
        supabase.from('transport_records').select('departure_time, arrival_time').eq('event_id', id!).maybeSingle(),
        db.from('event_assignments').select('*').eq('event_id', id!),
      ]);
      setAssignments(assignmentsData || []);
      setHasFullTransport(!!(transportData?.departure_time && transportData?.arrival_time));

      // Calculate transport duration for staff cost
      let minutes = 0;
      const dep = transportData?.departure_time || eventData?.departure_time;
      const arr = transportData?.arrival_time || eventData?.arrival_time;
      if (dep && arr) {
        try {
          const depDate = parseISO(dep);
          let arrDate = parseISO(arr);
          if (arrDate < depDate) arrDate = new Date(arrDate.getTime() + 24 * 60 * 60 * 1000);
          minutes = differenceInMinutes(arrDate, depDate);
          if (minutes < 0) minutes = 0;
        } catch {}
      }
      setTransportMinutes(minutes);

      // Calculate fuel cost from checklist KM data
      const DIESEL_PRICE = 6.25;
      const { data: kmItems } = await supabase
        .from('checklist_items')
        .select('item_type, notes')
        .eq('event_id', id!)
        .in('item_type', ['km_combustivel_inicio', 'km_combustivel_fim']);

      let initialKm = 0;
      let finalKm = 0;
      (kmItems || []).forEach((item: any) => {
        try {
          const parsed = JSON.parse(item.notes || '{}');
          if (item.item_type === 'km_combustivel_inicio') initialKm = Number(parsed.km_inicial) || 0;
          if (item.item_type === 'km_combustivel_fim') finalKm = Number(parsed.km_final) || 0;
        } catch {}
      });

      const kmDriven = finalKm > initialKm ? finalKm - initialKm : 0;
      const kmPerLiter = Number((eventData as any)?.ambulance?.km_per_liter) || 0;
      if (kmDriven > 0 && kmPerLiter > 0) {
        const liters = kmDriven / kmPerLiter;
        setFuelCost({ kmDriven, liters, cost: liters * DIESEL_PRICE, kmPerLiter });
      } else {
        setFuelCost({ kmDriven, liters: 0, cost: 0, kmPerLiter });
      }
      setEvent(eventData);
      setContractors(contractorsData || []);
      setParticipants(participantsData || []);
      setStaffCosts(staffData || []);
      setOtherCosts(otherData || []);

      if (financeData) {
        setFinance({
          id: financeData.id, contractor_id: financeData.contractor_id || '',
          contract_value: Number(financeData.contract_value), discounts: Number(financeData.discounts),
          additions: Number(financeData.additions), payment_method: financeData.payment_method || '',
          due_date: financeData.due_date || '', status: financeData.status, notes: financeData.notes || '',
        });
        const { data: paymentsData } = await db.from('event_finance_payments').select('*').eq('event_finance_id', financeData.id).order('payment_date');
        setPayments(paymentsData || []);
      }

      // Load insumo costs from checklist_items (consumo_medicamentos & materiais)
      const costItemMap = new Map((costItems || []).map((c: any) => [c.id, Number(c.unit_cost)]));
      const costItemNameMap = new Map((costItems || []).map((c: any) => [c.name.toLowerCase(), Number(c.unit_cost)]));

      const { data: checklistItems } = await supabase
        .from('checklist_items')
        .select('item_name, item_type, notes, cost_item_id')
        .eq('event_id', id!)
        .in('item_type', ['consumo_medicamentos', 'materiais']);

      const medItems: any[] = [];
      const matItems: any[] = [];

      (checklistItems || []).forEach((ci: any) => {
        let q = 0;
        try {
          const parsed = JSON.parse(ci.notes || '0');
          q = typeof parsed === 'object' ? (parsed.quantity || 0) : (parseInt(ci.notes || '0') || 0);
        } catch {
          q = parseInt(ci.notes || '0') || 0;
        }
        if (q <= 0) return;
        const uc: number = ci.cost_item_id
          ? Number(costItemMap.get(ci.cost_item_id) ?? 0)
          : Number(costItemNameMap.get(String(ci.item_name || '').toLowerCase()) ?? 0);
        const item = { name: ci.item_name, qty: q, unitCost: uc, total: uc * q };
        if (ci.item_type === 'consumo_medicamentos') medItems.push(item);
        else matItems.push(item);
      });

      setInsumoCosts({
        medications: medItems, materials: matItems,
        totalMed: medItems.reduce((s: number, i: any) => s + i.total, 0),
        totalMat: matItems.reduce((s: number, i: any) => s + i.total, 0),
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveFinance = async () => {
    setIsSaving(true);
    try {
      const payload = {
        event_id: id!, contractor_id: finance.contractor_id || null,
        contract_value: finance.contract_value, discounts: finance.discounts,
        additions: finance.additions, payment_method: finance.payment_method || null,
        due_date: finance.due_date || null, status: finance.status,
        notes: finance.notes || null, created_by: profile?.id || null,
        empresa_id: profile?.empresa_id || null,
      };
      if (finance.id) {
        const { error } = await db.from('event_finances').update(payload).eq('id', finance.id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from('event_finances').insert(payload).select().single();
        if (error) throw error;
        setFinance(prev => ({ ...prev, id: data.id }));
      }
      toast({ title: 'Salvo', description: 'Dados financeiros salvos.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveStaffCost = async (profileId: string, data: any) => {
    try {
      const existing = staffCosts.find((s: any) => s.profile_id === profileId);
      const payload = {
        event_id: id!, profile_id: profileId,
        payment_type: data.payment_type || 'por_evento',
        base_value: Number(data.base_value) || 0, extras: Number(data.extras) || 0,
        discounts: Number(data.discounts) || 0, notes: data.notes || null,
        empresa_id: profile?.empresa_id || null,
      };
      if (existing) {
        await db.from('event_staff_costs').update(payload).eq('id', existing.id);
      } else {
        await db.from('event_staff_costs').insert(payload);
      }
      await loadData();
      toast({ title: 'Salvo' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const addOtherCost = async () => {
    if (!newOtherCost.category || newOtherCost.amount <= 0) return;
    try {
      await db.from('event_other_costs').insert({
        event_id: id!, category: newOtherCost.category,
        description: newOtherCost.description || null, amount: newOtherCost.amount,
        created_by: profile?.id || null, empresa_id: profile?.empresa_id || null,
      });
      setNewOtherCost({ category: '', description: '', amount: 0 });
      await loadData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const addPayment = async () => {
    if (!finance.id || newPayment.amount <= 0 || !newPayment.payment_date) return;
    try {
      await db.from('event_finance_payments').insert({
        event_finance_id: finance.id, amount: newPayment.amount,
        payment_date: newPayment.payment_date, payment_method: newPayment.payment_method || null,
        notes: newPayment.notes || null, created_by: profile?.id || null,
        empresa_id: profile?.empresa_id || null,
      });
      setNewPayment({ amount: 0, payment_date: '', payment_method: '', notes: '' });
      await loadData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  // Soma minutos pagos de TODAS as datas para um (profile, role)
  const getAssignmentMinutes = (profileId: string, role: string): number | null => {
    const rows = assignments.filter((x: any) => x.profile_id === profileId && x.role === role);
    if (rows.length === 0) return null;
    let total = 0;
    let any = false;
    for (const r of rows) {
      if (r.paid_duration_minutes != null) {
        total += Number(r.paid_duration_minutes) || 0;
        any = true;
      }
    }
    return any ? total : null;
  };

  const calcStaffTotal = (c: any, participant?: any) => {
    const profileRate = Number(participant?.profile?.valor_hora) || 0;
    const role = participant?.role || '';
    const fallbackRate = getDefaultRate(role, profileRate);
    const rate = Number(c.base_value) > 0 ? Number(c.base_value) : fallbackRate;
    const assignedMin = participant ? getAssignmentMinutes(participant.profile_id, role) : null;
    const minutes = assignedMin != null ? assignedMin : transportMinutes;
    return (minutes / 60) * rate + Number(c.extras) - Number(c.discounts);
  };

  const totalInsumos = insumoCosts.totalMed + insumoCosts.totalMat;
  const cobrarInsumos = !!event?.cobrar_materiais_medicamentos;
  const insumosRevenue = cobrarInsumos ? totalInsumos : 0;
  const baseContractValue = finance.contract_value - finance.discounts + finance.additions;
  const finalValue = baseContractValue + insumosRevenue;
  const totalStaff = staffCosts.length > 0
    ? staffCosts.reduce((s: number, c: any) => {
        const pt = participants.find((p: any) => p.profile_id === c.profile_id);
        return s + calcStaffTotal(c, pt);
      }, 0)
    : participants.reduce((s: number, p: any) => {
        const profileRate = Number(p.profile?.valor_hora) || 0;
        const rate = getDefaultRate(p.role, profileRate);
        const assignedMin = getAssignmentMinutes(p.profile_id, p.role);
        const minutes = assignedMin != null ? assignedMin : transportMinutes;
        return s + (minutes / 60) * rate;
      }, 0);
  const totalOther = otherCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalPaid = payments.filter((p: any) => !p.cancelled).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalFuel = fuelCost.cost;
  // Insumos sempre saem como custo; quando cobrados, entram também como receita (efeito líquido = 0 no lucro)
  const grossProfit = finalValue - totalStaff - totalOther - totalInsumos - totalFuel;

  const exportEventCSV = () => {
    const rows = [
      ['Categoria', 'Descrição', 'Valor'],
      ['Receita', 'Valor do Contrato', String(finance.contract_value)],
      ['Receita', 'Descontos', String(-finance.discounts)],
      ['Receita', 'Adicionais', String(finance.additions)],
      ['Receita', 'Valor Final', String(finalValue)],
      ...staffCosts.map((s: any) => { const pt = participants.find((p: any) => p.profile_id === s.profile_id); const profileRate = Number(pt?.profile?.valor_hora) || 0; const r = Number(s.base_value) > 0 ? Number(s.base_value) : getDefaultRate(pt?.role || '', profileRate); const min = (pt && getAssignmentMinutes(pt.profile_id, pt.role)) ?? transportMinutes; return ['Equipe', s.profile?.full_name || 'N/A', String((min / 60) * r + Number(s.extras) - Number(s.discounts))]; }),
      ...insumoCosts.medications.map((m: any) => ['Medicamento', `${m.name} (${m.qty}x)`, String(m.total)]),
      ...insumoCosts.materials.map((m: any) => ['Material', `${m.name} (${m.qty}x)`, String(m.total)]),
      ...otherCosts.map((c: any) => ['Outros', c.category, String(Number(c.amount))]),
      ...(fuelCost.cost > 0 ? [['Combustível', `${fuelCost.kmDriven}km ÷ ${fuelCost.kmPerLiter}km/l = ${fuelCost.liters.toFixed(2)}L × R$6,25`, String(fuelCost.cost.toFixed(2))]] : []),
      ['', 'LUCRO BRUTO', String(grossProfit)],
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evento-${event?.code || id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || isLoading) {
    return <MainLayout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }
  if (!isAdmin || !event) return null;

  const costCategories = ['Combustível', 'Pedágio', 'Alimentação', 'Estacionamento', 'Outros'];

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-xl font-bold">Financeiro - {event.code}</h1>
              <p className="text-sm text-muted-foreground">{event.location || 'Sem local'}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportEventCSV}>
            <Download className="h-4 w-4 mr-1" /> Exportar
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {[
            { label: 'Receita', value: finalValue, cls: 'text-emerald-600' },
            { label: 'Equipe', value: totalStaff, cls: 'text-blue-600' },
            { label: 'Insumos', value: totalInsumos, cls: 'text-purple-600' },
            { label: 'Combustível', value: totalFuel, cls: 'text-orange-600' },
            { label: 'Outros', value: totalOther, cls: 'text-red-600' },
            { label: 'Lucro', value: grossProfit, cls: grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
          ].map(c => (
            <Card key={c.label}><CardContent className="p-2 text-center">
              <p className="text-[10px] text-muted-foreground truncate">{c.label}</p>
              <p className={`text-sm font-bold ${c.cls} truncate`} title={fmt(c.value)}>{fmt(c.value)}</p>
            </CardContent></Card>
          ))}
        </div>

        {/* Receita */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Receita</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Contratante</Label>
                <Select value={finance.contractor_id} onValueChange={(v) => setFinance(p => ({ ...p, contractor_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{contractors.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Valor do Contrato</Label><Input type="number" step="0.01" value={finance.contract_value} onChange={e => setFinance(p => ({ ...p, contract_value: Number(e.target.value) }))} /></div>
              <div><Label>Descontos</Label><Input type="number" step="0.01" value={finance.discounts} onChange={e => setFinance(p => ({ ...p, discounts: Number(e.target.value) }))} /></div>
              <div><Label>Adicionais</Label><Input type="number" step="0.01" value={finance.additions} onChange={e => setFinance(p => ({ ...p, additions: Number(e.target.value) }))} /></div>
              <div>
                <Label>Valor Final {cobrarInsumos && insumosRevenue > 0 && <span className="text-xs text-emerald-600 font-normal">(+ {fmt(insumosRevenue)} insumos)</span>}</Label>
                <Input readOnly value={fmt(finalValue)} className="bg-muted font-semibold" />
              </div>
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={finance.payment_method} onValueChange={(v) => setFinance(p => ({ ...p, payment_method: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_vista">À Vista</SelectItem>
                    <SelectItem value="30_dias">30 Dias</SelectItem>
                    <SelectItem value="parcelado">Parcelado</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data de Vencimento</Label><Input type="date" value={finance.due_date} onChange={e => setFinance(p => ({ ...p, due_date: e.target.value }))} /></div>
              <div>
                <Label>Status</Label>
                <Select value={finance.status} onValueChange={(v) => setFinance(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Observações</Label><Textarea value={finance.notes} onChange={e => setFinance(p => ({ ...p, notes: e.target.value }))} /></div>
            <Button onClick={saveFinance} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Salvar Receita
            </Button>

          </CardContent>
        </Card>

        {/* Custos da Equipe */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Custos da Equipe ({fmt(totalStaff)})</CardTitle>
            <Button size="sm" variant="outline" onClick={async () => { await recomputeAllAssignmentsForEvent(id!); await loadData(); toast({ title: 'Horas recalculadas' }); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recalcular horas
            </Button>
          </CardHeader>
          <CardContent>
            {assignments.some((a: any) => a.recebe_deslocamento_resolvido && !hasFullTransport) && (
              <Alert className="mb-3 border-amber-500/30 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-xs">
                  Deslocamento ativo, mas faltam horários reais de transporte — usando horário previsto.
                </AlertDescription>
              </Alert>
            )}
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum participante</p>
            ) : (
              <div className="space-y-3">
                {participants.map((p: any) => {
                  const existing = staffCosts.find((s: any) => s.profile_id === p.profile_id);
                  const d = existing || { payment_type: 'por_hora', base_value: 0, extras: 0, discounts: 0 };
                  const profileRate = Number(p.profile?.valor_hora) || 0;
                  const rate = Number(d.base_value) > 0 ? Number(d.base_value) : getDefaultRate(p.role, profileRate);
                  const aRows = assignments.filter((x: any) => x.profile_id === p.profile_id && x.role === p.role);
                  const totalAssignedMin = aRows.reduce((s: number, r: any) => s + (Number(r.paid_duration_minutes) || 0), 0);
                  const minutes = aRows.length > 0 ? totalAssignedMin : transportMinutes;
                  const personTotal = (minutes / 60) * rate + Number(d.extras) - Number(d.discounts);
                  const hours = minutes / 60;
                  const fmtDT = (v: string | null) => { try { return v ? formatBR(new Date(v), 'dd/MM HH:mm') : '—'; } catch { return '—'; } };
                  const anyDeslocamento = aRows.some((r: any) => r.recebe_deslocamento_resolvido);
                  return (
                    <div key={p.id} className="p-3 border rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">{p.profile?.full_name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{p.role}</Badge>
                            {p.profile?.professional_id && <span className="text-[10px] text-muted-foreground">{p.profile.professional_id}</span>}
                            {aRows.length > 0 && (anyDeslocamento
                              ? <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Com deslocamento</Badge>
                              : <Badge variant="outline" className="text-[10px]">Sem deslocamento</Badge>
                            )}
                          </div>
                          {aRows.length > 0 && (
                            <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                              {aRows.map((r: any, idx: number) => {
                                const dateRow = dates.find(dd => dd.id === r.event_date_id);
                                const dateLabel = dateRow ? formatBR(dateRow.start_time, 'dd/MM') : (aRows.length > 1 ? `Turno ${idx + 1}` : '');
                                return (
                                  <div key={r.id} className="flex flex-wrap gap-x-2">
                                    {dateLabel && <span className="font-semibold">{dateLabel}:</span>}
                                    <span>Prev {fmtDT(r.scheduled_start)}→{fmtDT(r.scheduled_end)}</span>
                                    <span>• Pago {fmtDT(r.paid_start)}→{fmtDT(r.paid_end)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {minutes > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmt(rate)}/h × {hours.toFixed(2)}h = {fmt(personTotal)}
                            </p>
                          )}
                        </div>
                        <p className="font-bold text-sm">{fmt(personTotal)}</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">Tipo</Label>
                          <Select defaultValue={d.payment_type} onValueChange={(v) => saveStaffCost(p.profile_id, { ...d, payment_type: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="por_evento">Por evento</SelectItem>
                              <SelectItem value="por_diaria">Por diária</SelectItem>
                              <SelectItem value="por_hora">Por hora</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label className="text-xs">Valor Base</Label><Input type="number" step="0.01" className="h-8 text-xs" defaultValue={d.base_value} onBlur={e => saveStaffCost(p.profile_id, { ...d, base_value: e.target.value })} /></div>
                        <div><Label className="text-xs">Extras</Label><Input type="number" step="0.01" className="h-8 text-xs" defaultValue={d.extras} onBlur={e => saveStaffCost(p.profile_id, { ...d, extras: e.target.value })} /></div>
                        <div><Label className="text-xs">Descontos</Label><Input type="number" step="0.01" className="h-8 text-xs" defaultValue={d.discounts} onBlur={e => saveStaffCost(p.profile_id, { ...d, discounts: e.target.value })} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Custos de Insumos */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Pill className="h-4 w-4" /> Custos de Insumos ({fmt(totalInsumos)})</CardTitle></CardHeader>
          <CardContent>
            {insumoCosts.medications.length === 0 && insumoCosts.materials.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum insumo registrado neste evento</p>
            ) : (
              <div className="space-y-4">
                {insumoCosts.medications.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground mb-2">MEDICAMENTOS ({fmt(insumoCosts.totalMed)})</h4>
                    {insumoCosts.medications.map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 border rounded-lg mb-1">
                        <div>
                          <p className="text-sm font-semibold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.qty}x • {fmt(m.unitCost)}/un</p>
                        </div>
                        <p className="font-bold text-sm text-purple-600">{fmt(m.total)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {insumoCosts.materials.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground mb-2">MATERIAIS ({fmt(insumoCosts.totalMat)})</h4>
                    {insumoCosts.materials.map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 border rounded-lg mb-1">
                        <div>
                          <p className="text-sm font-semibold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.qty}x • {fmt(m.unitCost)}/un</p>
                        </div>
                        <p className="font-bold text-sm text-amber-600">{fmt(m.total)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">* Custos calculados automaticamente a partir dos insumos registrados no relatório de despacho × tabela de custos</p>
          </CardContent>
        </Card>

        {/* Combustível */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Fuel className="h-4 w-4" /> Combustível ({fmt(totalFuel)})</CardTitle></CardHeader>
          <CardContent>
            {fuelCost.kmDriven > 0 && fuelCost.kmPerLiter > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 border rounded-lg">
                  <div>
                    <p className="text-sm font-semibold">Consumo estimado</p>
                    <p className="text-xs text-muted-foreground">
                      {fuelCost.kmDriven.toFixed(0)} km ÷ {fuelCost.kmPerLiter} km/l = {fuelCost.liters.toFixed(2)} litros
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fuelCost.liters.toFixed(2)} litros × R$ 6,25/l (diesel)
                    </p>
                  </div>
                  <p className="font-bold text-sm text-orange-600">{fmt(fuelCost.cost)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {fuelCost.kmDriven === 0
                  ? 'Sem registro de quilometragem no checklist'
                  : 'Viatura sem km/litro cadastrado'}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">* Preço médio do diesel: R$ 6,25/l. Km/l cadastrado na viatura.</p>
          </CardContent>
        </Card>

        {/* Outros Custos */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Outros Custos ({fmt(totalOther)})</CardTitle></CardHeader>
          <CardContent>
            {otherCosts.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-2 border rounded-lg mb-2">
                <div>
                  <p className="text-sm font-semibold">{c.category}</p>
                  <p className="text-xs text-muted-foreground">{c.description || ''}</p>
                </div>
                <p className="font-bold text-sm">{fmt(Number(c.amount))}</p>
              </div>
            ))}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <Select value={newOtherCost.category} onValueChange={(v) => setNewOtherCost(p => ({ ...p, category: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>{costCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Descrição" className="h-8 text-xs" value={newOtherCost.description} onChange={e => setNewOtherCost(p => ({ ...p, description: e.target.value }))} />
              <Input type="number" step="0.01" placeholder="Valor" className="h-8 text-xs" value={newOtherCost.amount || ''} onChange={e => setNewOtherCost(p => ({ ...p, amount: Number(e.target.value) }))} />
              <Button size="sm" className="h-8" onClick={addOtherCost}><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
