import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useDefaultRates } from '@/hooks/useDefaultRates';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Save, Loader2, Plane } from 'lucide-react';
import { ROLE_LABELS } from '@/types/database';

const EDITABLE_ROLES = ['condutor', 'enfermeiro', 'tecnico', 'medico'] as const;
const DESLOC_KEYS: Record<string, string> = {
  condutor: 'deslocamento_default_condutor',
  enfermeiro: 'deslocamento_default_enfermeiro',
  tecnico: 'deslocamento_default_tecnico',
  medico: 'deslocamento_default_medico',
};

export function DefaultRatesSettings() {
  const { rates, loading, saveRates } = useDefaultRates();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, number>>({});
  const [desloc, setDesloc] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loadingDesloc, setLoadingDesloc] = useState(true);

  useEffect(() => {
    if (!loading) setForm({ ...rates });
  }, [loading, rates]);

  useEffect(() => {
    loadDeslocDefaults();
  }, []);

  const loadDeslocDefaults = async () => {
    try {
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', Object.values(DESLOC_KEYS));

      const next: Record<string, boolean> = {
        condutor: true, enfermeiro: true, tecnico: true, medico: false,
      };
      (data || []).forEach((row: any) => {
        const role = Object.entries(DESLOC_KEYS).find(([, k]) => k === row.key)?.[0];
        if (role) next[role] = row.value === 'true';
      });
      setDesloc(next);
    } catch (err) {
      console.error('Error loading displacement defaults:', err);
    } finally {
      setLoadingDesloc(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save rates
      await saveRates(form);

      // Save displacement toggles
      const upserts = Object.entries(DESLOC_KEYS).map(([role, key]) => ({
        key,
        value: desloc[role] ? 'true' : 'false',
      }));
      const { error } = await (supabase as any)
        .from('app_config')
        .upsert(upserts, { onConflict: 'key' });
      if (error) throw error;

      toast({ title: 'Configurações atualizadas!' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || loadingDesloc) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Valores Padrão e Deslocamento por Função
        </CardTitle>
        <CardDescription>
          Defina valor/hora e quem recebe deslocamento por função. Valores e overrides individuais no perfil têm prioridade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-sm font-semibold mb-3 block">Valor/Hora (R$)</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {EDITABLE_ROLES.map(role => (
              <div key={role} className="space-y-1.5">
                <Label className="text-xs font-medium">{ROLE_LABELS[role]}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-9 h-9"
                    value={form[role] ?? 0}
                    onChange={e => setForm(prev => ({ ...prev, [role]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Plane className="h-4 w-4" />
            Recebe deslocamento (padrão por função)
          </Label>
          <p className="text-xs text-muted-foreground mb-3">
            Quando ativado, as horas pagas usam o horário real (checklist → chegada na base). Quando desativado, usa o horário previsto do evento.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EDITABLE_ROLES.map(role => (
              <div key={role} className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor={`desloc-${role}`} className="text-sm font-medium cursor-pointer">
                  {ROLE_LABELS[role]}
                </Label>
                <Switch
                  id={`desloc-${role}`}
                  checked={desloc[role] ?? false}
                  onCheckedChange={(checked) => setDesloc(prev => ({ ...prev, [role]: checked }))}
                />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configurações
        </Button>
      </CardContent>
    </Card>
  );
}
