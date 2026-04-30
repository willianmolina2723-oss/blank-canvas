-- ============================================
-- Fase 4: Escala/Equipe por data
-- Substitui constraints únicas para incluir event_date_id
-- ============================================

-- 1) event_role_schedules: permitir múltiplas linhas por data
ALTER TABLE public.event_role_schedules
  DROP CONSTRAINT IF EXISTS event_role_schedules_event_id_role_key;

CREATE UNIQUE INDEX IF NOT EXISTS event_role_schedules_event_role_date_uidx
  ON public.event_role_schedules (event_id, role, COALESCE(event_date_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 2) event_assignments: permitir múltiplas linhas por (profile, role, data)
ALTER TABLE public.event_assignments
  DROP CONSTRAINT IF EXISTS event_assignments_event_id_profile_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS event_assignments_event_profile_role_date_uidx
  ON public.event_assignments (event_id, profile_id, role, COALESCE(event_date_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 3) Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';
