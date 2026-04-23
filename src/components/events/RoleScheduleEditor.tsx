import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Clock, Users } from 'lucide-react';
import type { AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';

export interface RoleScheduleEntry {
  role: AppRole;
  quantity: number;
  use_event_default: boolean;
  start_time: string; // datetime-local string
  end_time: string;
}

interface Props {
  rolesInUse: AppRole[]; // funções que têm participantes selecionados
  value: Record<AppRole, RoleScheduleEntry>;
  onChange: (next: Record<AppRole, RoleScheduleEntry>) => void;
  eventDefaultStart: string;
  eventDefaultEnd: string;
}

const ALL_ROLES: AppRole[] = ['condutor', 'enfermeiro', 'tecnico', 'medico'];

export function buildDefaultRoleSchedules(
  current: Record<AppRole, RoleScheduleEntry> | undefined,
  rolesInUse: AppRole[],
  counts: Partial<Record<AppRole, number>>,
): Record<AppRole, RoleScheduleEntry> {
  const next: Record<string, RoleScheduleEntry> = { ...(current || {}) };
  for (const role of rolesInUse) {
    if (!next[role]) {
      next[role] = {
        role,
        quantity: counts[role] ?? 1,
        use_event_default: true,
        start_time: '',
        end_time: '',
      };
    } else {
      next[role].quantity = counts[role] ?? next[role].quantity;
    }
  }
  // remove roles não usadas
  for (const role of Object.keys(next) as AppRole[]) {
    if (!rolesInUse.includes(role)) delete next[role];
  }
  return next as Record<AppRole, RoleScheduleEntry>;
}

export function RoleScheduleEditor({ rolesInUse, value, onChange, eventDefaultStart, eventDefaultEnd }: Props) {
  const update = (role: AppRole, patch: Partial<RoleScheduleEntry>) => {
    onChange({ ...value, [role]: { ...value[role], ...patch } });
  };

  const handleEndChange = (role: AppRole, newEnd: string) => {
    const entry = value[role];
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Horários por Função
        </CardTitle>
        <CardDescription>
          Por padrão cada função usa o horário do evento. Desative para definir um horário específico (ex.: médico
          apenas durante parte do evento).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rolesInUse.map(role => {
          const entry = value[role];
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
                    id={`use-default-${role}`}
                    checked={entry.use_event_default}
                    onCheckedChange={(checked) => update(role, { use_event_default: checked })}
                  />
                  <Label htmlFor={`use-default-${role}`} className="text-sm cursor-pointer">
                    Usar horário do evento
                  </Label>
                </div>
              </div>

              {!entry.use_event_default && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`start-${role}`} className="text-xs">Início</Label>
                    <Input
                      id={`start-${role}`}
                      type="datetime-local"
                      value={entry.start_time}
                      onChange={(e) => update(role, { start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`end-${role}`} className="text-xs">Fim</Label>
                    <Input
                      id={`end-${role}`}
                      type="datetime-local"
                      value={entry.end_time}
                      onChange={(e) => handleEndChange(role, e.target.value)}
                    />
                  </div>
                </div>
              )}

              {entry.use_event_default && eventDefaultStart && eventDefaultEnd && (
                <p className="text-xs text-muted-foreground">
                  Horário herdado do evento será aplicado a esta função.
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
