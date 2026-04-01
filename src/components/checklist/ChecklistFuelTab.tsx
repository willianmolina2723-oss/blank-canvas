import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Fuel, CheckCircle2, Loader2, AlertTriangle, Car, Camera, X, MapPin, ImageIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toBrasiliaDate } from '@/utils/dateFormat';

const FUEL_LEVELS = [
  { value: 'R', label: 'R', color: 'text-red-500' },
  { value: '1/4', label: '¼', color: '' },
  { value: '1/2', label: '½', color: 'text-blue-500' },
  { value: '3/4', label: '¾', color: '' },
  { value: 'C', label: 'C', color: 'text-green-600' },
];

function FuelLevelSelector({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="flex gap-2 mt-1">
      {FUEL_LEVELS.map(level => (
        <button
          key={level.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === level.value ? '' : level.value)}
          className={cn(
            'w-12 h-12 rounded-lg border-2 text-lg font-bold transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            value === level.value
              ? 'border-primary bg-primary/10 shadow-md scale-105'
              : 'border-border bg-background hover:border-primary/50',
            level.color
          )}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}

function formatTimestampBrasilia(): string {
  const now = toBrasiliaDate(new Date());
  const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(now.getDate())} de ${months[now.getMonth()]} de ${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function reverseGeocode(lat: number, lng: number): Promise<string[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'SAPH-App/1.0' } }
    );
    if (!res.ok) return [`${lat.toFixed(5)}, ${lng.toFixed(5)}`];
    const data = await res.json();
    const addr = data.address || {};
    const lines: string[] = [];
    const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || '';
    if (neighborhood) lines.push(neighborhood);
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const state = addr.state || '';
    const stateAbbr = state.length > 2 ? state.split(' ').map((w: string) => w[0]?.toUpperCase()).join('') : state;
    if (city) lines.push(stateAbbr ? `${city} ${stateAbbr}` : city);
    if (addr.postcode) lines.push(addr.postcode);
    if (addr.country) lines.push(addr.country);
    return lines.length > 0 ? lines : [`${lat.toFixed(5)}, ${lng.toFixed(5)}`];
  } catch {
    return [`${lat.toFixed(5)}, ${lng.toFixed(5)}`];
  }
}

interface FuelReceiptPhoto {
  name: string;
  path: string;
  url: string;
}

interface Props {
  eventId: string;
  canCheck: boolean;
  profileId?: string;
  empresaId?: string | null;
}

interface FuelData {
  km_inicial: string;
  combustivel_inicial: string;
  km_reserva_inicial: string;
  km_final: string;
  combustivel_final: string;
  km_reserva_final: string;
  abastecido: boolean;
  observacoes: string;
  receipt_photos?: string[];
}

