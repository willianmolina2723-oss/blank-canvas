-- =====================================================================
-- SAPH — Migration: Sistema de E-mails Transacionais
-- Execute este SQL no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/dscvovvtjcopzsdjjenj/sql/new
-- =====================================================================

-- 1) Tabela: email_logs
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  type text NOT NULL CHECK (type IN ('invite','password_reset','opportunity','resend_invite')),
  subject text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  provider_id text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_empresa ON public.email_logs(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_user    ON public.email_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status  ON public.email_logs(status, created_at DESC);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view all email logs" ON public.email_logs;
CREATE POLICY "Super admins can view all email logs"
  ON public.email_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Admins can view empresa email logs" ON public.email_logs;
CREATE POLICY "Admins can view empresa email logs"
  ON public.email_logs FOR SELECT TO authenticated
  USING (public.is_admin() AND public.same_empresa(empresa_id));

DROP POLICY IF EXISTS "Users can view own email logs" ON public.email_logs;
CREATE POLICY "Users can view own email logs"
  ON public.email_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE são feitos apenas via service role (Edge Functions). Sem policies = bloqueado para clientes.

-- 2) Tabela: user_invites
CREATE TABLE IF NOT EXISTS public.user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  invite_status text NOT NULL DEFAULT 'pending' CHECK (invite_status IN ('pending','accepted','expired')),
  sent_at timestamptz,
  last_sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_invites_empresa ON public.user_invites(empresa_id);
CREATE INDEX IF NOT EXISTS idx_user_invites_status  ON public.user_invites(invite_status);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view empresa invites" ON public.user_invites;
CREATE POLICY "Admins can view empresa invites"
  ON public.user_invites FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.is_admin() AND public.same_empresa(empresa_id)));

DROP POLICY IF EXISTS "Users can view own invite" ON public.user_invites;
CREATE POLICY "Users can view own invite"
  ON public.user_invites FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3) Tabela: password_reset_attempts (rate limit)
CREATE TABLE IF NOT EXISTS public.password_reset_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prs_email_time ON public.password_reset_attempts(email, created_at DESC);

ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;
-- Apenas service role acessa. Sem policies = bloqueado.
