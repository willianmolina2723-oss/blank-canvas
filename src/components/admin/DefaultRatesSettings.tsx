import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDefaultRates } from '@/hooks/useDefaultRates';
import { DollarSign, Save, Loader2 } from 'lucide-react';
import { ROLE_LABELS } from '@/types/database';

const EDITABLE_ROLES = ['condutor', 'enfermeiro', 'tecnico', 'medico'] as const;

export function DefaultRatesSettings() {
  const { rates, loading, saveRates } = useDefaultRates();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      setForm({ ...rates });
    }
  }, [loading, rates]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveRates(form);
      toast({ title: 'Valores padrão atualizados!' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
          Valores Padrão por Função
        </CardTitle>
        <CardDescription>
          Defina o valor/hora padrão para cada função. Valores individuais cadastrados no perfil do usuário terão prioridade sobre estes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Valores Padrão
        </Button>
      </CardContent>
    </Card>
  );
}
