import { isValidE164Br, isValidEmail, normalizePhoneToE164 } from '../../utils/phone.js';

export type RawLeadRow = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  courseId?: string | null;
  campusId?: string | null;
  source?: string | null;
  [key: string]: unknown;
};

export type ClassifiedLead = {
  rowIndex: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  courseId: string | null;
  campusId: string | null;
  source: string | null;
  hygieneStatus: 'valid' | 'duplicate' | 'invalid';
  errors: string[];
  duplicateOf: string | null;
  duplicateKey: string | null;
};

export type ExistingLeadContact = {
  id: string;
  email: string | null;
  phone: string | null;
};

export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value || null;
}

/** Mapeia colunas comuns de CSV/XLSX (PT/EN) para o formato interno. */
export function mapImportHeaders(row: Record<string, unknown>): RawLeadRow {
  const entries = Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v] as const);

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const exact = entries.find(([header]) => header === key);
      if (exact && exact[1] != null && String(exact[1]).trim() !== '') {
        return String(exact[1]);
      }
    }
    for (const key of keys) {
      const partial = entries.find(([header]) => header.includes(key));
      if (partial && partial[1] != null && String(partial[1]).trim() !== '') {
        return String(partial[1]);
      }
    }
    return null;
  };

  return {
    fullName: pick('nome completo', 'full name', 'full_name', 'nome', 'candidato'),
    email: pick('e-mail', 'email', 'mail'),
    phone: pick('telefone', 'whatsapp', 'celular', 'phone', 'mobile'),
    courseId: pick('course_id', 'courseid', 'curso_id', 'id curso'),
    campusId: pick('campus_id', 'campusid', 'id campus'),
    source: pick('origem', 'source', 'fonte'),
  };
}

export function classifyLeadRow(
  row: RawLeadRow,
  rowIndex: number,
  existingByEmail: Map<string, string>,
  existingByPhone: Map<string, string>,
  seenEmails: Set<string>,
  seenPhones: Set<string>,
): ClassifiedLead {
  const fullName = normalizeName(row.fullName);
  const email = normalizeEmail(row.email);
  const phone = normalizePhoneToE164(row.phone ?? null);
  const courseId = row.courseId?.trim() || null;
  const campusId = row.campusId?.trim() || null;
  const source = row.source?.trim() || null;

  const errors: string[] = [];
  if (fullName.length < 3) errors.push('Nome inválido ou muito curto.');
  if (!email && !phone) errors.push('Informe e-mail ou telefone.');
  if (email && !isValidEmail(email)) errors.push('E-mail inválido.');
  if (row.phone && !phone) errors.push('Telefone inválido.');
  if (phone && !isValidE164Br(phone)) errors.push('Telefone fora do formato E.164 BR.');

  if (errors.length) {
    return {
      rowIndex,
      fullName,
      email,
      phone,
      courseId,
      campusId,
      source,
      hygieneStatus: 'invalid',
      errors,
      duplicateOf: null,
      duplicateKey: null,
    };
  }

  let duplicateOf: string | null = null;
  let duplicateKey: string | null = null;

  if (email && existingByEmail.has(email)) {
    duplicateOf = existingByEmail.get(email)!;
    duplicateKey = `email:${email}`;
  } else if (phone && existingByPhone.has(phone)) {
    duplicateOf = existingByPhone.get(phone)!;
    duplicateKey = `phone:${phone}`;
  } else if (email && seenEmails.has(email)) {
    duplicateKey = `email:${email}`;
  } else if (phone && seenPhones.has(phone)) {
    duplicateKey = `phone:${phone}`;
  }

  if (duplicateKey) {
    return {
      rowIndex,
      fullName,
      email,
      phone,
      courseId,
      campusId,
      source,
      hygieneStatus: 'duplicate',
      errors: ['Lead duplicado.'],
      duplicateOf,
      duplicateKey,
    };
  }

  if (email) seenEmails.add(email);
  if (phone) seenPhones.add(phone);

  return {
    rowIndex,
    fullName,
    email,
    phone,
    courseId,
    campusId,
    source,
    hygieneStatus: 'valid',
    errors: [],
    duplicateOf: null,
    duplicateKey: null,
  };
}

export function classifyLeadBatch(
  rows: RawLeadRow[],
  existing: ExistingLeadContact[],
): ClassifiedLead[] {
  const existingByEmail = new Map<string, string>();
  const existingByPhone = new Map<string, string>();
  for (const lead of existing) {
    if (lead.email) existingByEmail.set(lead.email.toLowerCase(), lead.id);
    if (lead.phone) existingByPhone.set(lead.phone, lead.id);
  }

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  return rows.map((row, index) =>
    classifyLeadRow(row, index, existingByEmail, existingByPhone, seenEmails, seenPhones),
  );
}

export function summarizeClassification(rows: ClassifiedLead[]) {
  return {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.hygieneStatus === 'valid').length,
    duplicateRows: rows.filter((r) => r.hygieneStatus === 'duplicate').length,
    invalidRows: rows.filter((r) => r.hygieneStatus === 'invalid').length,
  };
}
