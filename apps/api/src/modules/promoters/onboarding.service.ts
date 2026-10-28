import type { Request } from 'express';
import type { z } from 'zod';

import { getAdminClient } from '../../config/supabase.js';
import { AppError } from '../../utils/app-error.js';
import { mapRpcError } from '../../utils/map-rpc-error.js';
import { getPromoterOnboarding } from '../auth/auth.service.js';
import * as chatbotService from '../chatbot/chatbot.service.js';
import type { answerSchema } from '../chatbot/chatbot.schemas.js';

type AnswerInput = z.infer<typeof answerSchema>;

function requirePromoter(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  if (req.user.role !== 'promotor') throw AppError.forbidden('Apenas promotores fazem o onboarding.');
  return req.user;
}

/**
 * Cria (ou retoma) a sessão de questionário do promotor logado.
 * Reaproveita uma sessão `in_progress` existente para o usuário não perder respostas.
 */
export async function startSession(req: Request) {
  const user = requirePromoter(req);
  const admin = getAdminClient();

  const { data: existing } = await admin
    .from('chatbot_sessions')
    .select('id, status, started_at')
    .eq('profile_id', user.id)
    .eq('audience', 'promotor')
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const next = await chatbotService.getNextQuestion(existing.id, { audience: 'promotor', ownerProfileId: user.id });
    return { sessionId: existing.id, resumed: true, ...next };
  }

  const { data: questions, error: questionsError } = await admin
    .from('chatbot_questions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', user.tenantId)
    .eq('audience', 'promotor')
    .eq('is_active', true);
  if (questionsError) throw AppError.badRequest(questionsError.message);
  void questions;

  const { data, error } = await admin
    .from('chatbot_sessions')
    .insert({ tenant_id: user.tenantId, profile_id: user.id, audience: 'promotor', channel: 'web' })
    .select('id')
    .single();
  if (error) mapRpcError(error);
  if (!data) throw AppError.badRequest('Não foi possível iniciar o questionário.');

  const next = await chatbotService.getNextQuestion(data.id, { audience: 'promotor', ownerProfileId: user.id });
  return { sessionId: data.id, resumed: false, ...next };
}

export async function nextQuestion(req: Request, sessionId: string) {
  const user = requirePromoter(req);
  return chatbotService.getNextQuestion(sessionId, { audience: 'promotor', ownerProfileId: user.id });
}

export async function answer(req: Request, sessionId: string, input: AnswerInput) {
  const user = requirePromoter(req);
  return chatbotService.saveAnswer(sessionId, input, { audience: 'promotor', ownerProfileId: user.id });
}

export async function review(req: Request, sessionId: string) {
  const user = requirePromoter(req);
  const { session, answers } = await chatbotService.reviewSession(sessionId, { audience: 'promotor', ownerProfileId: user.id });
  return { session, answers };
}

/** Conclui: build_promoter_profile grava traits, interesses, foco, onboarding e validade do teste. */
export async function complete(req: Request, sessionId: string) {
  const user = requirePromoter(req);
  await chatbotService.getSession(sessionId, { audience: 'promotor', ownerProfileId: user.id });

  const admin = getAdminClient();
  const { data, error } = await admin.rpc('build_promoter_profile', { p_session_id: sessionId });
  if (error) mapRpcError(error);

  const onboarding = await getPromoterOnboarding(user.id);
  return { profile: data, onboarding };
}

export async function status(req: Request) {
  const user = requirePromoter(req);
  return getPromoterOnboarding(user.id);
}
