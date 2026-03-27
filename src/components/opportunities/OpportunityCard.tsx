import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
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
  CalendarDays,
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Loader2,
  Lock,
  Timer,
} from 'lucide-react';
import { ROLE_LABELS, type AppRole } from '@/types/database';
import { parseISO } from 'date-fns';
import { formatBR } from '@/utils/dateFormat';

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

interface Registration {
  id: string;
  opportunity_id: string;
  profile_id: string;
  role: string;
  status: string;
  registered_at: string;
  profiles?: { full_name: string };
}

interface OpportunityCardProps {
  opportunity: Opportunity;
  onDelete?: (id: string) => void;
  onRefresh: () => void;
}

/** Group roles_needed into { role, total, index } slots */
function buildSlots(rolesNeeded: string[]) {
  const countMap: Record<string, number> = {};
  const slots: { role: string; slotIndex: number }[] = [];
  for (const role of rolesNeeded) {
    const idx = countMap[role] || 0;
    slots.push({ role, slotIndex: idx });
    countMap[role] = idx + 1;
  }
  return slots;
}

/** Summary: { role: string, total: number } */
function roleSummary(rolesNeeded: string[]) {
  const map: Record<string, number> = {};
  for (const r of rolesNeeded) map[r] = (map[r] || 0) + 1;
  return Object.entries(map).map(([role, total]) => ({ role, total }));
}

