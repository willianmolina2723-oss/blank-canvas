ALTER TABLE public.patients ALTER COLUMN event_id DROP NOT NULL;
NOTIFY pgrst, 'reload schema';