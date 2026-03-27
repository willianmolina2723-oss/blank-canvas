import { useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { ShieldCheck, ShieldX, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole, Profile } from '@/types/database';

interface UserListItem extends Profile {
  roles: AppRole[];
}

interface UserAccessActionsProps {
  user: UserListItem;
  isSuspended: boolean;
  isLoading?: boolean;
  onChanged: () => Promise<void> | void;
  onDeleted?: (userId: string) => void;
}

const getActionErrorMessage = async (error: unknown) => {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (payload?.error && typeof payload.error === 'string') {
        return payload.error;
      }
    } catch {
      // ignore parse errors and fall back to generic message
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Não foi possível concluir a ação.';
};

export function UserAccessActions({ user, isSuspended, isLoading: isLoadingAccess, onChanged, onDeleted }: UserAccessActionsProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wasDeleted, setWasDeleted] = useState(false);

  const isSelf = currentUser?.id === user.user_id;

  const handleAction = async (action: 'suspend' | 'restore' | 'delete') => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action,
          user_id: user.user_id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (action === 'delete') {
        setWasDeleted(true);
        onDeleted?.(user.user_id);
      }

      toast({
        title: 'Sucesso',
        description:
          action === 'delete'
            ? 'Usuário excluído com sucesso.'
            : action === 'suspend'
              ? 'Usuário suspenso com sucesso.'
              : 'Usuário reativado com sucesso.',
      });

      setSuspendDialogOpen(false);
      setDeleteDialogOpen(false);
      await Promise.resolve(onChanged());
    } catch (error) {
      toast({
        title: 'Erro',
        description: await getActionErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isSelf || wasDeleted) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isLoadingAccess}
        onClick={() => setSuspendDialogOpen(true)}
        className="rounded-xl text-xs font-bold flex-1 sm:flex-initial"
      >
        {isSuspended ? (
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
        ) : (
          <ShieldX className="h-3.5 w-3.5 mr-1" />
        )}
        {isSuspended ? 'Reativar' : 'Suspender'}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={isLoadingAccess}
        onClick={() => setDeleteDialogOpen(true)}
        className="rounded-xl text-xs font-bold flex-1 sm:flex-initial"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Excluir
      </Button>

      <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isSuspended ? 'Reativar usuário' : 'Suspender usuário'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isSuspended
                ? `Deseja reativar o acesso de ${user.full_name}? Ele poderá entrar no sistema novamente.`
                : `Deseja suspender o acesso de ${user.full_name}? Ele não poderá entrar no sistema até ser reativado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={isProcessing}>
                Cancelar
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => handleAction(isSuspended ? 'restore' : 'suspend')} disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSuspended ? 'Reativar' : 'Suspender'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{user.full_name}</strong>? O acesso será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={isProcessing}>
                Cancelar
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={() => handleAction('delete')} disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Excluir
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
