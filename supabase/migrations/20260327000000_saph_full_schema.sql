-- SAPH 2.0 Full Database Migration
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'condutor', 'enfermeiro', 'medico', 'tecnico');
CREATE TYPE public.event_status AS ENUM ('ativo', 'em_andamento', 'finalizado', 'cancelado');
CREATE TYPE public.plano_empresa AS ENUM ('OPERACIONAL', 'GESTAO_EQUIPE', 'GESTAO_COMPLETA');
CREATE TYPE public.signature_type AS ENUM ('enfermagem', 'medica', 'transporte', 'checklist');
CREATE TYPE public.status_assinatura AS ENUM ('ATIVA', 'PENDENTE', 'SUSPENSA', 'CANCELADA', 'TRIAL');

-- Empresas (must be first, many FKs reference it)
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia text NOT NULL,
  razao_social text,
  cnpj text,
  telefone text,
  email text,
  endereco text,
  plano plano_empresa NOT NULL DEFAULT 'OPERACIONAL',
  status_assinatura status_assinatura NOT NULL DEFAULT 'TRIAL',
  data_inicio date,
  data_vencimento date,
  valor_plano numeric DEFAULT 0,
  limite_usuarios integer DEFAULT 10,
  limite_eventos_mensais integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  professional_id text,
  pin_code text,
  avatar_url text,
  empresa_id uuid REFERENCES public.empresas(id),
  must_change_password boolean DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User roles (separate table as required)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Super admins
CREATE TABLE public.super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ambulances
CREATE TABLE public.ambulances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  plate text,
  model text,
  year integer,
  status text DEFAULT 'active',
  km_per_liter numeric,
  empresa_id uuid REFERENCES public.empresas(id),
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contractors
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  empresa_id uuid REFERENCES public.empresas(id),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Events
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  ambulance_id uuid REFERENCES public.ambulances(id),
  status event_status NOT NULL DEFAULT 'ativo',
  location text,
  description text,
  created_by uuid REFERENCES public.profiles(id),
  departure_time timestamptz,
  arrival_time timestamptz,
  signed_at timestamptz,
  contractor_id uuid REFERENCES public.contractors(id),
  contractor_responsible text,
  contractor_phone text,
  empresa_id uuid REFERENCES public.empresas(id),
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event participants
CREATE TABLE public.event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role app_role NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now()
);

-- Patients
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  birth_date date,
  age integer,
  gender text,
  cpf text,
  main_complaint text,
  brief_history text,
  allergies text,
  current_medications text,
  created_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cost items
CREATE TABLE public.cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  unit_cost numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Checklist items
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_name text NOT NULL,
  is_checked boolean DEFAULT false,
  checked_by uuid REFERENCES public.profiles(id),
  checked_at timestamptz,
  notes text,
  cost_item_id uuid REFERENCES public.cost_items(id),
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Nursing evolutions
CREATE TABLE public.nursing_evolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id),
  blood_pressure_systolic numeric,
  blood_pressure_diastolic numeric,
  heart_rate numeric,
  respiratory_rate numeric,
  oxygen_saturation numeric,
  temperature numeric,
  blood_glucose numeric,
  procedures text,
  medications_administered text,
  observations text,
  created_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  signed_at timestamptz,
  signature_data text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Medical evolutions
CREATE TABLE public.medical_evolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id),
  medical_assessment text,
  diagnosis text,
  conduct text,
  prescription text,
  observations text,
  created_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  signed_at timestamptz,
  signature_data text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Transport records
CREATE TABLE public.transport_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  departure_time timestamptz,
  arrival_time timestamptz,
  initial_km numeric,
  final_km numeric,
  occurrences text,
  created_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Digital signatures
CREATE TABLE public.digital_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  signature_type signature_type NOT NULL,
  signature_data text NOT NULL,
  professional_id text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  empresa_id uuid REFERENCES public.empresas(id)
);

-- Dispatch reports
CREATE TABLE public.dispatch_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE UNIQUE,
  status text NOT NULL DEFAULT 'rascunho',
  start_time timestamptz,
  end_time timestamptz,
  base_departure timestamptz,
  event_arrival timestamptz,
  base_arrival timestamptz,
  observations text,
  signed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dispatch materials
