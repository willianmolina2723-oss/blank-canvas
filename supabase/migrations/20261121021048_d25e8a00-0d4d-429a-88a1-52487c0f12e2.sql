ALTER FUNCTION public.validate_event_role_schedule() SET search_path = public;
ALTER FUNCTION public.touch_event_assignment() SET search_path = public;
ALTER FUNCTION public.touch_event_date() SET search_path = public;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.check_plan_access(text)','public.event_dates_count(uuid)','public.get_empresa_id()',
    'public.get_empresa_plano()','public.get_empresa_status()','public.get_event_role(uuid)',
    'public.get_profile_id()','public.handle_new_user()','public.has_role(uuid, public.app_role)',
    'public.is_admin()','public.is_event_participant(uuid)','public.is_event_signed(uuid)',
    'public.is_super_admin()','public.is_super_admin_by_id(uuid)',
    'public.resolve_recebe_deslocamento(uuid, public.app_role)','public.same_empresa(uuid)',
    'public.same_empresa_user(uuid)','public.set_pin(uuid, text)','public.verify_pin(uuid, text)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_pin(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_pin(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin_by_id(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_pin(uuid, text), public.verify_pin(uuid, text), public.is_super_admin_by_id(uuid) TO service_role;