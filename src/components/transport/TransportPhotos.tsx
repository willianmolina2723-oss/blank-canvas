import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2, ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export function TransportPhotos({ transportId, canEdit }: TransportPhotosProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<TransportPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (transportId) loadPhotos();
  }, [transportId]);

  const loadPhotos = async () => {
    if (!transportId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'transport-photos',
        { body: { action: 'list', transport_id: transportId } }
      );
      if (error) throw error;
      if (data?.photos) setPhotos(data.photos);
    } catch (err) {
      console.error('Error loading photos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const MAX_FILE_SIZE_MB = 30;
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !transportId) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast({ title: 'Arquivo inválido', description: `"${file.name}" não é uma imagem. Envie apenas fotos (JPEG, PNG, etc).`, variant: 'destructive' });
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          const sizeMB = (file.size / 1024 / 1024).toFixed(1);
          toast({ 
            title: 'Foto muito grande', 
            description: `"${file.name}" tem ${sizeMB}MB. O limite é ${MAX_FILE_SIZE_MB}MB. Reduza a resolução ou tire a foto em qualidade menor.`, 
            variant: 'destructive' 
          });
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('transport_id', transportId);
        formData.append('action', 'upload');

        const { data, error } = await supabase.functions.invoke(
          'transport-photos',
          { body: formData }
        );

        if (error) {
          console.error('Upload error:', error);
          throw new Error(error.message || 'Falha ao enviar foto');
        }

        if (data?.error) {
          throw new Error(data.error);
        }
      }

      toast({ title: 'Sucesso', description: 'Foto(s) enviada(s) com sucesso.' });
      loadPhotos();
    } catch (err: any) {
      console.error('Error uploading:', err);
      const msg = err?.message || 'Falha ao enviar foto. Verifique o tamanho e tente novamente.';
      toast({ title: 'Erro ao enviar foto', description: msg, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (photo: TransportPhoto) => {
    try {
      const { error } = await supabase.functions.invoke(
        'transport-photos',
        { body: { action: 'delete', transport_id: transportId, path: photo.path } }
      );

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Foto removida.' });
      setPhotos(prev => prev.filter(p => p.path !== photo.path));
      if (selectedPhoto === photo.url) setSelectedPhoto(null);
    } catch (err) {
      console.error('Error deleting:', err);
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
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full h-20 border-dashed"
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Camera className="h-5 w-5 mr-2" />
                )}
                {isUploading ? 'Enviando...' : 'Tirar Foto ou Selecionar'}
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

      {/* Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white"
            onClick={() => setSelectedPhoto(null)}
          >
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
