import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { FileText, Loader2, Search, Download, Eye, MapPin, Send } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import type { Event, Ambulance, EventParticipant, Profile, AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';


interface EventWithDetails extends Event {
  ambulance?: Ambulance;
  participants?: (EventParticipant & { profile: Profile })[];
  patient_count?: number;
}

export default function ReportsPage() {
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [generatingPdfFor, setGeneratingPdfFor] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchClosedEvents();
  }, []);

  const fetchClosedEvents = async () => {
    setIsLoading(true);
    try {
      const { data: eventsData, error } = await supabase
        .from('events')
        .select('*, ambulance:ambulances(*)')
        .eq('status', 'finalizado')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Fetch participants and patient counts
      const eventIds = (eventsData || []).map(e => e.id);
      
      const [participantsRes, patientsRes] = await Promise.all([
        supabase.from('event_participants').select('*, profile:profiles(*)').in('event_id', eventIds),
        supabase.from('patients').select('event_id').in('event_id', eventIds),
      ]);

      const eventsWithDetails = (eventsData || []).map(event => {
        const eventParticipants = (participantsRes.data || [])
          .filter(p => p.event_id === event.id)
          .map(p => ({ ...p, profile: p.profile as unknown as Profile }));
        const patientCount = (patientsRes.data || []).filter(p => p.event_id === event.id).length;

        return {
          ...event,
          departure_time: (event as any).departure_time || null,
          arrival_time: (event as any).arrival_time || null,
          participants: eventParticipants as (EventParticipant & { profile: Profile })[],
          patient_count: patientCount,
        } as EventWithDetails;
      });

      setEvents(eventsWithDetails);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os relatórios.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEvents = events.filter(e =>
    e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.ambulance?.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
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
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatórios de Eventos</h1>
            <p className="text-muted-foreground">Consulte relatórios e configure a logo dos PDFs</p>
          </div>
        </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por código, local ou ambulância..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {filteredEvents.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    {searchTerm ? 'Nenhum relatório encontrado' : 'Nenhum evento encerrado'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => navigate(`/report/${event.id}`)}
                      >
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm">{event.code}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatBR(event.updated_at, "dd/MM/yy HH:mm")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{event.location || 'Sem local'}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <Badge variant="outline" className="gap-1">
                              🚑 {event.ambulance?.code || '-'}
                            </Badge>
                            <Badge variant="outline" className="gap-1">
                              👥 {event.participants?.length || 0}
                            </Badge>
                            <Badge variant="outline" className="gap-1">
                              🩺 {event.patient_count || 0}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); navigate(`/dispatch-report/${event.id}`); }}
                              title="Relatório de envio"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); navigate(`/report/${event.id}`); }}
                              title="Ver relatório completo"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
      </div>
    </MainLayout>
  );
}
