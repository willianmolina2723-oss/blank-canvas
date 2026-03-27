// Custom types for the SAPH application

export type AppRole = 'admin' | 'condutor' | 'enfermeiro' | 'tecnico' | 'medico';

export type EventStatus = 'ativo' | 'em_andamento' | 'finalizado' | 'cancelado';

export type SignatureType = 'enfermagem' | 'medica' | 'transporte' | 'checklist';

export type PlanoEmpresa = 'OPERACIONAL' | 'GESTAO_EQUIPE' | 'GESTAO_COMPLETA';

export type StatusAssinatura = 'ATIVA' | 'PENDENTE' | 'SUSPENSA' | 'CANCELADA' | 'TRIAL';

export type SaaSModule =
  | 'eventos'
  | 'escalas'
  | 'fichas_clinicas'
  | 'relatorios'
  | 'checklist'
  | 'oportunidades'
  | 'pagamentos_freelancers'
  | 'financeiro_receita_evento'
  | 'financeiro_contas_receber'
  | 'dashboard_financeiro'
  | 'exportacao_contabil';

export interface Empresa {
  id: string;
  nome_fantasia: string;
  razao_social: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  plano: PlanoEmpresa;
  status_assinatura: StatusAssinatura;
  data_inicio: string | null;
  data_vencimento: string | null;
  valor_plano: number;
  limite_usuarios: number;
  limite_eventos_mensais: number | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  professional_id: string | null;
  pin_code: string | null;
  avatar_url: string | null;
  empresa_id: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  empresa_id: string | null;
  created_at: string;
}

export interface Ambulance {
  id: string;
  code: string;
  plate: string | null;
  model: string | null;
  year: number | null;
  status: string;
  km_per_liter?: number | null;
  empresa_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  code: string;
  ambulance_id: string | null;
  status: EventStatus;
  location: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  signed_at: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  contractor_id: string | null;
  contractor_responsible: string | null;
  contractor_phone: string | null;
  empresa_id: string | null;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  profile_id: string;
  role: AppRole;
  joined_at: string;
}

export interface Patient {
  id: string;
  event_id: string;
  name: string;
  birth_date: string | null;
  age: number | null;
  gender: string | null;
  cpf?: string | null;
  main_complaint: string | null;
  brief_history: string | null;
  allergies: string | null;
  current_medications: string | null;
  created_by: string | null;
  empresa_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  event_id: string;
  item_type: 'pre' | 'pos';
  item_name: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface NursingEvolution {
  id: string;
  event_id: string;
  patient_id: string | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  temperature: number | null;
  blood_glucose: number | null;
  procedures: string | null;
  medications_administered: string | null;
  observations: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  signed_at: string | null;
  signature_data: string | null;
}

export interface MedicalEvolution {
  id: string;
  event_id: string;
  patient_id: string | null;
  medical_assessment: string | null;
  diagnosis: string | null;
  conduct: string | null;
  prescription: string | null;
  observations: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  signed_at: string | null;
  signature_data: string | null;
}

export interface TransportRecord {
  id: string;
  event_id: string;
  departure_time: string | null;
  arrival_time: string | null;
  initial_km: number | null;
  final_km: number | null;
  occurrences: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  signed_at: string | null;
}

export interface DigitalSignature {
  id: string;
  event_id: string;
  profile_id: string;
  signature_type: SignatureType;
  signature_data: string;
  professional_id: string | null;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}

// Helper types
export interface EventWithDetails extends Event {
  ambulance?: Ambulance;
  participants?: (EventParticipant & { profile: Profile })[];
  patient?: Patient;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  condutor: 'Condutor',
  enfermeiro: 'Enfermeiro(a)',
  tecnico: 'Técnico(a)',
  medico: 'Médico(a)',
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  ativo: 'Ativo',
  em_andamento: 'Em Andamento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

export const SIGNATURE_TYPE_LABELS: Record<SignatureType, string> = {
  enfermagem: 'Enfermagem',
  medica: 'Médica',
  transporte: 'Transporte',
  checklist: 'Checklist',
};

export const PLANO_LABELS: Record<PlanoEmpresa, string> = {
  OPERACIONAL: 'Operacional',
  GESTAO_EQUIPE: 'Gestão de Equipe',
  GESTAO_COMPLETA: 'Gestão Completa',
};

export const STATUS_ASSINATURA_LABELS: Record<StatusAssinatura, string> = {
  ATIVA: 'Ativa',
  PENDENTE: 'Pendente',
  SUSPENSA: 'Suspensa',
  CANCELADA: 'Cancelada',
  TRIAL: 'Trial',
};

// Plan module access map
export const PLAN_MODULES: Record<PlanoEmpresa, SaaSModule[]> = {
  OPERACIONAL: ['eventos', 'escalas', 'fichas_clinicas', 'relatorios', 'checklist', 'oportunidades'],
  GESTAO_EQUIPE: ['eventos', 'escalas', 'fichas_clinicas', 'relatorios', 'checklist', 'oportunidades', 'pagamentos_freelancers'],
  GESTAO_COMPLETA: [
    'eventos', 'escalas', 'fichas_clinicas', 'relatorios', 'checklist', 'oportunidades',
    'pagamentos_freelancers', 'financeiro_receita_evento', 'financeiro_contas_receber',
    'dashboard_financeiro', 'exportacao_contabil',
  ],
};

export const MODULE_LABELS: Record<SaaSModule, string> = {
  eventos: 'Eventos',
  escalas: 'Escalas',
  fichas_clinicas: 'Fichas Clínicas',
  relatorios: 'Relatórios',
  checklist: 'Checklist',
  oportunidades: 'Oportunidades',
  pagamentos_freelancers: 'Pagamento de Freelancers',
  financeiro_receita_evento: 'Receita por Evento',
  financeiro_contas_receber: 'Contas a Receber',
  dashboard_financeiro: 'Dashboard Financeiro',
  exportacao_contabil: 'Exportação Contábil',
};

// Which plan is needed for a given module
export const MODULE_REQUIRED_PLAN: Record<SaaSModule, PlanoEmpresa> = {
  eventos: 'OPERACIONAL',
  escalas: 'OPERACIONAL',
  fichas_clinicas: 'OPERACIONAL',
  relatorios: 'OPERACIONAL',
  checklist: 'OPERACIONAL',
  oportunidades: 'OPERACIONAL',
  pagamentos_freelancers: 'GESTAO_EQUIPE',
  financeiro_receita_evento: 'GESTAO_COMPLETA',
  financeiro_contas_receber: 'GESTAO_COMPLETA',
  dashboard_financeiro: 'GESTAO_COMPLETA',
  exportacao_contabil: 'GESTAO_COMPLETA',
};
