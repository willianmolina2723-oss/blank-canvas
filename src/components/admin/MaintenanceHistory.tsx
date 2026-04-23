import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { todayBrasilia, formatBR } from '@/utils/dateFormat';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Wrench, Plus, Trash2, Loader2, Calendar, DollarSign, Gauge, FileText, Pencil } from 'lucide-react';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_TYPES, getCategoryLabel, getMaintenanceTypeLabel, type MaintenanceLogFull } from '@/types/maintenance';
import { explainError } from '@/utils/explainError';

interface Props {
  ambulanceId: string;
  ambulanceCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  maintenance_date: string;
  maintenance_type: string;
  category: string;
  description: string;
  km_at_service: string;
  performed_by: string;
  cost: string;
  parts_replaced: string;
  next_service_km: string;
  next_service_date: string;
  notes: string;
}

const emptyForm: FormState = {
  maintenance_date: todayBrasilia(),
  maintenance_type: 'preventiva',
  category: 'troca_oleo',
  description: '',
  km_at_service: '',
  performed_by: '',
  cost: '',
  parts_replaced: '',
  next_service_km: '',
  next_service_date: '',
  notes: '',
};

export function MaintenanceHistory({ ambulanceId, ambulanceCode, open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['maintenance-logs', ambulanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .select('*')
        .eq('ambulance_id', ambulanceId)
        .order('maintenance_date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MaintenanceLogFull[];
    },
    enabled: open && !!ambulanceId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance-logs', ambulanceId] });
    queryClient.invalidateQueries({ queryKey: ['maintenance-logs-all'] });
    queryClient.invalidateQueries({ queryKey: ['admin-ambulances'] });
  };

  useEffect(() => {
    if (!open) {
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    }
  }, [open]);

  const startEdit = (log: MaintenanceLogFull) => {
    setEditingId(log.id);
    setForm({
      maintenance_date: log.maintenance_date,
      maintenance_type: log.maintenance_type || 'preventiva',
      category: log.category || 'outros',
      description: log.description || '',
      km_at_service: log.km_at_service?.toString() || '',
      performed_by: log.performed_by || '',
      cost: log.cost?.toString() || '',
      parts_replaced: log.parts_replaced || '',
      next_service_km: log.next_service_km?.toString() || '',
      next_service_date: log.next_service_date || '',
      notes: log.notes || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.description.trim()) {
      toast({ title: 'Erro', description: 'Descrição é obrigatória.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        ambulance_id: ambulanceId,
        maintenance_date: form.maintenance_date,
        maintenance_type: form.maintenance_type,
        category: form.category,
        description: form.description.trim(),
        km_at_service: form.km_at_service ? parseInt(form.km_at_service) : null,
        performed_by: form.performed_by.trim() || null,
        cost: form.cost ? parseFloat(form.cost) : null,
        parts_replaced: form.parts_replaced.trim() || null,
        next_service_km: form.next_service_km ? parseInt(form.next_service_km) : null,
        next_service_date: form.next_service_date || null,
        notes: form.notes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from('maintenance_logs').update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Manutenção atualizada' });
      } else {
        payload.empresa_id = profile?.empresa_id;
        payload.created_by = profile?.id;
        const { error } = await supabase.from('maintenance_logs').insert(payload);
        if (error) throw error;
        toast({ title: 'Manutenção registrada' });

        // Update ambulance current_km if higher
        if (payload.km_at_service) {
          await supabase.from('ambulances')
            .update({ current_km: payload.km_at_service } as any)
            .eq('id', ambulanceId)
            .lt('current_km', payload.km_at_service);
        }
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      invalidate();
    } catch (err: any) {
      toast({ title: 'Erro', description: explainError(err, 'Falha ao salvar manutenção.'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este registro de manutenção?')) return;
    try {
      const { error } = await supabase.from('maintenance_logs').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Excluído' });
      invalidate();
    } catch (err: any) {
      toast({ title: 'Erro', description: explainError(err, 'Falha ao excluir.'), variant: 'destructive' });
    }
  };

  const totalCost = logs.reduce((s, l) => s + (Number(l.cost) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Manutenções — {ambulanceCode}
          </DialogTitle>
          <DialogDescription>
            {logs.length} registro(s) · Total gasto: R$ {totalCost.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!showForm && (
            <Button className="w-full gap-2" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>
              <Plus className="h-4 w-4" /> Nova Manutenção
            </Button>
          )}

          {showForm && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Data *</Label>
                    <Input type="date" value={form.maintenance_date}
                      onChange={(e) => setForm({ ...form, maintenance_date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <Select value={form.maintenance_type} onValueChange={(v) => setForm({ ...form, maintenance_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MAINTENANCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Categoria *</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {MAINTENANCE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Descrição do serviço *</Label>
                  <Textarea value={form.description} rows={2}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Ex: Troca de óleo 5W30 sintético, filtro novo..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Km no serviço</Label>
                    <Input type="number" value={form.km_at_service}
                      onChange={(e) => setForm({ ...form, km_at_service: e.target.value })}
                      placeholder="Ex: 85000" />
                  </div>
                  <div className="space-y-1">
                    <Label>Custo (R$)</Label>
                    <Input type="number" step="0.01" value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      placeholder="0,00" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Oficina / Responsável</Label>
                  <Input value={form.performed_by}
                    onChange={(e) => setForm({ ...form, performed_by: e.target.value })}
                    placeholder="Ex: Auto Center XYZ" />
                </div>
                <div className="space-y-1">
                  <Label>Peças trocadas</Label>
                  <Textarea value={form.parts_replaced} rows={2}
                    onChange={(e) => setForm({ ...form, parts_replaced: e.target.value })}
                    placeholder="Ex: 4 pneus, 2 amortecedores" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Próx. revisão (km)</Label>
                    <Input type="number" value={form.next_service_km}
                      onChange={(e) => setForm({ ...form, next_service_km: e.target.value })}
                      placeholder="Ex: 95000" />
                  </div>
                  <div className="space-y-1">
                    <Label>Próx. revisão (data)</Label>
                    <Input type="date" value={form.next_service_date}
                      onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea value={form.notes} rows={2}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingId ? 'Atualizar' : 'Registrar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma manutenção registrada.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Card key={log.id} className="group">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(log.category)}
                          </Badge>
                          {log.maintenance_type && (
                            <Badge variant="secondary" className="text-xs">
                              {getMaintenanceTypeLabel(log.maintenance_type)}
                            </Badge>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatBR(log.maintenance_date, 'dd/MM/yyyy')}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{log.description}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          {log.km_at_service != null && (
                            <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{log.km_at_service.toLocaleString('pt-BR')} km</span>
                          )}
                          {log.cost != null && (
                            <span className="flex items-center gap-1 font-semibold text-foreground">
                              <DollarSign className="h-3 w-3" />R$ {Number(log.cost).toFixed(2)}
                            </span>
                          )}
                          {log.performed_by && <span>Por: {log.performed_by}</span>}
                        </div>
                        {(log.next_service_km != null || log.next_service_date) && (
                          <div className="text-xs text-primary flex flex-wrap gap-x-3">
                            {log.next_service_km != null && <span>Próx: {log.next_service_km.toLocaleString('pt-BR')} km</span>}
                            {log.next_service_date && <span>Próx: {formatBR(log.next_service_date, 'dd/MM/yyyy')}</span>}
                          </div>
                        )}
                        {log.parts_replaced && (
                          <p className="text-xs text-muted-foreground">
                            <FileText className="h-3 w-3 inline mr-1" />Peças: {log.parts_replaced}
                          </p>
                        )}
                        {log.notes && <p className="text-xs text-muted-foreground italic">{log.notes}</p>}
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(log)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(log.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
