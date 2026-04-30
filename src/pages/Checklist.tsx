import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { MainLayout } from '@/components/layout/MainLayout';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, ArrowRight, ClipboardCheck, Plus, Loader2, Check, AlertTriangle,
  Car, CheckCircle2, Video, Fuel
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { UTIConditionsTab, type UTIConditionsTabHandle } from '@/components/checklist/UTIConditionsTab';
import { ChecklistVideoTab, type ChecklistVideoTabHandle } from '@/components/checklist/ChecklistVideoTab';
import { ChecklistFuelTab, type ChecklistFuelTabHandle } from '@/components/checklist/ChecklistFuelTab';
import { cn } from '@/lib/utils';
import type { ChecklistItem, AppRole } from '@/types/database';
import { useEventDates } from '@/hooks/useEventDates';
import { EventDateSelector } from '@/components/events/EventDateSelector';

const DEFAULT_ITEMS = [
  'Desfibrilador automático externo',
  'Eletrocardiograma',
  'Maca rígida',
  'Mochila vermelha',
  'Mochila azul',
  'Multibox',
  'KED',
  'Prancheta com formulários',
  'Torpedos de oxigênio completo grande',
  'Torpedos de oxigênio completo pequeno',
];

const ITEMS_WITH_NOTES = [
  'Torpedos de oxigênio completo grande',
  'Torpedos de oxigênio completo pequeno',
];

type StepKey = 'equipamentos' | 'uti' | 'videos' | 'combustivel';
const STEPS: { key: StepKey; label: string; icon: typeof ClipboardCheck }[] = [
  { key: 'equipamentos', label: 'Equip.', icon: ClipboardCheck },
  { key: 'uti', label: 'UTI', icon: Car },
  { key: 'videos', label: 'Vídeos', icon: Video },
  { key: 'combustivel', label: 'KM', icon: Fuel },
];

