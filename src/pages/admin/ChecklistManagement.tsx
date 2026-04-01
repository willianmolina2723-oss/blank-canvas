import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Plus, Trash2, Loader2, ClipboardCheck, Search } from 'lucide-react';

interface ChecklistTemplate {
  id: string;
  item_name: string;
  item_type: string;
}

const ITEM_TYPES = [
  { value: 'pre_atendimento', label: 'Pré-Atendimento' },
  { value: 'pos_atendimento', label: 'Pós-Atendimento' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'medicamento', label: 'Medicamento' },
  { value: 'documento', label: 'Documento' },
];

export default function ChecklistManagementPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<ChecklistTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState('pre_atendimento');

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      // Fetch unique checklist items as templates
      const { data, error } = await supabase
        .from('checklist_items')
        .select('item_name, item_type')
        .order('item_type')
        .order('item_name');

      if (error) throw error;

      // Get unique items
      const uniqueItems = new Map<string, ChecklistTemplate>();
      (data || []).forEach((item, index) => {
        const key = `${item.item_type}-${item.item_name}`;
        if (!uniqueItems.has(key)) {
          uniqueItems.set(key, {
            id: `${index}`,
            item_name: item.item_name,
            item_type: item.item_type,
          });
        }
      });

      setTemplates(Array.from(uniqueItems.values()));
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Erro',
        description: explainError(error, 'Não foi possível carregar os itens do checklist.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome do item é obrigatório.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // Get all active events to add this item to them
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id')
        .in('status', ['ativo', 'em_andamento']);

      if (eventsError) throw eventsError;

      // Add item to all active events
      if (events && events.length > 0) {
        const itemsToInsert = events.map(event => ({
          event_id: event.id,
          item_name: newItemName.trim(),
          item_type: newItemType,
          is_checked: false,
        }));

        const { error: insertError } = await supabase
          .from('checklist_items')
          .insert(itemsToInsert);

        if (insertError) throw insertError;
      }

      toast({
        title: 'Item adicionado',
        description: `O item "${newItemName}" foi adicionado ao checklist.`,
      });

      setNewItemName('');
      setNewItemType('pre_atendimento');
      setIsAddDialogOpen(false);
      fetchTemplates();
    } catch (error: any) {
      console.error('Error adding item:', error);
      toast({
        title: 'Erro',
        description: explainError(error, 'Não foi possível adicionar o item.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!templateToDelete) return;

    setIsDeleting(true);
    try {
      // Delete all checklist items with this name and type
      const { error } = await supabase
        .from('checklist_items')
        .delete()
        .eq('item_name', templateToDelete.item_name)
        .eq('item_type', templateToDelete.item_type);

      if (error) throw error;

      toast({
        title: 'Item removido',
        description: `O item "${templateToDelete.item_name}" foi removido do checklist.`,
      });

      setTemplateToDelete(null);
      fetchTemplates();
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível remover o item.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.item_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeLabel = (type: string) => {
    const found = ITEM_TYPES.find(t => t.value === type);
    return found?.label || type;
  };

  if (authLoading || isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciar Checklist</h1>
            <p className="text-muted-foreground">Adicione ou remova itens do checklist</p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Itens do Checklist
              </CardTitle>
              <CardDescription>
                Itens que serão incluídos automaticamente nos novos eventos
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Item ao Checklist</DialogTitle>
                  <DialogDescription>
                    Este item será adicionado a todos os eventos ativos.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="item_name">Nome do Item</Label>
                    <Input
                      id="item_name"
                      placeholder="Ex: Kit de Primeiros Socorros"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="item_type">Tipo</Label>
                    <Select value={newItemType} onValueChange={setNewItemType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddItem} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou tipo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        {searchTerm ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTemplates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.item_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getTypeLabel(template.item_type)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTemplateToDelete(template)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Item</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover o item <strong>{templateToDelete?.item_name}</strong>?
                Este item será removido de todos os eventos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteItem}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}