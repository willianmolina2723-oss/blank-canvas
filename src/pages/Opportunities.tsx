import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { CreateOpportunityDialog } from '@/components/opportunities/CreateOpportunityDialog';
import { OpportunityCard } from '@/components/opportunities/OpportunityCard';
import {
  Plus,
  Search,
  Loader2,
  Briefcase,
  AlertTriangle,
  Database,
} from 'lucide-react';

interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  roles_needed: string[];
  status: string;
  created_at: string;
}

export default function Opportunities() {
  const { isAdmin, roles } = useAuth();
  const { toast } = useToast();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'abertas' | 'encerradas'>('abertas');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('opportunities')
        .select('*')
        .order('event_date', { ascending: true });

      if (filter === 'abertas') query = query.eq('status', 'aberta');
      else if (filter === 'encerradas') query = query.in('status', ['fechada', 'cancelada']);

      const { data, error } = await query;

      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          setSetupNeeded(true);
        } else {
          throw error;
        }
      } else {
        setOpportunities(data || []);
        setSetupNeeded(false);
      }
    } catch (err: any) {
      if (err.message?.includes('does not exist') || err.code === '42P01') {
        setSetupNeeded(true);
      } else {
        toast({ title: 'Erro ao carregar oportunidades', description: err.message, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Auto-setup realtime (runs once per session for admins)
  useEffect(() => {
    if (isAdmin) {
      const key = 'realtime_opportunities_setup';
      if (!sessionStorage.getItem(key)) {
        supabase.functions.invoke('setup-realtime').then(() => {
          sessionStorage.setItem(key, '1');
        }).catch(() => {});
      }
    }
  }, [isAdmin]);

  // Realtime: refresh list + play sound on new opportunity
  useEffect(() => {
    const channel = supabase
      .channel('opportunities-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opportunities' },
        (payload) => {
          console.log('[Realtime] Opportunity change:', payload.eventType);
          load();
          // Play sound on INSERT
          if (payload.eventType === 'INSERT') {
            try {
              if (!audioRef.current) {
                audioRef.current = new Audio('/sounds/nova-oportunidade.mp3');
              }
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            } catch {}
            toast({ title: '🆕 Nova Oportunidade!', description: (payload.new as any)?.title || 'Uma nova oportunidade foi publicada.' });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, toast]);

  const handleSetup = async () => {
    setSettingUp(true);
    try {
      const { error } = await supabase.functions.invoke('setup-opportunities');
      if (error) throw error;
      toast({ title: 'Sistema configurado! Recarregando...' });
      await load();
    } catch (err: any) {
      toast({ title: 'Erro na configuração', description: err.message, variant: 'destructive' });
    } finally {
      setSettingUp(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await (supabase as any).from('opportunities').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Oportunidade excluída.' });
      load();
    } catch (err: any) {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    }
  };

  const filtered = opportunities.filter(o =>
    o.title.toLowerCase().includes(search.toLowerCase()) ||
    (o.location || '').toLowerCase().includes(search.toLowerCase())
  );

  const filterTabs: { key: typeof filter; label: string }[] = [
    { key: 'abertas', label: 'Abertas' },
    { key: 'todas', label: 'Todas' },
    { key: 'encerradas', label: 'Encerradas' },
  ];

  if (setupNeeded && isAdmin) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto py-16 text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 rounded-2xl bg-primary/10">
              <Database className="h-12 w-12 text-primary" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Configuração necessária</h2>
            <p className="text-muted-foreground mt-2">
              O módulo de Oportunidades precisa ser configurado pela primeira vez.
            </p>
          </div>
          <Button onClick={handleSetup} disabled={settingUp} size="lg">
            {settingUp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
            Configurar Módulo de Oportunidades
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (setupNeeded && !isAdmin) {
    return (
      <MainLayout>
        <div className="max-w-xl mx-auto py-16 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-warning mx-auto" />
          <h2 className="text-xl font-bold">Módulo não disponível</h2>
          <p className="text-muted-foreground">Entre em contato com o administrador para ativar o módulo de oportunidades.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Briefcase className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight">Oportunidades</h1>
              <p className="text-xs text-muted-foreground">
                {isAdmin ? 'Gerencie e publique vagas para a equipe' : 'Escolha os eventos disponíveis para você'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreate(true)} className="rounded-2xl px-6 py-5 font-bold uppercase shadow-lg w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Nova Oportunidade
            </Button>
          )}
        </div>

        {/* No role warning for non-admins */}
        {!isAdmin && roles.length === 0 && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-4 text-center">
              <p className="text-sm flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Você ainda não tem uma função atribuída. Não é possível se inscrever em oportunidades.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título ou local..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex rounded-xl border bg-muted/30 p-1 gap-1">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === tab.key
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma oportunidade {filter === 'abertas' ? 'aberta' : ''} encontrada.</p>
              {isAdmin && filter === 'abertas' && (
                <Button variant="outline" onClick={() => setShowCreate(true)} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" /> Criar primeira oportunidade
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map(opp => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                onDelete={isAdmin ? handleDelete : undefined}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>

      <CreateOpportunityDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={load}
      />
    </MainLayout>
  );
}
