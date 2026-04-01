import { useState } from 'react';
import { useReadOnly } from '@/hooks/useReadOnly';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Loader2, MapPin, Eye, Pencil, Trash2, Users, Search, CheckCircle, Calendar, Ambulance, FileText, Send } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import { useDebounce } from '@/hooks/useDebounce';
import type { Event, Ambulance as AmbulanceType, EventStatus, Profile, AppRole } from '@/types/database';
import { STATUS_LABELS } from '@/types/database';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface EventParticipantWithProfile {
  id: string;
  role: AppRole;
  profile: Profile;
}

interface EventWithDetails extends Event {
  ambulance?: AmbulanceType;
  participants?: EventParticipantWithProfile[];
  patient_count?: number;
}

const PAGE_SIZE = 20;

export function EventManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [eventToDelete, setEventToDelete] = useState<EventWithDetails | null>(null);
  const [eventToClose, setEventToClose] = useState<EventWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isReadOnly } = useReadOnly();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-events', debouncedSearch, page],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(`*, ambulance:ambulances(*)`, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        query = query.or(`code.ilike.%${debouncedSearch}%,location.ilike.%${debouncedSearch}%`);
      }

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data: eventsData, error: eventsError, count } = await query;
      if (eventsError) throw eventsError;

      const eventIds = (eventsData || []).map((e: any) => e.id);

      let participantsMap: Record<string, EventParticipantWithProfile[]> = {};
      let patientCountMap: Record<string, number> = {};

      if (eventIds.length > 0) {
        const { data: participantsData } = await supabase
          .from('event_participants')
          .select(`id, event_id, role, profile:profiles(*)`)
          .in('event_id', eventIds);

        const { data: patientsData } = await supabase
          .from('patients')
          .select('event_id')
          .in('event_id', eventIds);

        (participantsData || []).forEach((p: any) => {
          if (!participantsMap[p.event_id]) participantsMap[p.event_id] = [];
          participantsMap[p.event_id].push({
            id: p.id,
            role: p.role as AppRole,
            profile: p.profile as unknown as Profile,
          });
        });

        (patientsData || []).forEach((p: any) => {
          patientCountMap[p.event_id] = (patientCountMap[p.event_id] || 0) + 1;
        });
      }

      const eventsWithDetails = (eventsData || []).map((event: any) => ({
        ...event,
        departure_time: event.departure_time || null,
        arrival_time: event.arrival_time || null,
        participants: participantsMap[event.id] || [],
        patient_count: patientCountMap[event.id] || 0,
      })) as EventWithDetails[];

      return { events: eventsWithDetails, totalCount: count || 0 };
    },
    staleTime: 30_000,
  });

  const events = data?.events || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-events'] });

  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventToDelete.id);
      if (error) throw error;
      toast({ title: 'Evento excluído', description: `O evento ${eventToDelete.code} foi excluído.` });
      setEventToDelete(null);
      invalidate();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível excluir.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseEvent = async () => {
    if (!eventToClose) return;
    setIsClosing(true);
    try {
      const { error } = await supabase.from('events').update({ status: 'finalizado' as any }).eq('id', eventToClose.id);
      if (error) throw error;
      toast({ title: 'Evento encerrado', description: `O evento ${eventToClose.code} foi encerrado.` });
      setEventToClose(null);
      invalidate();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível encerrar.', variant: 'destructive' });
    } finally {
      setIsClosing(false);
    }
  };

  const getStatusBadge = (status: EventStatus) => {
    switch (status) {
      case 'ativo':
        return <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px]">{STATUS_LABELS.ativo}</Badge>;
      case 'em_andamento':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-[10px]">{STATUS_LABELS.em_andamento}</Badge>;
      case 'finalizado':
        return <Badge variant="secondary" className="text-[10px]">{STATUS_LABELS.finalizado}</Badge>;
      case 'cancelado':
        return <Badge variant="destructive" className="text-[10px]">{STATUS_LABELS.cancelado}</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
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
          placeholder="Buscar por código, local ou ambulância..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
          className="pl-10"
        />
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchTerm ? 'Nenhum evento encontrado' : 'Nenhum evento cadastrado'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id} className="relative overflow-hidden hover:shadow-md transition-shadow">
              {!isReadOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEventToDelete(event)}
                  className="absolute top-2 right-2 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 z-10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <CardContent className="p-4 pr-12">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-muted flex flex-col items-center justify-center border-2 border-border">
                      <Ambulance className="h-4 w-4 text-muted-foreground mb-0.5" />
                      <span className="text-[10px] font-black text-foreground leading-tight text-center px-1 truncate max-w-full">
                        {event.ambulance?.code || '---'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-black text-sm uppercase text-foreground">{event.code}</span>
                        {getStatusBadge(event.status)}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatBR(event.created_at, "dd/MM/yy HH:mm")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {event.participants?.length || 0} equipe
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {event.patient_count || 0} pacientes
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/report/${event.id}`)} className="rounded-xl text-xs font-bold flex-1 sm:flex-initial">
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Ver
                    </Button>
                    {!isReadOnly && (
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/events/${event.id}/edit`)} className="rounded-xl text-xs font-bold flex-1 sm:flex-initial">
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Editar
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => navigate(`/dispatch-report/${event.id}`)} className="rounded-xl text-xs font-bold text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 flex-1 sm:flex-initial">
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Rel. Envio
                    </Button>
                    {!isReadOnly && event.status !== 'finalizado' && event.status !== 'cancelado' && (
                      <Button variant="outline" size="sm" onClick={() => setEventToClose(event)} className="rounded-xl text-xs font-bold text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 flex-1 sm:flex-initial">
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        Encerrar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink isActive={pageNum === page} onClick={() => setPage(pageNum)} className="cursor-pointer">
                    {pageNum + 1}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <AlertDialog open={!!eventToDelete} onOpenChange={() => setEventToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Evento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o evento <strong>{eventToDelete?.code}</strong>?
              Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEvent} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!eventToClose} onOpenChange={() => setEventToClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar Evento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar o evento <strong>{eventToClose?.code}</strong>?
              O evento ficará disponível na aba <strong>Relatórios</strong> para consulta futura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseEvent} disabled={isClosing} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {isClosing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
