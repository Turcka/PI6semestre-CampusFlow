import { Router } from 'express';

import { handleErpWebhook } from '../integrations/erp/erp.webhook.js';
import { handleRubeusWebhook } from '../integrations/rubeus/rubeus.webhook.js';
import { handleSendgridWebhook } from '../integrations/sendgrid/sendgrid.webhook.js';
import {
  handleWhatsAppWebhook,
  verifyWhatsAppWebhook,
} from '../integrations/whatsapp/whatsapp.webhook.js';
import { env } from '../config/env.js';

export const webhooksRouter = Router();

if (env.WHATSAPP_ENABLED) {
  webhooksRouter.get('/whatsapp', verifyWhatsAppWebhook);
  webhooksRouter.post('/whatsapp', handleWhatsAppWebhook);
}

webhooksRouter.post('/sendgrid', handleSendgridWebhook);
webhooksRouter.post('/rubeus', handleRubeusWebhook);
/** @deprecated Use /rubeus */
webhooksRouter.post('/erp/:tenantSlug', handleErpWebhook);
