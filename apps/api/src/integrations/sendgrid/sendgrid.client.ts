import sgMail from '@sendgrid/mail';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export type SendGridSendResult = { providerMessageId: string; mocked?: boolean };

function isConfigured() {
  return Boolean(env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  customArgs?: Record<string, string>;
  categories?: string[];
}): Promise<SendGridSendResult> {
  if (!isConfigured()) {
    const fakeId = `sg_dev_${Date.now()}`;
    logger.warn({ to: opts.to, subject: opts.subject }, 'SendGrid não configurado — retornando id fake');
    return { providerMessageId: fakeId, mocked: true };
  }

  sgMail.setApiKey(env.SENDGRID_API_KEY!);
  const [response] = await sgMail.send({
    to: opts.to,
    from: {
      email: env.SENDGRID_FROM_EMAIL!,
      name: env.SENDGRID_FROM_NAME ?? 'CampusFlow',
    },
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    customArgs: opts.customArgs,
    categories: opts.categories,
  });

  const messageId = response.headers['x-message-id'] ?? `sg_${Date.now()}`;
  return { providerMessageId: String(messageId) };
}
