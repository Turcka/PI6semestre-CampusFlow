import 'dotenv/config';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Worker de mensageria (esqueleto).
 *
 * Ciclo previsto:
 *  1. `pgmq.read('messages_outbound', vt, qty)` via supabase.rpc
 *  2. Para cada mensagem: resolver canal -> integrations/whatsapp | integrations/sendgrid
 *  3. Gravar resultado em `message_logs`
 *  4. `pgmq.archive` em sucesso; em falha, reenfileirar com backoff até QUEUE_MAX_RETRIES
 */
async function tick(): Promise<void> {
  logger.debug('worker tick (fila ainda não implementada)');
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
