import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';

export function SubscriptionBanner() {
  const { empresa, isSuperAdmin, isReadOnly } = useAuth();

  if (isSuperAdmin || !empresa) return null;

  if (empresa.status_assinatura === 'SUSPENSA') {
    return (
      <div className="bg-warning/10 border-b border-warning/30 px-4 py-2.5 flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="text-sm font-medium text-warning">
          Assinatura suspensa — regularize para voltar a utilizar o sistema normalmente.
        </span>
      </div>
    );
  }

  if (empresa.status_assinatura === 'CANCELADA') {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2.5 flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <span className="text-sm font-medium text-destructive">
          Assinatura cancelada — o sistema está em modo somente leitura.
        </span>
      </div>
    );
  }

  if (empresa.status_assinatura === 'TRIAL') {
    return (
      <div className="bg-info/10 border-b border-info/30 px-4 py-2.5 flex items-center justify-center gap-2">
        <span className="text-sm font-medium text-info">
          Período de avaliação — aproveite para conhecer todos os recursos.
        </span>
      </div>
    );
  }

  return null;
}
