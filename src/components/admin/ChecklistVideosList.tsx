import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play, Video, Truck, Calendar, User, Clock, MapPin } from 'lucide-react';
import { formatDateTimeBR } from '@/utils/dateFormat';
import { VideoPlayerDialog } from './VideoPlayerDialog';

type Recording = {
  id: string;
  event_id: string;
  video_type: string;
  video_url: string | null;
  started_at: string;
  duration_seconds: number | null;
  user_id: string;
  status: string;
};

type EventLite = {
  id: string;
  code: string | null;
  location: string | null;
  ambulance_id: string | null;
  departure_time: string | null;
};

type AmbulanceLite = {
  id: string;
  code: string;
  plate: string | null;
};

type ProfileLite = {
  user_id: string;
  full_name: string | null;
};

interface ChecklistVideosListProps {
  /** Quando informado, filtra apenas eventos com essa ambulância. Esconde também o filtro de viatura. */
  ambulanceId?: string;
}

const VIDEO_TYPE_LABELS: Record<string, string> = {
  cabine: 'Cabine',
  salao: 'Salão',
  externa: 'Externa',
};

const VIDEO_TYPE_COLORS: Record<string, string> = {
  cabine: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  salao: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  externa: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export function ChecklistVideosList({ ambulanceId }: ChecklistVideosListProps) {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [ambulanceFilter, setAmbulanceFilter] = useState<string>(ambulanceId ?? 'all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [player, setPlayer] = useState<{ url: string; title: string; subtitle: string } | null>(null);

  const { data: ambulances = [] } = useQuery({
    queryKey: ['videos-ambulances', empresaId],
    enabled: !!empresaId && !ambulanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ambulances')
        .select('id, code, plate')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('code');
      if (error) throw error;
      return (data || []) as AmbulanceLite[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['checklist-videos', empresaId, ambulanceId],
    enabled: !!empresaId,
    queryFn: async () => {
      // 1. Recordings da empresa
      let query = supabase
        .from('event_recordings')
        .select('id, event_id, video_type, video_url, started_at, duration_seconds, user_id, status')
        .eq('empresa_id', empresaId)
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .order('started_at', { ascending: false })
        .limit(500);

      const { data: recs, error } = await query;
      if (error) throw error;
      const recordings = (recs || []) as Recording[];

      const eventIds = Array.from(new Set(recordings.map(r => r.event_id)));
      const userIds = Array.from(new Set(recordings.map(r => r.user_id).filter(Boolean)));

      // 2. Events
      const { data: ev } = eventIds.length
        ? await supabase
            .from('events')
            .select('id, code, location, ambulance_id, departure_time')
            .in('id', eventIds)
        : { data: [] as EventLite[] };
      const events = (ev || []) as EventLite[];
      const eventsMap = new Map(events.map(e => [e.id, e]));

      // 3. Ambulances
      const ambIds = Array.from(new Set(events.map(e => e.ambulance_id).filter(Boolean) as string[]));
      const { data: ambs } = ambIds.length
        ? await supabase.from('ambulances').select('id, code, plate').in('id', ambIds)
        : { data: [] as AmbulanceLite[] };
      const ambMap = new Map<string, AmbulanceLite>(
        ((ambs || []) as AmbulanceLite[]).map(a => [a.id, a])
      );

      // 4. Profiles
      const { data: profs } = userIds.length
        ? await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds)
        : { data: [] as ProfileLite[] };
      const profMap = new Map<string, ProfileLite>(
        ((profs || []) as ProfileLite[]).map(p => [p.user_id, p])
      );

      return recordings.map(r => {
        const event = eventsMap.get(r.event_id);
        const amb = event?.ambulance_id ? ambMap.get(event.ambulance_id) : undefined;
        const prof = profMap.get(r.user_id);
        return {
          ...r,
          event_code: event?.code ?? '—',
          event_location: event?.location ?? null,
          ambulance_id: event?.ambulance_id ?? null,
          ambulance_code: amb?.code ?? null,
          ambulance_plate: amb?.plate ?? null,
          recorded_by: prof?.full_name ?? '—',
        };
      });
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(r => {
      if (ambulanceId && r.ambulance_id !== ambulanceId) return false;
      if (!ambulanceId && ambulanceFilter !== 'all' && r.ambulance_id !== ambulanceFilter) return false;
      if (typeFilter !== 'all' && r.video_type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const hit =
          r.event_code?.toLowerCase().includes(s) ||
          r.event_location?.toLowerCase().includes(s) ||
          r.recorded_by?.toLowerCase().includes(s) ||
          r.ambulance_code?.toLowerCase().includes(s) ||
          r.ambulance_plate?.toLowerCase().includes(s);
        if (!hit) return false;
      }
      if (dateFrom) {
        if (new Date(r.started_at) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(r.started_at) > end) return false;
      }
      return true;
    });
  }, [data, ambulanceId, ambulanceFilter, typeFilter, search, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Linha 1: busca + selects */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`min-w-0 ${ambulanceId ? 'lg:col-span-2' : ''}`}>
              <Input
                placeholder="Buscar por evento, local, profissional…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full"
              />
            </div>

            {!ambulanceId && (
              <div className="min-w-0">
                <Select value={ambulanceFilter} onValueChange={setAmbulanceFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Viatura" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as viaturas</SelectItem>
                    {ambulances.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code}{a.plate ? ` · ${a.plate}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="min-w-0">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tipo de vídeo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="cabine">Cabine</SelectItem>
                  <SelectItem value="salao">Salão</SelectItem>
                  <SelectItem value="externa">Externa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 hidden lg:block" />
          </div>

          {/* Linha 2: período */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">De</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Até</label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Video className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum vídeo encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(r => (
            <Card key={r.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <button
                type="button"
                onClick={() =>
                  r.video_url &&
                  setPlayer({
                    url: r.video_url,
                    title: `${VIDEO_TYPE_LABELS[r.video_type] ?? r.video_type} · ${r.event_code}`,
                    subtitle: `${formatDateTimeBR(r.started_at)} · ${r.recorded_by}`,
                  })
                }
                className="relative w-full aspect-video bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center group"
              >
                <Video className="h-10 w-10 text-white/30 group-hover:text-white/50 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
                  <Play className="h-12 w-12 text-white" fill="currentColor" />
                </div>
                <Badge
                  variant="outline"
                  className={`absolute top-2 left-2 ${VIDEO_TYPE_COLORS[r.video_type] ?? ''} bg-background/90 backdrop-blur`}
                >
                  {VIDEO_TYPE_LABELS[r.video_type] ?? r.video_type}
                </Badge>
                <Badge variant="outline" className="absolute bottom-2 right-2 bg-background/90 backdrop-blur text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(r.duration_seconds)}
                </Badge>
              </button>

              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{r.event_code}</span>
                </div>
                {r.event_location && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{r.event_location}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Truck className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {r.ambulance_code ? `${r.ambulance_code}${r.ambulance_plate ? ` · ${r.ambulance_plate}` : ''}` : 'Sem viatura'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{r.recorded_by}</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1 border-t">
                  {formatDateTimeBR(r.started_at)}
                </p>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-2 mt-2"
                  onClick={() =>
                    r.video_url &&
                    setPlayer({
                      url: r.video_url,
                      title: `${VIDEO_TYPE_LABELS[r.video_type] ?? r.video_type} · ${r.event_code}`,
                      subtitle: `${formatDateTimeBR(r.started_at)} · ${r.recorded_by}`,
                    })
                  }
                  disabled={!r.video_url}
                >
                  <Play className="h-3.5 w-3.5" /> Reproduzir
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VideoPlayerDialog
        open={!!player}
        onOpenChange={(open) => !open && setPlayer(null)}
        videoUrl={player?.url ?? null}
        title={player?.title ?? ''}
        subtitle={player?.subtitle}
      />

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} vídeo{filtered.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
