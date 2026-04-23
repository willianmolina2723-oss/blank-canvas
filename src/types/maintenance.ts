// Vehicle maintenance module types

export type VehicleStatus = 'ativa' | 'manutencao' | 'parada' | 'inativa' | 'disponivel' | 'ocupada' | 'inativo';

export const VEHICLE_STATUS_OPTIONS: { value: VehicleStatus; label: string; color: string }[] = [
  { value: 'ativa', label: 'Ativa', color: 'bg-green-500/10 text-green-700 border-green-500/20' },
  { value: 'manutencao', label: 'Em Manutenção', color: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' },
  { value: 'parada', label: 'Parada', color: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
  { value: 'inativa', label: 'Inativa', color: 'bg-muted text-muted-foreground border-border' },
];

export const VEHICLE_TYPES = [
  'UTI Móvel',
  'Suporte Básico',
  'Suporte Avançado',
  'Remoção Simples',
  'Resgate',
  'Apoio',
  'Carro de Apoio',
  'Outros',
] as const;

export const MAINTENANCE_CATEGORIES = [
  { value: 'troca_oleo', label: 'Troca de óleo', group: 'Mecânica' },
  { value: 'filtro_oleo', label: 'Filtro de óleo', group: 'Mecânica' },
  { value: 'filtro_ar', label: 'Filtro de ar', group: 'Mecânica' },
  { value: 'filtro_combustivel', label: 'Filtro de combustível', group: 'Mecânica' },
  { value: 'pneus', label: 'Pneus', group: 'Rodagem' },
  { value: 'alinhamento', label: 'Alinhamento', group: 'Rodagem' },
  { value: 'balanceamento', label: 'Balanceamento', group: 'Rodagem' },
  { value: 'freios', label: 'Freios', group: 'Segurança' },
  { value: 'suspensao', label: 'Suspensão', group: 'Mecânica' },
  { value: 'bateria', label: 'Bateria', group: 'Elétrica' },
  { value: 'eletrica', label: 'Elétrica', group: 'Elétrica' },
  { value: 'motor', label: 'Motor', group: 'Mecânica' },
  { value: 'cambio', label: 'Câmbio', group: 'Mecânica' },
  { value: 'ar_condicionado', label: 'Ar-condicionado', group: 'Conforto' },
  { value: 'escapamento', label: 'Escapamento', group: 'Mecânica' },
  { value: 'extintor', label: 'Extintor', group: 'Documentos' },
  { value: 'licenciamento', label: 'Licenciamento', group: 'Documentos' },
  { value: 'seguro', label: 'Seguro', group: 'Documentos' },
  { value: 'revisao_geral', label: 'Revisão geral', group: 'Mecânica' },
  { value: 'outros', label: 'Outros', group: 'Outros' },
] as const;

export type MaintenanceCategory = typeof MAINTENANCE_CATEGORIES[number]['value'];

export const MAINTENANCE_TYPES = [
  { value: 'preventiva', label: 'Preventiva' },
  { value: 'corretiva', label: 'Corretiva' },
  { value: 'revisao', label: 'Revisão' },
  { value: 'emergencia', label: 'Emergência' },
] as const;

export type MaintenanceType = typeof MAINTENANCE_TYPES[number]['value'];

export interface MaintenanceLogFull {
  id: string;
  ambulance_id: string;
  maintenance_date: string;
  maintenance_type: MaintenanceType | null;
  category: MaintenanceCategory | null;
  description: string;
  km_at_service: number | null;
  performed_by: string | null;
  cost: number | null;
  parts_replaced: string | null;
  next_service_km: number | null;
  next_service_date: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface AmbulanceFull {
  id: string;
  code: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  vehicle_type: string | null;
  current_km: number | null;
  status: string | null;
  notes: string | null;
  km_per_liter: number | null;
  licensing_expiry: string | null;
  insurance_expiry: string | null;
  extinguisher_expiry: string | null;
  empresa_id: string | null;
  created_at: string;
  updated_at: string;
}

export const KM_ALERT_THRESHOLD = 500;
export const DAYS_ALERT_THRESHOLD = 15;

export type AlertSeverity = 'overdue' | 'soon' | 'ok';

export function getCategoryLabel(value: string | null): string {
  if (!value) return '—';
  return MAINTENANCE_CATEGORIES.find(c => c.value === value)?.label || value;
}

export function getMaintenanceTypeLabel(value: string | null): string {
  if (!value) return '—';
  return MAINTENANCE_TYPES.find(t => t.value === value)?.label || value;
}
