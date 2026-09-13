import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import { assertKnownTemplateVariables, renderTemplate } from '../../utils/template-renderer.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import type {
  createCampaignSchema,
  createTemplateSchema,
  listLogsQuerySchema,
  previewTemplateSchema,
  putRulesSchema,
  updateTemplateSchema,
} from './messaging.schemas.js';

type CreateTemplate = z.infer<typeof createTemplateSchema>;
type UpdateTemplate = z.infer<typeof updateTemplateSchema>;
type PreviewTemplate = z.infer<typeof previewTemplateSchema>;
type PutRules = z.infer<typeof putRulesSchema>;
type CreateCampaign = z.infer<typeof createCampaignSchema>;
type ListLogs = z.infer<typeof listLogsQuerySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

const SAMPLE_VARS: Record<string, string> = {
  'candidato.nome': 'Maria Silva',
  'candidato.primeiro_nome': 'Maria',
  'candidato.curso': 'Engenharia de Software',
  'visita.data': '20/09/2026',
  'visita.hora': '14:00',
  'visita.tipo': 'individual',
  'coordenador.nome': 'Prof. João',
  'campus.nome': 'Campus Centro',
  'campus.endereco': 'Rua Exemplo, 100',
  'campus.link_mapa': 'https://maps.example.com',
  'checkin.link_qr': 'https://app.example.com/checkin/token',
  'instituicao.nome': 'Instituição Demo',
};

export async function listTemplates(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('tenant_id', user.tenantId)
    .order('name');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createTemplate(req: Request, input: CreateTemplate) {
  const { user, supabase } = requireUser(req);
  const unknown = assertKnownTemplateVariables(input.body);
  if (unknown.length) throw AppError.badRequest(`Variáveis desconhecidas: ${unknown.join(', ')}`);

  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      tenant_id: user.tenantId,
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      provider_template_name: input.providerTemplateName ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  return data;
}

export async function updateTemplate(req: Request, templateId: string, input: UpdateTemplate) {
  const { user, supabase } = requireUser(req);
  if (input.body) {
    const unknown = assertKnownTemplateVariables(input.body);
    if (unknown.length) throw AppError.badRequest(`Variáveis desconhecidas: ${unknown.join(', ')}`);
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.body !== undefined) patch.body = input.body;
  if (input.providerTemplateName !== undefined) patch.provider_template_name = input.providerTemplateName;

  const { data, error } = await supabase
    .from('message_templates')
    .update(patch)
    .eq('id', templateId)
    .eq('tenant_id', user.tenantId)
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);
  if (!data) throw AppError.notFound('Template não encontrado.');
  return data;
}

export async function deleteTemplate(req: Request, templateId: string) {
  const { user, supabase } = requireUser(req);
  const { error } = await supabase
    .from('message_templates')
    .delete()
    .eq('id', templateId)
    .eq('tenant_id', user.tenantId);
  if (error) throw AppError.badRequest(error.message);
}

export async function previewTemplate(req: Request, templateId: string, input: PreviewTemplate) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', templateId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !data) throw AppError.notFound('Template não encontrado.');

  const vars = { ...SAMPLE_VARS, ...(input.vars ?? {}) };
  return {
    subject: data.subject ? renderTemplate(data.subject, vars) : null,
    body: renderTemplate(data.body, vars),
    channel: data.channel,
  };
}

export async function listRules(req: Request) {
  const { user, supabase } = requireUser(req);
  const { data, error } = await supabase
    .from('communication_rules')
    .select('*, message_templates(name, channel)')
    .eq('tenant_id', user.tenantId)
    .order('trigger');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function replaceRules(req: Request, input: PutRules) {
  const { user, supabase } = requireUser(req);

  const { error: delError } = await supabase
    .from('communication_rules')
    .delete()
    .eq('tenant_id', user.tenantId);
  if (delError) throw AppError.badRequest(delError.message);

  if (!input.rules.length) return [];

  const rows = input.rules.map((rule) => ({
    tenant_id: user.tenantId,
    trigger: rule.trigger,
    channel: rule.channel,
    template_id: rule.templateId,
    offset_minutes: rule.offsetMinutes,
    audience: rule.audience,
    is_active: rule.isActive,
  }));

  const { data, error } = await supabase.from('communication_rules').insert(rows).select();
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function createCampaign(req: Request, input: CreateCampaign) {
  const { user, supabase } = requireUser(req);

  let leadsQuery = supabase
    .from('leads')
    .select('id, email, phone, full_name')
    .eq('tenant_id', user.tenantId)
    .eq('hygiene_status', 'valid')
    .is('anonymized_at', null);

  const segment = input.segment as {
    status?: string;
    courseId?: string;
    campusId?: string;
    source?: string;
  };
  if (segment.status) leadsQuery = leadsQuery.eq('status', segment.status);
  if (segment.courseId) leadsQuery = leadsQuery.eq('course_id', segment.courseId);
  if (segment.campusId) leadsQuery = leadsQuery.eq('campus_id', segment.campusId);
  if (segment.source) leadsQuery = leadsQuery.eq('source', segment.source);

  const { data: leads, error: leadsError } = await leadsQuery.limit(5000);
  if (leadsError) throw AppError.badRequest(leadsError.message);

  const { data: template, error: templateError } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', input.templateId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (templateError || !template) throw AppError.notFound('Template não encontrado.');

  const runAt = input.scheduledAt ?? new Date().toISOString();

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      tenant_id: user.tenantId,
      name: input.name,
      channel: input.channel,
      template_id: input.templateId,
      segment: input.segment,
      scheduled_at: runAt,
      status: 'scheduled',
      total_recipients: leads?.length ?? 0,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw AppError.badRequest(error.message);

  const jobs = (leads ?? []).flatMap((lead) => {
    const toAddress = input.channel === 'whatsapp' ? lead.phone : lead.email;
    if (!toAddress) return [];
    const vars = {
      'candidato.nome': lead.full_name,
      'candidato.primeiro_nome': lead.full_name.split(' ')[0],
    };
    return [
      {
        tenant_id: user.tenantId,
        lead_id: lead.id,
        campaign_id: campaign.id,
        template_id: template.id,
        channel: input.channel,
        to_address: toAddress,
        run_at: runAt,
        payload: {
          subject: template.subject ? renderTemplate(template.subject, vars) : null,
          body: renderTemplate(template.body, vars),
          provider_template_name: template.provider_template_name,
          vars,
        },
        status: 'scheduled',
      },
    ];
  });

  if (jobs.length) {
    const { error: jobsError } = await supabase.from('message_jobs').insert(jobs);
    if (jobsError) throw AppError.badRequest(jobsError.message);
  }

  return campaign;
}

export async function listLogs(req: Request, query: ListLogs) {
  const { user, supabase } = requireUser(req);
  const { page, pageSize, from, to } = parsePagination(query);

  let q = supabase
    .from('message_logs')
    .select('*', { count: 'exact' })
    .eq('tenant_id', user.tenantId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.channel) q = q.eq('channel', query.channel);
  if (query.status) q = q.eq('status', query.status);
  if (query.leadId) q = q.eq('lead_id', query.leadId);
  if (query.campaignId) q = q.eq('campaign_id', query.campaignId);
  if (query.from) q = q.gte('created_at', query.from);
  if (query.to) q = q.lte('created_at', query.to);

  const { data, error, count } = await q;
  if (error) throw AppError.badRequest(error.message);
  return paginatedResponse(data ?? [], count ?? 0, page, pageSize);
}
