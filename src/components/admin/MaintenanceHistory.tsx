import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { todayBrasilia } from '@/utils/dateFormat';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Wrench, Plus, Trash2, Loader2, Calendar } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';

interface MaintenanceLog {
  id: string;
  ambulance_id: string;
  maintenance_date: string;
  description: string;
  cost: number | null;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

interface MaintenanceHistoryProps {
  ambulanceId: string;
  ambulanceCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaintenanceHistory({ ambulanceId, ambulanceCode, open, onOpenChange }: MaintenanceHistoryProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    maintenance_date: todayBrasilia(),
    description: '',
    cost: '',
    performed_by: '',
    notes: '',
  });

  useEffect(() => {
    if (open && ambulanceId) loadLogs();
  }, [open, ambulanceId]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        `maintenance-logs?ambulance_id=${ambulanceId}`,
        { method: 'GET' }
      );
      if (error) throw error;
      if (data?.logs) setLogs(data.logs);
    } catch (err) {
      console.error('Error loading maintenance logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.description.trim()) {
      toast({ title: 'Erro', description: 'Descrição é obrigatória.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke(
        `maintenance-logs?ambulance_id=${ambulanceId}`,
        {
          method: 'POST',
          body: {
            ...form,
            cost: form.cost ? parseFloat(form.cost) : null,
            created_by: profile?.id,
          },
        }
      );

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Manutenção registrada.' });
      setShowAddForm(false);
      setForm({ maintenance_date: todayBrasilia(), description: '', cost: '', performed_by: '', notes: '' });
      loadLogs();
    } catch (err) {
      console.error('Error adding maintenance:', err);
      toast({ title: 'Erro', description: 'Falha ao registrar manutenção.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (logId: string) => {
    if (!confirm('Excluir este registro de manutenção?')) return;

    try {
      const { error } = await supabase.functions.invoke(
        `maintenance-logs?ambulance_id=${ambulanceId}`,
        { method: 'DELETE', body: { id: logId } }
      );
      if (error) throw error;
      toast({ title: 'Excluído', description: 'Registro removido.' });
      setLogs(prev => prev.filter(l => l.id !== logId));
    } catch (err) {
      console.error('Error deleting:', err);
      toast({ title: 'Erro', description: 'Falha ao excluir.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Manutenções — {ambulanceCode}
          </DialogTitle>
          <DialogDescription>Histórico de manutenções desta viatura</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="h-4 w-4 mr-2" />
            {showAddForm ? 'Cancelar' : 'Nova Manutenção'}
          </Button>

          {showAddForm && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-1">
                  <Label>Data *</Label>
                  <Input
                    type="date"
                    value={form.maintenance_date}
                    onChange={(e) => setForm({ ...form, maintenance_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Descrição *</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Troca de óleo, revisão de freios..."
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Custo (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Realizado por</Label>
                    <Input
                      value={form.performed_by}
                      onChange={(e) => setForm({ ...form, performed_by: e.target.value })}
                      placeholder="Oficina / Mecânico"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Observações adicionais..."
                    rows={2}
                  />
                </div>
                <Button onClick={handleAdd} disabled={isSubmitting} className="w-full">
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Registrar Manutenção
                </Button>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma manutenção registrada para esta viatura.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Card key={log.id} className="relative group">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatBR(log.maintenance_date, "dd/MM/yyyy")}
                          {log.cost && (
                            <span className="font-semibold text-foreground">
                              R$ {Number(log.cost).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium">{log.description}</p>
                        {log.performed_by && (
                          <p className="text-xs text-muted-foreground">Por: {log.performed_by}</p>
                        )}
                        {log.notes && (
                          <p className="text-xs text-muted-foreground">{log.notes}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(log.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
