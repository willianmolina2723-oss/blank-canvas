ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS cobrar_materiais_medicamentos boolean NOT NULL DEFAULT false;
