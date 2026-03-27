import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Empresa, PlanoEmpresa, StatusAssinatura } from '@/types/database';
import { PLANO_LABELS, STATUS_ASSINATURA_LABELS } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Building2, Search, Crown, Pencil, Ban, CheckCircle, Plus,
  TrendingUp, Users, AlertTriangle, DollarSign, BarChart3,
  Calendar, Eye, ArrowLeft, Trash2,
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { formatBR } from '@/utils/dateFormat';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const db = supabase as any;

const PLAN_PRICES: Record<PlanoEmpresa, number> = {
  OPERACIONAL: 397,
  GESTAO_EQUIPE: 597,
  GESTAO_COMPLETA: 897,
};

const getDefaultVencimento = () => {
  const d = new Date();
  d.setDate(d.getDate() + 31); // tomorrow + 30 days
  return formatBR(d, 'yyyy-MM-dd');
};

export default function SuperAdmin() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [viewingEmpresa, setViewingEmpresa] = useState<Empresa | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ empresa: Empresa; action: 'suspend' | 'activate' | 'delete' } | null>(null);

  const [createForm, setCreateForm] = useState({
    nome_fantasia: '',
    razao_social: '',
    cnpj: '',
    telefone: '',
    email: '',
    plano: 'OPERACIONAL' as PlanoEmpresa,
    valor_plano: PLAN_PRICES.OPERACIONAL,
    limite_usuarios: 50,
    data_vencimento: getDefaultVencimento(),
    admin_name: '',
    admin_email: '',
    admin_password: '',
  });

  const handleCreatePlanChange = (plano: PlanoEmpresa) => {
    setCreateForm(f => ({
      ...f,
      plano,
      valor_plano: PLAN_PRICES[plano],
      data_vencimento: getDefaultVencimento(),
    }));
  };

  const handleEditPlanChange = (plano: PlanoEmpresa) => {
    setEditForm(f => ({
      ...f,
      plano,
      valor_plano: PLAN_PRICES[plano],
      data_vencimento: getDefaultVencimento(),
    }));
  };

  const [editForm, setEditForm] = useState({
    plano: 'OPERACIONAL' as PlanoEmpresa,
    valor_plano: 0,
    limite_usuarios: 50,
    data_vencimento: '',
    status_assinatura: 'ATIVA' as StatusAssinatura,
  });

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) navigate('/');
  }, [isSuperAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isSuperAdmin) fetchEmpresas();
  }, [isSuperAdmin]);

  const fetchEmpresas = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await db.from('empresas').select('*').order('nome_fantasia');
      if (error) throw error;
      setEmpresas((data || []) as Empresa[]);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // KPI calculations
  const kpis = useMemo(() => {
    const ativas = empresas.filter(e => e.status_assinatura === 'ATIVA').length;
    const trial = empresas.filter(e => e.status_assinatura === 'TRIAL').length;
    const suspensas = empresas.filter(e => ['SUSPENSA', 'CANCELADA'].includes(e.status_assinatura)).length;
    const mrr = empresas
      .filter(e => ['ATIVA', 'TRIAL'].includes(e.status_assinatura))
      .reduce((sum, e) => sum + (e.valor_plano || 0), 0);
    const ticketMedio = ativas + trial > 0 ? mrr / (ativas + trial) : 0;
    return { ativas, trial, suspensas, mrr, ticketMedio, total: empresas.length };
  }, [empresas]);

  // Chart data
  const planDistribution = useMemo(() => {
    const counts: Record<string, number> = { OPERACIONAL: 0, GESTAO_EQUIPE: 0, GESTAO_COMPLETA: 0 };
    empresas.forEach(e => { counts[e.plano] = (counts[e.plano] || 0) + 1; });
    return [
      { name: 'Operacional', value: counts.OPERACIONAL, color: 'hsl(var(--primary))' },
      { name: 'Gestão Equipe', value: counts.GESTAO_EQUIPE, color: 'hsl(var(--accent))' },
      { name: 'Gestão Completa', value: counts.GESTAO_COMPLETA, color: 'hsl(var(--destructive))' },
    ].filter(d => d.value > 0);
  }, [empresas]);

  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    empresas.forEach(e => { counts[e.status_assinatura] = (counts[e.status_assinatura] || 0) + 1; });
    return Object.entries(counts).map(([key, value]) => ({
      name: STATUS_ASSINATURA_LABELS[key as StatusAssinatura] || key,
      quantidade: value,
    }));
  }, [empresas]);

  const handleCreateEmpresa = async () => {
    if (!createForm.admin_email || !createForm.admin_password || !createForm.admin_name) {
      toast({ title: 'Preencha os dados do administrador', variant: 'destructive' });
      return;
    }
    const pw = createForm.admin_password;
    if (pw.length < 8 || !/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
      toast({ title: 'Senha deve ter no mínimo 8 caracteres com maiúscula, minúscula, número e caractere especial', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-empresa-admin', {
        body: {
          empresa: {
            nome_fantasia: createForm.nome_fantasia,
            razao_social: createForm.razao_social || null,
            cnpj: createForm.cnpj || null,
            telefone: createForm.telefone || null,
            email: createForm.email || null,
            plano: createForm.plano,
            valor_plano: createForm.valor_plano,
            limite_usuarios: createForm.limite_usuarios,
            data_vencimento: createForm.data_vencimento || null,
          },
          admin_email: createForm.admin_email,
          admin_password: createForm.admin_password,
          admin_name: createForm.admin_name,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Empresa e administrador criados com sucesso!' });
      setShowCreateDialog(false);
      setCreateForm({ nome_fantasia: '', razao_social: '', cnpj: '', telefone: '', email: '', plano: 'OPERACIONAL', valor_plano: PLAN_PRICES.OPERACIONAL, limite_usuarios: 50, data_vencimento: getDefaultVencimento(), admin_name: '', admin_email: '', admin_password: '' });
      fetchEmpresas();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdateEmpresa = async () => {
    if (!editingEmpresa) return;
    try {
      const { error } = await db.from('empresas').update({
        plano: editForm.plano,
        valor_plano: editForm.valor_plano,
        limite_usuarios: editForm.limite_usuarios,
        data_vencimento: editForm.data_vencimento || null,
        status_assinatura: editForm.status_assinatura,
      }).eq('id', editingEmpresa.id);
      if (error) throw error;
      toast({ title: 'Empresa atualizada' });
      setEditingEmpresa(null);
      fetchEmpresas();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const openEditDialog = (empresa: Empresa) => {
    setEditForm({
      plano: empresa.plano,
      valor_plano: empresa.valor_plano || 0,
      limite_usuarios: empresa.limite_usuarios || 50,
      data_vencimento: empresa.data_vencimento || '',
      status_assinatura: empresa.status_assinatura,
    });
    setEditingEmpresa(empresa);
  };

  const handleToggleStatus = async () => {
    if (!confirmAction) return;
    const { empresa, action } = confirmAction;
    try {
      if (action === 'delete') {
        const { data, error } = await supabase.functions.invoke('delete-empresa', {
          body: { empresa_id: empresa.id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast({ title: 'Empresa excluída com sucesso' });
        if (viewingEmpresa?.id === empresa.id) setViewingEmpresa(null);
      } else {
        const newStatus: StatusAssinatura = action === 'suspend' ? 'SUSPENSA' : 'ATIVA';
        const { error } = await db.from('empresas').update({ status_assinatura: newStatus }).eq('id', empresa.id);
        if (error) throw error;
        toast({ title: `Empresa ${action === 'suspend' ? 'suspensa' : 'ativada'}` });
      }
      fetchEmpresas();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setConfirmAction(null);
    }
  };

  const getStatusBadge = (status: StatusAssinatura) => {
    const variants: Record<StatusAssinatura, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      ATIVA: 'default', TRIAL: 'secondary', PENDENTE: 'outline', SUSPENSA: 'destructive', CANCELADA: 'destructive',
    };
    return <Badge variant={variants[status]}>{STATUS_ASSINATURA_LABELS[status]}</Badge>;
  };

  const getDiasRestantes = (empresa: Empresa) => {
    if (!empresa.data_vencimento) return null;
    const dias = differenceInDays(parseISO(empresa.data_vencimento), new Date());
    return dias;
  };

  const filteredEmpresas = empresas.filter(e =>
    e.nome_fantasia.toLowerCase().includes(search.toLowerCase()) ||
    (e.cnpj && e.cnpj.includes(search))
  );

  if (authLoading || (!isSuperAdmin && !authLoading)) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (viewingEmpresa) {
    const dias = getDiasRestantes(viewingEmpresa);
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setViewingEmpresa(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{viewingEmpresa.nome_fantasia}</h1>
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge(viewingEmpresa.status_assinatura)}
                <Badge variant="outline">{PLANO_LABELS[viewingEmpresa.plano]}</Badge>
              </div>
            </div>
            <Button variant="outline" onClick={() => openEditDialog(viewingEmpresa)} className="gap-2">
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Valor Mensal</p>
                <p className="text-xl font-bold">R$ {(viewingEmpresa.valor_plano || 0).toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Limite Usuários</p>
                <p className="text-xl font-bold">{viewingEmpresa.limite_usuarios || '∞'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Início</p>
                <p className="text-xl font-bold">
                  {viewingEmpresa.data_inicio ? formatBR(parseISO(viewingEmpresa.data_inicio), 'dd/MM/yy') : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Vencimento</p>
                <p className={`text-xl font-bold ${dias !== null && dias <= 7 ? 'text-destructive' : ''}`}>
                  {viewingEmpresa.data_vencimento ? formatBR(parseISO(viewingEmpresa.data_vencimento), 'dd/MM/yy') : '—'}
                </p>
                {dias !== null && (
                  <p className={`text-xs ${dias <= 0 ? 'text-destructive' : dias <= 7 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {dias <= 0 ? 'Vencido' : `${dias} dias restantes`}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Dados Cadastrais</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {viewingEmpresa.razao_social && <div><span className="text-muted-foreground">Razão Social:</span> {viewingEmpresa.razao_social}</div>}
                {viewingEmpresa.cnpj && <div><span className="text-muted-foreground">CNPJ:</span> {viewingEmpresa.cnpj}</div>}
                {viewingEmpresa.email && <div><span className="text-muted-foreground">Email:</span> {viewingEmpresa.email}</div>}
                {viewingEmpresa.telefone && <div><span className="text-muted-foreground">Telefone:</span> {viewingEmpresa.telefone}</div>}
                {viewingEmpresa.endereco && <div><span className="text-muted-foreground">Endereço:</span> {viewingEmpresa.endereco}</div>}
                {!viewingEmpresa.razao_social && !viewingEmpresa.cnpj && !viewingEmpresa.email && (
                  <p className="text-muted-foreground">Nenhum dado cadastral preenchido.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Ações</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full gap-2" onClick={() => openEditDialog(viewingEmpresa)}>
                  <Pencil className="h-4 w-4" /> Alterar Plano / Dados
                </Button>
                {viewingEmpresa.status_assinatura === 'ATIVA' || viewingEmpresa.status_assinatura === 'TRIAL' ? (
                  <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmAction({ empresa: viewingEmpresa, action: 'suspend' })}>
                    <Ban className="h-4 w-4" /> Suspender Empresa
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full gap-2 text-primary" onClick={() => setConfirmAction({ empresa: viewingEmpresa, action: 'activate' })}>
                    <CheckCircle className="h-4 w-4" /> Reativar Empresa
                  </Button>
                )}
                <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmAction({ empresa: viewingEmpresa, action: 'delete' })}>
                  <Trash2 className="h-4 w-4" /> Excluir Empresa
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingEmpresa} onOpenChange={(open) => !open && setEditingEmpresa(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar — {editingEmpresa?.nome_fantasia}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={editForm.plano} onValueChange={(v) => handleEditPlanChange(v as PlanoEmpresa)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPERACIONAL">Operacional</SelectItem>
                    <SelectItem value="GESTAO_EQUIPE">Gestão de Equipe</SelectItem>
                    <SelectItem value="GESTAO_COMPLETA">Gestão Completa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status_assinatura} onValueChange={(v) => setEditForm(f => ({ ...f, status_assinatura: v as StatusAssinatura }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVA">Ativa</SelectItem>
                    <SelectItem value="TRIAL">Trial</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="SUSPENSA">Suspensa</SelectItem>
                    <SelectItem value="CANCELADA">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Mensal (R$)</Label>
                  <Input type="number" value={editForm.valor_plano} onChange={(e) => setEditForm(f => ({ ...f, valor_plano: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-2">
                  <Label>Limite Usuários</Label>
                  <Input type="number" value={editForm.limite_usuarios} onChange={(e) => setEditForm(f => ({ ...f, limite_usuarios: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input type="date" value={editForm.data_vencimento} onChange={(e) => setEditForm(f => ({ ...f, data_vencimento: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingEmpresa(null)}>Cancelar</Button>
              <Button onClick={handleUpdateEmpresa}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Action */}
        <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction?.action === 'suspend' ? 'Suspender Empresa' : confirmAction?.action === 'delete' ? 'Excluir Empresa' : 'Ativar Empresa'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction?.action === 'suspend'
                  ? `Ao suspender "${confirmAction.empresa.nome_fantasia}", os usuários poderão apenas visualizar dados existentes.`
                  : confirmAction?.action === 'delete'
                  ? `Tem certeza que deseja excluir permanentemente "${confirmAction?.empresa.nome_fantasia}"? Esta ação não pode ser desfeita e todos os dados associados serão removidos.`
                  : `Deseja reativar "${confirmAction?.empresa.nome_fantasia}"?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleToggleStatus} className={confirmAction?.action === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}>
                {confirmAction?.action === 'suspend' ? 'Suspender' : confirmAction?.action === 'delete' ? 'Excluir' : 'Ativar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <Crown className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Gestão de Empresas</h1>
            <p className="text-muted-foreground">Painel SaaS — controle centralizado</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <Building2 className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{kpis.ativas}</p>
              <p className="text-xs text-muted-foreground">Ativas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <Calendar className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{kpis.trial}</p>
              <p className="text-xs text-muted-foreground">Em Trial</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-destructive mb-1" />
              <p className="text-2xl font-bold">{kpis.suspensas}</p>
              <p className="text-xs text-muted-foreground">Suspensas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">R$ {kpis.mrr.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">MRR</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="pt-4 pb-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">R$ {kpis.ticketMedio.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Ticket Médio</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="empresas" className="space-y-4">
          <TabsList>
            <TabsTrigger value="empresas" className="gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="metricas" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Métricas
            </TabsTrigger>
          </TabsList>

          {/* Empresas Tab */}
          <TabsContent value="empresas" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Nova Empresa
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredEmpresas.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mb-4 opacity-30" />
                  <p>Nenhuma empresa encontrada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredEmpresas.map((empresa) => {
                  const dias = getDiasRestantes(empresa);
                  return (
                    <Card key={empresa.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-base truncate">{empresa.nome_fantasia}</h3>
                              {getStatusBadge(empresa.status_assinatura)}
                              <Badge variant="outline">{PLANO_LABELS[empresa.plano]}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              {empresa.cnpj && <span>CNPJ: {empresa.cnpj}</span>}
                              <span>R$ {(empresa.valor_plano || 0).toFixed(2)}/mês</span>
                              {empresa.data_vencimento && (
                                <span className={dias !== null && dias <= 7 ? 'text-destructive font-semibold' : ''}>
                                  Vence: {formatBR(parseISO(empresa.data_vencimento), 'dd/MM/yyyy')}
                                  {dias !== null && dias <= 0 && ' (Vencido!)'}
                                  {dias !== null && dias > 0 && dias <= 7 && ` (${dias}d)`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                            <Button variant="outline" size="sm" onClick={() => setViewingEmpresa(empresa)} className="gap-1">
                              <Eye className="h-3.5 w-3.5" /> Gerenciar
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(empresa)} className="gap-1">
                              <Pencil className="h-3.5 w-3.5" /> Editar
                            </Button>
                            {empresa.status_assinatura === 'ATIVA' || empresa.status_assinatura === 'TRIAL' ? (
                              <Button variant="outline" size="sm" onClick={() => setConfirmAction({ empresa, action: 'suspend' })} className="gap-1 text-destructive hover:text-destructive">
                                <Ban className="h-3.5 w-3.5" /> Suspender
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => setConfirmAction({ empresa, action: 'activate' })} className="gap-1 text-primary">
                                <CheckCircle className="h-3.5 w-3.5" /> Ativar
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setConfirmAction({ empresa, action: 'delete' })} className="gap-1 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metricas" className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Distribuição por Plano</CardTitle></CardHeader>
                <CardContent>
                  {planDistribution.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={planDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                            {planDistribution.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Status das Assinaturas</CardTitle></CardHeader>
                <CardContent>
                  {statusDistribution.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statusDistribution}>
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="quantidade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
                  )}
                </CardContent>
              </Card>

              <Card className="sm:col-span-2">
                <CardHeader><CardTitle className="text-sm">Receita por Plano</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(['OPERACIONAL', 'GESTAO_EQUIPE', 'GESTAO_COMPLETA'] as PlanoEmpresa[]).map(plano => {
                      const empresasPlano = empresas.filter(e => e.plano === plano && ['ATIVA', 'TRIAL'].includes(e.status_assinatura));
                      const receita = empresasPlano.reduce((s, e) => s + (e.valor_plano || 0), 0);
                      return (
                        <div key={plano} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                          <div>
                            <p className="font-medium text-sm">{PLANO_LABELS[plano]}</p>
                            <p className="text-xs text-muted-foreground">{empresasPlano.length} empresa(s)</p>
                          </div>
                          <p className="font-bold">R$ {receita.toFixed(2)}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingEmpresa} onOpenChange={(open) => !open && setEditingEmpresa(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {editingEmpresa?.nome_fantasia}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={editForm.plano} onValueChange={(v) => handleEditPlanChange(v as PlanoEmpresa)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPERACIONAL">Operacional</SelectItem>
                  <SelectItem value="GESTAO_EQUIPE">Gestão de Equipe</SelectItem>
                  <SelectItem value="GESTAO_COMPLETA">Gestão Completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status_assinatura} onValueChange={(v) => setEditForm(f => ({ ...f, status_assinatura: v as StatusAssinatura }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVA">Ativa</SelectItem>
                  <SelectItem value="TRIAL">Trial</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="SUSPENSA">Suspensa</SelectItem>
                  <SelectItem value="CANCELADA">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor Mensal (R$)</Label>
                <Input type="number" value={editForm.valor_plano} onChange={(e) => setEditForm(f => ({ ...f, valor_plano: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>Limite Usuários</Label>
                <Input type="number" value={editForm.limite_usuarios} onChange={(e) => setEditForm(f => ({ ...f, limite_usuarios: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Input type="date" value={editForm.data_vencimento} onChange={(e) => setEditForm(f => ({ ...f, data_vencimento: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmpresa(null)}>Cancelar</Button>
            <Button onClick={handleUpdateEmpresa}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome Fantasia *</Label>
              <Input value={createForm.nome_fantasia} onChange={(e) => setCreateForm(f => ({ ...f, nome_fantasia: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Razão Social</Label>
                <Input value={createForm.razao_social} onChange={(e) => setCreateForm(f => ({ ...f, razao_social: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={createForm.cnpj} onChange={(e) => setCreateForm(f => ({ ...f, cnpj: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={createForm.telefone} onChange={(e) => setCreateForm(f => ({ ...f, telefone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email da Empresa</Label>
                <Input value={createForm.email} onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={createForm.plano} onValueChange={(v) => handleCreatePlanChange(v as PlanoEmpresa)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPERACIONAL">Operacional</SelectItem>
                  <SelectItem value="GESTAO_EQUIPE">Gestão de Equipe</SelectItem>
                  <SelectItem value="GESTAO_COMPLETA">Gestão Completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input type="number" value={createForm.valor_plano} onChange={(e) => setCreateForm(f => ({ ...f, valor_plano: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>Limite Usuários</Label>
                <Input type="number" value={createForm.limite_usuarios} onChange={(e) => setCreateForm(f => ({ ...f, limite_usuarios: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={createForm.data_vencimento} onChange={(e) => setCreateForm(f => ({ ...f, data_vencimento: e.target.value }))} />
              </div>
            </div>

            {/* Admin credentials section */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-semibold text-sm mb-3">Administrador da Empresa *</h4>
              <p className="text-xs text-muted-foreground mb-3">
                O administrador será obrigado a alterar a senha no primeiro acesso.
              </p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Nome do Administrador *</Label>
                  <Input value={createForm.admin_name} onChange={(e) => setCreateForm(f => ({ ...f, admin_name: e.target.value }))} placeholder="Nome completo" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email de Acesso *</Label>
                    <Input type="email" value={createForm.admin_email} onChange={(e) => setCreateForm(f => ({ ...f, admin_email: e.target.value }))} placeholder="admin@empresa.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha Inicial *</Label>
                    <Input type="text" value={createForm.admin_password} onChange={(e) => setCreateForm(f => ({ ...f, admin_password: e.target.value }))} placeholder="Mín. 6 caracteres" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateEmpresa} disabled={!createForm.nome_fantasia || !createForm.admin_email || !createForm.admin_password || !createForm.admin_name}>Criar Empresa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === 'suspend' ? 'Suspender Empresa' : confirmAction?.action === 'delete' ? 'Excluir Empresa' : 'Ativar Empresa'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === 'suspend'
                ? `Ao suspender "${confirmAction.empresa.nome_fantasia}", os usuários poderão apenas visualizar dados existentes.`
                : confirmAction?.action === 'delete'
                ? `Tem certeza que deseja excluir permanentemente "${confirmAction?.empresa.nome_fantasia}"? Esta ação não pode ser desfeita e todos os dados associados serão removidos.`
                : `Deseja reativar "${confirmAction?.empresa.nome_fantasia}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleStatus} className={confirmAction?.action === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}>
              {confirmAction?.action === 'suspend' ? 'Suspender' : confirmAction?.action === 'delete' ? 'Excluir' : 'Ativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
