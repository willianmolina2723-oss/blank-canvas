-- Adicionar data de término opcional em oportunidades
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS end_date date;

NOTIFY pgrst, 'reload schema';
