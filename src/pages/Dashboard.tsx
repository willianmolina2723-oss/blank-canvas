import { useEffect, useState } from 'react';
import { formatDateBR } from '@/utils/dateFormat';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Users,
  Loader2,
  FileText,
  Calendar,
  ChevronRight,
  AlertTriangle,
  Ambulance,
  Pencil,
  Play,
  Square,
} from 'lucide-react';
import { useActiveEvents } from '@/hooks/useActiveEvents';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';

export default function Dashboard() {
  const { roles, isAdmin, isSuperAdmin, isLoading: authLoading, isReadOnly } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading: isLoadingEvents } = useActiveEvents();
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);

  const activeEvents = data?.events || [];
  const participantCounts = data?.participantCounts || {};

  // Super Admin goes straight to company management
  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      navigate('/super-admin', { replace: true });
    }
  }, [authLoading, isSuperAdmin, navigate]);

  // Realtime subscription for events
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        queryClient.invalidateQueries({ queryKey: ['active-events'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const handleStatusChange = async (eventId: string, newStatus: 'em_andamento' | 'finalizado') => {
    if (updatingEventId) return;
    if (isReadOnly) {
      toast({ title: 'Modo somente leitura', description: 'Assinatura suspensa ou cancelada. Regularize para continuar.', variant: 'destructive' });
      return;
    }
    setUpdatingEventId(eventId);
    try {
      const response = await supabase.functions.invoke('update-event-status', {
        body: { event_id: eventId, new_status: newStatus },
      });

      if (response.error) {
        let errorMessage = response.error.message || 'Erro ao atualizar status';
        const responseContext = (response.error as any)?.context;

        if (responseContext) {
          try {
            const errorPayload = await responseContext.clone().json();
            if (errorPayload?.error) errorMessage = errorPayload.error;
          } catch {
            try {
              const rawText = await responseContext.clone().text();
              if (rawText) {
                const parsed = JSON.parse(rawText);
                if (parsed?.error) errorMessage = parsed.error;
              }
            } catch {
              // Keep fallback error message
            }
          }
        }

        throw new Error(errorMessage);
      }

      const result = response.data;
      if (result?.error) {
        toast({ title: 'Atenção', description: result.error, variant: 'destructive' });
        return;
      }

      if (newStatus === 'em_andamento') {
        toast({ title: 'Evento iniciado!', description: 'Redirecionando para o checklist...' });
        queryClient.invalidateQueries({ queryKey: ['active-events'] });
        navigate(`/checklist/${eventId}`);
      } else {
        toast({ title: 'Sucesso', description: 'Evento finalizado com sucesso!' });
        queryClient.invalidateQueries({ queryKey: ['active-events'] });
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast({
        title: 'Erro',
        description: explainError(err, 'Não foi possível atualizar o status.'),
        variant: 'destructive',
      });
    } finally {
      setUpdatingEventId(null);
    }
  };

  if (authLoading) {
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
      <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
        {roles.length === 0 && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-4">
              <p className="text-sm text-center flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Você ainda não tem uma função atribuída. Entre em contato com o administrador.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xl font-black uppercase tracking-tight text-foreground flex items-center gap-2">
            <Ambulance className="h-5 w-5 text-primary" />
            Atendimentos
          </h2>
          {isAdmin && !isReadOnly && (
            <Button
              onClick={() => navigate('/admin/events/new')}
              className="rounded-2xl px-6 py-5 text-sm font-bold uppercase shadow-lg w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Abrir Chamado
            </Button>
          )}
        </div>

        {isLoadingEvents ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : activeEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum atendimento ativo no momento.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeEvents.map((event) => {
              const isUpdating = updatingEventId === event.id;

              return (
                <Card key={event.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-muted flex flex-col items-center justify-center border-2 border-border">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">VTR</span>
                          <span className="text-sm font-black text-foreground leading-tight">
                            {event.ambulance?.code || '---'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-foreground text-sm uppercase truncate">
                            {event.description || event.code}
                            {event.location ? ` - ${event.location}` : ''}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDateBR(event.created_at)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {participantCounts[event.id] || 0} colaboradores
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {event.status === 'ativo' && !isReadOnly && (
                            <Button
                              onClick={() => handleStatusChange(event.id, 'em_andamento')}
                              disabled={isUpdating}
                              size="sm"
                              className="rounded-xl text-xs font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Play className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              Iniciar
                            </Button>
                          )}
                          {event.status === 'em_andamento' && !isReadOnly && (
                            <Button
                              onClick={() => handleStatusChange(event.id, 'finalizado')}
                              disabled={isUpdating}
                              size="sm"
                              className="rounded-xl text-xs font-bold uppercase bg-accent text-accent-foreground hover:bg-accent/90"
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Square className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              Finalizar
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/report/${event.id}`)}
                            className="rounded-xl text-xs font-bold uppercase hidden sm:flex"
                          >
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Relatório
                          </Button>
                          {isAdmin && !isReadOnly && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="rounded-full h-10 w-10 flex-shrink-0 hidden sm:flex"
                              onClick={() => navigate(`/admin/events/${event.id}/edit`)}
                              title="Editar evento"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            className="rounded-full h-10 w-10 flex-shrink-0"
                            size="icon"
                            onClick={() => navigate(`/event/${event.id}`)}
                          >
                            <ChevronRight className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