CREATE TABLE public.dispatch_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dispatch_reports(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  observation text,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dispatch medications
CREATE TABLE public.dispatch_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dispatch_reports(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  dose text,
  route text,
  lot text,
  responsible_id uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dispatch occurrences
CREATE TABLE public.dispatch_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dispatch_reports(id) ON DELETE CASCADE,
  occurrence_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  observation text,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event finances
CREATE TABLE public.event_finances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE UNIQUE,
  contract_value numeric NOT NULL DEFAULT 0,
  additions numeric NOT NULL DEFAULT 0,
  discounts numeric NOT NULL DEFAULT 0,
  payment_method text,
  due_date date,
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  contractor_id uuid,
  created_by uuid,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event finance payments
CREATE TABLE public.event_finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_finance_id uuid NOT NULL REFERENCES public.event_finances(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  payment_method text,
  notes text,
  cancelled boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_by uuid,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event staff costs
CREATE TABLE public.event_staff_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  base_value numeric NOT NULL DEFAULT 0,
  extras numeric NOT NULL DEFAULT 0,
  discounts numeric NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'diaria',
  notes text,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event other costs
CREATE TABLE public.event_other_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Freelancer payments
CREATE TABLE public.freelancer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  reference_month text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  payment_date date,
  payment_method text,
  receipt_url text,
  notes text,
  cancelled boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_by uuid,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Maintenance logs
CREATE TABLE public.maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambulance_id uuid NOT NULL REFERENCES public.ambulances(id) ON DELETE CASCADE,
  description text NOT NULL,
  maintenance_date date NOT NULL DEFAULT CURRENT_DATE,
  performed_by text,
  cost numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Opportunities
CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time text,
  end_time text,
  location text,
  roles_needed text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'aberta',
  created_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Opportunity registrations
CREATE TABLE public.opportunity_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL,
  status text NOT NULL DEFAULT 'confirmado',
  registered_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id),
  empresa_id uuid REFERENCES public.empresas(id)
);

-- Reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  author_name text NOT NULL,
  author_role text,
  content text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  approved boolean NOT NULL DEFAULT false,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Data changelog
CREATE TABLE public.data_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  changed_by uuid,
  empresa_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- App config
CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Notification logs
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  reference_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Push subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- profiles_safe view (hides pin_code)
CREATE VIEW public.profiles_safe AS
  SELECT id, user_id, full_name, email, phone, professional_id,
         NULL::text AS pin_code, avatar_url, empresa_id, must_change_password,
         deleted_at, deleted_by, created_at, updated_at
  FROM public.profiles;

-- Helper functions
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM profiles WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.same_empresa(_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid() AND empresa_id = _empresa_id
  )
$$;

CREATE OR REPLACE FUNCTION public.same_empresa_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p1
    JOIN profiles p2 ON p1.empresa_id = p2.empresa_id
    WHERE p1.user_id = auth.uid() AND p2.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_event_participant(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_participants ep
    JOIN profiles p ON ep.profile_id = p.id
    WHERE ep.event_id = _event_id AND p.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_event_signed(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events WHERE id = _event_id AND signed_at IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.get_event_role(_event_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ep.role FROM event_participants ep
  JOIN profiles p ON ep.profile_id = p.id
  WHERE ep.event_id = _event_id AND p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_empresa_plano()
RETURNS plano_empresa
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.plano FROM empresas e
  JOIN profiles p ON p.empresa_id = e.id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_empresa_status()
RETURNS status_assinatura
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.status_assinatura FROM empresas e
  JOIN profiles p ON p.empresa_id = e.id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.check_plan_access(modulo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano plano_empresa;
  v_status status_assinatura;
BEGIN
  SELECT e.plano, e.status_assinatura INTO v_plano, v_status
  FROM empresas e JOIN profiles p ON p.empresa_id = e.id
  WHERE p.user_id = auth.uid() LIMIT 1;
  
  IF v_status IN ('SUSPENSA', 'CANCELADA') THEN RETURN false; END IF;
  IF is_super_admin() THEN RETURN true; END IF;
  
  RETURN CASE v_plano
    WHEN 'GESTAO_COMPLETA' THEN true
    WHEN 'GESTAO_EQUIPE' THEN modulo NOT IN ('financeiro_receita_evento','financeiro_contas_receber','dashboard_financeiro','exportacao_contabil')
    WHEN 'OPERACIONAL' THEN modulo IN ('eventos','escalas','fichas_clinicas','relatorios','checklist','oportunidades')
    ELSE false
  END;
END;
$$;

-- Auto-create profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS on all tables
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursing_evolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_evolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_finance_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_other_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelancer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Same empresa pattern
-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can view same empresa profiles" ON profiles FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- User roles
CREATE POLICY "Users can view own roles" ON user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON user_roles FOR ALL TO authenticated USING (is_admin());

-- Super admins
CREATE POLICY "Super admins can view" ON super_admins FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Empresas
CREATE POLICY "Users can view own empresa" ON empresas FOR SELECT TO authenticated USING (same_empresa(id));
CREATE POLICY "Admins can update empresa" ON empresas FOR UPDATE TO authenticated USING (same_empresa(id) AND is_admin());

-- Ambulances
CREATE POLICY "Same empresa can view ambulances" ON ambulances FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Admins can manage ambulances" ON ambulances FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Contractors
CREATE POLICY "Same empresa can view contractors" ON contractors FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Admins can manage contractors" ON contractors FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Events
CREATE POLICY "Same empresa can view events" ON events FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Admins can manage events" ON events FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));
CREATE POLICY "Participants can view events" ON events FOR SELECT TO authenticated USING (is_event_participant(id));

-- Event participants
CREATE POLICY "Same empresa can view participants" ON event_participants FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND same_empresa(e.empresa_id)));
CREATE POLICY "Admins can manage participants" ON event_participants FOR ALL TO authenticated USING (is_admin());

-- Patients
CREATE POLICY "Participants can view patients" ON patients FOR SELECT TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Participants can manage patients" ON patients FOR ALL TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Same empresa can view patients" ON patients FOR SELECT TO authenticated USING (same_empresa(empresa_id));

-- Checklist items
CREATE POLICY "Participants can view checklist" ON checklist_items FOR SELECT TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Participants can manage checklist" ON checklist_items FOR ALL TO authenticated USING (is_event_participant(event_id));

-- Nursing evolutions
CREATE POLICY "Participants can view nursing" ON nursing_evolutions FOR SELECT TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Participants can manage nursing" ON nursing_evolutions FOR ALL TO authenticated USING (is_event_participant(event_id));

-- Medical evolutions
CREATE POLICY "Participants can view medical" ON medical_evolutions FOR SELECT TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Participants can manage medical" ON medical_evolutions FOR ALL TO authenticated USING (is_event_participant(event_id));

-- Transport records
CREATE POLICY "Participants can view transport" ON transport_records FOR SELECT TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Participants can manage transport" ON transport_records FOR ALL TO authenticated USING (is_event_participant(event_id));

-- Digital signatures
CREATE POLICY "Participants can view signatures" ON digital_signatures FOR SELECT TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Participants can create signatures" ON digital_signatures FOR INSERT TO authenticated WITH CHECK (is_event_participant(event_id));

-- Dispatch reports
CREATE POLICY "Participants can view dispatch" ON dispatch_reports FOR SELECT TO authenticated USING (is_event_participant(event_id));
CREATE POLICY "Participants can manage dispatch" ON dispatch_reports FOR ALL TO authenticated USING (is_event_participant(event_id));

-- Dispatch materials
CREATE POLICY "Users can manage dispatch materials" ON dispatch_materials FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM dispatch_reports dr WHERE dr.id = report_id AND is_event_participant(dr.event_id)));

-- Dispatch medications
CREATE POLICY "Users can manage dispatch medications" ON dispatch_medications FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM dispatch_reports dr WHERE dr.id = report_id AND is_event_participant(dr.event_id)));

