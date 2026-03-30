import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Video, CheckCircle2, Loader2, AlertTriangle, Play, Square,
  RotateCcw, Camera, Trash2, Shield
} from 'lucide-react';
import { formatDateTimeSecsBR } from '@/utils/dateFormat';

const RECORDING_SETUP_MESSAGE = 'Tabela de gravações ou bucket de vídeos ainda não existem no Supabase. Rode o SQL de setup para liberar a gravação.';

function isRecordingSetupError(message?: string | null) {
  return !!message && (
    message.includes("Could not find the table 'public.event_recordings' in the schema cache") ||
    message.includes('Tabela public.event_recordings ou bucket checklist-videos não configurados') ||
    message.includes('Bucket not found') ||
    message.includes('The resource was not found')
  );
}

interface Recording {
  id: string;
  event_id: string;
  user_id: string;
  video_type: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  video_url: string | null;
  file_hash: string | null;
  file_size_bytes: number | null;
  status: string;
  device_info: string | null;
  latitude: number | null;
  longitude: number | null;
}

type VideoType = 'salao' | 'cabine' | 'externa';

const VIDEO_TYPES: { key: VideoType; label: string; description: string }[] = [
  { key: 'salao', label: 'Salão (Interior)', description: 'Vídeo 360° do salão/compartimento de atendimento' },
  { key: 'cabine', label: 'Cabine', description: 'Vídeo 360° da cabine do motorista' },
  { key: 'externa', label: 'Externa da VTR', description: 'Vídeo 360° da parte externa da viatura' },
];

interface Props {
  eventId: string;
  canCheck: boolean;
  profileId?: string;
  empresaId?: string | null;
  userId?: string;
}

// Detect iOS
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Get supported mime type
const getSupportedMimeType = (): string => {
  if (isIOS()) return 'video/mp4';
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
};

// Get file extension from mime type
const getExtension = (mime: string) => mime.includes('mp4') ? 'mp4' : 'webm';

// Generate SHA-256 hash of a blob
async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get device info string
function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'unknown';
  return `${platform} | ${ua.substring(0, 150)}`;
}

