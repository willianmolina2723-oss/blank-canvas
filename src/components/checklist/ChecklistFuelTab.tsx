import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Fuel, CheckCircle2, Loader2, AlertTriangle, Car } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const FUEL_LEVELS = [
  { value: 'R', label: 'R', color: 'text-red-500' },
  { value: '1/4', label: '¼', color: '' },
  { value: '1/2', label: '½', color: 'text-blue-500' },
  { value: '3/4', label: '¾', color: '' },
  { value: 'C', label: 'C', color: 'text-green-600' },
];

function FuelLevelSelector({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="flex gap-2 mt-1">
      {FUEL_LEVELS.map(level => (
        <button
          key={level.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === level.value ? '' : level.value)}
          className={cn(
            'w-12 h-12 rounded-lg border-2 text-lg font-bold transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            value === level.value
              ? 'border-primary bg-primary/10 shadow-md scale-105'
              : 'border-border bg-background hover:border-primary/50',
            level.color
          )}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  eventId: string;
  canCheck: boolean;
  profileId?: string;
  empresaId?: string | null;
}

interface FuelData {
  km_inicial: string;
  combustivel_inicial: string;
  km_reserva_inicial: string;
  km_final: string;
  combustivel_final: string;
  km_reserva_final: string;
  abastecido: boolean;
  observacoes: string;
}

export function ChecklistFuelTab({ eventId, canCheck, profileId, empresaId }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<FuelData>({
    km_inicial: '', combustivel_inicial: '', km_reserva_inicial: '',
    km_final: '', combustivel_final: '', km_reserva_final: '',
    abastecido: false, observacoes: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartConfirmed, setIsStartConfirmed] = useState(false);
  const [isEndConfirmed, setIsEndConfirmed] = useState(false);
  const [startItemId, setStartItemId] = useState<string | null>(null);
  const [endItemId, setEndItemId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [eventId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: items } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('event_id', eventId)
        .in('item_type', ['fuel_start', 'fuel_end']);

      const startItem = items?.find((i: any) => i.item_type === 'fuel_start');
      const endItem = items?.find((i: any) => i.item_type === 'fuel_end');

      if (startItem?.notes) {
        try {
          const parsed = JSON.parse(startItem.notes);
          setData(prev => ({ ...prev, km_inicial: parsed.km_inicial || '', combustivel_inicial: parsed.combustivel_inicial || '' }));
        } catch {}
        setIsStartConfirmed(!!startItem.is_checked);
        setStartItemId(startItem.id);
      }

      if (endItem?.notes) {
        try {
          const parsed = JSON.parse(endItem.notes);
          setData(prev => ({
            ...prev,
            km_final: parsed.km_final || '',
            combustivel_final: parsed.combustivel_final || '',
            abastecido: parsed.abastecido || false,
            observacoes: parsed.observacoes || '',
          }));
        } catch {}
        setIsEndConfirmed(!!endItem.is_checked);
        setEndItemId(endItem.id);
      }
    } catch (err) {
      console.error('Error loading fuel data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveStart = async () => {
    if (!data.km_inicial.trim()) {
      toast({ title: 'Atenção', description: 'KM Inicial é obrigatório.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const meta = JSON.stringify({ km_inicial: data.km_inicial, combustivel_inicial: data.combustivel_inicial });
      const now = new Date().toISOString();

      if (startItemId) {
        await supabase.from('checklist_items').update({
          notes: meta, is_checked: true, checked_by: profileId, checked_at: now,
        }).eq('id', startItemId);
      } else {
        const { data: inserted } = await supabase.from('checklist_items').insert({
          event_id: eventId, item_type: 'fuel_start', item_name: 'Combustível - Início',
          is_checked: true, checked_by: profileId, checked_at: now, notes: meta, empresa_id: empresaId,
        }).select('id').single();
        if (inserted) setStartItemId(inserted.id);
      }

      setIsStartConfirmed(true);
      toast({ title: 'Salvo', description: 'Dados de início registrados.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveEnd = async () => {
    if (!data.km_final.trim()) {
      toast({ title: 'Atenção', description: 'KM Final é obrigatório.', variant: 'destructive' });
      return;
    }
    if (!data.combustivel_final.trim() && !data.abastecido) {
      toast({ title: 'Atenção', description: 'Informe o combustível final ou marque como abastecido.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const meta = JSON.stringify({
        km_final: data.km_final, combustivel_final: data.combustivel_final,
        abastecido: data.abastecido, observacoes: data.observacoes,
      });
      const now = new Date().toISOString();

      if (endItemId) {
        await supabase.from('checklist_items').update({
          notes: meta, is_checked: true, checked_by: profileId, checked_at: now,
        }).eq('id', endItemId);
      } else {
        const { data: inserted } = await supabase.from('checklist_items').insert({
          event_id: eventId, item_type: 'fuel_end', item_name: 'Combustível - Final',
          is_checked: true, checked_by: profileId, checked_at: now, notes: meta, empresa_id: empresaId,
        }).select('id').single();
        if (inserted) setEndItemId(inserted.id);
      }

      setIsEndConfirmed(true);
      toast({ title: 'Salvo', description: 'Dados de finalização registrados.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const kmRodado = data.km_inicial && data.km_final
    ? Math.max(0, Number(data.km_final) - Number(data.km_inicial))
    : null;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Start */}
      <Card className={isStartConfirmed ? 'border-green-500/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              Início do Evento
            </CardTitle>
            {isStartConfirmed && <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs font-medium">KM Inicial *</Label>
            <Input type="number" placeholder="Ex: 45230" value={data.km_inicial}
              onChange={e => setData(p => ({ ...p, km_inicial: e.target.value }))}
              disabled={!canCheck || isStartConfirmed} />
          </div>
          <div>
            <Label className="text-xs font-medium">Combustível Inicial</Label>
            <FuelLevelSelector value={data.combustivel_inicial}
              onChange={v => setData(p => ({ ...p, combustivel_inicial: v }))}
              disabled={!canCheck || isStartConfirmed} />
          </div>
          {canCheck && !isStartConfirmed && (
            <Button onClick={saveStart} disabled={isSaving || !data.km_inicial.trim()} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar Início
            </Button>
          )}
        </CardContent>
      </Card>

      {/* End */}
      <Card className={isEndConfirmed ? 'border-green-500/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Fuel className="h-4 w-4 text-primary" />
              Finalização do Evento
            </CardTitle>
            {isEndConfirmed && <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs font-medium">KM Final *</Label>
            <Input type="number" placeholder="Ex: 45380" value={data.km_final}
              onChange={e => setData(p => ({ ...p, km_final: e.target.value }))}
              disabled={!canCheck || isEndConfirmed} />
          </div>
          <div>
            <Label className="text-xs font-medium">Combustível Final</Label>
            <FuelLevelSelector value={data.combustivel_final}
              onChange={v => setData(p => ({ ...p, combustivel_final: v }))}
              disabled={!canCheck || isEndConfirmed} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={data.abastecido}
              onCheckedChange={v => setData(p => ({ ...p, abastecido: v }))}
              disabled={!canCheck || isEndConfirmed} />
            <Label className="text-sm">Viatura foi abastecida</Label>
          </div>
          <div>
            <Label className="text-xs font-medium">Observações</Label>
            <Textarea placeholder="Observações sobre o combustível..." value={data.observacoes}
              onChange={e => setData(p => ({ ...p, observacoes: e.target.value }))}
              disabled={!canCheck || isEndConfirmed} rows={2} />
          </div>
          {canCheck && !isEndConfirmed && (
            <Button onClick={saveEnd} disabled={isSaving || !data.km_final.trim()} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar Finalização
            </Button>
          )}
        </CardContent>
      </Card>

      {/* KM summary */}
      {kmRodado !== null && (
        <Card className="border-primary/20">
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">KM Rodado</p>
              <p className="text-3xl font-black text-primary">{kmRodado} km</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.km_inicial} → {data.km_final}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!canCheck && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="py-3">
            <p className="text-sm text-center flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Apenas condutores podem registrar combustível e quilometragem.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
