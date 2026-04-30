import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, MapPin, Plus, Trash2, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface EventDateEntry {
  /** id existente quando carregado do banco; undefined para novos */
  id?: string;
  date: string;            // YYYY-MM-DD
  start_time: string;      // HH:mm
  end_time: string;        // HH:mm
  /** se preenchido, sobrescreve location do evento */
  location_override?: string;
  notes?: string;
}

interface Props {
  value: EventDateEntry[];
  onChange: (next: EventDateEntry[]) => void;
  /** local padrão do evento, exibido como placeholder do override */
  defaultLocation?: string;
}

const blankDate = (): EventDateEntry => ({
  date: '',
  start_time: '08:00',
  end_time: '18:00',
  location_override: '',
  notes: '',
});

export function EventDatesEditor({ value, onChange, defaultLocation }: Props) {
  const update = (idx: number, patch: Partial<EventDateEntry>) => {
    onChange(value.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const remove = (idx: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, i) => i !== idx));
  };

  const add = () => {
    const last = value[value.length - 1];
    if (last?.date) {
      // próxima data sugerida: dia seguinte ao último
      const [yy, mm, dd] = last.date.split('-').map(Number);
      const next = new Date(yy, mm - 1, dd + 1);
      onChange([
        ...value,
        {
          ...blankDate(),
          date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`,
          start_time: last.start_time,
          end_time: last.end_time,
        },
      ]);
    } else {
      onChange([...value, blankDate()]);
    }
  };

  const duplicate = (idx: number) => {
    const src = value[idx];
    const [yy, mm, dd] = (src.date || '').split('-').map(Number);
    let nextDate = src.date;
    if (yy && mm && dd) {
      const d2 = new Date(yy, mm - 1, dd + 1);
      nextDate = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    }
    onChange([
      ...value.slice(0, idx + 1),
      { ...src, id: undefined, date: nextDate },
      ...value.slice(idx + 1),
    ]);
  };

  const handleEndChange = (idx: number, newEnd: string) => {
    update(idx, { end_time: newEnd });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Datas do Evento
            </CardTitle>
            <CardDescription>
              Adicione uma ou mais datas. Cada data funciona como um dia operacional independente.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar data
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {value.map((d, idx) => (
          <div key={idx} className="rounded-lg border p-4 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Badge variant="secondary">Data {idx + 1}</Badge>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => duplicate(idx)}
                  title="Duplicar esta data"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(idx)}
                  disabled={value.length <= 1}
                  title="Remover data"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Data <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={d.date}
                  onChange={(e) => update(idx, { date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Início <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={d.start_time}
                    onChange={(e) => update(idx, { start_time: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Término <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={d.end_time}
                    onChange={(e) => handleEndChange(idx, e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Local específico (opcional)</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={d.location_override || ''}
                  onChange={(e) => update(idx, { location_override: e.target.value })}
                  placeholder={defaultLocation ? `Padrão: ${defaultLocation}` : 'Mesmo local do evento'}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Combina date + HH:mm em uma string ISO local (sem fuso) compatível com timestamptz.
 * Se end_time < start_time no mesmo dia, avança end para o dia seguinte.
 */
export function buildEventDateTimestamps(d: EventDateEntry): { start: string; end: string } | null {
  if (!d.date || !d.start_time || !d.end_time) return null;
  const start = `${d.date}T${d.start_time}:00`;
  let endDate = d.date;
  if (d.end_time < d.start_time) {
    const [yy, mm, dd] = d.date.split('-').map(Number);
    const d2 = new Date(yy, mm - 1, dd + 1);
    endDate = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
  }
  const end = `${endDate}T${d.end_time}:00`;
  return { start, end };
}

export const blankEventDate = blankDate;
