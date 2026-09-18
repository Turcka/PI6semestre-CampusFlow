export type RawCandidateRow = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  courseId?: string | null;
  campusId?: string | null;
  source?: string | null;
};

export type ClassifiedCandidate = RawCandidateRow & {
  rowNumber: number;
  hygieneStatus: 'valid' | 'duplicate' | 'invalid';
  errors: string[];
};

export type ExistingCandidateContact = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? null : String(value).trim();
}

function normalizeEmail(value: unknown) {
  const str = normalizeString(value)?.toLowerCase() ?? null;
  return str || null;
}

function onlyDigits(value: string | null) {
  return value ? value.replace(/\D/g, '') : null;
}

export function mapImportHeaders(row: Record<string, unknown>): RawCandidateRow {
  const get = (...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined);
  return {
    fullName: normalizeString(get('nome', 'name', 'full_name', 'fullName')),
    email: normalizeEmail(get('email', 'e-mail', 'mail')),
    phone: normalizeString(get('telefone', 'phone', 'celular', 'whatsapp')),
    courseId: normalizeString(get('course_id', 'courseId', 'curso_id')),
    campusId: normalizeString(get('campus_id', 'campusId')),
    source: normalizeString(get('origem', 'source')),
  };
}

export function classifyCandidateRow(
  row: RawCandidateRow,
  index: number,
  existingByEmail: Set<string>,
  existingByPhone: Set<string>,
  seenEmails: Set<string>,
  seenPhones: Set<string>,
): ClassifiedCandidate {
  const errors: string[] = [];
  const email = normalizeEmail(row.email);
  const phone = normalizeString(row.phone);
  const phoneKey = onlyDigits(phone);

  if (!row.fullName || row.fullName.trim().length < 3) errors.push('Nome obrigatório.');
  if (!email && !phoneKey) errors.push('Informe e-mail ou telefone.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('E-mail inválido.');

  const duplicate = Boolean(
    (email && (existingByEmail.has(email) || seenEmails.has(email))) ||
      (phoneKey && (existingByPhone.has(phoneKey) || seenPhones.has(phoneKey))),
  );

  if (duplicate) errors.push('Candidato duplicado.');
  if (email) seenEmails.add(email);
  if (phoneKey) seenPhones.add(phoneKey);

  return {
    ...row,
    email,
    phone,
    rowNumber: index + 2,
    hygieneStatus: errors.length ? (duplicate ? 'duplicate' : 'invalid') : 'valid',
    errors,
  };
}

export function classifyCandidateBatch(
  rows: RawCandidateRow[],
  existing: ExistingCandidateContact[],
): ClassifiedCandidate[] {
  const existingByEmail = new Set(existing.map((c) => normalizeEmail(c.email)).filter(Boolean) as string[]);
  const existingByPhone = new Set(existing.map((c) => onlyDigits(normalizeString(c.phone))).filter(Boolean) as string[]);
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  return rows.map((row, index) =>
    classifyCandidateRow(row, index, existingByEmail, existingByPhone, seenEmails, seenPhones),
  );
}

export function summarizeClassification(rows: ClassifiedCandidate[]) {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.hygieneStatus === 'valid').length,
    duplicateRows: rows.filter((row) => row.hygieneStatus === 'duplicate').length,
    invalidRows: rows.filter((row) => row.hygieneStatus === 'invalid').length,
  };
}
