import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Loader2, Users, Calendar, Copy } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import { ROLE_LABELS, type AppRole } from '@/types/database';
import { recomputeAssignmentPaidHours } from '@/utils/computePaidHours';

interface Participant {
  profile_id: string;
  role: AppRole;
  full_name: string;
}

interface EventDateRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  ordem: number;
}

interface AssignmentRow {
  id: string;
  profile_id: string;
  role: AppRole;
  event_date_id: string | null;
}

interface Props {
  eventId: string;
  empresaId: string | null;
}

/**
 * Matriz para alocar/desalocar cada participante em cada data do evento.
 * Operações persistem imediatamente em event_assignments.
 */
export function ParticipantsByDateMatrix({ eventId, empresaId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [dates, setDates] = useState<EventDateRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [partsRes, datesRes, asgRes] = await Promise.all([
        supabase
          .from('event_participants')
          .select('profile_id, role, profile:profiles!inner(full_name)')
          .eq('event_id', eventId),
        (supabase as any)
          .from('event_dates')
          .select('id, date, start_time, end_time, ordem')
          .eq('event_id', eventId)
          .order('ordem'),
        (supabase as any)
          .from('event_assignments')
          .select('id, profile_id, role, event_date_id')
          .eq('event_id', eventId),
      ]);

      const parts: Participant[] = ((partsRes.data || []) as any[]).map((p) => ({
        profile_id: p.profile_id,
        role: p.role,
        full_name: p.profile?.full_name || 'Sem nome',
      }));
      setParticipants(parts);
      setDates((datesRes.data || []) as EventDateRow[]);
      setAssignments((asgRes.data || []) as AssignmentRow[]);
    } catch (err) {
      console.error('ParticipantsByDateMatrix load error:', err);
      toast({
        title: 'Erro',
        description: explainError(err, 'Não foi possível carregar a alocação por data.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const lookup = useMemo(() => {
    const map = new Map<string, AssignmentRow>();
    for (const a of assignments) {
      if (!a.event_date_id) continue;
      map.set(`${a.profile_id}:${a.role}:${a.event_date_id}`, a);
    }
    return map;
  }, [assignments]);

  const toggle = async (p: Participant, dateId: string, checked: boolean) => {
    const key = `${p.profile_id}:${p.role}:${dateId}`;
    setBusyKey(key);
    try {
      const existing = lookup.get(key);
      if (checked) {
        if (existing) return;
        // create via recompute (handles defaults + paid hours)
        await recomputeAssignmentPaidHours({
          eventId,
          profileId: p.profile_id,
          role: p.role,
          eventDateId: dateId,
        });
      } else {
        if (!existing) return;
        const { error } = await (supabase as any)
          .from('event_assignments')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      }
      await loadAll();
    } catch (err) {
      console.error('toggle assignment error:', err);
      toast({
        title: 'Erro',
        description: explainError(err, 'Não foi possível atualizar a alocação.'),
        variant: 'destructive',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const copyFromDate = async (sourceDateId: string) => {
    setBusyKey(`copy:${sourceDateId}`);
    try {
      const sourceKeys = new Set(
        assignments
          .filter((a) => a.event_date_id === sourceDateId)
          .map((a) => `${a.profile_id}:${a.role}`),
      );
      for (const targetDate of dates) {
        if (targetDate.id === sourceDateId) continue;
        for (const p of participants) {
          const want = sourceKeys.has(`${p.profile_id}:${p.role}`);
          const has = !!lookup.get(`${p.profile_id}:${p.role}:${targetDate.id}`);
          if (want && !has) {
            await recomputeAssignmentPaidHours({
              eventId,
              profileId: p.profile_id,
              role: p.role,
              eventDateId: targetDate.id,
            });
          } else if (!want && has) {
            const existing = lookup.get(`${p.profile_id}:${p.role}:${targetDate.id}`);
            if (existing) {
              await (supabase as any).from('event_assignments').delete().eq('id', existing.id);
            }
          }
        }
      }
      await loadAll();
      toast({ title: 'Alocação copiada para todas as datas' });
    } catch (err) {
      toast({
        title: 'Erro',
        description: explainError(err, 'Falha ao copiar alocação.'),
        variant: 'destructive',
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (dates.length <= 1) {
    return null; // só faz sentido com 2+ datas
  }

  if (participants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" /> Alocação por Data
          </CardTitle>
          <CardDescription>Adicione participantes ao evento para alocá-los por data.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" /> Alocação por Data
        </CardTitle>
        <CardDescription>
          Marque em quais datas cada profissional vai trabalhar. As alterações são salvas automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left p-2 sticky left-0 bg-background z-10 border-b">
                Participante
              </th>
              {dates.map((d, idx) => (
                <th key={d.id} className="p-2 text-center border-b min-w-[120px]">
                  <div className="flex flex-col items-center gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      <Calendar className="h-3 w-3 mr-1" />
                      Data {idx + 1}
                    </Badge>
                    <span className="text-xs font-medium">{formatBR(d.start_time, 'dd/MM EEE')}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      disabled={busyKey === `copy:${d.id}`}
                      onClick={() => copyFromDate(d.id)}
                      title="Copiar a alocação desta data para todas as outras"
                    >
                      {busyKey === `copy:${d.id}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar
                        </>
                      )}
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={`${p.profile_id}:${p.role}`} className="hover:bg-muted/30">
                <td className="p-2 sticky left-0 bg-background border-b">
                  <div className="flex flex-col">
                    <span className="font-medium">{p.full_name}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABELS[p.role]}</span>
                  </div>
                </td>
                {dates.map((d) => {
                  const key = `${p.profile_id}:${p.role}:${d.id}`;
                  const checked = !!lookup.get(key);
                  const busy = busyKey === key;
                  return (
                    <td key={d.id} className="p-2 text-center border-b">
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggle(p, d.id, v === true)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-3">
          Profissionais desmarcados em uma data não aparecem na escala/financeiro daquela data.
        </p>
      </CardContent>
    </Card>
  );
}
