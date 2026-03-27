import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Plus, Building2, ChevronDown, ChevronUp, Download, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatBR } from '@/utils/dateFormat';

const db = supabase as any;

export default function FinancialReceivables() {
  const { isAdmin, isLoading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [contractors, setContractors] = useState<any[]>([]);
  const [contractorFinances, setContractorFinances] = useState<Record<string, any>>({});
  const [showNew, setShowNew] = useState(false);
  const [newContractor, setNewContractor] = useState({ name: '', cnpj: '', email: '', phone: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payingEvent, setPayingEvent] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: 0, payment_date: formatBR(new Date(), 'yyyy-MM-dd'), payment_method: 'pix', notes: '' });

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/');
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: contractorsData } = await db.from('contractors').select('*').order('name');
      setContractors(contractorsData || []);

      const { data: finances } = await db.from('event_finances').select('*, event:events(code, location, created_at)');

      // Get payments for each finance
      const financeIds = (finances || []).map((f: any) => f.id);
      let allPayments: any[] = [];
      if (financeIds.length > 0) {
        const { data: p } = await db.from('event_finance_payments').select('*').in('event_finance_id', financeIds).eq('cancelled', false);
        allPayments = p || [];
      }
      const paymentsByFinance: Record<string, any[]> = {};
      allPayments.forEach((p: any) => {
        if (!paymentsByFinance[p.event_finance_id]) paymentsByFinance[p.event_finance_id] = [];
        paymentsByFinance[p.event_finance_id].push(p);
      });

      const grouped: Record<string, any> = {};
      (finances || []).forEach((f: any) => {
        if (!f.contractor_id) return;
        if (!grouped[f.contractor_id]) grouped[f.contractor_id] = { events: [], totalBilled: 0, totalReceived: 0, lastPayment: null };
        const finalVal = Number(f.contract_value) - Number(f.discounts) + Number(f.additions);
        const eventPayments = paymentsByFinance[f.id] || [];
        const eventPaidFromPayments = eventPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
        // If status is 'pago' but no payments registered, consider full value as paid
        const eventPaid = f.status === 'pago' && eventPaidFromPayments === 0 ? finalVal : eventPaidFromPayments;
        const isOverdue = f.due_date && new Date(f.due_date) < new Date() && f.status !== 'pago';

        grouped[f.contractor_id].events.push({
          finance_id: f.id,
          event_code: f.event?.code || '', location: f.event?.location || '',
          value: finalVal, paid: eventPaid, status: f.status,
          due_date: f.due_date, payment_method: f.payment_method,
          isOverdue, payments: eventPayments,
        });
        grouped[f.contractor_id].totalBilled += finalVal;
        grouped[f.contractor_id].totalReceived += eventPaid;

        // Track last payment
        eventPayments.forEach((p: any) => {
          if (!grouped[f.contractor_id].lastPayment || p.payment_date > grouped[f.contractor_id].lastPayment) {
            grouped[f.contractor_id].lastPayment = p.payment_date;
          }
        });
      });
      setContractorFinances(grouped);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createContractor = async () => {
    if (!newContractor.name.trim()) return;
    try {
      await db.from('contractors').insert({ ...newContractor, created_by: profile?.id || null, empresa_id: profile?.empresa_id || null });
      setNewContractor({ name: '', cnpj: '', email: '', phone: '' });
      setShowNew(false);
      await loadData();
      toast({ title: 'Sucesso', description: 'Contratante criado.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const registerPayment = async () => {
    if (!payingEvent?.finance_id || payForm.amount <= 0 || !payForm.payment_date) return;
    try {
      await db.from('event_finance_payments').insert({
        event_finance_id: payingEvent.finance_id,
        amount: payForm.amount,
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method || null,
        notes: payForm.notes || null,
        created_by: profile?.id || null,
        empresa_id: profile?.empresa_id || null,
      });

      // Update event_finances status based on total paid
      const newTotalPaid = (payingEvent.paid || 0) + payForm.amount;
      const newStatus = newTotalPaid >= payingEvent.value ? 'pago' : 'parcial';
      await db.from('event_finances').update({ status: newStatus }).eq('id', payingEvent.finance_id);

      setShowPayDialog(false);
      setPayingEvent(null);
      setPayForm({ amount: 0, payment_date: formatBR(new Date(), 'yyyy-MM-dd'), payment_method: 'pix', notes: '' });
      await loadData();
      toast({ title: 'Sucesso', description: 'Pagamento registrado.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const exportCSV = () => {
    const rows = [['Contratante', 'CNPJ', 'Faturado', 'Recebido', 'Pendente', 'Status']];
    contractors.forEach((c: any) => {
      const data = contractorFinances[c.id] || { totalBilled: 0, totalReceived: 0 };
      const pending = data.totalBilled - data.totalReceived;
      rows.push([c.name, c.cnpj || '', data.totalBilled.toFixed(2), data.totalReceived.toFixed(2), pending.toFixed(2), pending > 0 ? 'Pendente' : 'Em dia']);
    });
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recebimentos-contratantes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalBilled = Object.values(contractorFinances).reduce((s: number, d: any) => s + d.totalBilled, 0);
  const totalReceived = Object.values(contractorFinances).reduce((s: number, d: any) => s + d.totalReceived, 0);

  if (authLoading || isLoading) {
    return <MainLayout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }
  if (!isAdmin) return null;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/financial')}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-xl font-bold">Recebimentos</h1>
              <p className="text-sm text-muted-foreground">Contas a receber por contratante</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            <Dialog open={showNew} onOpenChange={setShowNew}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Contratante</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo Contratante</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Nome *</Label><Input value={newContractor.name} onChange={e => setNewContractor(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><Label>CNPJ</Label><Input value={newContractor.cnpj} onChange={e => setNewContractor(p => ({ ...p, cnpj: e.target.value }))} /></div>
                  <div><Label>Email</Label><Input value={newContractor.email} onChange={e => setNewContractor(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={newContractor.phone} onChange={e => setNewContractor(p => ({ ...p, phone: e.target.value }))} /></div>
                  <Button onClick={createContractor} className="w-full">Criar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Faturado</p>
            <p className="text-lg font-bold text-primary">{fmt(totalBilled)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Recebido</p>
            <p className="text-lg font-bold text-emerald-600">{fmt(totalReceived)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="text-lg font-bold text-orange-600">{fmt(totalBilled - totalReceived)}</p>
          </CardContent></Card>
        </div>

        {contractors.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum contratante cadastrado</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {contractors.map((c: any) => {
              const data = contractorFinances[c.id] || { events: [], totalBilled: 0, totalReceived: 0, lastPayment: null };
              const pending = data.totalBilled - data.totalReceived;
              const hasOverdue = data.events.some((e: any) => e.isOverdue);
              const isExpanded = expandedId === c.id;

              return (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <button className="w-full text-left" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-bold text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.cnpj || 'Sem CNPJ'} {c.phone && `• ${c.phone}`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={hasOverdue ? 'destructive' : pending > 0 ? 'secondary' : 'default'} className="text-[10px]">
                            {hasOverdue ? 'Atrasado' : pending > 0 ? 'Pendente' : 'Em dia'}
                          </Badge>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </button>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-xs text-muted-foreground">Faturado</p><p className="text-sm font-bold">{fmt(data.totalBilled)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Recebido</p><p className="text-sm font-bold text-emerald-600">{fmt(data.totalReceived)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Pendente</p><p className="text-sm font-bold text-red-600">{fmt(pending)}</p></div>
                    </div>

                    {data.lastPayment && (
                      <p className="text-[10px] text-muted-foreground mt-2">Último pagamento: {data.lastPayment}</p>
                    )}

                    {isExpanded && data.events.length > 0 && (
                      <div className="mt-4 pt-4 border-t space-y-2">
                        <h4 className="text-xs font-bold text-muted-foreground">EVENTOS ({data.events.length})</h4>
                        {data.events.map((ev: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm">{ev.event_code}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{fmt(ev.value)}</span>
                                <Badge variant={ev.isOverdue ? 'destructive' : ev.status === 'pago' ? 'default' : 'outline'} className="text-[9px]">
                                  {ev.isOverdue ? 'Atrasado' : ev.status}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex gap-4 text-[10px] text-muted-foreground">
                              {ev.due_date && <span>Venc: {ev.due_date}</span>}
                              {ev.payment_method && <span>Forma: {ev.payment_method}</span>}
                              <span>Pago: {fmt(ev.paid)}</span>
                            </div>
                            {ev.payments.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {ev.payments.map((p: any, j: number) => (
                                  <div key={j} className="flex items-center justify-between text-[10px] px-2 py-1 bg-background rounded">
                                    <span>{p.payment_date} • {p.payment_method || 'N/A'}</span>
                                    <span className="font-semibold text-emerald-600">{fmt(Number(p.amount))}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {ev.status !== 'pago' && ev.paid < ev.value && (
                              <Button size="sm" variant="outline" className="mt-2 w-full text-xs" onClick={() => {
                                setPayingEvent(ev);
                                setPayForm(p => ({ ...p, amount: ev.value - ev.paid }));
                                setShowPayDialog(true);
                              }}>
                                <Plus className="h-3 w-3 mr-1" /> Registrar Recebimento
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Payment Dialog */}
        <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Recebimento</DialogTitle></DialogHeader>
            {payingEvent && (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-bold text-sm">{payingEvent.event_code}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">Total: {fmt(payingEvent.value)}</span>
                    <span className="text-xs text-muted-foreground">Já pago: {fmt(payingEvent.paid)}</span>
                    <span className="text-xs font-bold text-orange-600">Restante: {fmt(payingEvent.value - payingEvent.paid)}</span>
                  </div>
                </div>
                <div><Label>Valor</Label><Input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
                <div><Label>Data</Label><Input type="date" value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} /></div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={payForm.payment_method} onValueChange={v => setPayForm(p => ({ ...p, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Observações</Label><Input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="Opcional" /></div>
                <Button className="w-full" onClick={registerPayment}><Check className="h-4 w-4 mr-1" /> Confirmar Recebimento</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
