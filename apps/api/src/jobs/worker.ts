import 'dotenv/config';

import { QUEUES } from '@campusflow/shared';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getAdminClient } from '../config/supabase.js';
import { registerVisit, upsertContact } from '../integrations/rubeus/rubeus.client.js';
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
    candidate_id?: string | null;
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

type RubeusQueueMessage = {
  msg_id: number;
  read_ct: number;
  message: {
    candidate_id?: string;
    visit_id?: string | null;
    event?: string;
    tracking_code?: string;
    outbox_id?: string;
  };
};

async function processMessage(msg: QueueMessage): Promise<void> {
  const admin = getAdminClient();
  const payload = msg.message;
  const channel = payload.channel;
  const to = payload.to ?? payload.to_address;
  const jobId = payload.job_id;
  const candidateId = payload.candidate_id ?? payload.lead_id ?? null;

  if (!channel || !to) {
    logger.warn({ msgId: msg.msg_id }, 'Mensagem sem channel/to_address — arquivando');
    await admin.rpc('queue_archive', { p_queue: QUEUES.MESSAGES_OUTBOUND, p_msg_id: msg.msg_id });
    return;
  }

  if (channel === 'whatsapp' && !env.WHATSAPP_ENABLED) {
    logger.warn({ msgId: msg.msg_id }, 'WhatsApp desabilitado — arquivando job');
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
        candidate_id: candidateId,
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
          candidate_id: candidateId,
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
  }
}

async function processRubeusMessage(msg: RubeusQueueMessage): Promise<void> {
  const admin = getAdminClient();
  const payload = msg.message;

  try {
    if (!payload.candidate_id || !payload.tracking_code) {
      await admin.rpc('queue_archive', { p_queue: QUEUES.RUBEUS_OUTBOUND, p_msg_id: msg.msg_id });
      return;
    }

    const { data: candidate } = await admin
      .from('candidates')
      .select('id, full_name, email, phone, cpf, tracking_code, courses(name)')
      .eq('id', payload.candidate_id)
      .maybeSingle();

    if (!candidate) {
      await admin.rpc('queue_archive', { p_queue: QUEUES.RUBEUS_OUTBOUND, p_msg_id: msg.msg_id });
      return;
    }

    if (payload.event === 'candidate_created' || !payload.visit_id) {
      await upsertContact({
        fullName: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        cpf: candidate.cpf,
        trackingCode: candidate.tracking_code,
        courseName: (candidate.courses as { name?: string } | null)?.name ?? null,
      });
    }

    if (payload.visit_id) {
      const { data: visit } = await admin.from('visits').select('id, status').eq('id', payload.visit_id).maybeSingle();
      if (visit) {
        await registerVisit({
          trackingCode: payload.tracking_code,
          visitId: visit.id,
          status: visit.status,
        });
      }
    }

    await admin
      .from('rubeus_links')
      .upsert({
        candidate_id: candidate.id,
        tenant_id: (await admin.from('candidates').select('tenant_id').eq('id', candidate.id).single()).data?.tenant_id,
        tracking_code: candidate.tracking_code,
        last_pushed_at: new Date().toISOString(),
        last_status: payload.event ?? 'pushed',
        last_error: null,
      });

    if (payload.outbox_id) {
      await admin.from('rubeus_outbox').update({ status: 'sent' }).eq('id', payload.outbox_id);
    }

    await admin.rpc('queue_archive', { p_queue: QUEUES.RUBEUS_OUTBOUND, p_msg_id: msg.msg_id });
    logger.info({ msgId: msg.msg_id, candidateId: payload.candidate_id }, 'Evento Rubeus enviado');
  } catch (err) {
    logger.error({ err, msgId: msg.msg_id }, 'Falha ao enviar evento Rubeus');
    if (payload.candidate_id) {
      await admin
        .from('rubeus_links')
        .update({ last_error: err instanceof Error ? err.message : String(err) })
        .eq('candidate_id', payload.candidate_id);
    }
    if (msg.read_ct >= env.QUEUE_MAX_RETRIES) {
      if (payload.outbox_id) {
        await admin.from('rubeus_outbox').update({ status: 'failed' }).eq('id', payload.outbox_id);
      }
      await admin.rpc('queue_archive', { p_queue: QUEUES.RUBEUS_OUTBOUND, p_msg_id: msg.msg_id });
    }
  }
}

async function tick(): Promise<void> {
  const admin = getAdminClient();

  try {
    await admin.rpc('promote_due_message_jobs', { p_limit: 100 });
  } catch (err) {
    logger.debug({ err }, 'promote_due_message_jobs falhou (ok se cron ativo)');
  }

  try {
    await admin.rpc('expire_pending_invitations');
  } catch (err) {
    logger.debug({ err }, 'expire_pending_invitations falhou (ok se cron ativo)');
  }

  const { data, error } = await admin.rpc('queue_read', {
    p_queue: QUEUES.MESSAGES_OUTBOUND,
    p_visibility_timeout: env.QUEUE_VISIBILITY_TIMEOUT_S,
    p_quantity: 10,
  });

  if (error) {
    logger.error({ error }, 'Falha ao ler fila de mensagens');
  } else {
    const messages = (data ?? []) as QueueMessage[];
    if (messages.length) {
      logger.info({ count: messages.length }, 'Mensagens lidas da fila');
      for (const msg of messages) await processMessage(msg);
    }
  }

  const { data: rubeusData, error: rubeusError } = await admin.rpc('queue_read', {
    p_queue: QUEUES.RUBEUS_OUTBOUND,
    p_visibility_timeout: env.QUEUE_VISIBILITY_TIMEOUT_S,
    p_quantity: 10,
  });

  if (rubeusError) {
    logger.debug({ error: rubeusError }, 'Falha ao ler fila Rubeus (ok se não configurada)');
  } else {
    const messages = (rubeusData ?? []) as RubeusQueueMessage[];
    if (messages.length) {
      logger.info({ count: messages.length }, 'Eventos Rubeus lidos da fila');
      for (const msg of messages) await processRubeusMessage(msg);
    }
  }
}

async function main(): Promise<void> {
  logger.info(
    { pollIntervalMs: env.QUEUE_POLL_INTERVAL_MS },
    'CampusFlow worker (mensageria + Rubeus) iniciado',
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
