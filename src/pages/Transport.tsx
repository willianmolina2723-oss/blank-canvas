import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { MainLayout } from '@/components/layout/MainLayout';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Truck, Save, Loader2, Clock } from 'lucide-react';
import { TransportPhotos } from '@/components/transport/TransportPhotos';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import type { TransportRecord, AppRole } from '@/types/database';
import { formatBR } from '@/utils/dateFormat';

export default function TransportForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [transport, setTransport] = useState<Partial<TransportRecord>>({ occurrences: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [existingTransportId, setExistingTransportId] = useState<string | null>(null);
  const [eventRole, setEventRole] = useState<AppRole | null>(null);
  const [eventData, setEventData] = useState<{ status: string; departure_time: string | null; arrival_time: string | null } | null>(null);

  useEffect(() => {
    if (eventId && profile) {
      supabase.from('event_participants').select('role').eq('event_id', eventId).eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setEventRole((data?.role as AppRole) || null));
    }
  }, [eventId, profile]);

  const { canEditTransportSection, guardAction } = usePermissions({ eventRole });
  const canEdit = canEditTransportSection;

  useEffect(() => { if (eventId) loadData(); }, [eventId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load event data for times
      const { data: ev } = await supabase.from('events').select('status, departure_time, arrival_time').eq('id', eventId!).maybeSingle();
      if (ev) setEventData(ev);

      // Load or create transport record
      const { data, error } = await supabase.from('transport_records').select('*').eq('event_id', eventId).maybeSingle();
      if (error) throw error;

      if (data) {
        let occText = data.occurrences || '';
        try {
          const parsed = JSON.parse(occText);
          if (parsed && typeof parsed === 'object' && 'occurrences' in parsed) {
            occText = parsed.occurrences || '';
          }
        } catch { /* plain text */ }

        setTransport({
          ...data,
          departure_time: data.departure_time || '',
          arrival_time: data.arrival_time || '',
          occurrences: occText,
        });
        setExistingTransportId(data.id);
      } else {
        const { data: newRecord, error: insertError } = await supabase.from('transport_records')
          .insert({ event_id: eventId, created_by: profile?.id, empresa_id: profile?.empresa_id || null, updated_at: new Date().toISOString() })
          .select().single();
        if (insertError) throw insertError;
        setExistingTransportId(newRecord.id);
      }
    } catch (err) {
      console.error('Error loading transport:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível carregar o transporte.'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const saveTransport = async () => {
    if (!guardAction('transporte')) return;
    setIsSaving(true);
    try {
      const payload = {
        occurrences: transport.occurrences || null,
        updated_at: new Date().toISOString(),
      };

      if (existingTransportId) {
        const { error } = await supabase.from('transport_records').update(payload).eq('id', existingTransportId);
        if (error) throw error;
      }

      toast({ title: 'Sucesso', description: 'Dados de transporte salvos com sucesso.' });
    } catch (err) {
      console.error('Error saving transport:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível salvar os dados de transporte.'), variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  const formatTime = (isoStr: string | null | undefined) => {
    if (!isoStr) return '—';
    return formatBR(new Date(isoStr), "dd/MM/yyyy 'às' HH:mm");
  };

  if (isLoading) {
    return <MainLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><Truck className="h-5 w-5 text-primary" />Transporte</h1>
          </div>
          {canEdit && (
            <Button onClick={saveTransport} disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Salvar
            </Button>
          )}
        </div>

        <ReadOnlyBanner show={!canEdit} message="Apenas condutores e administradores podem editar os dados de transporte." />

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Horários</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Horário de Saída</p>
              <div className="flex items-center h-12 rounded-md border bg-muted px-3">
                <span className="text-base font-medium">
                  {formatTime(eventData?.departure_time || transport.departure_time)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Registrado ao iniciar o evento</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Horário de Chegada</p>
              <div className="flex items-center h-12 rounded-md border bg-muted px-3">
                <span className="text-base font-medium">
                  {formatTime(eventData?.arrival_time || transport.arrival_time)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Registrado ao finalizar o evento</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ocorrências no Trajeto</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={transport.occurrences || ''} onChange={(e) => setTransport(prev => ({ ...prev, occurrences: e.target.value }))} disabled={!canEdit} placeholder="Registre qualquer ocorrência durante o trajeto..." rows={4} />
          </CardContent>
        </Card>

        <TransportPhotos transportId={existingTransportId} canEdit={canEdit} />
      </div>
    </MainLayout>
  );
}