export function ChecklistVideoTab({ eventId, canCheck, profileId, empresaId, userId }: Props) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<VideoType | null>(null);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    loadRecordings();
    return () => stopStream();
  }, [eventId]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      setSetupError(null);
      const { data, error } = await supabase.functions.invoke('manage-recording', {
        body: { action: 'list', event_id: eventId },
      });
      if (error) throw error;
      setRecordings(data.recordings || []);

      // Check confirmation flag
      const { data: confirmRow } = await supabase
        .from('checklist_items')
        .select('id')
        .eq('event_id', eventId)
        .eq('item_type', 'videos_confirmed')
        .maybeSingle();
      setIsConfirmed(!!confirmRow);
    } catch (err) {
      console.error('Error loading recordings:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (isRecordingSetupError(message)) {
        setRecordings([]);
        setSetupError(RECORDING_SETUP_MESSAGE);
        return;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getRecordingForType = (type: VideoType): Recording | undefined => {
    return recordings.find(r => r.video_type === type && r.status === 'completed');
  };

  const openCamera = useCallback(async (type: VideoType) => {
    if (setupError) {
      toast({ title: 'Configuração pendente', description: setupError, variant: 'destructive' });
      return;
    }

    setPermissionError(null);
    setRecordingType(type);
    setShowCamera(true);
    setCameraReady(false);

    try {
      // On iOS, getUserMedia must happen from user gesture — we're already in one
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback: try without facingMode
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS requires these attributes
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch {
          // iOS sometimes needs a retry
          setTimeout(async () => {
            try { await videoRef.current?.play(); } catch {}
          }, 300);
        }
      }
      setCameraReady(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      let msg = 'Não foi possível acessar a câmera.';
      if (err.name === 'NotAllowedError') msg = 'Permissão de câmera/microfone negada. Verifique as configurações do navegador.';
      else if (err.name === 'NotFoundError') msg = 'Câmera ou microfone não encontrado no dispositivo.';
      else if (err.name === 'NotReadableError') msg = 'Câmera em uso por outro aplicativo.';
      setPermissionError(msg);
      toast({ title: 'Erro de Câmera', description: msg, variant: 'destructive' });
    }
  }, [setupError, toast]);

  const startRecording = useCallback(async () => {
    if (!streamRef.current || !recordingType) return;

    try {
      if (setupError) throw new Error(setupError);

      // 1. Register start on server (server timestamp)
      let location: { latitude?: number; longitude?: number } = {};
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch { /* location optional */ }

      const { data, error } = await supabase.functions.invoke('manage-recording', {
        body: {
          action: 'start',
          event_id: eventId,
          video_type: recordingType,
          device_info: getDeviceInfo(),
          ...location,
        },
      });
      if (error) throw error;
      setCurrentRecordingId(data.recording.id);

      // 2. Start MediaRecorder
      chunksRef.current = [];
      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = {};
      
      // Only set mimeType if supported (iOS Safari doesn't support setting it)
      if (typeof MediaRecorder !== 'undefined') {
        try {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            options.mimeType = mimeType;
          }
        } catch { /* ignore */ }
      }

      const mr = new MediaRecorder(streamRef.current, options);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => handleRecordingDone(data.recording.id);
      mr.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        toast({ title: 'Erro na gravação', description: 'A gravação falhou. Tente novamente.', variant: 'destructive' });
        setIsRecording(false);
      };

      // timeslice: collect data every second
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (err: any) {
      console.error('Start recording error:', err);
      const message = err?.message || 'Falha ao iniciar gravação.';
      if (isRecordingSetupError(message)) setSetupError(RECORDING_SETUP_MESSAGE);
      toast({ title: 'Erro', description: isRecordingSetupError(message) ? RECORDING_SETUP_MESSAGE : message, variant: 'destructive' });
    }
  }, [recordingType, eventId, setupError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleRecordingDone = async (recordingId: string) => {
    if (chunksRef.current.length === 0) return;

    setIsUploading(true);
    try {
      const mimeType = getSupportedMimeType();
      const ext = getExtension(mimeType);
      const blob = new Blob(chunksRef.current, { type: mimeType });

      // Generate SHA-256 hash
      const fileHash = await hashBlob(blob);

      // Upload to storage
      const fileName = `${userId || 'unknown'}/${eventId}/${recordingType}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('checklist-videos')
        .upload(fileName, blob, { contentType: mimeType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('checklist-videos')
        .getPublicUrl(fileName);

      // Finish recording on server
      const { error: finishError } = await supabase.functions.invoke('manage-recording', {
        body: {
          action: 'finish',
          recording_id: recordingId,
          video_url: urlData.publicUrl,
          file_hash: fileHash,
          file_size_bytes: blob.size,
        },
      });
      if (finishError) throw finishError;

      // Also update checklist_items for backward compatibility
      const itemType = `video_${recordingType}`;
      const meta = JSON.stringify({ url: urlData.publicUrl, timestamp: new Date().toISOString(), fileName, hash: fileHash });

      const { data: existingItem } = await supabase
        .from('checklist_items')
        .select('id')
        .eq('event_id', eventId)
        .eq('item_type', itemType)
        .maybeSingle();

      if (existingItem?.id) {
        await supabase.from('checklist_items').update({
          notes: meta, is_checked: true, checked_by: profileId, checked_at: new Date().toISOString(),
        }).eq('id', existingItem.id);
      } else {
        await supabase.from('checklist_items').insert({
          event_id: eventId, item_type: itemType,
          item_name: `Vídeo ${VIDEO_TYPES.find(v => v.key === recordingType)?.label}`,
          is_checked: true, checked_by: profileId, checked_at: new Date().toISOString(),
          notes: meta, empresa_id: empresaId,
        });
      }

      toast({ title: 'Sucesso', description: 'Vídeo gravado e salvo com sucesso.' });
      closeCamera();
      await loadRecordings();
    } catch (err: any) {
      console.error('Upload error:', err);
      const message = err?.message || 'Não foi possível salvar o vídeo.';
      if (isRecordingSetupError(message)) setSetupError(RECORDING_SETUP_MESSAGE);
      toast({ title: 'Erro no Upload', description: isRecordingSetupError(message) ? RECORDING_SETUP_MESSAGE : message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const closeCamera = useCallback(() => {
    stopStream();
    setShowCamera(false);
    setRecordingType(null);
    setIsRecording(false);
    setCurrentRecordingId(null);
    setPermissionError(null);
  }, [stopStream]);

  const deleteRecording = async (type: VideoType) => {
    const rec = getRecordingForType(type);
    if (!rec) return;

    try {
      const { error } = await supabase.functions.invoke('manage-recording', {
        body: { action: 'delete', recording_id: rec.id },
      });
      if (error) throw error;

      // Also clear checklist item
      await supabase.from('checklist_items')
        .update({ notes: null, is_checked: false, checked_by: null, checked_at: null })
        .eq('event_id', eventId)
        .eq('item_type', `video_${type}`);

      toast({ title: 'Vídeo removido' });
      await loadRecordings();
    } catch (err: any) {
      console.error('Delete error:', err);
      toast({ title: 'Erro', description: err.message || 'Não foi possível remover.', variant: 'destructive' });
    }
  };

  const handleConfirm = async () => {
    const allRecorded = VIDEO_TYPES.every(v => getRecordingForType(v.key));
    if (!allRecorded) {
      toast({ title: 'Atenção', description: 'Todos os 3 vídeos devem ser gravados antes de confirmar.', variant: 'destructive' });
      return;
    }
    try {
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from('checklist_items')
        .select('id')
        .eq('event_id', eventId)
        .eq('item_type', 'videos_confirmed' as any)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from('checklist_items').update({
          is_checked: true, checked_by: profileId, checked_at: now, empresa_id: empresaId,
        }).eq('id', existing.id);
      } else {
        await supabase.from('checklist_items').insert({
          event_id: eventId, item_type: 'videos_confirmed' as any,
          item_name: 'VIDEOS_CONFIRMADO', is_checked: true,
          checked_by: profileId, checked_at: now, empresa_id: empresaId,
        });
      }
      setIsConfirmed(true);
      toast({ title: 'Sucesso', description: 'Vídeos confirmados com sucesso.' });
    } catch (err) {
      console.error('Confirm error:', err);
      toast({ title: 'Erro', description: 'Não foi possível confirmar.', variant: 'destructive' });
    }
  };

  const recordedCount = VIDEO_TYPES.filter(v => getRecordingForType(v.key)).length;
  const allRecorded = recordedCount === 3;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isConfirmed && (
        <div className="flex items-center justify-center gap-1.5 text-green-600 mb-2">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-xs font-bold uppercase">Vídeos Confirmados</span>
        </div>
      )}

      {/* Camera / Recording UI */}
      {showCamera && (
        <Card className="border-primary/30 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              {isRecording ? 'Gravando' : 'Câmera'}: {VIDEO_TYPES.find(v => v.key === recordingType)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {permissionError ? (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-destructive font-medium">{permissionError}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  No iOS: Configurações → Safari → Câmera → Permitir
                </p>
                <Button variant="outline" onClick={closeCamera} className="mt-3">Fechar</Button>
              </div>
            ) : (
              <>
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ WebkitTransform: 'scaleX(1)' }}
                  />
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  )}
                  {isRecording && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-600 animate-pulse" />
                      <span className="text-xs text-white font-bold bg-black/50 px-2 py-0.5 rounded">REC</span>
                    </div>
                  )}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                        <p className="text-sm">Enviando vídeo...</p>
                        <p className="text-xs text-white/70 mt-1">Gerando hash SHA-256...</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 justify-center">
                  {!isRecording ? (
                    <Button
                      onClick={startRecording}
                      disabled={isUploading || !cameraReady}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Iniciar Gravação
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} variant="destructive">
                      <Square className="h-4 w-4 mr-2" />
                      Parar Gravação
                    </Button>
                  )}
                  <Button variant="outline" onClick={closeCamera} disabled={isRecording || isUploading}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Video cards */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Vídeos 360° da VTR
            </CardTitle>
            <Badge variant={allRecorded ? 'default' : 'secondary'}>
              {recordedCount}/3
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Grave um vídeo 360° de cada área. Timestamp e hash SHA-256 são registrados automaticamente no servidor.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {VIDEO_TYPES.map(vtype => {
            const rec = getRecordingForType(vtype.key);
            return (
              <div
                key={vtype.key}
                className={`p-3 rounded-lg border transition-colors ${
                  rec ? 'bg-green-500/10 border-green-500/30' : 'bg-card border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{vtype.label}</p>
                    <p className="text-xs text-muted-foreground">{vtype.description}</p>
                    {rec && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Gravado em {formatDateTimeSecsBR(rec.started_at)}
                        </p>
                        {rec.duration_seconds != null && (
                          <p className="text-xs text-muted-foreground">
                            Duração: {rec.duration_seconds}s
                            {rec.file_hash && ` · Hash: ${rec.file_hash.substring(0, 12)}...`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {rec ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        {canCheck && !isConfirmed && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2"
                              onClick={() => openCamera(vtype.key)} disabled={showCamera}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-destructive"
                              onClick={() => deleteRecording(vtype.key)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </>
                    ) : (
                      canCheck && !isConfirmed && (
                        <Button size="sm" onClick={() => openCamera(vtype.key)} disabled={showCamera} className="h-8">
                          <Camera className="h-3.5 w-3.5 mr-1.5" />
                          Gravar
                        </Button>
                      )
                    )}
                  </div>
                </div>
                {rec?.video_url && (
                  <div className="mt-2">
                    <video src={rec.video_url} controls playsInline className="w-full rounded-md max-h-48" preload="metadata" />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {!canCheck && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="py-3">
            <p className="text-sm text-center flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Apenas condutores podem gravar os vídeos da viatura.
            </p>
          </CardContent>
        </Card>
      )}

      {setupError && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Configuração pendente no Supabase</p>
                <p className="text-sm text-muted-foreground">{setupError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {canCheck && !isConfirmed ? (
        <Button onClick={handleConfirm} disabled={!allRecorded}
          className="w-full rounded-2xl py-6 text-sm font-black uppercase tracking-widest">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Confirmar Vídeos da VTR
        </Button>
      ) : isConfirmed ? (
        <div className="text-center text-sm text-muted-foreground bg-green-50 border border-green-200 rounded-2xl p-4">
          <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
          Vídeos da VTR confirmados com sucesso.
        </div>
      ) : null}
    </div>
  );
}