export function OpportunityCard({ opportunity, onDelete, onRefresh }: OpportunityCardProps) {
  const { profile, roles, isAdmin } = useAuth();
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState<string | null>(null); // slotKey being acted on
  const [loadingRegs, setLoadingRegs] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closingOpportunity, setClosingOpportunity] = useState(false);

  useEffect(() => {
    loadRegistrations();
  }, [opportunity.id]);

  const loadRegistrations = async () => {
    setLoadingRegs(true);
    try {
      const { data, error } = await (supabase as any)
        .from('opportunity_registrations')
        .select('*, profiles!opportunity_registrations_profile_id_fkey(full_name)')
        .eq('opportunity_id', opportunity.id)
        .eq('status', 'confirmado');

      if (!error && data) {
        setRegistrations(data);
      }
    } finally {
      setLoadingRegs(false);
    }
  };

  const myRole = roles.find(r => r !== 'admin') as AppRole | undefined;
  const myRegistrations = registrations.filter(r => r.profile_id === profile?.id);
  const isClosed = opportunity.status === 'fechada' || opportunity.status === 'cancelada';

  const summaries = roleSummary(opportunity.roles_needed);

  /** Get registrations for a specific role */
  const getRegsForRole = (role: string) =>
    registrations.filter(r => r.role === role && r.status === 'confirmado');

  const handleRegister = async (role: string) => {
    if (!profile?.id) {
      toast({ title: 'Perfil não encontrado', variant: 'destructive' });
      return;
    }
    const slotKey = `register-${role}`;
    setLoading(slotKey);
    try {
      const roleRegs = getRegsForRole(role);
      const totalNeeded = opportunity.roles_needed.filter(r => r === role).length;
      if (roleRegs.length >= totalNeeded) {
        toast({ title: 'Todas as vagas desta função já estão preenchidas.', variant: 'destructive' });
        await loadRegistrations();
        return;
      }

      const { error } = await (supabase as any)
        .from('opportunity_registrations')
        .insert({
          opportunity_id: opportunity.id,
          profile_id: profile.id,
          role,
          status: 'confirmado',
          empresa_id: profile?.empresa_id || null,
        });

      if (error) {
        if (error.code === '23505') {
          await loadRegistrations();
          toast({ title: 'Vaga já preenchida', variant: 'destructive' });
        } else {
          throw error;
        }
      } else {
        toast({ title: '✅ Inscrição confirmada!', description: `Você está confirmado como ${ROLE_LABELS[role as AppRole]}.` });
        await loadRegistrations();
        onRefresh();
      }
    } catch (err: any) {
      toast({ title: 'Erro ao se inscrever', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const handleCancelReg = async (regId: string) => {
    setLoading(`cancel-${regId}`);
    try {
      const { error } = await (supabase as any)
        .from('opportunity_registrations')
        .update({ status: 'cancelado', cancelled_by: profile?.id, cancelled_at: new Date().toISOString() })
        .eq('id', regId);

      if (error) throw error;
      toast({ title: 'Inscrição cancelada.' });
      await loadRegistrations();
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Erro ao cancelar', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const handleCloseOpportunity = async () => {
    setClosingOpportunity(true);
    try {
      const { error } = await (supabase as any)
        .from('opportunities')
        .update({ status: 'fechada' })
        .eq('id', opportunity.id);

      if (error) throw error;
      toast({ title: 'Oportunidade encerrada.' });
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Erro ao encerrar', description: err.message, variant: 'destructive' });
    } finally {
      setClosingOpportunity(false);
    }
  };

  const statusColor = {
    aberta: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
    fechada: 'bg-muted text-muted-foreground border-border',
    cancelada: 'bg-destructive/10 text-destructive border-destructive/20',
  }[opportunity.status] || '';

  const statusLabel = { aberta: 'Aberta', fechada: 'Encerrada', cancelada: 'Cancelada' }[opportunity.status] || opportunity.status;

  const formattedDate = (() => {
    try { return formatBR(parseISO(opportunity.event_date), "dd 'de' MMMM 'de' yyyy"); }
    catch { return opportunity.event_date; }
  })();

  return (
    <>
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardContent className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-foreground text-base">{opportunity.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
                  {isClosed && <Lock className="h-3 w-3 inline mr-1" />}
                  {statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formattedDate}
                </span>
                {(opportunity.start_time || opportunity.end_time) && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" />
                    {opportunity.start_time?.slice(0, 5) || '--:--'}
                    {' → '}
                    {opportunity.end_time?.slice(0, 5) || '--:--'}
                  </span>
                )}
                {opportunity.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {opportunity.location}
                  </span>
                )}
              </div>
              {opportunity.description && (
                <p className="text-sm text-muted-foreground mt-2">{opportunity.description}</p>
              )}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {opportunity.status === 'aberta' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCloseOpportunity}
                    disabled={closingOpportunity}
                    className="text-xs h-8"
                  >
                    {closingOpportunity ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Encerrar'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDelete(true)}
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Roles grid — grouped by role with multiple slots */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Vagas por função
            </p>
            <div className="space-y-3">
              {summaries.map(({ role, total }) => {
                const roleRegs = getRegsForRole(role);
                const filledCount = roleRegs.length;
                const openCount = total - filledCount;
                const isMyRole = myRole === role;
                const alreadyRegisteredThisRole = roleRegs.some(r => r.profile_id === profile?.id);

                return (
                  <div key={role} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">
                        {ROLE_LABELS[role as AppRole] || role}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {filledCount}/{total} preenchida{total !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {/* Filled slots */}
                      {roleRegs.map(reg => {
                        const isMe = reg.profile_id === profile?.id;
                        return (
                          <div
                            key={reg.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/50 border-border text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className="h-4 w-4 text-chart-2 flex-shrink-0" />
                              <span className="text-xs truncate">
                                {isMe ? 'Você' : reg.profiles?.full_name || 'Confirmado'}
                              </span>
                            </div>
                            {!isClosed && isAdmin && !isMe && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCancelReg(reg.id)}
                                disabled={loading === `cancel-${reg.id}`}
                                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 flex-shrink-0"
                              >
                                {loading === `cancel-${reg.id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                            {isMe && !isClosed && (
                              <Badge variant="outline" className="text-chart-2 border-chart-2/30 bg-chart-2/10 text-[10px]">
                                Confirmado
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                      {/* Open slots */}
                      {Array.from({ length: openCount }).map((_, i) => (
                        <div
                          key={`open-${role}-${i}`}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-primary/5 border-primary/20 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-xs text-muted-foreground">Disponível</span>
                          </div>
                          {!isClosed && !isAdmin && isMyRole && !alreadyRegisteredThisRole && (
                            <Button
                              size="sm"
                              onClick={() => handleRegister(role)}
                              disabled={loading !== null}
                              className="h-7 text-xs px-3"
                            >
                              {loading === `register-${role}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Pegar'
                              )}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* My status footer */}
          {myRegistrations.length > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-chart-2/10 border border-chart-2/20">
              <CheckCircle2 className="h-4 w-4 text-chart-2 flex-shrink-0" />
              <p className="text-sm text-chart-2 font-medium">
                Você está confirmado como{' '}
                <strong>
                  {myRegistrations.map(r => ROLE_LABELS[r.role as AppRole] || r.role).join(', ')}
                </strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá a oportunidade e todas as inscrições. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { onDelete?.(opportunity.id); setConfirmDelete(false); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
