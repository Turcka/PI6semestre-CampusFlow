import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export type WhatsAppSendResult = { providerMessageId: string; mocked?: boolean };

function isConfigured() {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

async function postMessage(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  if (!isConfigured()) {
    const fakeId = `wa_dev_${Date.now()}`;
    logger.warn({ body }, 'WhatsApp não configurado — retornando id fake');
    return { providerMessageId: fakeId, mocked: true };
  }

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });

  const json = (await res.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message: string; code?: number };
  };

  if (!res.ok) {
    throw new Error(json.error?.message ?? `WhatsApp API error ${res.status}`);
  }

  return { providerMessageId: json.messages?.[0]?.id ?? `wa_${Date.now()}` };
}

export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode = 'pt_BR',
  components: unknown[] = [],
): Promise<WhatsAppSendResult> {
  return postMessage({
    to: to.replace(/\D/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}

export async function sendText(to: string, text: string): Promise<WhatsAppSendResult> {
  return postMessage({
    to: to.replace(/\D/g, ''),
    type: 'text',
    text: { body: text },
  });
}

export async function sendLocation(
  to: string,
  latitude: number,
  longitude: number,
  name?: string,
): Promise<WhatsAppSendResult> {
  return postMessage({
    to: to.replace(/\D/g, ''),
    type: 'location',
    location: { latitude, longitude, name: name ?? 'Campus' },
  });
}
