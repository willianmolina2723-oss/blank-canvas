import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Camera, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import type { Profile, AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';

interface ProfileWithRoles extends Profile {
  roles: AppRole[];
}

interface Props {
  user: ProfileWithRoles | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const ALL_ROLES: AppRole[] = ['admin', 'condutor', 'enfermeiro', 'tecnico', 'medico'];

export function EditUserDialog({ user, open, onOpenChange, onUpdated }: Props) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setProfessionalId(user.professional_id || '');
      setPinCode(user.pin_code || '');
      setSelectedRoles(user.roles || []);
      setPhotoPreview(user.avatar_url || null);
      setPhotoFile(null);
    }
  }, [open, user]);

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

  const handleRoleToggle = (role: AppRole) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSave = async () => {
    if (!user || !fullName.trim()) return;

    setIsSaving(true);
    try {
      // Upload avatar if new photo selected
      let avatarUrl = user.avatar_url;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop();
        const path = `${user.user_id}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, photoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = publicUrl;
      } else if (!photoPreview && user.avatar_url) {
        avatarUrl = null;
      }

      const { error } = await supabase.functions.invoke('update-profile', {
        body: {
          profile_id: user.id,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          professional_id: professionalId.trim() || null,
          pin_code: pinCode.trim() || null,
          avatar_url: avatarUrl,
        },
      });
      if (error) throw error;

      // Update roles
      const rolesToAdd = selectedRoles.filter(r => !user.roles.includes(r));
      const rolesToRemove = user.roles.filter(r => !selectedRoles.includes(r));

      for (const role of rolesToRemove) {
        const { error: delErr } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', user.user_id)
          .eq('role', role);
        if (delErr) throw delErr;
      }

      for (const role of rolesToAdd) {
        const { error: addErr } = await supabase
          .from('user_roles')
          .insert({ user_id: user.user_id, role });
        if (addErr) throw addErr;
      }

      toast({ title: 'Sucesso', description: 'Dados do usuário atualizados.' });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      console.error('Error updating user:', err);
      toast({ title: 'Erro', description: 'Não foi possível atualizar o usuário.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              {photoPreview ? 'Trocar Foto' : 'Adicionar Foto'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
            />
            <p className="text-xs text-muted-foreground">Foto para crachá (máx. 5MB)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Nome Completo</Label>
            <Input id="edit-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" value={email} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Telefone</Label>
            <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-professional">Registro Profissional (CRM/COREN/ID)</Label>
            <Input id="edit-professional" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} placeholder="Ex: CRM 12345" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-pin">Código PIN</Label>
            <Input id="edit-pin" value={pinCode} onChange={(e) => setPinCode(e.target.value)} placeholder="Digite o PIN (opcional)" />
          </div>
          <div className="space-y-2">
            <Label>Funções</Label>
            <div className="space-y-3 rounded-md border p-3">
              {ALL_ROLES.map((role) => (
                <div key={role} className="flex items-center space-x-3">
                  <Checkbox
                    id={`edit-role-${role}`}
                    checked={selectedRoles.includes(role)}
                    onCheckedChange={() => handleRoleToggle(role)}
                  />
                  <Label htmlFor={`edit-role-${role}`} className="text-sm font-medium cursor-pointer">
                    {ROLE_LABELS[role]}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!fullName.trim() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
