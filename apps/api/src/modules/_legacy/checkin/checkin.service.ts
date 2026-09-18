import QRCode from 'qrcode';
import type { Request } from 'express';
import type { z } from 'zod';

import { env } from '../../config/env.js';
import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { domainEvents } from '../../utils/events.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import type { scanCheckinSchema } from './checkin.schemas.js';

type ScanInput = z.infer<typeof scanCheckinSchema>;

function requireUser(req: Request) {
  if (!req.user || !req.supabase) throw AppError.unauthorized();
  return { user: req.user, supabase: req.supabase };
}

export async function scanCheckin(req: Request, input: ScanInput) {
  const { user, supabase } = requireUser(req);

  const { data: visit, error } = await supabase.rpc('check_in_visit', {
    p_token: input.token,
    p_scanned_by: user.id,
    p_location: input.location ?? null,
  });
  if (error) mapRpcError(error);

  if (input.notes && visit?.id) {
    await supabase.from('checkins').update({ notes: input.notes }).eq('visit_id', visit.id);
  }

  domainEvents.emit('visit.checked_in', {
    visitId: visit.id,
    tenantId: visit.tenant_id,
  });

  let itinerary = null;
  if (visit?.course_id) {
    const { data } = await supabase
      .from('itineraries')
      .select('*, routes(*, route_points(*, pois(*)))')
      .eq('course_id', visit.course_id)
      .maybeSingle();
    itinerary = data;
  }

  return { visit, itinerary };
}

export async function getCheckinQrPng(token: string) {
  const admin = getAdminClient();
  const { data: visit, error } = await admin
    .from('visits')
    .select('id, checkin_token, status')
    .eq('checkin_token', token)
    .maybeSingle();
  if (error) throw AppError.badRequest(error.message);
  if (!visit) throw AppError.notFound('QR Code inválido.');

  const url = `${env.WEB_BASE_URL.replace(/\/$/, '')}/visita/${token}`;
  const buffer = await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 1 });
  return buffer;
}
