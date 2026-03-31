import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2, ImageIcon, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { toBrasiliaDate } from '@/utils/dateFormat';

interface TransportPhoto {
  name: string;
  path: string;
  url: string;
  created_at: string;
}

interface TransportPhotosProps {
  transportId: string | null;
  canEdit: boolean;
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
    const poi = data.name || addr.amenity || addr.building || '';
    if (poi && !lines.includes(poi)) lines.push(poi);
    return lines.length > 0 ? lines : [`${lat.toFixed(5)}, ${lng.toFixed(5)}`];
  } catch {
    return [`${lat.toFixed(5)}, ${lng.toFixed(5)}`];
  }
}

export function TransportPhotos({ transportId, canEdit }: TransportPhotosProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [photos, setPhotos] = useState<TransportPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [geoLines, setGeoLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (transportId) loadPhotos();
  }, [transportId]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const loadPhotos = async () => {
    if (!transportId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('transport-photos', {
        body: { action: 'list', transport_id: transportId },
      });
      if (error) throw error;
      if (data?.photos) setPhotos(data.photos);
    } catch (err) {
      console.error('Error loading photos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setShowCamera(false);
  }, []);

  const openCamera = async () => {
    setShowCamera(true);
    setGeoLines(null);

    // Fetch geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lines = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          setGeoLines(lines);
        },
        () => setGeoLines(['Localização indisponível']),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        drawOverlay();
      }
    } catch (err) {
      console.error('Camera error:', err);
      toast({ title: 'Erro', description: 'Não foi possível acessar a câmera.', variant: 'destructive' });
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

      // Build overlay lines: timestamp + address lines
      const timestamp = formatTimestampBrasilia();
      const addressLines = geoLines || ['Obtendo localização...'];
      const allLines = [timestamp, ...addressLines];

      const fontSize = Math.max(14, Math.floor(canvas.width / 45));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';

      const lineHeight = fontSize * 1.5;
      const padding = 12;
      const rightMargin = 20;
      const bottomMargin = 20;

      // Measure max width
      let maxW = 0;
      for (const line of allLines) {
        const m = ctx.measureText(line);
        if (m.width > maxW) maxW = m.width;
      }

      const boxWidth = maxW + padding * 2;
      const boxHeight = allLines.length * lineHeight + padding * 2;
      const boxX = canvas.width - boxWidth - rightMargin;
      const boxY = canvas.height - boxHeight - bottomMargin;

      // Semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.roundRect?.(boxX, boxY, boxWidth, boxHeight, 8);
      ctx.fill();

      // Right-aligned white text
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      allLines.forEach((line, i) => {
        ctx.fillText(line, canvas.width - rightMargin - padding, boxY + padding + i * lineHeight);
      });
      ctx.textAlign = 'left'; // reset

      animFrameRef.current = requestAnimationFrame(loop);
    };

    loop();
  }, [geoLines]);

  // Re-start overlay when geoLines updates
  useEffect(() => {
    if (showCamera && cameraReady) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      drawOverlay();
    }
  }, [geoLines, showCamera, cameraReady, drawOverlay]);

  const capturePhoto = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !transportId) return;

    setIsUploading(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao capturar'))), 'image/jpeg', 0.9);
      });

      const formData = new FormData();
      formData.append('file', blob, `photo_${Date.now()}.jpg`);
      formData.append('transport_id', transportId);
      formData.append('action', 'upload');

      const { data, error } = await supabase.functions.invoke('transport-photos', { body: formData });
      if (error) throw new Error(error.message || 'Falha ao enviar foto');
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Sucesso', description: 'Foto capturada e enviada.' });
      loadPhotos();
    } catch (err: any) {
      console.error('Capture error:', err);
      toast({ title: 'Erro', description: err?.message || 'Falha ao enviar foto.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const MAX_FILE_SIZE_MB = 30;
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !transportId) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast({ title: 'Arquivo inválido', description: `"${file.name}" não é uma imagem.`, variant: 'destructive' });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast({ title: 'Foto muito grande', description: `"${file.name}" excede ${MAX_FILE_SIZE_MB}MB.`, variant: 'destructive' });
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('transport_id', transportId);
        formData.append('action', 'upload');

        const { data, error } = await supabase.functions.invoke('transport-photos', { body: formData });
        if (error) throw new Error(error.message || 'Falha ao enviar foto');
        if (data?.error) throw new Error(data.error);
      }

      toast({ title: 'Sucesso', description: 'Foto(s) enviada(s) com sucesso.' });
      loadPhotos();
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: 'Erro ao enviar foto', description: err?.message || 'Falha ao enviar.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (photo: TransportPhoto) => {
    try {
      const { error } = await supabase.functions.invoke('transport-photos', {
        body: { action: 'delete', transport_id: transportId, path: photo.path },
      });
      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Foto removida.' });
      setPhotos((prev) => prev.filter((p) => p.path !== photo.path));
      if (selectedPhoto === photo.url) setSelectedPhoto(null);
    } catch (err) {
      console.error('Delete error:', err);
      toast({ title: 'Erro', description: 'Falha ao remover foto.', variant: 'destructive' });
    }
  };

  if (!transportId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Fotos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Salve o transporte primeiro para adicionar fotos.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Camera view
  if (showCamera) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Capturar Foto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="w-full rounded-lg" />
          </div>

          {geoAddress && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{geoAddress}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={stopCamera}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={capturePhoto}
              disabled={!cameraReady || isUploading}
              className="flex-1"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {isUploading ? 'Enviando...' : 'Capturar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Fotos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                onClick={openCamera}
                disabled={isUploading}
                className="flex-1 h-16 border-dashed"
              >
                <Camera className="h-5 w-5 mr-2" />
                Câmera com Carimbo
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1 h-16 border-dashed"
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <ImageIcon className="h-5 w-5 mr-2" />
                )}
                Galeria
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <ImageIcon className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma foto registrada</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <div key={photo.path} className="relative group aspect-square">
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-full h-full object-cover rounded-md cursor-pointer"
                    onClick={() => setSelectedPhoto(photo.url)}
                  />
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(photo)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button className="absolute top-4 right-4 text-white" onClick={() => setSelectedPhoto(null)}>
            <X className="h-8 w-8" />
          </button>
          <img
            src={selectedPhoto}
            alt="Foto ampliada"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