export function ChecklistFuelTab({ eventId, canCheck, profileId, empresaId }: Props) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<FuelData>({
    km_inicial: '', combustivel_inicial: '', km_reserva_inicial: '',
    km_final: '', combustivel_final: '', km_reserva_final: '',
    abastecido: false, observacoes: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartConfirmed, setIsStartConfirmed] = useState(false);
  const [isEndConfirmed, setIsEndConfirmed] = useState(false);
  const [startItemId, setStartItemId] = useState<string | null>(null);
  const [endItemId, setEndItemId] = useState<string | null>(null);

  // Receipt photo states
  const [receiptPhotos, setReceiptPhotos] = useState<FuelReceiptPhoto[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [geoLines, setGeoLines] = useState<string[] | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => { loadData(); loadReceiptPhotos(); }, [eventId]);
  useEffect(() => { return () => stopCamera(); }, []);

  const loadReceiptPhotos = async () => {
    try {
      const { data: result } = await supabase.functions.invoke('transport-photos', {
        body: { action: 'list', event_id: eventId, photo_type: 'fuel_receipt' },
      });
      if (result?.photos) setReceiptPhotos(result.photos);
    } catch (err) {
      console.error('Error loading receipt photos:', err);
    }
  };

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraReady(false);
    setShowCamera(false);
  }, []);

  const openCamera = async () => {
    setShowCamera(true);
    setGeoLines(null);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => { setGeoLines(await reverseGeocode(pos.coords.latitude, pos.coords.longitude)); },
        () => setGeoLines(['Localização indisponível']),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        drawOverlay();
      }
    } catch (err) {
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível acessar a câmera.'), variant: 'destructive' });
      stopCamera();
    }
  };

  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const loop = () => {
      if (!streamRef.current) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const timestamp = formatTimestampBrasilia();
      const addressLines = geoLines || ['Obtendo localização...'];
      const allLines = [timestamp, ...addressLines];
      const fontSize = 50;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      const lineHeight = fontSize * 1.5;
      const padding = 12;
      const rightMargin = 20;
      const bottomMargin = 20;
      let maxW = 0;
      for (const line of allLines) { const m = ctx.measureText(line); if (m.width > maxW) maxW = m.width; }
      const boxWidth = maxW + padding * 2;
      const boxHeight = allLines.length * lineHeight + padding * 2;
      const boxX = canvas.width - boxWidth - rightMargin;
      const boxY = canvas.height - boxHeight - bottomMargin;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.roundRect?.(boxX, boxY, boxWidth, boxHeight, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      allLines.forEach((line, i) => { ctx.fillText(line, canvas.width - rightMargin - padding, boxY + padding + i * lineHeight); });
      ctx.textAlign = 'left';
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
  }, [geoLines]);

  useEffect(() => {
    if (showCamera && cameraReady) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      drawOverlay();
    }
  }, [geoLines, showCamera, cameraReady, drawOverlay]);

  const captureReceiptPhoto = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsUploading(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao capturar'))), 'image/jpeg', 0.9);
      });
      const formData = new FormData();
      formData.append('file', blob, `receipt_${Date.now()}.jpg`);
      formData.append('event_id', eventId);
      formData.append('photo_type', 'fuel_receipt');
      formData.append('action', 'upload');
      const { data: result, error } = await supabase.functions.invoke('transport-photos', { body: formData });
      if (error) throw new Error(error.message);
      if (result?.error) throw new Error(result.error);
      toast({ title: 'Sucesso', description: 'Foto do comprovante capturada.' });
      stopCamera();
      loadReceiptPhotos();
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha ao enviar foto.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('event_id', eventId);
        formData.append('photo_type', 'fuel_receipt');
        formData.append('action', 'upload');
        const { data: result, error } = await supabase.functions.invoke('transport-photos', { body: formData });
        if (error) throw new Error(error.message);
        if (result?.error) throw new Error(result.error);
      }
      toast({ title: 'Sucesso', description: 'Comprovante enviado.' });
      loadReceiptPhotos();
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha ao enviar.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteReceiptPhoto = async (photo: FuelReceiptPhoto) => {
    try {
      await supabase.functions.invoke('transport-photos', {
        body: { action: 'delete', path: photo.path },
      });
      setReceiptPhotos(prev => prev.filter(p => p.path !== photo.path));
      toast({ title: 'Foto removida' });
    } catch {
      toast({ title: 'Erro', description: 'Falha ao remover foto.', variant: 'destructive' });
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: items } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('event_id', eventId)
        .in('item_type', ['fuel_start', 'fuel_end']);

      const startItem = items?.find((i: any) => i.item_type === 'fuel_start');
      const endItem = items?.find((i: any) => i.item_type === 'fuel_end');

      if (startItem?.notes) {
        try {
          const parsed = JSON.parse(startItem.notes);
          setData(prev => ({ ...prev, km_inicial: parsed.km_inicial || '', combustivel_inicial: parsed.combustivel_inicial || '', km_reserva_inicial: parsed.km_reserva_inicial || '' }));
        } catch {}
        setIsStartConfirmed(!!startItem.is_checked);
        setStartItemId(startItem.id);
      }

      if (endItem?.notes) {
        try {
          const parsed = JSON.parse(endItem.notes);
          setData(prev => ({
            ...prev,
            km_final: parsed.km_final || '',
            combustivel_final: parsed.combustivel_final || '',
            km_reserva_final: parsed.km_reserva_final || '',
            abastecido: parsed.abastecido || false,
            observacoes: parsed.observacoes || '',
          }));
        } catch {}
        setIsEndConfirmed(!!endItem.is_checked);
        setEndItemId(endItem.id);
      }
    } catch (err) {
      console.error('Error loading fuel data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveStart = async () => {
    if (!data.km_inicial.trim()) {
      toast({ title: 'Atenção', description: 'KM Inicial é obrigatório.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const meta = JSON.stringify({ km_inicial: data.km_inicial, combustivel_inicial: data.combustivel_inicial, km_reserva_inicial: data.km_reserva_inicial });
      const now = new Date().toISOString();

      if (startItemId) {
        await supabase.from('checklist_items').update({
          notes: meta, is_checked: true, checked_by: profileId, checked_at: now,
        }).eq('id', startItemId);
      } else {
        const { data: inserted } = await supabase.from('checklist_items').insert({
          event_id: eventId, item_type: 'fuel_start', item_name: 'Combustível - Início',
          is_checked: true, checked_by: profileId, checked_at: now, notes: meta, empresa_id: empresaId,
        }).select('id').single();
        if (inserted) setStartItemId(inserted.id);
      }

      setIsStartConfirmed(true);
      toast({ title: 'Salvo', description: 'Dados de início registrados.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveEnd = async () => {
    if (!data.km_final.trim()) {
      toast({ title: 'Atenção', description: 'KM Final é obrigatório.', variant: 'destructive' });
      return;
    }
    if (!data.combustivel_final.trim() && !data.abastecido) {
      toast({ title: 'Atenção', description: 'Informe o combustível final ou marque como abastecido.', variant: 'destructive' });
      return;
    }
    if (data.abastecido && receiptPhotos.length === 0) {
      toast({ title: 'Atenção', description: 'Envie a foto do comprovante de abastecimento.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const meta = JSON.stringify({
        km_final: data.km_final, combustivel_final: data.combustivel_final,
        km_reserva_final: data.km_reserva_final,
        abastecido: data.abastecido, observacoes: data.observacoes,
      });
      const now = new Date().toISOString();

      if (endItemId) {
        await supabase.from('checklist_items').update({
          notes: meta, is_checked: true, checked_by: profileId, checked_at: now,
        }).eq('id', endItemId);
      } else {
        const { data: inserted } = await supabase.from('checklist_items').insert({
          event_id: eventId, item_type: 'fuel_end', item_name: 'Combustível - Final',
          is_checked: true, checked_by: profileId, checked_at: now, notes: meta, empresa_id: empresaId,
        }).select('id').single();
        if (inserted) setEndItemId(inserted.id);
      }

      setIsEndConfirmed(true);
      toast({ title: 'Salvo', description: 'Dados de finalização registrados.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const kmRodado = data.km_inicial && data.km_final
    ? Math.max(0, Number(data.km_final) - Number(data.km_inicial))
    : null;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // Camera view for receipt
  if (showCamera) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Foto do Comprovante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="w-full rounded-lg" />
          </div>
          {geoLines && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{geoLines.join(', ')}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={stopCamera} className="flex-1">Cancelar</Button>
            <Button onClick={captureReceiptPhoto} disabled={!cameraReady || isUploading} className="flex-1">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
              Capturar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Start */}
      <Card className={isStartConfirmed ? 'border-green-500/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              Início do Evento
            </CardTitle>
            {isStartConfirmed && <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs font-medium">KM Inicial *</Label>
            <Input type="number" placeholder="Ex: 45230" value={data.km_inicial}
              onChange={e => setData(p => ({ ...p, km_inicial: e.target.value }))}
              disabled={!canCheck || isStartConfirmed} />
          </div>
          <div>
            <Label className="text-xs font-medium">Combustível Inicial</Label>
            <FuelLevelSelector value={data.combustivel_inicial}
              onChange={v => setData(p => ({ ...p, combustivel_inicial: v }))}
              disabled={!canCheck || isStartConfirmed} />
          </div>
          {data.combustivel_inicial === 'R' && (
            <div className="animate-in slide-in-from-top-2">
              <Label className="text-xs font-medium text-red-500">KM rodados na Reserva</Label>
              <Input type="number" min="0" placeholder="Ex: 15" value={data.km_reserva_inicial}
                onChange={e => setData(p => ({ ...p, km_reserva_inicial: e.target.value.replace('-', '') }))}
                disabled={!canCheck || isStartConfirmed}
                className="border-red-300 focus:border-red-500" />
            </div>
          )}
          {canCheck && !isStartConfirmed && (
            <Button onClick={saveStart} disabled={isSaving || !data.km_inicial.trim()} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar Início
            </Button>
          )}
        </CardContent>
      </Card>

      {/* End */}
      <Card className={isEndConfirmed ? 'border-green-500/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Fuel className="h-4 w-4 text-primary" />
              Finalização do Evento
            </CardTitle>
            {isEndConfirmed && <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs font-medium">KM Final *</Label>
            <Input type="number" placeholder="Ex: 45380" value={data.km_final}
              onChange={e => setData(p => ({ ...p, km_final: e.target.value }))}
              disabled={!canCheck || isEndConfirmed} />
          </div>
          <div>
            <Label className="text-xs font-medium">Combustível Final</Label>
            <FuelLevelSelector value={data.combustivel_final}
              onChange={v => setData(p => ({ ...p, combustivel_final: v }))}
              disabled={!canCheck || isEndConfirmed} />
          </div>
          {data.combustivel_final === 'R' && (
            <div className="animate-in slide-in-from-top-2">
              <Label className="text-xs font-medium text-red-500">KM rodados na Reserva</Label>
              <Input type="number" min="0" placeholder="Ex: 15" value={data.km_reserva_final}
                onChange={e => setData(p => ({ ...p, km_reserva_final: e.target.value.replace('-', '') }))}
                disabled={!canCheck || isEndConfirmed}
                className="border-red-300 focus:border-red-500" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <Switch checked={data.abastecido}
              onCheckedChange={v => setData(p => ({ ...p, abastecido: v }))}
              disabled={!canCheck || isEndConfirmed} />
            <Label className="text-sm">Viatura foi abastecida</Label>
          </div>
          {data.abastecido && (
            <div className="animate-in slide-in-from-top-2 space-y-3 border border-primary/20 rounded-lg p-3 bg-primary/5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-primary">
                  📷 Comprovante de Abastecimento *
                </Label>
                {receiptPhotos.length > 0 && (
                  <Badge variant="default" className="text-xs">
                    {receiptPhotos.length} foto{receiptPhotos.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              {receiptPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {receiptPhotos.map(photo => (
                    <div key={photo.path} className="relative group">
                      <img
                        src={photo.url}
                        alt="Comprovante"
                        className="w-full h-20 object-cover rounded-lg cursor-pointer border"
                        onClick={() => setSelectedPhoto(selectedPhoto === photo.url ? null : photo.url)}
                      />
                      {canCheck && !isEndConfirmed && (
                        <button
                          onClick={() => deleteReceiptPhoto(photo)}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedPhoto && (
                <div className="relative">
                  <img src={selectedPhoto} alt="Comprovante ampliado" className="w-full rounded-lg border" />
                  <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={() => setSelectedPhoto(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {canCheck && !isEndConfirmed && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={openCamera} disabled={isUploading}>
                    <Camera className="h-4 w-4 mr-1" />
                    Câmera
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                    <ImageIcon className="h-4 w-4 mr-1" />
                    Galeria
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                </div>
              )}

              {receiptPhotos.length === 0 && (
                <p className="text-xs text-destructive text-center">
                  Foto do comprovante é obrigatória para confirmar.
                </p>
              )}
            </div>
          )}
          <div>
            <Label className="text-xs font-medium">Observações</Label>
            <Textarea placeholder="Observações sobre o combustível..." value={data.observacoes}
              onChange={e => setData(p => ({ ...p, observacoes: e.target.value }))}
              disabled={!canCheck || isEndConfirmed} rows={2} />
          </div>
          {canCheck && !isEndConfirmed && (
            <Button onClick={saveEnd} disabled={isSaving || !data.km_final.trim()} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar Finalização
            </Button>
          )}
        </CardContent>
      </Card>

      {/* KM summary */}
      {kmRodado !== null && (
        <Card className="border-primary/20">
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">KM Rodado</p>
              <p className="text-3xl font-black text-primary">{kmRodado} km</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.km_inicial} → {data.km_final}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!canCheck && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="py-3">
            <p className="text-sm text-center flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Apenas condutores podem registrar combustível e quilometragem.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
