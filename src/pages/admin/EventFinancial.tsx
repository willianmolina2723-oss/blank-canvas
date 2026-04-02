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
import { Loader2, ArrowLeft, DollarSign, Users, Package, Plus, Save, Pill, Download, FileText, Clock, Fuel } from 'lucide-react';
import { differenceInMinutes, parseISO } from 'date-fns';

const db = supabase as any;
const DEFAULT_RATE = 18.60;

export default function EventFinancial() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading, profile } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [contractors, setContractors] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
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
      ] = await Promise.all([
        supabase.from('events').select('*, ambulance:ambulances(*)').eq('id', id!).single(),
        db.from('contractors').select('*').eq('is_active', true).order('name'),
        supabase.from('event_participants').select('*, profile:profiles(*)').eq('event_id', id!),
        db.from('event_finances').select('*').eq('event_id', id!).maybeSingle(),
        db.from('event_staff_costs').select('*, profile:profiles(full_name, professional_id)').eq('event_id', id!),
        db.from('event_other_costs').select('*').eq('event_id', id!),
        db.from('cost_items').select('*').eq('is_active', true),
        supabase.from('transport_records').select('departure_time, arrival_time').eq('event_id', id!).maybeSingle(),
      ]);

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
        const q = parseInt(ci.notes || '0') || 0;
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

  const calcStaffTotal = (c: any) => {
    const rate = Number(c.base_value) > 0 ? Number(c.base_value) : DEFAULT_RATE;
    return (transportMinutes / 60) * rate + Number(c.extras) - Number(c.discounts);
  };

  const finalValue = finance.contract_value - finance.discounts + finance.additions;
  const totalStaff = staffCosts.length > 0
    ? staffCosts.reduce((s: number, c: any) => s + calcStaffTotal(c), 0)
    : participants.length * (transportMinutes / 60) * DEFAULT_RATE;
  const totalOther = otherCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalInsumos = insumoCosts.totalMed + insumoCosts.totalMat;
  const totalPaid = payments.filter((p: any) => !p.cancelled).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalFuel = fuelCost.cost;
  const grossProfit = finalValue - totalStaff - totalOther - totalInsumos - totalFuel;

  const exportEventCSV = () => {
    const rows = [
      ['Categoria', 'Descrição', 'Valor'],
      ['Receita', 'Valor do Contrato', String(finance.contract_value)],
      ['Receita', 'Descontos', String(-finance.discounts)],
      ['Receita', 'Adicionais', String(finance.additions)],
      ['Receita', 'Valor Final', String(finalValue)],
      ...staffCosts.map((s: any) => { const r = Number(s.base_value) > 0 ? Number(s.base_value) : DEFAULT_RATE; return ['Equipe', s.profile?.full_name || 'N/A', String((transportMinutes / 60) * r + Number(s.extras) - Number(s.discounts))]; }),
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
            <Card key={c.label}><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold ${c.cls}`}>{fmt(c.value)}</p>
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
              <div><Label>Valor Final</Label><Input readOnly value={fmt(finalValue)} className="bg-muted" /></div>
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
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Custos da Equipe ({fmt(totalStaff)})</CardTitle></CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum participante</p>
            ) : (
              <div className="space-y-3">
                {participants.map((p: any) => {
                  const existing = staffCosts.find((s: any) => s.profile_id === p.profile_id);
                  const d = existing || { payment_type: 'por_hora', base_value: 0, extras: 0, discounts: 0 };
                  const rate = Number(d.base_value) > 0 ? Number(d.base_value) : DEFAULT_RATE;
                  const personTotal = (transportMinutes / 60) * rate + Number(d.extras) - Number(d.discounts);
                  const hours = transportMinutes / 60;
                  return (
                    <div key={p.id} className="p-3 border rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">{p.profile?.full_name}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{p.role}</Badge>
                            {p.profile?.professional_id && <span className="text-[10px] text-muted-foreground">{p.profile.professional_id}</span>}
                          </div>
                          {transportMinutes > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmt(rate)}/h × {hours.toFixed(1)}h = {fmt(personTotal)}
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
                  ? 'Sem registro de quilometragem no transporte'
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