-- Dispatch occurrences
CREATE POLICY "Users can manage dispatch occurrences" ON dispatch_occurrences FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM dispatch_reports dr WHERE dr.id = report_id AND is_event_participant(dr.event_id)));

-- Event finances
CREATE POLICY "Admins can manage finances" ON event_finances FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Event finance payments
CREATE POLICY "Admins can manage finance payments" ON event_finance_payments FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Event staff costs
CREATE POLICY "Admins can manage staff costs" ON event_staff_costs FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Event other costs
CREATE POLICY "Admins can manage other costs" ON event_other_costs FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Freelancer payments
CREATE POLICY "Admins can manage freelancer payments" ON freelancer_payments FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));
CREATE POLICY "Users can view own payments" ON freelancer_payments FOR SELECT TO authenticated USING (profile_id = get_profile_id());

-- Maintenance logs
CREATE POLICY "Same empresa can view maintenance" ON maintenance_logs FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Admins can manage maintenance" ON maintenance_logs FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Opportunities
CREATE POLICY "Same empresa can view opportunities" ON opportunities FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Admins can manage opportunities" ON opportunities FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Opportunity registrations
CREATE POLICY "Users can view registrations" ON opportunity_registrations FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Users can register" ON opportunity_registrations FOR INSERT TO authenticated WITH CHECK (profile_id = get_profile_id());
CREATE POLICY "Users can cancel own" ON opportunity_registrations FOR UPDATE TO authenticated USING (profile_id = get_profile_id());
CREATE POLICY "Admins can manage registrations" ON opportunity_registrations FOR ALL TO authenticated USING (is_admin());

-- Reviews
CREATE POLICY "Anyone can view approved reviews" ON reviews FOR SELECT TO authenticated USING (approved = true OR profile_id = get_profile_id());
CREATE POLICY "Users can create reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (profile_id = get_profile_id());
CREATE POLICY "Admins can manage reviews" ON reviews FOR ALL TO authenticated USING (is_admin());

-- Audit logs
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- Data changelog
CREATE POLICY "Admins can view changelog" ON data_changelog FOR SELECT TO authenticated USING (is_admin() AND same_empresa(empresa_id));

-- App config
CREATE POLICY "Anyone can read config" ON app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins can manage config" ON app_config FOR ALL TO authenticated USING (is_super_admin());

-- Notification logs
CREATE POLICY "Users can manage own notifications" ON notification_logs FOR ALL TO authenticated USING (user_id = auth.uid());

-- Push subscriptions
CREATE POLICY "Users can manage own subscriptions" ON push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid());

-- Cost items
CREATE POLICY "Same empresa can view cost items" ON cost_items FOR SELECT TO authenticated USING (same_empresa(empresa_id));
CREATE POLICY "Admins can manage cost items" ON cost_items FOR ALL TO authenticated USING (is_admin() AND same_empresa(empresa_id));
