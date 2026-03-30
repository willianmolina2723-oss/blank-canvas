import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ClipboardCheck, Plus, Loader2, Check, AlertTriangle, Car, CheckCircle2, Video, Fuel } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UTIConditionsTab } from '@/components/checklist/UTIConditionsTab';
import { ChecklistVideoTab } from '@/components/checklist/ChecklistVideoTab';
import { ChecklistFuelTab } from '@/components/checklist/ChecklistFuelTab';
import type { ChecklistItem } from '@/types/database';

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

export default function Checklist() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, roles, user } = useAuth();
  const { toast } = useToast();
  
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  const canCheck = roles.includes('condutor') || roles.includes('admin');
  const canManageItems = roles.includes('admin');

  useEffect(() => {
    if (eventId) {
      loadChecklist();
    }
  }, [eventId]);

  const loadChecklist = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const loaded = data as ChecklistItem[];
      
      // Check if confirmed flag exists
      const confirmFlag = loaded.find(i => (i.item_type as string) === 'checklist_confirmed');
      setIsConfirmed(!!confirmFlag);

      // Filter out the flag and other types from displayed items
      const displayItems = loaded.filter(i => {
        const t = i.item_type as string;
        return t !== 'checklist_confirmed' && t !== 'uti' && t !== 'uti_confirmed' && t !== 'psicotropicos' && t !== 'psicotropicos_confirmed' && !t.startsWith('video_') && t !== 'videos_confirmed';
      });
      
      if (displayItems.length === 0 && (canCheck || canManageItems)) {
        await createDefaultItems();
        return;
      }

      setItems(displayItems);
    } catch (err) {
      console.error('Error loading checklist:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o checklist.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetChecklist = async () => {
    setIsSaving(true);
    try {
      await supabase
        .from('checklist_items')
        .delete()
        .eq('event_id', eventId);

      await createDefaultItems();
    } catch (err) {
      console.error('Error resetting checklist:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const createDefaultItems = async () => {
    try {
      const allItems = DEFAULT_ITEMS.map(name => ({
        event_id: eventId,
        item_type: 'pre',
        item_name: name,
        is_checked: false,
        empresa_id: profile?.empresa_id || null,
      }));

      const { error } = await supabase
        .from('checklist_items')
        .insert(allItems);

      if (error) throw error;
      
      await loadChecklist();
    } catch (err) {
      console.error('Error creating default items:', err);
    }
  };

  const setItemValue = async (item: ChecklistItem, value: boolean) => {
    if (!canCheck || isConfirmed) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('checklist_items')
        .update({
          is_checked: value,
          checked_by: profile?.id,
          checked_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      setItems(prev =>
        prev.map(i =>
          i.id === item.id
            ? { ...i, is_checked: value, checked_by: profile?.id || null, checked_at: new Date().toISOString() }
            : i
        )
      );
    } catch (err) {
      console.error('Error updating item:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o item.',
        variant: 'destructive',
      });
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
        .insert({
          event_id: eventId,
          item_type: 'pre',
          item_name: newItemName.trim(),
          is_checked: false,
          empresa_id: profile?.empresa_id || null,
        })
        .select()
        .single();

      if (error) throw error;

      setItems(prev => [...prev, data as ChecklistItem]);
      setNewItemName('');

      toast({
        title: 'Item adicionado',
        description: 'O item foi adicionado ao checklist.',
      });
    } catch (err) {
      console.error('Error adding item:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o item.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateItemNotes = async (item: ChecklistItem, notes: string) => {
    try {
      await supabase
        .from('checklist_items')
        .update({ notes })
        .eq('id', item.id);

      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, notes } : i)
      );
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
      <div
        key={item.id}
        className={`flex flex-col gap-1 p-2 rounded-lg border transition-colors ${
          isV ? 'bg-green-500/10 border-green-500/30' : isF ? 'bg-red-500/10 border-red-500/30' : 'bg-card border-border'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={isV ? 'default' : 'outline'}
              className={`h-7 w-7 p-0 text-xs font-bold ${isV ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
              onClick={() => setItemValue(item, true)}
              disabled={!canCheck || isSaving || isConfirmed}
            >
              V
            </Button>
            <Button
              size="sm"
              variant={isF ? 'default' : 'outline'}
              className={`h-7 w-7 p-0 text-xs font-bold ${isF ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
              onClick={() => setItemValue(item, false)}
              disabled={!canCheck || isSaving || isConfirmed}
            >
              X
            </Button>
          </div>
          <span className={`flex-1 text-sm ${isF ? 'text-red-600 font-medium' : ''}`}>
            {item.item_name}
          </span>
          {isV && <Check className="h-4 w-4 text-green-600" />}
          {isF && <AlertTriangle className="h-4 w-4 text-red-500" />}
        </div>
        {hasNotesField && (
          <div className="pl-[3.5rem] pr-1">
            <Input
              placeholder="Quantidade disponível..."
              value={item.notes || ''}
              onChange={(e) => updateItemNotes(item, e.target.value)}
              disabled={!canCheck || isConfirmed}
              className="text-xs h-7 py-1 w-full"
            />
          </div>
        )}
      </div>
    );
  };

  const status = getCompletionStatus(items);
  const allAnswered = status.percentage === 100;

  const handleConfirmChecklist = async () => {
    if (!allAnswered) {
      toast({ title: 'Atenção', description: 'Todos os itens devem ser respondidos antes de confirmar.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      await supabase.from('checklist_items').delete().eq('event_id', eventId).eq('item_type', 'checklist_confirmed' as any);
      const { error } = await supabase.from('checklist_items').insert({
        event_id: eventId,
        item_type: 'checklist_confirmed' as any,
        item_name: 'CHECKLIST_CONFIRMADO',
        is_checked: true,
        checked_by: profile?.id,
        checked_at: new Date().toISOString(),
        empresa_id: profile?.empresa_id || null,
      });
      if (error) throw error;
      setIsConfirmed(true);
      toast({ title: 'Sucesso', description: 'Checklist confirmado com sucesso.' });
    } catch (err) {
      console.error('Error confirming checklist:', err);
      toast({ title: 'Erro', description: 'Não foi possível confirmar o checklist.', variant: 'destructive' });
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
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
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

        <Tabs defaultValue="equipamentos" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="equipamentos" className="flex-1 gap-1.5 text-xs">
              <ClipboardCheck className="h-4 w-4" />
              Equip.
            </TabsTrigger>
            <TabsTrigger value="uti" className="flex-1 gap-1.5 text-xs">
              <Car className="h-4 w-4" />
              UTI
            </TabsTrigger>
            <TabsTrigger value="videos" className="flex-1 gap-1.5 text-xs">
              <Video className="h-4 w-4" />
              Vídeos
            </TabsTrigger>
            <TabsTrigger value="combustivel" className="flex-1 gap-1.5 text-xs">
              <Fuel className="h-4 w-4" />
              KM
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equipamentos" className="space-y-4 mt-4">
            {!canCheck && (
              <Card className="border-warning bg-warning/10">
                <CardContent className="py-3">
                  <p className="text-sm text-center flex items-center justify-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Apenas condutores podem marcar itens do checklist.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Equipamentos</CardTitle>
                  <Badge variant={status.percentage === 100 ? 'default' : 'secondary'}>
                    {status.answered}/{status.total} ({status.percentage}%)
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map(renderItem)}
              </CardContent>
            </Card>

            {canManageItems && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Adicionar Item</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome do item..."
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={addItem} disabled={!newItemName.trim() || isSaving}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Confirm button */}
            {canCheck && !isConfirmed ? (
              <Button
                onClick={handleConfirmChecklist}
                disabled={!allAnswered || isSaving}
                className="w-full rounded-2xl py-6 text-sm font-black uppercase tracking-widest"
              >
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirmar Checklist
              </Button>
            ) : isConfirmed ? (
              <div className="text-center text-sm text-muted-foreground bg-green-50 border border-green-200 rounded-2xl p-4">
                <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
                Checklist confirmado com sucesso.
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="uti" className="mt-4">
            <UTIConditionsTab eventId={eventId!} canCheck={canCheck} profileId={profile?.id} empresaId={profile?.empresa_id} />
          </TabsContent>

          <TabsContent value="videos" className="mt-4">
            <ChecklistVideoTab
              eventId={eventId!}
              canCheck={canCheck}
              profileId={profile?.id}
              empresaId={profile?.empresa_id}
              userId={user?.id}
            />
          </TabsContent>

          <TabsContent value="combustivel" className="mt-4">
            <ChecklistFuelTab eventId={eventId!} canCheck={canCheck} profileId={profile?.id} empresaId={profile?.empresa_id} />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
