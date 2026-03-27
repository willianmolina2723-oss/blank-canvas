import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanAccess } from '@/hooks/usePlanAccess';
import type { SaaSModule } from '@/types/database';
import { PLANO_LABELS, MODULE_LABELS } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, ArrowUpCircle } from 'lucide-react';

interface PlanGateProps {
  module: SaaSModule;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wraps content that requires a specific plan.
 * If the user's plan doesn't include the module, shows nothing (or fallback).
 */
export function PlanGate({ module, children, fallback }: PlanGateProps) {
  const { canAccess } = usePlanAccess();

  if (canAccess(module)) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
}

/**
 * Shows a full-page upgrade prompt when trying to access a blocked module via URL.
 */
export function PlanBlockedPage({ module }: { module: SaaSModule }) {
  const { currentPlanLabel, getRequiredPlanLabel } = usePlanAccess();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="p-4 rounded-full bg-muted mb-6">
        <Lock className="h-12 w-12 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Recurso Bloqueado</h1>
      <p className="text-muted-foreground mb-6 max-w-md">
        O módulo <strong>{MODULE_LABELS[module]}</strong> não está disponível no seu plano atual.
      </p>
      {currentPlanLabel && (
        <div className="bg-card border rounded-xl p-6 max-w-sm w-full space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Plano atual:</span>
            <span className="font-semibold">{currentPlanLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Plano necessário:</span>
            <span className="font-semibold text-primary">{getRequiredPlanLabel(module)}</span>
          </div>
          <Button className="w-full gap-2" variant="default">
            <ArrowUpCircle className="h-4 w-4" />
            Solicitar Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Upgrade modal shown when clicking a blocked feature.
 */
export function UpgradeDialog({
  module,
  open,
  onOpenChange,
}: {
  module: SaaSModule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentPlanLabel, getRequiredPlanLabel } = usePlanAccess();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            Recurso Indisponível
          </DialogTitle>
          <DialogDescription>
            O módulo <strong>{MODULE_LABELS[module]}</strong> requer um plano superior.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="flex justify-between text-sm p-3 bg-muted rounded-lg">
            <span>Seu plano atual:</span>
            <span className="font-semibold">{currentPlanLabel || 'Nenhum'}</span>
          </div>
          <div className="flex justify-between text-sm p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <span>Plano necessário:</span>
            <span className="font-semibold text-primary">{getRequiredPlanLabel(module)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button className="gap-2">
            <ArrowUpCircle className="h-4 w-4" />
            Solicitar Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
