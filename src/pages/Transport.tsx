import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Truck, Save, Loader2, AlertTriangle, MapPin, Clock } from 'lucide-react';
import { TransportPhotos } from '@/components/transport/TransportPhotos';
import { useToast } from '@/hooks/use-toast';
import type { TransportRecord } from '@/types/database';

export default function TransportForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { toast } = useToast();
  
  const [transport, setTransport] = useState<Partial<TransportRecord>>({
    departure_time: '',
    arrival_time: '',
    initial_km: undefined,
    final_km: undefined,
    occurrences: '',
  });
  const [reserveInitialKm, setReserveInitialKm] = useState<number | undefined>(undefined);
  const [reserveFinalKm, setReserveFinalKm] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [existingTransportId, setExistingTransportId] = useState<string | null>(null);

  const canEdit = roles.includes('condutor') || roles.includes('admin');

  useEffect(() => {
    if (eventId) {
      loadTransport();
    }
  }, [eventId]);

  const loadTransport = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transport_records')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Parse reserve_km from occurrences JSON wrapper
        let occText = data.occurrences || '';
        let resInitKm: number | undefined;
        let resFinalKm: number | undefined;
        try {
          const parsed = JSON.parse(occText);
          if (parsed && typeof parsed === 'object' && 'occurrences' in parsed) {
            occText = parsed.occurrences || '';
            resInitKm = parsed.reserve_initial_km ?? undefined;
            resFinalKm = parsed.reserve_final_km ?? undefined;
          }
        } catch { /* plain text, keep as-is */ }

        setTransport({
          ...data,
          departure_time: data.departure_time ? new Date(data.departure_time).toISOString().slice(0, 16) : '',
          arrival_time: data.arrival_time ? new Date(data.arrival_time).toISOString().slice(0, 16) : '',
          occurrences: occText,
        });
        setReserveInitialKm(resInitKm);
        setReserveFinalKm(resFinalKm);
        setExistingTransportId(data.id);
      }
    } catch (err) {
      console.error('Error loading transport:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof TransportRecord, value: string | number | null) => {
    setTransport(prev => ({ ...prev, [field]: value }));
  };

  const setCurrentTime = (field: 'departure_time' | 'arrival_time') => {
    const now = new Date().toISOString().slice(0, 16);
    handleChange(field, now);
  };

  const calculateDistance = (initial?: number, final_?: number) => {
    if (initial && final_) {
      return (final_ - initial).toFixed(1);
    }
    return '--';
  };

  const saveTransport = async () => {
    setIsSaving(true);
    try {
      // Encode reserve_km into occurrences as JSON wrapper
      const occurrencesPayload = (reserveInitialKm !== undefined || reserveFinalKm !== undefined || transport.occurrences)
        ? JSON.stringify({ occurrences: transport.occurrences || '', reserve_initial_km: reserveInitialKm ?? null, reserve_final_km: reserveFinalKm ?? null })
        : null;

      const payload = {
        ...transport,
        departure_time: transport.departure_time || null,
        arrival_time: transport.arrival_time || null,
        occurrences: occurrencesPayload,
        updated_at: new Date().toISOString(),
      };

      if (existingTransportId) {
        const { error } = await supabase
          .from('transport_records')
          .update(payload)
          .eq('id', existingTransportId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('transport_records')
          .insert({
            ...payload,
            event_id: eventId,
            created_by: profile?.id,
            empresa_id: profile?.empresa_id || null,
          })
          .select()
          .single();

        if (error) throw error;
        setExistingTransportId(data.id);
      }

      toast({
        title: 'Sucesso',
        description: 'Dados de transporte salvos com sucesso.',
      });
    } catch (err) {
      console.error('Error saving transport:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar os dados de transporte.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
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

  return (
    <MainLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Transporte
            </h1>
          </div>
          {canEdit && (
            <Button onClick={saveTransport} disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Salvar
            </Button>
          )}
        </div>

        {!canEdit && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-3">
              <p className="text-sm text-center flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Apenas condutores podem editar os dados de transporte.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Horários */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horários
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="departure">Horário de Saída</Label>
              <div className="flex gap-2">
                <Input
                  id="departure"
                  type="datetime-local"
                  value={transport.departure_time || ''}
                  onChange={(e) => handleChange('departure_time', e.target.value)}
                  disabled={!canEdit}
                  className="flex-1 h-12"
                />
                {canEdit && (
                  <Button variant="outline" onClick={() => setCurrentTime('departure_time')} className="h-12 px-3 text-xs">
                    Agora
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="arrival">Horário de Chegada</Label>
              <div className="flex gap-2">
                <Input
                  id="arrival"
                  type="datetime-local"
                  value={transport.arrival_time || ''}
                  onChange={(e) => handleChange('arrival_time', e.target.value)}
                  disabled={!canEdit}
                  className="flex-1 h-12"
                />
                {canEdit && (
                  <Button variant="outline" onClick={() => setCurrentTime('arrival_time')} className="h-12 px-3 text-xs">
                    Agora
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quilometragem */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Quilometragem
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="initial_km">KM Inicial</Label>
              <Input
                id="initial_km"
                type="number"
                step="0.1"
                value={transport.initial_km || ''}
                onChange={(e) => handleChange('initial_km', parseFloat(e.target.value) || null)}
                disabled={!canEdit}
                placeholder="0.0"
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="final_km">KM Final</Label>
              <Input
                id="final_km"
                type="number"
                step="0.1"
                value={transport.final_km || ''}
                onChange={(e) => handleChange('final_km', parseFloat(e.target.value) || null)}
                disabled={!canEdit}
                placeholder="0.0"
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label>Percorrido</Label>
              <div className="flex items-center justify-center h-12 rounded-md border bg-muted">
                <span className="text-xl font-bold">{calculateDistance(transport.initial_km ?? undefined, transport.final_km ?? undefined)}</span>
                <span className="text-xs text-muted-foreground ml-1">km</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reserva */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Reserva
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="reserve_initial_km">KM Inicial</Label>
              <Input
                id="reserve_initial_km"
                type="number"
                step="0.1"
                value={reserveInitialKm ?? ''}
                onChange={(e) => setReserveInitialKm(parseFloat(e.target.value) || undefined)}
                disabled={!canEdit}
                placeholder="0.0"
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reserve_final_km">KM Final</Label>
              <Input
                id="reserve_final_km"
                type="number"
                step="0.1"
                value={reserveFinalKm ?? ''}
                onChange={(e) => setReserveFinalKm(parseFloat(e.target.value) || undefined)}
                disabled={!canEdit}
                placeholder="0.0"
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label>Percorrido</Label>
              <div className="flex items-center justify-center h-12 rounded-md border bg-muted">
                <span className="text-xl font-bold">{calculateDistance(reserveInitialKm, reserveFinalKm)}</span>
                <span className="text-xs text-muted-foreground ml-1">km</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ocorrências */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ocorrências no Trajeto</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={transport.occurrences || ''}
              onChange={(e) => handleChange('occurrences', e.target.value)}
              disabled={!canEdit}
              placeholder="Registre qualquer ocorrência durante o trajeto..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Fotos */}
        <TransportPhotos transportId={existingTransportId} canEdit={canEdit} />
      </div>
    </MainLayout>
  );
}
