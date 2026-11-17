import { uuidSchema } from '@campusflow/shared';
import { Router } from 'express';
import { z } from 'zod';

import { getAdminClient } from '../config/supabase.js';
import { isLlmEnabled } from '../integrations/llm/llm.client.js';
import { publicRateLimit } from '../middlewares/rate-limit.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { publicCandidatesRouter } from '../modules/candidates/candidates.routes.js';
import { resolveAssistantSettings } from '../modules/chatbot/assistant/settings.js';
import { publicChatbotRouter } from '../modules/chatbot/chatbot.routes.js';
import { apiStartedAt } from '../modules/health/health.service.js';
import { publicMapRouter } from '../modules/map/map.routes.js';
import { publicSchedulingRouter } from '../modules/scheduling/scheduling.routes.js';
import { AppError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';

export const publicRouter = Router();

publicRouter.use(publicRateLimit);

publicRouter.get('/boot', (_req, res) => {
  res.json({ startedAt: apiStartedAt });
});

publicRouter.use('/candidates', publicCandidatesRouter);
publicRouter.use('/leads', publicCandidatesRouter);
publicRouter.use('/chatbot', publicChatbotRouter);
publicRouter.use('/scheduling', publicSchedulingRouter);
publicRouter.use('/map', publicMapRouter);

publicRouter.get(
  '/campuses/:slug',
  validate({ params: z.object({ slug: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const admin = getAdminClient();
    const { data: campus, error } = await admin
      .from('campuses')
      .select('id, name, slug, address, city, state, latitude, longitude, tenant_id, tenants(name, slug, logo_url, settings)')
      .eq('slug', req.params.slug!)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw AppError.badRequest(error.message);
    if (!campus) throw AppError.notFound('Campus não encontrado.');

    // `settings` do tenant não é público: sai da resposta e vira só o que o visitante precisa saber
    // sobre o secretário virtual (se está ativo e o nome da persona).
    const tenantRow = (Array.isArray(campus.tenants) ? campus.tenants[0] : campus.tenants) as
      | { name: string; slug: string; logo_url: string | null; settings?: unknown }
      | null
      | undefined;
    const assistantSettings = resolveAssistantSettings(tenantRow?.settings);
    const tenants = tenantRow ? { name: tenantRow.name, slug: tenantRow.slug, logo_url: tenantRow.logo_url } : null;
    const assistant = {
      enabled: isLlmEnabled() && assistantSettings.enabled,
      personaName: assistantSettings.persona_name,
    };

    const { data: courses } = await admin
      .from('courses')
      .select('id, name, code, description')
      .eq('campus_id', campus.id)
      .eq('is_active', true)
      .order('name');

    res.json({ ...campus, tenants, assistant, courses: courses ?? [] });
  }),
);

const surveySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

publicRouter.post(
  '/surveys/:token',
  validate({
    params: z.object({ token: uuidSchema }),
    body: surveySchema,
  }),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      ok: true,
      token: req.params.token,
      rating: req.body.rating,
      comment: req.body.comment ?? null,
    });
  }),
);
