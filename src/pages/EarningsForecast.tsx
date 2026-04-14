import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, Clock, Calendar, DollarSign } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import { Badge } from '@/components/ui/badge';
import { useDefaultRates } from '@/hooks/useDefaultRates';

interface ForecastEvent {
  id: string;
  code: string;
  description: string | null;
  location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  status: string;
}

export default function EarningsForecast() {
  const { profile, roles } = useAuth();
  const { getRate } = useDefaultRates();
  const [events, setEvents] = useState<ForecastEvent[]>([]);
  const [valorHora, setValorHora] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Get valor_hora from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('valor_hora')
        .eq('id', profile!.id)
        .single();

      const profileValorHora = (profileData as any)?.valor_hora || 0;
      const mainRole = roles.find(r => r !== 'admin') || roles[0] || 'condutor';
      setValorHora(profileValorHora > 0 ? profileValorHora : getRate(mainRole));

      // Get next week's date range
      const now = new Date();
      const dayOfWeek = now.getDay();
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + (7 - dayOfWeek + 1));
      nextMonday.setHours(0, 0, 0, 0);

      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextMonday.getDate() + 6);
      nextSunday.setHours(23, 59, 59, 999);

      // Get events the user participates in for next week
      const { data: participations } = await supabase
        .from('event_participants')
        .select('event_id')
        .eq('profile_id', profile!.id);

      if (!participations || participations.length === 0) {
        setEvents([]);
        setIsLoading(false);
        return;
      }

      const eventIds = participations.map(p => p.event_id);

      const { data: eventsData } = await supabase
        .from('events')
        .select('id, code, description, location, departure_time, arrival_time, status')
        .in('id', eventIds)
        .in('status', ['ativo', 'em_andamento', 'finalizado'])
        .gte('departure_time', nextMonday.toISOString())
        .lte('departure_time', nextSunday.toISOString())
        .order('departure_time', { ascending: true });

      setEvents((eventsData as ForecastEvent[]) || []);
    } catch (err) {
      console.error('Error loading forecast:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const calcHours = (departure: string | null, arrival: string | null): number => {
    if (!departure || !arrival) return 0;
    const diff = new Date(arrival).getTime() - new Date(departure).getTime();
    return Math.max(0, diff / (1000 * 60 * 60));
  };

  const { totalHours, totalEarnings, eventDetails } = useMemo(() => {
    let totalH = 0;
    const details = events.map(ev => {
      const hours = calcHours(ev.departure_time, ev.arrival_time);
      totalH += hours;
      return { ...ev, hours, earnings: hours * valorHora };
    });
    return { totalHours: totalH, totalEarnings: totalH * valorHora, eventDetails: details };
  }, [events, valorHora]);

  // Calculate next week range for display
  const now = new Date();
  const dayOfWeek = now.getDay();
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + (7 - dayOfWeek + 1));
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);

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
          <TrendingUp className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Previsão de Ganhos</h1>
            <p className="text-sm text-muted-foreground">
              Semana de {formatBR(nextMonday, 'dd/MM')} a {formatBR(nextSunday, 'dd/MM/yyyy')}
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor/Hora</p>
                  <p className="text-lg font-bold">
                    {valorHora > 0 ? `R$ ${valorHora.toFixed(2)}` : 'Não definido'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                  <Clock className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Horas Previstas</p>
                  <p className="text-lg font-bold">{totalHours.toFixed(1)}h</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Previsão Total</p>
                  <p className="text-xl font-bold text-primary">
                    R$ {totalEarnings.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Events List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Eventos da Próxima Semana ({events.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum evento agendado para a próxima semana.
              </p>
            ) : (
              <div className="space-y-3">
                {eventDetails.map(ev => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{ev.code}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {ev.status === 'ativo' ? 'Ativo' : ev.status === 'em_andamento' ? 'Em Andamento' : 'Finalizado'}
                        </Badge>
                      </div>
                      {ev.location && (
                        <p className="text-xs text-muted-foreground truncate">{ev.location}</p>
                      )}
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        {ev.departure_time && (
                          <span>Saída: {formatBR(new Date(ev.departure_time), "dd/MM HH:mm")}</span>
                        )}
                        {ev.arrival_time && (
                          <span>Chegada: {formatBR(new Date(ev.arrival_time), "dd/MM HH:mm")}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className="text-xs text-muted-foreground">{ev.hours.toFixed(1)}h</p>
                      <p className="font-bold text-sm text-primary">R$ {ev.earnings.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {valorHora === 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-3">
              <p className="text-sm text-destructive">
                ⚠️ Seu valor/hora ainda não foi definido. Peça ao administrador para configurar seu valor na gestão de usuários.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