export default function Checklist() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [eventRole, setEventRole] = useState<AppRole | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const { dates, activeId: activeDateId, setActiveId: setActiveDateId } = useEventDates(eventId);

  const utiRef = useRef<UTIConditionsTabHandle>(null);
  const videosRef = useRef<ChecklistVideoTabHandle>(null);
  const fuelRef = useRef<ChecklistFuelTabHandle>(null);

  // Load event role
  useEffect(() => {
    if (eventId && profile) {
      supabase
        .from('event_participants')
        .select('role')
        .eq('event_id', eventId)
        .eq('profile_id', profile.id)
        .maybeSingle()
        .then(({ data }) => setEventRole((data?.role as AppRole) || null));
    }
  }, [eventId, profile]);

  const { canEditVehicleChecklist, isFullAdmin } = usePermissions({ eventRole });
  const canCheck = canEditVehicleChecklist;
  const canManageItems = isFullAdmin;

  useEffect(() => {
    if (eventId && activeDateId !== undefined) loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, activeDateId]);

  const loadChecklist = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('checklist_items')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      // Quando há data ativa, filtra: itens da data ou legados (NULL)
      if (activeDateId) {
        query = query.or(`event_date_id.eq.${activeDateId},event_date_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const loaded = data as ChecklistItem[];
      const confirmFlag = loaded.find(i => (i.item_type as string) === 'checklist_confirmed');
      setIsConfirmed(!!confirmFlag);

      const displayItems = loaded.filter(i => {
        const t = i.item_type as string;
        return t !== 'checklist_confirmed' && t !== 'uti' && t !== 'uti_confirmed' && t !== 'psicotropicos' && t !== 'psicotropicos_confirmed' && !t.startsWith('video_') && t !== 'videos_confirmed' && !t.startsWith('fuel_');
      });

      if (displayItems.length === 0 && (canCheck || canManageItems)) {
        await createDefaultItems();
        return;
      }

      setItems(displayItems);
    } catch (err) {
      console.error('Error loading checklist:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível carregar o checklist.'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultItems = async () => {
    try {
      const allItems = DEFAULT_ITEMS.map(name => ({
        event_id: eventId,
        event_date_id: activeDateId || null,
        item_type: 'pre',
        item_name: name,
        is_checked: false,
        empresa_id: profile?.empresa_id || null,
      }));

      const { error } = await supabase.from('checklist_items').insert(allItems);
      if (error) throw error;
      await loadChecklist();
    } catch (err) {
      console.error('Error creating default items:', err);
    }
  };

  const setItemValue = async (item: ChecklistItem, value: boolean) => {
    if (!canCheck || isConfirmed) {
      if (!canCheck) {
        toast({ title: 'Sem permissão', description: 'Sua função não permite editar o checklist da viatura.', variant: 'destructive' });
      }
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('checklist_items')
        .update({ is_checked: value, checked_by: profile?.id, checked_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;

      setItems(prev =>
        prev.map(i =>
          i.id === item.id ? { ...i, is_checked: value, checked_by: profile?.id || null, checked_at: new Date().toISOString() } : i
        )
      );
    } catch (err) {
      console.error('Error updating item:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível atualizar o item.'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const addItem = async () => {
    if (!newItemName.trim() || !canManageItems) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('checklist_items')
        .insert({ event_id: eventId, item_type: 'pre', item_name: newItemName.trim(), is_checked: false, empresa_id: profile?.empresa_id || null })
        .select()
        .single();

      if (error) throw error;
      setItems(prev => [...prev, data as ChecklistItem]);
      setNewItemName('');
      toast({ title: 'Item adicionado', description: 'O item foi adicionado ao checklist.' });
    } catch (err) {
      console.error('Error adding item:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível adicionar o item.'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateItemNotes = async (item: ChecklistItem, notes: string) => {
    if (!canCheck) return;
    try {
      await supabase.from('checklist_items').update({ notes }).eq('id', item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, notes } : i));
    } catch (err) {
      console.error('Error updating notes:', err);
    }
  };

  const getCompletionStatus = (list: ChecklistItem[]) => {
    const answered = list.filter(i => i.checked_at !== null).length;
    const total = list.length;
    const percentage = total > 0 ? Math.round((answered / total) * 100) : 0;
    return { answered, total, percentage };
  };

  const renderItem = (item: ChecklistItem) => {
    const isAnswered = item.checked_at !== null;
    const isV = item.is_checked === true;
    const isF = item.is_checked === false && isAnswered;
    const hasNotesField = ITEMS_WITH_NOTES.some(name => name.toLowerCase() === item.item_name.toLowerCase());
    return (
      <div key={item.id} className={`flex flex-col gap-1 p-2 rounded-lg border transition-colors ${isV ? 'bg-green-500/10 border-green-500/30' : isF ? 'bg-red-500/10 border-red-500/30' : 'bg-card border-border'}`}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Button size="sm" variant={isV ? 'default' : 'outline'} className={`h-7 w-7 p-0 text-xs font-bold ${isV ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`} onClick={() => setItemValue(item, true)} disabled={!canCheck || isSaving || isConfirmed}>V</Button>
            <Button size="sm" variant={isF ? 'default' : 'outline'} className={`h-7 w-7 p-0 text-xs font-bold ${isF ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`} onClick={() => setItemValue(item, false)} disabled={!canCheck || isSaving || isConfirmed}>X</Button>
          </div>
          <span className={`flex-1 text-sm ${isF ? 'text-red-600 font-medium' : ''}`}>{item.item_name}</span>
          {isV && <Check className="h-4 w-4 text-green-600" />}
          {isF && <AlertTriangle className="h-4 w-4 text-red-500" />}
        </div>
        {hasNotesField && (
          <div className="pl-[3.5rem] pr-1">
            <Input placeholder="Quantidade disponível..." value={item.notes || ''} onChange={(e) => updateItemNotes(item, e.target.value)} disabled={!canCheck || isConfirmed} className="text-xs h-7 py-1 w-full" />
          </div>
        )}
      </div>
    );
  };

  const status = getCompletionStatus(items);
  const equipAllAnswered = status.percentage === 100;

  // Step completion checks
  const isStepComplete = (idx: number): boolean => {
    if (isConfirmed) return true;
    switch (STEPS[idx].key) {
      case 'equipamentos':
        return equipAllAnswered;
      case 'uti':
        return utiRef.current?.isComplete() ?? false;
      case 'videos':
        return videosRef.current?.isComplete() ?? false;
      case 'combustivel':
        return fuelRef.current?.isStartComplete() ?? false;
    }
  };

  const goNext = () => {
    if (!isStepComplete(currentStep)) {
      toast({
        title: 'Atenção',
        description: 'Complete todos os campos desta etapa antes de avançar.',
        variant: 'destructive',
      });
      return;
    }
    setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setCurrentStep(s => Math.max(s - 1, 0));

  const confirmEquipamentos = async (): Promise<boolean> => {
    try {
      await supabase.from('checklist_items').delete().eq('event_id', eventId).eq('item_type', 'checklist_confirmed' as any);
      const { error } = await supabase.from('checklist_items').insert({
        event_id: eventId, item_type: 'checklist_confirmed' as any, item_name: 'CHECKLIST_CONFIRMADO',
        is_checked: true, checked_by: profile?.id, checked_at: new Date().toISOString(), empresa_id: profile?.empresa_id || null,
      });
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error confirming equipamentos:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível confirmar equipamentos.'), variant: 'destructive' });
      return false;
    }
  };

  const handleFinalize = async () => {
    if (!canCheck) {
      toast({ title: 'Sem permissão', description: 'Sua função não permite confirmar o checklist da viatura.', variant: 'destructive' });
      return;
    }
    // Validate every step
    for (let i = 0; i < STEPS.length; i++) {
      if (!isStepComplete(i)) {
        setCurrentStep(i);
        toast({
          title: 'Etapa incompleta',
          description: `Complete a etapa "${STEPS[i].label}" antes de finalizar.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setIsFinalizing(true);
    try {
      // Confirm in order: UTI, Videos, Fuel start, then equipamentos flag
      const utiOk = (await utiRef.current?.confirm()) ?? true;
      if (!utiOk) return;
      const videosOk = (await videosRef.current?.confirm()) ?? true;
      if (!videosOk) return;
      const fuelOk = (await fuelRef.current?.confirmStart()) ?? true;
      if (!fuelOk) return;
      const equipOk = await confirmEquipamentos();
      if (!equipOk) return;

      setIsConfirmed(true);
      toast({ title: 'Checklist finalizado', description: 'Todas as etapas foram confirmadas com sucesso.' });
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return <MainLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }

  const isLastStep = currentStep === STEPS.length - 1;
  const stepKey = STEPS[currentStep].key;

  return (
    <MainLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Checklist da Viatura
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isConfirmed && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-bold uppercase hidden sm:inline">Confirmado</span>
              </div>
            )}
          </div>
        </div>

        <ReadOnlyBanner show={!canCheck} message="Apenas condutores e administradores podem editar o checklist da viatura." />

        {/* Stepper header */}
        <div className="flex items-center justify-between gap-1 p-2 rounded-xl bg-muted/40 border">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = idx === currentStep;
            const isPast = idx < currentStep;
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    // Allow free navigation backwards; forward only if previous done
                    if (idx <= currentStep || isStepComplete(currentStep)) {
                      setCurrentStep(idx);
                    } else {
                      toast({
                        title: 'Atenção',
                        description: 'Complete a etapa atual antes de avançar.',
                        variant: 'destructive',
                      });
                    }
                  }}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg flex-1 transition-colors',
                    isActive && 'bg-primary text-primary-foreground shadow',
                    !isActive && isPast && 'text-primary',
                    !isActive && !isPast && 'text-muted-foreground'
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      'flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold border',
                      isActive && 'bg-primary-foreground text-primary border-primary-foreground',
                      !isActive && isPast && 'bg-primary text-primary-foreground border-primary',
                      !isActive && !isPast && 'border-muted-foreground/40'
                    )}>{idx + 1}</span>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn('h-0.5 w-2 rounded', idx < currentStep ? 'bg-primary' : 'bg-muted-foreground/20')} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="min-h-[200px]">
          {stepKey === 'equipamentos' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Equipamentos</CardTitle>
                    <Badge variant={status.percentage === 100 ? 'default' : 'secondary'}>{status.answered}/{status.total} ({status.percentage}%)</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">{items.map(renderItem)}</CardContent>
              </Card>

              {canManageItems && (
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-lg">Adicionar Item</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Input placeholder="Nome do item..." value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="flex-1" />
                      <Button onClick={addItem} disabled={!newItemName.trim() || isSaving}><Plus className="h-4 w-4 mr-2" />Adicionar</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Keep tabs mounted so refs persist while navigating */}
          <div className={stepKey === 'uti' ? '' : 'hidden'}>
            <UTIConditionsTab
              ref={utiRef}
              eventId={eventId!}
              canCheck={canCheck}
              profileId={profile?.id}
              empresaId={profile?.empresa_id}
              hideConfirmButton
            />
          </div>
          <div className={stepKey === 'videos' ? '' : 'hidden'}>
            <ChecklistVideoTab
              ref={videosRef}
              eventId={eventId!}
              canCheck={canCheck}
              profileId={profile?.id}
              empresaId={profile?.empresa_id}
              hideConfirmButton
            />
          </div>
          <div className={stepKey === 'combustivel' ? '' : 'hidden'}>
            <ChecklistFuelTab
              ref={fuelRef}
              eventId={eventId!}
              canCheck={canCheck}
              profileId={profile?.id}
              empresaId={profile?.empresa_id}
              hideStartConfirmButton
            />
          </div>
        </div>

        {/* Navigation */}
        {!isConfirmed ? (
          <div className="sticky bottom-0 bg-background/95 backdrop-blur pt-3 pb-2 border-t">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={goBack}
                disabled={currentStep === 0 || isFinalizing}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
              {!isLastStep ? (
                <Button
                  onClick={goNext}
                  disabled={isFinalizing}
                  className="flex-[2]"
                >
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleFinalize}
                  disabled={isFinalizing || !canCheck}
                  className="flex-[2] rounded-xl py-5 text-sm font-black uppercase tracking-widest"
                >
                  {isFinalizing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Finalizar Checklist
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Etapa {currentStep + 1} de {STEPS.length} · {STEPS[currentStep].label}
            </p>
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground bg-green-50 border border-green-200 rounded-2xl p-4">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
            Checklist finalizado com sucesso.
          </div>
        )}
      </div>
    </MainLayout>
  );
}
