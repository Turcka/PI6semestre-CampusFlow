import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { Request, Response } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { normalizePhoneToE164 } from '../../utils/phone.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import {
  classifyLeadBatch,
  mapImportHeaders,
  summarizeClassification,
  type ClassifiedLead,
  type RawLeadRow,
} from './leads.hygiene.js';
import type { createLeadSchema, listLeadsQuerySchema, publicLeadSchema, updateLeadSchema } from './leads.schemas.js';

type CreateLead = z.infer<typeof createLeadSchema>;
type UpdateLead = z.infer<typeof updateLeadSchema>;
type ListQuery = z.infer<typeof listLeadsQuerySchema>;
type PublicLead = z.infer<typeof publicLeadSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

async function parseSpreadsheet(buffer: Buffer, fileName: string): Promise<RawLeadRow[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
    return records.map(mapImportHeaders);
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const workbook = new ExcelJS.Workbook();
    // exceljs tipa como Buffer | ArrayBuffer; Node Buffer funciona em runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim();
    });

    const rows: RawLeadRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        const cell = row.getCell(idx + 1).value;
        obj[h] = cell && typeof cell === 'object' && 'text' in cell ? (cell as { text: string }).text : cell;
      });
      rows.push(mapImportHeaders(obj));
    });
    return rows;
  }

  throw AppError.badRequest('Formato de arquivo não suportado. Use CSV ou XLSX.');
}

export async function importLeadsPreview(req: Request, file: Express.Multer.File) {
  const { user, supabase } = requireUser(req);
  const rows = await parseSpreadsheet(file.buffer, file.originalname);

  const { data: existing, error: existingError } = await supabase
    .from('leads')
    .select('id, email, phone')
    .eq('tenant_id', user.tenantId)
    .eq('hygiene_status', 'valid')
    .is('anonymized_at', null);
  if (existingError) throw AppError.badRequest(existingError.message);

  const classified = classifyLeadBatch(rows, existing ?? []);
  const summary = summarizeClassification(classified);

  const admin = getAdminClient();
  const storagePath = `${user.tenantId}/${Date.now()}-${file.originalname}`;
  const { error: uploadError } = await admin.storage
    .from('lead-imports')
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) throw AppError.badRequest(`Falha no upload: ${uploadError.message}`);

  const preview = classified.slice(0, 200);
  const { data: leadImport, error } = await supabase
    .from('lead_imports')
    .insert({
      tenant_id: user.tenantId,
      uploaded_by: user.id,
      file_name: file.originalname,
      file_path: storagePath,
      total_rows: summary.totalRows,
      valid_rows: summary.validRows,
      duplicate_rows: summary.duplicateRows,
      invalid_rows: summary.invalidRows,
      status: 'preview',
      preview: { rows: classified, summary },
    })
    .select()
    .single();

  if (error) throw AppError.badRequest(error.message);

  return {
    importId: leadImport.id,
    ...summary,
    preview,
  };
}

export async function confirmImport(req: Request, importId: string) {
  const { user, supabase } = requireUser(req);

  const { data: leadImport, error } = await supabase
    .from('lead_imports')
    .select('*')
    .eq('id', importId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !leadImport) throw AppError.notFound('Importação não encontrada.');
  if (leadImport.status === 'confirmed') throw AppError.conflict('ALREADY_CONFIRMED', 'Importação já confirmada.');

  const preview = leadImport.preview as { rows?: ClassifiedLead[] } | null;
  const validRows = (preview?.rows ?? []).filter((r) => r.hygieneStatus === 'valid');

  const chunkSize = 500;
  for (let i = 0; i < validRows.length; i += chunkSize) {
    const chunk = validRows.slice(i, i + chunkSize).map((r) => ({
      tenant_id: user.tenantId,
      campus_id: r.campusId,
      course_id: r.courseId,
      full_name: r.fullName,
      email: r.email,
      phone: r.phone,
      source: r.source ?? 'importacao',
      status: 'novo',
      hygiene_status: 'valid',
      consent_source: 'importacao',
      import_id: importId,
    }));

    const { error: upsertError } = await supabase.from('leads').upsert(chunk, {
      onConflict: 'tenant_id,email',
      ignoreDuplicates: true,
    });
    // unique index is partial — upsert by conflict may not work; fallback to insert
    if (upsertError) {
      const { error: insertError } = await supabase.from('leads').insert(chunk);
      if (insertError && !insertError.message.includes('duplicate')) {
        throw AppError.badRequest(insertError.message);
      }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('lead_imports')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', importId)
    .select()
    .single();
  if (updateError) throw AppError.badRequest(updateError.message);

  return { import: updated, inserted: validRows.length };
}

export async function listLeads(req: Request, query: ListQuery) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('tenant_id', user.tenantId)
    .is('anonymized_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.courseId) q = q.eq('course_id', query.courseId);
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.status) q = q.eq('status', query.status);
  if (query.source) q = q.eq('source', query.source);
  if (query.from) q = q.gte('created_at', query.from);
  if (query.to) q = q.lte('created_at', query.to);
  if (query.q) q = q.or(`full_name.ilike.%${query.q}%,email.ilike.%${query.q}%,phone.ilike.%${query.q}%`);

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);
  return paginatedResponse(data ?? [], count ?? 0, page, pageSize);
}

