import { Calendar, ChevronDown, MapPin } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBR } from '@/utils/dateFormat';
import type { EventDateRow } from '@/hooks/useEventDates';

interface Props {
  dates: EventDateRow[];
  activeId: string | null;
  onChange: (id: string) => void;
  /** se houver apenas 1 data, exibe somente como label */
  compact?: boolean;
}

const fmtDate = (iso: string) => formatBR(iso, "EEE dd/MM");
const fmtTime = (iso: string) => formatBR(iso, 'HH:mm');

export function EventDateSelector({ dates, activeId, onChange, compact }: Props) {
  if (!dates.length) return null;
  const active = dates.find(d => d.id === activeId) || dates[0];
  const single = dates.length === 1;

  if (single && compact) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span className="font-semibold">
          {fmtDate(active.start_time)} • {fmtTime(active.start_time)}–{fmtTime(active.end_time)}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 max-w-full">
          <Calendar className="h-4 w-4 shrink-0" />
          <span className="truncate font-semibold">
            Data {dates.findIndex(d => d.id === active.id) + 1}/{dates.length}: {fmtDate(active.start_time)}
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            {fmtTime(active.start_time)}–{fmtTime(active.end_time)}
          </span>
          {!single && <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />}
        </Button>
      </DropdownMenuTrigger>
      {!single && (
        <DropdownMenuContent align="start" className="min-w-[280px]">
          <DropdownMenuLabel>Datas do evento</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {dates.map((d, idx) => {
            const isActive = d.id === active.id;
            return (
              <DropdownMenuItem
                key={d.id}
                onClick={() => onChange(d.id)}
                className="flex flex-col items-start gap-0.5 py-2"
              >
                <div className="flex items-center gap-2 w-full">
                  <Badge variant={isActive ? 'default' : 'secondary'} className="text-[10px]">
                    {idx + 1}
                  </Badge>
                  <span className="font-semibold flex-1">{fmtDate(d.start_time)}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtTime(d.start_time)}–{fmtTime(d.end_time)}
                  </span>
                </div>
                {d.location_override && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 pl-7">
                    <MapPin className="h-3 w-3" />
                    {d.location_override}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
