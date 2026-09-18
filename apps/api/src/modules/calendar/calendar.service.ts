import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import type { agendaQuerySchema, listEventsQuerySchema } from './calendar.schemas.js';

type ListEvents = z.infer<typeof listEventsQuerySchema>;
type AgendaQuery = z.infer<typeof agendaQuerySchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listEvents(req: Request, query: ListEvents) {
  const { user, supabase } = requireUser(req);

  let q = supabase
    .from('calendar_events')
    .select(
      '*, visits(id, candidate_id, status, type, focus, course_id, promoter_id, professor_id, candidates(full_name, cpf, course_id))',
    )
    .eq('tenant_id', user.tenantId)
    .gte('starts_at', query.from)
    .lte('starts_at', query.to)
    .order('starts_at');

  if (user.role === 'promotor') q = q.eq('promoter_id', user.id);
  else if (user.role === 'professor') q = q.eq('professor_id', user.id);
  else {
    if (query.promoterId) q = q.eq('promoter_id', query.promoterId);
    if (query.professorId) q = q.eq('professor_id', query.professorId);
  }

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);

  return (data ?? [])
    .filter((event) => {
      const visit = event.visits as {
        status?: string;
        course_id?: string;
        candidates?: { full_name?: string; cpf?: string } | null;
      } | null;
      if (query.status && visit?.status !== query.status) return false;
      if (query.courseId && visit?.course_id !== query.courseId) return false;
      if (query.q) {
        const name = visit?.candidates?.full_name?.toLowerCase() ?? '';
        const cpf = visit?.candidates?.cpf ?? '';
        const term = query.q.toLowerCase();
        if (!name.includes(term) && !cpf.includes(term)) return false;
      }
      return true;
    })
    .map((event) => {
      const visit = event.visits as { status?: string } | null;
      return {
        ...event,
        pendingApproval: visit?.status === 'aguardando_promotor' || visit?.status === 'aguardando_professor',
        hasConflict: false,
      };
    });
}

export async function getAgenda(req: Request, profileId: string, query: AgendaQuery) {
  const { user, supabase } = requireUser(req);
  if (user.role !== 'admin' && user.id !== profileId) throw AppError.forbidden();

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*, visits(status, candidates(full_name))')
    .eq('tenant_id', user.tenantId)
    .or(`promoter_id.eq.${profileId},professor_id.eq.${profileId}`)
    .gte('starts_at', query.from)
    .lte('starts_at', query.to)
    .order('starts_at');
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

export async function exportCsv(req: Request, query: ListEvents) {
  const events = await listEvents(req, query);
  const { user, supabase } = requireUser(req);

  const header = 'starts_at,ends_at,title,status,candidate,promoter_id,professor_id';
  const rows = events.map((event) => {
    const visit = event.visits as {
      status?: string;
      candidates?: { full_name?: string } | null;
    } | null;
    return [
      event.starts_at,
      event.ends_at,
      JSON.stringify(event.title ?? ''),
      visit?.status ?? '',
      JSON.stringify(visit?.candidates?.full_name ?? ''),
      event.promoter_id ?? '',
      event.professor_id ?? '',
    ].join(',');
  });

  await supabase.from('audit_logs').insert({
    tenant_id: user.tenantId,
    actor_id: user.id,
    action: 'calendar.export',
    entity: 'calendar_events',
    diff: { count: events.length, filters: query },
  });

  return `${header}\n${rows.join('\n')}`;
}

export async function getEventIcs(req: Request, eventId: string) {
  const { user, supabase } = requireUser(req);
  const { data: event, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', eventId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !event) throw AppError.notFound('Evento não encontrado.');

  const formatIcsDate = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusFlow//Calendar//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@campusflow`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(event.starts_at)}`,
    `DTEND:${formatIcsDate(event.ends_at)}`,
    `SUMMARY:${String(event.title).replace(/\n/g, ' ')}`,
    event.description ? `DESCRIPTION:${String(event.description).replace(/\n/g, '\\n')}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  return ics;
}
