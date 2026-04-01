import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReadOnly } from '@/hooks/useReadOnly';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Truck, Pencil, Trash2, Loader2, Wrench, Search, CalendarDays, Hash, Fuel } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import type { Ambulance as AmbulanceType } from '@/types/database';
import { MaintenanceHistory } from './MaintenanceHistory';

const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'ocupada', label: 'Ocupada' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'inativo', label: 'Inativo' },
];

interface AmbulanceForm {
  code: string;
  plate: string;
  model: string;
  year: string;
  status: string;
  km_per_liter: string;
}

const emptyForm: AmbulanceForm = {
  code: '', plate: '', model: '', year: '', status: 'disponivel', km_per_liter: '',
};

export function AmbulanceManagement({ onAdd }: { onAdd?: (fn: () => void) => void }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingAmbulance, setEditingAmbulance] = useState<AmbulanceType | null>(null);
  const [form, setForm] = useState<AmbulanceForm>(emptyForm);
  const [maintenanceAmbulance, setMaintenanceAmbulance] = useState<AmbulanceType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { isReadOnly } = useReadOnly();

  const { data: ambulances = [], isLoading } = useQuery({
    queryKey: ['admin-ambulances', debouncedSearch],
    queryFn: async () => {
      let query = supabase.from('ambulances').select('*').order('code');
      if (debouncedSearch) {
        query = query.or(`code.ilike.%${debouncedSearch}%,plate.ilike.%${debouncedSearch}%,model.ilike.%${debouncedSearch}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AmbulanceType[];
    },
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-ambulances'] });

  useEffect(() => {
    onAdd?.(() => handleOpenDialog());
  }, [onAdd]);

  const handleOpenDialog = (ambulance?: AmbulanceType) => {
    if (ambulance) {
      setEditingAmbulance(ambulance);
      setForm({
        code: ambulance.code,
        plate: ambulance.plate || '',
        model: ambulance.model || '',
        year: ambulance.year?.toString() || '',
        status: ambulance.status || 'disponivel',
        km_per_liter: ambulance.km_per_liter?.toString() || '',
      });
    } else {
      setEditingAmbulance(null);
      setForm(emptyForm);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAmbulance(null);
    setForm(emptyForm);
  };

  const handleSubmit = async () => {
    if (!form.code.trim()) {
      toast({ title: 'Erro', description: 'O código da viatura é obrigatório.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const ambulanceData: any = {
        code: form.code.trim(),
        plate: form.plate.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? parseInt(form.year) : null,
        status: form.status,
        km_per_liter: form.km_per_liter ? parseFloat(form.km_per_liter) : null,
      };

      if (editingAmbulance) {
        const { error } = await supabase.from('ambulances').update(ambulanceData).eq('id', editingAmbulance.id);
        if (error) throw error;
        toast({ title: 'Viatura atualizada', description: `A viatura ${form.code} foi atualizada com sucesso.` });
      } else {
        ambulanceData.empresa_id = profile?.empresa_id;
        const { error } = await supabase.from('ambulances').insert(ambulanceData);
        if (error) throw error;
        toast({ title: 'Viatura cadastrada', description: `A viatura ${form.code} foi cadastrada com sucesso.` });
      }

      handleCloseDialog();
      invalidate();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível salvar a viatura.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (ambulance: AmbulanceType) => {
    if (!confirm(`Tem certeza que deseja excluir a viatura ${ambulance.code}?`)) return;
    try {
      const { error } = await supabase.from('ambulances').delete().eq('id', ambulance.id);
      if (error) throw error;
      toast({ title: 'Viatura excluída', description: `A viatura ${ambulance.code} foi excluída.` });
      invalidate();
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível excluir a viatura.', variant: 'destructive' });
    }
  };

  const getStatusConfig = (status: string | null) => {
    switch (status) {
      case 'disponivel': return { label: 'Disponível', className: 'bg-green-500/10 text-green-700 border-green-500/20' };
      case 'ocupada':    return { label: 'Ocupada',    className: 'bg-blue-500/10 text-blue-700 border-blue-500/20' };
      case 'manutencao': return { label: 'Manutenção', className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' };
      case 'inativo':    return { label: 'Inativo',    className: 'bg-muted text-muted-foreground border-border' };
      default:           return { label: status || '-', className: '' };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por código, placa ou modelo..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {ambulances.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Truck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {searchTerm ? 'Nenhuma viatura encontrada' : 'Nenhuma viatura cadastrada'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ambulances.map((ambulance) => {
            const status = getStatusConfig(ambulance.status);
            return (
              <Card key={ambulance.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Truck className="h-7 w-7 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-foreground text-lg">{ambulance.code}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                          {ambulance.plate && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Hash className="h-3 w-3" />{ambulance.plate}
                            </span>
                          )}
                          {ambulance.model && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Truck className="h-3 w-3" />{ambulance.model}
                            </span>
                          )}
                          {ambulance.year && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="h-3 w-3" />{ambulance.year}
                            </span>
                          )}
                          {ambulance.km_per_liter && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Fuel className="h-3 w-3" />{ambulance.km_per_liter} km/l
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:flex-shrink-0 flex-wrap">
                      <Button variant="outline" size="sm" className="flex-1 sm:flex-initial gap-1.5" onClick={() => setMaintenanceAmbulance(ambulance)}>
                        <Wrench className="h-4 w-4" /><span className="sm:hidden">Manutenção</span>
                      </Button>
                      {!isReadOnly && (
                        <>
                          <Button variant="outline" size="sm" className="flex-1 sm:flex-initial gap-1.5" onClick={() => handleOpenDialog(ambulance)}>
                            <Pencil className="h-4 w-4" /><span className="sm:hidden">Editar</span>
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1 sm:flex-initial gap-1.5" onClick={() => handleDelete(ambulance)}>
                            <Trash2 className="h-4 w-4 text-destructive" /><span className="sm:hidden text-destructive">Excluir</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAmbulance ? 'Editar Viatura' : 'Nova Viatura'}</DialogTitle>
            <DialogDescription>
              {editingAmbulance ? 'Atualize os dados da viatura' : 'Preencha os dados da nova viatura'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input id="code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ex: VTR-001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plate">Placa</Label>
              <Input id="plate" value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder="Ex: ABC-1234" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model">Modelo</Label>
                <Input id="model" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Ex: Sprinter" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Ano</Label>
                <Input id="year" type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="Ex: 2023" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="km_per_liter">Km por Litro</Label>
              <Input id="km_per_liter" type="number" step="0.1" value={form.km_per_liter} onChange={e => setForm({ ...form, km_per_liter: e.target.value })} placeholder="Ex: 8.5" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={value => setForm({ ...form, status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingAmbulance ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {maintenanceAmbulance && (
        <MaintenanceHistory
          ambulanceId={maintenanceAmbulance.id}
          ambulanceCode={maintenanceAmbulance.code}
          open={!!maintenanceAmbulance}
          onOpenChange={open => { if (!open) setMaintenanceAmbulance(null); }}
        />
      )}
    </div>
  );
}
