import { format as dateFnsFormat } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

const BRASILIA_TZ = 'America/Sao_Paulo';

/**
 * Formats a date in Brasília timezone (America/Sao_Paulo).
 * Drop-in replacement for date-fns `format()` — always outputs in BRT/BRST.
 */
export function formatBR(
  date: Date | string | number,
  formatStr: string,
  options?: { locale?: typeof ptBR },
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const zonedDate = toZonedTime(d, BRASILIA_TZ);
  return dateFnsFormat(zonedDate, formatStr, { locale: options?.locale ?? ptBR });
}

/**
 * Converts a Date/ISO string to a Brasília-zoned Date object.
 * Useful when you need the Date object itself (e.g. for comparisons after conversion).
 */
export function toBrasiliaDate(date: Date | string | number): Date {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return toZonedTime(d, BRASILIA_TZ);
}

/**
 * Shortcut: format a date as "dd/MM/yyyy" in Brasília timezone.
 */
export function formatDateBR(date: Date | string | number): string {
  return formatBR(date, 'dd/MM/yyyy');
}

/**
 * Shortcut: format a date as "dd/MM/yyyy 'às' HH:mm" in Brasília timezone.
 */
export function formatDateTimeBR(date: Date | string | number): string {
  return formatBR(date, "dd/MM/yyyy 'às' HH:mm");
}

/**
 * Shortcut: format a date as "dd/MM/yyyy 'às' HH:mm:ss" in Brasília timezone.
 */
export function formatDateTimeSecsBR(date: Date | string | number): string {
  return formatBR(date, "dd/MM/yyyy 'às' HH:mm:ss");
}

/**
 * Returns the current date/time in Brasília timezone formatted for datetime-local inputs (yyyy-MM-dd'T'HH:mm).
 */
export function nowBrasiliaLocal(): string {
  return formatBR(new Date(), "yyyy-MM-dd'T'HH:mm");
}

/**
 * Returns today's date in Brasília timezone as yyyy-MM-dd.
 */
export function todayBrasilia(): string {
  return formatBR(new Date(), 'yyyy-MM-dd');
}
