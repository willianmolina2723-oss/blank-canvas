import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import {
  invokeManageRecording,
  isRecordingSetupError,
  RECORDING_SETUP_MESSAGE,
  type Recording,
} from './manageRecordingClient';
import {
  Video, CheckCircle2, Loader2, AlertTriangle, Play, Square,
  RotateCcw, Camera, Trash2, Shield
} from 'lucide-react';
import { formatDateTimeSecsBR } from '@/utils/dateFormat';
import { toBrasiliaDate } from '@/utils/dateFormat';

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
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const getSupportedMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') return 'video/mp4';
  // iOS Safari only supports mp4
  if (isIOS()) {
    if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
    return ''; // let browser choose default
  }
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
};

const getExtension = (mime: string) => mime.includes('mp4') ? 'mp4' : 'webm';

async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'unknown';
  return `${platform} | ${ua.substring(0, 150)}`;
}

// Format timestamp for overlay in Brasília timezone
function formatTimestampBrasilia(): string {
  const now = toBrasiliaDate(new Date());
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} (Brasília)`;
}

// Reverse geocode coordinates to a readable address
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'SAPH-App/1.0' } }
    );
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export function ChecklistVideoTab({ eventId, canCheck, profileId, empresaId }: Props) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<VideoType | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);

  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadRecordings();
    return () => { stopStream(); stopTimestampLoop(); };
  }, [eventId]);

  const stopTimestampLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    stopTimestampLoop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    canvasStreamRef.current?.getTracks().forEach(t => t.stop());
    canvasStreamRef.current = null;
    setCameraReady(false);
  }, [stopTimestampLoop]);

  // Draw video frame + timestamp overlay onto canvas
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw timestamp overlay (Brasília)
    const ts = formatTimestampBrasilia();
    const fontSize = Math.max(14, Math.floor(canvas.height / 30));
    ctx.font = `bold ${fontSize}px monospace`;

    // Prepare lines: timestamp + address (if available)
    const lines: string[] = [ts];
    if (geoAddress) {
      // Truncate address to fit on screen (max ~60 chars per line)
      const maxLen = 65;
      if (geoAddress.length > maxLen) {
        lines.push(geoAddress.substring(0, maxLen));
        lines.push(geoAddress.substring(maxLen, maxLen * 2));
      } else {
        lines.push(geoAddress);
      }
    }

    const smallFontSize = Math.max(11, Math.floor(fontSize * 0.75));
    const padding = 8;
    const lineHeight = fontSize + 4;
    const smallLineHeight = smallFontSize + 3;

    // Measure widths
    ctx.font = `bold ${fontSize}px monospace`;
    let maxWidth = ctx.measureText(ts).width;
    ctx.font = `${smallFontSize}px monospace`;
    for (let i = 1; i < lines.length; i++) {
      maxWidth = Math.max(maxWidth, ctx.measureText(lines[i]).width);
    }

    const totalHeight = lineHeight + (lines.length - 1) * smallLineHeight + padding * 2;
    const barWidth = maxWidth + padding * 2;
    const barX = canvas.width - barWidth - 10;
    const barY = canvas.height - totalHeight - 10;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(barX, barY, barWidth, totalHeight);

    // Timestamp line
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(ts, barX + padding, barY + padding);

    // Address lines
    ctx.fillStyle = '#E0E0E0';
    ctx.font = `${smallFontSize}px monospace`;
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], barX + padding, barY + padding + lineHeight + (i - 1) * smallLineHeight);
    }

    // REC indicator if recording
    if (mediaRecorderRef.current?.state === 'recording') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(10, 10, 80, 30);
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(30, 25, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.floor(fontSize * 0.7)}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('REC', 44, 25);
    }

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, [geoAddress]);

  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      setSetupError(null);
      const data = await invokeManageRecording<{ recordings: Recording[] }>({
        action: 'list',
        event_id: eventId,
      });
      setRecordings(data.recordings || []);

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
    setGeoAddress(null);

    // Fetch geolocation + address in background
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true })
      );
      const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      setGeoAddress(addr);
    } catch {
      setGeoAddress(null);
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch {
          setTimeout(async () => {
            try { await videoRef.current?.play(); } catch {}
          }, 300);
        }
      }

      // Start drawing frames with timestamp on canvas
      animFrameRef.current = requestAnimationFrame(drawFrame);
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
  }, [setupError, toast, drawFrame]);

  const startRecording = useCallback(async () => {
    if (!streamRef.current || !recordingType || !canvasRef.current) return;

    try {
      if (setupError) throw new Error(setupError);

      // Get geolocation
      let location: { latitude?: number; longitude?: number } = {};
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch { /* optional */ }

      // Register start on server
      const data = await invokeManageRecording<{ recording: Recording; server_time: string }>({
        action: 'start',
        event_id: eventId,
        video_type: recordingType,
        device_info: getDeviceInfo(),
        ...location,
      });

      // On iOS, captureStream on canvas is unreliable. Use the raw camera stream instead
      // and rely on the canvas for visual preview only.
      const useCanvasStream = !isIOS() && typeof canvasRef.current.captureStream === 'function';

      let recordStream: MediaStream;
      if (useCanvasStream) {
        const canvasStream = canvasRef.current.captureStream(30);
        const audioTracks = streamRef.current.getAudioTracks();
        audioTracks.forEach(track => canvasStream.addTrack(track));
        canvasStreamRef.current = canvasStream;
        recordStream = canvasStream;
      } else {
        // Fallback: record raw camera stream (timestamp only in metadata)
        recordStream = streamRef.current;
      }

      chunksRef.current = [];
      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = {};
      if (mimeType) {
        try {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            options.mimeType = mimeType;
          }
        } catch { /* ignore */ }
      }

      const mr = new MediaRecorder(recordStream, options);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => handleRecordingDone(data.recording.id);
      mr.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        toast({ title: 'Erro na gravação', description: 'A gravação falhou. Tente novamente.', variant: 'destructive' });
        setIsRecording(false);
        stopTimestampLoop();
      };

      mr.start(1000);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);

      // Timer for UI display
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Start recording error:', err);
      const message = err?.message || 'Falha ao iniciar gravação.';
      if (isRecordingSetupError(message)) setSetupError(RECORDING_SETUP_MESSAGE);
      toast({ title: 'Erro', description: isRecordingSetupError(message) ? RECORDING_SETUP_MESSAGE : message, variant: 'destructive' });
    }
  }, [recordingType, eventId, setupError, drawFrame, stopTimestampLoop]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const handleRecordingDone = async (recordingId: string) => {
    if (chunksRef.current.length === 0) return;

    setIsUploading(true);
    try {
      const mimeType = getSupportedMimeType();
      const ext = getExtension(mimeType);
      const blob = new Blob(chunksRef.current, { type: mimeType });

      const fileHash = await hashBlob(blob);

       const formData = new FormData();
       formData.append('action', 'finish');
       formData.append('recording_id', recordingId);
       formData.append('file_hash', fileHash);
       formData.append('file_size_bytes', String(blob.size));
       formData.append('duration_seconds', String(recordingSeconds));
       formData.append('video_file', blob, `${recordingType || 'video'}_${Date.now()}.${ext}`);

       const finishData = await invokeManageRecording<{ recording: Recording }>(formData);

      // Update checklist_items
      const itemType = `video_${recordingType}`;
       const meta = JSON.stringify({
         url: finishData.recording.video_url,
         timestamp: new Date().toISOString(),
         hash: fileHash,
         fileSizeBytes: blob.size,
       });

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
    setPermissionError(null);
    setRecordingSeconds(0);
  }, [stopStream]);

  const deleteRecording = async (type: VideoType) => {
    const rec = getRecordingForType(type);
    if (!rec) return;

    try {
      await invokeManageRecording<{ success: true }>({ action: 'delete', recording_id: rec.id });

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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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

      {/* Hidden video element for camera feed */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {/* Camera / Recording UI */}
      {showCamera && (
        <Card className="border-primary/30 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              {isRecording ? 'Gravando' : 'Câmera'}: {VIDEO_TYPES.find(v => v.key === recordingType)?.label}
              {isRecording && (
                <Badge variant="destructive" className="ml-auto animate-pulse">
                  {formatDuration(recordingSeconds)}
                </Badge>
              )}
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
                  {/* Canvas shows camera feed + timestamp overlay */}
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-cover"
                  />
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
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
            Grave um vídeo 360° de cada área. Timestamp, hash SHA-256 e geolocalização são registrados automaticamente.
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
