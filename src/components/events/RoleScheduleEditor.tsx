import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Users, Calendar } from 'lucide-react';
import type { AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';
import { formatBR } from '@/utils/dateFormat';

export interface RoleScheduleEntry {
  role: AppRole;
  quantity: number;
  use_event_default: boolean;
  start_time: string; // datetime-local string
  end_time: string;
}

/** Mapa: dateKey -> role -> entry. dateKey é o id da data (ou índice "tmp-N" para datas novas). */
export type RoleSchedulesByDate = Record<string, Record<AppRole, RoleScheduleEntry>>;

export interface DateOption {
  key: string;       // id (ou tmp-N) — chave no mapa
  label: string;     // ex.: "Data 1 — 12/04 sáb"
  date: string;      // YYYY-MM-DD
  start_time: string; // datetime-local sem tz
  end_time: string;
}

interface Props {
  rolesInUse: AppRole[];
  dates: DateOption[];
  value: RoleSchedulesByDate;
  onChange: (next: RoleSchedulesByDate) => void;
  rolesCounts: Partial<Record<AppRole, number>>;
}

const ALL_ROLES: AppRole[] = ['condutor', 'enfermeiro', 'tecnico', 'medico'];

/**
 * Garante que para cada (date, role em uso) exista uma entrada.
 * Remove combinações que não estão mais em uso.
 */
export function buildDefaultRoleSchedulesByDate(
  current: RoleSchedulesByDate | undefined,
  dates: DateOption[],
  rolesInUse: AppRole[],
  counts: Partial<Record<AppRole, number>>,
): RoleSchedulesByDate {
  const next: RoleSchedulesByDate = {};
  const currentMap = current || {};
  for (const d of dates) {
    const cur = currentMap[d.key] || {};
    const perRole: Record<string, RoleScheduleEntry> = {};
    for (const role of rolesInUse) {
      const existing = cur[role];
      if (existing) {
        perRole[role] = { ...existing, quantity: counts[role] ?? existing.quantity };
      } else {
        perRole[role] = {
          role,
          quantity: counts[role] ?? 1,
          use_event_default: true,
          start_time: '',
          end_time: '',
        };
      }
    }
    next[d.key] = perRole as Record<AppRole, RoleScheduleEntry>;
  }
  return next;
}

export function RoleScheduleEditor({ rolesInUse, dates, value, onChange, rolesCounts }: Props) {
  const [activeDateKey, setActiveDateKey] = useState<string>(dates[0]?.key || '');

  useEffect(() => {
    if (dates.length > 0 && !dates.some(d => d.key === activeDateKey)) {
      setActiveDateKey(dates[0].key);
    }
  }, [dates, activeDateKey]);

  const activeDate = useMemo(() => dates.find(d => d.key === activeDateKey) || null, [dates, activeDateKey]);
  const perRole = (activeDateKey && value[activeDateKey]) || ({} as Record<AppRole, RoleScheduleEntry>);

  const update = (role: AppRole, patch: Partial<RoleScheduleEntry>) => {
    if (!activeDateKey) return;
    const nextDateMap = { ...(value[activeDateKey] || {}) };
    nextDateMap[role] = { ...(nextDateMap[role] as RoleScheduleEntry), ...patch };
    onChange({ ...value, [activeDateKey]: nextDateMap as Record<AppRole, RoleScheduleEntry> });
  };

  const handleEndChange = (role: AppRole, newEnd: string) => {
    const entry = perRole[role];
    let end = newEnd;
    if (entry?.start_time && newEnd && newEnd.length >= 16 && entry.start_time.length >= 16) {
      const startDate = entry.start_time.slice(0, 10);
      const endDate = newEnd.slice(0, 10);
      const startTime = entry.start_time.slice(11, 16);
      const endTime = newEnd.slice(11, 16);
      if (startDate === endDate && endTime < startTime) {
        const [yy, mm, dd] = startDate.split('-').map(Number);
        const d2 = new Date(yy, mm - 1, dd + 1);
        end = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}T${endTime}`;
      }
    }
    update(role, { end_time: end });
  };

  const copyFromActive = () => {
    if (!activeDateKey) return;
    const src = value[activeDateKey] || {};
    const next: RoleSchedulesByDate = { ...value };
    for (const d of dates) {
      if (d.key === activeDateKey) continue;
      next[d.key] = { ...(next[d.key] || {}) } as any;
      for (const role of rolesInUse) {
        const srcEntry = src[role];
        if (srcEntry) {
          (next[d.key] as any)[role] = { ...srcEntry, quantity: rolesCounts[role] ?? srcEntry.quantity };
        }
      }
    }
    onChange(next);
  };

  if (rolesInUse.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horários por Função
          </CardTitle>
          <CardDescription>Selecione participantes para configurar horários por função.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (dates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horários por Função
          </CardTitle>
          <CardDescription>Adicione pelo menos uma data ao evento.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Horários por Função
        </CardTitle>
        <CardDescription>
          Configure horários por função para cada data do evento. Cada data tem sua própria escala.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Data ativa
            </Label>
            <Select value={activeDateKey} onValueChange={setActiveDateKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dates.map(d => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {dates.length > 1 && (
            <button
              type="button"
              onClick={copyFromActive}
              className="text-xs px-3 py-2 rounded border bg-muted hover:bg-muted/70 transition"
            >
              Copiar para todas as datas
            </button>
          )}
        </div>

        {rolesInUse.map(role => {
          const entry = perRole[role];
          if (!entry) return null;
          return (
            <div key={role} className="rounded-lg border p-4 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-medium">{ROLE_LABELS[role]}</span>
                  <span className="text-xs text-muted-foreground">
                    ({entry.quantity} {entry.quantity === 1 ? 'pessoa' : 'pessoas'})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`use-default-${role}-${activeDateKey}`}
                    checked={entry.use_event_default}
                    onCheckedChange={(checked) => update(role, { use_event_default: checked })}
                  />
                  <Label htmlFor={`use-default-${role}-${activeDateKey}`} className="text-sm cursor-pointer">
                    Usar horário da data
                  </Label>
                </div>
              </div>

              {!entry.use_event_default && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`start-${role}-${activeDateKey}`} className="text-xs">Início</Label>
                    <Input
                      id={`start-${role}-${activeDateKey}`}
                      type="datetime-local"
                      value={entry.start_time}
                      onChange={(e) => update(role, { start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`end-${role}-${activeDateKey}`} className="text-xs">Fim</Label>
                    <Input
                      id={`end-${role}-${activeDateKey}`}
                      type="datetime-local"
                      value={entry.end_time}
                      onChange={(e) => handleEndChange(role, e.target.value)}
                    />
                  </div>
                </div>
              )}

              {entry.use_event_default && activeDate && (
                <p className="text-xs text-muted-foreground">
                  Horário herdado da data ({activeDate.start_time} → {activeDate.end_time}).
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export { ALL_ROLES };

/** Compat: helper para construir DateOption a partir de event_dates da UI. */
export function buildDateOptionsFromEntries(entries: Array<{
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
}>): DateOption[] {
  return entries
    .filter(d => d.date && d.start_time && d.end_time)
    .map((d, idx) => {
      const key = d.id || `tmp-${idx}`;
      let label = `Data ${idx + 1}`;
      try {
        const [yy, mm, dd] = d.date.split('-').map(Number);
        label = `Data ${idx + 1} — ${formatBR(new Date(yy, mm - 1, dd), 'dd/MM EEE')}`;
      } catch {}
      return {
        key,
        label,
        date: d.date,
        start_time: `${d.date}T${d.start_time}`,
        end_time: `${d.date}T${d.end_time}`,
      };
    });
}
