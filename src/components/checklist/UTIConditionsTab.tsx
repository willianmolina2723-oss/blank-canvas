import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Car, Droplets, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface UTIData {
  documentos: string;
  freios: string;
  direcao: string;
  pneus: string;
  agua: string;
  oleo: string;
}

const EMPTY_DATA: UTIData = {
  documentos: '',
  freios: '',
  direcao: '',
  pneus: '',
  agua: '',
  oleo: '',
};

const BRI_OPTIONS = [
  { value: 'B', label: 'B', color: 'bg-green-600 hover:bg-green-700 text-white' },
  { value: 'R', label: 'R', color: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  { value: 'I', label: 'I', color: 'bg-red-600 hover:bg-red-700 text-white' },
];
const LEVEL_OPTIONS = ['Máx.', 'Normal', 'Mín.'];

interface Props {
  eventId: string;
  canCheck: boolean;
  profileId?: string;
  empresaId?: string | null;
}

export function UTIConditionsTab({ eventId, canCheck, profileId, empresaId }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<UTIData>(EMPTY_DATA);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [resolvedEmpresaId, setResolvedEmpresaId] = useState<string | null>(empresaId ?? null);

  useEffect(() => {
    setResolvedEmpresaId(empresaId ?? null);
  }, [empresaId]);

  useEffect(() => {
    loadData();
  }, [eventId]);

  const resolveEmpresaId = async () => {
    if (resolvedEmpresaId) return resolvedEmpresaId;

    const { data: eventRow } = await supabase
      .from('events')
      .select('empresa_id')
      .eq('id', eventId)
      .maybeSingle();

    if (eventRow?.empresa_id) {
      setResolvedEmpresaId(eventRow.empresa_id);
      return eventRow.empresa_id;
    }

    const { data: empresaFromRpc } = await (supabase.rpc as any)('get_empresa_id');
    const fallbackEmpresaId = (empresaFromRpc as string | null) ?? null;
    setResolvedEmpresaId(fallbackEmpresaId);
    return fallbackEmpresaId;
  };

  const loadData = async () => {
    // Load UTI data
    const { data: rows, error } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('event_id', eventId)
      .eq('item_type', 'uti')
      .limit(1);

    if (!error && rows && rows.length > 0) {
      setRecordId(rows[0].id);
      if (rows[0].empresa_id && !resolvedEmpresaId) {
        setResolvedEmpresaId(rows[0].empresa_id);
      }
      try {
        const parsed = JSON.parse(rows[0].notes || '{}');
        setData({ ...EMPTY_DATA, ...parsed });
      } catch {
        setData(EMPTY_DATA);
      }
    }

    // Load confirmation flag
    const { data: confirmRows } = await supabase
      .from('checklist_items')
      .select('id')
      .eq('event_id', eventId)
      .eq('item_type', 'uti_confirmed' as any)
      .limit(1);

    setIsConfirmed(!!(confirmRows && confirmRows.length > 0));
  };

  const saveData = async (updated: UTIData) => {
    setData(updated);
    setIsSaving(true);
    try {
      const empresaIdToUse = await resolveEmpresaId();
      if (!empresaIdToUse) {
        throw new Error('Não foi possível identificar a empresa para salvar as condições da UTI.');
      }

      const notes = JSON.stringify(updated);
      if (recordId) {
        const { error } = await supabase
          .from('checklist_items')
          .update({
            notes,
            checked_by: profileId,
            checked_at: new Date().toISOString(),
            is_checked: true,
            empresa_id: empresaIdToUse,
          })
          .eq('id', recordId);

        if (error) throw error;
      } else {
        const { data: row, error } = await supabase
          .from('checklist_items')
          .insert({
            event_id: eventId,
            item_type: 'uti',
            item_name: 'Condições da UTI',
            is_checked: true,
            checked_by: profileId,
            checked_at: new Date().toISOString(),
            notes,
            empresa_id: empresaIdToUse,
          })
          .select()
          .single();

        if (error) throw error;
        if (row) setRecordId(row.id);
      }
    } catch (err) {
      console.error('Error saving UTI data:', err);
      toast({
        title: 'Erro',
        description: explainError(err, 'Não foi possível salvar.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const setValue = (key: keyof UTIData, value: string) => {
    if (!canCheck || isConfirmed) return;
    const updated = { ...data, [key]: data[key] === value ? '' : value };
    saveData(updated);
  };

  const filledCount = Object.values(data).filter(v => v !== '').length;
  const totalFields = Object.keys(data).length;
  const pct = Math.round((filledCount / totalFields) * 100);
  const allFilled = pct === 100;

  const handleConfirm = async () => {
    if (!allFilled) {
      toast({ title: 'Atenção', description: 'Todos os campos devem ser preenchidos antes de confirmar.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const empresaIdToUse = await resolveEmpresaId();
      if (!empresaIdToUse) {
        throw new Error('Não foi possível identificar a empresa para confirmar as condições da UTI.');
      }

      const now = new Date().toISOString();
      const { data: existingRow, error: existingError } = await supabase
        .from('checklist_items')
        .select('id')
        .eq('event_id', eventId)
        .eq('item_type', 'uti_confirmed' as any)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existingRow?.id) {
        const { error } = await supabase
          .from('checklist_items')
          .update({
            item_name: 'UTI_CONFIRMADO',
            is_checked: true,
            checked_by: profileId,
            checked_at: now,
            empresa_id: empresaIdToUse,
          })
          .eq('id', existingRow.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('checklist_items').insert({
          event_id: eventId,
          item_type: 'uti_confirmed' as any,
          item_name: 'UTI_CONFIRMADO',
          is_checked: true,
          checked_by: profileId,
          checked_at: now,
          empresa_id: empresaIdToUse,
        });

        if (error) throw error;
      }

      setIsConfirmed(true);
      toast({ title: 'Sucesso', description: 'Condições da UTI confirmadas com sucesso.' });
    } catch (err) {
      console.error('Error confirming UTI:', err);
      toast({
        title: 'Erro',
        description: explainError(err, 'Não foi possível confirmar.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderSelector = (label: string, field: keyof UTIData, options: { value: string; label: string; color: string }[]) => (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-card border-border">
      <span className="flex-1 text-sm font-medium">{label}</span>
      <div className="flex gap-1">
        {options.map(opt => (
          <Button
            key={opt.value}
            size="sm"
            variant={data[field] === opt.value ? 'default' : 'outline'}
            className={`h-7 px-2 text-xs font-bold ${data[field] === opt.value ? opt.color : ''}`}
            onClick={() => setValue(field, opt.value)}
            disabled={!canCheck || isSaving || isConfirmed}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );

  const levelOptions = LEVEL_OPTIONS.map(l => ({
    value: l,
    label: l,
    color: l === 'Mín.' ? 'bg-red-600 hover:bg-red-700 text-white' : l === 'Máx.' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
  }));

  return (
    <div className="space-y-4">
      {isConfirmed && (
        <div className="flex items-center justify-center gap-1.5 text-green-600 mb-2">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-xs font-bold uppercase">Confirmado</span>
        </div>
      )}

      <Card className="border-orange-500/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Car className="h-5 w-5 text-orange-500" />
              Checagem
            </CardTitle>
            <Badge variant={pct === 100 ? 'default' : 'secondary'}>
              {filledCount}/{totalFields} ({pct}%)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            B (Bom) · R (Regular) · I (Insuficiente)
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderSelector('Documentos', 'documentos', BRI_OPTIONS)}
          {renderSelector('Freios', 'freios', BRI_OPTIONS)}
          {renderSelector('Direção', 'direcao', BRI_OPTIONS)}
          {renderSelector('Pneus', 'pneus', BRI_OPTIONS)}
        </CardContent>
      </Card>

      <Card className="border-cyan-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Droplets className="h-5 w-5 text-cyan-500" />
            Motor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderSelector('Água', 'agua', levelOptions)}
          {renderSelector('Óleo', 'oleo', levelOptions)}
        </CardContent>
      </Card>

      {!canCheck && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="py-3">
            <p className="text-sm text-center flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Apenas condutores podem preencher as condições da UTI.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Confirm button */}
      {canCheck && !isConfirmed ? (
        <Button
          onClick={handleConfirm}
          disabled={!allFilled || isSaving}
          className="w-full rounded-2xl py-6 text-sm font-black uppercase tracking-widest"
        >
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Confirmar Condições da UTI
        </Button>
      ) : isConfirmed ? (
        <div className="text-center text-sm text-muted-foreground bg-green-50 border border-green-200 rounded-2xl p-4">
          <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
          Condições da UTI confirmadas com sucesso.
        </div>
      ) : null}
    </div>
  );
}
