import { useAuth } from '@/contexts/AuthContext';
import type { SaaSModule, PlanoEmpresa } from '@/types/database';
import { PLAN_MODULES, MODULE_REQUIRED_PLAN, PLANO_LABELS } from '@/types/database';

export function usePlanAccess() {
  const { empresa, isSuperAdmin, checkModuleAccess, isReadOnly, isSubscriptionActive } = useAuth();

  const canAccess = (modulo: SaaSModule): boolean => {
    return checkModuleAccess(modulo);
  };

  const getRequiredPlan = (modulo: SaaSModule): PlanoEmpresa => {
    return MODULE_REQUIRED_PLAN[modulo];
  };

  const getRequiredPlanLabel = (modulo: SaaSModule): string => {
    return PLANO_LABELS[MODULE_REQUIRED_PLAN[modulo]];
  };

  const currentPlan = empresa?.plano || null;
  const currentPlanLabel = currentPlan ? PLANO_LABELS[currentPlan] : null;

  return {
    canAccess,
    getRequiredPlan,
    getRequiredPlanLabel,
    currentPlan,
    currentPlanLabel,
    isReadOnly,
    isSubscriptionActive,
    isSuperAdmin,
  };
}
