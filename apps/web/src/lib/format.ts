import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatDate(iso: string, pattern = "dd 'de' MMMM 'de' yyyy") {
  return format(parseISO(iso), pattern, { locale: ptBR });
}

export function formatDateTime(iso: string) {
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatTime(iso: string) {
  return format(parseISO(iso), 'HH:mm', { locale: ptBR });
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function maskCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function unmaskDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function maskPhoneBr(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

export function phoneToE164(value: string) {
  const digits = unmaskDigits(value);
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  return value.startsWith('+') ? value : `+${digits}`;
}

export function parseTstzrange(period: string | null | undefined): { start: string; end: string } | null {
  if (!period) return null;
  const match = period.match(/([0-9T:\-+.Z]+),\s*([0-9T:\-+.Z]+)/);
  if (!match?.[1] || !match[2]) return null;
  return { start: match[1], end: match[2] };
}

export function firstName(fullName: string | null | undefined) {
  return (fullName ?? '').trim().split(/\s+/)[0] || '—';
}
