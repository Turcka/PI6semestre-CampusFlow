import { Router } from 'express';

import { handleErpWebhook } from '../integrations/erp/erp.webhook.js';
import { handleSendgridWebhook } from '../integrations/sendgrid/sendgrid.webhook.js';
import {
  handleWhatsAppWebhook,
  verifyWhatsAppWebhook,
} from '../integrations/whatsapp/whatsapp.webhook.js';

export const webhooksRouter = Router();

webhooksRouter.get('/whatsapp', verifyWhatsAppWebhook);
webhooksRouter.post('/whatsapp', handleWhatsAppWebhook);
webhooksRouter.post('/sendgrid', handleSendgridWebhook);
webhooksRouter.post('/erp/:tenantSlug', handleErpWebhook);
