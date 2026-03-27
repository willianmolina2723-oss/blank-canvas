import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import type { AppRole } from '@/types/database';
import { generateBadgePDF, renderBadgeToCanvas } from '@/utils/generateBadgePDF';

interface BadgeData {
  fullName: string;
  roles: AppRole[];
  professionalId: string | null;
  avatarUrl: string | null;
}

interface BadgePreviewDialogProps {
  data: BadgeData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BadgePreviewDialog({ data, open, onOpenChange }: BadgePreviewDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!open || !data) return;
    const timer = setTimeout(() => {
      if (canvasRef.current) {
        setIsRendering(true);
        renderBadgeToCanvas(canvasRef.current, data).finally(() => setIsRendering(false));
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [open, data]);

  const handleDownload = async () => {
    if (!data) return;
    setIsGenerating(true);
    try {
      await generateBadgePDF(data);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Prévia do Crachá</DialogTitle>
        </DialogHeader>

        <div className="relative flex justify-center bg-muted rounded-lg p-4">
          {isRendering && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-muted/80 rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="w-full max-w-[600px] rounded-md shadow-lg"
            style={{ aspectRatio: '1024 / 640' }}
          />
        </div>

        {!data.avatarUrl && (
          <p className="text-sm text-amber-600 text-center">
            ⚠️ Este usuário não possui foto cadastrada. Edite o perfil para adicionar uma foto.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleDownload} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Baixar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
