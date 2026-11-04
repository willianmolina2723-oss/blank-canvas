CREATE OR REPLACE FUNCTION public.cleanup_event_related()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid := OLD.id;
BEGIN
  DELETE FROM dispatch_materials WHERE report_id IN (SELECT id FROM dispatch_reports WHERE event_id = _id);
  DELETE FROM dispatch_medications WHERE report_id IN (SELECT id FROM dispatch_reports WHERE event_id = _id);
  DELETE FROM dispatch_occurrences WHERE report_id IN (SELECT id FROM dispatch_reports WHERE event_id = _id);
  DELETE FROM dispatch_reports WHERE event_id = _id;
  DELETE FROM event_finance_payments WHERE event_finance_id IN (SELECT id FROM event_finances WHERE event_id = _id);
  DELETE FROM event_finances WHERE event_id = _id;
  DELETE FROM medical_evolutions WHERE event_id = _id;
  DELETE FROM nursing_evolutions WHERE event_id = _id;
  DELETE FROM patients WHERE event_id = _id;
  DELETE FROM checklist_items WHERE event_id = _id;
  DELETE FROM digital_signatures WHERE event_id = _id;
  DELETE FROM transport_records WHERE event_id = _id;
  DELETE FROM event_other_costs WHERE event_id = _id;
  DELETE FROM event_staff_costs WHERE event_id = _id;
  DELETE FROM event_assignments WHERE event_id = _id;
  DELETE FROM event_role_schedules WHERE event_id = _id;
  DELETE FROM event_participants WHERE event_id = _id;
  DELETE FROM event_recordings WHERE event_id = _id;
  DELETE FROM event_dates WHERE event_id = _id;
  DELETE FROM freelancer_payments WHERE notes ILIKE '%' || OLD.code || '%';
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_cleanup_event_related ON public.events;
CREATE TRIGGER trg_cleanup_event_related BEFORE DELETE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.cleanup_event_related();

REVOKE EXECUTE ON FUNCTION public.cleanup_event_related() FROM PUBLIC, anon, authenticated;