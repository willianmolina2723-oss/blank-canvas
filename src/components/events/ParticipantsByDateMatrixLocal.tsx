import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Copy } from 'lucide-react';
import { ROLE_LABELS, type AppRole } from '@/types/database';
import type { EventDateEntry } from './EventDatesEditor';

export interface LocalParticipantRef {
  profile_id: string;
  role: AppRole;
  full_name: string;
}

/**
 * Matriz client-side (sem Supabase) para uso ANTES do evento existir.
 * Representação: Record<"profile_id:role", Set<dateKey>>
 * dateKey = "tmp-<index>" (mesmo esquema usado em RoleScheduleEditor / NewEvent).
 */
export type LocalAllocation = Record<string, Set<string>>;

interface Props {
  participants: LocalParticipantRef[];
  dates: EventDateEntry[]; // ordenadas conforme exibido no editor
  value: LocalAllocation;
  onChange: (next: LocalAllocation) => void;
}

const partKey = (p: LocalParticipantRef) => `${p.profile_id}:${p.role}`;

export function ensureAllocationDefaults(
  participants: LocalParticipantRef[],
  dateKeys: string[],
  current: LocalAllocation,
): LocalAllocation {
  const next: LocalAllocation = {};
  for (const p of participants) {
    const k = partKey(p);
    const existing = current[k];
    if (existing) {
      // mantém apenas dateKeys ainda válidos
      const filtered = new Set<string>();
      for (const dk of dateKeys) if (existing.has(dk)) filtered.add(dk);
      // se ficou vazio porque datas mudaram, marca todas (default)
      next[k] = filtered.size === 0 && existing.size > 0 ? new Set(dateKeys) : filtered;
      // se nunca teve nada (size 0 original), marca todas
      if (existing.size === 0) next[k] = new Set(dateKeys);
    } else {
      next[k] = new Set(dateKeys); // default: todas as datas
    }
  }
  return next;
}

export function ParticipantsByDateMatrixLocal({ participants, dates, value, onChange }: Props) {
  const dateKeys = useMemo(() => dates.map((_, i) => `tmp-${i}`), [dates]);

  if (dates.length <= 1 || participants.length === 0) return null;

  const toggle = (p: LocalParticipantRef, dk: string, checked: boolean) => {
    const k = partKey(p);
    const set = new Set(value[k] || []);
    if (checked) set.add(dk);
    else set.delete(dk);
    onChange({ ...value, [k]: set });
  };

  const copyFrom = (sourceDk: string) => {
    const next: LocalAllocation = { ...value };
    for (const p of participants) {
      const k = partKey(p);
      const has = (value[k] || new Set()).has(sourceDk);
      const set = new Set<string>();
      if (has) for (const dk of dateKeys) set.add(dk);
      next[k] = set;
    }
    onChange(next);
  };

  const fmtDate = (d: EventDateEntry) => {
    if (!d.date) return '—';
    const [y, m, day] = d.date.split('-');
    return `${day}/${m}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" /> Alocação por Data
        </CardTitle>
        <CardDescription>
          Marque em quais datas cada profissional vai trabalhar. Por padrão, todos atuam em todas as datas.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left p-2 sticky left-0 bg-background z-10 border-b">Participante</th>
              {dates.map((d, idx) => (
                <th key={idx} className="p-2 text-center border-b min-w-[110px]">
                  <div className="flex flex-col items-center gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      <Calendar className="h-3 w-3 mr-1" />
                      Data {idx + 1}
                    </Badge>
                    <span className="text-xs font-medium">{fmtDate(d)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => copyFrom(`tmp-${idx}`)}
                      title="Copiar a alocação desta data para todas as outras"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const k = partKey(p);
              const set = value[k] || new Set<string>();
              return (
                <tr key={k} className="hover:bg-muted/30">
                  <td className="p-2 sticky left-0 bg-background border-b">
                    <div className="flex flex-col">
                      <span className="font-medium">{p.full_name}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_LABELS[p.role]}</span>
                    </div>
                  </td>
                  {dates.map((_, idx) => {
                    const dk = `tmp-${idx}`;
                    return (
                      <td key={dk} className="p-2 text-center border-b">
                        <Checkbox
                          checked={set.has(dk)}
                          onCheckedChange={(v) => toggle(p, dk, v === true)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-3">
          Profissionais desmarcados em uma data não aparecem na escala/financeiro daquela data.
        </p>
      </CardContent>
    </Card>
  );
}
