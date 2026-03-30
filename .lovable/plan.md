

## Diagnóstico

O erro `42710: policy "Anyone can view checklist videos" already exists` indica que algumas políticas de storage já foram criadas em execuções anteriores do SQL. O novo SQL precisa ser idempotente — remover políticas existentes antes de recriá-las.

## SQL Corrigido

O plano é fornecer um único bloco SQL que:

1. Cria a tabela `event_recordings` apenas se não existir (`IF NOT EXISTS`)
2. Habilita RLS na tabela
3. Remove (`DROP POLICY IF EXISTS`) todas as políticas antes de recriá-las — tanto na tabela `event_recordings` quanto em `storage.objects`
4. Cria o bucket `checklist-videos` com `ON CONFLICT DO NOTHING`
5. Cria índices para performance

### SQL final:

```sql
-- 1. Tabela event_recordings (sem foreign keys para evitar erros de dependência)
CREATE TABLE IF NOT EXISTS public.event_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  video_type text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer,
  video_url text,
  file_hash text,
  file_size_bytes bigint,
  status text NOT NULL DEFAULT 'recording',
  device_info text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_recordings ENABLE ROW LEVEL SECURITY;

-- 2. Dropar políticas existentes da tabela event_recordings (caso existam)
DROP POLICY IF EXISTS "Participants can view recordings" ON public.event_recordings;
DROP POLICY IF EXISTS "Participants can insert recordings" ON public.event_recordings;
DROP POLICY IF EXISTS "Users can update own recordings" ON public.event_recordings;
DROP POLICY IF EXISTS "Admins can delete recordings" ON public.event_recordings;

-- 3. Recriar políticas da tabela event_recordings
CREATE POLICY "Participants can view recordings" ON public.event_recordings
  FOR SELECT TO authenticated USING (is_event_participant(event_id));

CREATE POLICY "Participants can insert recordings" ON public.event_recordings
  FOR INSERT TO authenticated WITH CHECK (is_event_participant(event_id));

CREATE POLICY "Users can update own recordings" ON public.event_recordings
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can delete recordings" ON public.event_recordings
  FOR DELETE TO authenticated USING (is_admin());

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_event_recordings_event_id ON public.event_recordings(event_id);
CREATE INDEX IF NOT EXISTS idx_event_recordings_user_id ON public.event_recordings(user_id);

-- 5. Bucket de storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('checklist-videos', 'checklist-videos', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Dropar políticas de storage existentes (causa do erro atual)
DROP POLICY IF EXISTS "Authenticated users can upload checklist videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view checklist videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete checklist videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own checklist videos" ON storage.objects;

-- 7. Recriar políticas de storage
CREATE POLICY "Authenticated users can upload checklist videos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'checklist-videos');

CREATE POLICY "Anyone can view checklist videos" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'checklist-videos');

CREATE POLICY "Admins can delete checklist videos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'checklist-videos' AND is_admin());
```

Este SQL é totalmente idempotente — pode ser executado múltiplas vezes sem erros.

