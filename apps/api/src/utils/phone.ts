/**
 * Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO).
 * Aceita formatos com máscara, com/sem +55, 10 ou 11 dígitos.
 */
export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  let national = digits;
  if (national.startsWith('55') && national.length >= 12) {
    national = national.slice(2);
  }
  if (national.length === 10 || national.length === 11) {
    return `+55${national}`;
  }
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  return null;
}

export function isValidE164Br(phone: string | null | undefined): boolean {
  return Boolean(phone && /^\+55\d{10,11}$/.test(phone));
}

export function isValidEmail(email: string | null | undefined): boolean {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}
