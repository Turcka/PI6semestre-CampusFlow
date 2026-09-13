import 'dotenv/config';

import { QUEUES } from '@campusflow/shared';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getAdminClient } from '../config/supabase.js';
import { sendEmail } from '../integrations/sendgrid/sendgrid.client.js';
import { sendTemplate, sendText } from '../integrations/whatsapp/whatsapp.client.js';

type QueueMessage = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: {
    job_id?: string;
    tenant_id?: string;
    lead_id?: string | null;
    visit_id?: string | null;
    campaign_id?: string | null;
    template_id?: string | null;
    channel?: 'whatsapp' | 'email';
    to?: string;
    to_address?: string;
    payload?: {
      subject?: string | null;
      body?: string;
      provider_template_name?: string | null;
      components?: unknown[];
      vars?: Record<string, string>;
    };
  };
};

async function processMessage(msg: QueueMessage): Promise<void> {
  const admin = getAdminClient();
  const payload = msg.message;
  const channel = payload.channel;
  const to = payload.to ?? payload.to_address;
  const jobId = payload.job_id;

  if (!channel || !to) {
    logger.warn({ msgId: msg.msg_id }, 'Mensagem sem channel/to_address — arquivando');
    await admin.rpc('queue_archive', { p_queue: QUEUES.MESSAGES_OUTBOUND, p_msg_id: msg.msg_id });
    return;
  }

  if (jobId) {
    const { data: existing } = await admin
      .from('message_logs')
      .select('id, status')
      .eq('job_id', jobId)
      .eq('status', 'sent')
      .maybeSingle();
    if (existing) {
      await admin.rpc('queue_archive', { p_queue: QUEUES.MESSAGES_OUTBOUND, p_msg_id: msg.msg_id });
      return;
    }
  }

  try {
    let providerMessageId: string;

    if (channel === 'whatsapp') {
      const templateName = payload.payload?.provider_template_name;
      if (templateName) {
        const result = await sendTemplate(
          to,
          templateName,
          'pt_BR',
          (payload.payload?.components as unknown[]) ?? [],
        );
        providerMessageId = result.providerMessageId;
      } else {
        const result = await sendText(to, payload.payload?.body ?? '');
        providerMessageId = result.providerMessageId;
      }
    } else {
      const result = await sendEmail({
        to,
        subject: payload.payload?.subject ?? 'CampusFlow',
        html: payload.payload?.body ?? '',
        customArgs: {
          tenant_id: payload.tenant_id ?? '',
          message_log_id: jobId ?? '',
        },
      });
      providerMessageId = result.providerMessageId;
    }

    await admin.from('message_logs').upsert(
      {
        tenant_id: payload.tenant_id,
        job_id: jobId ?? null,
        lead_id: payload.lead_id ?? null,
        visit_id: payload.visit_id ?? null,
        campaign_id: payload.campaign_id ?? null,
        template_id: payload.template_id ?? null,
        channel,
        to_address: to,
        status: 'sent',
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
        attempts: msg.read_ct,
      },
      { onConflict: 'job_id' },
    );

    await admin.rpc('queue_archive', { p_queue: QUEUES.MESSAGES_OUTBOUND, p_msg_id: msg.msg_id });
    logger.info({ msgId: msg.msg_id, channel, providerMessageId }, 'Mensagem enviada');
  } catch (err) {
    logger.error({ err, msgId: msg.msg_id, readCt: msg.read_ct }, 'Falha ao enviar mensagem');

    if (msg.read_ct >= env.QUEUE_MAX_RETRIES) {
      await admin.from('message_logs').upsert(
        {
          tenant_id: payload.tenant_id,
          job_id: jobId ?? null,
          lead_id: payload.lead_id ?? null,
          visit_id: payload.visit_id ?? null,
          campaign_id: payload.campaign_id ?? null,
          template_id: payload.template_id ?? null,
          channel,
          to_address: to,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          attempts: msg.read_ct,
        },
        { onConflict: 'job_id' },
      );
      await admin.rpc('queue_archive', { p_queue: QUEUES.MESSAGES_OUTBOUND, p_msg_id: msg.msg_id });
    }
    // caso contrário: deixa o visibility timeout expirar para retry
  }
}

async function tick(): Promise<void> {
  const admin = getAdminClient();

  // Promove jobs vencidos para a fila (também feito via pg_cron; reforço no worker)
  try {
    await admin.rpc('promote_due_message_jobs', { p_limit: 100 });
  } catch (err) {
    logger.debug({ err }, 'promote_due_message_jobs falhou (ok se cron ativo)');
  }

  const { data, error } = await admin.rpc('queue_read', {
    p_queue: QUEUES.MESSAGES_OUTBOUND,
    p_visibility_timeout: env.QUEUE_VISIBILITY_TIMEOUT_S,
    p_quantity: 10,
  });

  if (error) {
    logger.error({ error }, 'Falha ao ler fila');
    return;
  }

  const messages = (data ?? []) as QueueMessage[];
  if (!messages.length) return;

  logger.info({ count: messages.length }, 'Mensagens lidas da fila');
  for (const msg of messages) {
    await processMessage(msg);
  }
}

async function main(): Promise<void> {
  logger.info(
    { pollIntervalMs: env.QUEUE_POLL_INTERVAL_MS },
    'CampusFlow worker de mensageria iniciado',
  );

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (running) {
    try {
      await tick();
    } catch (err) {
      logger.error({ err }, 'Erro no ciclo do worker');
    }
    await new Promise((resolve) => setTimeout(resolve, env.QUEUE_POLL_INTERVAL_MS));
  }

  logger.info('Worker encerrado');
}

void main();
