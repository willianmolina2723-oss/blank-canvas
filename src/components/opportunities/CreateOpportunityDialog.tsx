import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Minus } from 'lucide-react';
import { ROLE_LABELS, type AppRole } from '@/types/database';

const ALL_ROLES: AppRole[] = ['condutor', 'enfermeiro', 'tecnico', 'medico'];

interface CreateOpportunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateOpportunityDialog({ open, onOpenChange, onSuccess }: CreateOpportunityDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: '',
    start_time: '',
    end_time: '',
    location: '',
  });
  const [roleQuantities, setRoleQuantities] = useState<Record<string, number>>(
    Object.fromEntries(ALL_ROLES.map(r => [r, 0]))
  );

  const adjustRole = (role: string, delta: number) => {
    setRoleQuantities(prev => ({
      ...prev,
      [role]: Math.max(0, Math.min(10, (prev[role] || 0) + delta)),
    }));
  };

  const buildRolesNeeded = (): string[] => {
    const result: string[] = [];
    for (const role of ALL_ROLES) {
      const qty = roleQuantities[role] || 0;
      for (let i = 0; i < qty; i++) result.push(role);
    }
    return result;
  };

  const totalRoles = Object.values(roleQuantities).reduce((a, b) => a + b, 0);

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (!form.title.trim()) missing.push('Título');
    if (!form.event_date) missing.push('Data do Evento');
    if (!form.start_time) missing.push('Horário de Início');
    if (!form.end_time) missing.push('Horário de Término');
    if (!form.location.trim()) missing.push('Local');
    if (!form.description.trim()) missing.push('Descrição');
    if (totalRoles === 0) missing.push('Funções necessárias');

    if (missing.length > 0) {
      toast({ title: 'Campos obrigatórios pendentes', description: missing.join(', '), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const roles_needed = buildRolesNeeded();
      const { data: inserted, error } = await (supabase as any)
        .from('opportunities')
        .insert({
          title: form.title,
          description: form.description || null,
          event_date: form.event_date,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          location: form.location || null,
          roles_needed,
          created_by: profile?.id,
          status: 'aberta',
          empresa_id: profile?.empresa_id || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (inserted?.id) {
        supabase.functions.invoke('send-notifications', {
          body: { type: 'nova_oportunidade', opportunity_id: inserted.id },
        }).catch(() => {});
      }

      toast({ title: 'Oportunidade criada com sucesso!' });
      setForm({ title: '', description: '', event_date: '', start_time: '', end_time: '', location: '' });
      setRoleQuantities(Object.fromEntries(ALL_ROLES.map(r => [r, 0])));
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao criar oportunidade', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Oportunidade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="opp-title">Título *</Label>
            <Input
              id="opp-title"
              placeholder="Ex: Evento São João 2026"
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opp-date">Data do Evento *</Label>
            <Input
              id="opp-date"
              type="date"
              value={form.event_date}
              onChange={e => setForm(prev => ({ ...prev, event_date: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opp-start">Início *</Label>
              <Input
                id="opp-start"
                type="time"
                value={form.start_time}
                onChange={e => setForm(prev => ({ ...prev, start_time: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opp-end">Término *</Label>
              <Input
                id="opp-end"
                type="time"
                value={form.end_time}
                onChange={e => setForm(prev => ({ ...prev, end_time: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opp-location">Local *</Label>
            <Input
              id="opp-location"
              placeholder="Ex: Arena XYZ"
              value={form.location}
              onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opp-desc">Descrição *</Label>
            <Textarea
              id="opp-desc"
              placeholder="Informações adicionais sobre a oportunidade..."
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Funções necessárias * <span className="text-muted-foreground font-normal">({totalRoles} vaga{totalRoles !== 1 ? 's' : ''})</span></Label>
            <div className="space-y-2">
              {ALL_ROLES.map(role => {
                const qty = roleQuantities[role] || 0;
                return (
                  <div
                    key={role}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                      qty > 0 ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border'
                    }`}
                  >
                    <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-lg"
                        onClick={() => adjustRole(role, -1)}
                        disabled={qty === 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className={`w-6 text-center text-sm font-bold ${qty > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {qty}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-lg"
                        onClick={() => adjustRole(role, 1)}
                        disabled={qty >= 10}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publicar Oportunidade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
