import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Plus, Pill, Package, Pencil, Save, X, Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

const db = supabase as any;

export default function FinancialCosts() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', unit: 'un', unit_cost: 0 });
  const [showNew, setShowNew] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', category: 'medicamento', unit: 'un', unit_cost: 0 });
  const [searchMed, setSearchMed] = useState('');
  const [searchMat, setSearchMat] = useState('');
  const debouncedSearchMed = useDebounce(searchMed, 300);
  const debouncedSearchMat = useDebounce(searchMat, 300);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/');
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data } = await db.from('cost_items').select('*').order('category').order('name');
      setItems(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createItem = async () => {
    if (!newItem.name.trim()) return;
    try {
      await db.from('cost_items').insert(newItem);
      setNewItem({ name: '', category: 'medicamento', unit: 'un', unit_cost: 0 });
      setShowNew(false);
      await loadData();
      toast({ title: 'Sucesso', description: 'Item criado.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const updateItem = async (id: string) => {
    try {
      await db.from('cost_items').update(editData).eq('id', id);
      setEditingId(null);
      await loadData();
      toast({ title: 'Salvo' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await db.from('cost_items').update({ is_active: !current }).eq('id', id);
    await loadData();
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const medications = useMemo(() => {
    const list = items.filter((i: any) => i.category === 'medicamento');
    if (!debouncedSearchMed) return list;
    const q = debouncedSearchMed.toLowerCase();
    return list.filter((i: any) => i.name.toLowerCase().includes(q));
  }, [items, debouncedSearchMed]);

  const materials = useMemo(() => {
    const list = items.filter((i: any) => i.category === 'material');
    if (!debouncedSearchMat) return list;
    const q = debouncedSearchMat.toLowerCase();
    return list.filter((i: any) => i.name.toLowerCase().includes(q));
  }, [items, debouncedSearchMat]);

  if (authLoading || isLoading) {
    return <MainLayout><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }
  if (!isAdmin) return null;

  const renderItems = (list: any[], category: string) => (
    <div className="space-y-2">
      {list.map((item: any) => (
        <div key={item.id} className={`flex items-center justify-between p-3 border rounded-xl ${!item.is_active ? 'opacity-50' : ''}`}>
          {editingId === item.id ? (
            <div className="flex-1 grid grid-cols-3 gap-2 mr-2">
              <Input value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" />
              <Input value={editData.unit} onChange={e => setEditData(p => ({ ...p, unit: e.target.value }))} className="h-8 text-xs" />
              <Input type="number" step="0.01" value={editData.unit_cost} onChange={e => setEditData(p => ({ ...p, unit_cost: Number(e.target.value) }))} className="h-8 text-xs" />
            </div>
          ) : (
            <div className="flex-1">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.unit} • {fmt(Number(item.unit_cost))}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {editingId === item.id ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => updateItem(item.id)}><Save className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
              </>
            ) : (
              <>
                <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item.id, item.is_active)} />
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(item.id); setEditData({ name: item.name, unit: item.unit, unit_cost: Number(item.unit_cost) }); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
      {showNew && newItem.category === category && (
        <div className="grid grid-cols-4 gap-2 p-3 border rounded-xl border-dashed">
          <Input placeholder="Nome" value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" />
          <Input placeholder="Unidade" value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))} className="h-8 text-xs" />
          <Input type="number" step="0.01" placeholder="Custo" value={newItem.unit_cost || ''} onChange={e => setNewItem(p => ({ ...p, unit_cost: Number(e.target.value) }))} className="h-8 text-xs" />
          <div className="flex gap-1">
            <Button size="sm" className="h-8" onClick={createItem}><Save className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowNew(false)}><X className="h-3 w-3" /></Button>
          </div>
        </div>
      )}
      <Button variant="outline" size="sm" className="w-full" onClick={() => { setShowNew(true); setNewItem(p => ({ ...p, category })); }}>
        <Plus className="h-4 w-4 mr-1" /> Adicionar
      </Button>
    </div>
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/financial')}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-xl font-bold">Tabela de Custos</h1>
            <p className="text-sm text-muted-foreground">Custos unitários de medicamentos e materiais</p>
          </div>
        </div>

        <Tabs defaultValue="medicamentos">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="medicamentos" className="gap-2"><Pill className="h-4 w-4" /> Medicamentos ({medications.length})</TabsTrigger>
            <TabsTrigger value="materiais" className="gap-2"><Package className="h-4 w-4" /> Materiais ({materials.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="medicamentos">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar medicamento..." value={searchMed} onChange={e => setSearchMed(e.target.value)} className="pl-10" />
              </div>
              {renderItems(medications, 'medicamento')}
            </div>
          </TabsContent>
          <TabsContent value="materiais">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar material..." value={searchMat} onChange={e => setSearchMat(e.target.value)} className="pl-10" />
              </div>
              {renderItems(materials, 'material')}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
