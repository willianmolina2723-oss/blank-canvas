import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';

interface MedicationItem {
  name: string;
  quantity: number;
  checked: boolean;
}

const PSYCHOTROPIC_MEDICATIONS: string[] = [
  'DIAZEPAM AMP',
  'DIAZEPAM CP',
  'FENITOÍNA',
  'MIDAZOLAN',
  'PETIDINA',
  'CLORPROMAZINA',
  'MORFINA',
  'HALOPERIDOL',
  'TRAMADOL',
];

export default function Medications() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [eventRole, setEventRole] = useState<string | null>(null);

  useEffect(() => {
    if (eventId && profile) {
      supabase.from('event_participants').select('role').eq('event_id', eventId).eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setEventRole(data?.role || null));
    }
  }, [eventId, profile]);

  const { canEditMedicationChecklist } = usePermissions({ eventRole: eventRole as any });
  const canEdit = canEditMedicationChecklist;
  const [medications, setMedications] = useState<MedicationItem[]>(
    PSYCHOTROPIC_MEDICATIONS.map(name => ({ name, quantity: 0, checked: false }))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (eventId) loadMedications();
  }, [eventId]);

  const loadMedications = async () => {
    setIsLoading(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('manage-checklist', {
        body: { action: 'load', event_id: eventId, item_type: 'psicotropicos' },
      });

      if (error) throw error;

      const items = response?.data || [];
      if (items.length > 0) {
        setIsConfirmed(true);
        const loaded = PSYCHOTROPIC_MEDICATIONS.map(name => {
          const item = items.find((d: any) => d.item_name === name);
          if (item) {
            const qty = parseInt(item.notes || '0') || 0;
            return { name, quantity: qty, checked: item.is_checked ?? false };
          }
          return { name, quantity: 0, checked: false };
        });
        setMedications(loaded);
      }
    } catch (err) {
      console.error('Error loading medications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheck = (index: number) => {
    if (isConfirmed || !canEdit) return;
    setMedications(prev =>
      prev.map((med, i) => (i === index ? { ...med, checked: !med.checked } : med))
    );
  };

  const handleQuantityChange = (index: number, value: string) => {
    if (isConfirmed || !canEdit) return;
    const qty = Math.max(0, parseInt(value) || 0);
    setMedications(prev =>
      prev.map((med, i) => (i === index ? { ...med, quantity: qty } : med))
    );
  };

  const allHaveQuantity = medications.every(med => med.quantity >= 1);

  const handleConfirm = async () => {
    if (!allHaveQuantity) {
      toast({
        title: 'Atenção',
        description: 'Todos os medicamentos devem ter quantidade mínima de 1.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const items = medications.map(med => ({
        item_name: med.name,
        notes: med.quantity.toString(),
      }));

      const { error } = await supabase.functions.invoke('manage-checklist', {
        body: { action: 'save', event_id: eventId, item_type: 'psicotropicos', items },
      });

      if (error) throw error;

      setIsConfirmed(true);
      toast({
        title: 'Sucesso',
        description: 'Inventário clínico confirmado e salvo.',
      });
    } catch (err) {
      console.error('Error saving medications:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o inventário.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-black tracking-tight uppercase flex-1">
            Controle de Psicotrópicos
          </h1>
          {isConfirmed && (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-xs font-bold uppercase">Confirmado</span>
            </div>
          )}
        </div>

        <ReadOnlyBanner show={!canEdit} message="Apenas enfermeiros, técnicos e médicos podem editar o checklist de medicamentos." />
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="h-10 w-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">CONFERÊNCIA RIGOROSA</p>
            <p className="text-xs text-muted-foreground">
              É obrigatório informar a quantidade para validar o item.
            </p>
          </div>
        </div>

        {/* Medication list */}
        <div className="space-y-0 divide-y divide-border rounded-2xl border bg-card overflow-hidden">
          {medications.map((med, index) => (
            <div key={med.name} className="flex items-center gap-3 px-4 py-4">
              <Checkbox
                checked={med.checked}
                onCheckedChange={() => handleCheck(index)}
                className="h-5 w-5"
                disabled={isConfirmed || !canEdit}
              />
              <span className="flex-1 text-sm font-semibold">{med.name}</span>
              <div className="flex flex-col items-center">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                  Quantidade
                </span>
                <Input
                  type="number"
                  min="0"
                  value={med.quantity}
                  onChange={(e) => handleQuantityChange(index, e.target.value)}
                  className="h-8 w-14 text-center text-sm font-bold border-primary/30 bg-primary/5"
                  disabled={isConfirmed || !canEdit}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Confirm button */}
        {canEdit && !isConfirmed ? (
          <Button
            onClick={handleConfirm}
            disabled={!allHaveQuantity || isSaving}
            className="w-full rounded-2xl py-6 text-sm font-black uppercase tracking-widest"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Confirmar Inventário Clínico
          </Button>
        ) : (
          <div className="text-center text-sm text-muted-foreground bg-green-50 border border-green-200 rounded-2xl p-4">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
            Inventário confirmado com sucesso.
          </div>
        )}
      </div>
    </MainLayout>
  );
}
