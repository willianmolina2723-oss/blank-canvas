import { differenceInDays, parseISO } from 'date-fns';
import { DAYS_ALERT_THRESHOLD, KM_ALERT_THRESHOLD, type AlertSeverity, type AmbulanceFull, type MaintenanceLogFull } from '@/types/maintenance';

export interface VehicleAlert {
  type: 'km_overdue' | 'km_soon' | 'date_overdue' | 'date_soon' | 'doc_expired' | 'doc_soon';
  severity: AlertSeverity;
  title: string;
  detail: string;
  category?: string;
}

export function computeAlerts(ambulance: AmbulanceFull, logs: MaintenanceLogFull[]): VehicleAlert[] {
  const alerts: VehicleAlert[] = [];
  const today = new Date();
  const currentKm = ambulance.current_km ?? 0;

  // Documents
  const docs: { field: keyof AmbulanceFull; label: string }[] = [
    { field: 'licensing_expiry', label: 'Licenciamento' },
    { field: 'insurance_expiry', label: 'Seguro' },
    { field: 'extinguisher_expiry', label: 'Extintor' },
  ];
  docs.forEach(({ field, label }) => {
    const value = ambulance[field] as string | null;
    if (!value) return;
    const date = parseISO(value);
    const days = differenceInDays(date, today);
    if (days < 0) {
      alerts.push({
        type: 'doc_expired', severity: 'overdue',
        title: `${label} vencido`,
        detail: `Venceu há ${Math.abs(days)} dia(s)`,
      });
    } else if (days <= 30) {
      alerts.push({
        type: 'doc_soon', severity: 'soon',
        title: `${label} vencendo`,
        detail: `Vence em ${days} dia(s)`,
      });
    }
  });

  // Next service from logs (most recent log per category)
  const byCat = new Map<string, MaintenanceLogFull>();
  logs.forEach(l => {
    const key = l.category || 'outros';
    const existing = byCat.get(key);
    if (!existing || new Date(l.maintenance_date) > new Date(existing.maintenance_date)) {
      byCat.set(key, l);
    }
  });

  byCat.forEach((log) => {
    if (log.next_service_km != null && currentKm > 0) {
      const remaining = log.next_service_km - currentKm;
      if (remaining <= 0) {
        alerts.push({
          type: 'km_overdue', severity: 'overdue',
          title: `Revisão vencida (km)`,
          detail: `${Math.abs(remaining)} km além do previsto`,
          category: log.category || undefined,
        });
      } else if (remaining <= KM_ALERT_THRESHOLD) {
        alerts.push({
          type: 'km_soon', severity: 'soon',
          title: `Revisão próxima (km)`,
          detail: `Faltam ${remaining} km`,
          category: log.category || undefined,
        });
      }
    }
    if (log.next_service_date) {
      const date = parseISO(log.next_service_date);
      const days = differenceInDays(date, today);
      if (days < 0) {
        alerts.push({
          type: 'date_overdue', severity: 'overdue',
          title: `Revisão vencida (data)`,
          detail: `Venceu há ${Math.abs(days)} dia(s)`,
          category: log.category || undefined,
        });
      } else if (days <= DAYS_ALERT_THRESHOLD) {
        alerts.push({
          type: 'date_soon', severity: 'soon',
          title: `Revisão próxima (data)`,
          detail: `Em ${days} dia(s)`,
          category: log.category || undefined,
        });
      }
    }
  });

  return alerts;
}
