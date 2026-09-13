import type { Request, Response } from 'express';

import { env } from '../../config/env.js';
import { getAdminClient } from '../../config/supabase.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/app-error.js';

/** Handshake de verificação do Meta. */
export const verifyWhatsAppWebhook = asyncHandler(async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  throw AppError.forbidden('Verify token inválido.');
});

/** Atualiza message_logs a partir de statuses do WhatsApp. */
export const handleWhatsAppWebhook = asyncHandler(async (req: Request, res: Response) => {
  const admin = getAdminClient();
  const entries = (req.body?.entry ?? []) as Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{ id: string; status: string; timestamp?: string }>;
      };
    }>;
  }>;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const patch: Record<string, unknown> = { status: mapWaStatus(status.status) };
        if (status.status === 'delivered') patch.delivered_at = new Date(Number(status.timestamp) * 1000).toISOString();
        if (status.status === 'read') patch.read_at = new Date(Number(status.timestamp) * 1000).toISOString();
        if (status.status === 'failed') patch.status = 'failed';

        await admin.from('message_logs').update(patch).eq('provider_message_id', status.id);
      }
    }
  }

  res.sendStatus(200);
});

function mapWaStatus(status: string): string {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return status;
  }
}
