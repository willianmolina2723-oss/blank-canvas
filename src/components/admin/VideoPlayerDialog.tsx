import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { explainError } from '@/utils/explainError';

interface VideoPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  title: string;
  subtitle?: string;
}

function extractStoragePath(url: string): string | null {
  // Suporta URL pública e signed URL
  const marker = '/checklist-videos/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let path = url.slice(idx + marker.length);
  // Remove query string (signed URL)
  const qIdx = path.indexOf('?');
  if (qIdx !== -1) path = path.slice(0, qIdx);
  return path;
}

export function VideoPlayerDialog({ open, onOpenChange, videoUrl, title, subtitle }: VideoPlayerDialogProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoUrl) {
      setSignedUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const path = extractStoragePath(videoUrl);
    if (!path) {
      setError('URL do vídeo inválida.');
      setLoading(false);
      return;
    }

    supabase.storage
      .from('checklist-videos')
      .createSignedUrl(path, 3600)
      .then(({ data, error: sErr }: any) => {
        if (cancelled) return;
        if (sErr || !data?.signedUrl) {
          setError(explainError(sErr, 'Não foi possível carregar o vídeo.'));
        } else {
          setSignedUrl(data.signedUrl);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, videoUrl]);

  const handleDownload = async () => {
    if (!videoUrl) return;
    const path = extractStoragePath(videoUrl);
    if (!path) return;
    const { data, error: sErr }: any = await supabase.storage
      .from('checklist-videos')
      .createSignedUrl(path, 3600, { download: true });
    if (sErr || !data?.signedUrl) return;
    window.open(data.signedUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
          {loading && <Loader2 className="h-8 w-8 animate-spin text-white" />}
          {error && (
            <div className="text-center text-white p-4">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {!loading && !error && signedUrl && (
            <video
              src={signedUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full"
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleDownload} disabled={!videoUrl} className="gap-2">
            <Download className="h-4 w-4" /> Baixar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
