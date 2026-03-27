import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useCallback } from 'react';

/**
 * Hook that provides read-only enforcement for suspended/cancelled subscriptions.
 * Returns isReadOnly flag and a guard function that shows a toast and returns false
 * when the empresa is in read-only mode.
 */
export function useReadOnly() {
  const { isReadOnly } = useAuth();
  const { toast } = useToast();

  const guardWriteAction = useCallback((): boolean => {
    if (isReadOnly) {
      toast({
        title: 'Modo somente leitura',
        description: 'A assinatura da sua empresa está suspensa ou cancelada. Regularize para voltar a utilizar o sistema.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  }, [isReadOnly, toast]);

  return { isReadOnly, guardWriteAction };
}
