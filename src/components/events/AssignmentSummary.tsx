import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Loader2, Pencil, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import type { AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';
import { recomputeAssignmentPaidHours, recomputeAllAssignmentsForEvent } from '@/utils/computePaidHours';
import { formatBR } from '@/utils/dateFormat';

interface Props {
  eventId: string;
  empresaId: string | null;
}

interface AssignmentRow {
  id: string;
  event_id: string;
  profile_id: string;
  role: AppRole;
  scheduled_start: string | null;
  scheduled_end: string | null;
  schedule_source: 'event_default' | 'role_schedule' | 'manual';
  paid_start: string | null;
  paid_end: string | null;
  paid_duration_minutes: number | null;
  recebe_deslocamento_resolvido: boolean | null;
  profile?: { full_name: string };
}

const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  event_default: { label: 'Horário do evento', cls: 'bg-muted text-foreground border' },
  role_schedule: { label: 'Horário da função', cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  manual: { label: 'Manual', cls: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
};

function fmtDT(v: string | null): string {
  if (!v) return '—';
  try { return formatBR(new Date(v), 'dd/MM HH:mm'); } catch { return v; }
}

function toLocalInput(v: string | null): string {
  if (!v) return '';
  try {
    const d = new Date(v);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

export function AssignmentSummary({ eventId, empresaId }: Props) {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [hasTransport, setHasTransport] = useState(false);
  const [transportFull, setTransportFull] = useState(false);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('event_assignments')
        .select('*, profile:profiles(full_name)')
        .eq('event_id', eventId)
        .order('role');
      setRows(data || []);

      const { data: tr } = await supabase
        .from('transport_records')
        .select('departure_time, arrival_time')
        .eq('event_id', eventId)
        .maybeSingle();
      setHasTransport(!!tr);
      setTransportFull(!!(tr?.departure_time && tr?.arrival_time));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [eventId]);

  const handleRecomputeAll = async () => {
    setRecomputing(true);
    try {
      await recomputeAllAssignmentsForEvent(eventId);
      await load();
      toast({ title: 'Horas recalculadas' });
    } catch (e) {
      toast({ title: 'Erro', description: explainError(e, 'Falha ao recalcular.'), variant: 'destructive' });
    } finally {
      setRecomputing(false);
    }
  };

  const openEdit = (a: AssignmentRow) => {
    setEditing(a);
    setEditStart(toLocalInput(a.scheduled_start));
    setEditEnd(toLocalInput(a.scheduled_end));
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editStart || !editEnd) {
      toast({ title: 'Preencha início e fim', variant: 'destructive' });
      return;
    }
    if (editEnd <= editStart) {
      toast({ title: 'Fim deve ser maior que início', variant: 'destructive' });
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await (supabase as any)
        .from('event_assignments')
        .update({
          scheduled_start: editStart,
          scheduled_end: editEnd,
          schedule_source: 'manual',
        })
        .eq('id', editing.id);
      if (error) throw error;
      await recomputeAssignmentPaidHours({ eventId, profileId: editing.profile_id, role: editing.role });
      await load();
      setEditing(null);
      toast({ title: 'Horário ajustado' });
    } catch (e) {
      toast({ title: 'Erro', description: explainError(e, 'Falha ao salvar.'), variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const anyDeslocSemReal = rows.some(r => r.recebe_deslocamento_resolvido && !transportFull);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Resumo da Escala
          </CardTitle>
          <CardDescription>
            Horários aplicados a cada participante e origem do cálculo.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={handleRecomputeAll} disabled={recomputing}>
          {recomputing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Recalcular
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {anyDeslocSemReal && (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Deslocamento ativo, mas faltam horários reais de transporte. O cálculo está usando o horário previsto como fallback.
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma escala calculada ainda. Salve o evento e clique em "Recalcular".
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map(r => {
              const src = SOURCE_LABEL[r.schedule_source] || SOURCE_LABEL.event_default;
              const minutes = r.paid_duration_minutes ?? 0;
              const h = Math.floor(minutes / 60);
              const m = minutes % 60;
              return (
                <div key={r.id} className="rounded-lg border p-3 bg-background">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{r.profile?.full_name || '—'}</span>
                        <Badge variant="outline" className="text-xs">{ROLE_LABELS[r.role]}</Badge>
                        <Badge className={`text-xs ${src.cls}`} variant="outline">{src.label}</Badge>
                        {r.recebe_deslocamento_resolvido ? (
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Com deslocamento</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Sem deslocamento</Badge>
                        )}
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                        <div>Previsto: <span className="text-foreground">{fmtDT(r.scheduled_start)} → {fmtDT(r.scheduled_end)}</span></div>
                        <div>Pago: <span className="text-foreground">{fmtDT(r.paid_start)} → {fmtDT(r.paid_end)}</span> · <span className="text-foreground font-medium">{h}h {m}min</span></div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Ajustar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar horário manualmente</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="aedit-start">Início</Label>
                <Input id="aedit-start" type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="aedit-end">Fim</Label>
                <Input id="aedit-end" type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Salvar marcará a origem como "Manual" e recalculará as horas pagas considerando deslocamento.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={savingEdit}>
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
