import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { Loader2, Shield } from 'lucide-react';
import type { Profile, AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';

interface ProfileWithRoles extends Profile {
  roles: AppRole[];
}

interface RoleAssignmentProps {
  user: ProfileWithRoles;
  onClose: () => void;
  onUpdate: () => void;
}

const ALL_ROLES: AppRole[] = ['admin', 'condutor', 'enfermeiro', 'tecnico', 'medico'];

export function RoleAssignment({ user, onClose, onUpdate }: RoleAssignmentProps) {
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(user.roles);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleRoleToggle = (role: AppRole) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Determine roles to add and remove
      const rolesToAdd = selectedRoles.filter(r => !user.roles.includes(r));
      const rolesToRemove = user.roles.filter(r => !selectedRoles.includes(r));

      // Remove roles
      for (const role of rolesToRemove) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', user.user_id)
          .eq('role', role);

        if (error) throw error;
      }

      // Add roles
      for (const role of rolesToAdd) {
        const { error } = await supabase
          .from('user_roles')
          .insert({
            user_id: user.user_id,
            role: role,
          });

        if (error) throw error;
      }

      toast({
        title: 'Funções atualizadas',
        description: `As funções de ${user.full_name} foram atualizadas com sucesso.`,
      });

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating roles:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar as funções.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Atribuir Funções
          </DialogTitle>
          <DialogDescription>
            Selecione as funções para <strong>{user.full_name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {ALL_ROLES.map((role) => (
            <div key={role} className="flex items-center space-x-3">
              <Checkbox
                id={role}
                checked={selectedRoles.includes(role)}
                onCheckedChange={() => handleRoleToggle(role)}
              />
              <Label
                htmlFor={role}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {ROLE_LABELS[role]}
              </Label>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
