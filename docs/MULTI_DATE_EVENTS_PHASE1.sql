-- =====================================================================
-- FASE 1: EVENTOS COM MÚLTIPLAS DATAS NÃO CONTÍNUAS
-- =====================================================================
-- Este script é IDEMPOTENTE. Pode ser rodado várias vezes sem efeitos colaterais.
-- Estratégia: nova tabela event_dates + colunas event_date_id (nullable) nas
-- entidades filhas. Backfill cria 1 event_date para cada event existente.
-- =====================================================================

-- 1. TABELA PRINCIPAL: event_dates
CREATE TABLE IF NOT EXISTS public.event_dates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  empresa_id      uuid,
  ordem           integer NOT NULL DEFAULT 1,
  date            date NOT NULL,
  start_time      timestamp with time zone NOT NULL,
  end_time        timestamp with time zone NOT NULL,
  location_override text,
  notes           text,
  status          text NOT NULL DEFAULT 'ativo',
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_dates_event_id ON public.event_dates(event_id);
CREATE INDEX IF NOT EXISTS idx_event_dates_empresa_id ON public.event_dates(empresa_id);
CREATE INDEX IF NOT EXISTS idx_event_dates_date ON public.event_dates(date);

ALTER TABLE public.event_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage event_dates" ON public.event_dates;
CREATE POLICY "Admins can manage event_dates"
  ON public.event_dates FOR ALL TO authenticated
  USING (is_admin() AND same_empresa(empresa_id))
  WITH CHECK (is_admin() AND same_empresa(empresa_id));

DROP POLICY IF EXISTS "Same empresa can view event_dates" ON public.event_dates;
CREATE POLICY "Same empresa can view event_dates"
  ON public.event_dates FOR SELECT TO authenticated
  USING (same_empresa(empresa_id));

DROP POLICY IF EXISTS "Participants can view event_dates" ON public.event_dates;
CREATE POLICY "Participants can view event_dates"
  ON public.event_dates FOR SELECT TO authenticated
  USING (is_event_participant(event_id));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_event_date()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_event_date ON public.event_dates;
CREATE TRIGGER trg_touch_event_date
  BEFORE UPDATE ON public.event_dates
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_date();


-- 2. COLUNA event_date_id (nullable) NAS ENTIDADES FILHAS
-- Nullable para permitir migração incremental e compatibilidade.
ALTER TABLE public.event_assignments     ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE CASCADE;
ALTER TABLE public.event_role_schedules  ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_items       ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.transport_records     ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.patients              ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.medical_evolutions    ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.nursing_evolutions    ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.dispatch_reports      ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.event_staff_costs     ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.event_other_costs     ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
ALTER TABLE public.digital_signatures    ADD COLUMN IF NOT EXISTS event_date_id uuid REFERENCES public.event_dates(id) ON DELETE SET NULL;
-- event_recordings: SEM FK explícita (cache do PostgREST), só coluna
ALTER TABLE public.event_recordings      ADD COLUMN IF NOT EXISTS event_date_id uuid;

CREATE INDEX IF NOT EXISTS idx_assignments_event_date_id ON public.event_assignments(event_date_id);
CREATE INDEX IF NOT EXISTS idx_role_sched_event_date_id ON public.event_role_schedules(event_date_id);
CREATE INDEX IF NOT EXISTS idx_checklist_event_date_id ON public.checklist_items(event_date_id);
CREATE INDEX IF NOT EXISTS idx_transport_event_date_id ON public.transport_records(event_date_id);
CREATE INDEX IF NOT EXISTS idx_patients_event_date_id ON public.patients(event_date_id);
CREATE INDEX IF NOT EXISTS idx_recordings_event_date_id ON public.event_recordings(event_date_id);


-- 3. BACKFILL: 1 event_date para cada event existente
-- Usa departure_time/arrival_time; se faltar, usa created_at +/- 4h.
INSERT INTO public.event_dates (event_id, empresa_id, ordem, date, start_time, end_time, status)
SELECT
  e.id,
  e.empresa_id,
  1,
  COALESCE(e.departure_time::date, e.created_at::date),
  COALESCE(e.departure_time, e.created_at),
  COALESCE(e.arrival_time, e.departure_time + interval '4 hours', e.created_at + interval '4 hours'),
  CASE WHEN e.status::text = 'finalizado' THEN 'finalizado' ELSE 'ativo' END
FROM public.events e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.event_dates ed WHERE ed.event_id = e.id);


-- 4. AMARRAR ENTIDADES FILHAS À ÚNICA event_date do evento (quando ainda nulo)
WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.event_assignments a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.event_role_schedules a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.checklist_items a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.transport_records a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.patients a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.medical_evolutions a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.nursing_evolutions a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.dispatch_reports a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.event_staff_costs a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.event_other_costs a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.digital_signatures a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;

WITH default_dates AS (
  SELECT DISTINCT ON (event_id) event_id, id AS ed_id
  FROM public.event_dates
  ORDER BY event_id, ordem ASC, created_at ASC
)
UPDATE public.event_recordings a
   SET event_date_id = d.ed_id
  FROM default_dates d
 WHERE a.event_id = d.event_id AND a.event_date_id IS NULL;


-- 5. HELPERS para a UI
-- Conta datas por evento
CREATE OR REPLACE FUNCTION public.event_dates_count(_event_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.event_dates WHERE event_id = _event_id;
$$;


NOTIFY pgrst, 'reload schema';
