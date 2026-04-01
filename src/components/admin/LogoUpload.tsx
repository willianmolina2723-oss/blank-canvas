import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Upload, Trash2, Image, Loader2, Save, Building2, CreditCard } from 'lucide-react';
import {
  uploadLogo, deleteLogo, checkLogoExists,
  saveOrgName, fetchOrgName,
  uploadBadgeTemplate, getBadgeTemplatePublicUrl, deleteBadgeTemplate, checkBadgeTemplateExists
} from '@/utils/logoStorage';

export function LogoUpload() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [badgeUrl, setBadgeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingBadge, setIsUploadingBadge] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const badgeInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    const [logoResult, name, badgeResult] = await Promise.all([
      checkLogoExists(), fetchOrgName(), checkBadgeTemplateExists()
    ]);

    setLogoUrl(logoResult.exists ? logoResult.url : null);

    if (badgeResult.exists && badgeResult.empresaId) {
      setBadgeUrl(`${getBadgeTemplatePublicUrl(badgeResult.empresaId)}?t=${Date.now()}`);
    } else {
      setBadgeUrl(null);
    }
    setOrgName(name);
    setIsLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Selecione um arquivo de imagem.', variant: 'destructive' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 2MB.', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadLogo(file);
      setLogoUrl(url);
      toast({ title: 'Logo enviada', description: 'A logo será incluída em todos os PDFs gerados.' });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: 'Erro no upload', description: explainError(error, 'Não foi possível enviar a logo.'), variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    try {
      await deleteLogo();
      setLogoUrl(null);
      toast({ title: 'Logo removida', description: 'Os PDFs serão gerados sem logo.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: explainError(error, 'Não foi possível remover a logo.'), variant: 'destructive' });
    }
  };

  const handleUploadBadge = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Selecione um arquivo de imagem.', variant: 'destructive' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 2MB.', variant: 'destructive' });
      return;
    }

    setIsUploadingBadge(true);
    try {
      const url = await uploadBadgeTemplate(file);
      setBadgeUrl(url);
      toast({ title: 'Modelo de crachá enviado', description: 'Os crachás serão gerados com este modelo.' });
    } catch (error: any) {
      console.error('Badge upload error:', error);
      toast({ title: 'Erro no upload', description: explainError(error, 'Não foi possível enviar o modelo.'), variant: 'destructive' });
    } finally {
      setIsUploadingBadge(false);
      if (badgeInputRef.current) badgeInputRef.current.value = '';
    }
  };

  const handleDeleteBadge = async () => {
    try {
      await deleteBadgeTemplate();
      setBadgeUrl(null);
      toast({ title: 'Modelo removido', description: 'Os crachás usarão o modelo padrão.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: explainError(error, 'Não foi possível remover o modelo.'), variant: 'destructive' });
    }
  };

  const handleSaveOrgName = async () => {
    setIsSavingName(true);
    try {
      await saveOrgName(orgName);
      toast({ title: 'Nome salvo', description: 'O nome da organização será exibido nos PDFs.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: 'Não foi possível salvar o nome.', variant: 'destructive' });
    } finally {
      setIsSavingName(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Organization Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Nome da Organização
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Este nome aparecerá no cabeçalho de todos os PDFs gerados.
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Ex: SAMU Regional, Corpo de Bombeiros..."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSaveOrgName} disabled={isSavingName} size="sm">
                {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logo Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="h-4 w-4" />
            Logo dos Relatórios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Envie uma logo para ser incluída automaticamente em todos os PDFs gerados.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logoUrl ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="max-h-24 max-w-full object-contain"
                  onError={() => setLogoUrl(null)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                  Trocar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <>
                  <Upload className="h-8 w-8" />
                  <span className="text-sm font-medium">Clique para enviar a logo</span>
                  <span className="text-xs">PNG, JPG ou SVG (máx. 2MB)</span>
                </>
              )}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleUpload}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* Badge Template Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Modelo de Crachá
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Envie uma imagem de fundo personalizada para os crachás (1024×640px recomendado). Caso não envie, será usado o modelo padrão.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : badgeUrl ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                <img
                  src={badgeUrl}
                  alt="Modelo de Crachá"
                  className="max-h-32 max-w-full object-contain rounded"
                  onError={() => setBadgeUrl(null)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => badgeInputRef.current?.click()}
                  disabled={isUploadingBadge}
                >
                  {isUploadingBadge ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                  Trocar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteBadge}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => badgeInputRef.current?.click()}
              disabled={isUploadingBadge}
              className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              {isUploadingBadge ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <>
                  <Upload className="h-8 w-8" />
                  <span className="text-sm font-medium">Clique para enviar o modelo</span>
                  <span className="text-xs">PNG ou JPG (1024×640px, máx. 2MB)</span>
                </>
              )}
            </button>
          )}

          <input
            ref={badgeInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUploadBadge}
            className="hidden"
          />
        </CardContent>
      </Card>
    </div>
  );
}
