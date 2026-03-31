import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useCallback, useMemo } from 'react';
import type { AppRole } from '@/types/database';

/**
 * Permission keys for fine-grained access control per role.
 */
export type PermissionKey =
  | 'iniciar_evento'
  | 'finalizar_evento'
  | 'checklist_vtr'
  | 'criar_ficha_paciente'
  | 'transporte'
  | 'gasto_materiais'
  | 'checklist_medicamentos'
  | 'consumo_medicamentos'
  | 'evolucao_enfermagem'
  | 'evolucao_medica';

/**
 * Permission map: which roles have which permissions.
 * admin has all permissions (handled separately).
 */
const ROLE_PERMISSIONS: Record<string, Record<PermissionKey, boolean>> = {
  condutor: {
    iniciar_evento: true,
    finalizar_evento: true,
    checklist_vtr: true,
    criar_ficha_paciente: true,
    transporte: true,
    gasto_materiais: true,
    checklist_medicamentos: false,
    consumo_medicamentos: false,
    evolucao_enfermagem: false,
    evolucao_medica: false,
  },
  enfermeiro: {
    iniciar_evento: false,
    finalizar_evento: false,
    checklist_vtr: false,
    criar_ficha_paciente: true,
    transporte: false,
    gasto_materiais: true,
    checklist_medicamentos: true,
    consumo_medicamentos: true,
    evolucao_enfermagem: true,
    evolucao_medica: false,
  },
  tecnico: {
    iniciar_evento: false,
    finalizar_evento: false,
    checklist_vtr: false,
    criar_ficha_paciente: true,
    transporte: false,
    gasto_materiais: true,
    checklist_medicamentos: true,
    consumo_medicamentos: true,
    evolucao_enfermagem: true,
    evolucao_medica: false,
  },
  medico: {
    iniciar_evento: false,
    finalizar_evento: false,
    checklist_vtr: false,
    criar_ficha_paciente: true,
    transporte: false,
    gasto_materiais: true,
    checklist_medicamentos: true,
    consumo_medicamentos: true,
    evolucao_enfermagem: true,
    evolucao_medica: true,
  },
};

/**
 * Labels for read-only messages per permission.
 */
const PERMISSION_LABELS: Record<PermissionKey, string> = {
  iniciar_evento: 'iniciar eventos',
  finalizar_evento: 'finalizar eventos',
  checklist_vtr: 'editar o checklist da viatura',
  criar_ficha_paciente: 'criar fichas de paciente',
  transporte: 'editar dados de transporte',
  gasto_materiais: 'registrar consumo de materiais',
  checklist_medicamentos: 'editar o checklist de medicamentos',
  consumo_medicamentos: 'registrar consumo de medicamentos',
  evolucao_enfermagem: 'registrar evolução de enfermagem',
  evolucao_medica: 'registrar evolução médica',
};

interface UsePermissionsOptions {
  /** The user's role within the specific event (from event_participants). */
  eventRole?: AppRole | string | null;
}

/**
 * Central permission hook.
 * Uses global roles from AuthContext + optional event-specific role.
 * Admin always has full access.
 */
export function usePermissions(options: UsePermissionsOptions = {}) {
  const { roles, isAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const { eventRole } = options;

  const isFullAdmin = isAdmin || isSuperAdmin;

  // Determine the effective role to use for permission checks.
  // Priority: eventRole > first global role
  const effectiveRole = useMemo(() => {
    if (isFullAdmin) return 'admin';
    if (eventRole) return eventRole;
    // Use first non-admin role from global roles
    const nonAdmin = roles.filter(r => r !== 'admin');
    return nonAdmin[0] || null;
  }, [isFullAdmin, eventRole, roles]);

  /**
   * Check if the user has a specific permission.
   */
  const can = useCallback(
    (permission: PermissionKey): boolean => {
      if (isFullAdmin) return true;
      if (!effectiveRole) return false;
      const perms = ROLE_PERMISSIONS[effectiveRole];
      if (!perms) return false;
      return perms[permission] ?? false;
    },
    [isFullAdmin, effectiveRole]
  );

  /**
   * Guard a write action: if no permission, show toast and return false.
   */
  const guardAction = useCallback(
    (permission: PermissionKey): boolean => {
      if (can(permission)) return true;
      toast({
        title: 'Sem permissão',
        description: `Sua função não permite ${PERMISSION_LABELS[permission]}.`,
        variant: 'destructive',
      });
      return false;
    },
    [can, toast]
  );

  // Convenience helpers
  const canStartEvent = can('iniciar_evento');
  const canFinishEvent = can('finalizar_evento');
  const canEditVehicleChecklist = can('checklist_vtr');
  const canCreatePatientRecord = can('criar_ficha_paciente');
  const canEditTransportSection = can('transporte');
  const canEditMaterialUsage = can('gasto_materiais');
  const canEditMedicationChecklist = can('checklist_medicamentos');
  const canEditMedicationConsumption = can('consumo_medicamentos');
  const canEditNursingEvolution = can('evolucao_enfermagem');
  const canEditMedicalEvolution = can('evolucao_medica');

  return {
    can,
    guardAction,
    effectiveRole,
    isFullAdmin,
    canStartEvent,
    canFinishEvent,
    canEditVehicleChecklist,
    canCreatePatientRecord,
    canEditTransportSection,
    canEditMaterialUsage,
    canEditMedicationChecklist,
    canEditMedicationConsumption,
    canEditNursingEvolution,
    canEditMedicalEvolution,
  };
}
