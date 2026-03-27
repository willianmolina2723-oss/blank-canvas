import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loader2, Users, ClipboardCheck, Pill, Activity, Stethoscope, Truck, Package, ArrowLeft, Syringe, Send, Play, Square } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import type { Event, Ambulance as AmbulanceType } from '@/types/database';
import { STATUS_LABELS } from '@/types/database';

export default function EventHub() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, roles, isReadOnly } = useAuth();
  const { toast } = useToast();
  const [event, setEvent] = useState<(Event & { ambulance?: AmbulanceType }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    if (id) loadEvent();
  }, [id]);

  const loadEvent = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, ambulance:ambulances(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      setEvent(data as any);

      // Get user role in this event
      if (profile) {
        const { data: participant } = await supabase
          .from('event_participants')
          .select('role')
          .eq('event_id', id!)
          .eq('profile_id', profile.id)
          .maybeSingle();

        setUserRole(participant?.role || null);
      }
    } catch (err) {
      console.error('Error loading event:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: 'em_andamento' | 'finalizado') => {
    if (!id || isUpdatingStatus || isReadOnly) return;
    setIsUpdatingStatus(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const response = await supabase.functions.invoke('update-event-status', {
        body: { event_id: id, new_status: newStatus },
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
        await loadEvent();
        navigate(`/checklist/${id}`);
      } else {
        toast({ title: 'Sucesso', description: 'Evento finalizado com sucesso!' });
        await loadEvent();
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Não foi possível atualizar o status do evento.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStatus(false);
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

  if (!event) {
    return (
      <MainLayout>
        <div className="text-center py-12 text-muted-foreground">Evento não encontrado</div>
      </MainLayout>
    );
  }

  // Map roles to highlighted card titles
  const roleHighlightMap: Record<string, string[]> = {
    enfermeiro: ['ENFERMAGEM', 'PACIENTES', 'MEDICAMENTOS', 'CONSUMO MEDS', 'MATERIAIS'],
    medico: ['MÉDICO', 'PACIENTES', 'ENFERMAGEM', 'MEDICAMENTOS', 'CONSUMO MEDS', 'MATERIAIS'],
    condutor: ['TRANSPORTE', 'CHECKLIST VTR', 'PACIENTES'],
    tecnico: ['ENFERMAGEM', 'PACIENTES', 'MEDICAMENTOS', 'CONSUMO MEDS', 'MATERIAIS'],
  };

  const allActionCards = [
    {
      title: 'PACIENTES',
      icon: Users,
      route: `/patient/${id}`,
      baseColor: 'bg-emerald-500 text-white',
      visibleTo: 'all' as const,
    },
    {
      title: 'CHECKLIST VTR',
      icon: ClipboardCheck,
      route: `/checklist/${id}`,
      baseColor: 'bg-violet-600 text-white',
      visibleTo: 'all' as const,
    },
    {
      title: 'MEDICAMENTOS',
      icon: Pill,
      route: `/medications/${id}`,
      baseColor: 'bg-purple-600 text-white',
      visibleTo: 'all' as const,
    },
    {
      title: 'CONSUMO MEDS',
      icon: Syringe,
      route: `/medication-consumption/${id}`,
      baseColor: 'bg-pink-600 text-white',
    },
    {
      title: 'ENFERMAGEM',
      icon: Activity,
      route: `/nursing-evolution/${id}`,
      baseColor: 'bg-cyan-500 text-white',
      visibleTo: 'all' as const,
    },
    {
      title: 'MÉDICO',
      icon: Stethoscope,
      route: `/medical-evolution/${id}`,
      baseColor: 'bg-red-600 text-white',
      visibleTo: 'all' as const,
    },
    {
      title: 'MATERIAIS',
      icon: Package,
      route: `/materials/${id}`,
      baseColor: 'bg-amber-600 text-white',
      visibleTo: 'all' as const,
    },
    {
      title: 'TRANSPORTE',
      icon: Truck,
      route: `/transport/${id}`,
      baseColor: 'bg-teal-700 text-white',
      visibleTo: 'all' as const,
    },
    {
      title: 'REL. ENVIO',
      icon: Send,
      route: `/dispatch-report/${id}`,
      baseColor: 'bg-orange-600 text-white',
      visibleTo: 'all' as const,
    },
  ];

  const isAdmin = roles.includes('admin');
  const isCondutor = userRole === 'condutor';
  const canChangeStatus = isAdmin || isCondutor;
  const highlightTitles = isAdmin
    ? allActionCards.map(c => c.title)
    : userRole ? roleHighlightMap[userRole] || [] : [];

  const actionCards = allActionCards;

  const canStart = canChangeStatus && event.status === 'ativo';
  const canFinish = canChangeStatus && ['ativo', 'em_andamento'].includes(event.status);
  const isFinalized = event.status === 'finalizado' || event.status === 'cancelado';

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        {/* Event header bar */}
        <div className="bg-card rounded-2xl p-4 flex items-center justify-between shadow-sm border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted transition-colors flex-shrink-0"
              title="Voltar"
            >
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-lg font-black tracking-tight">
                {event.code}{' '}
                <span className="font-bold">{event.ambulance?.code || ''}</span>
              </h1>
              <p className={`text-xs font-semibold uppercase ${
                event.status === 'em_andamento' ? 'text-blue-600' :
                event.status === 'finalizado' ? 'text-muted-foreground' :
                event.status === 'cancelado' ? 'text-destructive' :
                'text-emerald-600'
              }`}>
                {STATUS_LABELS[event.status] || event.status}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">{profile?.full_name}</p>
              <p className="text-xs font-bold text-primary uppercase">
                {isAdmin ? 'ADMINISTRADOR' : userRole || 'COLABORADOR'}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Status action buttons for conductor/admin */}
        {!isFinalized && canChangeStatus && !isReadOnly && (
          <div className="flex gap-3">
            {canStart && (
              <Button
                onClick={() => handleStatusChange('em_andamento')}
                disabled={isUpdatingStatus}
                className="flex-1 rounded-2xl py-6 text-sm font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
              >
                {isUpdatingStatus ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Play className="h-5 w-5 mr-2" />
                )}
                Iniciar Evento
              </Button>
            )}
            {canFinish && (
              <Button
                onClick={() => handleStatusChange('finalizado')}
                disabled={isUpdatingStatus}
                className="flex-1 rounded-2xl py-6 text-sm font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
              >
                {isUpdatingStatus ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Square className="h-5 w-5 mr-2" />
                )}
                Finalizar Evento
              </Button>
            )}
          </div>
        )}

        {/* Action cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {actionCards.map((card) => {
            const isHighlighted = highlightTitles.includes(card.title);
            const cardColor = isHighlighted ? card.baseColor : 'bg-muted text-muted-foreground';

            return (
              <button
                key={card.title}
                onClick={() => navigate(card.route)}
                className={`${cardColor} rounded-2xl p-6 flex flex-col items-center justify-center gap-3 shadow-sm hover:scale-[1.02] transition-transform min-h-[130px]`}
              >
                <card.icon className="h-8 w-8" />
                <span className="text-xs font-black tracking-wider uppercase">{card.title}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground tracking-widest uppercase pt-4">
          SAPH SECURITY PROTOCOL V2.4 • TABLET-VERIFIED • AES-256 SINC.
        </p>
      </div>
    </MainLayout>
  );
}
