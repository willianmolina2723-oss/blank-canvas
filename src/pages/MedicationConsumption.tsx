import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Pill, Plus, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';

interface MedItem {
  name: string;
  quantity: number;
  cost_item_id?: string;
  unit_cost?: number;
}

const db = supabase as any;

export default function MedicationConsumption() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { roles, profile } = useAuth();

  const [medications, setMedications] = useState<MedItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const [eventRole, setEventRole] = useState<string | null>(null);

  useEffect(() => {
    if (eventId && profile) {
      supabase.from('event_participants').select('role').eq('event_id', eventId).eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setEventRole(data?.role || null));
    }
  }, [eventId, profile]);

  const { canEditMedicationConsumption } = usePermissions({ eventRole: eventRole as any });
  const canEdit = canEditMedicationConsumption;

  useEffect(() => {
    if (eventId) loadData();
  }, [eventId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load saved consumption + cost_items via edge function
      const { data: response, error } = await supabase.functions.invoke('manage-checklist', {
        body: { action: 'load', event_id: eventId, item_type: 'consumo_medicamentos', include_cost_items: true, cost_items_category: 'medicamento' },
      });
      if (error) throw error;

      const saved = response?.data || [];
      const costItems = response?.cost_items || [];

      if (saved.length > 0) {
        setIsConfirmed(true);
        const savedMap = new Map<string, { qty: number; cost_item_id?: string }>();
        saved.forEach((d: any) => {
          savedMap.set(d.item_name, { qty: parseInt(d.notes || '0') || 0, cost_item_id: d.cost_item_id });
        });

        const loaded: MedItem[] = [];
        (costItems || []).forEach((ci: any) => {
          const s = savedMap.get(ci.name);
          loaded.push({ name: ci.name, quantity: s?.qty ?? 0, cost_item_id: ci.id, unit_cost: Number(ci.unit_cost) });
          savedMap.delete(ci.name);
        });
        savedMap.forEach((val, name) => {
          loaded.push({ name, quantity: val.qty, cost_item_id: val.cost_item_id });
        });
        setMedications(loaded);
      } else {
        const loaded: MedItem[] = (costItems || []).map((ci: any) => ({
          name: ci.name,
          quantity: 0,
          cost_item_id: ci.id,
          unit_cost: Number(ci.unit_cost),
        }));
        setMedications(loaded);
      }
    } catch (err) {
      console.error('Error loading medication consumption:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuantityChange = (index: number, value: string) => {
    if (isConfirmed) return;
    const qty = Math.max(0, parseInt(value) || 0);
    setMedications(prev => prev.map((m, i) => (i === index ? { ...m, quantity: qty } : m)));
  };

  const addCustomItem = () => {
    if (!newItemName.trim() || isConfirmed) return;
    setMedications(prev => [...prev, { name: newItemName.trim(), quantity: 0 }]);
    setNewItemName('');
  };

  const removeItem = (index: number) => {
    if (isConfirmed) return;
    const item = medications[index];
    if (item.cost_item_id) return; // Can't remove cost_items entries
    setMedications(prev => prev.filter((_, i) => i !== index));
  };

  const usedMeds = medications.filter(m => m.quantity > 0);

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const totalCost = usedMeds.reduce((sum, m) => sum + (m.unit_cost || 0) * m.quantity, 0);

  const handleConfirm = async () => {
    if (usedMeds.length === 0) {
      toast({
        title: 'Atenção',
        description: 'Registre a quantidade consumida de pelo menos um medicamento.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const items = usedMeds.map(med => ({
        item_name: med.name,
        notes: med.quantity.toString(),
        cost_item_id: med.cost_item_id || null,
      }));

      const { error } = await supabase.functions.invoke('manage-checklist', {
        body: { action: 'save', event_id: eventId, item_type: 'consumo_medicamentos', items },
      });

      if (error) throw error;

      setIsConfirmed(true);
      toast({ title: 'Sucesso', description: 'Consumo de medicamentos confirmado.' });
    } catch (err) {
      console.error('Error saving medication consumption:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível salvar.'), variant: 'destructive' });
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

  // Separate items with cost_item_id (from cost table) and custom items
  const costTableItems = medications.filter(m => m.cost_item_id);
  const customItems = medications.filter(m => !m.cost_item_id);

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-black tracking-tight uppercase flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              Consumo de Medicamentos
            </h1>
            <p className="text-xs text-muted-foreground">Medicamentos utilizados no evento</p>
          </div>
          {isConfirmed && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-xs font-bold uppercase">Confirmado</span>
              </div>
              {canEdit && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setIsConfirmed(false)}>
                  Editar
                </Button>
              )}
            </div>
          )}
        </div>

        {!canEdit && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-3">
              <p className="text-sm text-center">
                Apenas profissionais de saúde podem registrar consumo de medicamentos.
              </p>
            </CardContent>
          </Card>
        )}

        {medications.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Pill className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum medicamento cadastrado na tabela de custos.</p>
              <p className="text-xs mt-1">Cadastre medicamentos em Financeiro → Tabela de Custos.</p>
            </CardContent>
          </Card>
        )}

        {/* Cost table medications */}
        {costTableItems.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase">Medicamentos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {costTableItems.map((med) => {
                  const globalIndex = medications.indexOf(med);
                  return (
                    <div key={med.cost_item_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1">
                        <span className="text-xs font-semibold">{med.name}</span>
                        {med.unit_cost ? (
                          <span className="text-[10px] text-muted-foreground ml-2">{fmt(med.unit_cost)}/un</span>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold">Qtde</span>
                        <Input
                          type="number"
                          min="0"
                          value={med.quantity}
                          onChange={(e) => handleQuantityChange(globalIndex, e.target.value)}
                          className="h-7 w-14 text-center text-xs font-bold border-primary/30 bg-primary/5"
                          disabled={isConfirmed || !canEdit}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Custom items */}
        {customItems.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase">Itens Adicionados</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {customItems.map((med) => {
                  const globalIndex = medications.indexOf(med);
                  return (
                    <div key={`custom-${globalIndex}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 text-xs font-semibold">{med.name}</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={med.quantity}
                          onChange={(e) => handleQuantityChange(globalIndex, e.target.value)}
                          className="h-7 w-14 text-center text-xs font-bold border-primary/30 bg-primary/5"
                          disabled={isConfirmed || !canEdit}
                        />
                        {!isConfirmed && canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(globalIndex)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add custom item */}
        {canEdit && !isConfirmed && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Adicionar Medicamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome do medicamento..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && addCustomItem()}
                />
                <Button onClick={addCustomItem} disabled={!newItemName.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {usedMeds.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumo do Consumo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {usedMeds.map((m, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>{m.name} × {m.quantity}</span>
                    <span className="font-bold">{m.unit_cost ? fmt(m.unit_cost * m.quantity) : '-'}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between text-sm font-bold">
                  <span>Total Estimado</span>
                  <span>{fmt(totalCost)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirm button */}
        {canEdit && !isConfirmed ? (
          <Button
            onClick={handleConfirm}
            disabled={usedMeds.length === 0 || isSaving}
            className="w-full rounded-2xl py-6 text-sm font-black uppercase tracking-widest"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Confirmar Consumo de Medicamentos
          </Button>
        ) : isConfirmed ? (
          <div className="text-center text-sm text-muted-foreground bg-green-50 border border-green-200 rounded-2xl p-4">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
            Consumo de medicamentos confirmado com sucesso.
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
}
