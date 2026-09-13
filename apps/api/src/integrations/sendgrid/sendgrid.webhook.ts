import { EventWebhook } from '@sendgrid/eventwebhook';
import type { Request, Response } from 'express';

import { env } from '../../config/env.js';
import { getAdminClient } from '../../config/supabase.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/app-error.js';
import { logger } from '../../config/logger.js';

type SgEvent = {
  event: string;
  sg_message_id?: string;
  'smtp-id'?: string;
  timestamp?: number;
  customArgs?: { message_log_id?: string };
  message_log_id?: string;
};

export const handleSendgridWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (env.SENDGRID_WEBHOOK_PUBLIC_KEY) {
    const ew = new EventWebhook();
    const key = ew.convertPublicKeyToECDSA(env.SENDGRID_WEBHOOK_PUBLIC_KEY);
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string | undefined;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string | undefined;
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const valid = signature && timestamp ? ew.verifySignature(key, payload, signature, timestamp) : false;
    if (!valid) throw AppError.forbidden('Assinatura SendGrid inválida.');
  } else {
    logger.warn('SENDGRID_WEBHOOK_PUBLIC_KEY ausente — webhook aceito sem verificação');
  }

  const admin = getAdminClient();
  const events = (Array.isArray(req.body) ? req.body : []) as SgEvent[];

  for (const evt of events) {
    const providerId = evt.sg_message_id?.split('.')[0] ?? evt['smtp-id'];
    const patch: Record<string, unknown> = {};
    const ts = evt.timestamp ? new Date(evt.timestamp * 1000).toISOString() : new Date().toISOString();

    switch (evt.event) {
      case 'delivered':
        patch.status = 'delivered';
        patch.delivered_at = ts;
        break;
      case 'open':
        patch.status = 'opened';
        patch.opened_at = ts;
        break;
      case 'click':
        patch.status = 'clicked';
        patch.clicked_at = ts;
        break;
      case 'bounce':
      case 'dropped':
        patch.status = 'bounced';
        break;
      default:
        continue;
    }

    if (evt.message_log_id || evt.customArgs?.message_log_id) {
      await admin
        .from('message_logs')
        .update(patch)
        .eq('id', evt.message_log_id ?? evt.customArgs?.message_log_id);
    } else if (providerId) {
      await admin.from('message_logs').update(patch).eq('provider_message_id', providerId);
    }
  }

  res.sendStatus(200);
});
