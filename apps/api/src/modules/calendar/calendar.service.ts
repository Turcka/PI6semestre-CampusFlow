import type { Request } from 'express';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import { domainEvents } from '../../utils/events.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import type { declineEventSchema, listEventsQuerySchema } from './calendar.schemas.js';

type ListEvents = z.infer<typeof listEventsQuerySchema>;
type DeclineEvent = z.infer<typeof declineEventSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function listEvents(req: Request, query: ListEvents) {
  const { user, supabase } = requireUser(req);

  let q = supabase
    .from('calendar_events')
    .select('*, visits(lead_id, status, type, leads(full_name))')
    .eq('tenant_id', user.tenantId)
    .gte('starts_at', query.from)
    .lte('starts_at', query.to)
    .order('starts_at');

  if (user.role === 'coordenador') q = q.eq('coordinator_id', user.id);
  else if (query.coordinatorId) q = q.eq('coordinator_id', query.coordinatorId);

  const { data, error } = await q;
  if (error) throw AppError.badRequest(error.message);
  return data ?? [];
}

async function assertCanManageEvent(req: Request, eventId: string) {
  const { user, supabase } = requireUser(req);
  const { data: event, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', eventId)
    .eq('tenant_id', user.tenantId)
    .single();
  if (error || !event) throw AppError.notFound('Evento não encontrado.');
  if (user.role === 'coordenador' && event.coordinator_id !== user.id) {
    throw AppError.forbidden();
  }
  return { user, supabase, event };
}

export async function confirmEvent(req: Request, eventId: string) {
  const { user, supabase, event } = await assertCanManageEvent(req, eventId);

  const { data, error } = await supabase.rpc('confirm_calendar_event', {
    p_event_id: eventId,
    p_actor_id: user.id,
  });
  if (error) mapRpcError(error);

  domainEvents.emit('visit.confirmed', {
    visitId: event.visit_id,
    tenantId: user.tenantId,
    coordinatorId: event.coordinator_id,
  });

  return data;
}

export async function declineEvent(req: Request, eventId: string, input: DeclineEvent) {
  const { user, supabase, event } = await assertCanManageEvent(req, eventId);

  const { data, error } = await supabase.rpc('decline_calendar_event', {
    p_event_id: eventId,
    p_reason: input.reason ?? null,
    p_actor_id: user.id,
  });
  if (error) mapRpcError(error);

  domainEvents.emit('visit.declined', {
    visitId: event.visit_id,
    tenantId: user.tenantId,
    reason: input.reason,
  });

  return data;
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