export async function getLead(req: Request, leadId: string) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !data) throw AppError.notFound('Lead não encontrado.');
  return data;
}

export async function createLead(req: Request, input: CreateLead) {
  const { user, supabase } = requireUser(req);
  const phone = input.phone ? normalizePhoneToE164(input.phone) : null;
  if (input.phone && !phone) throw AppError.badRequest('Telefone inválido.');

  const { data, error } = await supabase
    .from('leads')
    .insert({
      tenant_id: user.tenantId,
      full_name: input.fullName,
      email: input.email ?? null,
      phone,
      course_id: input.courseId ?? null,
      campus_id: input.campusId ?? null,
      source: input.source ?? 'manual',
      status: input.status ?? 'novo',
      hygiene_status: 'valid',
      consent_at: input.consentAt ?? null,
      consent_source: input.consentSource ?? 'manual',
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateLead(req: Request, leadId: string, input: UpdateLead) {
  const { user, supabase } = requireUser(req);
  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.email !== undefined) patch.email = input.email;
  if (input.phone !== undefined) {
    const phone = input.phone ? normalizePhoneToE164(input.phone) : null;
    if (input.phone && !phone) throw AppError.badRequest('Telefone inválido.');
    patch.phone = phone;
  }
  if (input.courseId !== undefined) patch.course_id = input.courseId;
  if (input.campusId !== undefined) patch.campus_id = input.campusId;
  if (input.source !== undefined) patch.source = input.source;
  if (input.status !== undefined) patch.status = input.status;
  if (input.consentAt !== undefined) patch.consent_at = input.consentAt;
  if (input.consentSource !== undefined) patch.consent_source = input.consentSource;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Lead não encontrado.');
  return data;
}

export async function deleteLead(req: Request, leadId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase.from('leads').delete().eq('id', leadId).eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}

export async function exportLeadsXlsx(req: Request, res: Response, query: ListQuery) {
  const { user, supabase } = requireUser(req);

  let q = supabase
    .from('leads')
    .select('full_name, email, phone, course_id, source, status, created_at, courses(name), visits(period)')
    .eq('tenant_id', user.tenantId)
    .is('anonymized_at', null)
    .order('created_at', { ascending: false });

  if (query.courseId) q = q.eq('course_id', query.courseId);
  if (query.campusId) q = q.eq('campus_id', query.campusId);
  if (query.status) q = q.eq('status', query.status);
  if (query.source) q = q.eq('source', query.source);
  if (query.from) q = q.gte('created_at', query.from);
  if (query.to) q = q.lte('created_at', query.to);
  if (query.q) q = q.or(`full_name.ilike.%${query.q}%,email.ilike.%${query.q}%`);

  const { data, error } = await q.limit(10_000);
  if (error) throw AppError.badRequest(error.message);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const sheet = workbook.addWorksheet('Leads');
  sheet.columns = [
    { header: 'Nome', key: 'nome', width: 30 },
    { header: 'E-mail', key: 'email', width: 28 },
    { header: 'Telefone', key: 'telefone', width: 18 },
    { header: 'Curso', key: 'curso', width: 24 },
    { header: 'Origem', key: 'origem', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Data de cadastro', key: 'cadastro', width: 22 },
    { header: 'Última visita', key: 'ultimaVisita', width: 22 },
  ];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.xlsx"');

  for (const lead of data ?? []) {
    const visits = (lead.visits as { period?: string }[] | null) ?? [];
    const lastVisit = visits.length ? visits[visits.length - 1]?.period ?? '' : '';
    const course = lead.courses as { name?: string } | null;
    sheet
      .addRow({
        nome: lead.full_name,
        email: lead.email,
        telefone: lead.phone,
        curso: course?.name ?? '',
        origem: lead.source,
        status: lead.status,
        cadastro: lead.created_at,
        ultimaVisita: lastVisit,
      })
      .commit();
  }

  await sheet.commit();
  await workbook.commit();

  await supabase.from('audit_logs').insert({
    tenant_id: user.tenantId,
    actor_id: user.id,
    action: 'leads.export',
    entity: 'leads',
    diff: { count: data?.length ?? 0, filters: query },
    ip_address: req.ip,
  });
}

export async function createPublicLead(input: PublicLead) {
  const admin = getAdminClient();

  const { data: course, error: courseError } = await admin
    .from('courses')
    .select('id, tenant_id, campus_id')
    .eq('id', input.courseId)
    .eq('campus_id', input.campusId)
    .eq('is_active', true)
    .single();
  if (courseError || !course) throw AppError.badRequest('Curso ou campus inválido.');

  const { data, error } = await admin
    .from('leads')
    .insert({
      tenant_id: course.tenant_id,
      campus_id: input.campusId,
      course_id: input.courseId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      source: input.source ?? 'formulario_publico',
      status: 'novo',
      hygiene_status: 'valid',
      consent_at: new Date().toISOString(),
      consent_source: 'formulario_publico',
    })
    .select('id, full_name, email, phone, course_id, campus_id, status, created_at')
    .single();

  if (error) {
    if (error.code === '23505') throw AppError.conflict('DUPLICATE_LEAD', 'Lead já cadastrado.');
    throw AppError.badRequest(error.message);
  }
  return data;
}
