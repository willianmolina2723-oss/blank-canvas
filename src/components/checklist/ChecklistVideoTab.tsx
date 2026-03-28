import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Video, CheckCircle2, Loader2, AlertTriangle, Play, Square,
  RotateCcw, Camera, Trash2
} from 'lucide-react';

interface VideoRecord {
  key: VideoType;
  label: string;
  description: string;
  url: string | null;
  timestamp: string | null;
  checklistItemId: string | null;
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

export function ChecklistVideoTab({ eventId, canCheck, profileId, empresaId, userId }: Props) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [videos, setVideos] = useState<VideoRecord[]>(
    VIDEO_TYPES.map(v => ({ ...v, url: null, timestamp: null, checklistItemId: null }))
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<VideoType | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadVideos();
    return () => stopStream();
  }, [eventId]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const loadVideos = async () => {
    setIsLoading(true);
    try {
      const { data: rows } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('event_id', eventId)
        .in('item_type', ['video_salao', 'video_cabine', 'video_externa', 'videos_confirmed']);

      const confirmRow = rows?.find(r => r.item_type === 'videos_confirmed');
      setIsConfirmed(!!confirmRow);

      setVideos(VIDEO_TYPES.map(v => {
        const row = rows?.find(r => r.item_type === `video_${v.key}`);
        if (row && row.notes) {
          try {
            const meta = JSON.parse(row.notes);
            return { ...v, url: meta.url || null, timestamp: meta.timestamp || null, checklistItemId: row.id };
          } catch { /* ignore */ }
        }
        return { ...v, url: null, timestamp: null, checklistItemId: row?.id || null };
      }));
    } catch (err) {
      console.error('Error loading videos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = useCallback(async (type: VideoType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setShowCamera(true);
      setRecordingType(type);
    } catch (err) {
      console.error('Camera error:', err);
      toast({ title: 'Erro', description: 'Não foi possível acessar a câmera.', variant: 'destructive' });
    }
  }, [toast]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp8' });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => handleRecordingDone();
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const handleRecordingDone = async () => {
    if (!recordingType || chunksRef.current.length === 0) return;

    setIsUploading(true);
    const now = new Date();
    const timestamp = now.toISOString();

    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const fileName = `${eventId}/${recordingType}_${Date.now()}.webm`;
      const filePath = `${userId || 'unknown'}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('checklist-videos')
        .upload(filePath, blob, { contentType: 'video/webm', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('checklist-videos')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      const meta = JSON.stringify({ url: publicUrl, timestamp, fileName: filePath });
      const itemType = `video_${recordingType}`;

      const existingVideo = videos.find(v => v.key === recordingType);

      if (existingVideo?.checklistItemId) {
        await supabase
          .from('checklist_items')
          .update({
            notes: meta,
            is_checked: true,
            checked_by: profileId,
            checked_at: timestamp,
          })
          .eq('id', existingVideo.checklistItemId);
      } else {
        await supabase
          .from('checklist_items')
          .insert({
            event_id: eventId,
            item_type: itemType,
            item_name: `Vídeo ${VIDEO_TYPES.find(v => v.key === recordingType)?.label}`,
            is_checked: true,
            checked_by: profileId,
            checked_at: timestamp,
            notes: meta,
            empresa_id: empresaId,
          });
      }

      toast({ title: 'Sucesso', description: 'Vídeo gravado e salvo com sucesso.' });
      closeCamera();
      await loadVideos();
    } catch (err) {
      console.error('Upload error:', err);
      toast({ title: 'Erro', description: 'Não foi possível salvar o vídeo.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const closeCamera = () => {
    stopStream();
    setShowCamera(false);
    setRecordingType(null);
    setIsRecording(false);
  };

  const deleteVideo = async (type: VideoType) => {
    const video = videos.find(v => v.key === type);
    if (!video?.checklistItemId) return;

    try {
      if (video.url) {
        const meta = JSON.parse(
          (await supabase.from('checklist_items').select('notes').eq('id', video.checklistItemId).single()).data?.notes || '{}'
        );
        if (meta.fileName) {
          await supabase.storage.from('checklist-videos').remove([meta.fileName]);
        }
      }

      await supabase
        .from('checklist_items')
        .update({ notes: null, is_checked: false, checked_by: null, checked_at: null })
        .eq('id', video.checklistItemId);

      toast({ title: 'Vídeo removido' });
      await loadVideos();
    } catch (err) {
      console.error('Delete error:', err);
      toast({ title: 'Erro', description: 'Não foi possível remover o vídeo.', variant: 'destructive' });
    }
  };

  const handleConfirm = async () => {
    const allRecorded = videos.every(v => v.url);
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
          event_id: eventId,
          item_type: 'videos_confirmed' as any,
          item_name: 'VIDEOS_CONFIRMADO',
          is_checked: true,
          checked_by: profileId,
          checked_at: now,
          empresa_id: empresaId,
        });
      }

      setIsConfirmed(true);
      toast({ title: 'Sucesso', description: 'Vídeos confirmados com sucesso.' });
    } catch (err) {
      console.error('Confirm error:', err);
      toast({ title: 'Erro', description: 'Não foi possível confirmar.', variant: 'destructive' });
    }
  };

  const recordedCount = videos.filter(v => v.url).length;
  const allRecorded = recordedCount === 3;

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  };

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

      {/* Camera modal */}
      {showCamera && (
        <Card className="border-primary/30 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Gravando: {VIDEO_TYPES.find(v => v.key === recordingType)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
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
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              {!isRecording ? (
                <Button onClick={startRecording} disabled={isUploading} className="bg-red-600 hover:bg-red-700 text-white">
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
            Grave um vídeo 360° de cada área da viatura. O timestamp é registrado automaticamente.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {videos.map(video => (
            <div
              key={video.key}
              className={`p-3 rounded-lg border transition-colors ${
                video.url
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-card border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{video.label}</p>
                  <p className="text-xs text-muted-foreground">{video.description}</p>
                  {video.timestamp && (
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      ✓ Gravado em {formatTimestamp(video.timestamp)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {video.url ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      {canCheck && !isConfirmed && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => startCamera(video.key)}
                            disabled={showCamera}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-destructive"
                            onClick={() => deleteVideo(video.key)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    canCheck && !isConfirmed && (
                      <Button
                        size="sm"
                        onClick={() => startCamera(video.key)}
                        disabled={showCamera}
                        className="h-8"
                      >
                        <Camera className="h-3.5 w-3.5 mr-1.5" />
                        Gravar
                      </Button>
                    )
                  )}
                </div>
              </div>
              {video.url && (
                <div className="mt-2">
                  <video
                    src={video.url}
                    controls
                    className="w-full rounded-md max-h-48"
                    preload="metadata"
                  />
                </div>
              )}
            </div>
          ))}
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

      {canCheck && !isConfirmed ? (
        <Button
          onClick={handleConfirm}
          disabled={!allRecorded}
          className="w-full rounded-2xl py-6 text-sm font-black uppercase tracking-widest"
        >
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
