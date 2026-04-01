import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Loader2, UserPlus, Camera, X, Info, Copy, Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';

const strictEmailRegex = /^(?=.{1,254}$)(?=.{1,64}@)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

const formSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(strictEmailRegex, 'Informe um email válido (ex: nome@dominio.com)'),
  full_name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  professional_id: z.string().optional(),
  phone: z.string().optional(),
  roles: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: () => void;
}

const ALL_ROLES: AppRole[] = ['admin', 'condutor', 'enfermeiro', 'tecnico', 'medico'];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 w-full overflow-hidden">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-xs font-medium break-all select-all leading-snug">{text}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={handleCopy}>
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function CreateUserDialog({ open, onOpenChange, onUserCreated }: CreateUserDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string | null; emailQueued: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      full_name: '',
      professional_id: '',
      phone: '',
      roles: [],
    },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A foto deve ter no máximo 5MB.', variant: 'destructive' });
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split('.').pop();
    const path = `${userId}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, photoFile, { upsert: true });
    if (error) {
      console.error('Avatar upload error:', error);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    return publicUrl;
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const normalizedEmail = data.email.trim().toLowerCase();

      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: normalizedEmail,
          full_name: data.full_name,
          professional_id: data.professional_id || null,
          phone: data.phone || null,
          roles: data.roles || [],
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      if (photoFile && result?.user_id) {
        const avatarUrl = await uploadAvatar(result.user_id);
        if (avatarUrl) {
          await supabase.functions.invoke('update-profile', {
            body: { user_id: result.user_id, avatar_url: avatarUrl },
          });
        }
      }

      const emailQueued = Boolean(result?.email_queued);
      setCreatedCredentials({
        email: normalizedEmail,
        password: result?.temp_password ?? null,
        emailQueued,
      });

      if (!emailQueued) {
        toast({
          title: 'Senha pronta para envio manual',
          description: 'O email automático falhou, então a senha temporária ficará visível para você compartilhar com o colaborador.',
        });
      }

      form.reset();
      removePhoto();
      onUserCreated();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: 'Erro ao criar usuário',
        description: explainError(error, 'Não foi possível criar o usuário.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setCreatedCredentials(null);
    }
    onOpenChange(isOpen);
  };

  const handleCopyAll = async () => {
    if (!createdCredentials) return;

    const text = createdCredentials.password
      ? `Email: ${createdCredentials.email}\nSenha temporária: ${createdCredentials.password}\nAcesse: https://sistemasaph.com.br/auth`
      : `Email: ${createdCredentials.email}\nAcesse: https://sistemasaph.com.br/auth`;

    await navigator.clipboard.writeText(text);
    toast({ title: 'Dados copiados!' });
  };

  // Success screen after creation
  if (createdCredentials) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Check className="h-5 w-5" />
              Colaborador criado!
            </DialogTitle>
            <DialogDescription>
              {createdCredentials.emailQueued
                ? 'A senha temporária foi enviada automaticamente para o email do colaborador.'
                : 'Não conseguimos enviar o email automaticamente. Compartilhe a senha temporária abaixo manualmente.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <CopyButton label="Email" text={createdCredentials.email} />
            {createdCredentials.password && <CopyButton label="Senha temporária" text={createdCredentials.password} />}
            <CopyButton label="Link de acesso" text="https://sistemasaph.com.br/auth" />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleCopyAll} variant="outline" className="w-full">
              <Copy className="h-4 w-4 mr-2" />
              Copiar dados
            </Button>
            <Button onClick={() => handleClose(false)} className="w-full">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Criar Novo Colaborador
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do colaborador. O sistema tentará enviar a senha temporária por email e, se o envio falhar, ela ficará visível para compartilhamento manual.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>⚠️ Use o email real do colaborador!</strong> A senha de acesso será enviada automaticamente para esse email. Se o email estiver incorreto, o colaborador não receberá as credenciais. A senha deverá ser alterada no primeiro acesso.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Photo upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="h-24 w-24 border-2 border-dashed border-muted-foreground/30">
                  <AvatarImage src={photoPreview || undefined} />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <Camera className="h-8 w-8" />
                  </AvatarFallback>
                </Avatar>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="absolute -top-1 -right-1 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" />
                {photoPreview ? 'Trocar Foto' : 'Adicionar Foto'}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              <p className="text-xs text-muted-foreground">Foto para crachá (máx. 5MB)</p>
            </div>

            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo *</FormLabel>
                  <FormControl><Input placeholder="Nome do colaborador" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" placeholder="email@exemplo.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID Profissional</FormLabel>
                    <FormControl><Input placeholder="CRM, COREN, etc." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl><Input placeholder="(00) 00000-0000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <FormLabel>Funções</FormLabel>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {ALL_ROLES.map((role) => (
                      <FormField
                        key={role}
                        control={form.control}
                        name="roles"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(role)}
                                onCheckedChange={(checked) => {
                                  const current = field.value || [];
                                  if (checked) {
                                    field.onChange([...current, role]);
                                  } else {
                                    field.onChange(current.filter((r) => r !== role));
                                  }
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">{ROLE_LABELS[role]}</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Colaborador
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
